/**
 * setup 命令 —— 安装后「全功能就绪」引导（full-install F3）。
 *
 * 三段（空 sub 走全流程,亦可单独敲子命令）:
 *   ① managed runtime:校验 marketplace checkout，发布不可变 release，再写稳定 pipeline/pipeline-hook 启动器;
 *   ② 技能安装段 cmdSetupSkills()（`setup skills`,:468）:读 registry → 分组命令 → 幂等差集 → 计划
 *      → 确认位 → 逐条容错 → 汇总;
 *   ③ 运行时检查段 cmdSetupRuntime()（`setup runtime`,:595）:docker/镜像/两 runner 凭证就绪清单
 *      + 缺镜像一键构建。
 * 退出码:全流程取技能段优先（强制失败),运行时段恒 0 不改判;未知子命令 = 1。
 *
 * 注入面 SetupEnv（home/宿主命令/用户配置）:测试注入 fake（临时 HOME/内存 spy），
 * 真实现 REAL_SETUP_ENV 走 node:fs + os.homedir()——对齐 loops.ts InitEnv/REAL_INIT_ENV 先例,
 * 不写死 os.homedir()、不新增 deps.ts 必填字段。runtime 发布失败是硬失败，绝不让 host 指向未验证 checkout。
 */
import { execFileSync } from 'node:child_process'
import { accessSync, constants as fsConstants, lstatSync, mkdirSync, readFileSync, readdirSync, readSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { readAutomationJson } from '@pipeline-lite/automation'
import { PREREQ_HINTS } from '@pipeline-lite/kernel'
import { errMsg, type CliDeps } from '../deps.js'
import { nodeExecDocker, probeAfkReadiness, type AfkReadiness, type CredLight, type ExecDockerFn } from '../afkReadiness.js'
import { REAL_RUNTIME_INSTALLER, type RuntimeInstaller } from '../runtime/installer.js'
import { resolveRuntimePaths } from '../runtime/paths.js'
import { loadSkillSources, type SkillSource, type SkillSourcesResult, type SkillTier } from '../skillSources.js'
import { REAL_RELEASED_DASHBOARD_STARTER, type ReleasedDashboardStarter } from './dashboard.js'
import {
  hostFlag,
  installedPipelineRoot,
  isNativePipelineHost,
  nativeInstallPlan,
  selectPipelineHost,
  type NativePipelineHost,
  type PipelineHost,
  type PipelineHostFlags,
} from './plugin-host.js'

// ── 注入面（测试注入临时 HOME / spy;真实现 = node:fs + os.homedir）──────────────────
export interface SetupEnv {
  /** 用户 home（真实现 os.homedir();managed runtime 与稳定启动器定位锚）。 */
  homeDir(): string
  /** $PLUGIN_ROOT / $CLAUDE_PLUGIN_ROOT（插件安装根）;未设 → null（dev 回退 selfPath）。 */
  pluginRoot(): string | null
  /** 本 CLI bundle 自身路径（真实现 resolve(process.argv[1]);pluginRoot 缺失时的 dev 回退源）。 */
  selfPath(): string
  /** lstat 存在性（软链本身也算存在）；用于已安装 skill / marketplace 的只读幂等检查。 */
  pathExists(path: string): boolean
  /** 读取用户级配置；缺失或不可读时返回 undefined，调用方不得猜测或覆盖其内容。 */
  readText(path: string): string | undefined
  /** mkdir -p。 */
  mkdirp(dir: string): void
  /** PATH 中是否已有可执行命令；只读探测，用于全局 npm 工具的幂等差集。 */
  commandExists(name: string): boolean
  /** 列目录直接子项名（仅目录/软链，缺目录/无权限 → []，fail-safe）——plugin-cache 双层扫用。 */
  listDir(dir: string): string[]
  /** 写入受控的用户级 pipeline 配置（自动更新 opt-in）。 */
  writeText(path: string, text: string): void
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
    const r = process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT
    return r !== undefined && r.trim() !== '' ? r : null
  },
  selfPath: () => {
    const candidate = resolve(process.argv[1] ?? '')
    // The user-facing launcher is a stable script under ~/.local/bin.  Follow the active process
    // path before deriving a dev fallback so `pipeline dashboard` / `pipeline update` never
    // mistake ~/.local for a marketplace candidate root.
    try {
      return realpathSync(candidate)
    } catch {
      return candidate
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
  readText: (path) => {
    try {
      return readFileSync(path, 'utf8')
    } catch {
      return undefined
    }
  },
  mkdirp: (dir) => { mkdirSync(dir, { recursive: true }) },
  commandExists: (name) => {
    for (const dir of (process.env.PATH ?? '').split(':')) {
      if (dir === '') continue
      try {
        accessSync(join(dir, name), fsConstants.X_OK)
        return true
      } catch {
        // 继续检查下一个 PATH 目录。
      }
    }
    return false
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
  writeText: (path, text) => { writeFileSync(path, text, 'utf8') },
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
      // 同步读 fd 0 一次。**不检查 isTTY**：判据是「读到了什么」而非「是不是终端」——
      // 故 `echo y | pipeline setup` 这类管道输入同样会放行（非 TTY 不等于自动判 No）。
      const n = readSync(0, buf, 0, 64, null)
      const ans = buf.toString('utf8', 0, n).trim().toLowerCase()
      return ans === 'y' || ans === 'yes'
    } catch {
      return false // 读失败（无输入可读/fd 0 关闭等）→ 判 No，fail-closed（自动化走 --yes）
    }
  },
}

/**
 * 插件根优先取宿主注入；终端直接执行 bundle 时，从 dist/pipeline.mjs 反推仓根。
 * 这样 `pipeline update` 在宿主重新安装后可用刚解析出的候选根发布 managed runtime，
 * 而不依赖旧 hook env 或可变 marketplace checkout。
 */
export function resolvePipelineRoot(env: SetupEnv): string {
  const root = env.pluginRoot()
  if (root !== null) return root
  return resolve(dirname(env.selfPath()), '..', '..', '..')
}

// ── 全流程开场白（四段预告,纯呈现）─────────────────────────────────────────────────────

export interface SetupOpts extends PipelineHostFlags {
  dryRun?: boolean
  yes?: boolean
  /** Explicit target only applies to non-native adapters; defaults to current project. */
  target?: string
  /** Opt-in: native host SessionStart performs a throttled marketplace refresh/reinstall. */
  autoUpdate?: boolean
}

/** 全流程开场白:向用户预告下面四段会发生什么（纯 stdout 呈现,无副作用;真逻辑在各段自己的函数里）。 */
function printPlanSkeleton(deps: CliDeps, opts: SetupOpts, host: PipelineHost): void {
  deps.io.out(`[setup] ${hostFlag(host)} 全功能就绪引导 —— 计划骨架`)
  deps.io.out('  1. 宿主安装:只验证/部署所选宿主，不会同时改动其他宿主。')
  deps.io.out('  2. 稳定入口:把已校验 release 原子发布到本机 runtime，再写 pipeline / pipeline-hook 启动器。')
  deps.io.out('  3. 内置技能:验证本插件随包的 default workflow skills；不拉第三方 marketplace。')
  deps.io.out('  4. 运行时检查:docker/镜像/两 runner 凭证就绪清单（本流程末尾直接跑;--dry-run 只提示见 pipeline setup runtime）。')
  deps.io.out('  5. 全功能红黄绿汇总:安装后运行 pipeline doctor --json 获取全机汇总。')
  if (opts.dryRun) deps.io.out('  （--dry-run:仅打印计划,不发布 runtime、不写任何文件）')
}

function autoUpdateConfigPath(env: SetupEnv): string {
  return join(resolveRuntimePaths({ homeDir: env.homeDir() }).configRoot, 'auto-update.conf')
}

/** Native host only: write a tiny explicit preference consumed by hooks/auto-update.sh. */
function configureAutoUpdate(deps: CliDeps, env: SetupEnv, host: PipelineHost, enabled: boolean): number {
  if (!enabled) return 0
  if (!isNativePipelineHost(host)) {
    deps.io.err(`ERROR: ${hostFlag(host)} 没有原生 marketplace，不能启用自动更新；请先更新承载该 adapter 的 Codex 或 Claude 插件。`)
    return 1
  }
  try {
    const config = autoUpdateConfigPath(env)
    env.mkdirp(dirname(config))
    env.writeText(config, `host=${host}\nenabled=true\n`)
    deps.io.out(`[setup] 已启用 ${hostFlag(host)} 自动更新（每天最多检查一次；新版本安装后请新开会话加载技能与 hooks）。`)
    return 0
  } catch (error) {
    deps.io.err(`WARN: 无法写入自动更新配置（不影响当前安装）:${errMsg(error)}`)
    return 0
  }
}

/** Codex intentionally keeps third-party hook execution behind one explicit local trust decision. */
function printCodexHookTrust(deps: CliDeps): void {
  deps.io.out('[setup] Codex 已安装 pipeline hooks；为启用正常对话自动路由，请在 Codex 输入 /hooks，并信任 pipeline-lite。')
  deps.io.out('        这是 Codex 的一次性本机安全确认；未信任时 skills 仍可用，但 SessionStart/UserPromptSubmit hooks 不会执行。')
}

type JsonRecord = Record<string, unknown>

function isJsonRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Version 0.1 installed Codex hooks directly into ~/.codex/hooks.json and pointed them at the
 * mutable source checkout. Version 0.2 ships those hooks inside the native plugin and dispatches
 * through the immutable managed runtime. Keeping both registrations causes every event to fire
 * twice and lets a stale adapter participate in a new session.
 *
 * Match only the four exact legacy adapter scripts. A user command merely mentioning "pipeline"
 * or a different hook under adapters/ is never touched.
 */
const LEGACY_CODEX_ADAPTER_COMMAND = /(?:^|[\s"'])(?:[^\s"']*\/)?adapters\/codex\/hooks\/(?:inject|prompt|veto|track)\.sh(?=$|[\s"'])/

function isLegacyCodexAdapterHook(value: unknown): boolean {
  if (!isJsonRecord(value) || typeof value.command !== 'string') return false
  return LEGACY_CODEX_ADAPTER_COMMAND.test(value.command)
}

export interface LegacyCodexHookCleanup {
  readonly content: string
  readonly removed: number
}

/**
 * Pure, conservative migration for the old global Codex registration. It understands Codex's
 * nested hook groups, removes only our obsolete commands, and leaves malformed/unknown shapes
 * byte-for-byte untouched. The caller writes only when at least one owned command was removed.
 */
export function scrubLegacyCodexAdapterHooks(content: string): LegacyCodexHookCleanup {
  let root: unknown
  try {
    root = JSON.parse(content)
  } catch {
    return { content, removed: 0 }
  }
  if (!isJsonRecord(root) || !isJsonRecord(root.hooks)) return { content, removed: 0 }

  let removed = 0
  const hooks = root.hooks
  for (const eventName of Object.keys(hooks)) {
    const groups = hooks[eventName]
    if (!Array.isArray(groups)) continue

    const retainedGroups: unknown[] = []
    for (const group of groups) {
      if (isLegacyCodexAdapterHook(group)) {
        removed += 1
        continue
      }
      if (!isJsonRecord(group) || !Array.isArray(group.hooks)) {
        retainedGroups.push(group)
        continue
      }

      const retainedHooks = group.hooks.filter((hook) => {
        if (!isLegacyCodexAdapterHook(hook)) return true
        removed += 1
        return false
      })
      if (retainedHooks.length === 0) continue
      retainedGroups.push(retainedHooks.length === group.hooks.length ? group : { ...group, hooks: retainedHooks })
    }

    if (retainedGroups.length === 0) delete hooks[eventName]
    else hooks[eventName] = retainedGroups
  }
  if (removed === 0) return { content, removed: 0 }
  if (Object.keys(hooks).length === 0) delete root.hooks
  return { content: `${JSON.stringify(root, null, 2)}\n`, removed }
}

/**
 * Native Codex owns plugin hook lifecycle. Before publishing a runtime, migrate only obsolete
 * version-0.1 global registrations so a newly installed plugin never runs a duplicate adapter.
 */
function migrateLegacyCodexHooks(deps: CliDeps, env: SetupEnv): number {
  const configPath = join(env.homeDir(), '.codex', 'hooks.json')
  if (!env.pathExists(configPath)) return 0

  const current = env.readText(configPath)
  if (current === undefined) {
    deps.io.err(`[setup] WARN: 无法读取 ${configPath}；未能确认旧版 pipeline Codex hooks 是否已迁移。`)
    return 1
  }
  const migration = scrubLegacyCodexAdapterHooks(current)
  if (migration.removed === 0) return 0

  try {
    env.writeText(configPath, migration.content)
  } catch (error) {
    deps.io.err(`ERROR: 无法迁移旧版 Codex hooks；为避免新旧 hooks 重复执行，未发布 runtime：${errMsg(error)}`)
    return 1
  }
  deps.io.out(`[setup] 已迁移 ${migration.removed} 个旧版 Codex hook；保留其余用户 hooks，由 pipeline-lite 插件统一接管。`)
  return 0
}

/** Verify a resolved plugin root before publishing it as a managed runtime or mutating an adapter target. */
export function verifyPackagedAssets(
  deps: CliDeps,
  env: SetupEnv,
  root: string,
  dryRun: boolean,
  silent = false,
): number {
  // The launcher is deliberately usable from any project directory.  Resolve the verifier from
  // the host-owned plugin root, rather than from process.cwd(), or a perfectly valid installed
  // plugin would fail verification whenever the caller was not sitting in this repository.
  const command = [join(root, 'tools', 'verify-skills.sh'), '--quiet', '--root', root]
  if (!silent) deps.io.out(`[setup] 插件资产校验: bash ${command.join(' ')}`)
  if (dryRun) return 0
  // The managed runtime cannot recover from a marketplace checkout which only
  // contains skills/hooks.  Detect the release bootstrap before publishing so
  // setup never reports an installed plugin and then fails after mutating user
  // state with a partial runtime.
  if (!env.pathExists(join(root, 'runtime', 'pipeline-bootstrap.mjs'))) {
    if (!silent) deps.io.err('ERROR: 插件资产校验失败：缺少 runtime/pipeline-bootstrap.mjs（该 marketplace release 不是完整可安装包）')
    return 1
  }
  const result = env.runCommand('bash', command)
  if (result.code === 0) {
    if (!silent) deps.io.out('[setup] 插件资产完整：hooks、manifests、runtime 与内置 skills 已通过校验。')
    return 0
  }
  if (!silent) deps.io.err(`ERROR: 插件资产校验失败：${result.stderr.trim() || result.stdout.trim() || `退出码 ${result.code}`}`)
  return 1
}

function commandText(cmd: string, args: readonly string[]): string {
  return [cmd, ...args].join(' ')
}

/** Marketplace add is idempotent on some host versions but reports a non-zero duplicate on others. */
function isDuplicateMarketplaceResult(result: { stdout: string; stderr: string }): boolean {
  return /already|exists|registered|duplicate/i.test(`${result.stdout}\n${result.stderr}`)
}

/**
 * Install the single release plugin into the selected native host and resolve the root from the
 * host's own inventory.  Do not infer a cache path: both hosts may change their cache layout.
 */
interface NativePluginCandidate {
  readonly root: string
  /** Existing host inventory was fully verified before reuse. */
  readonly verified: boolean
}

/**
 * `setup` is idempotent: if the host already owns a complete, verified package,
 * reuse that exact host-resolved root.  `pipeline update --<host>` remains the
 * explicit release-refresh operation.  An incomplete/corrupt existing package
 * is never trusted; setup falls through to the release marketplace plan.
 */
function verifiedInstalledNativePlugin(
  deps: CliDeps,
  env: SetupEnv,
  host: NativePipelineHost,
): NativePluginCandidate | null {
  const inventoryCommand = nativeInstallPlan(host).at(-1)
  if (inventoryCommand === undefined) return null
  deps.io.out(`[setup] $ ${commandText(inventoryCommand.cmd, inventoryCommand.args)}`)
  const inventory = env.runCommand(inventoryCommand.cmd, [...inventoryCommand.args])
  if (inventory.code !== 0) return null
  const root = installedPipelineRoot(host, inventory.stdout)
  if (root === null) return null
  if (verifyPackagedAssets(deps, env, root, false, true) !== 0) {
    deps.io.out(`[setup] ${hostFlag(host)} 已登记的 pipeline-lite 不完整或未通过校验；将重新安装正式 release。`)
    return null
  }
  deps.io.out(`[setup] ${hostFlag(host)} 已有完整且已验证的 pipeline-lite；复用宿主登记的安装。`)
  return { root, verified: true }
}

function installNativePlugin(
  deps: CliDeps,
  env: SetupEnv,
  host: NativePipelineHost,
): NativePluginCandidate | null {
  const existing = verifiedInstalledNativePlugin(deps, env, host)
  if (existing !== null) return existing
  const plan = nativeInstallPlan(host)
  let inventory = ''
  for (let index = 0; index < plan.length; index += 1) {
    const item = plan[index]!
    deps.io.out(`[setup] $ ${commandText(item.cmd, item.args)}`)
    const result = env.runCommand(item.cmd, [...item.args])
    if (result.stdout.trim() !== '') deps.io.out(result.stdout.trimEnd())
    if (result.code === 0) {
      if (index === plan.length - 1) inventory = result.stdout
      continue
    }

    // Existing marketplaces are a normal idempotent setup case; every other marketplace failure
    // is surfaced rather than being swallowed (network/auth errors must remain actionable).
    if (index === 0 && isDuplicateMarketplaceResult(result)) {
      deps.io.out(`[setup] ${hostFlag(host)} marketplace 已存在，继续验证插件。`)
      continue
    }

    // A few host versions reject an already-installed plugin.  Query inventory once and accept
    // that outcome only if the requested release plugin is actually present.
    if (index === 1) {
      const inventoryCommand = plan[plan.length - 1]!
      const inventoryResult = env.runCommand(inventoryCommand.cmd, [...inventoryCommand.args])
      const existingRoot = inventoryResult.code === 0
        ? installedPipelineRoot(host, inventoryResult.stdout)
        : null
      if (existingRoot !== null) {
        deps.io.out(`[setup] ${hostFlag(host)} 已有 pipeline-lite，复用宿主登记的安装。`)
        return { root: existingRoot, verified: false }
      }
    }

    deps.io.err(
      `ERROR: ${commandText(item.cmd, item.args)} 失败：${result.stderr.trim() || result.stdout.trim() || `退出码 ${result.code}`}`,
    )
    return null
  }
  const root = installedPipelineRoot(host, inventory)
  if (root === null) {
    deps.io.err(`ERROR: ${hostFlag(host)} 插件清单中没有 pipeline-lite；未切换 launcher。`)
    return null
  }
  return { root, verified: false }
}

function publishManagedRuntime(
  deps: CliDeps,
  env: SetupEnv,
  installer: RuntimeInstaller,
  candidateRoot: string,
  host: PipelineHost,
  dashboardStarter: ReleasedDashboardStarter | undefined,
  openDashboard: boolean,
): Promise<number> {
  const source = isNativePipelineHost(host) ? host : 'adapter'
  return installer.activate(candidateRoot, source, env.homeDir())
    .then(async (activation) => {
      deps.io.out(`[setup] 已发布已验证 runtime: ${activation.release.releaseId}（revision ${activation.selection.revision}）。`)
      deps.io.out('[setup] 稳定入口已就绪：~/.local/bin/pipeline 与 ~/.local/bin/pipeline-hook 不再直连 marketplace checkout。')
      if (dashboardStarter !== undefined) {
        const dashboardCode = await dashboardStarter.start(deps, join(activation.releaseRoot, 'payload'), { openBrowser: openDashboard })
        if (dashboardCode !== 0) {
          deps.io.err('ERROR: runtime 已发布，但 dashboard 未能完成受管启动；请运行 pipeline dashboard --background 诊断。')
          return 1
        }
      }
      return 0
    })
    .catch((error: unknown) => {
      deps.io.err(`ERROR: managed runtime 发布失败；保留当前已验证 release，未切换入口：${errMsg(error)}`)
      return 1
    })
}

/** Host-specific installation that keeps native marketplaces and non-native adapters separate. */
export function cmdSetupHost(
  deps: CliDeps,
  host: PipelineHost,
  opts: SetupOpts,
  env: SetupEnv = REAL_SETUP_ENV,
  installer: RuntimeInstaller = REAL_RUNTIME_INSTALLER,
  dashboardStarter?: ReleasedDashboardStarter,
  openDashboard = true,
): number | Promise<number> {
  if (opts.autoUpdate && !isNativePipelineHost(host)) {
    deps.io.err(`ERROR: ${hostFlag(host)} 是 adapter，自动更新由承载它的 Codex 或 Claude 插件负责；请改用 pipeline setup --codex --auto-update 或 --claude --auto-update。`)
    return 1
  }

  if (opts.dryRun) {
    if (isNativePipelineHost(host)) {
      deps.io.out(`[setup] ${hostFlag(host)}:将安装本仓 marketplace 中的唯一 pipeline-lite 插件。`)
      for (const item of nativeInstallPlan(host)) deps.io.out(`[setup] $ ${commandText(item.cmd, item.args)}`)
      deps.io.out('[setup] 将用宿主插件清单解析候选根，校验并原子发布 managed runtime；不会直连可变 checkout。')
      if (host === 'codex') deps.io.out('[setup] 安装后需在 Codex 输入 /hooks 并信任 pipeline-lite，正常对话路由才会启用。')
    } else {
      const root = resolvePipelineRoot(env)
      const assetCode = verifyPackagedAssets(deps, env, root, true)
      if (assetCode !== 0) return assetCode
      deps.io.out(`[setup] ${hostFlag(host)}:将运行打包 adapter → ${opts.target ?? deps.cwd}`)
    }
    if (opts.autoUpdate) deps.io.out(`[setup] 将启用 ${hostFlag(host)} 自动更新偏好。`)
    return 0
  }

  if (isNativePipelineHost(host)) {
    const candidate = installNativePlugin(deps, env, host)
    if (candidate === null) return 1
    const assetCode = candidate.verified ? 0 : verifyPackagedAssets(deps, env, candidate.root, false)
    if (assetCode !== 0) return assetCode
    if (host === 'codex') {
      const migrationCode = migrateLegacyCodexHooks(deps, env)
      if (migrationCode !== 0) return migrationCode
    }
    return publishManagedRuntime(deps, env, installer, candidate.root, host, dashboardStarter, openDashboard).then((runtimeCode) => {
      if (runtimeCode !== 0) return runtimeCode
      if (host === 'codex') printCodexHookTrust(deps)
      return configureAutoUpdate(deps, env, host, opts.autoUpdate === true)
    })
  } else {
    const root = resolvePipelineRoot(env)
    const assetCode = verifyPackagedAssets(deps, env, root, false)
    if (assetCode !== 0) return assetCode
    return publishManagedRuntime(deps, env, installer, root, host, dashboardStarter, openDashboard).then((runtimeCode) => {
      if (runtimeCode !== 0) return runtimeCode
      const adapter = join(root, 'adapters', 'install.sh')
      const args = [adapter, hostFlag(host), '--target', opts.target ?? deps.cwd, '--yes']
      deps.io.out(`[setup] $ bash ${args.join(' ')}`)
      const result = env.runCommand('bash', args)
      if (result.stdout.trim() !== '') deps.io.out(result.stdout.trimEnd())
      if (result.code !== 0) {
        deps.io.err(`ERROR: ${hostFlag(host)} adapter 安装失败：${result.stderr.trim() || `退出码 ${result.code}`}`)
        return 1
      }
      return configureAutoUpdate(deps, env, host, opts.autoUpdate === true)
    })
  }
}

// ── 技能安装段（Phase 2 · S2）:读 registry → 分组命令 → 幂等差集 → 计划 → 逐条容错 → 汇总 ──────

/** 命令分组；Codex 安装面先行，同时保留 Claude Code 兼容安装。 */
export type CmdGroup = 'codex-marketplace-add' | 'codex-plugin' | 'marketplace-add' | 'claude-plugin' | 'skills-cli' | 'npm'

/** 一条待执行命令 + 计划呈现所需元信息（官方/第三方、受影响全局目录、覆盖 token、tier）。 */
export interface PlannedCommand {
  group: CmdGroup
  cmd: string
  args: string[]
  /** 本命令覆盖的 registry token（去重/dedup 后可能多个,如 commit-commands 两 token 共一插件）。 */
  tokens: string[]
  /** skills-cli 的 `--skill` 名（bare-add 或非 skills-cli 时空）——计划里「装哪几个」列出可见。 */
  names: string[]
  /** skills-cli 精确请求项；用于命令 exit 0 后按真实用户级目录复核，防部分匹配假成功。 */
  skillRequests?: Array<{ token: string; name: string; tier: SkillTier }>
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
  if (env.pathExists(join(home, '.codex', 'skills', name))) return true
  if (env.pathExists(join(home, '.claude', 'skills', name))) return true
  if (env.pathExists(join(home, '.agents', 'skills', name))) return true
  const cache = join(home, '.claude', 'plugins', 'cache')
  for (const marketplace of env.listDir(cache)) {
    if (env.pathExists(join(cache, marketplace, name))) return true // marketplace/plugin 命中即已装
  }
  return false
}

function pluginInstalled(env: SetupEnv, runner: 'codex' | 'claude', source: string, id: string): boolean {
  const base = runner === 'codex' ? '.codex' : '.claude'
  return env.pathExists(join(env.homeDir(), base, 'plugins', 'cache', source, id))
}

function marketplaceInstalled(env: SetupEnv, runner: 'codex' | 'claude', source: string): boolean {
  if (REGISTERED_MARKETPLACES.has(source)) return true
  const home = env.homeDir()
  if (runner === 'codex') {
    return env.pathExists(join(home, '.codex', '.tmp', 'marketplaces', source))
      || env.pathExists(join(home, '.codex', 'plugins', 'cache', source))
  }
  return env.pathExists(join(home, '.claude', 'plugins', 'marketplaces', source))
    || env.pathExists(join(home, '.claude', 'plugins', 'cache', source))
}

/** 命令可读串（计划/汇总用）。 */
function cmdStr(c: { cmd: string; args: string[] }): string {
  return [c.cmd, ...c.args].join(' ')
}

/**
 * 读 registry → 按 tool 分组生成命令 + 幂等差集（纯函数,只经 env.pathExists 读、绝不写/exec）。
 *   claude-plugin:Codex-first 双装：`codex plugin add` + `claude plugin install`；两侧各自按 cache
 *                 幂等，非官方 marketplace 各自先 add。同 <id>@<source> 多 token dedup 成一条。
 *   skills-cli   :按 source 聚合 `--skill <名…>`（名=skill||token);单技能仓（1 token 且无 skill 字段）→ bare add（白名单）;
 *                 已装 token 从 --skill 剔除,整组已装则整条剔除。附 `--list` 核 id 命令。
 *   npm          :`npm install -g <source>`；registry 声明 bin 且该命令已在 PATH 时幂等剔除。
 *   builtin/bundled:不生成命令（记入 noInstall）。
 *   engine       :任何 token 的 engine（如 browser-qa→playwright@claude-plugins-official）→ 附加 claude-plugin 命令,dedup。
 */
export function buildSkillsPlan(sources: SkillSource[], env: SetupEnv): SkillsPlan {
  const alreadyInstalled: Array<{ token: string; where: string }> = []
  const noInstall: Array<{ token: string; tool: string }> = []
  const codexMarketplaceAdds = new Map<string, PlannedCommand>()
  const marketplaceAdds = new Map<string, PlannedCommand>()
  const codexPluginCmds = new Map<string, PlannedCommand>()
  const pluginCmds = new Map<string, PlannedCommand>()
  const skillsBySource = new Map<string, SkillSource[]>() // source → tokens（保序）
  const npmCmds = new Map<string, PlannedCommand>() // key: source

  const ensureMarketplace = (runner: 'codex' | 'claude', source: string, official: boolean): void => {
    if (official || marketplaceInstalled(env, runner, source)) return
    const repo = marketplaceRepo(source)
    const target = runner === 'codex' ? codexMarketplaceAdds : marketplaceAdds
    if (target.has(repo)) return
    target.set(repo, runner === 'codex'
      ? {
          group: 'codex-marketplace-add', cmd: 'codex', args: ['plugin', 'marketplace', 'add', repo],
          tokens: [], names: [], bareAdd: false, source, official: false, tier: 'optional',
          globalDir: '~/.codex', note: 'Codex 非官方 marketplace',
        }
      : {
          group: 'marketplace-add', cmd: 'claude', args: ['plugin', 'marketplace', 'add', repo],
          tokens: [], names: [], bareAdd: false, source, official: false, tier: 'optional',
          globalDir: '~/.claude', note: 'Claude 非官方 marketplace',
        })
  }

  const addPluginCommand = (
    target: Map<string, PlannedCommand>, runner: 'codex' | 'claude', id: string, source: string,
    official: boolean, tier: SkillTier, tokenLabel: string, engineNote?: string,
  ): void => {
    ensureMarketplace(runner, source, official)
    const key = `${id}@${source}`
    const existing = target.get(key)
    if (existing) {
      existing.tokens.push(tokenLabel)
      existing.tier = higherTier(existing.tier, tier)
      if (engineNote) existing.note = existing.note ? `${existing.note}；${engineNote}` : engineNote
      return
    }
    target.set(key, runner === 'codex'
      ? {
          group: 'codex-plugin', cmd: 'codex', args: ['plugin', 'add', key],
          tokens: [tokenLabel], names: [], bareAdd: false, source, official, tier,
          globalDir: '~/.codex', note: engineNote,
        }
      : {
          group: 'claude-plugin', cmd: 'claude', args: ['plugin', 'install', key],
          tokens: [tokenLabel], names: [], bareAdd: false, source, official, tier,
          globalDir: '~/.claude', note: engineNote,
        })
  }

  const addPlugin = (
    id: string, source: string, official: boolean, tier: SkillTier, tokenLabel: string, engineNote?: string,
  ): void => {
    const codexReady = pluginInstalled(env, 'codex', source, id)
    const claudeReady = pluginInstalled(env, 'claude', source, id)
    if (codexReady && claudeReady) {
      alreadyInstalled.push({ token: tokenLabel, where: `Codex + Claude plugin cache:${id}` })
      return
    }
    if (!codexReady) addPluginCommand(codexPluginCmds, 'codex', id, source, official, tier, tokenLabel, engineNote)
    if (!claudeReady) addPluginCommand(pluginCmds, 'claude', id, source, official, tier, tokenLabel, engineNote)
  }

  for (const s of sources) {
    if (s.unavailable === true) {
      noInstall.push({ token: s.token, tool: 'unavailable-upstream' })
      continue
    }
    if (s.tool === 'builtin' || s.tool === 'bundled') { noInstall.push({ token: s.token, tool: s.tool }); continue }
    if (s.tool === 'claude-plugin') {
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
      if (s.bin !== undefined && env.commandExists(s.bin)) {
        alreadyInstalled.push({ token: s.token, where: `PATH:${s.bin}` })
        continue
      }
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
    if (s.unavailable === true) continue
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
        group: 'skills-cli', cmd: 'npx', args: ['skills', 'add', source, '-g', '-y'],
        tokens: toInstall.map((t) => t.token), names: [], bareAdd: true, source, official: group[0]!.official, tier,
        globalDir: '~/.agents/skills',
      })
    } else {
      const names = toInstall.map((t) => t.skill ?? t.token)
      skillsCliCmds.push({
        group: 'skills-cli', cmd: 'npx',
        args: ['skills', 'add', source, ...names.flatMap((n) => ['--skill', n]), '-g', '-y'],
        tokens: toInstall.map((t) => t.token), names, bareAdd: false, source, official: group[0]!.official, tier,
        skillRequests: toInstall.map((t) => ({ token: t.token, name: t.skill ?? t.token, tier: t.tier })),
        globalDir: '~/.agents/skills',
        listCmd: { cmd: 'npx', args: ['skills', 'add', source, '--list'] },
      })
    }
  }

  // Codex-first；每个 runtime 的 marketplace add 都严格先于其 plugin install。
  const commands = [
    ...codexMarketplaceAdds.values(), ...codexPluginCmds.values(),
    ...marketplaceAdds.values(), ...pluginCmds.values(),
    ...skillsCliCmds, ...npmCmds.values(),
  ]
  return { commands, alreadyInstalled, noInstall }
}

