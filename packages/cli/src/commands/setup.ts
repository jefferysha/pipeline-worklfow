/**
 * setup 命令 —— 安装后「全功能就绪」引导（full-install F3）。
 *
 * 三段（空 sub 走全流程,亦可单独敲子命令）:
 *   ① ensurePipelineOnPath():把 CLI bundle 软链到 ~/.local/bin/pipeline（让用户终端能敲 pipeline）;
 *   ② 技能安装段 cmdSetupSkills()（`setup skills`,:468）:读 registry → 分组命令 → 幂等差集 → 计划
 *      → 确认位 → 逐条容错 → 汇总;
 *   ③ 运行时检查段 cmdSetupRuntime()（`setup runtime`,:595）:docker/镜像/两 runner 凭证就绪清单
 *      + 缺镜像一键构建。
 * 退出码:全流程取技能段优先（强制失败),运行时段恒 0 不改判;未知子命令 = 1。
 *
 * 注入面 SetupEnv（home/bin 定位 + fs 原语）:测试注入 fake（临时 HOME/内存 spy），
 * 真实现 REAL_SETUP_ENV 走 node:fs + os.homedir()——对齐 loops.ts InitEnv/REAL_INIT_ENV 先例,
 * 不写死 os.homedir()、不新增 deps.ts 必填字段（软链自带注入面,与 io 注入面正交）。
 * best-effort:软链任何失败只 WARN 不让 setup 崩（对齐 init.ts「注册表故障只 WARN」精神）。
 */
