import type { CliDeps } from '../deps.js'
import {
  ManagedRuntimeIndeterminateError,
  type ManagedReleaseJournalRecord,
  type ManagedRuntimeTransaction,
} from '../runtime/installer.js'
import type { RuntimeActivation } from '../runtime/types.js'
import { DEFAULT_DASHBOARD_PORT, type ReleasedDashboardStarter } from './dashboard.js'
import { sameManagedDashboardCoordinates } from './managed-dashboard-identity.js'
import type { ManagedReleaseRequest } from './release-coordinator-contract.js'

const LEGACY_ADVANCED_PHASES = new Set<ManagedReleaseJournalRecord['phase']>([
  'runtime-activated',
  'starting-dashboard',
  'dashboard-ready',
  'evidence-committed',
])

const LEGACY_PHASES = new Set<ManagedReleaseJournalRecord['phase']>([
  'preparing-host',
  'candidate-resolved',
  'activating-runtime',
  'runtime-activated',
  'starting-dashboard',
  'dashboard-ready',
  'evidence-committed',
])

/** Exact decoded envelope written by v1.0.1 before stable targets and frozen Dashboard ports. */
export function isExactLegacyV101NativeJournal(
  request: Pick<
    ManagedReleaseRequest,
    'operation' | 'source' | 'requiresStableTarget' | 'expectedPluginVersion'
  >,
  journal: ManagedReleaseJournalRecord,
): boolean {
  if (request.requiresStableTarget !== true
    || request.operation !== 'setup'
    || (request.source !== 'codex' && request.source !== 'claude')
    || (journal.operation !== 'setup' && journal.operation !== 'update')
    || journal.source !== request.source
    || journal.stableTarget !== undefined
    || journal.dashboardPort !== undefined
    || journal.candidateOpenBrowser !== undefined
    || journal.dashboardBeforeAbsent !== undefined
    || journal.dashboardBeforeRetiring !== undefined
    || journal.compensationReason !== undefined
    || journal.dashboardRestored !== undefined
    || !LEGACY_PHASES.has(journal.phase)
    || (journal.dashboardBefore !== undefined && journal.dashboardBefore.serverVersion !== '')
    || (journal.dashboard !== undefined && journal.dashboard.serverVersion !== '')) return false

  if (journal.phase === 'preparing-host') {
    return journal.candidateRoot === undefined
      && journal.activationCheckpoint === undefined
      && journal.activation === undefined
      && journal.dashboardBefore === undefined
      && journal.dashboard === undefined
  }
  if (journal.phase === 'candidate-resolved') {
    return journal.activationCheckpoint === undefined
      && journal.activation === undefined
      && journal.dashboardBefore === undefined
      && journal.dashboard === undefined
  }
  if (journal.phase === 'activating-runtime') {
    return journal.activationCheckpoint !== undefined
      && journal.activation === undefined
      && journal.dashboardBefore === undefined
      && journal.dashboard === undefined
  }
  const exactActivation = journal.activationCheckpoint !== undefined
    && journal.activation?.release.version === 1
    && journal.activation.release.source.host === journal.source
    && (journal.activation.release.source.pluginVersion === '1.0.1'
      || (journal.operation === 'update'
        && request.expectedPluginVersion !== undefined
        && journal.activation.release.source.pluginVersion === request.expectedPluginVersion))
  if (!exactActivation) return false
  if (journal.phase === 'runtime-activated') {
    return journal.dashboardBefore === undefined && journal.dashboard === undefined
  }
  if (journal.phase === 'starting-dashboard') return journal.dashboard === undefined
  return journal.dashboard !== undefined
    && journal.dashboard.owner === 'transaction'
    && journal.dashboard.transactionId === journal.transactionId
    && journal.dashboard.releaseId === journal.activation.release.releaseId
    && journal.dashboard.serverVersion === ''
}

async function proveLegacyActivation(
  request: ManagedReleaseRequest,
  transaction: ManagedRuntimeTransaction,
  journal: ManagedReleaseJournalRecord,
): Promise<RuntimeActivation | undefined> {
  if (journal.phase === 'activating-runtime') {
    if (journal.activationCheckpoint === undefined) {
      throw new ManagedRuntimeIndeterminateError('legacy activating-runtime WAL 缺少 activation checkpoint')
    }
    const recovered = await transaction.recoverActivation(journal.activationCheckpoint, request.source)
    return recovered.state === 'activated' ? recovered.activation : undefined
  }
  if (!LEGACY_ADVANCED_PHASES.has(journal.phase)) return undefined
  if (journal.activation === undefined || !await transaction.proveActivation(journal.activation)) {
    throw new ManagedRuntimeIndeterminateError(
      `legacy ${journal.phase} WAL 的 activation 无法从当前 selection/launcher 精确证明`,
    )
  }
  return journal.activation
}

