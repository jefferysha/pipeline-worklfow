import {
  DEFAULT_WORKFLOW_DECOMPOSITION_POLICY,
  effectiveWorkflowPlanFromSnapshot,
  evaluateWorkflowDecompositionMaterialization,
  evaluateWorkflowAction,
  workflowPolicyPermissionLayer,
  type BudgetReservationRecord,
  type RunRecord,
  type WorkflowActionEvaluation,
  type WorkflowAuthorityBinding,
  type WorkflowDecompositionCandidate,
  type WorkflowDecompositionReviewReceipt,
  type WorkflowHardConfirmation,
  type WorkflowInteractionMode,
  type WorkflowPermissionLayerInput,
  type WorkflowPermissionLayers,
} from '@tenon/kernel'
import type { ExecutionContext } from './execution-context.js'
import type { createAdmissionJournal } from './loop-admission-journal.js'
import { errText, type LoopAdmissionDeps, type ReserveResult } from './loop-admission-types.js'

/**
 * The AFK transport is a named permission, not an autonomy level. Keeping this adapter tiny makes
 * the queue/CLI preview and the authoritative reservation boundary consume the same kernel table.
 */
export function evaluateAfkWorkflowAdmission(input: {
  readonly interactionMode: WorkflowInteractionMode
  readonly layers: WorkflowPermissionLayers
}): WorkflowActionEvaluation {
  return evaluateWorkflowAction({
    action: 'enter-afk',
    classification: 'routine-reversible',
    interactionMode: input.interactionMode,
    layers: input.layers,
  })
}

const unavailableLayer = (status: 'missing' | 'malformed'): WorkflowPermissionLayerInput => ({
  status,
  grants: [],
})

/** Fail-closed result for callers that cannot bind the reservation to a canonical WorkflowRun. */
export function evaluateMissingAfkWorkflowAdmission(): WorkflowActionEvaluation {
  const missing = unavailableLayer('missing')
  return evaluateAfkWorkflowAdmission({
    interactionMode: 'interactive',
    layers: { platform: missing, skill: missing, project: missing, workflow: missing, run: missing },
  })
}

type BoundWorkflowRun = Awaited<ReturnType<NonNullable<LoopAdmissionDeps['bindAutomationPolicy']>>>

/** Authority facts are dynamic infrastructure; provider exceptions are not ordinary denials. */
export class WorkflowActionAuthorityResolutionError extends Error {
  override readonly name = 'WorkflowActionAuthorityResolutionError'
  readonly _tag = 'WorkflowActionAuthorityResolutionError'

  constructor(readonly authorityError: unknown) {
    super(`Workflow action authority resolution failed: ${errText(authorityError)}`, {
      cause: authorityError,
    })
  }
}

/**
 * Production admission adapter for decomposition execution. It restores only the immutable Run
 * snapshot and downgrades the exact Run layer on any run/fingerprint mismatch before delegating to
 * the authoritative kernel evaluator; callers cannot substitute a live Workflow definition.
 */
export function evaluateBoundWorkflowDecompositionMaterialization(input: {
  readonly run: BoundWorkflowRun
  readonly authority: WorkflowAuthorityBinding
  readonly layers: Omit<WorkflowPermissionLayers, 'workflow'>
  readonly candidate: WorkflowDecompositionCandidate
  readonly hardConfirmation?: WorkflowHardConfirmation
  readonly review?: {
    readonly event_id: string
    readonly receipt?: WorkflowDecompositionReviewReceipt
  }
}): WorkflowActionEvaluation {
  let decomposition = DEFAULT_WORKFLOW_DECOMPOSITION_POLICY
  let interactionMode: WorkflowInteractionMode = 'interactive'
  let snapshotMatches = false
  if (input.run.workflowPlanSnapshot !== undefined) {
    try {
      const frozen = effectiveWorkflowPlanFromSnapshot(input.run.workflowPlanSnapshot)
      snapshotMatches = input.run.workflowPlanFingerprint === frozen.workflowFingerprint
        && input.run.workflowId === frozen.id
        && input.authority.workflow_run_id === input.run.id
        && input.authority.workflow_fingerprint === frozen.workflowFingerprint
      decomposition = frozen.decomposition
      interactionMode = frozen.interaction.mode
    } catch {
      snapshotMatches = false
    }
  }
  const layers = snapshotMatches
    ? input.layers
    : { ...input.layers, run: { status: 'fingerprint-mismatch' as const, grants: [] } }
  return evaluateWorkflowDecompositionMaterialization({
    policy: decomposition,
    interactionMode,
    authority: input.authority,
    layers,
    candidate: input.candidate,
    hardConfirmation: input.hardConfirmation,
    review: input.review,
  })
}

/**
 * Resolves the Workflow ceiling solely from the immutable WorkflowRun snapshot, then intersects it
 * with fresh non-Workflow facts supplied by the host. Snapshot absence or tampering fails closed.
 */
