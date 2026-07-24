/**
 * doctor [--json] —— 统一健康面（BACKLOG #26b，GOAL B8「降级可见」+ D10「> comet doctor」）。
 * 回答的唯一问题：「哪些保障此刻真的在生效、哪些已静默降级」——比 comet doctor 的
 * 安装诊断更进一步（老仓对标物：service-doctor 六灯 + fail-open 健康信号 _pipeline_health）。
 *
 * 灯位语义：green=保障生效 / yellow=已降级但可运行（fail-open 可见化，不影响 exit）/
 * red=保障失效须修复。exit 0=无红灯，1=有红灯。
 * --json schema 稳定：{checks:[{id,status,detail,hint}],summary:{green,yellow,red}}；
 * check id 是对用户的稳定契约（脚本可按 id 取灯），只增不改。
 *
 * 事实采集全部走 deps.doctor 探针（main.ts 落地、测试全 mock）；本模块只做裁决与渲染。
 * 探针自身异常 → 该项折算 red（doctor 是降级的观测者，自己不许静默降级）。
 */
import { join } from 'node:path'
import { GATE_TTL_MS, PREREQ_HINTS } from '@pipeline-lite/kernel'
import type { SkillTable } from '@pipeline-lite/kernel'
import { errMsg, type CliDeps, type DoctorProbes } from '../deps.js'
import { changesRoot } from '../paths.js'
import { readSkillSources, type SkillSource } from '../skillSources.js'

export type DoctorStatus = 'green' | 'yellow' | 'red'

export interface DoctorCheck {
  id: string
  status: DoctorStatus
  detail: string
  hint: string
}

const green = (id: string, detail: string): DoctorCheck => ({ id, status: 'green', detail, hint: '' })
const yellow = (id: string, detail: string, hint: string): DoctorCheck => ({ id, status: 'yellow', detail, hint })
const red = (id: string, detail: string, hint: string): DoctorCheck => ({ id, status: 'red', detail, hint })

/** hooks/ 四脚本（gate/breadcrumb/session-start/statusline）——存在且可执行才算资产齐全 */
const HOOK_SCRIPTS = ['gate.sh', 'breadcrumb.sh', 'session-start.sh', 'statusline.sh'] as const

// ── 检查面（每项独立，顺序即输出顺序）─────────────────────────────────────────

function checkNode(p: DoctorProbes): DoctorCheck {
  const v = p.nodeVersion()
  const major = Number.parseInt(v.replace(/^v/, ''), 10)
  if (Number.isFinite(major) && major >= 22) return green('env:node', `node ${v} ≥ 22`)
  return red('env:node', `node ${v} 不满足契约 engines.node ≥22`, '升级 Node.js 到 22+（如 nvm install 22）')
}

async function checkGit(p: DoctorProbes): Promise<DoctorCheck> {
  if (await p.gitAvailable()) return green('env:git', 'git 可用（build_sha 记录保障生效）')
  return yellow(
    'env:git',
    'git 不可用——build_sha 将静默记空（fail-open 降级中）',
    '安装 git 或将其加入 PATH',
  )
}

function checkManifest(p: DoctorProbes): DoctorCheck {
  const err = p.manifestError()
  if (err === null) {
    return green('asset:manifest', 'templates/manifest.yaml 可定位可解析（相位/转换/复核相位单一真相源）')
  }
  return red(
    'asset:manifest',
    `manifest 不可用: ${err}`,
    `检查 ${join(p.pluginRoot, 'templates', 'manifest.yaml')} 是否存在且符合窄 YAML 子集（见文件头注释）`,
  )
}

/** hooks.json + gate.sh 的问题清单（asset:hooks 与 guard:gate 共用事实，各自裁决） */
function gateAssetProblems(p: DoctorProbes): string[] {
  const problems: string[] = []
  if (!p.fileExists(join(p.pluginRoot, 'hooks', 'hooks.json'))) problems.push('hooks/hooks.json 缺失')
  const gate = join(p.pluginRoot, 'hooks', 'gate.sh')
  if (!p.fileExists(gate)) problems.push('hooks/gate.sh 缺失')
  else if (!p.fileExecutable(gate)) problems.push('hooks/gate.sh 不可执行')
  return problems
}

