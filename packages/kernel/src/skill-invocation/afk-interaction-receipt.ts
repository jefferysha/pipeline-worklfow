import type { SkillInvocationDecisionPayloadV1, SkillInvocationQuestionPayloadV1 } from './types.js'

export interface AfkInteractionPolicyReceiptInputV1 {
  readonly schema_version: 'afk-interaction-policy-receipt/v1'
  readonly attempt_id: string
  readonly reservation_id: string
  readonly snapshot_sha256: string
  readonly skill_id: string
  readonly recorded_at: string
  readonly question: SkillInvocationQuestionPayloadV1
  readonly decision: SkillInvocationDecisionPayloadV1
}

export interface VerifiedAfkInteractionReceipt {
  readonly schema_version: 'verified-afk-interaction-receipt/v1'
}

const inputs = new WeakMap<object, AfkInteractionPolicyReceiptInputV1>()

function semanticReceipt(input: AfkInteractionPolicyReceiptInputV1): boolean {
  return input.question.shown === false
    && input.question.requiredness !== 'hard-gate'
    && input.decision.mode === 'recommended-default'
    && input.decision.question_id === input.question.question_id
    && input.decision.selected_option_ids.length > 0
    && input.decision.selected_option_ids.every((option) => input.question.option_ids.includes(option))
    && input.decision.policy !== undefined
    && input.decision.rationale_code !== undefined
}

/** Upstream InteractionPolicy adapter must verify the exact frozen rule before this issues a receipt. */
export async function issueVerifiedAfkInteractionReceipt(
  input: AfkInteractionPolicyReceiptInputV1,
  verifyFrozenPolicy: (input: AfkInteractionPolicyReceiptInputV1) => Promise<boolean>,
): Promise<VerifiedAfkInteractionReceipt> {
  if (!semanticReceipt(input) || !await verifyFrozenPolicy(structuredClone(input))) {
    throw new Error('AFK default is not authorized by the exact frozen interaction policy')
  }
  const receipt = Object.freeze({ schema_version: 'verified-afk-interaction-receipt/v1' as const })
  inputs.set(receipt, structuredClone(input))
  return receipt
}

export function inspectVerifiedAfkInteractionReceipt(
  receipt: VerifiedAfkInteractionReceipt,
): AfkInteractionPolicyReceiptInputV1 | undefined {
  const input = inputs.get(receipt)
  return input === undefined ? undefined : structuredClone(input)
}

export function consumeVerifiedAfkInteractionReceipt(receipt: VerifiedAfkInteractionReceipt): void {
  if (!inputs.delete(receipt)) throw new Error('AFK interaction receipt was not issued or was already consumed')
}
