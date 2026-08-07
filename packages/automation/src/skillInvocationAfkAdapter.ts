import type {
  SkillInvocationAdapterProofV1,
  SkillInvocationSubjectV1,
} from '@tenon/kernel'
import type { PreparedExecutionContext } from './admission/execution-context.js'

export class AfkSkillInvocationBindingError extends Error {
  override readonly name = 'AfkSkillInvocationBindingError'
}

export interface AfkSkillInvocationProof {
  readonly adapter: SkillInvocationAdapterProofV1
  readonly attempt: { readonly attempt_id: string; readonly reservation_id: string }
}

/** Bind evidence to the already-prepared AFK ticket; a bundle snapshot alone never proves a call. */
export function afkSkillInvocationAdapterProof(
  context: PreparedExecutionContext,
  subject: SkillInvocationSubjectV1,
  proofRef: string,
): AfkSkillInvocationProof {
  if (
    context.preparedKind !== 'loop-bundle'
    || context.workflow_run_id === undefined
    || subject.workflow_run_id !== context.workflow_run_id
    || subject.step_visit.run_id !== context.workflow_run_id
    || subject.attempt?.attempt_id !== context.attempt_id
    || subject.attempt.reservation_id !== context.reservation_id
  ) throw new AfkSkillInvocationBindingError('AFK invocation does not match the prepared run/attempt/reservation')
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,191}$/u.test(proofRef) || proofRef.includes('..')) {
    throw new AfkSkillInvocationBindingError('AFK invocation proof reference is invalid')
  }
  return {
    adapter: { kind: 'afk', proof_ref: proofRef },
    attempt: { attempt_id: context.attempt_id, reservation_id: context.reservation_id },
  }
}
