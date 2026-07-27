import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { withLock } from '@tenon/kernel'
import {
  captureStableLaunchers,
  expectedStableLaunchers,
  restoreStableLaunchers,
  writeStableLaunchers,
} from './launchers.js'
import { resolveRuntimePaths } from './paths.js'
import type { RuntimePathInput } from './paths.js'
import { RuntimeReleaseStore } from './release-store.js'
import type {
  RuntimeActivation,
  RuntimeInspection,
  RuntimeLauncherSnapshot,
  RuntimePaths,
  RuntimeReleaseSource,
  RuntimeSelection,
} from './types.js'
import { createManagedReleaseJournal } from './managed-release-journal.js'

/**
 * Boundary between the mutable marketplace checkout and the managed local runtime.
 *
 * Setup/update may inspect a host-owned checkout, but only this boundary can promote it into an
 * executable release.  The release store verifies a staged copy before atomically publishing the
 * selection; stable launchers are written only after that publication succeeds.
 */
export interface ManagedRuntimeTransaction {
  checkpointActivation(): Promise<RuntimeActivationCheckpoint>
  activate(candidateRoot: string, host: RuntimeReleaseSource['host']): Promise<RuntimeActivation>
  recoverActivation(
    checkpoint: RuntimeActivationCheckpoint,
    host: RuntimeReleaseSource['host'],
  ): Promise<{ readonly state: 'not-started' } | { readonly state: 'activated'; readonly activation: RuntimeActivation }>
  revertActivation(activation: RuntimeActivation): Promise<void>
  proveActivation(activation: RuntimeActivation): Promise<boolean>
  readonly journal: ManagedReleaseJournal
}

export interface ManagedHostStepJournalRecord {
  readonly id: string
  readonly state: 'started' | 'completed'
  /** Canonical host-owned inventory captured and committed before the mutation. */
  readonly before?: string
  /** Canonical postcondition which must be proven from a fresh host observation. */
  readonly desired?: string
  readonly replayPolicy?: 'observe-before-replay-v1'
  /** Fresh canonical observation which proved the completed checkpoint. */
  readonly observedAfter?: string
  /** Bounded diagnostic output only; never treated as proof that the mutation committed. */
  readonly result?: string
}

export interface ManagedDashboardIdentity {
  readonly version: 1
  readonly port: number
  readonly pid: number
  readonly releaseId: string
  readonly stateScopeId: string
  /** Absent only for an ordinary `tenon dashboard` process. */
  readonly transactionId?: string
}

export interface ManagedDashboardJournalRecord extends ManagedDashboardIdentity {
  readonly owner: 'transaction' | 'preexisting'
}

export type ManagedReleaseOperation = 'setup' | 'update' | 'adapter'
export type ManagedReleaseJournalPhase =
  | 'preparing-host'
  | 'candidate-resolved'
  | 'activating-runtime'
  | 'runtime-activated'
  | 'starting-dashboard'
  | 'dashboard-ready'
  | 'stopping-candidate'
  | 'reverting-activation'
  | 'restoring-previous'
  | 'previous-restored'
  | 'evidence-committed'

export interface ManagedReleaseJournalRecord {
  readonly version: 1
  readonly transactionId: string
  readonly operation: ManagedReleaseOperation
  readonly source: RuntimeReleaseSource['host']
  readonly phase: ManagedReleaseJournalPhase
  readonly startedAt: string
  readonly updatedAt: string
  /** Concrete port frozen when the transaction is created and reused for every recovery. */
  readonly dashboardPort?: number
  readonly candidateRoot?: string
  /** Host inventory snapshot or another small serializable input for the final receipt. */
  readonly evidence?: string
  readonly hostSteps?: readonly ManagedHostStepJournalRecord[]
  readonly activationCheckpoint?: RuntimeActivationCheckpoint
  readonly activation?: RuntimeActivation
  /** Exact service observed before activation. */
  readonly dashboardBefore?: ManagedDashboardIdentity
  /** Durable proof that the pre-activation Dashboard probe observed an empty port. */
  readonly dashboardBeforeAbsent?: true
  readonly dashboard?: ManagedDashboardJournalRecord
  /** Bounded failure detail carried through crash-safe compensation. */
  readonly compensationReason?: string
  /** Exact previous Dashboard identity restored under this transaction's restore identity. */
  readonly dashboardRestored?: ManagedDashboardIdentity
}

