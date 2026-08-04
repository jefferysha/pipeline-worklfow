import type { TaskRunAdmissionV1, TaskRunBlockerV1 } from '@tenon/kernel'

export interface TaskRunAdmissionInput {
  readonly plan_status: 'draft' | 'frozen'
  readonly plan_revision_id: string
  readonly expected_plan_revision_id: string
  readonly schedule_valid: boolean
  readonly interaction_policy: 'interactive' | 'recommended-defaults' | 'invalid'
  readonly evidence_verified: boolean
  readonly execute_permission: boolean
  readonly hard_confirmation_required: boolean
  readonly hard_confirmation_satisfied: boolean
  readonly routine_decision_required: boolean
  readonly routine_decision_evidence: boolean
}

function blocker(code: string, detail: string, remediation: string): TaskRunBlockerV1 {
  return { code, detail, remediation }
}

export function evaluateTaskRunAdmission(input: TaskRunAdmissionInput): TaskRunAdmissionV1 {
  const blockers: TaskRunBlockerV1[] = []
  if (input.plan_status !== 'frozen') {
    blockers.push(blocker('PLAN_NOT_FROZEN', 'TaskPlan revision is not frozen.', 'FREEZE_VALID_PLAN'))
  }
  if (input.plan_revision_id !== input.expected_plan_revision_id) {
    blockers.push(blocker('PLAN_IDENTITY_DRIFT', 'TaskPlan revision no longer matches the admitted identity.', 'REFRESH_PLAN_IDENTITY'))
  }
  if (!input.schedule_valid) {
    blockers.push(blocker('SCHEDULE_INVALID', 'Task schedule compilation failed.', 'FIX_PLAN_GRAPH'))
  }
  if (input.interaction_policy === 'invalid') {
    blockers.push(blocker('INTERACTION_POLICY_INVALID', 'Interaction policy is invalid or unavailable.', 'RESTORE_INTERACTION_POLICY'))
  }
  if (!input.evidence_verified) {
    blockers.push(blocker('EVIDENCE_MISSING', 'Required Skill or decision evidence is missing.', 'RESTORE_BOUND_EVIDENCE'))
  }
  if (!input.execute_permission) {
    blockers.push(blocker('EXECUTE_PERMISSION_DENIED', 'Effective permissions do not allow execution.', 'GRANT_EXECUTE_PERMISSION'))
  }
  if (input.hard_confirmation_required && !input.hard_confirmation_satisfied) {
    blockers.push(blocker('HARD_CONFIRMATION_REQUIRED', 'A hard confirmation boundary is unresolved.', 'REQUEST_HARD_CONFIRMATION'))
  }
  if (
    input.interaction_policy === 'recommended-defaults'
    && input.routine_decision_required
    && !input.routine_decision_evidence
  ) {
    blockers.push(blocker(
      'ROUTINE_DECISION_EVIDENCE_MISSING',
      'Recommended default decision lacks a bound DecisionEvent.',
      'RECORD_ROUTINE_DECISION',
    ))
  }
  return blockers.length === 0 ? { status: 'admitted', blockers } : { status: 'blocked', blockers }
}
