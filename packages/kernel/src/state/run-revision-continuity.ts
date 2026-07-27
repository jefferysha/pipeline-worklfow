import {
  RunStateCorruptError,
  type RunRevision,
} from './run-revision-codec.js'

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