async function proveLegacyDashboardBoundary(
  deps: CliDeps,
  journal: ManagedReleaseJournalRecord,
  activation: RuntimeActivation | undefined,
  starter: ReleasedDashboardStarter | undefined,
): Promise<void> {
  if (!LEGACY_ADVANCED_PHASES.has(journal.phase)) return
  if (starter === undefined) {
    throw new ManagedRuntimeIndeterminateError('legacy Dashboard WAL 缺少 starter，无法证明端口收尾')
  }
  const port = journal.dashboardPort
    ?? journal.dashboard?.port
    ?? journal.dashboardBefore?.port
    ?? DEFAULT_DASHBOARD_PORT
  const current = await starter.inspect(deps, { openBrowser: false, port })
  // `starting-dashboard` is written before detached spawn. An empty port cannot prove that the
  // old child will not arrive later, so the successor WAL retains the same transaction id and
  // lets the normal coordinator own that late previous-release process.
  if (current === null) return
  const candidateOwned = activation !== undefined
    && current.transactionId === journal.transactionId
    && current.releaseId === activation.release.releaseId
    && current.serverVersion === activation.release.source.pluginVersion
  const durableCandidate = sameManagedDashboardCoordinates(current, journal.dashboard)
    && current.serverVersion !== ''
  const preexistingOwned = sameManagedDashboardCoordinates(current, journal.dashboardBefore)
    && current.serverVersion !== ''
  const durableCandidateRequired = journal.phase === 'dashboard-ready'
    || journal.phase === 'evidence-committed'
  if (!candidateOwned
    && !durableCandidate
    && (durableCandidateRequired || !preexistingOwned)) {
    throw new ManagedRuntimeIndeterminateError(
      `legacy ${journal.phase} WAL 的 Dashboard 端口存在第三方 identity；拒绝转换 WAL`,
    )
  }
}

/**
 * v1.0.1 did not persist a stable target. Never invent one for the old transaction: first prove
 * the successor tag, then atomically reset the same WAL owner to a fresh versioned preparation.
 */
export async function retireLegacyNativeSetupJournal(
  deps: CliDeps,
  request: ManagedReleaseRequest,
  transaction: ManagedRuntimeTransaction,
  journal: ManagedReleaseJournalRecord,
  dashboardStarter: ReleasedDashboardStarter | undefined,
): Promise<ManagedReleaseJournalRecord | null> {
  if (!isExactLegacyV101NativeJournal(request, journal)) return null
  if (journal.phase === 'stopping-candidate'
    || journal.phase === 'reverting-activation'
    || journal.phase === 'restoring-previous'
    || journal.phase === 'previous-restored') {
    throw new ManagedRuntimeIndeterminateError(
      `缺 stable target 的 ${journal.phase} WAL 不是 v1.0.1 schema；拒绝猜测恢复`,
    )
  }
  let activation: RuntimeActivation | undefined
  try {
    if (request.resolveStableTargetBeforeRecovery === undefined) {
      throw new ManagedRuntimeIndeterminateError('legacy setup WAL 缺少 successor stable target resolver')
    }
    const stableTarget = await request.resolveStableTargetBeforeRecovery()
    await request.proveFrozenTarget?.(stableTarget)
    activation = await proveLegacyActivation(request, transaction, journal)
    await proveLegacyDashboardBoundary(deps, journal, activation, dashboardStarter)
    const updatedAt = deps.clock()
    const successor: ManagedReleaseJournalRecord = {
      version: 1,
      transactionId: journal.transactionId,
      operation: request.operation,
      source: request.source,
      phase: 'preparing-host',
      startedAt: updatedAt,
      updatedAt,
      dashboardPort: request.dashboardPort
        ?? journal.dashboardPort
        ?? journal.dashboard?.port
        ?? journal.dashboardBefore?.port
        ?? DEFAULT_DASHBOARD_PORT,
      stableTarget,
    }
    await transaction.journal.write(successor)
    deps.io.out(
      `[setup] 已在不补造旧 frozen commit 的前提下将 v1.0.1 `
      + `${journal.operation}/${journal.phase} WAL `
      + `原子转换为 ${stableTarget.tag} 版本化事务。`,
    )
    return successor
  } catch (error) {
    throw error instanceof ManagedRuntimeIndeterminateError
      ? error
      : new ManagedRuntimeIndeterminateError(
          `v1.0.1 legacy WAL 收尾失败：${error instanceof Error ? error.message : String(error)}`,
        )
  }
}
