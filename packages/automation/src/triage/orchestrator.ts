import { createHash } from 'node:crypto'
import {
  canonicalizeTriageResult,
  validateObservationPage,
  validateObserveAction,
  validateTriageRoutes,
  type ObservationPage,
  type ObserveAction,
  type SourceCheckpoint,
  type TriageCandidateDerivationInput,
  type TriageCandidateIdentity,
  type TriageResult,
  type TriageRoute,
} from '@pipeline-lite/kernel'
import type {
  TriageCheckpointKey,
  TriageCheckpointSnapshot,
  TriageCheckpointStore,
} from './checkpoint-store.js'
import type {
  TriageProvider,
  TriageProviderInvocation,
  TriageProviderRequest,
} from './provider.js'
import type { SourceConnector } from './source.js'
import type {
  WorkflowRunMaterialization,
  WorkflowRunMaterializer,
} from './workflow-run-materializer.js'

export interface RunTriageOptions {
  readonly action: ObserveAction
  readonly connector: SourceConnector<ObserveAction, SourceCheckpoint, unknown>
  readonly provider: TriageProvider
  readonly materializer: WorkflowRunMaterializer
  readonly checkpointStore: TriageCheckpointStore
  readonly routes: readonly TriageRoute[]
  readonly pageSize: number
  readonly maxPages: number
  readonly maxHighCandidates: number
  readonly signal: AbortSignal
}

export type TriageCheckpointCommit = 'committed' | 'converged'
export type TriageCheckpointFailureState = 'not-attempted' | 'conflict' | 'failed'

export interface RunTriageResult {
  readonly pagesProcessed: number
  readonly observationsProcessed: number
  readonly materializations: readonly WorkflowRunMaterialization[]
  readonly checkpoint: SourceCheckpoint
  readonly checkpointCommit: TriageCheckpointCommit
  readonly hasMore: boolean
  readonly limitReached: boolean
}

export interface TriageOrchestrationProgress {
  readonly pagesCommitted: number
  readonly observationsCommitted: number
  readonly materializationsCompleted: readonly WorkflowRunMaterialization[]
  readonly durableCheckpoint: SourceCheckpoint | null
  readonly failedPageCheckpoint: SourceCheckpoint | null
  readonly checkpointCommit: TriageCheckpointCommit | TriageCheckpointFailureState
  readonly retryable: boolean
}

export type TriageOrchestrationErrorReason =
  | 'invalid-options'
  | 'run-lock-failed'
  | 'checkpoint-read-failed'
  | 'connector-mismatch'
  | 'observe-failed'
  | 'page-invalid'
  | 'page-binding-mismatch'
  | 'checkpoint-not-progressing'
  | 'provider-failed'
  | 'provider-invocation-invalid'
  | 'provider-provenance-mismatch'
  | 'triage-invalid'
  | 'materialization-failed'
  | 'checkpoint-write-failed'
  | 'checkpoint-conflict'
  | 'aborted'

const frozenEmptyMaterializations = Object.freeze([]) as readonly WorkflowRunMaterialization[]

function emptyProgress(retryable = false): TriageOrchestrationProgress {
  return Object.freeze({
    pagesCommitted: 0,
    observationsCommitted: 0,
    materializationsCompleted: frozenEmptyMaterializations,
    durableCheckpoint: null,
    failedPageCheckpoint: null,
    checkpointCommit: 'not-attempted',
    retryable,
  })
}

export class TriageOrchestrationError extends Error {
  readonly _tag = 'TriageOrchestrationError' as const

  constructor(
    readonly reason: TriageOrchestrationErrorReason,
    message: string,
    readonly issues: readonly string[] = [],
    readonly progress: TriageOrchestrationProgress = emptyProgress(),
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'TriageOrchestrationError'
  }
}

