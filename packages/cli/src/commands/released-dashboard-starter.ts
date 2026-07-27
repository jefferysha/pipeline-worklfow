import type { ManagedDashboardIdentity } from '../runtime/installer.js'
import {
  DEFAULT_DASHBOARD_PORT,
  REAL_DASHBOARD_RUNTIME,
  releasedDashboardSession,
  startReleasedDashboard,
  type DashboardRuntime,
  type ReleasedDashboardStarter,
} from './dashboard.js'
import { dashboardPortOpen } from './dashboard-health.js'
import { sameManagedDashboardIdentity } from './managed-dashboard-identity.js'

export class DashboardInspectionUnverifiableError extends Error {
  constructor(port: number) {
    super(`Dashboard port ${port} 存在 listener，但 managed health identity 不可验证`)
    this.name = 'DashboardInspectionUnverifiableError'
  }
}

export function createReleasedDashboardStarter(
  runtime: DashboardRuntime,
): ReleasedDashboardStarter {
  return {
    inspect: async (_deps, opts) => {
      const port = opts.port ?? DEFAULT_DASHBOARD_PORT
      const stateScopeId = runtime.resolveStateScopeId()
      const identity = await runtime.probeHealthyServer(port, undefined, stateScopeId, '*')
      if (identity !== null && identity.releaseId !== 'unmanaged') {
        return identity as ManagedDashboardIdentity
      }
      if (!await dashboardPortOpen(port)) return null
      throw new DashboardInspectionUnverifiableError(port)
    },
    adopt: async (deps, identity) => {
      const current = await runtime.probeHealthyServer(
        identity.port,
        identity.releaseId,
        identity.stateScopeId,
        identity.transactionId,
      )
      if (current === null || !sameManagedDashboardIdentity(current, identity)) return null
      return releasedDashboardSession(deps, current, runtime.stopOwnedDashboard)
    },
    start: (deps, payloadRoot, opts) => startReleasedDashboard(deps, payloadRoot, opts, runtime),
  }
}

export const REAL_RELEASED_DASHBOARD_STARTER =
  createReleasedDashboardStarter(REAL_DASHBOARD_RUNTIME)