import { execFileSync } from 'node:child_process'
import { chmodSync, lstatSync, mkdirSync, readdirSync, readSync, readlinkSync, symlinkSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { readAutomationJson } from '@pipeline-lite/automation'
import { PREREQ_HINTS } from '@pipeline-lite/kernel'
import { errMsg, type CliDeps } from '../deps.js'
import { nodeExecDocker, probeAfkReadiness, type AfkReadiness, type CredLight, type ExecDockerFn } from '../afkReadiness.js'
import { loadSkillSources, type SkillSource, type SkillSourcesResult, type SkillTier } from '../skillSources.js'

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
  /** 列目录直接子项名（仅目录/软链，缺目录/无权限 → []，fail-safe）——plugin-cache 双层扫用。 */
  listDir(dir: string): string[]
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
  listDir: (dir) => {
    try {
      return readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory() || e.isSymbolicLink()) // skill/plugin 常以 symlink 装入
        .map((e) => e.name)
    } catch {
      return [] // 缺目录/无权限 → 空（fail-safe，与 main.ts safeReaddirDirs 同口径）
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

// ── 全流程开场白（四段预告,纯呈现）─────────────────────────────────────────────────────

export interface SetupOpts {
  dryRun?: boolean
  yes?: boolean
}

/** 全流程开场白:向用户预告下面四段会发生什么（纯 stdout 呈现,无副作用;真逻辑在各段自己的函数里）。 */
function printPlanSkeleton(deps: CliDeps, opts: SetupOpts): void {
  deps.io.out('[setup] 全功能就绪引导 —— 计划骨架')
  deps.io.out('  1. PATH 软链:把 pipeline 软链到 ~/.local/bin（本批已实现）')
  deps.io.out('  2. 技能安装（Phase 2,本批已实装）:读 registry 按 tool 分组选装（详见下方技能计划）')
  deps.io.out('  3. 运行时检查（Phase 3,已实装）:docker/镜像/两 runner 凭证就绪清单 + 缺镜像一键构建（本流程末尾直接跑;--dry-run 只提示见 pipeline setup runtime）')
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

/**
 * 幂等探测:~/.claude/skills、~/.agents/skills（单层子目录名）或 ~/.claude/plugins/cache 任一在位即已装。
 * plugin-cache 真实布局是**双层** cache/<marketplace>/<plugin>（对齐 main.ts scanInstalledSkillNames），
 * 故逐 marketplace 扫「有无同名 plugin」——旧单层探测 cache/<name> 恒 miss → 插件每次 setup 重装。
 */
function skillInstalled(env: SetupEnv, name: string): boolean {
  const home = env.homeDir()
  if (env.pathExists(join(home, '.claude', 'skills', name))) return true
  if (env.pathExists(join(home, '.agents', 'skills', name))) return true
  const cache = join(home, '.claude', 'plugins', 'cache')
  for (const marketplace of env.listDir(cache)) {
    if (env.pathExists(join(cache, marketplace, name))) return true // marketplace/plugin 命中即已装
  }
  return false
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
  sources?: SkillSource[],
  loadSources: () => SkillSourcesResult = loadSkillSources,
): number {
  let list: SkillSource[]
  if (sources !== undefined) {
    list = sources // 测试注入的显式子集（含合法空 []，为合法空 registry）
  } else {
    // 装机段区分「读失败/解析失败」与「真空 registry」：坏/缺 registry 不能当空计划走
    // 「无待装 exit 0」假成功（什么都没装 → 破 full-install 前提）→ fail-loud 非零退出。
    const loaded = loadSources()
    if (!loaded.ok) {
      deps.io.err(
        `ERROR: 技能 registry 未就绪（${loaded.error}）——无法生成安装计划，` +
          '请修复 templates/skill-sources.yaml 后重试 pipeline setup skills。',
      )
      return 1
    }
    list = loaded.sources // 合法（含真空 registry [] → 下方走「无待装」exit 0）
  }
  const plan = buildSkillsPlan(list, env)
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

// ── 运行时检查段（Phase 3 · R1）:AFK 就绪探测 → 打印就绪清单（docker/镜像/两 runner 凭证）──────

/**
 * 运行时段注入面（docker 探测 + 凭证宿主 env + 镜像解析）——真实现走真 docker/process.env/
 * .pipeline/automation.json;测试注入 fake exec + 定值 hostEnv/image（零真 docker 子进程）。
 * secrets 侧仍复用 deps.readSecretsEnv（与 afk run 同源），不在此重复读文件。
 */
export interface RuntimeEnv {
  /** 原始 docker exec（超时收敛由 probeAfkReadiness 内部包裹;spawn 失败按不可用降级）。 */
  exec: ExecDockerFn
  /** 宿主 env 快照（凭证灯读 CLAUDE_CODE_OAUTH_TOKEN/OPENAI_API_KEY/CODEX_HOME）。 */
  hostEnv: Record<string, string | undefined>
  /** 配置镜像解析（同 afk run 口径:.pipeline/automation.json 的 image ?? 内置 sandcastle:local）。 */
  resolveImage: (cwd: string) => string
}

export const REAL_RUNTIME_ENV: RuntimeEnv = {
  exec: nodeExecDocker,
  hostEnv: process.env,
  resolveImage: (cwd) => readAutomationJson(cwd).image ?? 'sandcastle:local',
}

const READY_TAG = '[就绪]'
const MISS_TAG = '[缺失]'

/** 凭证灯人读串:已配标 source（宿主 env/secrets 文件），永不回显值。 */
function credSource(light: CredLight): string {
  return `已配（${light.source === 'host-env' ? '宿主 env' : 'secrets 文件'}）`
}

/** 「怎么拿」引导行缩进（视觉从属于其上的 [缺失] 行;走 kernel PREREQ_HINTS 单一真相源）。 */
const HINT_INDENT = '         '

/**
 * 一条凭证清单行:required 缺 → 给「去配 X」硬指引 + 附一行「怎么拿」获取引导（acquireHint,走 kernel
 * PREREQ_HINTS 单一真相源，缺则不引导只对缺项引导）;optional 缺 → 仅标可选（不误导必配）。
 * 凭证只报 set/未设 + 获取路径，永不回显任何值。
 */
function emitCredLine(
  deps: CliDeps, runner: string, key: string, light: CredLight, required: boolean, note = '', acquireHint = '',
): void {
  if (light.set) {
    deps.io.out(`  ${READY_TAG} ${runner} 凭证 ${key} ${credSource(light)}`)
  } else if (required) {
    deps.io.out(`  ${MISS_TAG} ${runner} 凭证 ${key} 未配 → 去配 ${key}（pipeline 机器级 secrets 或宿主 env）`)
    if (acquireHint !== '') deps.io.out(`${HINT_INDENT}怎么拿：${acquireHint}`)
  } else {
    deps.io.out(`  ${MISS_TAG} ${runner} ${key} 未配${note}`)
  }
}

/** 就绪清单渲染:docker / 镜像（缺给 build_hint 一键）/ 两 runner 凭证对称呈现（codex 不缺席）。 */
function renderRuntimeReadiness(deps: CliDeps, r: AfkReadiness, dryRun: boolean): void {
  deps.io.out('[setup runtime] AFK 运行时就绪清单（终端 doctor/setup 为凭证权威——即将 afk run 的 shell 当刻真值）')

  // docker（不可用不光报缺:附一行「怎么拿」——装 OrbStack / Docker Desktop,走 kernel 单一真相源）
  if (r.docker.available) deps.io.out(`  ${READY_TAG} docker daemon 可用`)
  else {
    deps.io.out(`  ${MISS_TAG} docker 不可用——AFK 容器执行降级（AFK 为可选能力;装 docker 并起 daemon 后重探）`)
    deps.io.out(`${HINT_INDENT}怎么拿：${PREREQ_HINTS.docker}`)
  }

  // 镜像（缺 → build_hint 一键;走探测里的 kernel 单一真相源常量，不另写字面串）
  const img = r.image
  if (img.present) deps.io.out(`  ${READY_TAG} AFK 镜像 ${img.configured} 在位`)
  else if (r.docker.available) deps.io.out(`  ${MISS_TAG} AFK 镜像 ${img.configured} 不在本机 → 构建:${img.build_hint}`)
  else deps.io.out(`  ${MISS_TAG} AFK 镜像 ${img.configured} 未能核（docker 不可用）→ 起 docker 后重探;缺则构建:${img.build_hint}`)

  // 两 runner 凭证对称:claude-code 的 CLAUDE_CODE_OAUTH_TOKEN + codex 的 OPENAI_API_KEY/CODEX_HOME
  // 各自缺时附「怎么拿」获取引导（claude setup-token / codex login·openai keys,走 kernel PREREQ_HINTS）
  emitCredLine(deps, 'claude-code', 'CLAUDE_CODE_OAUTH_TOKEN', r.credentials['claude-code'].CLAUDE_CODE_OAUTH_TOKEN, true, '', PREREQ_HINTS.claudeToken)
  emitCredLine(deps, 'codex', 'OPENAI_API_KEY', r.credentials.codex.OPENAI_API_KEY, true, '', PREREQ_HINTS.openaiKey)
  emitCredLine(deps, 'codex', 'CODEX_HOME', r.credentials.codex.CODEX_HOME, false, '（可选,缺省 ~/.codex）')

  if (dryRun) deps.io.out('  （--dry-run:只探测只打印,未写任何文件）')
}

/**
 * 运行时检查段（Phase 3 · R1）:解析配置镜像 → probeAfkReadiness（docker info/image inspect + 两 runner
 * 凭证）→ 打印就绪清单。全程只读探测（本段不写任何文件），--dry-run 与常态同路径、仅追加 dry-run 说明。
 * docker 不可用一律降级（清单标缺失 + 重探指引），不抛不改退出码——AFK 为可选能力，exit 恒 0。
 * 凭证复用 deps.readSecretsEnv（与 afk run 同源）+ 注入 hostEnv;值永不回显（只 set/未设 + source）。
 */
export async function cmdSetupRuntime(
  deps: CliDeps,
  opts: SetupOpts,
  rt: RuntimeEnv = REAL_RUNTIME_ENV,
): Promise<number> {
  const image = rt.resolveImage(deps.cwd)
  const secretsEnv = deps.readSecretsEnv ? await deps.readSecretsEnv().catch(() => ({})) : {}
  const readiness = await probeAfkReadiness({ image, exec: rt.exec, secretsEnv, hostEnv: rt.hostEnv })
  renderRuntimeReadiness(deps, readiness, opts.dryRun ?? false)
  return 0
}

/**
 * `pipeline setup [sub]` —— 安装后全功能就绪引导。
 *   空 sub:① ensurePipelineOnPath（软链到 PATH;--dry-run 跳过一切写）→ ② 计划骨架 → ③ 技能安装段（S2）
 *          → ④ 运行时就绪清单（R1）。一条命令走完「装技能 + 配就绪 + 一屏清单」。
 *   sub=skills:仅技能安装段;sub=runtime:仅运行时就绪清单（真 docker/镜像/凭证探测）。
 *   未知 sub:stderr + exit 1（对齐 loops 未知子命令口径）。
 * --dry-run:零副作用（不软链/不写文件/不起 docker）——空 sub 的运行时段**只提示不真探测**（R1 concern#1:
 *   避免 buildProgram 单测经空 sub 起真 docker 子进程）;非 dry-run 才经注入 rt 真探测（单测注入 fakeRt 仍零真 docker）。
 * --yes:跳技能安装确认位。env/rt 缺省真实现;测试注入临时 HOME / spy / fakeRt 快速回归。
 */
export function cmdSetup(
  deps: CliDeps,
  sub: string | undefined,
  opts: SetupOpts,
  env: SetupEnv = REAL_SETUP_ENV,
  rt: RuntimeEnv = REAL_RUNTIME_ENV,
): number | Promise<number> {
  const o: SetupOpts = { dryRun: opts.dryRun ?? false, yes: opts.yes ?? false }
  switch (sub) {
    case undefined:
    case '': {
      // 全流程一条命令:PATH 软链（dry-run 不软链）→ 计划骨架 → 技能安装段 → 运行时就绪清单。
      // 运行时段 dry-run **只提示不真探测**（避免 buildProgram 单测经空 sub 起真 docker 子进程，R1 concern#1）;
      // 非 dry-run 才经注入 rt 真探测。技能段先同步跑完再接运行时异步段,故非 dry-run 返 Promise。
      if (!o.dryRun) ensurePipelineOnPath(deps, env)
      printPlanSkeleton(deps, o)
      const skillsCode = cmdSetupSkills(deps, o, env)
      if (o.dryRun) {
        deps.io.out(
          '[setup] 运行时就绪检查:--dry-run 跳过真探测（不起 docker）——跑 pipeline setup runtime ' +
            '看真实 docker/镜像/两 runner 凭证就绪清单',
        )
        return skillsCode
      }
      // 非 dry-run:技能段之后真跑运行时就绪清单;退出码取技能段(强制失败)优先,运行时恒 0 不改判。
      return cmdSetupRuntime(deps, o, rt).then((rtCode) => (skillsCode !== 0 ? skillsCode : rtCode))
    }
    case 'skills':
      return cmdSetupSkills(deps, o, env)
    case 'runtime':
      return cmdSetupRuntime(deps, o, rt) // Promise<number>:真运行时段（docker/镜像/凭证就绪清单）
    default:
      deps.io.err(`ERROR: 未知 setup 子命令: ${sub}（支持: skills runtime,或不带子命令走全流程）`)
      return 1
  }
}