export interface RuntimeActivationCheckpoint {
  readonly selection: RuntimeSelection
  readonly launchers: RuntimeLauncherSnapshot
}

export interface ManagedReleaseJournal {
  create(
    operation: ManagedReleaseOperation,
    source: RuntimeReleaseSource['host'],
    now: string,
  ): ManagedReleaseJournalRecord
  read(): Promise<ManagedReleaseJournalRecord | null>
  write(record: ManagedReleaseJournalRecord): Promise<void>
  clear(expectedTransactionId: string): Promise<void>
}

export interface RuntimeInstallerScope {
  readonly homeDir: string
  readonly env: NonNullable<RuntimePathInput['env']>
  readonly platform?: NodeJS.Platform
}

export interface RuntimeInstaller {
  withManagedTransaction<T>(
    scope: RuntimeInstallerScope,
    operation: (transaction: ManagedRuntimeTransaction) => Promise<T>,
  ): Promise<T>
  inspect(scope: RuntimeInstallerScope): Promise<RuntimeInspection>
  rollback(scope: RuntimeInstallerScope): Promise<RuntimeActivation>
  recordUpdateFailure?(scope: RuntimeInstallerScope, detail: string): Promise<void>
}

export class ManagedRuntimeIndeterminateError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ManagedRuntimeIndeterminateError'
  }
}

function pathsFor(scope: RuntimeInstallerScope): RuntimePaths {
  return resolveRuntimePaths({
    homeDir: scope.homeDir,
    env: scope.env,
    ...(scope.platform === undefined ? {} : { platform: scope.platform }),
  })
}

function storeFor(scope: RuntimeInstallerScope): RuntimeReleaseStore {
  return new RuntimeReleaseStore({ paths: pathsFor(scope) })
}

async function activateWithinTransaction(
  paths: RuntimePaths,
  homeDir: string,
  candidateRoot: string,
  host: RuntimeReleaseSource['host'],
): Promise<RuntimeActivation> {
  const store = new RuntimeReleaseStore({ paths })
  const launcherSnapshot = await captureStableLaunchers(paths, homeDir)
  const launcherCommitted = expectedStableLaunchers(paths, homeDir)
  const activation = await store.stageAndActivate(candidateRoot, host)
  try {
    await writeStableLaunchers(paths, homeDir)
    return { ...activation, launcherSnapshot, launcherCommitted }
  } catch (error) {
    try {
      await store.revertActivation(activation.selection)
    } catch (rollbackError) {
      throw new ManagedRuntimeIndeterminateError(
        `稳定 launcher 写入失败，且 selection CAS 补偿失败；为避免覆盖并发事务，未恢复 launcher：`
        + `${String(error)}；selection=${String(rollbackError)}`,
      )
    }
    try {
      await restoreStableLaunchers(launcherSnapshot, launcherCommitted)
    } catch (rollbackError) {
      throw new ManagedRuntimeIndeterminateError(
        `稳定 launcher 写入失败；selection 已恢复，但 launcher 精确恢复失败：`
        + `${String(error)}；launcher=${String(rollbackError)}`,
      )
    }
    throw new Error(`稳定 launcher 写入失败，已恢复 activation 前 runtime：${String(error)}`)
  }
}

