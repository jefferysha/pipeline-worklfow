import { dirname, join, resolve } from 'node:path'
import { readAutomationJson } from '@tenon/automation'
import { PREREQ_HINTS } from '@tenon/kernel'
import { errMsg, type CliDeps } from '../deps.js'
import { nodeExecDocker, probeAfkReadiness, type AfkReadiness, type CredLight, type ExecDockerFn } from '../afkReadiness.js'
import { REAL_RUNTIME_INSTALLER, type RuntimeInstaller } from '../runtime/installer.js'
import { resolveRuntimePaths } from '../runtime/paths.js'
import { loadSkillSources, type SkillSource, type SkillSourcesResult, type SkillTier } from '../skillSources.js'
import {
  type ReleasedDashboardStarter,
} from './dashboard.js'
import { REAL_RELEASED_DASHBOARD_STARTER } from './released-dashboard-starter.js'
import {
  hostFlag,
  isNativePipelineHost,
  nativeInstallPlan,
  parseHostPluginInventory,
  selectPipelineHost,
  type NativePipelineHost,
  type ParsedHostPluginInventory,
  type PipelineHost,
  type PipelineHostFlags,
} from './plugin-host.js'
import { publishSetupManagedRuntime } from './setup-managed-runtime.js'
import { runManagedHostCommand } from './managed-host-command.js'
import type { ManagedHostPreparationContext } from './release-coordinator.js'
import { migrateLegacyProjectRegistry } from '../migration/legacy-project-registry.js'
import {
  finalizePendingHostPluginConflict,
  readHostPluginConvergenceReceipt,
  recordPendingHostPluginConflict,
} from './host-plugin-convergence.js'

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
import { bindNativeHostCommand } from './native-host-command-binding.js'
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
  /** Authoritative enabled ids from the same inventory snapshot that resolved `root`. */
  readonly inventory: ParsedHostPluginInventory
  readonly inventoryRaw: string
}

class NativePluginInventoryError extends Error {
  override readonly name = 'NativePluginInventoryError'
}

/**
 * `setup` is idempotent: if the host already owns a complete, verified package,
 * reuse that exact host-resolved root.  `tenon update --<host>` remains the
 * explicit release-refresh operation.  An incomplete/corrupt existing package
 * is never trusted; setup falls through to the release marketplace plan.
 */
async function verifiedInstalledNativePlugin(
  deps: CliDeps,
  env: SetupEnv,
  host: NativePipelineHost,
  transaction: ManagedHostPreparationContext,
): Promise<NativePluginCandidate | null> {
  const inventoryCommand = nativeInstallPlan(host).at(-1)
  if (inventoryCommand === undefined) return null
  deps.io.out(`[setup] $ ${commandText(inventoryCommand.cmd, inventoryCommand.args)}`)
  const inventory = await runManagedHostCommand(
    transaction,
    'inventory-before',
    env,
    inventoryCommand,
  )
  if (inventory.code !== 0) {
    throw new NativePluginInventoryError(
      `宿主 plugin inventory 读取失败：${inventory.stderr.trim() || inventory.stdout.trim() || `退出码 ${inventory.code}`}`,
    )
  }
  const parsed = parseHostPluginInventory(host, inventory.stdout)
  if (parsed === null) throw new NativePluginInventoryError('宿主 plugin inventory 响应畸形')
  const root = parsed.tenonRoot
  if (root === null) return null
  if (verifyPackagedAssets(deps, env, root, false, true) !== 0) {
    deps.io.out(`[setup] ${hostFlag(host)} 已登记的 tenon 不完整或未通过校验；将重新安装正式 release。`)
    return null
  }
  deps.io.out(`[setup] ${hostFlag(host)} 已有完整且已验证的 tenon；复用宿主登记的安装。`)
  return { root, verified: true, inventory: parsed, inventoryRaw: inventory.stdout }
}

