import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SourceCheckpoint } from '@tenon/kernel'
import {
  createTriageCheckpointStore,
  triageCheckpointFilePath,
  TriageCheckpointStoreError,
  type TriageCheckpointKey,
} from './checkpoint-store.js'

const key: TriageCheckpointKey = {
  sourceId: 'repo-main',
  actionKind: 'git-commits',
}

const checkpoint = (cursor: string): SourceCheckpoint => ({
  schemaVersion: 1,
  sourceId: key.sourceId,
  actionKind: key.actionKind,
  cursor,
})

let repoRoot: string

beforeEach(async () => {
  repoRoot = await mkdtemp(join(tmpdir(), 'triage-checkpoints-'))
})

afterEach(async () => {
  await rm(repoRoot, { recursive: true, force: true })
})

describe('triage checkpoint store', () => {
  it('starts at revision 0 and atomically persists a source/action-bound checkpoint', async () => {
    const store = createTriageCheckpointStore({ repoRoot })

    expect(await store.read(key)).toEqual({ key, revision: 0, checkpoint: null })
    await expect(store.compareAndSet(key, 0, checkpoint('a'))).resolves.toBe(true)

    expect(await store.read(key)).toEqual({
      key,
      revision: 1,
      checkpoint: checkpoint('a'),
    })
  })

  it('serializes concurrent CAS so exactly one writer wins and the loser cannot overwrite it', async () => {
    const store = createTriageCheckpointStore({ repoRoot })

    const outcomes = await Promise.all([
      store.compareAndSet(key, 0, checkpoint('left')),
      store.compareAndSet(key, 0, checkpoint('right')),
    ])

    expect(outcomes.filter(Boolean)).toHaveLength(1)
    const persisted = await store.read(key)
    expect(persisted.revision).toBe(1)
    expect(['left', 'right']).toContain(persisted.checkpoint?.cursor)
    await expect(
      store.compareAndSet(key, 0, checkpoint('stale-overwrite')),
    ).resolves.toBe(false)
    expect((await store.read(key)).checkpoint?.cursor).toBe(persisted.checkpoint?.cursor)
  })

  it('serializes a whole source/action orchestration lease independently from the short CAS lock', async () => {
    const store = createTriageCheckpointStore({ repoRoot })
    let active = 0
    let maxActive = 0
    const entered: string[] = []

    await Promise.all(['left', 'right'].map((name) => store.withRunLock(
      key,
      new AbortController().signal,
      async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      entered.push(name)
      await new Promise((resolve) => setTimeout(resolve, 10))
      active -= 1
      },
    )))

    expect(maxActive).toBe(1)
    expect(entered).toHaveLength(2)
  })

  it('aborts a queued run-lock waiter immediately and never executes its work later', async () => {
    const store = createTriageCheckpointStore({ repoRoot })
    let releaseHolder!: () => void
    let announceHolder!: () => void
    const holderEntered = new Promise<void>((resolve) => { announceHolder = resolve })
    const holderRelease = new Promise<void>((resolve) => { releaseHolder = resolve })
    const holder = store.withRunLock(key, new AbortController().signal, async () => {
      announceHolder()
      await holderRelease
    })
    await holderEntered

    const abort = new AbortController()
    const work = vi.fn(async () => undefined)
    const startedAt = Date.now()
    const waiter = store.withRunLock(key, abort.signal, work)
    abort.abort(new Error('cancel-lock-wait'))

    await expect(waiter).rejects.toThrow('cancel-lock-wait')
    expect(Date.now() - startedAt).toBeLessThan(500)
    expect(work).not.toHaveBeenCalled()

    releaseHolder()
    await holder
    await new Promise((resolve) => setTimeout(resolve, 25))
    expect(work).not.toHaveBeenCalled()
  })

  it('rejects checkpoints bound to another source or action before taking the write lock', async () => {
    const store = createTriageCheckpointStore({ repoRoot })
    const foreign = { ...checkpoint('foreign'), sourceId: 'repo-other' }

    await expect(store.compareAndSet(key, 0, foreign)).rejects.toMatchObject({
      _tag: 'TriageCheckpointStoreError',
      reason: 'binding-mismatch',
    } satisfies Partial<TriageCheckpointStoreError>)
    expect(await store.read(key)).toMatchObject({ revision: 0, checkpoint: null })
  })

  it('rejects MAX_SAFE_INTEGER as a CAS expectation instead of writing an unsafe next revision', async () => {
    const store = createTriageCheckpointStore({ repoRoot })

    await expect(
      store.compareAndSet(key, Number.MAX_SAFE_INTEGER, checkpoint('overflow')),
    ).rejects.toMatchObject({
      _tag: 'TriageCheckpointStoreError',
      reason: 'invalid-checkpoint',
    } satisfies Partial<TriageCheckpointStoreError>)
    expect(await store.read(key)).toMatchObject({ revision: 0, checkpoint: null })
  })

  it('fails loud on malformed or unknown-field durable data instead of treating it as no checkpoint', async () => {
    const path = triageCheckpointFilePath(repoRoot, key)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify({
      schemaVersion: 1,
      sourceId: key.sourceId,
      actionKind: key.actionKind,
      revision: 7,
      checkpoint: checkpoint('hidden-corruption'),
      ignoredPrivilege: true,
    }), 'utf8')

    await expect(createTriageCheckpointStore({ repoRoot }).read(key)).rejects.toMatchObject({
      _tag: 'TriageCheckpointStoreError',
      reason: 'corrupt',
    } satisfies Partial<TriageCheckpointStoreError>)
  })
})
