import { describe, expect, it } from 'vitest'
import { evaluateTaskRunAdmission } from './admission.js'

const base = {
  plan_status: 'frozen' as const,
  plan_revision_id: 'revision',
  expected_plan_revision_id: 'revision',
  schedule_valid: true,
  interaction_policy: 'recommended-defaults' as const,
  evidence_verified: true,
  execute_permission: true,
  hard_confirmation_required: false,
  hard_confirmation_satisfied: false,
  routine_decision_required: true,
  routine_decision_evidence: true,
}

describe('evaluateTaskRunAdmission', () => {
  it('admits a recommended default only with routine decision evidence', () => {
    expect(evaluateTaskRunAdmission(base)).toEqual({ status: 'admitted', blockers: [] })

    const missing = evaluateTaskRunAdmission({ ...base, routine_decision_evidence: false })
    expect(missing.status).toBe('blocked')
    expect(missing.blockers).toMatchObject([{ code: 'ROUTINE_DECISION_EVIDENCE_MISSING' }])
  })

  it('fails closed at a hard confirmation boundary', () => {
    const result = evaluateTaskRunAdmission({
      ...base,
      hard_confirmation_required: true,
      hard_confirmation_satisfied: false,
    })

    expect(result.status).toBe('blocked')
    expect(result.blockers).toMatchObject([{ code: 'HARD_CONFIRMATION_REQUIRED' }])
  })

  it.each([
    ['PLAN_NOT_FROZEN', { plan_status: 'draft' as const }],
    ['PLAN_IDENTITY_DRIFT', { plan_revision_id: 'other' }],
    ['SCHEDULE_INVALID', { schedule_valid: false }],
    ['EVIDENCE_MISSING', { evidence_verified: false }],
    ['EXECUTE_PERMISSION_DENIED', { execute_permission: false }],
  ])('returns %s and zero admission', (code, override) => {
    const result = evaluateTaskRunAdmission({ ...base, ...override })
    expect(result.status).toBe('blocked')
    expect(result.blockers.some((blocker) => blocker.code === code)).toBe(true)
  })
})
