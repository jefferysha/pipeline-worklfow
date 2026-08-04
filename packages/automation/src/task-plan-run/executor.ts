import {
  compileTaskSchedule,
  deriveTaskRunReadModel,
  type TaskPlanExecutionPlan,
  type TaskRunAdmissionV1,
  type TaskRunBlockerV1,
  type WorkItemAttemptFact,
} from '@tenon/kernel'
import {
  appendTaskRunAttempt,
  readTaskRunJournal,
  TaskRunRevisionConflictError,
} from './journal.js'

export interface ClaimTaskPlanWorkItemInput<PreparedContext> {
  readonly changeDir: string
  readonly plan: TaskPlanExecutionPlan
  readonly authoritativeAdmission: (coordinate: {
    readonly work_item_id: string
    readonly expected_run_revision: number
    readonly plan_revision_id: string
    readonly plan_fingerprint: string
  }) => Promise<{
    readonly admission: TaskRunAdmissionV1
    readonly prepared_context: PreparedContext | null
  }>
  readonly clock: () => string
  readonly attemptId: () => string
}

export type ClaimTaskPlanWorkItemResult<PreparedContext> =
  | {
      readonly status: 'claimed'
      readonly work_item_id: string
      readonly attempt: WorkItemAttemptFact
      readonly run_revision: number
      readonly prepared_context: PreparedContext
    }
  | { readonly status: 'blocked'; readonly blockers: readonly TaskRunBlockerV1[] }
  | { readonly status: 'idle'; readonly run_revision: number }
  | { readonly status: 'claim-lost'; readonly prepared_context: PreparedContext }

/**
 * Claims one WorkItem under the TaskPlan journal CAS. The caller supplies the authoritative
 * pre-claim admission adapter (Workflow policy, permission, evidence, preparation, and hard
 * confirmation); this subordinate executor never writes the owning Change lifecycle state.
 */
export async function claimNextTaskPlanWorkItem<PreparedContext>(
  input: ClaimTaskPlanWorkItemInput<PreparedContext>,
): Promise<ClaimTaskPlanWorkItemResult<PreparedContext>> {
  const schedule = compileTaskSchedule(input.plan)
  if (!schedule.valid) {
    return {
      status: 'blocked',
      blockers: schedule.blockers.map((entry) => ({
        code: entry.code,
        detail: entry.detail,
        remediation: entry.remediation,
      })),
    }
  }
  const journal = await readTaskRunJournal(input.changeDir, input.plan.revision_id)
  const provisionalAdmission: TaskRunAdmissionV1 = { status: 'admitted', blockers: [] }
  const readModel = deriveTaskRunReadModel({
    plan: input.plan,
    schedule,
    attempts: journal.attempts,
    operations: journal.operations,
    validator_verdicts: journal.validator_verdicts,
    admission: provisionalAdmission,
    run_revision: journal.run_revision,
  })
  const byId = new Map(readModel.items.map((item) => [item.work_item_id, item]))
  const workItemId = schedule.waves
    .flatMap((wave) => wave.work_item_ids)
    .find((id) => byId.get(id)?.state === 'ready')
  if (workItemId === undefined) return { status: 'idle', run_revision: journal.run_revision }

  const workItem = input.plan.work_items.find(({ id }) => id === workItemId)
  if (workItem === undefined) {
    return { status: 'blocked', blockers: [{
      code: 'WORK_ITEM_IDENTITY_DRIFT',
      detail: 'The selected WorkItem is missing from the frozen TaskPlan.',
      remediation: 'REFRESH_PLAN_IDENTITY',
    }] }
  }
  const latest = new Map<string, WorkItemAttemptFact>()
  for (const attempt of journal.attempts) {
    const current = latest.get(attempt.work_item_id)
    const sameAttemptIsNewer = current !== undefined
      && attempt.attempt_number === current.attempt_number
      && (attempt.journal_sequence ?? -1) > (current.journal_sequence ?? -1)
    if (current === undefined || attempt.attempt_number > current.attempt_number || sameAttemptIsNewer) {
      latest.set(attempt.work_item_id, attempt)
    }
  }
  const inputDigests: Record<string, string> = {}
  for (const dependency of workItem.depends_on) {
    const digest = latest.get(dependency)?.output_digest
    if (digest === undefined) {
      return { status: 'blocked', blockers: [{
        code: 'UPSTREAM_OUTPUT_MISSING',
        detail: `Upstream WorkItem ${dependency} has no verified output digest.`,
        remediation: 'REVERIFY_UPSTREAM_OUTPUT',
        work_item_id: workItemId,
      }] }
    }
    inputDigests[dependency] = digest
  }
  const authoritative = await input.authoritativeAdmission({
    work_item_id: workItemId,
    expected_run_revision: journal.run_revision,
    plan_revision_id: input.plan.revision_id,
    plan_fingerprint: input.plan.fingerprint,
  })
  const admission = authoritative.admission
  if (admission.status !== 'admitted') return { status: 'blocked', blockers: admission.blockers }
  if (authoritative.prepared_context === null) {
    return { status: 'blocked', blockers: [{
      code: 'PREPARED_CONTEXT_MISSING',
      detail: 'Authoritative admission did not issue a prepared execution context.',
      remediation: 'REPREPARE_EXECUTION_CONTEXT',
    }] }
  }
  const attempt: WorkItemAttemptFact = {
    attempt_id: input.attemptId(),
    work_item_id: workItemId,
    attempt_number: (latest.get(workItemId)?.attempt_number ?? 0) + 1,
    status: 'running',
    recorded_at: input.clock(),
    input_digests: inputDigests,
  }
  try {
    const runRevision = await appendTaskRunAttempt(
      input.changeDir,
      input.plan.revision_id,
      journal.run_revision,
      attempt,
    )
    return {
      status: 'claimed', work_item_id: workItemId, attempt, run_revision: runRevision,
      prepared_context: authoritative.prepared_context,
    }
  } catch (error) {
    if (error instanceof TaskRunRevisionConflictError) {
      return { status: 'claim-lost', prepared_context: authoritative.prepared_context }
    }
    throw error
  }
}
