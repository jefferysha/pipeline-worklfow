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

export function emptyProgress(retryable = false): TriageOrchestrationProgress {
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

export interface RunSnapshot {
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

export function safeErrorText(error: unknown): string {
  try {
    if (error instanceof Error && error.message !== '') return error.message
    return String(error)
  } catch {
    return '<unreadable error>'
  }
}

export function snapshotOptions(input: RunTriageOptions): RunSnapshot {
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

export function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TriageOrchestrationError(
      'invalid-options',
      `${name} must be a positive safe integer`,
    )
  }
}

export function assertNonNegativeSafeInteger(value: number, name: string): void {
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

export function providerRequestFor(
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

export interface InvocationSnapshot {
  readonly output: unknown
  readonly provenance: {
    readonly kind: string
    readonly model: string
    readonly invocationId: string
  }
}

/** Snapshot the host adapter envelope once; semantic output remains unknown for kernel validation. */
export function snapshotInvocation(
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

export function pageBoundToAction(page: ObservationPage, action: ObserveAction): boolean {
  return page.action.schemaVersion === action.schemaVersion
    && page.action.kind === action.kind
    && page.action.sourceId === action.sourceId
}

export function sameCheckpoint(
  left: SourceCheckpoint | null,
  right: SourceCheckpoint,
): boolean {
  return left !== null
    && left.schemaVersion === right.schemaVersion
    && left.sourceId === right.sourceId
    && left.actionKind === right.actionKind
    && left.cursor === right.cursor
}

export function materializationUnits(result: TriageResult): readonly TriageResult[] {
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

export interface MutableRunState {
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

export function progressFor(
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

export function orchestrationFailure(
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

export function assertNotAborted(
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
