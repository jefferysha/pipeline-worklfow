import type { ResourceClaimV1, TaskGroupV1, WorkItemV1 } from '../task-plan/index.js'
import type { TaskScheduleCompilation, TaskScheduleWave } from './types.js'

export const TASK_RUN_SCHEMA_VERSION = 'task-run/v1' as const

export interface TaskPlanExecutionPlan {
  readonly plan_id: string
  readonly revision_id: string
  readonly revision_number: number
  readonly fingerprint: string
  readonly status: 'draft' | 'frozen'
  readonly groups: readonly TaskGroupV1[]
  readonly work_items: readonly WorkItemV1[]
}

export type WorkItemAttemptStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'
export type DerivedWorkItemState = WorkItemAttemptStatus | 'ready' | 'blocked-upstream' | 'invalidated'
export type TaskRunState = 'pending' | 'admitted' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'blocked'

export interface WorkItemAttemptFact {
  readonly attempt_id: string
  readonly work_item_id: string
  readonly attempt_number: number
  readonly status: WorkItemAttemptStatus
  readonly recorded_at: string
  readonly input_digests: Readonly<Record<string, string>>
  readonly output_digest?: string
  readonly error_code?: string
  readonly journal_sequence?: number
}

export interface TaskValidatorVerdict {
  readonly validator_id: string
  readonly scope: 'work-item' | 'group' | 'run'
  readonly target_id?: string
  readonly status: 'pending' | 'passed' | 'failed' | 'invalidated'
  readonly code?: string
  readonly input_digests?: Readonly<Record<string, string>>
}

export interface TaskRunBlockerV1 {
  readonly code: string
  readonly detail: string
  readonly remediation: string
  readonly work_item_id?: string
}

export interface TaskRunAdmissionV1 {
  readonly status: 'admitted' | 'blocked'
  readonly blockers: readonly TaskRunBlockerV1[]
}

export interface TaskRunOperationV1 {
  readonly operation: 'retry' | 'cancel' | 'resume'
  readonly work_item_id?: string
  readonly expected_run_revision: number
  readonly expected_state: string
}

export interface TaskRunOperationFact {
  readonly operation_id: string
  readonly operation: 'retry' | 'cancel' | 'resume'
  readonly work_item_id?: string
  readonly expected_run_revision: number
  readonly expected_state: string
  readonly recorded_at: string
  readonly journal_sequence?: number
}

export interface TaskRunInvalidationV1 {
  readonly work_item_id: string
  readonly caused_by_work_item_id: string
  readonly expected_digest: string
  readonly actual_digest: string
}

export interface TaskRunItemV1 {
  readonly work_item_id: string
  readonly title: string
  readonly state: DerivedWorkItemState
  readonly depends_on: readonly string[]
  readonly resource_claims: readonly ResourceClaimV1[]
  readonly latest_attempt: WorkItemAttemptFact | null
}

export interface TaskRunReadModelV1 {
  readonly schema_version: typeof TASK_RUN_SCHEMA_VERSION
  readonly plan: {
    readonly plan_id: string
    readonly revision_id: string
    readonly revision_number: number
    readonly fingerprint: string
  }
  readonly run_revision: number
  readonly state: TaskRunState
  readonly admission: TaskRunAdmissionV1
  readonly waves: readonly TaskScheduleWave[]
  readonly parallelism: number
  readonly serialized_resource_conflicts: TaskScheduleCompilation['serialized_resource_conflicts']
  readonly items: readonly TaskRunItemV1[]
  readonly attempts: readonly WorkItemAttemptFact[]
  readonly operations: readonly TaskRunOperationFact[]
  readonly blockers: readonly TaskRunBlockerV1[]
  readonly invalidations: readonly TaskRunInvalidationV1[]
  readonly validator_verdicts: readonly TaskValidatorVerdict[]
  readonly groups: readonly {
    readonly group_id: string
    readonly state: 'pending' | 'running' | 'succeeded' | 'failed' | 'blocked'
    readonly work_item_ids: readonly string[]
  }[]
  readonly allowed_operations: readonly TaskRunOperationV1[]
}

export interface DeriveTaskRunInput {
  readonly plan: TaskPlanExecutionPlan
  readonly schedule: TaskScheduleCompilation
  readonly attempts: readonly WorkItemAttemptFact[]
  readonly operations?: readonly TaskRunOperationFact[]
  readonly validator_verdicts: readonly TaskValidatorVerdict[]
  readonly admission: TaskRunAdmissionV1
  readonly run_revision: number
}