function checkHookAssets(p: DoctorProbes): DoctorCheck {
  const missing: string[] = []
  if (!p.fileExists(join(p.pluginRoot, 'hooks', 'hooks.json'))) missing.push('hooks/hooks.json 缺失')
  for (const s of HOOK_SCRIPTS) {
    const abs = join(p.pluginRoot, 'hooks', s)
    if (!p.fileExists(abs)) missing.push(`hooks/${s} 缺失`)
    else if (!p.fileExecutable(abs)) missing.push(`hooks/${s} 不可执行`)
  }
  if (missing.length === 0) return green('asset:hooks', 'hooks.json + 4 个 hook 脚本齐全且可执行')
  return red(
    'asset:hooks',
    `插件资产缺失/不可执行: ${missing.join('、')}`,
    '补齐文件或 chmod +x；bash tools/verify-skills.sh 可逐条定位',
  )
}

function checkGateEffective(p: DoctorProbes): DoctorCheck {
  const problems = gateAssetProblems(p)
  if (problems.length > 0) {
    return red(
      'guard:gate',
      `PreToolUse 三门不会真拦: ${problems.join('、')}`,
      '修复上述资产后 gate 才会拦截（试算依据：hooks.json 注册 + gate.sh 可执行）',
    )
  }
  if (p.env('PIPELINE_AFK') === '1') {
    return yellow(
      'guard:gate',
      'PIPELINE_AFK=1——三门旁路中（gate.sh 整门放行，marker 不拦不清）',
      '退出 AFK 模式：unset PIPELINE_AFK 恢复三门拦截',
    )
  }
  return green('guard:gate', 'PreToolUse 三门会真拦（hooks.json 注册 + gate.sh 可执行）')
}

async function checkStatusline(p: DoctorProbes): Promise<DoctorCheck> {
  if (await p.nativeRuntimeHost() === 'codex') {
    return green('guard:statusline', '当前 runtime 为 Codex；Claude 专属 statusline 不适用（不影响 Dashboard 或 pipeline hooks）')
  }
  if (p.statuslineConfigured()) return green('guard:statusline', 'statusline 已接入 settings（终端零开销状态生效）')
  return yellow(
    'guard:statusline',
    'statusline 未接入 settings——终端状态面不可见（功能降级）',
    `在 ~/.claude/settings.json 加 "statusLine": {"type": "command", "command": "bash ${join(p.pluginRoot, 'hooks', 'statusline.sh')}"}`,
  )
}

/** tap 流量代理状态（BACKLOG #34e：敏感能力必须对用户明示——正在拦截=黄灯提醒） */
function checkTap(p: DoctorProbes): DoctorCheck {
  if (!p.tapStatus) return green('security:tap', 'tap 流量代理未装（无 MITM 面）')
  const s = p.tapStatus()
  if (s.intercepting) {
    return yellow('security:tap', s.message, 'tap 正在拦截 LLM 流量——确认是你有意开启；捕获数据仅落本地不外发')
  }
  return green('security:tap', s.message)
}

function checkCwd(deps: CliDeps, p: DoctorProbes): DoctorCheck {
  const root = changesRoot(deps.cwd)
  if (p.dirExists(root)) return green('project:cwd', `当前目录是 pipeline 项目（${root} 存在）`)
  return yellow(
    'project:cwd',
    `${deps.cwd} 不是 pipeline 项目（openspec/changes 不存在）`,
    '在项目根运行 doctor，或用 pipeline init <name> --track --preset 初始化',
  )
}

async function checkChanges(deps: CliDeps): Promise<DoctorCheck> {
  const root = changesRoot(deps.cwd)
  const names = await deps.listChanges(root)
  const bad: string[] = []
  for (const name of names) {
    try {
      await deps.store.read(join(root, name))
    } catch (e) {
      bad.push(`${name}（${errMsg(e)}）`)
    }
  }
  if (bad.length > 0) {
    return red(
      'project:changes',
      `坏 change ${bad.length} 个: ${bad.join('、')}`,
      '修复或移除对应 openspec/changes/<name>/.pipeline.yaml',
    )
  }
  return green('project:changes', `${names.length} 个活跃 change，.pipeline.yaml 全部可解析`)
}

