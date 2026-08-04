import { describe, expect, it } from 'vitest'
import {
  compileAutomationPolicySnapshot,
  type LoopEntry,
} from '@tenon/kernel'
import { inspectVerifiedAfkInteractionReceipt } from '../../kernel/dist/skill-invocation/afk-interaction-receipt.js'
import { markLoopPrepared, type ExecutionContext } from './admission/execution-context.js'
import { canonicalAfkInteractionReceipts } from './skillInvocationAfkInteractionPolicy.js'

const policy = () => compileAutomationPolicySnapshot({
  id: 'loop-1', name: 'Loop', kind: 'continuous', goal: 'Build safely', cadence: 'manual', risk: 'low',
  runner: 'codex', change_prefix: 'demo', phases: [], human_gates: [], state: 'iteration', design_doc: 'GOAL.md',
  status: 'active', budget: { max_runs_per_day: 2, max_in_flight: 1, on_exceed: 'pause' }, kill_criteria: [],
  autonomy_level: 'L2', allowlist: ['src/**'], denylist: [], skill_bundle_id: 'bundle-1',
} satisfies LoopEntry, { capturedAt: '2026-08-04T00:00:00.000Z' })

const context = (automationPolicy = policy()) => markLoopPrepared({
  attempt_id: 'attempt-1', reservation_id: 'reservation-1', loop_id: 'loop-1', change: 'demo',
  level: 'L2', runner: 'codex', admitted_at: '2026-08-04T00:00:00.000Z',
  reservation: { runs: 1, tokens: 1024, token_basis: 'risk-default' },
  workflow_run_id: 'run-1', policy_epoch: 'policy-1', skill_bundle_id: 'bundle-1',
  automation_policy: automationPolicy,
} satisfies ExecutionContext, {
  snapshotSha256: 'a'.repeat(64), casRelativePath: '.pipeline/skill-bundles/a',
  resolutionSource: 'default',
  slots: [{ token: 'build', alternatives: ['tenon-build'], concreteSkillId: 'tenon-build', treeSha256: 'b'.repeat(64) }],
})

describe('canonical AFK InteractionPolicy producer', () => {
  it('issues a real opaque receipt from the frozen budget rule', async () => {
    const [receipt] = await canonicalAfkInteractionReceipts(context(), '2026-08-04T00:01:00.000Z')
    expect(receipt).toBeDefined()
    expect(inspectVerifiedAfkInteractionReceipt(receipt!)).toMatchObject({
      skill_id: 'tenon-build',
      question: { key: 'automation.budget.on-exceed', shown: false, requiredness: 'routine' },
      decision: {
        mode: 'recommended-default', selected_option_ids: ['pause-loop'],
        policy: { id: 'loop-1', rule_id: 'budget.on-exceed' },
        rationale_code: 'frozen-automation-policy',
      },
    })
  })

  it('rejects a policy whose content no longer matches its frozen version', async () => {
    const frozen = policy()
    const forged = { ...frozen, goal: 'forged goal' }
    await expect(canonicalAfkInteractionReceipts(
      context(forged), '2026-08-04T00:01:00.000Z',
    )).rejects.toThrow(/content digest mismatch/u)
  })
})
