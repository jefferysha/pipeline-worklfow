import type { ManagedDashboardIdentity } from '../runtime/installer.js'
import {
  DEFAULT_DASHBOARD_PORT,
  REAL_DASHBOARD_RUNTIME,
  releasedDashboardSession,
  startReleasedDashboard,
  type DashboardRuntime,
  type ReleasedDashboardStarter,
} from './dashboard.js'

export function createReleasedDashboardStarter(
  runtime: DashboardRuntime,
): ReleasedDashboardStarter {
  return {
    inspect: async (_deps, opts) => {
      const port = opts.port ?? DEFAULT_DASHBOARD_PORT
      const stateScopeId = runtime.resolveStateScopeId()
      const identity = await runtime.probeHealthyServer(port, undefined, stateScopeId, '*')
      return identity?.releaseId === 'unmanaged' ? null : identity as ManagedDashboardIdentity | null
    },
    adopt: async (deps, identity) => {
      const current = await runtime.probeHealthyServer(
        identity.port,
        identity.releaseId,
        identity.stateScopeId,
        identity.transactionId,
      )
      if (current === null
        || current.pid !== identity.pid
        || current.transactionId !== identity.transactionId) return null
      return releasedDashboardSession(deps, identity, runtime.stopOwnedDashboard)
    },
    start: (deps, payloadRoot, opts) => startReleasedDashboard(deps, payloadRoot, opts, runtime),
  }
}

export const REAL_RELEASED_DASHBOARD_STARTER =
  createReleasedDashboardStarter(REAL_DASHBOARD_RUNTIME)