interface RunSnapshot {
  readonly action: ObserveAction
  readonly connectorKind: string
  readonly observe: SourceConnector<ObserveAction, SourceCheckpoint, unknown>['observe']
  readonly providerKind: string
  readonly classify: TriageProvider['classify']
  readonly materialize: WorkflowRunMaterializer['materialize']
  readonly checkpointRead: TriageCheckpointStore['read']
  readonly checkpointCompareAndSet: TriageCheckpointStore['compareAndSet']
  readonly withRunLock: TriageCheckpointStore['withRunLock']
  readonly routes: readonly TriageRoute[]
  readonly pageSize: number
  readonly maxPages: number
  readonly maxHighCandidates: number
  readonly signal: AbortSignal
}

function safeErrorText(error: unknown): string {
  try {
    if (error instanceof Error && error.message !== '') return error.message
    return String(error)
  } catch {
    return '<unreadable error>'
  }
}

function snapshotOptions(input: RunTriageOptions): RunSnapshot {
  try {
    const action = input.action
    const connector = input.connector
    const provider = input.provider
    const materializer = input.materializer
    const checkpointStore = input.checkpointStore
    const routes = input.routes
    const pageSize = input.pageSize
    const maxPages = input.maxPages
    const maxHighCandidates = input.maxHighCandidates
    const signal = input.signal
    const connectorKind = connector.kind
    const observe = connector.observe.bind(connector)
    const providerKind = provider.kind
    const classify = provider.classify.bind(provider)
    const materialize = materializer.materialize.bind(materializer)
    const checkpointReadMethod = checkpointStore.read
    const checkpointCompareAndSetMethod = checkpointStore.compareAndSet
    const withRunLockMethod = checkpointStore.withRunLock
    if (
      typeof checkpointReadMethod !== 'function'
      || typeof checkpointCompareAndSetMethod !== 'function'
      || typeof withRunLockMethod !== 'function'
    ) throw new TypeError('checkpointStore read/compareAndSet/withRunLock must be functions')
    const checkpointRead = checkpointReadMethod.bind(checkpointStore)
    const checkpointCompareAndSet = checkpointCompareAndSetMethod.bind(checkpointStore)
    const withRunLock = withRunLockMethod.bind(checkpointStore)
    return Object.freeze({
      action,
      connectorKind,
      observe,
      providerKind,
      classify,
      materialize,
      checkpointRead,
      checkpointCompareAndSet,
      withRunLock,
      routes,
      pageSize,
      maxPages,
      maxHighCandidates,
      signal,
    })
  } catch (error) {
    throw new TriageOrchestrationError(
      'invalid-options',
      `triage options could not be snapshotted safely: ${safeErrorText(error)}`,
      [],
      emptyProgress(),
      { cause: error },
    )
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TriageOrchestrationError(
      'invalid-options',
      `${name} must be a positive safe integer`,
    )
  }
}

function assertNonNegativeSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TriageOrchestrationError(
      'invalid-options',
      `${name} must be a non-negative safe integer`,
    )
  }
}

/**
 * Stable host identity for exactly-once creation. Route, rationale, provider invocation, ordering,
 * and highIndex are deliberately excluded: a retry may change any of them, but one source
 * observation must never acquire a second creation key.
 */
export function deriveStableTriageCandidateIdentity(
  input: TriageCandidateDerivationInput,
): TriageCandidateIdentity {
  const digest = createHash('sha256').update(JSON.stringify([
    1,
    'triage-workflow-run',
    input.observation.sourceId,
    input.observation.actionKind,
    input.observation.observationId,
  ]), 'utf8').digest('hex')
  return Object.freeze({
    candidateId: `triage-candidate:${digest}`,
    creationKey: `triage-create:${digest}`,
    changeName: `triage_${digest.slice(0, 32)}`,
  })
}

function providerRequestFor(
  page: ObservationPage,
  routes: readonly TriageRoute[],
  maxHighCandidates: number,
): TriageProviderRequest {
  return deepFreeze({
    schemaVersion: 1,
    observations: page.observations.map((observation) => ({
      observationId: observation.observationId,
      observedAt: observation.observedAt,
      title: observation.title,
      body: observation.body,
    })),
    routes: routes.map((route) => ({
      routeId: route.routeId,
      description: route.description,
    })),
    maxHighCandidates,
  })
}

