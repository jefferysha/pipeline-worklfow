import { dirname, join } from 'node:path'
import type { CliDeps } from '../deps.js'
import type { RuntimeActivation } from '../runtime/types.js'
import type {
  ReleasedDashboardStartOutcome,
  ReleasedDashboardStarter,
} from './dashboard.js'

export type PreviousReleasedDashboardRestoreOutcome =
  | ReleasedDashboardStartOutcome
  | { readonly state: 'not-required' }

/** Restore the previous immutable Dashboard after managed activation compensation. */
export async function restorePreviousReleasedDashboard(
  deps: CliDeps,
  activation: RuntimeActivation,
  starter: ReleasedDashboardStarter,
  dashboardPort: number,
  restoreTransactionId: string,
  trustedNodePath?: string,
  verifyTrustedNode?: () => void,
): Promise<PreviousReleasedDashboardRestoreOutcome> {
  const previousRelease = activation.selection.previousRelease
  if (previousRelease === null) return { state: 'not-required' }
  const payloadRoot = join(dirname(activation.releaseRoot), previousRelease, 'payload')
  const outcome = await starter.start(deps, payloadRoot, {
    openBrowser: false,
    port: dashboardPort,
    transactionId: restoreTransactionId,
    ...(trustedNodePath === undefined ? {} : { trustedNodePath }),
    ...(verifyTrustedNode === undefined ? {} : { verifyTrustedNode }),
  })
  if (outcome.state !== 'ready') return outcome
  const ownership = outcome.session.ownership
  if (
    ownership.version !== 1
    || ownership.releaseId !== previousRelease
    || ownership.port !== dashboardPort
    || !Number.isSafeInteger(ownership.pid)
    || ownership.pid <= 0
    || !/^sha256-v1-[a-f0-9]{64}$/.test(ownership.stateScopeId)
    || ownership.transactionId !== restoreTransactionId
  ) {
    return {
      state: 'indeterminate',
      detail: 'previous Dashboard restore returned a mismatched ownership identity; '
        + 'coordinator did not signal an untrusted session',
    }
  }
  return outcome
}
