import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { nodeMemFs, type MemContentReadBudget, type MemFs } from './fs.js'
import { walkDirForRelatedSearch } from './paths.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('Related Sessions production filesystem discovery', () => {
  test('rechecks the deadline while ranking entries from one directory', () => {
    let checks = 0
    let mtimeReads = 0
    let truncated = 0
    const entries = ['one.jsonl', 'two.jsonl', 'three.jsonl']
      .map((name) => ({ name, isFile: true, isDirectory: false }))
    const budget: MemContentReadBudget = {
      perSourceBytes: 1024,
      remainingBytes: () => 1024,
      consume: () => undefined,
      noteSourceUnavailable: () => undefined,
      noteSourceTruncated: () => undefined,
      noteTotalExhausted: () => undefined,
      remainingDiscoveryEntries: () => 10,
      consumeDiscoveryEntries: () => undefined,
      remainingDiscoveryFiles: () => 8,
      consumeDiscoveryFiles: () => undefined,
      shouldContinueDiscovery: () => checks++ < 2,
      maxDiscoveryDepth: 8,
      maxDiscoveryFiles: 8,
      noteDiscoveryTruncated: () => { truncated += 1 },
    }
    const fs: MemFs = {
      home: '/home/u',
      exists: () => true,
      readDir: () => entries,
      readText: () => undefined,
      mtimeMs: () => {
        mtimeReads += 1
        return mtimeReads
      },
      contentReadBudget: budget,
    }

    const files = walkDirForRelatedSearch(fs, '/sessions', () => true, 8, 'codex')

    expect(files).toHaveLength(1)
    expect(mtimeReads).toBe(1)
    expect(truncated).toBeGreaterThan(0)
  })

  test('caps a large directory before materializing all entries and yields back to the event loop', async () => {
    const home = await mkdtemp(join(tmpdir(), 'tenon-mem-discovery-'))
    roots.push(home)
    const sessions = join(home, '.codex', 'sessions', '2026', '07', '28')
    await mkdir(sessions, { recursive: true })
    for (let start = 0; start < 2_000; start += 200) {
      await Promise.all(Array.from({ length: 200 }, (_, offset) => (
        writeFile(join(sessions, `rollout-${String(start + offset).padStart(5, '0')}.jsonl`), '')
      )))
    }

    let discoveryEntries = 0
    let truncated = 0
    const discoveryLimit = 128
    const budget: MemContentReadBudget = {
      perSourceBytes: 1024,
      remainingBytes: () => 1024,
      consume: () => undefined,
      noteSourceUnavailable: () => undefined,
      noteSourceTruncated: () => undefined,
      noteTotalExhausted: () => undefined,
      remainingDiscoveryEntries: () => discoveryLimit - discoveryEntries,
      consumeDiscoveryEntries: (_source, entries) => { discoveryEntries += entries },
      remainingDiscoveryFiles: () => 64,
      consumeDiscoveryFiles: () => undefined,
      shouldContinueDiscovery: () => discoveryEntries < discoveryLimit,
      maxDiscoveryDepth: 8,
      maxDiscoveryFiles: 64,
      noteDiscoveryTruncated: () => { truncated += 1 },
    }
    const source = nodeMemFs(home)
    const fs: MemFs = { ...source, contentReadBudget: budget }
    const timerStarted = performance.now()
    const timer = new Promise<number>((resolve) => {
      setTimeout(() => resolve(performance.now() - timerStarted), 0)
    })

    const files = walkDirForRelatedSearch(
      fs,
      join(home, '.codex', 'sessions'),
      (path) => path.endsWith('.jsonl'),
      64,
      'codex',
    )
    const timerDelay = await timer

    expect(files.length).toBeLessThanOrEqual(64)
    expect(discoveryEntries).toBeLessThanOrEqual(discoveryLimit)
    expect(truncated).toBeGreaterThan(0)
    expect(timerDelay).toBeLessThan(2_500)
  })

  test('shares the accepted-file ceiling across traversals without flagging an exact bounded read', () => {
    let remainingFiles = 2
    let truncated = 0
    const budget: MemContentReadBudget = {
      perSourceBytes: 1024,
      remainingBytes: () => 1024,
      consume: () => undefined,
      noteSourceUnavailable: () => undefined,
      noteSourceTruncated: () => undefined,
      noteTotalExhausted: () => undefined,
      remainingDiscoveryEntries: () => 2,
      consumeDiscoveryEntries: () => undefined,
      remainingDiscoveryFiles: () => remainingFiles,
      consumeDiscoveryFiles: (_source, files) => { remainingFiles -= files },
      shouldContinueDiscovery: () => true,
      maxDiscoveryDepth: 8,
      maxDiscoveryFiles: 2,
      noteDiscoveryTruncated: () => { truncated += 1 },
    }
    const exactEntries = [
      { name: 'one.jsonl', isFile: true, isDirectory: false },
      { name: 'two.jsonl', isFile: true, isDirectory: false },
    ]
    const fs: MemFs = {
      home: '/home/u',
      exists: () => true,
      readDir: () => exactEntries,
      readDirBounded: () => ({
        entries: exactEntries,
        unavailable: false,
        truncated: false,
      }),
      readText: () => undefined,
      mtimeMs: () => 1,
      contentReadBudget: budget,
    }

    expect(walkDirForRelatedSearch(fs, '/first', () => true, 2, 'codex')).toHaveLength(2)
    expect(truncated).toBe(0)
    expect(walkDirForRelatedSearch(fs, '/second', () => true, 2, 'codex')).toEqual([])
    expect(truncated).toBe(1)
  })

  test('enforces the deadline inside the production bounded directory reader', async () => {
    const home = await mkdtemp(join(tmpdir(), 'tenon-mem-deadline-'))
    roots.push(home)
    await Promise.all(['one', 'two', 'three'].map((name) => writeFile(join(home, name), '')))
    let checks = 0

    const read = nodeMemFs(home).readDirBounded?.(home, 10, () => checks++ < 1)

    expect(read?.entries).toHaveLength(1)
    expect(read?.truncated).toBe(true)
  })
})