interface InvocationSnapshot {
  readonly output: unknown
  readonly provenance: {
    readonly kind: string
    readonly model: string
    readonly invocationId: string
  }
}

/** Snapshot the host adapter envelope once; semantic output remains unknown for kernel validation. */
function snapshotInvocation(
  input: TriageProviderInvocation,
  expectedKind: string,
): InvocationSnapshot {
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      throw new TriageOrchestrationError(
        'provider-invocation-invalid',
        'triage provider invocation must be an object',
      )
    }
    const output = input.output
    const rawProvenance = input.provenance
    if (typeof rawProvenance !== 'object' || rawProvenance === null || Array.isArray(rawProvenance)) {
      throw new TriageOrchestrationError(
        'provider-invocation-invalid',
        'triage provider provenance must be an object',
      )
    }
    const reportedKind = rawProvenance.kind
    const model = rawProvenance.model
    const invocationId = rawProvenance.invocationId
    if (reportedKind !== expectedKind) {
      throw new TriageOrchestrationError(
        'provider-provenance-mismatch',
        'triage provider provenance kind does not match the configured host adapter',
      )
    }
    return Object.freeze({
      // Do not traverse/freeze untrusted output before kernel read-once canonicalization.
      output,
      provenance: Object.freeze({ kind: expectedKind, model, invocationId }),
    }) as InvocationSnapshot
  } catch (error) {
    if (error instanceof TriageOrchestrationError) throw error
    throw new TriageOrchestrationError(
      'provider-invocation-invalid',
      'triage provider invocation could not be read safely',
      [],
      emptyProgress(),
      { cause: error },
    )
  }
}

function pageBoundToAction(page: ObservationPage, action: ObserveAction): boolean {
  return page.action.schemaVersion === action.schemaVersion
    && page.action.kind === action.kind
    && page.action.sourceId === action.sourceId
}

function sameCheckpoint(
  left: SourceCheckpoint | null,
  right: SourceCheckpoint,
): boolean {
  return left !== null
    && left.schemaVersion === right.schemaVersion
    && left.sourceId === right.sourceId
    && left.actionKind === right.actionKind
    && left.cursor === right.cursor
}

function materializationUnits(result: TriageResult): readonly TriageResult[] {
  if (result.decisions.length === 0) return Object.freeze([result])
  const observations = new Map(
    result.page.observations.map((observation) => [observation.observationId, observation]),
  )
  return Object.freeze(result.decisions.map((decision) => {
    const observation = observations.get(decision.observationId)
    if (observation === undefined) {
      throw new TriageOrchestrationError(
        'triage-invalid',
        `canonical triage decision '${decision.observationId}' has no observation`,
      )
    }
    return deepFreeze({
      schemaVersion: 1,
      page: {
        schemaVersion: 1,
        action: result.page.action,
        observations: [observation],
        nextCheckpoint: result.page.nextCheckpoint,
        hasMore: result.page.hasMore,
      },
      decisions: [decision],
      provider: result.provider,
    } satisfies TriageResult)
  }))
}

interface MutableRunState {
  pagesCommitted: number
  observationsCommitted: number
  materializationsCompleted: WorkflowRunMaterialization[]
  checkpoint: TriageCheckpointSnapshot
}

interface ProgressOptions {
  readonly failedPageCheckpoint?: SourceCheckpoint | null
  readonly checkpointCommit?: TriageOrchestrationProgress['checkpointCommit']
  readonly retryable?: boolean
  readonly durableCheckpoint?: SourceCheckpoint | null
}

function progressFor(
  state: MutableRunState,
  options: ProgressOptions = {},
): TriageOrchestrationProgress {
  return Object.freeze({
    pagesCommitted: state.pagesCommitted,
    observationsCommitted: state.observationsCommitted,
    // Freeze the collection, not repository-owned WorkflowRun objects nested in its outcomes.
    materializationsCompleted: Object.freeze([...state.materializationsCompleted]),
    durableCheckpoint: options.durableCheckpoint === undefined
      ? state.checkpoint.checkpoint
      : options.durableCheckpoint,
    failedPageCheckpoint: options.failedPageCheckpoint ?? null,
    checkpointCommit: options.checkpointCommit ?? 'not-attempted',
    retryable: options.retryable ?? false,
  })
}

