import { lstat, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  appendInteractionEventUnderLock,
  createInteractionEvent,
  INTERACTION_MAX_BYTES,
  interactionLineHash,
  interactionProjectionPath,
  readInteractionProjection,
  serializeInteractionEvent,
  type InteractionEventV1,
  InteractionProjectionError,
} from '../index.js'

const HASH = 'a'.repeat(64)
const JOURNEY = 'sha256:' + 'b'.repeat(64)
const STATE = 'c'.repeat(64)
const roots: string[] = []

function makeEvent(sequence: number, previousEventHash: string | null): InteractionEventV1 {
  return createInteractionEvent({
    sequence,
    previousEventHash,
    journeyId: JOURNEY,
    occurredAt: '2026-08-10T00:00:0' + String(sequence) + '.000Z',
    change: 'change-46',
    runId: 'run-46',
    workflow: 'default',
    workflowHash: HASH,
    originStepVisit: { runId: 'run-46', transitionSequence: 4, step: 'verify' },
    stepVisit: { runId: 'run-46', transitionSequence: sequence, step: 'verify' },
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
  })
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('interaction JSONL projection store', () => {
  it('distinguishes a missing projection and appends a bounded hash chain', async () => {
    const root = await mkdtemp(join(tmpdir(), 'interaction-store-'))
    roots.push(root)
    expect(await readInteractionProjection(root)).toEqual({
      kind: 'missing',
      path: interactionProjectionPath(root),
      diagnostic: 'projection-unavailable',
    })

    const first = makeEvent(1, null)
    await appendInteractionEventUnderLock(root, first)
    const firstRaw = serializeInteractionEvent(first)
    const second = makeEvent(2, interactionLineHash(firstRaw))
    await appendInteractionEventUnderLock(root, second)

    const projection = await readInteractionProjection(root)
    expect(projection.kind).toBe('valid')
    if (projection.kind !== 'valid') return
    expect(projection.events).toEqual([first, second])
    expect(projection.rawLines).toEqual([firstRaw, serializeInteractionEvent(second)])
    expect(await readFile(interactionProjectionPath(root), 'utf8')).toBe(
      firstRaw + serializeInteractionEvent(second),
    )
  })

  it('fails loud on sequence gaps, hash mismatches, truncated lines and symlinks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'interaction-store-'))
    roots.push(root)
    const first = makeEvent(1, null)
    const path = interactionProjectionPath(root)
    await writeFile(path, serializeInteractionEvent(makeEvent(2, null)), 'utf8')
    await expect(readInteractionProjection(root)).rejects.toMatchObject({ diagnostic: 'sequence-gap' })

    await writeFile(path, serializeInteractionEvent(first) + serializeInteractionEvent(makeEvent(2, null)), 'utf8')
    await expect(readInteractionProjection(root)).rejects.toMatchObject({ diagnostic: 'hash-chain-mismatch' })

    await writeFile(path, serializeInteractionEvent(first).trimEnd(), 'utf8')
    await expect(readInteractionProjection(root)).rejects.toMatchObject({ diagnostic: 'event-schema-invalid' })

    await rm(path)
    const target = join(root, 'target.jsonl')
    await writeFile(target, serializeInteractionEvent(first), 'utf8')
    await symlink(target, path)
    await expect(readInteractionProjection(root)).rejects.toMatchObject({ diagnostic: 'projection-not-regular' })
    await expect(lstat(path)).resolves.toMatchObject({ isSymbolicLink: expect.any(Function) })
  })

  it('rejects an oversized projection before parsing or appending', async () => {
    const root = await mkdtemp(join(tmpdir(), 'interaction-store-'))
    roots.push(root)
    await writeFile(interactionProjectionPath(root), 'x'.repeat(INTERACTION_MAX_BYTES + 1), 'utf8')
    await expect(readInteractionProjection(root)).rejects.toMatchObject({ diagnostic: 'projection-size-exceeded' })
  })

  it('rejects an append that does not continue the existing chain', async () => {
    const root = await mkdtemp(join(tmpdir(), 'interaction-store-'))
    roots.push(root)
    await appendInteractionEventUnderLock(root, makeEvent(1, null))
    await expect(appendInteractionEventUnderLock(root, makeEvent(3, null)))
      .rejects.toBeInstanceOf(InteractionProjectionError)
    await expect(appendInteractionEventUnderLock(root, makeEvent(3, null)))
      .rejects.toMatchObject({ diagnostic: 'sequence-gap' })
  })
})
