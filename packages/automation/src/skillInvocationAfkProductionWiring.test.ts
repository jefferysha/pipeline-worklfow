import { beforeEach, describe, expect, it, vi } from 'vitest'

const producer = vi.hoisted(() => ({
  finish: vi.fn(async () => {}),
  issue: vi.fn(async () => Object.freeze({ schema_version: 'verified-afk-interaction-receipt/v1' as const })),
  start: vi.fn(async () => []),
}))

vi.mock('../../kernel/dist/skill-invocation/producer-internal.js', () => ({
  finishDurableAfkSkillInvocations: producer.finish,
  issueVerifiedAfkInteractionReceipt: producer.issue,
  startDurableAfkSkillInvocations: producer.start,
}))

import { compileAutomationPolicySnapshot, type LoopEntry } from '@tenon/kernel'
import { markLoopPrepared, type ExecutionContext } from './admission/execution-context.js'
import { createAfkSkillInvocationLifecycle } from './skillInvocationAfkLifecycle.js'

const frozenPolicy = () => compileAutomationPolicySnapshot({
  id: 'loop-1', name: 'Loop', kind: 'continuous', goal: 'Build safely', cadence: 'manual', risk: 'low',
  runner: 'codex', change_prefix: 'demo', phases: [], human_gates: [], state: 'iteration', design_doc: 'GOAL.md',
  status: 'active', budget: { max_runs_per_day: 2, max_in_flight: 1, on_exceed: 'pause' }, kill_criteria: [],
  autonomy_level: 'L2', allowlist: ['src/**'], denylist: [], skill_bundle_id: 'bundle-1',
} satisfies LoopEntry, { capturedAt: '2026-08-04T00:00:00.000Z' })

describe('production AFK recommended-default wiring', () => {
  beforeEach(() => vi.clearAllMocks())

  it('issues from the canonical frozen policy before starting the durable invocation', async () => {
    const prepared = markLoopPrepared({
      attempt_id: 'attempt-1', reservation_id: 'reservation-1', loop_id: 'loop-1', change: 'demo',
      level: 'L2', runner: 'codex', admitted_at: '2026-08-04T00:00:00.000Z',
      reservation: { runs: 1, tokens: 1024, token_basis: 'risk-default' },
      workflow_run_id: 'run-1', policy_epoch: 'policy-1', skill_bundle_id: 'bundle-1',
      automation_policy: frozenPolicy(),
    } satisfies ExecutionContext, {
      snapshotSha256: 'a'.repeat(64), casRelativePath: '.pipeline/skill-bundles/a',
      resolutionSource: 'default',
      slots: [{ token: 'build', alternatives: ['tenon-build'], concreteSkillId: 'tenon-build', treeSha256: 'b'.repeat(64) }],
    })
    const lifecycle = createAfkSkillInvocationLifecycle(() => '/canonical/change')
    await lifecycle.start(prepared, '2026-08-04T00:01:00.000Z')

    expect(producer.issue).toHaveBeenCalledOnce()
    expect(producer.issue.mock.calls[0]?.[0]).toMatchObject({
      skill_id: 'tenon-build',
      decision: {
        selected_option_ids: ['pause-loop'],
        policy: { id: 'loop-1', rule_id: 'budget.on-exceed' },
      },
    })
    expect(producer.start).toHaveBeenCalledWith(
      '/canonical/change', 'reservation-1', [expect.objectContaining({ schema_version: 'verified-afk-interaction-receipt/v1' })],
    )
  })
})