async function revertWithinTransaction(
  paths: RuntimePaths,
  homeDir: string,
  activation: RuntimeActivation,
): Promise<void> {
  const store = new RuntimeReleaseStore({ paths })
  const compensatedSelection = {
    version: 1 as const,
    revision: activation.selection.revision + 1,
    activeRelease: activation.selection.previousRelease,
    previousRelease: activation.selection.activeRelease,
  }
  const sameSelectionCoordinates = (
    current: RuntimeSelection,
    expected: Pick<RuntimeSelection, 'version' | 'revision' | 'activeRelease' | 'previousRelease'>,
  ) => current.version === expected.version
    && current.revision === expected.revision
    && current.activeRelease === expected.activeRelease
    && current.previousRelease === expected.previousRelease
  const before = await store.inspect()
  if (sameSelectionCoordinates(before.selection, activation.selection)) {
    await store.revertActivation(activation.selection)
  } else if (!sameSelectionCoordinates(before.selection, compensatedSelection)) {
    throw new ManagedRuntimeIndeterminateError(
      'runtime selection 既不匹配 journal activation，也不是其精确 compensated revision；拒绝覆盖',
    )
  }
  try {
    if (activation.launcherSnapshot !== undefined) {
      await restoreStableLaunchers(activation.launcherSnapshot, activation.launcherCommitted)
    } else {
      const inspection = await store.inspect()
      if (inspection.selection.activeRelease !== null) await writeStableLaunchers(paths, homeDir)
    }
  } catch (error) {
    throw new ManagedRuntimeIndeterminateError(
      `selection 已补偿，但稳定 launcher 状态无法证明：${String(error)}`,
    )
  }
  const after = await store.inspect()
  if (!sameSelectionCoordinates(after.selection, compensatedSelection)) {
    throw new ManagedRuntimeIndeterminateError('activation 补偿后 selection 未处于精确 compensated revision')
  }
  if (compensatedSelection.activeRelease === null) {
    if (after.active !== null || after.activeValid) {
      throw new ManagedRuntimeIndeterminateError('activation 补偿后空 selection 的 runtime 证明不一致')
    }
  } else if (
    !after.activeValid
    || after.active?.releaseId !== compensatedSelection.activeRelease
  ) {
    throw new ManagedRuntimeIndeterminateError('activation 补偿后的 previous runtime 无法通过完整性证明')
  }
  if (activation.launcherSnapshot !== undefined) {
    const currentLaunchers = await captureStableLaunchers(paths, homeDir)
    if (!sameJson(currentLaunchers, activation.launcherSnapshot)) {
      throw new ManagedRuntimeIndeterminateError('activation 补偿后的 launcher 与 pre-activation checkpoint 不一致')
    }
  }
}

async function proveActivationWithinTransaction(
  paths: RuntimePaths,
  homeDir: string,
  activation: RuntimeActivation,
): Promise<boolean> {
  const inspection = await new RuntimeReleaseStore({ paths }).inspect()
  if (
    !inspection.activeValid
    || inspection.selection.revision !== activation.selection.revision
    || inspection.selection.activeRelease !== activation.release.releaseId
    || inspection.active?.releaseId !== activation.release.releaseId
    || inspection.active.payloadDigest !== activation.release.payloadDigest
  ) return false
  if (activation.launcherCommitted === undefined) return true
  const currentLaunchers = await captureStableLaunchers(paths, homeDir)
  return JSON.stringify(currentLaunchers) === JSON.stringify(activation.launcherCommitted)
}

