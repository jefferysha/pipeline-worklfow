import { dirname, join, resolve } from 'node:path'
import { readAutomationJson } from '@tenon/automation'
import { PREREQ_HINTS } from '@tenon/kernel'
import { errMsg, type CliDeps } from '../deps.js'
import { nodeExecDocker, probeAfkReadiness, type AfkReadiness, type CredLight, type ExecDockerFn } from '../afkReadiness.js'
import { REAL_RUNTIME_INSTALLER, type RuntimeInstaller } from '../runtime/installer.js'
import { resolveRuntimePaths } from '../runtime/paths.js'
import { loadSkillSources, type SkillSource, type SkillSourcesResult, type SkillTier } from '../skillSources.js'
import {
  REAL_RELEASED_DASHBOARD_STARTER,
  type ReleasedDashboardStarter,
} from './dashboard.js'
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
import { publishManagedRelease } from './release-coordinator.js'

// ── 注入面（测试注入临时 HOME / spy;真实现 = node:fs + os.homedir）──────────────────

import {
  configureAutoUpdate,
  migrateLegacyCodexHooks,
  printCodexHookTrust,
  REAL_SETUP_ENV,
  resolvePipelineRoot,
  type SetupEnv,
  type SetupOpts,
} from './setupEnvironment.js'
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
  if (!env.pathExists(join(root, 'runtime', 'tenon-bootstrap.mjs'))) {
    if (!silent) deps.io.err('ERROR: 插件资产校验失败：缺少 runtime/tenon-bootstrap.mjs（该 marketplace release 不是完整可安装包）')
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
 * reuse that exact host-resolved root.  `tenon update --<host>` remains the
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
    deps.io.out(`[setup] ${hostFlag(host)} 已登记的 tenon 不完整或未通过校验；将重新安装正式 release。`)
    return null
  }
  deps.io.out(`[setup] ${hostFlag(host)} 已有完整且已验证的 tenon；复用宿主登记的安装。`)
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
    const item = plan[index]
    if (!item) continue
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
      const inventoryCommand = plan.at(-1)
      if (!inventoryCommand) {
        deps.io.err(`[setup] ${hostFlag(host)} 安装计划缺少 inventory 命令。`)
        return null
      }
      const inventoryResult = env.runCommand(inventoryCommand.cmd, [...inventoryCommand.args])
      const existingRoot = inventoryResult.code === 0
        ? installedPipelineRoot(host, inventoryResult.stdout)
        : null
      if (existingRoot !== null) {
        deps.io.out(`[setup] ${hostFlag(host)} 已有 tenon，复用宿主登记的安装。`)
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
    deps.io.err(`ERROR: ${hostFlag(host)} 插件清单中没有 tenon；未切换 launcher。`)
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
  return publishManagedRelease(
    deps,
    {
      candidateRoot,
      source,
      homeDir: env.homeDir(),
      openBrowser: openDashboard,
    },
    installer,
    dashboardStarter,
  ).then((outcome) => {
    if (!outcome.ok) {
      deps.io.err(`ERROR: ${outcome.detail}`)
      if (isNativePipelineHost(host)) {
        deps.io.err(
          `[setup] ${hostFlag(host)} 宿主插件登记由宿主 CLI 独立管理；` +
          'Tenon 未读取、复制或回滚宿主私有缓存，仅补偿自己的 managed transaction。',
        )
      }
      return 1
    }
    const { activation } = outcome
    deps.io.out(`[setup] 已发布已验证 runtime: ${activation.release.releaseId}（revision ${activation.selection.revision}）。`)
    deps.io.out('[setup] 稳定入口已就绪：~/.local/bin/tenon 与 ~/.local/bin/tenon-hook 不再直连 marketplace checkout。')
    return 0
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
    deps.io.err(`ERROR: ${hostFlag(host)} 是 adapter，自动更新由承载它的 Codex 或 Claude 插件负责；请改用 tenon setup --codex --auto-update 或 --claude --auto-update。`)
    return 1
  }

  if (opts.dryRun) {
    if (isNativePipelineHost(host)) {
      deps.io.out(`[setup] ${hostFlag(host)}:将安装本仓 marketplace 中的唯一 tenon 插件。`)
      for (const item of nativeInstallPlan(host)) deps.io.out(`[setup] $ ${commandText(item.cmd, item.args)}`)
      deps.io.out('[setup] 将用宿主插件清单解析候选根，校验并原子发布 managed runtime；不会直连可变 checkout。')
      if (host === 'codex') deps.io.out('[setup] 安装后需在 Codex 输入 /hooks 并信任 tenon，正常对话路由才会启用。')
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
