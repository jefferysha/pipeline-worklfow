import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createInteractionEventRecorder,
  createStateStore,
  interactionLineHash,
  readInteractionProjection,
  type InteractionEventRecordDraft,
} from '../index.js'

const execFileAsync = promisify(execFile)
const roots: string[] = []
const HASH = 'a'.repeat(64)
const JOURNEY = 'sha256:' + 'b'.repeat(64)
const STATE = 'c'.repeat(64)

function draft(sequence: number): InteractionEventRecordDraft {
  return {
    journeyId: JOURNEY,
    occurredAt: `2026-08-10T00:00:0${sequence}.000Z`,
    change: 'change-46',
    runId: 'run-46',
    workflow: 'default',
    workflowHash: HASH,
    originStepVisit: { runId: 'run-46', transitionSequence: 4, step: 'verify' },
    stepVisit: { runId: 'run-46', transitionSequence: 4, step: 'verify' },
    stateBeforeHash: STATE,
    stateAfterHash: STATE,
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
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('interaction projection cross-process append', () => {
  it('serializes two real lock holders into one sequence/hash chain', async () => {
    const root = await mkdtemp(join(tmpdir(), 'interaction-store-crossprocess-'))
    roots.push(root)
    const store = createStateStore()
    const recorder = createInteractionEventRecorder()
    await store.withLock(root, async () => { await recorder.recordUnderLock(root, draft(1)) })
    const helper = join(process.cwd(), 'packages/kernel/src/state/interaction-event-store.crossprocess.helper.ts')
    const viteNode = join(process.cwd(), 'node_modules/.bin/vite-node')
    const run = (event: number, delay: number) => execFileAsync(viteNode, [helper, root, String(event), String(delay)], {
      cwd: process.cwd(),
      env: process.env,
    })
    await Promise.all([run(2, 100), run(3, 0)])
    const projection = await readInteractionProjection(root)
    expect(projection.kind).toBe('valid')
    if (projection.kind !== 'valid') return
    expect(projection.events.map((event) => event.sequence)).toEqual([1, 2, 3])
    expect(new Set(projection.events.map((event) => event.eventId)).size).toBe(3)
    expect(projection.events[1]?.previousEventHash).not.toBeNull()
    expect(projection.events[2]?.previousEventHash).toBe(
      projection.rawLines[1] === undefined ? undefined : interactionLineHash(projection.rawLines[1]),
    )
  })
})
