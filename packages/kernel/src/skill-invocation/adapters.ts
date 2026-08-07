import type { HistoryEntry } from '../types.js'
import type { SkillInvocationAdapterProofV1, SkillInvocationEventV1 } from './types.js'

export class SkillInvocationAdapterProofError extends Error {
  override readonly name = 'SkillInvocationAdapterProofError'
}

export interface NativeSkillInvocationCompletion {
  readonly proof_ref: string
  readonly invocation_completed: boolean
  readonly input_validated: boolean
  readonly output_validated: boolean
}

/** Native hosts may mint completion proof only after both declared contracts and the call complete. */
export function nativeSkillInvocationAdapterProof(
  completion: NativeSkillInvocationCompletion,
): SkillInvocationAdapterProofV1 {
  if (!completion.invocation_completed || !completion.input_validated || !completion.output_validated) {
    throw new SkillInvocationAdapterProofError('native invocation completion is incomplete or unvalidated')
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,191}$/u.test(completion.proof_ref) || completion.proof_ref.includes('..')) {
    throw new SkillInvocationAdapterProofError('native invocation proof reference is invalid')
  }
  return { kind: 'native', proof_ref: completion.proof_ref }
}

/** One-way legacy projection. History readers can observe completion but cannot mint v1 evidence from it. */
export function skillInvocationCompletedToHistoryEntry(
  event: Extract<SkillInvocationEventV1, { type: 'invocation-completed' }>,
  skill: { readonly id: string; readonly version: string },
): HistoryEntry {
  return {
    ts: event.recorded_at,
    kind: 'tool',
    raw: `SkillInvocationCompleted: ${skill.id}@${skill.version} invocation=${event.invocation_id}`,
  }
}
