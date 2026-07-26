import { canonicalizeTriageResult, validateObservationPage, validateObserveAction, validateTriageRoutes, type SourceCheckpoint } from '@tenon/kernel'
import type { TriageCheckpointKey, TriageCheckpointSnapshot } from './checkpoint-store.js'
import type { TriageProviderInvocation } from './provider.js'
import type { WorkflowRunMaterialization } from './workflow-run-materializer.js'
import {
  TriageOrchestrationError,
  assertNonNegativeSafeInteger,
  assertNotAborted,
  assertPositiveSafeInteger,
  deriveStableTriageCandidateIdentity,
  emptyProgress,
  materializationUnits,
  orchestrationFailure,
  pageBoundToAction,
  progressFor,
  providerRequestFor,
  safeErrorText,
  sameCheckpoint,
  snapshotInvocation,
  snapshotOptions,
  type InvocationSnapshot,
  type MutableRunState,
  type RunSnapshot,
  type RunTriageOptions,
  type RunTriageResult,
  type TriageCheckpointCommit,
} from './orchestrator-support.js'

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