async function checkMarkers(deps: CliDeps): Promise<DoctorCheck> {
  const markers = (await deps.readGateMarkers?.()) ?? []
  // 分级 TTL（BACKLOG #13，同 gate.sh / GATE_TTL_MS）：confirm 300s / review·interaction 1800s
  const stale = markers.filter((m) => m.ageMs > GATE_TTL_MS[m.kind])
  if (stale.length > 0) {
    return yellow(
      'project:markers',
      `陈旧门 marker（已过各自分级 TTL，不再拦截）: ${stale
        .map((m) => `.pipeline-pending-${m.kind}（${Math.round(GATE_TTL_MS[m.kind] / 60_000)}min）`)
        .join('、')}`,
      '重新发起对应 pipeline 操作即可自动清理陈旧投影；review 若仍待决，重新执行 pipeline review request <change> --event <event>，不要手动删除 marker',
    )
  }
  if (markers.length > 0) return green('project:markers', `${markers.length} 个新鲜门 marker（三门拦截生效中）`)
  return green('project:markers', '无门 marker——没有待决交互')
}

async function checkVerifySkills(p: DoctorProbes): Promise<DoctorCheck> {
  const { code, output } = await p.runVerifySkills()
  if (code === 0) return green('quality:verify-skills', 'verify-skills 通过（插件资产零悬空引用保障生效）')
  const summary = output.trim().split('\n').slice(0, 3).join(' | ')
  return red(
    'quality:verify-skills',
    `verify-skills 失败（exit ${code}）: ${summary}`,
    `bash ${join(p.pluginRoot, 'tools', 'verify-skills.sh')} 查看逐条修复指引`,
  )
}

// ── 缺技能检测（full-install 批2 A1，设计 spec §Phase2 A1）─────────────────────────

/**
 * 单项技能（manifest 列表里的一个 token，可含 `a|b` 备选）是否在位。
 * · bundled（本插件自带）→ 恒在位，不需另装。
 * · 命名空间 token（superpowers:brainstorming / commit-commands:commit-push-pr / opsx:propose）：
 *   查 installedSkillNames 的 前缀(插件名)/后缀(skill 名)/registry.skill(实际安装名) 任一命中即在位。
 * · `a|b`：任一侧在位即满足该项（消费方自择其一，同 manifest 语义）。
 */
function skillInPlace(entry: string, byToken: Map<string, SkillSource>, installed: ReadonlySet<string>): boolean {
  for (const raw of entry.split('|')) {
    const alt = raw.trim()
    if (alt === '') continue
    const src = byToken.get(alt)
    if (src && (src.tool === 'builtin' || src.tool === 'bundled')) return true // 恒在位
    if (installed.has(alt)) return true
    if (src?.skill !== undefined && installed.has(src.skill)) return true
    const colon = alt.indexOf(':')
    if (colon > 0) {
      const prefix = alt.slice(0, colon) // 命名空间插件（superpowers / commit-commands / opsx）
      const suffix = alt.slice(colon + 1) // 命名空间内 skill 名（brainstorming / commit-push-pr）
      if (installed.has(prefix) || installed.has(suffix)) return true
      const pluginSkill = byToken.get(prefix)?.skill // 前缀在 registry 里对应插件的实际安装名
      if (pluginSkill !== undefined && installed.has(pluginSkill)) return true
    }
  }
  return false
}

/** 展平 SkillTable（跨所有 phase.track）→ 去重后逐项判在位，收集缺失项（原始 token 串，含 a|b） */
function collectMissingSkills(table: SkillTable, byToken: Map<string, SkillSource>, installed: ReadonlySet<string>): string[] {
  const seen = new Set<string>()
  const missing: string[] = []
  for (const row of Object.values(table)) {
    for (const list of Object.values(row)) {
      for (const entry of list ?? []) {
        if (seen.has(entry)) continue
        seen.add(entry)
        if (!skillInPlace(entry, byToken, installed)) missing.push(entry)
      }
    }
  }
  return missing
}

/**
 * 缺技能双检（skills:mandatory 红阻断 / skills:recommended 黄降级）。
 * registry 走本地 readSkillSources 真读（其自带 bundle 安全路径锚，src/dist 同深）+ fileExists 探针
 * 独立判在否（S1 concern #3：缺/空 → yellow，绝不因空表误报 green）；manifest 两表走探针注入
 * （main.ts 持 bundle 里唯一正确的模板路径锚）。返回两灯，cmdDoctor 尾部装配。
 */
