/**
 * setup 命令 —— 安装后「全功能就绪」引导（full-install F3 · 骨架批）。
 *
 * 本批只落两件事:
 *   ① ensurePipelineOnPath():把 CLI bundle 软链到 ~/.local/bin/pipeline（让用户终端能敲 pipeline）;
 *   ② 打印全流程计划骨架（技能安装 / 运行时检查 / 就绪清单 三段标题 + Phase 2/3 TODO 锚点）。
 * 真正的技能安装段（Phase 2,计划 S2）与运行时检查段（Phase 3,计划 R1）本批留占位分派
 * （打印「待实现」exit 0 不报错）+ 清晰 TODO 锚点,不实现。
 *
 * 注入面 SetupEnv（home/bin 定位 + fs 原语）:测试注入 fake（临时 HOME/内存 spy），
 * 真实现 REAL_SETUP_ENV 走 node:fs + os.homedir()——对齐 loops.ts InitEnv/REAL_INIT_ENV 先例,
 * 不写死 os.homedir()、不新增 deps.ts 必填字段（软链自带注入面,与 io 注入面正交）。
 * best-effort:软链任何失败只 WARN 不让 setup 崩（对齐 init.ts「注册表故障只 WARN」精神）。
 */
import { execFileSync } from 'node:child_process'
import { chmodSync, lstatSync, mkdirSync, readSync, readlinkSync, symlinkSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { errMsg, type CliDeps } from '../deps.js'
import { readSkillSources, type SkillSource, type SkillTier } from '../skillSources.js'

// ── 注入面（测试注入临时 HOME / spy;真实现 = node:fs + os.homedir）──────────────────
export interface SetupEnv {
  /** 用户 home（真实现 os.homedir();~/.local/bin 定位锚）。 */
  homeDir(): string
  /** $CLAUDE_PLUGIN_ROOT（插件安装根）;未设 → null（dev 回退 selfPath）。 */
  pluginRoot(): string | null
  /** 本 CLI bundle 自身路径（真实现 resolve(process.argv[1]);pluginRoot 缺失时的 dev 回退源）。 */
  selfPath(): string
  /** mkdir -p。 */
  mkdirp(dir: string): void
  /** 读软链目标;不是软链 / 不存在 → null（EINVAL/ENOENT 均归 null）。 */
  readSymlink(path: string): string | null
  /** lstat 存在性（软链本身也算存在,含悬空软链;判「存在但非软链」用）。 */
  pathExists(path: string): boolean
  /** 建软链 target→linkPath。 */
  makeSymlink(target: string, linkPath: string): void
  /** 删文件/软链（覆盖异源/非软链前置）。 */
  removePath(path: string): void
  /** chmod +x（源 bundle 带 shebang,置可执行位;best-effort 补位）。 */
  chmodExec(path: string): void
  /**
   * 跑一条命令（技能安装 / `--list` 核 id）——真实现 execFileSync 捕获退出码+stdout+stderr（不抛,非零折算 code）;
   * 测试注入 spy（记录调用、伪造成功/失败），不起真装。dry-run 路径**绝不调用**（零执行不变量）。
   */
  runCommand(cmd: string, args: string[]): { code: number; stdout: string; stderr: string }
  /**
   * 终端 y/N 确认（非 dry-run 且非 --yes 时问一次）——真实现同步读 stdin fd0;
   * 非 TTY / 无输入 → false（fail-closed,不误装;自动化用 --yes 跳过）。测试注入定值。
   */
  confirm(question: string): boolean
}

export const REAL_SETUP_ENV: SetupEnv = {
  homeDir: () => homedir(),
  pluginRoot: () => {
    const r = process.env.CLAUDE_PLUGIN_ROOT
    return r !== undefined && r.trim() !== '' ? r : null
  },
  selfPath: () => resolve(process.argv[1] ?? ''),
  mkdirp: (dir) => { mkdirSync(dir, { recursive: true }) },
  readSymlink: (path) => {
    try {
      return readlinkSync(path)
    } catch {
      return null // ENOENT（不存在）或 EINVAL（存在但非软链）均归 null,由 pathExists 二次判别
    }
  },
  pathExists: (path) => {
    try {
      lstatSync(path)
      return true
    } catch {
      return false
    }
  },
  makeSymlink: (target, linkPath) => { symlinkSync(target, linkPath) },
  removePath: (path) => { unlinkSync(path) },
  chmodExec: (path) => { chmodSync(path, 0o755) },
  runCommand: (cmd, args) => {
    try {
      const stdout = execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      return { code: 0, stdout, stderr: '' }
    } catch (e) {
      // execFileSync 非零退出会抛;把 status/stdout/stderr 折算回结构（不抛,逐条容错的前提）
      const err = e as { status?: number | null; stdout?: string | Buffer | null; stderr?: string | Buffer | null }
      return {
        code: typeof err.status === 'number' ? err.status : 1,
        stdout: err.stdout != null ? String(err.stdout) : '',
        stderr: err.stderr != null ? String(err.stderr) : errMsg(e),
      }
    }
  },
  confirm: (question) => {
    process.stdout.write(question)
    try {
      const buf = Buffer.alloc(64)
      const n = readSync(0, buf, 0, 64, null) // 同步读 stdin;非 TTY/无输入抛或返 0
      const ans = buf.toString('utf8', 0, n).trim().toLowerCase()
      return ans === 'y' || ans === 'yes'
    } catch {
      return false // 非交互环境（无 TTY）→ 视作 No,fail-closed（自动化走 --yes）
    }
  },
}

// ── 软链源解析 + 上 PATH ────────────────────────────────────────────────────────────

/** 软链源:$CLAUDE_PLUGIN_ROOT/packages/cli/dist/pipeline.mjs 优先,否则 dev 回退 selfPath()。 */
export function resolvePipelineSource(env: SetupEnv): string {
  const root = env.pluginRoot()
  if (root !== null) return join(root, 'packages', 'cli', 'dist', 'pipeline.mjs')
  return env.selfPath()
}

/**
 * 把 CLI bundle 软链到 ~/.local/bin/pipeline（让用户终端能敲 pipeline）。
 * 幂等:已存在且指向同源 → 跳过;指向异源(或存在但非软链)→ 告警覆盖（自定:新装覆盖旧指向）。
 * best-effort:任何失败只 WARN 不让 setup 崩。软链本身不改 $PATH——若 ~/.local/bin 不在 PATH,附一行提示。
 */
export function ensurePipelineOnPath(deps: CliDeps, env: SetupEnv = REAL_SETUP_ENV): void {
  try {
    const source = resolvePipelineSource(env)
    const binDir = join(env.homeDir(), '.local', 'bin')
    const link = join(binDir, 'pipeline')
    env.mkdirp(binDir) // 缺 ~/.local/bin 时建目录

    const existing = env.readSymlink(link)
    if (existing === source) {
      chmodExecBestEffort(env, source) // 幂等确保源可执行,失败不阻断
      deps.io.out(`[setup] pipeline 已在 PATH:${link} → ${source}（同源,跳过）`)
      return
    }
    if (existing !== null) {
      deps.io.err(`WARN: ${link} 原指向 ${existing},本次覆盖为 ${source}（本次安装的 bundle）。`)
      env.removePath(link)
    } else if (env.pathExists(link)) {
      deps.io.err(`WARN: ${link} 已存在且非软链,本次覆盖为指向 ${source} 的软链。`)
      env.removePath(link)
    }
    env.makeSymlink(source, link)
    chmodExecBestEffort(env, source)
    deps.io.out(`[setup] 已把 pipeline 软链到 PATH:${link} → ${source}`)
    deps.io.out('  若终端仍找不到 pipeline,请确认 ~/.local/bin 在 $PATH（如 export PATH="$HOME/.local/bin:$PATH"）。')
  } catch (e) {
    deps.io.err(`WARN: 软链 pipeline 到 PATH 失败（不影响其余安装步骤,可手动软链）:${errMsg(e)}`)
  }
}

/** chmod +x 补位:bundle 构建时已 `chmod +x`,此处仅幂等补位——失败不阻断（不掩盖已成功的软链）。 */
function chmodExecBestEffort(env: SetupEnv, source: string): void {
  try {
    env.chmodExec(source)
  } catch {
    // 源可执行位无法设置（如只读挂载）也不阻断:bundle 打包时已置 +x
  }
}

// ── 计划骨架 + Phase 2/3 占位 ─────────────────────────────────────────────────────────

export interface SetupOpts {
  dryRun?: boolean
  yes?: boolean
}

/** 计划骨架三段标题（技能安装/运行时检查/就绪清单）——Phase 2/3 填真逻辑,本批仅标题 + 锚点。 */
function printPlanSkeleton(deps: CliDeps, opts: SetupOpts): void {
  deps.io.out('[setup] 全功能就绪引导 —— 计划骨架')
  deps.io.out('  1. PATH 软链:把 pipeline 软链到 ~/.local/bin（本批已实现）')
  deps.io.out('  2. 技能安装（Phase 2,本批已实装）:读 registry 按 tool 分组选装（详见下方技能计划）')
  deps.io.out('  3. 运行时检查（Phase 3 待实现）:docker 探测 + 缺镜像一键构建提示（计划 R1）')
  deps.io.out('  4. 全功能就绪清单（待聚合）:逐项在位/降级 红黄绿汇总')
  if (opts.dryRun) deps.io.out('  （--dry-run:仅打印计划,未软链、未写任何文件）')
}

// ── 技能安装段（Phase 2 · S2）:读 registry → 分组命令 → 幂等差集 → 计划 → 逐条容错 → 汇总 ──────

/** 命令分组（执行顺序即此序:marketplace add 必在 agents-inc install 之前）。 */
export type CmdGroup = 'marketplace-add' | 'claude-plugin' | 'skills-cli' | 'npm'

/** 一条待执行命令 + 计划呈现所需元信息（官方/第三方、受影响全局目录、覆盖 token、tier）。 */
export interface PlannedCommand {
  group: CmdGroup
  cmd: string
  args: string[]
  /** 本命令覆盖的 registry token（去重/dedup 后可能多个,如 commit-commands 两 token 共一插件）。 */
  tokens: string[]
  /** skills-cli 的 `--skill` 名（bare-add 或非 skills-cli 时空）——计划里「装哪几个」列出可见。 */
  names: string[]
  /** 单技能仓 bare `npx skills add <source>`（无 --skill;仅白名单单技能源）。 */
  bareAdd: boolean
  source: string
  /** Anthropic 官方源 → true;第三方 → false（计划标注）。 */
  official: boolean
  /** 覆盖 token 里的最高裁决级（失败汇总红字与退出码用）。 */
  tier: SkillTier
  /** 受影响全局目录（~/.claude / ~/.agents/skills / 全局 npm）。 */
  globalDir: string
  /** skills-cli 装前核 id 的 `--list` 命令（应对上游改名漂移;bare-add 无）。 */
  listCmd?: { cmd: string; args: string[] }
  note?: string
}

/** registry → 分组命令计划 + 已装跳过 + 内置/本仓自带（无需安装）差集。 */
export interface SkillsPlan {
  commands: PlannedCommand[]
  alreadyInstalled: Array<{ token: string; where: string }>
  noInstall: Array<{ token: string; tool: string }>
}

/** 本机已注册的 marketplace（无需 `marketplace add`）——claude-plugins-official 随 CC 自带。 */
const REGISTERED_MARKETPLACES: ReadonlySet<string> = new Set(['claude-plugins-official'])
const TIER_RANK: Record<SkillTier, number> = { mandatory: 3, recommended: 2, conditional: 1, optional: 0 }
const higherTier = (a: SkillTier, b: SkillTier): SkillTier => (TIER_RANK[a] >= TIER_RANK[b] ? a : b)

/** source → marketplace repo（`agents-inc` → `agents-inc/skills`;已含 '/' 原样）。 */
function marketplaceRepo(source: string): string {
  return source.includes('/') ? source : `${source}/skills`
}

/** 幂等探测:~/.claude/skills、~/.agents/skills、~/.claude/plugins/cache 任一在位即已装（注入 fs）。 */
function skillInstalled(env: SetupEnv, name: string): boolean {
  const home = env.homeDir()
  return (
    env.pathExists(join(home, '.claude', 'skills', name)) ||
    env.pathExists(join(home, '.agents', 'skills', name)) ||
    env.pathExists(join(home, '.claude', 'plugins', 'cache', name))
  )
}

/** 命令可读串（计划/汇总用）。 */
function cmdStr(c: { cmd: string; args: string[] }): string {
  return [c.cmd, ...c.args].join(' ')
}

/**
 * 读 registry → 按 tool 分组生成命令 + 幂等差集（纯函数,只经 env.pathExists 读、绝不写/exec）。
 *   claude-plugin:`claude plugin install <skill||token>@<source>`;source 非官方非已注册 → 先 `marketplace add`（去重）;
 *                 note 含「已装」（superpowers）或探测已装 → 剔除。同 <id>@<source> 多 token dedup 成一条。
 *   skills-cli   :按 source 聚合 `--skill <名…>`（名=skill||token);单技能仓（1 token 且无 skill 字段）→ bare add（白名单）;
 *                 已装 token 从 --skill 剔除,整组已装则整条剔除。附 `--list` 核 id 命令。
 *   npm          :`npm install -g <source>`（openspec;npm 全局位不在三探测点,不做幂等剔除）。
 *   builtin/bundled:不生成命令（记入 noInstall）。
 *   engine       :任何 token 的 engine（如 browser-qa→playwright@claude-plugins-official）→ 附加 claude-plugin 命令,dedup。
 */
export function buildSkillsPlan(sources: SkillSource[], env: SetupEnv): SkillsPlan {
  const alreadyInstalled: Array<{ token: string; where: string }> = []
  const noInstall: Array<{ token: string; tool: string }> = []
  const marketplaceAdds = new Map<string, PlannedCommand>() // key: repo
  const pluginCmds = new Map<string, PlannedCommand>() // key: <id>@<source>
  const skillsBySource = new Map<string, SkillSource[]>() // source → tokens（保序）
  const npmCmds = new Map<string, PlannedCommand>() // key: source

  const ensureMarketplace = (source: string, official: boolean): void => {
    if (official || REGISTERED_MARKETPLACES.has(source)) return // 官方/已注册无需 add
    const repo = marketplaceRepo(source)
    if (marketplaceAdds.has(repo)) return // 去重一次
    marketplaceAdds.set(repo, {
      group: 'marketplace-add', cmd: 'claude', args: ['plugin', 'marketplace', 'add', repo],
      tokens: [], names: [], bareAdd: false, source, official: false, tier: 'optional',
      globalDir: '~/.claude', note: '非官方 marketplace',
    })
  }

  const addPlugin = (
    id: string, source: string, official: boolean, tier: SkillTier, tokenLabel: string, engineNote?: string,
  ): void => {
    if (skillInstalled(env, id)) { // 幂等:插件缓存在位 → 剔除
      alreadyInstalled.push({ token: tokenLabel, where: `~/.claude/plugins/cache/${id}` })
      return
    }
    ensureMarketplace(source, official)
    const key = `${id}@${source}`
    const existing = pluginCmds.get(key)
    if (existing) { // dedup:同插件多 token（如 commit-commands 两命令 token）
      existing.tokens.push(tokenLabel)
      existing.tier = higherTier(existing.tier, tier)
      if (engineNote) existing.note = existing.note ? `${existing.note}；${engineNote}` : engineNote
      return
    }
    pluginCmds.set(key, {
      group: 'claude-plugin', cmd: 'claude', args: ['plugin', 'install', key],
      tokens: [tokenLabel], names: [], bareAdd: false, source, official, tier,
      globalDir: '~/.claude', note: engineNote,
    })
  }

  for (const s of sources) {
    if (s.tool === 'builtin' || s.tool === 'bundled') { noInstall.push({ token: s.token, tool: s.tool }); continue }
    if (s.tool === 'claude-plugin') {
      if (s.note?.includes('已装')) { // superpowers 类:note 标注已装 → 跳过
        alreadyInstalled.push({ token: s.token, where: '本机通常已装（registry note 标注）' })
        continue
      }
      addPlugin(s.skill ?? s.token, s.source, s.official, s.tier, s.token)
      continue
    }
    if (s.tool === 'skills-cli') {
      const g = skillsBySource.get(s.source) ?? []
      g.push(s)
      skillsBySource.set(s.source, g)
      continue
    }
    if (s.tool === 'npm') {
      const existing = npmCmds.get(s.source)
      if (existing) { existing.tokens.push(s.token); existing.tier = higherTier(existing.tier, s.tier); continue }
      npmCmds.set(s.source, {
        group: 'npm', cmd: 'npm', args: ['install', '-g', s.source],
        tokens: [s.token], names: [], bareAdd: false, source: s.source, official: s.official, tier: s.tier,
        globalDir: '全局 npm（npm root -g）',
      })
    }
  }

  // 引擎:任何 token 的 engine 字段 → 附加 claude-plugin 命令（去重进 pluginCmds;playwright 与显式 token 天然合并）。
  for (const s of sources) {
    if (!s.engine) continue
    const at = s.engine.lastIndexOf('@')
    if (at <= 0) continue
    addPlugin(s.engine.slice(0, at), s.engine.slice(at + 1), REGISTERED_MARKETPLACES.has(s.engine.slice(at + 1)),
      s.tier, `${s.engine.slice(0, at)}(引擎)`, `附加 MCP 引擎(${s.token} 需要)`)
  }

  // skills-cli 聚合成命令（按 source;剔除已装 token）。
  const skillsCliCmds: PlannedCommand[] = []
  for (const [source, group] of skillsBySource) {
    const bareAdd = group.length === 1 && group[0]!.skill === undefined // 单技能仓 bare add（白名单）
    const toInstall: SkillSource[] = []
    for (const t of group) {
      if (skillInstalled(env, t.skill ?? t.token)) alreadyInstalled.push({ token: t.token, where: '~/.agents/skills 或 ~/.claude/skills' })
      else toInstall.push(t)
    }
    if (toInstall.length === 0) continue // 整组已装 → 整条剔除
    let tier: SkillTier = 'optional'
    for (const t of toInstall) tier = higherTier(tier, t.tier)
    if (bareAdd) {
      skillsCliCmds.push({
        group: 'skills-cli', cmd: 'npx', args: ['skills', 'add', source],
        tokens: toInstall.map((t) => t.token), names: [], bareAdd: true, source, official: group[0]!.official, tier,
        globalDir: '~/.agents/skills',
      })
    } else {
      const names = toInstall.map((t) => t.skill ?? t.token)
      skillsCliCmds.push({
        group: 'skills-cli', cmd: 'npx',
        args: ['skills', 'add', source, ...names.flatMap((n) => ['--skill', n])],
        tokens: toInstall.map((t) => t.token), names, bareAdd: false, source, official: group[0]!.official, tier,
        globalDir: '~/.agents/skills',
        listCmd: { cmd: 'npx', args: ['skills', 'add', source, '--list'] },
      })
    }
  }

  // 执行序:marketplace add（在前,让 agents-inc install 有源）→ claude-plugin install → skills-cli → npm。
  const commands = [...marketplaceAdds.values(), ...pluginCmds.values(), ...skillsCliCmds, ...npmCmds.values()]
  return { commands, alreadyInstalled, noInstall }
}

/** 计划呈现:分组列命令 + 官方/第三方 + 受影响全局目录 + 差集 + skills-cli 装哪几个列出可见。 */
function renderSkillsPlan(deps: CliDeps, plan: SkillsPlan): void {
  const dirs = [...new Set(plan.commands.map((c) => c.globalDir))]
  deps.io.out(
    `[setup skills] 技能安装计划 —— 待装 ${plan.commands.length} 条命令 / 已装跳过 ${plan.alreadyInstalled.length} / ` +
      `内置·本仓自带 ${plan.noInstall.length}（无需安装）`,
  )
  if (dirs.length > 0) deps.io.out(`  受影响全局目录:${dirs.join('、')}`)

  const sections: Array<[CmdGroup, string]> = [
    ['marketplace-add', 'claude 插件 · marketplace add（非官方源需先添加）'],
    ['claude-plugin', 'claude 插件安装'],
    ['skills-cli', 'skills CLI · 按名选装（禁整装）'],
    ['npm', 'npm 全局'],
  ]
  for (const [g, title] of sections) {
    const cs = plan.commands.filter((c) => c.group === g)
    if (cs.length === 0) continue
    deps.io.out(`  ── ${title} ──`)
    for (const c of cs) {
      const tag = c.official ? '[官方]' : '[第三方]'
      deps.io.out(`   ${cmdStr(c)}   ${tag} → ${c.globalDir}${c.note ? `  （${c.note}）` : ''}`)
      if (c.group === 'skills-cli' && !c.bareAdd) deps.io.out(`      技能(${c.names.length}):${c.names.join(', ')}`)
      else if (c.tokens.length > 0) deps.io.out(`      token:${c.tokens.join(', ')}`)
    }
  }
  if (plan.alreadyInstalled.length > 0) {
    deps.io.out(`  已装·跳过（${plan.alreadyInstalled.length}）:${plan.alreadyInstalled.map((a) => a.token).join(', ')}`)
  }
}

interface ExecOutcome {
  successes: PlannedCommand[]
  failures: Array<{ cmd: PlannedCommand; detail: string }>
  drifts: Array<{ source: string; name: string }> // `--list` 未命中的 token 名（可能已改名）
}

/** 分组逐条执行（注入 exec）:skills-cli 先 `--list` 核 id 记漂移,再装;单条失败记入汇总不 abort 其余。 */
function executeSkillsPlan(deps: CliDeps, plan: SkillsPlan, env: SetupEnv): ExecOutcome {
  const out: ExecOutcome = { successes: [], failures: [], drifts: [] }
  for (const c of plan.commands) {
    if (c.listCmd) {
      try {
        const r = env.runCommand(c.listCmd.cmd, c.listCmd.args)
        if (r.code === 0) for (const n of c.names) if (!r.stdout.includes(n)) out.drifts.push({ source: c.source, name: n })
      } catch { /* --list 失败不阻断,照装（名可能仍有效,或按 find-skills 兜底） */ }
    }
    deps.io.out(`[setup skills] $ ${cmdStr(c)}`)
    try {
      const r = env.runCommand(c.cmd, c.args)
      if (r.stdout.trim() !== '') deps.io.out(r.stdout.trimEnd())
      if (r.code === 0) out.successes.push(c)
      else out.failures.push({ cmd: c, detail: r.stderr.trim() !== '' ? r.stderr.trim() : `退出码 ${r.code}` })
    } catch (e) {
      out.failures.push({ cmd: c, detail: errMsg(e) })
    }
  }
  return out
}

/** 末尾汇总:成功数/跳过数/失败清单（mandatory 失败红字 [FAIL·强制]+手动命令);有强制失败 → 退出码非零。 */
function renderSummary(deps: CliDeps, o: ExecOutcome, plan: SkillsPlan): number {
  deps.io.out(
    `[setup skills] 完成 —— 成功 ${o.successes.length} / 跳过 ${plan.alreadyInstalled.length} / 失败 ${o.failures.length}`,
  )
  for (const d of o.drifts) {
    deps.io.out(
      `  [WARN] 名称漂移:${d.source} 的 '${d.name}' 在 --list 未命中（上游可能已改名——装最新语义;可用 find-skills 重新定位）`,
    )
  }
  let mandatoryFail = false
  for (const f of o.failures) {
    const s = cmdStr(f.cmd)
    if (f.cmd.tier === 'mandatory') { // 强制级失败:红字标出 + 手动命令（对齐 doctor [FAIL] 严重级文本口径,非 ANSI）
      mandatoryFail = true
      deps.io.err(`  [FAIL·强制] ${s} —— ${f.detail}`)
      deps.io.err(`             手动重试:${s}`)
    } else {
      deps.io.err(`  [FAIL] ${s} —— ${f.detail}（${f.cmd.tier};非强制,不阻断退出码）`)
    }
  }
  if (o.failures.length === 0) deps.io.out('  全部命令执行成功。')
  return mandatoryFail ? 1 : 0
}

/**
 * 技能安装段（Phase 2 · S2）:读 registry → 计划 → dry-run 只打印零副作用 / 非 dry-run 确认(y/N or --yes) → 逐条容错 → 汇总。
 *   sources 缺省真 registry（readSkillSources);测试注入 SkillSource[] 子集。env 缺省真 fs+exec,测试注入 spy。
 */
export function cmdSetupSkills(
  deps: CliDeps,
  opts: SetupOpts,
  env: SetupEnv = REAL_SETUP_ENV,
  sources: SkillSource[] = readSkillSources(),
): number {
  const plan = buildSkillsPlan(sources, env)
  renderSkillsPlan(deps, plan)

  if (opts.dryRun) { // dry-run:零执行零全局写（继承 F3 dry-run 不变量）
    deps.io.out('[setup skills] --dry-run:仅打印计划,未执行任何命令、未写任何全局目录。')
    return 0
  }
  if (plan.commands.length === 0) {
    deps.io.out('[setup skills] 无待装技能（全部已就绪或无可安装项）。')
    return 0
  }
  if (!opts.yes) { // 终端确认（--yes 跳过）
    const dirs = [...new Set(plan.commands.map((c) => c.globalDir))].join(' / ')
    if (!env.confirm(`[setup skills] 将执行 ${plan.commands.length} 条命令,写入全局目录:${dirs}。确认?(y/N) `)) {
      deps.io.out('[setup skills] 已取消（未执行任何命令）。')
      return 0
    }
  }
  return renderSummary(deps, executeSkillsPlan(deps, plan, env), plan)
}

/**
 * TODO(Phase 3 填):运行时检查段——docker 探测（CLI 侧直调 `docker info`）+ 缺镜像给一键
 * `bash tools/sandcastle/build.sh` 构建提示（两 runner）。本批仅占位:打印待实现,exit 0 不报错。
 */
function cmdSetupRuntime(deps: CliDeps, opts: SetupOpts): number {
  const suffix = opts.yes ? '（--yes 已透传,将来跳交互确认位）' : ''
  deps.io.out(`[setup runtime] 运行时检查段待实现（Phase 3,计划 R1）。${suffix}`)
  return 0
}

/**
 * `pipeline setup [sub]` —— 安装后全功能就绪引导（骨架批 F3）。
 *   空 sub:① ensurePipelineOnPath（软链到 PATH;--dry-run 时跳过一切写）② 打印计划骨架。
 *   sub=skills/runtime:分派到 Phase 2/3 占位（打印待实现,exit 0）。
 *   未知 sub:stderr + exit 1（对齐 loops 未知子命令口径）。
 * --dry-run:零副作用（不软链/不写文件）;--yes:跳确认位（本批无真安装,仅透传占位）。
 * env 缺省 REAL_SETUP_ENV（真 node:fs);测试注入临时 HOME / spy 快速回归。
 */
export function cmdSetup(
  deps: CliDeps,
  sub: string | undefined,
  opts: SetupOpts,
  env: SetupEnv = REAL_SETUP_ENV,
): number {
  const o: SetupOpts = { dryRun: opts.dryRun ?? false, yes: opts.yes ?? false }
  switch (sub) {
    case undefined:
    case '':
      // 全流程:先把 pipeline 弄上 PATH（dry-run 不软链）→ 打印计划骨架 → 跑技能段（本批实装;R1 补运行时段）。
      if (!o.dryRun) ensurePipelineOnPath(deps, env)
      printPlanSkeleton(deps, o)
      return cmdSetupSkills(deps, o, env)
    case 'skills':
      return cmdSetupSkills(deps, o, env)
    case 'runtime':
      return cmdSetupRuntime(deps, o)
    default:
      deps.io.err(`ERROR: 未知 setup 子命令: ${sub}（支持: skills runtime,或不带子命令走全流程）`)
      return 1
  }
}
