/**
 * Release update command for the one packaged Tenon plugin.
 *
 * Codex and Claude own their marketplace/cache lifecycles, so this command only asks the selected
 * host to refresh and reinstall its own plugin.  Other supported runtimes are adapters rather than
 * marketplaces; for them `update` deliberately re-applies the adapter from the already updated
 * package instead of falsely claiming to fetch a release from that host.
 */
import type { CliDeps } from '../deps.js'
import { REAL_RUNTIME_INSTALLER, type RuntimeInstaller } from '../runtime/installer.js'
import {
  inspectCandidatePayload,
  type CandidatePayloadIdentity,
} from '../runtime/release-store.js'
import {
  REAL_RELEASED_DASHBOARD_STARTER,
} from './released-dashboard-starter.js'
import type { ReleasedDashboardStarter } from './dashboard.js'
import {
  hostFlag,
  isNativePipelineHost,
  nativeUpdatePlan,
  parseHostPluginInventory,
  selectPipelineHost,
  type HostCommandPlanItem,
  type PipelineHost,
  type PipelineHostFlags,
} from './plugin-host.js'
import { cmdSetupHost, type SetupEnv, REAL_SETUP_ENV } from './setup.js'
import { bindNativeHostCommand } from './native-host-command-binding.js'
import { publishManagedRelease } from './release-coordinator.js'
import { parseDashboardPort } from './dashboard-launch-options.js'
import { runManagedHostCommand } from './managed-host-command.js'
import {
  finalizePendingHostPluginConflict,
  readHostPluginConvergenceReceipt,
  recordPendingHostPluginConflict,
} from './host-plugin-convergence.js'
import { printCodexAuthGuidance, renderDeferredCodexAuthLine } from '../codexAuth.js'
import {
  REAL_STABLE_RELEASE_RESOLVER,
  compareStableVersions,
  resolveStableTagTarget,
  type StableReleaseResolver,
  type StableReleaseTarget,
} from './stable-release.js'
import { nativeHostMatchesStableTarget } from './managed-host-observation.js'
import { DEFAULT_DASHBOARD_PORT } from './dashboard.js'
import { reportRegisteredProjects } from './update-project-report.js'
import { verifyUpdatedRoot } from './update-candidate-verification.js'

export interface UpdateOpts extends PipelineHostFlags {
  dryRun?: boolean
  yes?: boolean
  auto?: boolean
  target?: string
}

export { nativeUpdatePlan } from './plugin-host.js'

function renderPlan(deps: CliDeps, host: PipelineHost, plan: readonly HostCommandPlanItem[]): void {
  deps.io.out(`[update] ${hostFlag(host)} 发布更新计划（只更新所选宿主）`)
  for (const item of plan) deps.io.out(`  $ ${item.cmd} ${item.args.join(' ')}`)
}

/** Hosts differ on whether reinstalling an already-installed plugin is exit 0 or an idempotent error. */
function isAlreadyInstalledResult(result: { readonly stdout: string; readonly stderr: string }): boolean {
  return /already|exists|installed|duplicate/i.test(`${result.stdout}\n${result.stderr}`)
}

function rejectUpdate(
  installer: RuntimeInstaller,
  env: SetupEnv,
  detail: string,
): number | Promise<number> {
  const record = installer.recordUpdateFailure?.({
    homeDir: env.homeDir(),
    env: env.runtimeEnv(),
  }, detail)
  if (record === undefined) return 1
  return record.then(() => 1).catch(() => 1)
}

type HostBoundaryState = 'in-progress' | 'committed'
type ManagedBoundaryState = 'unchanged' | 'restored' | 'indeterminate'

function boundaryDetail(
  hostState: HostBoundaryState,
  managedState: ManagedBoundaryState,
  detail: string,
): string {
  return `host=${hostState}; managed=${managedState}; ${detail}`
}