export async function evaluateBoundAfkWorkflowAdmission(input: {
  readonly change: string
  readonly context: ExecutionContext
  readonly run: BoundWorkflowRun
  readonly workflowActionAuthority: LoopAdmissionDeps['workflowActionAuthority']
}): Promise<WorkflowActionEvaluation> {
  const missing = unavailableLayer('missing')
  let interactionMode: WorkflowInteractionMode = 'interactive'
  let workflow: WorkflowPermissionLayerInput = missing
  if (input.run.workflowPlanSnapshot !== undefined) {
    try {
      const frozenPlan = effectiveWorkflowPlanFromSnapshot(input.run.workflowPlanSnapshot)
      if (input.run.workflowPlanFingerprint !== frozenPlan.workflowFingerprint
        || input.run.workflowId !== frozenPlan.id) {
        workflow = { status: 'fingerprint-mismatch', grants: [] }
      } else {
        interactionMode = frozenPlan.workflow.interaction.mode
        workflow = workflowPolicyPermissionLayer(frozenPlan.workflow)
      }
    } catch {
      workflow = { status: 'fingerprint-mismatch', grants: [] }
    }
  }

  let dynamic: Omit<WorkflowPermissionLayers, 'workflow'>
  if (input.workflowActionAuthority === undefined) {
    dynamic = { platform: missing, skill: missing, project: missing, run: missing }
  } else {
    try {
      dynamic = await input.workflowActionAuthority(input)
    } catch (error) {
      throw new WorkflowActionAuthorityResolutionError(error)
    }
  }
  return evaluateAfkWorkflowAdmission({ interactionMode, layers: { ...dynamic, workflow } })
}

/** Binds the reservation to its canonical frozen run and evaluates AFK entry against that run. */
export async function bindAndEvaluateAfkWorkflowRun(input: {
  readonly change: string
  readonly context: ExecutionContext
  readonly bindAutomationPolicy: NonNullable<LoopAdmissionDeps['bindAutomationPolicy']>
  readonly workflowActionAuthority: LoopAdmissionDeps['workflowActionAuthority']
}): Promise<{
  readonly context: ExecutionContext
  readonly run: BoundWorkflowRun
  readonly authorization: WorkflowActionEvaluation
}> {
  const policy = input.context.automation_policy
  if (policy === undefined) throw new Error('loop admission produced no AutomationPolicy snapshot')
  const iterationId = input.context.iteration_id
  if (iterationId === undefined) throw new Error('loop admission produced no iteration identity')
  const run = await input.bindAutomationPolicy(input.change, policy, {
    loopId: input.context.loop_id,
    iterationId,
  })
  if (run.automationPolicy?.policy_version !== policy.policy_version) {
    throw new Error('WorkflowRun did not persist the admitted AutomationPolicy snapshot')
  }
  if (run.loopId !== input.context.loop_id || run.iterationId !== iterationId) {
    throw new Error('WorkflowRun did not persist the admitted loop/iteration identity')
  }
  const context = Object.freeze({ ...input.context, workflow_run_id: run.id })
  const authorization = await evaluateBoundAfkWorkflowAdmission({
    change: input.change,
    context,
    run,
    workflowActionAuthority: input.workflowActionAuthority,
  })
  return { context, run, authorization }
}

type AdmissionJournal = ReturnType<typeof createAdmissionJournal>

/** Closes a policy-denied reservation without charging it and returns the structured denial. */
export async function closeWorkflowAuthorizationDenial(input: {
  readonly context: ExecutionContext
  readonly authorization: WorkflowActionEvaluation
  readonly workflowRunId?: string
  readonly clock: () => string
  readonly close: AdmissionJournal['close']
  readonly closeRecord: AdmissionJournal['closeRecord']
}): Promise<ReserveResult> {
  const { context, authorization } = input
  const detail = authorization.denials.map((denial) => denial.code).join(',')
  await input.close(context.reservation_id, (reservation: BudgetReservationRecord): RunRecord => ({
    ...input.closeRecord(reservation, {
      result: 'skipped', reason: 'admission-denied', charge: 'none',
      now: input.clock(), runner: context.runner,
    }),
    admitted_at: context.admitted_at,
    ...(input.workflowRunId === undefined ? {} : { workflow_run_id: input.workflowRunId }),
    error: { cause: `workflow-action-${authorization.status}`, message: detail },
  }))
  return {
    ok: false,
    action: 'skip-run',
    reason: `workflow-action-${authorization.status}`,
    detail,
    loopId: context.loop_id,
    authorization,
  }
}

/** Zero-charge compensation for a failed canonical binding or authority resolution; always rethrows. */
export async function compensateWorkflowBindingFailure(input: {
  readonly context: ExecutionContext
  readonly bindingError: unknown
  readonly clock: () => string
  readonly close: AdmissionJournal['close']
  readonly closeRecord: AdmissionJournal['closeRecord']
}): Promise<never> {
  const authorityFailure = input.bindingError instanceof WorkflowActionAuthorityResolutionError
  const reason = authorityFailure ? 'infrastructure-error' : 'automation-policy-bind-failed'
  const cause = authorityFailure ? 'workflow-action-authority-failed' : 'automation-policy-bind-failed'
  try {
    await input.close(input.context.reservation_id, (reservation: BudgetReservationRecord): RunRecord => ({
      ...input.closeRecord(reservation, {
        result: 'failed', reason, charge: 'none',
        now: input.clock(), runner: input.context.runner,
      }),
      admitted_at: input.context.admitted_at,
      error: { cause, message: errText(input.bindingError) },
    }))
  } catch (settlementError) {
    throw new Error(
      `AutomationPolicy binding failed (${errText(input.bindingError)}) and reservation compensation failed (${errText(settlementError)})`,
      { cause: input.bindingError },
    )
  }
  throw input.bindingError
}