function checkSkills(p: DoctorProbes): [DoctorCheck, DoctorCheck] {
  const tables = p.manifestSkills()
  if (tables === null) {
    return [
      yellow('skills:mandatory', 'manifest 不可用——无法核强制技能齐全度（不误报 green）', '先修复 asset:manifest（templates/manifest.yaml）后重跑 pipeline doctor'),
      yellow('skills:recommended', 'manifest 不可用——无法核推荐技能齐全度', '先修复 asset:manifest 后重跑 pipeline doctor'),
    ]
  }
  // registry 独立判在否（fileExists 探针）+ 真读；缺/空 → yellow（concern #3：绝不空表误报 green）
  const registry = p.fileExists(join(p.pluginRoot, 'templates', 'skill-sources.yaml')) ? readSkillSources() : []
  if (registry.length === 0) {
    return [
      yellow('skills:mandatory', 'registry 未就绪（templates/skill-sources.yaml 缺失/空）——无法核强制技能齐全度（不误报 green）', '确认插件安装完整（skill-sources.yaml 应随插件分发）后重跑 pipeline doctor'),
      yellow('skills:recommended', 'registry 未就绪（templates/skill-sources.yaml 缺失/空）——无法核推荐技能齐全度', '确认插件安装完整后重跑 pipeline doctor'),
    ]
  }
  const byToken = new Map(registry.map((s) => [s.token, s]))
  const installed = p.installedSkillNames()
  const missMand = collectMissingSkills(tables.mandatory, byToken, installed)
  const missRec = collectMissingSkills(tables.recommended, byToken, installed)

  const mandatory = missMand.length === 0
    ? green('skills:mandatory', '所有 manifest 强制技能均随当前 pipeline 插件打包并可用')
    : red(
        'skills:mandatory',
        `自定义 workflow 缺 ${missMand.length} 个非打包强制技能：${missMand.join('、')}`,
        `安装或随自定义插件打包这些技能（${missMand.join('、')}）；pipeline setup --<host> 只安装本插件默认流程资产`,
      )
  const recommended = missRec.length === 0
    ? green('skills:recommended', '所有 manifest 推荐技能均随当前 pipeline 插件打包并可用')
    : yellow(
        'skills:recommended',
        `自定义 workflow 缺 ${missRec.length} 个非打包推荐技能：${missRec.join('、')}`,
        '安装或随自定义插件打包这些推荐技能（默认 pipeline 不会下载第三方技能）',
      )
  return [mandatory, recommended]
}

/**
 * The broad installed-skill scanner deliberately accepts other hosts' plugin caches. This separate
 * light answers the narrower question that caused the normal-chat regression: can the active
 * Codex context discover the seven phase skills plus this package's OpenSpec document contract?
 */
const CODEX_PROJECT_CONTRACT_SKILLS = [
  'pipeline',
  'pipeline-open',
  'pipeline-explore',
  'pipeline-spec',
  'pipeline-build',
  'pipeline-verify',
  'pipeline-ship',
  'pipeline-archive',
  'openspec-propose',
  'openspec-explore',
  'openspec-apply-change',
  'openspec-archive-change',
  'brainstorming',
  'grill-with-docs',
  'improve-codebase-architecture',
  'writing-plans',
  'test-driven-development',
  'verification-before-completion',
  'finishing-a-development-branch',
  'browser-qa',
  'e2e-testing',
] as const

function checkCodexProjectSkills(p: DoctorProbes): DoctorCheck {
  if (p.codexProjectSkillNames === undefined) {
    return yellow(
      'integration:codex-project-skills',
      '未装配 Codex skill 探针——无法证明 normal-chat router 的包内 skill 可调用（不以 cache 假装 green）',
      '使用包含该探针的 pipeline CLI，或运行 pipeline setup --codex 后重试',
    )
  }
  const installed = p.codexProjectSkillNames()
  const missing = CODEX_PROJECT_CONTRACT_SKILLS.filter((name) => !installed.has(name))
  if (missing.length === 0) {
    return green(
      'integration:codex-project-skills',
      'Codex 可发现 pipeline/OpenSpec/设计/验证 contract skills 全部来自当前插件（normal-chat 可实际调用）',
    )
  }
  return yellow(
    'integration:codex-project-skills',
    `Codex 可发现的 pipeline skills 缺 ${missing.length} 个：${missing.join('、')}（全局 cache 不算）`,
    '运行 pipeline setup --codex 重新安装并校验完整插件；若使用非原生 adapter，再加 --target <项目目录>',
  )
}

