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
): Promise<PreviousReleasedDashboardRestoreOutcome> {
  const previousRelease = activation.selection.previousRelease
  if (previousRelease === null) return { state: 'not-required' }
  const payloadRoot = join(dirname(activation.releaseRoot), previousRelease, 'payload')
  return starter.start(deps, payloadRoot, { openBrowser: false })
}