function orchestrationFailure(
  reason: TriageOrchestrationErrorReason,
  message: string,
  state: MutableRunState,
  progress: ProgressOptions,
  issues: readonly string[] = [],
  cause?: unknown,
): TriageOrchestrationError {
  return new TriageOrchestrationError(
    reason,
    message,
    Object.freeze([...issues]),
    progressFor(state, progress),
    cause === undefined ? undefined : { cause },
  )
}

function assertNotAborted(
  signal: AbortSignal,
  state: MutableRunState,
  failedPageCheckpoint: SourceCheckpoint | null = null,
): void {
  if (!signal.aborted) return
  const reason = signal.reason
  throw orchestrationFailure(
    'aborted',
    `triage aborted: ${safeErrorText(reason)}`,
    state,
    {
      failedPageCheckpoint,
      checkpointCommit: 'not-attempted',
      retryable: true,
    },
    [],
    reason,
  )
}

interface CheckpointCommitOutcome {
  readonly kind: TriageCheckpointCommit
  readonly snapshot: TriageCheckpointSnapshot
}

async function commitCheckpoint(
  run: RunSnapshot,
  key: TriageCheckpointKey,
  state: MutableRunState,
  target: SourceCheckpoint,
): Promise<CheckpointCommitOutcome> {
  let writeError: unknown
  try {
    const won = await run.checkpointCompareAndSet(
      key,
      state.checkpoint.revision,
      target,
    )
    if (won) {
      return {
        kind: 'committed',
        snapshot: Object.freeze({
          key,
          revision: state.checkpoint.revision + 1,
          checkpoint: target,
        }),
      }
    }
  } catch (error) {
    writeError = error
  }

  let observed: TriageCheckpointSnapshot
  try {
    observed = await run.checkpointRead(key)
  } catch (readError) {
    throw orchestrationFailure(
      'checkpoint-write-failed',
      `triage checkpoint commit/readback failed: ${safeErrorText(writeError ?? readError)}`,
      state,
      {
        failedPageCheckpoint: target,
        checkpointCommit: 'failed',
        retryable: true,
      },
      [],
      writeError ?? readError,
    )
  }
  if (sameCheckpoint(observed.checkpoint, target)) {
    return { kind: 'converged', snapshot: observed }
  }
  if (writeError !== undefined) {
    throw orchestrationFailure(
      'checkpoint-write-failed',
      `triage checkpoint commit failed: ${safeErrorText(writeError)}`,
      state,
      {
        failedPageCheckpoint: target,
        checkpointCommit: 'failed',
        retryable: true,
        durableCheckpoint: observed.checkpoint,
      },
      [],
      writeError,
    )
  }
  throw orchestrationFailure(
    'checkpoint-conflict',
    'triage checkpoint changed concurrently after materialization',
    state,
    {
      failedPageCheckpoint: target,
      checkpointCommit: 'conflict',
      retryable: true,
      durableCheckpoint: observed.checkpoint,
    },
  )
}