function reportHostBoundary(deps: CliDeps, host: PipelineHost, state: HostBoundaryState): void {
  if (state === 'committed') {
    deps.io.err(
      `[update] 宿主插件缓存已由 ${host === 'codex' ? 'Codex' : 'Claude'} 更新；` +
      'Tenon 未回滚宿主私有缓存，当前会话仍使用其已加载版本。',
    )
    return
  }
  deps.io.err(
    `[update] ${hostFlag(host)} 宿主更新在 inventory 提交确认前失败；` +
    '宿主私有缓存状态由宿主 CLI 管理，Tenon 未直接写入或恢复该缓存。',
  )
}

export function cmdUpdate(
  deps: CliDeps,
  opts: UpdateOpts,
  env: SetupEnv = REAL_SETUP_ENV,
  installer: RuntimeInstaller = REAL_RUNTIME_INSTALLER,
  dashboardStarter: ReleasedDashboardStarter = REAL_RELEASED_DASHBOARD_STARTER,
  releaseResolver: StableReleaseResolver = REAL_STABLE_RELEASE_RESOLVER,
  candidateInspector: (root: string) => Promise<CandidatePayloadIdentity> = inspectCandidatePayload,
): number | Promise<number> {
  const selection = selectPipelineHost(opts)
  if (selection.host === null) {
    deps.io.err(`ERROR: ${selection.error}。示例：tenon update --codex`)
    return 1
  }
  const host = selection.host
  if (!isNativePipelineHost(host)) {
    deps.io.out(`[update] ${hostFlag(host)} 没有独立 marketplace；从当前已更新的 Tenon 包重新部署 adapter。`)
    return cmdSetupHost(deps, host, { ...opts, autoUpdate: false }, env, installer, dashboardStarter, false)
  }

  if (opts.dryRun) {
    const previewTarget: StableReleaseTarget = {
      version: '<latest-stable>',
      tag: '<latest-stable>',
      commit: '0'.repeat(40),
    }
    renderPlan(deps, host, nativeUpdatePlan(host, previewTarget))
    deps.io.out('[update] 执行时先只读解析并冻结官方 latest stable Release；dry-run 不联网。')
    deps.io.out('[update] --dry-run:未刷新 marketplace、未重装插件、未切换 launcher。')
    return 0
  }
  const hostBinding = env.resolveHostCommand(host)
  if (hostBinding === undefined) {
    if (host === 'codex') {
      printCodexAuthGuidance(deps.io, { state: 'unavailable', reason: 'cli-missing' })
    }
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
    // waiting/completed 都终止本次 update，避免同一调用继续刷新或发布另一个候选。
    return 0
  }

  let hostBoundary: HostBoundaryState = 'in-progress'
  const dashboardPort = parseDashboardPort(lifecycleEnv.runtimeEnv().TENON_DASHBOARD_PORT)
  const outcome = await publishManagedRelease(
    deps,
    {
      operation: 'update',
      source: host,
      requiresStableTarget: true,
      proveFrozenTarget: (frozen) => {
        const proven = resolveStableTagTarget(lifecycleEnv, frozen.version)
        if (proven.tag !== frozen.tag || proven.commit !== frozen.commit) {
          throw new Error(
            `稳定标签 ${frozen.tag} 当前证明 ${proven.commit} 与冻结 commit ${frozen.commit} 不一致`,
          )
        }
      },
      runtime: {
        homeDir: lifecycleEnv.homeDir(),
        env: lifecycleEnv.runtimeEnv(),
      },
      openBrowser: false,
      ...(dashboardPort === null ? {} : { dashboardPort }),
      prepareCandidate: async (transaction) => {
        const target = await transaction.resolveStableTarget(
          () => releaseResolver.resolve(lifecycleEnv),
          (frozen) => {
            const proven = resolveStableTagTarget(lifecycleEnv, frozen.version)
            if (proven.tag !== frozen.tag || proven.commit !== frozen.commit) {
              throw new Error(
                `稳定标签 ${frozen.tag} 当前证明 ${proven.commit} 与冻结 commit ${frozen.commit} 不一致`,
              )
            }
          },
        )
        deps.io.out(`[update] 已冻结稳定目标：${target.tag} @ ${target.commit}`)
        const beforeInventoryResult = lifecycleEnv.runCommand(host, ['plugin', 'list', '--json'])
        const beforeInventory = beforeInventoryResult.code === 0
          ? parseHostPluginInventory(host, beforeInventoryResult.stdout)
          : null
        if (beforeInventory === null) {
          throw new Error(
            `更新前宿主 plugin inventory 无法验证：`
            + `${beforeInventoryResult.stderr.trim() || `退出码 ${beforeInventoryResult.code}`}`,
          )
        }
        const runtime = await installer.inspect({
          homeDir: lifecycleEnv.homeDir(),
          env: lifecycleEnv.runtimeEnv(),
        })
        for (const [label, version] of [
          ['宿主 plugin', beforeInventory.tenonVersion],
          ['active managed runtime', runtime.activeValid ? runtime.active?.source.pluginVersion ?? null : null],
        ] as const) {
          if (version === null) continue
          let comparison: number
          try {
            comparison = compareStableVersions(version, target.version)
          } catch (error) {
            throw new Error(`${label} 版本无法参与稳定版本比较：${error instanceof Error ? error.message : String(error)}`)
          }
          if (comparison > 0) throw new Error(`拒绝从${label} ${version} 降级到 ${target.version}`)
        }
        const runtimeExact = runtime.activeValid
          && runtime.active !== null
          && runtime.selection.activeRelease === runtime.active.releaseId
          && runtime.active.source.host === host
          && runtime.active.source.pluginVersion === target.version
        const hostExact = beforeInventory.tenonRoot !== null
          && beforeInventory.tenonVersion === target.version
          && runtimeExact
          && nativeHostMatchesStableTarget(lifecycleEnv, host, target)
        if (hostExact && verifyUpdatedRoot(deps, lifecycleEnv, beforeInventory.tenonRoot, target.version)) {
          const candidateIdentity = await candidateInspector(beforeInventory.tenonRoot)
          if (candidateIdentity.pluginVersion === target.version
            && candidateIdentity.payloadDigest === runtime.active?.payloadDigest
            && nativeHostMatchesStableTarget(lifecycleEnv, host, target)) {
            const port = dashboardPort ?? DEFAULT_DASHBOARD_PORT
            const dashboard = await dashboardStarter.inspect(deps, { port, openBrowser: false })
            if (dashboard?.releaseId === runtime.active?.releaseId
              && dashboard.serverVersion === target.version) return { alreadyCurrent: true }
          }
        }
        const plan = nativeUpdatePlan(host, target)
        renderPlan(deps, host, plan)
        let inventory = ''
        for (let index = 0; index < plan.length; index += 1) {
          const item = plan[index]!
          const stepId = [
            'plugin-remove',
            'marketplace-remove',
            'marketplace-register',
            'plugin-install',
            'inventory-after',
          ][index]!
          const result = await runManagedHostCommand(transaction, stepId, lifecycleEnv, item, target)
          if (result.stdout.trim() !== '' && !opts.auto) deps.io.out(result.stdout.trimEnd())
          if (result.code !== 0) {
            // `plugin add` is the host's only cross-version reinstall primitive. Some host releases
            // report an idempotent existing install as non-zero; inventory is the sole proof.
            if (stepId === 'plugin-install' && isAlreadyInstalledResult(result)) {
              const inventoryItem = plan[plan.length - 1]!
              const inventoryResult = await runManagedHostCommand(
                transaction,
                'inventory-after',
                lifecycleEnv,
                inventoryItem,
              )
              const parsedInventory = inventoryResult.code === 0
                ? parseHostPluginInventory(host, inventoryResult.stdout)
                : null
              if (parsedInventory?.tenonRoot !== null && parsedInventory?.tenonRoot !== undefined) {
                inventory = inventoryResult.stdout
                break
              }
            }
            throw new Error(
              `${item.cmd} ${item.args.join(' ')} 失败：${result.stderr.trim() || `退出码 ${result.code}`}`,
            )
          }
          inventory = result.stdout
        }
        const parsedInventory = parseHostPluginInventory(host, inventory)
        if (parsedInventory === null) {
          throw new Error(`${hostFlag(host)} 更新后的宿主插件清单响应畸形；未切换 launcher。`)
        }
        const root = parsedInventory.tenonRoot
        if (root === null) {
          throw new Error(`${hostFlag(host)} 更新后未在宿主插件清单中找到 tenon；未切换 launcher。`)
        }
        hostBoundary = 'committed'
        if (parsedInventory.tenonVersion !== target.version) {
          throw new Error(
            `${hostFlag(host)} 更新后插件版本 ${parsedInventory.tenonVersion ?? 'unknown'} `
            + `与目标稳定版本 ${target.version} 不一致；未切换 launcher。`,
          )
        }
        let hostMatchesTarget = false
        try {
          hostMatchesTarget = nativeHostMatchesStableTarget(lifecycleEnv, host, target)
        } catch (error) {
          throw new Error(
            `更新后宿主目标 identity 无法验证：${error instanceof Error ? error.message : String(error)}`,
          )
        }
        if (!hostMatchesTarget) {
          throw new Error('更新后 marketplace/tag commit 与插件 inventory 未收敛到同一冻结稳定版本')
        }
        if (!verifyUpdatedRoot(deps, lifecycleEnv, root, target?.version)) {
          throw new Error('宿主刷新后的 tenon 候选未通过打包资产校验')
        }
        if (!nativeHostMatchesStableTarget(lifecycleEnv, host, target)) {
          throw new Error('候选校验后 marketplace/tag commit 发生漂移；拒绝激活')
        }
        return { candidateRoot: root, evidence: inventory }
      },
      commitReadyEvidence: (activation, candidate, transactionId) => {
        const parsedInventory = candidate.evidence === undefined
          ? null
          : parseHostPluginInventory(host, candidate.evidence)
        if (parsedInventory === null) throw new Error('journal 中的宿主 inventory evidence 无效')
        if (!recordPendingHostPluginConflict(
          deps,
          lifecycleEnv,
          host,
          parsedInventory,
          activation,
          candidate.candidateRoot,
          transactionId,
        )) throw new Error('宿主插件收敛 receipt 未能持久化')
      },
    },
    installer,
    dashboardStarter,
  )
  if (!outcome.ok) {
    deps.io.err(`ERROR: ${outcome.detail}`)
    reportHostBoundary(deps, host, hostBoundary)
    return await rejectUpdate(installer, lifecycleEnv, boundaryDetail(hostBoundary, outcome.state, outcome.detail))
  }
  const readyPort = dashboardPort ?? DEFAULT_DASHBOARD_PORT
  if (outcome.state === 'current') {
    const tag = outcome.stableTarget?.tag ?? 'latest stable'
    deps.io.out(`[update] ${tag} 已在宿主、managed runtime 与 Dashboard 精确生效；无需更新。`)
    deps.io.out(`[dashboard] 已就绪：http://127.0.0.1:${readyPort}/；如需打开：tenon dashboard --open`)
    return 0
  }
  const { activation } = outcome
  deps.io.out(`[update] 已原子切换至已验证 runtime: ${activation.release.releaseId}（revision ${activation.selection.revision}）。`)
  if (opts.auto) {
    deps.io.out(`[update] ${hostFlag(host)} 已在后台刷新；当前会话继续使用已加载版本，新会话将加载新 skills/hooks。`)
  } else {
    deps.io.out(`[update] ${hostFlag(host)} 已更新；稳定 tenon launcher 已保持不变，新会话将加载新 skills/hooks。`)
  }
  if (host === 'codex') {
    deps.io.out('[update] 若 Codex 将新版本 Tenon hook 标为未信任或已变更，请在 Codex 输入 /hooks 后重新信任；这是宿主的安全边界。')
    if (opts.auto) {
      deps.io.out(renderDeferredCodexAuthLine('后台更新未检查登录状态'))
    } else {
      const auth = await lifecycleEnv.codexAuthStatus(hostBinding.executable)
        .catch(() => ({ state: 'unavailable', reason: 'spawn-error' } as const))
      printCodexAuthGuidance(deps.io, auth)
    }
  }
  reportRegisteredProjects(deps, lifecycleEnv, activation.release.source.pluginVersion)
  deps.io.out(`[dashboard] 已就绪：http://127.0.0.1:${readyPort}/；如需打开：tenon dashboard --open`)
  return 0
  })()
}
