import {
  validateAutomationPolicySnapshot,
  type AfkInteractionPolicyReceiptInputV1,
  type VerifiedAfkInteractionReceipt,
} from '@tenon/kernel'
import { issueVerifiedAfkInteractionReceipt } from '../../kernel/dist/skill-invocation/producer-internal.js'
import type { PreparedExecutionContext } from './admission/execution-context.js'

const BUDGET_ACTIONS = ['skip-run', 'pause-loop', 'halt-round'] as const

/**
 * Production AFK InteractionPolicy adapter. The selected budget action is not caller input: it is
 * re-derived from the immutable, content-addressed AutomationPolicy captured by loop admission.
 */
export async function canonicalAfkInteractionReceipts(
  context: PreparedExecutionContext,
  recordedAt: string,
): Promise<readonly VerifiedAfkInteractionReceipt[]> {
  if (context.preparedKind !== 'loop-bundle' || context.automation_policy === undefined) return []
  const policy = validateAutomationPolicySnapshot(context.automation_policy)
  if (policy.loop_id !== context.loop_id
    || policy.skill_bundle_id !== context.skill_bundle_id
    || !Number.isFinite(Date.parse(recordedAt))) {
    throw new Error('AFK interaction policy does not match the exact prepared execution context')
  }
  const selected = policy.budget.on_exceed
  const receipts: VerifiedAfkInteractionReceipt[] = []
  for (const [index, slot] of context.skillBundle.slots.entries()) {
    const questionId = `afk-budget-action-${index + 1}`
    const expected: AfkInteractionPolicyReceiptInputV1 = {
      schema_version: 'afk-interaction-policy-receipt/v1',
      attempt_id: context.attempt_id,
      reservation_id: context.reservation_id,
      snapshot_sha256: context.skillBundle.snapshotSha256,
      skill_id: slot.concreteSkillId,
      recorded_at: recordedAt,
      question: {
        question_id: questionId,
        key: 'automation.budget.on-exceed',
        schema_id: 'tenon-afk-budget-action/v1',
        option_ids: [...BUDGET_ACTIONS],
        requiredness: 'routine',
        shown: false,
      },
      decision: {
        decision_id: `${questionId}-decision`,
        question_id: questionId,
        mode: 'recommended-default',
        selected_option_ids: [selected],
        policy: {
          id: policy.policy_id,
          version: policy.policy_version,
          rule_id: 'budget.on-exceed',
        },
        rationale_code: 'frozen-automation-policy',
      },
    }
    receipts.push(await issueVerifiedAfkInteractionReceipt(expected, async (candidate) =>
      JSON.stringify(candidate) === JSON.stringify(expected)))
  }
  return Object.freeze(receipts)
}