async function runLocked(run: RunSnapshot, key: TriageCheckpointKey): Promise<RunTriageResult> {
  let checkpoint: TriageCheckpointSnapshot
  try {
    checkpoint = await run.checkpointRead(key)
  } catch (error) {
    const state: MutableRunState = {
      pagesCommitted: 0,
      observationsCommitted: 0,
      materializationsCompleted: [],
      checkpoint: Object.freeze({ key, revision: 0, checkpoint: null }),
    }
    throw orchestrationFailure(
      'checkpoint-read-failed',
      `triage checkpoint read failed: ${safeErrorText(error)}`,
      state,
      { retryable: true },
      [],
      error,
    )
  }
  const state: MutableRunState = {
    pagesCommitted: 0,
    observationsCommitted: 0,
    materializationsCompleted: [],
    checkpoint,
  }
  assertNotAborted(run.signal, state)

  let hasMore = false
  let lastCommit: TriageCheckpointCommit = 'committed'
  while (state.pagesCommitted < run.maxPages) {
    assertNotAborted(run.signal, state)
    let rawPage: unknown
    try {
      rawPage = await run.observe({
        action: run.action,
        checkpoint: state.checkpoint.checkpoint,
        limit: run.pageSize,
        signal: run.signal,
      })
    } catch (error) {
      if (run.signal.aborted) assertNotAborted(run.signal, state)
      throw orchestrationFailure(
        'observe-failed',
        `triage source observe failed: ${safeErrorText(error)}`,
        state,
        { retryable: true },
        [],
        error,
      )
    }
    assertNotAborted(run.signal, state)

    const pageValidation = validateObservationPage(rawPage)
    if (!pageValidation.ok) {
      throw orchestrationFailure(
        'page-invalid',
        'source connector returned an invalid observation page',
        state,
        { retryable: false },
        pageValidation.errors,
      )
    }
    const page = pageValidation.value
    if (!pageBoundToAction(page, run.action)) {
      throw orchestrationFailure(
        'page-binding-mismatch',
        'source connector returned a page for another source or action',
        state,
        { failedPageCheckpoint: page.nextCheckpoint, retryable: false },
      )
    }
    if (page.hasMore && sameCheckpoint(state.checkpoint.checkpoint, page.nextCheckpoint)) {
      throw orchestrationFailure(
        'checkpoint-not-progressing',
        'source connector reported hasMore without advancing its checkpoint',
        state,
        { failedPageCheckpoint: page.nextCheckpoint, retryable: false },
      )
    }

    const request = providerRequestFor(page, run.routes, run.maxHighCandidates)
    assertNotAborted(run.signal, state, page.nextCheckpoint)
    let rawInvocation: TriageProviderInvocation
    try {
      rawInvocation = await run.classify(request, run.signal)
    } catch (error) {
      if (run.signal.aborted) assertNotAborted(run.signal, state, page.nextCheckpoint)
      throw orchestrationFailure(
        'provider-failed',
        `triage provider failed: ${safeErrorText(error)}`,
        state,
        { failedPageCheckpoint: page.nextCheckpoint, retryable: true },
        [],
        error,
      )
    }
    assertNotAborted(run.signal, state, page.nextCheckpoint)
    let invocation: InvocationSnapshot
    try {
      invocation = snapshotInvocation(rawInvocation, run.providerKind)
    } catch (error) {
      if (error instanceof TriageOrchestrationError) {
        throw orchestrationFailure(
          error.reason,
          error.message,
          state,
          { failedPageCheckpoint: page.nextCheckpoint, retryable: false },
          error.issues,
          error,
        )
      }
      throw error
    }

    const canonical = canonicalizeTriageResult(invocation.output, {
      page,
      routes: run.routes,
      trustedHighCap: run.maxHighCandidates,
      provider: invocation.provenance,
      deriveCandidate: deriveStableTriageCandidateIdentity,
    })
    if (!canonical.ok) {
      throw orchestrationFailure(
        'triage-invalid',
        'triage provider output failed host canonicalization',
        state,
        { failedPageCheckpoint: page.nextCheckpoint, retryable: false },
        canonical.errors,
      )
    }

    const units = materializationUnits(canonical.value)
    for (const unit of units) {
      assertNotAborted(run.signal, state, page.nextCheckpoint)
      let created: readonly WorkflowRunMaterialization[]
      try {
        created = await run.materialize(unit)
      } catch (error) {
        if (run.signal.aborted) assertNotAborted(run.signal, state, page.nextCheckpoint)
        throw orchestrationFailure(
          'materialization-failed',
          `triage materialization failed: ${safeErrorText(error)}`,
          state,
          { failedPageCheckpoint: page.nextCheckpoint, retryable: true },
          [],
          error,
        )
      }
      if (!Array.isArray(created)) {
        throw orchestrationFailure(
          'materialization-failed',
          'triage materializer returned a non-array result',
          state,
          { failedPageCheckpoint: page.nextCheckpoint, retryable: false },
        )
      }
      state.materializationsCompleted.push(...created)
      assertNotAborted(run.signal, state, page.nextCheckpoint)
    }

    assertNotAborted(run.signal, state, page.nextCheckpoint)
    const committed = await commitCheckpoint(run, key, state, page.nextCheckpoint)
    state.checkpoint = committed.snapshot
    state.pagesCommitted += 1
    state.observationsCommitted += page.observations.length
    lastCommit = committed.kind
    hasMore = page.hasMore
    if (run.signal.aborted) {
      const reason = run.signal.reason
      throw new TriageOrchestrationError(
        'aborted',
        `triage aborted after committed page: ${safeErrorText(reason)}`,
        [],
        progressFor(state, {
          checkpointCommit: committed.kind,
          retryable: true,
        }),
        { cause: reason },
      )
    }
    if (!hasMore) break
  }

  if (state.checkpoint.checkpoint === null) {
    throw orchestrationFailure(
      'invalid-options',
      'triage completed without processing a checkpointed page',
      state,
      { retryable: false },
    )
  }
  return Object.freeze({
    pagesProcessed: state.pagesCommitted,
    observationsProcessed: state.observationsCommitted,
    materializations: Object.freeze([...state.materializationsCompleted]),
    checkpoint: state.checkpoint.checkpoint,
    checkpointCommit: lastCommit,
    hasMore,
    limitReached: hasMore && state.pagesCommitted === run.maxPages,
  })
}