async function checkpointActivationWithinTransaction(
  paths: RuntimePaths,
  homeDir: string,
): Promise<RuntimeActivationCheckpoint> {
  const selection = (await new RuntimeReleaseStore({ paths }).inspect()).selection
  return {
    selection,
    launchers: await captureStableLaunchers(paths, homeDir),
  }
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

async function recoverActivationWithinTransaction(
  paths: RuntimePaths,
  homeDir: string,
  checkpoint: RuntimeActivationCheckpoint,
  host: RuntimeReleaseSource['host'],
): Promise<{ readonly state: 'not-started' } | { readonly state: 'activated'; readonly activation: RuntimeActivation }> {
  const store = new RuntimeReleaseStore({ paths })
  const inspection = await store.inspect()
  const launchers = await captureStableLaunchers(paths, homeDir)
  if (sameJson(inspection.selection, checkpoint.selection) && sameJson(launchers, checkpoint.launchers)) {
    return { state: 'not-started' }
  }
  const active = inspection.active
  const expectedPrevious = checkpoint.selection.activeRelease === active?.releaseId
    ? checkpoint.selection.previousRelease
    : checkpoint.selection.activeRelease
  if (
    active !== null
    && inspection.activeValid
    && active.source.host === host
    && inspection.selection.revision === checkpoint.selection.revision + 1
    && inspection.selection.activeRelease === active.releaseId
    && inspection.selection.previousRelease === expectedPrevious
    && sameJson(launchers, expectedStableLaunchers(paths, homeDir))
  ) {
    return {
      state: 'activated',
      activation: {
        selection: inspection.selection,
        release: active,
        releaseRoot: join(paths.releasesRoot, active.releaseId),
        launcherSnapshot: checkpoint.launchers,
        launcherCommitted: launchers,
      },
    }
  }
  throw new ManagedRuntimeIndeterminateError(
    'activation checkpoint 与当前 selection/launcher 不一致，无法证明激活未开始或已完整提交',
  )
}

async function rollbackWithinTransaction(
  paths: RuntimePaths,
  homeDir: string,
): Promise<RuntimeActivation> {
  const store = new RuntimeReleaseStore({ paths })
  const launcherSnapshot = await captureStableLaunchers(paths, homeDir)
  const launcherCommitted = expectedStableLaunchers(paths, homeDir)
  const activation = await store.rollbackToPrevious()
  try {
    await writeStableLaunchers(paths, homeDir)
    return { ...activation, launcherSnapshot, launcherCommitted }
  } catch (error) {
    try {
      await store.revertActivation(activation.selection)
    } catch (rollbackError) {
      throw new ManagedRuntimeIndeterminateError(
        `runtime repair 的 launcher 提交失败，且 selection CAS 补偿失败；未覆盖 launcher：`
        + `${String(error)}；selection=${String(rollbackError)}`,
      )
    }
    try {
      await restoreStableLaunchers(launcherSnapshot, launcherCommitted)
    } catch (rollbackError) {
      throw new ManagedRuntimeIndeterminateError(
        `runtime repair 的 selection 已恢复，但 launcher 精确恢复失败：`
        + `${String(error)}；launcher=${String(rollbackError)}`,
      )
    }
    throw new Error(`runtime repair 的 launcher 提交失败，已恢复 repair 前状态：${String(error)}`)
  }
}

async function withExclusiveRuntimeTransaction<T>(
  scope: RuntimeInstallerScope,
  operation: (transaction: ManagedRuntimeTransaction) => Promise<T>,
): Promise<T> {
  const paths = pathsFor(scope)
  await mkdir(paths.managedTransactionRoot, { recursive: true })
  return withLock(paths.managedTransactionRoot, () => operation({
    checkpointActivation: () =>
      checkpointActivationWithinTransaction(paths, scope.homeDir),
    activate: (candidateRoot, host) =>
      activateWithinTransaction(paths, scope.homeDir, candidateRoot, host),
    recoverActivation: (checkpoint, host) =>
      recoverActivationWithinTransaction(paths, scope.homeDir, checkpoint, host),
    revertActivation: (activation) =>
      revertWithinTransaction(paths, scope.homeDir, activation),
    proveActivation: (activation) =>
      proveActivationWithinTransaction(paths, scope.homeDir, activation),
    journal: createManagedReleaseJournal(paths),
  }))
}

export const REAL_RUNTIME_INSTALLER: RuntimeInstaller = {
  async withManagedTransaction(scope, operation) {
    return withExclusiveRuntimeTransaction(scope, operation)
  },
  inspect(scope) {
    return storeFor(scope).inspect()
  },
  async rollback(scope) {
    const paths = pathsFor(scope)
    await mkdir(paths.managedTransactionRoot, { recursive: true })
    return withLock(
      paths.managedTransactionRoot,
      () => rollbackWithinTransaction(paths, scope.homeDir),
    )
  },
  recordUpdateFailure(scope, detail) {
    return storeFor(scope).recordUpdateFailure(detail)
  },
}
