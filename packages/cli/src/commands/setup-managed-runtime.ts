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
  ) => boolean,
): Promise<number> {
  const source = isNativePipelineHost(host) ? host : 'adapter'
  const dashboardPort = parseDashboardPort(env.runtimeEnv().TENON_DASHBOARD_PORT)
  const outcome = await publishManagedRelease(
    deps,
    {
      operation: isNativePipelineHost(host) ? 'setup' : 'adapter',
      source,
      ...(isNativePipelineHost(host)
        ? { expectedPluginVersion: deps.pluginVersion ?? TENON_RELEASE_VERSION }
        : {}),
      runtime: {
        homeDir: env.homeDir(),
        env: env.runtimeEnv(),
      },
      openBrowser: openDashboard,
      ...(dashboardPort === null ? {} : { dashboardPort }),
      prepareCandidate,
      ...(afterReady === undefined
        ? {}
        : {
            commitReadyEvidence: (
              activation: RuntimeActivation,
              candidate: PreparedSetupCandidate,
              transactionId: string,
            ) => {
              if (!afterReady(activation, candidate, transactionId)) {
                throw new Error('宿主插件收敛 receipt 未能持久化')
              }
            },
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