/**
 * Observe, classify, canonicalize, materialize, then commit one checkpoint per successful page.
 * A separate per-key run lock prevents two providers from producing divergent side effects before
 * the short checkpoint CAS. There is deliberately no checkpoint write before all page units finish.
 */
export async function runTriage(input: RunTriageOptions): Promise<RunTriageResult> {
  const run = snapshotOptions(input)
  assertPositiveSafeInteger(run.pageSize, 'pageSize')
  assertPositiveSafeInteger(run.maxPages, 'maxPages')
  assertNonNegativeSafeInteger(run.maxHighCandidates, 'maxHighCandidates')

  const actionValidation = validateObserveAction(run.action)
  if (!actionValidation.ok) {
    throw new TriageOrchestrationError(
      'invalid-options',
      'triage action failed validation',
      actionValidation.errors,
    )
  }
  const routeValidation = validateTriageRoutes(run.routes)
  if (!routeValidation.ok) {
    throw new TriageOrchestrationError(
      'invalid-options',
      'triage routes failed validation',
      routeValidation.errors,
    )
  }
  const canonicalRun: RunSnapshot = Object.freeze({
    ...run,
    action: actionValidation.value,
    routes: routeValidation.value,
  })
  if (canonicalRun.connectorKind !== canonicalRun.action.kind) {
    throw new TriageOrchestrationError(
      'connector-mismatch',
      `connector kind '${canonicalRun.connectorKind}' cannot observe action '${canonicalRun.action.kind}'`,
    )
  }

  const key = Object.freeze({
    sourceId: canonicalRun.action.sourceId,
    actionKind: canonicalRun.action.kind,
  })
  if (canonicalRun.signal.aborted) {
    const reason = canonicalRun.signal.reason
    throw new TriageOrchestrationError(
      'aborted',
      `triage aborted before run lock: ${safeErrorText(reason)}`,
      [],
      emptyProgress(true),
      { cause: reason },
    )
  }
  try {
    return await canonicalRun.withRunLock(
      key,
      canonicalRun.signal,
      async () => runLocked(canonicalRun, key),
    )
  } catch (error) {
    if (error instanceof TriageOrchestrationError) throw error
    if (canonicalRun.signal.aborted) {
      const reason = canonicalRun.signal.reason
      throw new TriageOrchestrationError(
        'aborted',
        `triage aborted while acquiring run lock: ${safeErrorText(reason)}`,
        [],
        emptyProgress(true),
        { cause: reason },
      )
    }
    throw new TriageOrchestrationError(
      'run-lock-failed',
      `triage run lock failed: ${safeErrorText(error)}`,
      [],
      emptyProgress(true),
      { cause: error },
    )
  }
}
