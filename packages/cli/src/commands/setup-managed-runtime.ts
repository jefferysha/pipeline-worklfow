import type { CliDeps } from '../deps.js'
import type { RuntimeInstaller } from '../runtime/installer.js'
import type { RuntimeActivation } from '../runtime/types.js'
import { TENON_RELEASE_VERSION } from './plugin-host.js'
import type { SetupEnv } from './setupEnvironment.js'
import { DEFAULT_DASHBOARD_PORT, type ReleasedDashboardStarter } from './dashboard.js'
import { parseDashboardPort } from './dashboard-launch-options.js'
import { hostFlag, isNativePipelineHost, type PipelineHost } from './plugin-host.js'
import {
  publishManagedRelease,
  type ManagedHostPreparationContext,
} from './release-coordinator.js'
import { resolveStableTagTarget, type StableReleaseTarget } from './stable-release.js'

export interface PreparedSetupCandidate {
  readonly candidateRoot: string
  readonly evidence?: string
}

export async function publishSetupManagedRuntime(
  deps: CliDeps,
  env: SetupEnv,
  installer: RuntimeInstaller,
  prepareCandidate: (
    transaction: ManagedHostPreparationContext,
  ) => PreparedSetupCandidate | Promise<PreparedSetupCandidate>,
  host: PipelineHost,
  dashboardStarter: ReleasedDashboardStarter | undefined,
  openDashboard: boolean,
  afterReady?: (
    activation: RuntimeActivation,
    candidate: PreparedSetupCandidate,
    transactionId: string,
    stableTarget?: StableReleaseTarget,
  ) => boolean | Promise<boolean>,
  revalidateCandidate?: (
    candidate: PreparedSetupCandidate,
    stableTarget?: StableReleaseTarget,
  ) => void | Promise<void>,
): Promise<number> {
  const source = isNativePipelineHost(host) ? host : 'adapter'
  const dashboardPort = parseDashboardPort(env.runtimeEnv().TENON_DASHBOARD_PORT)
  const outcome = await publishManagedRelease(
    deps,
    {
      operation: isNativePipelineHost(host) ? 'setup' : 'adapter',
      source,
      ...(isNativePipelineHost(host)
        ? {
            expectedPluginVersion: deps.pluginVersion ?? TENON_RELEASE_VERSION,
            requiresStableTarget: true,
            resolveStableTargetBeforeRecovery: () =>
              resolveStableTagTarget(env, deps.pluginVersion ?? TENON_RELEASE_VERSION),
            proveFrozenTarget: (frozen: StableReleaseTarget) => {
              const proven = resolveStableTagTarget(env, frozen.version)
              if (proven.tag !== frozen.tag || proven.commit !== frozen.commit) {
                throw new Error(
                  `稳定标签 ${frozen.tag} 当前证明 ${proven.commit} 与冻结 commit ${frozen.commit} 不一致`,
                )
              }
            },
          }
        : {}),
      runtime: {
        homeDir: env.homeDir(),
        env: env.runtimeEnv(),
        ...(isNativePipelineHost(host)
          ? { trustedBashPath: env.resolveTrustedCommand?.('bash') }
          : {}),
      },
      openBrowser: openDashboard,
      ...(dashboardPort === null ? {} : { dashboardPort }),
      prepareCandidate,
      ...(revalidateCandidate === undefined
        ? {}
        : {
            revalidateCandidate: (
              candidate: PreparedSetupCandidate,
              context: { readonly stableTarget?: StableReleaseTarget },
            ) => revalidateCandidate(candidate, context.stableTarget),
          }),
      ...(afterReady === undefined
        ? {}
        : {
            commitReadyEvidence: (
              activation: RuntimeActivation,
              candidate: PreparedSetupCandidate,
              transactionId: string,
              context: { readonly stableTarget?: StableReleaseTarget },
            ) => (async () => {
              if (!await afterReady(activation, candidate, transactionId, context.stableTarget)) {
                throw new Error('宿主插件收敛 receipt 未能持久化')
              }
            })(),
          }),
    },
    installer,
    dashboardStarter,
  )
  if (!outcome.ok) {
    deps.io.err(`ERROR: ${outcome.detail}`)
    if (isNativePipelineHost(host)) {
      deps.io.err(
        `[setup] ${hostFlag(host)} 宿主插件登记由宿主 CLI 独立管理；`
        + 'Tenon 不直接覆盖或回滚宿主私有缓存，仅补偿自己的 managed transaction；'
        + '未完成的宿主阶段由 durable journal 幂等恢复。',
      )
    }
    return 1
  }
  if (outcome.state === 'current') {
    deps.io.out('[setup] 宿主、managed runtime 与 Dashboard 已精确就绪；未重复发布。')
    return 0
  }
  const { activation } = outcome
  deps.io.out(`[setup] 已发布已验证 runtime: ${activation.release.releaseId}（revision ${activation.selection.revision}）。`)
  deps.io.out('[setup] 稳定入口已就绪：~/.local/bin/tenon 与 ~/.local/bin/tenon-hook 不再直连 marketplace checkout。')
  if (!openDashboard) {
    const port = dashboardPort ?? DEFAULT_DASHBOARD_PORT
    deps.io.out(`[dashboard] 已就绪：http://127.0.0.1:${port}/；如需打开：tenon dashboard --open`)
  }
  return 0
}
