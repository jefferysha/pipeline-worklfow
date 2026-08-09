import type { CliDeps } from '../deps.js'
import type { ManagedDashboardIdentity } from '../runtime/installer.js'
import { DashboardTerminationUnconfirmedError } from './dashboard-process.js'

export type ReleasedDashboardStopOutcome =
  | { readonly state: 'stopped' }
  | { readonly state: 'indeterminate'; readonly detail: string }

export interface ReleasedDashboardSession {
  readonly ownership: ManagedDashboardIdentity
  /** Stops only the exact listener whose release/state/PID identity still matches. */
  stop(): Promise<ReleasedDashboardStopOutcome>
}

export function releasedDashboardSession(
  deps: CliDeps,
  ownership: ManagedDashboardIdentity,
  stopOwned: (identity: ManagedDashboardIdentity) => Promise<boolean>,
): ReleasedDashboardSession {
  let stopped = false
  return {
    ownership,
    stop: async () => {
      if (stopped) return { state: 'stopped' }
      try {
        if (!await stopOwned(ownership)) {
          throw new DashboardTerminationUnconfirmedError(
            `Dashboard pid=${ownership.pid} 的 listener 终止未获证明`,
          )
        }
        stopped = true
        return { state: 'stopped' }
      } catch (error) {
        const terminationDetail = error instanceof Error ? error.message : String(error)
        deps.io.err(`[dashboard] 候选进程终止状态无法确认：${terminationDetail}`)
        return {
          state: 'indeterminate',
          detail: error instanceof DashboardTerminationUnconfirmedError
            ? error.message
            : new DashboardTerminationUnconfirmedError(terminationDetail).message,
        }
      }
    },
  }
}