// ── AFK 运行时就绪四检（full-install R1，设计 spec §3 Phase3 / 旅程 BT-就绪）───────────────
// docker/镜像/两 runner 凭证走同一次 p.afkReadiness() 探测派生。AFK 是**可选能力**：docker 不可用/
// 镜像缺/凭证缺一律 yellow（降级可见、不阻断 exit），绝不 red——red 只留给探针自身缺失/异常。
// 两 runner 凭证对称呈现（claude-code 的 CLAUDE_CODE_OAUTH_TOKEN 与 codex 的 OPENAI_API_KEY/CODEX_HOME
// 各出一灯，codex 不缺席）。凭证只报 set/未设 + source，永不回显值（同 secrets 纪律）。

/** 凭证灯人读串:已配标 source（宿主 env / secrets 文件），未配则空——不回显任何值。 */
function credDesc(light: { set: boolean; source?: 'host-env' | 'secrets-file' | 'default-home' }): string {
  if (!light.set) return '未配'
  const source = light.source === 'host-env'
    ? '宿主 env'
    : light.source === 'default-home'
      ? '默认 ~/.codex 登录'
      : 'secrets 文件'
  return `已配（${source}）`
}

async function checkAfk(p: DoctorProbes): Promise<[DoctorCheck, DoctorCheck, DoctorCheck, DoctorCheck]> {
  if (!p.afkReadiness) {
    const miss = (id: string): DoctorCheck =>
      red(id, 'AFK 就绪探针未装配（main.ts 集成缺口，无法评估 AFK 运行时就绪）', '排除探针环境问题后重跑 pipeline doctor')
    return [miss('afk:docker'), miss('afk:image'), miss('afk:credential-claude-code'), miss('afk:credential-codex')]
  }
  const r = await p.afkReadiness()

  const docker = r.docker.available
    ? green('afk:docker', 'docker daemon 可用（AFK 容器执行前置就绪）')
    : yellow(
        'afk:docker',
        'docker 不可用——AFK 容器执行降级不可用（可选能力，不阻断非 AFK 流程）',
        // 不光说「装 docker」,还引导怎么装（走 kernel PREREQ_HINTS 单一真相源）
        `装 docker 并起 daemon 后重探（AFK 非必需能力，缺它不影响手动流程）；${PREREQ_HINTS.docker}`,
      )

  const { configured, present, build_hint } = r.image
  const image = present
    ? green('afk:image', `AFK 镜像 ${configured} 在位（容器可起）`)
    : r.docker.available
      ? yellow('afk:image', `AFK 镜像 ${configured} 不在本机（AFK run 无法起容器）`, `构建镜像:${build_hint}`)
      : yellow(
          'afk:image',
          `docker 不可用，未能核 AFK 镜像 ${configured}`,
          `先装/起 docker 再重探；缺镜像时用 ${build_hint} 一键构建`,
        )

  const cc = r.credentials['claude-code'].CLAUDE_CODE_OAUTH_TOKEN
  const claudeCred = cc.set
    ? green('afk:credential-claude-code', `claude-code 凭证 CLAUDE_CODE_OAUTH_TOKEN ${credDesc(cc)}`)
    : yellow(
        'afk:credential-claude-code',
        'claude-code 凭证 CLAUDE_CODE_OAUTH_TOKEN 未配（AFK 跑 claude-code runner 会缺鉴权）',
        // 不光说「去配」,还引导怎么拿——生成长期 OAuth token（走 kernel PREREQ_HINTS 单一真相源）
        `去配 CLAUDE_CODE_OAUTH_TOKEN（pipeline 机器级 secrets 或宿主 env；终端 doctor/setup 为凭证权威）；怎么拿：${PREREQ_HINTS.claudeToken}`,
      )

  // Codex CLI 支持 API key 或 Codex home 登录，两条任一就绪即具备鉴权；两项仍同时呈现。
  const oa = r.credentials.codex.OPENAI_API_KEY
  const ch = r.credentials.codex.CODEX_HOME
  const codexCred = oa.set || ch.set
    ? green('afk:credential-codex', `codex 凭证 OPENAI_API_KEY ${credDesc(oa)}；CODEX_HOME ${credDesc(ch)}`)
    : yellow(
        'afk:credential-codex',
        `codex 凭证 OPENAI_API_KEY 未配（AFK 跑 codex runner 会缺鉴权）；CODEX_HOME ${credDesc(ch)}`,
        // 不光说「去配」,还引导两条路——codex login 走 ChatGPT / 建 openai api-key（走 kernel PREREQ_HINTS 单一真相源）
        `去配 OPENAI_API_KEY（pipeline 机器级 secrets 或宿主 env；CODEX_HOME 可选,缺省 ~/.codex）；怎么拿：${PREREQ_HINTS.openaiKey}`,
      )

  return [docker, image, claudeCred, codexCred]
}

