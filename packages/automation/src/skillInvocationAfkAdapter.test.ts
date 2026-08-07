import { describe, expect, it } from 'vitest'
import type { SkillInvocationSubjectV1 } from '@tenon/kernel'
import { markLoopPrepared, markNonLoopPrepared, type ExecutionContext } from './admission/execution-context.js'
import { afkSkillInvocationAdapterProof, AfkSkillInvocationBindingError } from './skillInvocationAfkAdapter.js'

const execution: ExecutionContext = {
  attempt_id: 'attempt-1',
  reservation_id: 'reservation-1',
  loop_id: 'loop-1',
  change: 'demo',
  level: 'supervised',
  runner: 'codex',
  admitted_at: '2026-08-03T00:00:00.000Z',
  reservation: { runs: 1, tokens: 1024, token_basis: 'risk-default' },
  workflow_run_id: 'run-1',
  policy_epoch: 'policy-1',
  skill_bundle_id: 'bundle-1',
}

const subject: SkillInvocationSubjectV1 = {
  project_id: 'project-1',
  workflow_definition_id: 'default',
  workflow_run_id: 'run-1',
  step_id: 'build',
  step_visit: { run_id: 'run-1', transition_sequence: 3 },
  attempt: { attempt_id: 'attempt-1', reservation_id: 'reservation-1' },
}

describe('afkSkillInvocationAdapterProof', () => {
  it('binds the exact prepared run, attempt, and reservation', () => {
    const prepared = markLoopPrepared(execution, {
      snapshotSha256: 'a'.repeat(64),
      casRelativePath: '.pipeline/skill-bundles/a',
      resolutionSource: 'default',
      slots: [],
    })
    expect(afkSkillInvocationAdapterProof(prepared, subject, 'attempt-ledger-record-1')).toEqual({
      adapter: { kind: 'afk', proof_ref: 'attempt-ledger-record-1' },
      attempt: { attempt_id: 'attempt-1', reservation_id: 'reservation-1' },
    })
  })

  it('rejects non-loop and cross-reservation evidence', () => {
    const nonLoop = markNonLoopPrepared({ ...execution, skill_bundle_id: undefined })
    expect(() => afkSkillInvocationAdapterProof(nonLoop, subject, 'proof-1'))
      .toThrow(AfkSkillInvocationBindingError)
    const prepared = markLoopPrepared(execution, {
      snapshotSha256: 'a'.repeat(64), casRelativePath: '.pipeline/skill-bundles/a',
      resolutionSource: 'default', slots: [],
    })
    expect(() => afkSkillInvocationAdapterProof(
      prepared,
      { ...subject, attempt: { attempt_id: 'attempt-1', reservation_id: 'other' } },
      'proof-1',
    )).toThrow(AfkSkillInvocationBindingError)
  })
})