/** 计划呈现:分组列命令 + 官方/第三方 + 受影响全局目录 + 差集 + skills-cli 装哪几个列出可见。 */
function renderSkillsPlan(deps: CliDeps, plan: SkillsPlan): void {
  const dirs = [...new Set(plan.commands.map((c) => c.globalDir))]
  deps.io.out(
    `[setup skills] 技能安装计划 —— 待装 ${plan.commands.length} 条命令 / 已装跳过 ${plan.alreadyInstalled.length} / ` +
      `无需或上游不可安装 ${plan.noInstall.length}`,
  )
  if (dirs.length > 0) deps.io.out(`  受影响全局目录:${dirs.join('、')}`)

  const sections: Array<[CmdGroup, string]> = [
    ['codex-marketplace-add', 'Codex 插件 · marketplace add'],
    ['codex-plugin', 'Codex 插件安装'],
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

/** 分组逐条执行（注入 exec）:skills-cli 先 `--list` 核 id 记漂移,再装;单条失败记入汇总不 abort 其余。
 * 非 bare 的 skills-cli 即使命令 exit 0，也须逐项确认真实用户级安装目录已出现；上游 CLI 会在
 * 部分 `--skill` 名不存在时仍安装其余子集并 exit 0，不能据此把整组冒充成功。 */
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
      if (r.code !== 0) {
        out.failures.push({ cmd: c, detail: r.stderr.trim() !== '' ? r.stderr.trim() : `退出码 ${r.code}` })
        continue
      }
      const missing = (c.skillRequests ?? []).filter((request) => !skillInstalled(env, request.name))
      if (missing.length > 0) {
        let tier: SkillTier = 'optional'
        for (const request of missing) tier = higherTier(tier, request.tier)
        out.failures.push({
          cmd: {
            ...c,
            tier,
            tokens: missing.map((request) => request.token),
            names: missing.map((request) => request.name),
            skillRequests: missing,
          },
          detail: `安装命令 exit 0，但用户级技能目录仍缺失：${missing.map((request) => request.name).join('、')}`,
        })
      } else {
        out.successes.push(c)
      }
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
  /** Codex CLI 缺省登录目录；测试缺省不注入，避免读取开发机真实凭证态。 */
  defaultCodexHome?: string
  /** 默认目录 auth.json 可读探针；只回布尔，绝不读/回凭证内容。 */
  canReadFile?: (path: string) => boolean
  /** 配置镜像解析（同 afk run 口径:.pipeline/automation.json 的 image ?? 内置 sandcastle:local）。 */
  resolveImage: (cwd: string) => string
}

export const REAL_RUNTIME_ENV: RuntimeEnv = {
  exec: nodeExecDocker,
  hostEnv: process.env,
  defaultCodexHome: join(homedir(), '.codex'),
  canReadFile: (path) => {
    try {
      accessSync(path, fsConstants.R_OK)
      return true
    } catch {
      return false
    }
  },
  resolveImage: (cwd) => readAutomationJson(cwd).image ?? 'sandcastle:local',
}

const READY_TAG = '[就绪]'
const MISS_TAG = '[缺失]'

/** 凭证灯人读串:已配标 source（宿主 env/secrets 文件），永不回显值。 */
function credSource(light: CredLight): string {
  const source = light.source === 'host-env'
    ? '宿主 env'
    : light.source === 'default-home'
      ? '默认 ~/.codex 登录'
      : 'secrets 文件'
  return `已配（${source}）`
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
  const codexKey = r.credentials.codex.OPENAI_API_KEY
  const codexHome = r.credentials.codex.CODEX_HOME
  if (!codexKey.set && codexHome.set) {
    deps.io.out(`  ${READY_TAG} codex 凭证 ${credSource(codexHome)}（OPENAI_API_KEY 非必需）`)
  } else {
    emitCredLine(deps, 'codex', 'OPENAI_API_KEY', codexKey, true, '', PREREQ_HINTS.openaiKey)
    emitCredLine(deps, 'codex', 'CODEX_HOME', codexHome, false, '（可选,缺省 ~/.codex）')
  }

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
  const readiness = await probeAfkReadiness({
    image,
    exec: rt.exec,
    secretsEnv,
    hostEnv: rt.hostEnv,
    defaultCodexHome: rt.defaultCodexHome,
    canReadFile: rt.canReadFile,
  })
  renderRuntimeReadiness(deps, readiness, opts.dryRun ?? false)
  return 0
}

/**
 * `pipeline setup [sub]` —— 安装后全功能就绪引导。
 *   空 sub:必须显式指定一个 host（如 `--codex`）。先验证/部署该 host（绝不双装）→ PATH/adapter →
 *          内置技能完整性 → 运行时就绪清单。`setup skills`/`setup runtime` 仍保留为兼容诊断子命令。
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
  installer: RuntimeInstaller = REAL_RUNTIME_INSTALLER,
  dashboardStarter: ReleasedDashboardStarter = REAL_RELEASED_DASHBOARD_STARTER,
): number | Promise<number> {
  const o: SetupOpts = { ...opts, dryRun: opts.dryRun ?? false, yes: opts.yes ?? false, autoUpdate: opts.autoUpdate ?? false }
  switch (sub) {
    case undefined:
    case '': {
      const selection = selectPipelineHost(o)
      if (selection.host === null) {
        deps.io.err(`ERROR: ${selection.error}。示例：pipeline setup --codex`)
        return 1
      }
      const host = selection.host
      const finish = (hostCode: number): number | Promise<number> => {
        if (hostCode !== 0) return hostCode
        // 全流程一条命令:所选 host → 内置技能验证 → 运行时就绪清单。
        // 运行时段 dry-run **只提示不真探测**（避免 buildProgram 单测经空 sub 起真 docker 子进程）;
        // 非 dry-run 才经注入 rt 真探测。技能段先同步跑完再接运行时异步段,故非 dry-run 返 Promise。
        printPlanSkeleton(deps, o, host)
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
      const hostCode = cmdSetupHost(deps, host, o, env, installer, dashboardStarter)
      return typeof hostCode === 'number' ? finish(hostCode) : hostCode.then(finish)
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
