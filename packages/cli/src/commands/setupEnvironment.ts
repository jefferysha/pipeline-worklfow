import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { readAutomationJson } from '@tenon/automation'
import { PREREQ_HINTS, type ProductPathInput } from '@tenon/kernel'
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
import type {
  LegacyProjectRegistryMigrationInput,
  LegacyProjectRegistryMigrationResult,
} from '../migration/legacy-project-registry.js'

// ── 注入面（测试注入临时 HOME / spy;真实现 = node:fs + os.homedir）──────────────────

export interface SetupEnv {
  /** 用户 home（真实现 os.homedir();managed runtime 与稳定启动器定位锚）。 */
  homeDir(): string
  /** adapter 边界显式提供的进程环境；应用服务不得自行读取 process.env。 */
  runtimeEnv(): NonNullable<ProductPathInput['env']>
  /** $PLUGIN_ROOT / $CLAUDE_PLUGIN_ROOT（插件安装根）;未设 → null（dev 回退 selfPath）。 */
  pluginRoot(): string | null
  /** 本 CLI bundle 自身路径（真实现 resolve(process.argv[1]);pluginRoot 缺失时的 dev 回退源）。 */
  selfPath(): string
  /** lstat 存在性（软链本身也算存在）；用于已安装 skill / marketplace 的只读幂等检查。 */
  pathExists(path: string): boolean
  /** 读取用户级配置；缺失或不可读时返回 undefined，调用方不得猜测或覆盖其内容。 */
  readText(path: string): string | undefined
  /** 原子地区分“缺失”和“I/O 失败”；迁移事务不得从 readText 的 undefined 猜状态。 */
  readTextState(path: string):
    | { readonly state: 'ok'; readonly text: string }
    | { readonly state: 'missing' }
    | { readonly state: 'error'; readonly detail: string }
  /** mkdir -p。 */
  mkdirp(dir: string): void
  /** PATH 中是否已有可执行命令；只读探测，用于全局 npm 工具的幂等差集。 */
  commandExists(name: string): boolean
  /** 列目录直接子项名（仅目录/软链，缺目录/无权限 → []，fail-safe）——plugin-cache 双层扫用。 */
  listDir(dir: string): string[]
  /** 写入受控的用户级 Tenon 配置（自动更新 opt-in）。 */
  writeText(path: string, text: string): void
  /** 同目录临时文件 + rename，并以独占锁串行化受控事务 receipt。 */
  writeTextAtomic(path: string, text: string): void
  /**
   * setup 完成后执行一次性宿主注册表迁移。生产环境缺省走真实迁移器；
   * 测试环境必须显式注入，避免绕过 SetupEnv 的文件系统边界。
   */
  migrateProjectRegistry?(
    input: LegacyProjectRegistryMigrationInput,
  ): Promise<LegacyProjectRegistryMigrationResult>
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
  runtimeEnv: () => ({ ...process.env }),
  pluginRoot: () => {
    const r = process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT
    return r !== undefined && r.trim() !== '' ? r : null
  },
  selfPath: () => {
    const candidate = resolve(process.argv[1] ?? '')
    // The user-facing launcher is a stable script under ~/.local/bin.  Follow the active process
    // path before deriving a dev fallback so `tenon dashboard` / `tenon update` never
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
  readTextState: (path) => {
    try {
      return { state: 'ok', text: readFileSync(path, 'utf8') }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      return code === 'ENOENT'
        ? { state: 'missing' }
        : { state: 'error', detail: errMsg(error) }
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
  writeTextAtomic: (path, text) => {
    const lockPath = `${path}.lock`
    const tempPath = `${path}.tmp-${process.pid}-${randomUUID()}`
    let lockFd: number | undefined
    try {
      lockFd = openSync(lockPath, 'wx', 0o600)
      writeFileSync(tempPath, text, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
      renameSync(tempPath, path)
    } finally {
      try { unlinkSync(tempPath) } catch { /* rename 已消费或写入未开始 */ }
      if (lockFd !== undefined) {
        closeSync(lockFd)
        try { unlinkSync(lockPath) } catch { /* 锁已经由持有者完成清理 */ }
      }
    }
  },
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
      // 故 `echo y | tenon setup` 这类管道输入同样会放行（非 TTY 不等于自动判 No）。
      const n = readSync(0, buf, 0, 64, null)
      const ans = buf.toString('utf8', 0, n).trim().toLowerCase()
      return ans === 'y' || ans === 'yes'
    } catch {
      return false // 读失败（无输入可读/fd 0 关闭等）→ 判 No，fail-closed（自动化走 --yes）
    }
  },
}

/**
 * 插件根优先取宿主注入；终端直接执行 bundle 时，从 dist/tenon.mjs 反推仓根。
 * 这样 `tenon update` 在宿主重新安装后可用刚解析出的候选根发布 managed runtime，
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
export function printPlanSkeleton(deps: CliDeps, opts: SetupOpts, host: PipelineHost): void {
  deps.io.out(`[setup] ${hostFlag(host)} 全功能就绪引导 —— 计划骨架`)
  deps.io.out('  1. 宿主安装:只验证/部署所选宿主，不会同时改动其他宿主。')
  deps.io.out('  2. 稳定入口:把已校验 release 原子发布到本机 runtime，再写 tenon / tenon-hook 启动器。')
  deps.io.out('  3. 内置技能:验证本插件随包的 default workflow skills；不拉第三方 marketplace。')
  deps.io.out('  4. 运行时检查:docker/镜像/两 runner 凭证就绪清单（本流程末尾直接跑;--dry-run 只提示见 tenon setup runtime）。')
  deps.io.out('  5. 全功能红黄绿汇总:安装后运行 tenon doctor --json 获取全机汇总。')
  if (opts.dryRun) deps.io.out('  （--dry-run:仅打印计划,不发布 runtime、不写任何文件）')
}

function autoUpdateConfigPath(env: SetupEnv): string {
  return join(resolveRuntimePaths({
    homeDir: env.homeDir(),
    env: env.runtimeEnv(),
  }).configRoot, 'auto-update.conf')
}

/** Native host only: write a tiny explicit preference consumed by hooks/auto-update.sh. */
export function configureAutoUpdate(deps: CliDeps, env: SetupEnv, host: PipelineHost, enabled: boolean): number {
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
export function printCodexHookTrust(deps: CliDeps): void {
  deps.io.out('[setup] Codex 已安装 Tenon hooks；为启用正常对话自动路由，请在 Codex 输入 /hooks，并信任 tenon。')
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
export function migrateLegacyCodexHooks(deps: CliDeps, env: SetupEnv): number {
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
  deps.io.out(`[setup] 已迁移 ${migration.removed} 个旧版 Codex hook；保留其余用户 hooks，由 tenon 插件统一接管。`)
  return 0
}

/** Verify a resolved plugin root before publishing it as a managed runtime or mutating an adapter target. */
import { execFileSync } from 'node:child_process'
import {
  accessSync, closeSync, constants as fsConstants, lstatSync, mkdirSync, openSync, readFileSync,
  readdirSync, readSync, realpathSync, renameSync, unlinkSync, writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