// ── 装配与渲染 ────────────────────────────────────────────────────────────────

const STATUS_TAG: Record<DoctorStatus, string> = { green: '[PASS]', yellow: '[WARN]', red: '[FAIL]' }

export async function cmdDoctor(deps: CliDeps, opts: { json?: boolean }): Promise<number> {
  const p = deps.doctor
  if (!p) {
    deps.io.err('ERROR: doctor 探针未装配（main.ts 集成缺口，无法评估保障生效性）')
    return 1
  }

  const runners: ReadonlyArray<[string, () => DoctorCheck | Promise<DoctorCheck>]> = [
    ['env:node', () => checkNode(p)],
    ['env:git', () => checkGit(p)],
    ['asset:manifest', () => checkManifest(p)],
    ['asset:hooks', () => checkHookAssets(p)],
    ['guard:gate', () => checkGateEffective(p)],
    ['guard:statusline', () => checkStatusline(p)],
    ['security:tap', () => checkTap(p)],
    ['project:cwd', () => checkCwd(deps, p)],
    ['project:changes', () => checkChanges(deps)],
    ['project:markers', () => checkMarkers(deps)],
    ['quality:verify-skills', () => checkVerifySkills(p)],
  ]

  const checks: DoctorCheck[] = []
  for (const [id, run] of runners) {
    try {
      checks.push(await run())
    } catch (e) {
      checks.push(red(id, `检查自身异常: ${errMsg(e)}`, '排除探针环境问题后重跑 pipeline doctor'))
    }
  }

  // 缺技能双检（批2 A1，尾部只增不改；单次装配两灯）——探针自身异常也各折算 red，不炸命令
  try {
    const [mand, rec] = checkSkills(p)
    checks.push(mand, rec)
  } catch (e) {
    const m = errMsg(e)
    checks.push(
      red('skills:mandatory', `检查自身异常: ${m}`, '排除探针环境问题后重跑 pipeline doctor'),
      red('skills:recommended', `检查自身异常: ${m}`, '排除探针环境问题后重跑 pipeline doctor'),
    )
  }

  try {
    checks.push(checkCodexProjectSkills(p))
  } catch (e) {
    checks.push(red(
      'integration:codex-project-skills',
      `检查自身异常: ${errMsg(e)}`,
      '排除探针环境问题后重跑 pipeline doctor',
    ))
  }

  // AFK 运行时就绪四检（full-install R1，尾部只增不改；单次探测派生四灯）——探针异常各折算 red，不炸命令
  try {
    const [dk, im, cc, cx] = await checkAfk(p)
    checks.push(dk, im, cc, cx)
  } catch (e) {
    const m = errMsg(e)
    for (const id of ['afk:docker', 'afk:image', 'afk:credential-claude-code', 'afk:credential-codex']) {
      checks.push(red(id, `检查自身异常: ${m}`, '排除探针环境问题后重跑 pipeline doctor'))
    }
  }

  const summary = {
    green: checks.filter((c) => c.status === 'green').length,
    yellow: checks.filter((c) => c.status === 'yellow').length,
    red: checks.filter((c) => c.status === 'red').length,
  }
  const exit = summary.red > 0 ? 1 : 0

  if (opts.json) {
    deps.io.out(JSON.stringify({ checks, summary }))
    return exit
  }

  deps.io.out(`[DOCTOR] 保障生效面 ${checks.length} 项 —— 绿 ${summary.green} / 黄 ${summary.yellow} / 红 ${summary.red}`)
  const idW = Math.max(...checks.map((c) => c.id.length))
  for (const c of checks) {
    deps.io.out(`  ${STATUS_TAG[c.status]} ${c.id.padEnd(idW)}  ${c.detail}`)
    // 非绿灯必带一句修复指引，缩进对齐 detail 列
    if (c.status !== 'green' && c.hint !== '') deps.io.out(`${' '.repeat(9 + idW + 2)}fix: ${c.hint}`)
  }
  return exit
}
