import { createHash } from 'node:crypto'
import { diffWireFieldsToEffects } from './run-metadata.js'
import {
  RunStateCorruptError,
  type RunRevision,
} from './run-revision-codec.js'

function ownRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  return Object.fromEntries(Object.entries(value))
}

/** Core run identity/head invariants shared by publish and all canonical readers. */
export function assertRunMetadataContinuity(
  current: RunRevision,
  previous: RunRevision,
): void {
  const before = previous.state.runMetadata
  const after = current.state.runMetadata
  if (current.mutation.kind === 'transition') {
    if (after === undefined
      || (before !== undefined && after.runId !== before.runId)
      || after.transitionSequence !== (before?.transitionSequence ?? 0) + 1
      || after.transitionHead !== current.mutation.transitionRecordId) {
      throw new RunStateCorruptError('transition revision 的 runMetadata head/sequence 链不连续')
    }
    return
  }
  if (before === undefined) {
    if (after !== undefined
      && (after.transitionSequence !== 0 || after.transitionHead !== undefined)) {
      throw new RunStateCorruptError('非 transition revision 不得伪造历史 transition head')
    }
    return
  }
  if (after === undefined
    || after.runId !== before.runId
    || after.transitionSequence !== before.transitionSequence
    || after.transitionHead !== before.transitionHead) {
    throw new RunStateCorruptError('非 transition revision 不得改写 runMetadata head/sequence')
  }
}

export function assertMutationEffects(current: RunRevision, previous: RunRevision): void {
  const expected = diffWireFieldsToEffects(previous.state.fields, current.state.fields)
  if (JSON.stringify(current.mutation.effects) !== JSON.stringify(expected)) {
    throw new RunStateCorruptError('canonical mutation.effects 与 previous→current 真实 diff 不一致')
  }
  assertRunMetadataContinuity(current, previous)
}

export function assertTransitionRevisionLink(
  current: RunRevision,
  transition: unknown,
  raw: string,
  previous?: RunRevision,
): void {
  const observedDigest = createHash('sha256').update(raw).digest('hex')
  if (observedDigest !== current.mutation.transitionRecordDigest) {
    throw new RunStateCorruptError('TransitionRecord digest 与 canonical revision 审计绑定不一致')
  }
  const metadata = current.state.runMetadata
  if (metadata === undefined || metadata.transitionHead === undefined
    || metadata.transitionSequence < 1) {
    throw new RunStateCorruptError('transition revision 缺 canonical run head/sequence')
  }
  const record = ownRecord(transition)
  if (record === undefined) throw new RunStateCorruptError('transition revision 引用的 TransitionRecord 缺失')
  if (record.id !== current.mutation.transitionRecordId
    || record.sequence !== metadata.transitionSequence
    || record.runId !== metadata.runId
    || (previous !== undefined
      && record.previousRecordId !== previous.state.runMetadata?.transitionHead)
    || JSON.stringify(record.effects) !== JSON.stringify(current.mutation.effects)) {
    throw new RunStateCorruptError('transition revision 与 TransitionRecord 不一致')
  }
}

export function assertDirectPredecessor(
  revision: RunRevision,
  previous: RunRevision | undefined,
): RunRevision {
  if (revision.revision < 1 || previous === undefined) {
    throw new RunStateCorruptError('transition revision 引用的 previous revision 缺失')
  }
  if (previous.revisionId !== revision.previousRevisionId
    || previous.revision !== revision.revision - 1) {
    throw new RunStateCorruptError('transition revision 引用的 previous revision 身份不一致')
  }
  assertMutationEffects(revision, previous)
  return previous
}