async function installNativePlugin(
  deps: CliDeps,
  env: SetupEnv,
  host: NativePipelineHost,
  transaction: ManagedHostPreparationContext,
): Promise<NativePluginCandidate | null> {
  let existing: NativePluginCandidate | null
  try {
    existing = await verifiedInstalledNativePlugin(deps, env, host, transaction)
  } catch (error) {
    if (error instanceof NativePluginInventoryError) {
      deps.io.err(`ERROR: ${error.message}；未执行安装或清理。`)
      return null
    }
    throw error
  }
  if (existing !== null) return existing
  const plan = nativeInstallPlan(host)
  let inventory = ''
  for (let index = 0; index < plan.length; index += 1) {
    const item = plan[index]
    if (!item) continue
    deps.io.out(`[setup] $ ${commandText(item.cmd, item.args)}`)
    const stepId = index === 0
      ? 'marketplace-register'
      : index === 1
        ? 'plugin-install'
        : 'inventory-after'
    const result = await runManagedHostCommand(transaction, stepId, env, item)
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
      const inventoryResult = await runManagedHostCommand(
        transaction,
        'inventory-after',
        env,
        inventoryCommand,
      )
      const parsed = inventoryResult.code === 0
        ? parseHostPluginInventory(host, inventoryResult.stdout)
        : null
      if (parsed?.tenonRoot !== null && parsed?.tenonRoot !== undefined) {
        deps.io.out(`[setup] ${hostFlag(host)} 已有 tenon，复用宿主登记的安装。`)
        return {
          root: parsed.tenonRoot,
          verified: false,
          inventory: parsed,
          inventoryRaw: inventoryResult.stdout,
        }
      }
    }

    deps.io.err(
      `ERROR: ${commandText(item.cmd, item.args)} 失败：${result.stderr.trim() || result.stdout.trim() || `退出码 ${result.code}`}`,
    )
    return null
  }
  const parsed = parseHostPluginInventory(host, inventory)
  if (parsed === null) {
    deps.io.err(`ERROR: ${hostFlag(host)} 插件清单响应畸形；未切换 launcher。`)
    return null
  }
  if (parsed.tenonRoot === null) {
    deps.io.err(`ERROR: ${hostFlag(host)} 插件清单中没有 tenon；未切换 launcher。`)
    return null
  }
  return {
    root: parsed.tenonRoot,
    verified: false,
    inventory: parsed,
    inventoryRaw: inventory,
  }
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
    const hostBinding = env.resolveHostCommand(host)
    if (hostBinding === undefined) {
      deps.io.err(`ERROR: ${host} CLI 不在可信的绝对 PATH 项中；未执行宿主或 Tenon 状态变更。`)
      return 1
    }
    const lifecycleEnv = bindNativeHostCommand(env, host, hostBinding)
    return (async () => {
      const convergence = readHostPluginConvergenceReceipt(lifecycleEnv, host)
      if (convergence.state === 'invalid') {
        deps.io.err(`ERROR: ${convergence.detail}；未执行新的 marketplace/runtime 变更。`)
        return 1
      }
      if (convergence.state === 'receipt' && convergence.receipt.state === 'cleanup-pending') {
        const finalized = await finalizePendingHostPluginConflict(deps, lifecycleEnv, installer, host, convergence.receipt)
        if (finalized.state === 'failed') {
          deps.io.err(`ERROR: 冲突插件官方清理失败：${finalized.detail}`)
          return 1
        }
        // waiting/completed 都是本次 setup 的完整动作；不要在同一调用继续刷新或再发布候选。
        return 0
      }

      const runtimeCode = await publishSetupManagedRuntime(
        deps,
        lifecycleEnv,
        installer,
        async (transaction) => {
          const candidate = await installNativePlugin(deps, lifecycleEnv, host, transaction)
          if (candidate === null) throw new Error('宿主插件未能解析为可发布候选')
          const assetCode = candidate.verified ? 0 : verifyPackagedAssets(deps, lifecycleEnv, candidate.root, false)
          if (assetCode !== 0) throw new Error('宿主候选未通过插件资产校验')
          if (host === 'codex') {
            // Hook migration owns its own idempotent file transaction; it is not a host CLI
            // mutation and therefore must not masquerade as a host-inventory WAL checkpoint.
            const migrationCode = migrateLegacyCodexHooks(deps, lifecycleEnv)
            if (migrationCode !== 0) throw new Error('旧 Codex hook 迁移失败')
          }
          return {
            candidateRoot: candidate.root,
            evidence: candidate.inventoryRaw,
          }
        },
        host,
        dashboardStarter,
        openDashboard,
        (activation, candidate, transactionId) => {
          const inventory = candidate.evidence === undefined
            ? null
            : parseHostPluginInventory(host, candidate.evidence)
          if (inventory === null) {
            deps.io.err('ERROR: journal 中的宿主 inventory evidence 无效；拒绝提交收敛 receipt。')
            return false
          }
          return recordPendingHostPluginConflict(
            deps,
            lifecycleEnv,
            host,
            inventory,
            activation,
            candidate.candidateRoot,
            transactionId,
          )
        },
      )
      if (runtimeCode !== 0) return runtimeCode
      const migrateProjectRegistry = lifecycleEnv.migrateProjectRegistry ?? migrateLegacyProjectRegistry
      const migrated = await migrateProjectRegistry({
        homeDir: lifecycleEnv.homeDir(),
        platform: process.platform,
        env: lifecycleEnv.runtimeEnv(),
        readText: lifecycleEnv.readText,
        pathExists: lifecycleEnv.pathExists,
      })
      if (migrated.discovered > 0 || migrated.rejected > 0) {
        deps.io.out(
          `[setup] 旧项目注册表迁移：发现 ${migrated.discovered}，新增 ${migrated.imported}，`
          + `拒绝 ${migrated.rejected}；后续只读取 Tenon 产品域。`,
        )
      }
      if (host === 'codex') printCodexHookTrust(deps)
      return configureAutoUpdate(deps, lifecycleEnv, host, opts.autoUpdate === true)
    })()
  } else {
    const root = resolvePipelineRoot(env)
    const assetCode = verifyPackagedAssets(deps, env, root, false)
    if (assetCode !== 0) return assetCode
    return publishSetupManagedRuntime(
      deps,
      env,
      installer,
      () => ({ candidateRoot: root }),
      host,
      dashboardStarter,
      openDashboard,
    ).then((runtimeCode) => {
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
