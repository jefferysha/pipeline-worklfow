import { execFileSync } from 'node:child_process'
import { machineStateScopeId } from '@tenon/kernel'
import type { DoctorCheck } from './doctor-check.js'
import { green, red } from './doctor-check.js'
import type { DoctorProbes, DoctorProductIdentity } from '../deps.js'
import type { RuntimeInstaller } from '../runtime/installer.js'
import type { RuntimeScopeSnapshot } from '../runtime/scope.js'
import { resolveCommandOnPath } from './commandExists.js'
import { probeHealthyDashboard } from './dashboard-health.js'
import { parseDashboardPort } from './dashboard-launch-options.js'
import { DEFAULT_DASHBOARD_PORT } from './dashboard.js'
import { parseHostPluginInventory, TENON_RELEASE_VERSION } from './plugin-host.js'

export async function checkProductIdentity(p: DoctorProbes): Promise<DoctorCheck> {
  const identity = await p.productIdentity()
  if (identity.state === 'unavailable') {
    return red(
      'identity:release',
      `无法证明发布身份: ${identity.detail}`,
      '重新运行 tenon setup --<host> 或 tenon update，使宿主、runtime 与 Dashboard 收敛到同一发布版本',
    )
  }
  const exact = identity.hostPluginVersion === identity.expectedVersion
    && identity.runtimePluginVersion === identity.expectedVersion
    && identity.dashboardServerVersion === identity.expectedVersion
    && identity.dashboardReleaseId === identity.runtimeReleaseId
  const detail = [
    `expected=${identity.expectedVersion}`,
    `host=${identity.hostPluginVersion ?? 'missing'}`,
    `runtime=${identity.runtimePluginVersion}`,
    `dashboard=${identity.dashboardServerVersion ?? 'missing'}`,
    `release=${identity.dashboardReleaseId ?? 'missing'}/${identity.runtimeReleaseId}`,
  ].join('; ')
  return exact
    ? green('identity:release', `${identity.host} 发布身份一致（${detail}）`)
    : red(
        'identity:release',
        `发布身份漂移（${detail}）`,
        `运行 tenon update --${identity.host}，不要从 main 或源码目录直接启动`,
      )
}

export function createDoctorProductIdentityProbe(
  runtimeScope: () => RuntimeScopeSnapshot,
  installer: RuntimeInstaller,
): () => Promise<DoctorProductIdentity> {
  return async () => {
    const scope = runtimeScope()
    try {
      const trustedBashPath = resolveCommandOnPath('bash', {
        pathValue: scope.env.PATH,
        platform: process.platform,
        requireAbsolutePathEntries: true,
      })
      if (trustedBashPath === undefined) {
        return { state: 'unavailable', detail: '可信 Bash 不可执行' }
      }
      const inspection = await installer.inspect({
        homeDir: scope.homeDir,
        env: scope.env,
        trustedBashPath,
      })
      const active = inspection.activeValid ? inspection.active : null
      const host = active?.source.host
      if (active === null || (host !== 'codex' && host !== 'claude')) {
        return { state: 'unavailable', detail: '没有可验证的 native managed runtime' }
      }
      const executable = resolveCommandOnPath(host, {
        pathValue: scope.env.PATH,
        platform: process.platform,
        requireAbsolutePathEntries: true,
      })
      if (executable === undefined) {
        return { state: 'unavailable', detail: `${host} 宿主不可执行` }
      }
      const inventory = parseHostPluginInventory(host, execFileSync(executable, ['plugin', 'list', '--json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 5_000,
      }))
      if (inventory === null) {
        return { state: 'unavailable', detail: '宿主返回畸形插件清单' }
      }
      const port = parseDashboardPort(scope.env.TENON_DASHBOARD_PORT) ?? DEFAULT_DASHBOARD_PORT
      const dashboard = await probeHealthyDashboard(
        port,
        active.releaseId,
        machineStateScopeId(scope.paths.stateRoot),
        { observeAnyTransaction: true },
      )
      return {
        state: 'native',
        expectedVersion: TENON_RELEASE_VERSION,
        host,
        hostPluginVersion: inventory.tenonVersion,
        runtimePluginVersion: active.source.pluginVersion,
        runtimeReleaseId: active.releaseId,
        dashboardServerVersion: dashboard?.serverVersion ?? null,
        dashboardReleaseId: dashboard?.releaseId ?? null,
      }
    } catch {
      return { state: 'unavailable', detail: '发布身份探针失败' }
    }
  }
}
