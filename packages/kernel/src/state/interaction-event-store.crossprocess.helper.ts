import { createInteractionEventRecorder, createStateStore, type InteractionEventRecordDraft } from '../index.js'

const [changeDir, sequenceRaw, delayRaw] = process.argv.slice(2)
if (changeDir === undefined || sequenceRaw === undefined || delayRaw === undefined) {
  throw new Error('interaction cross-process helper arguments missing')
}
const sequence = Number(sequenceRaw)
if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error('interaction cross-process helper sequence invalid')
const delay = Number(delayRaw)
if (!Number.isSafeInteger(delay) || delay < 0) throw new Error('interaction cross-process helper delay invalid')
const draft: InteractionEventRecordDraft = {
  journeyId: 'sha256:' + 'b'.repeat(64),
  occurredAt: `2026-08-10T00:00:0${sequence}.000Z`,
  change: 'change-46',
  runId: 'run-46',
  workflow: 'default',
  workflowHash: 'a'.repeat(64),
  originStepVisit: { runId: 'run-46', transitionSequence: 4, step: 'verify' },
  stepVisit: { runId: 'run-46', transitionSequence: 4, step: 'verify' },
  stateBeforeHash: 'c'.repeat(64),
  stateAfterHash: 'c'.repeat(64),
  actor: 'human',
  surface: 'cli',
  executionMode: 'interactive',
  workflowMode: 'default',
  track: 'backend',
  trackKind: 'built-in',
  pipelineStage: 'verify',
  controlStage: 'verification',
  event: 'review.requested',
  reasonCode: 'review.required',
  triggerCode: 'review.exit-requested',
  effectCode: 'review-gate.pending',
  result: 'success',
  outcomeCode: 'review.requested',
  durationMs: 1,
}
const recorder = createInteractionEventRecorder()
await createStateStore().withLock(changeDir, async () => {
  if (delay > 0) await new Promise<void>((resolve) => setTimeout(resolve, delay))
  await recorder.recordUnderLock(changeDir, draft)
})
