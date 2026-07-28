import { basename, dirname } from 'node:path'
import { describe, expect, test } from 'vitest'
import type { BoundedTextRead, MemDirent, MemFs } from './fs.js'
import {
  RELATED_SESSION_SEARCH_BUDGETS,
  RelatedSessionSearchInputError,
  searchRelatedSessions,
} from './relatedSearch.js'

const PROJECT = '/home/u/work/proj'

function codexFile(id: string): string {
  return `/home/u/.codex/sessions/2026/07/rollout-2026-07-28T12-00-00-${id}.jsonl`
}

function codexSession(
  id: string,
  turns: Array<{ role: 'user' | 'assistant'; text: string }>,
): string {
  const lines = [
    JSON.stringify({
      timestamp: '2026-07-28T12:00:00Z',
      payload: { id, cwd: PROJECT },
    }),
  ]
  for (const turn of turns) {
    lines.push(JSON.stringify({
      payload: {
        type: 'message',
        role: turn.role,
        content: [{
          type: turn.role === 'user' ? 'input_text' : 'output_text',
          text: turn.text,
        }],
      },
    }))
  }
  return lines.join('\n')
}

function boundedFakeFs(
  files: Record<string, string>,
  options: {
    mtimes?: Record<string, number>
    onRead?: (path: string, maxBytes: number) => void
  } = {},
): MemFs {
  const fileSet = new Set(Object.keys(files))
  const dirs = new Set<string>()
  for (const p of fileSet) {
    let d = dirname(p)
    while (d && !dirs.has(d)) {
      dirs.add(d)
      const parent = dirname(d)
      if (parent === d) break
      d = parent
    }
  }
  return {
    home: '/home/u',
    exists: (p) => fileSet.has(p) || dirs.has(p),
    readDir: (p) => {
      const out: MemDirent[] = []
      for (const f of fileSet) {
        if (dirname(f) === p) out.push({ name: basename(f), isFile: true, isDirectory: false })
      }
      for (const d of dirs) {
        if (dirname(d) === p && d !== p) out.push({ name: basename(d), isFile: false, isDirectory: true })
      }
      return out
    },
    readText: () => {
      throw new Error('related search must not call the unbounded read primitive')
    },
    readTextBounded: (p, maxBytes): BoundedTextRead | undefined => {
      options.onRead?.(p, maxBytes)
      const raw = files[p]
      if (raw === undefined) return undefined
      const bytes = Buffer.from(raw)
      const selected = bytes.subarray(0, maxBytes)
      return {
        text: selected.toString('utf8'),
        bytesRead: selected.byteLength,
        truncated: bytes.byteLength > selected.byteLength,
      }
    },
    mtimeMs: (p) => options.mtimes?.[p] ?? (fileSet.has(p) ? Date.parse('2026-07-28T12:00:00Z') : undefined),
    env: () => undefined,
  }
}

describe('searchRelatedSessions input contract', () => {
  test.each([
    ['a', 'query-length'],
    ['x'.repeat(129), 'query-length'],
    ['one two three four five six seven eight nine', 'query-token-count'],
  ])('rejects invalid query %j with stable reason %s', (query, reason) => {
    expect(() => searchRelatedSessions(boundedFakeFs({}), {
      root: PROJECT,
      query,
      platform: 'codex',
    })).toThrowError(expect.objectContaining<Partial<RelatedSessionSearchInputError>>({ reason }))
  })

  test('rejects a runtime platform outside the explicit closed set before any adapter reads', () => {
    let reads = 0
    expect(() => searchRelatedSessions(boundedFakeFs({}, { onRead: () => { reads += 1 } }), {
      root: PROJECT,
      query: 'memory search',
      platform: 'unknown' as 'codex',
    })).toThrowError(expect.objectContaining<Partial<RelatedSessionSearchInputError>>({
      reason: 'invalid-platform',
    }))
    expect(reads).toBe(0)
  })
})

describe('searchRelatedSessions bounded privacy contract', () => {
  test('uses bounded reads and returns only a bounded user excerpt without cwd or file path', () => {
    const path = codexFile('safe')
    const reads: Array<{ path: string; maxBytes: number }> = []
    const result = searchRelatedSessions(boundedFakeFs({
      [path]: codexSession('safe', [
        { role: 'user', text: `memory search ${'u'.repeat(500)}` },
        { role: 'assistant', text: 'memory search private assistant detail' },
      ]),
    }, {
      onRead: (readPath, maxBytes) => reads.push({ path: readPath, maxBytes }),
    }), {
      root: PROJECT,
      query: 'memory search',
      platform: 'codex',
    })

    expect(reads).toEqual([{ path, maxBytes: RELATED_SESSION_SEARCH_BUDGETS.perFileBytes }])
    expect(result.partial).toBe(false)
    expect(result.matches).toHaveLength(1)
    expect(result.matches[0]).toMatchObject({
      platform: 'codex',
      sessionId: 'safe',
      hitCount: 2,
      descendantsMerged: 0,
    })
    expect(result.matches[0]?.excerpt).toContain('memory search')
    expect(result.matches[0]?.excerpt).not.toContain('private assistant detail')
    expect(result.matches[0]?.excerpt.length).toBeLessThanOrEqual(RELATED_SESSION_SEARCH_BUDGETS.excerptChars)
    expect(result.matches[0]).not.toHaveProperty('cwd')
    expect(result.matches[0]).not.toHaveProperty('filePath')
  })

  test('drops sessions whose query appears only in assistant content', () => {
    const path = codexFile('assistant-only')
    const result = searchRelatedSessions(boundedFakeFs({
      [path]: codexSession('assistant-only', [
        { role: 'user', text: 'a different request' },
        { role: 'assistant', text: 'memory search implementation detail' },
      ]),
    }), {
      root: PROJECT,
      query: 'memory search',
      platform: 'codex',
    })

    expect(result.matches).toEqual([])
  })

  test('marks a per-file truncation as partial with a stable warning', () => {
    const path = codexFile('large')
    const result = searchRelatedSessions(boundedFakeFs({
      [path]: codexSession('large', [{ role: 'user', text: 'memory search' }])
        + ' '.repeat(RELATED_SESSION_SEARCH_BUDGETS.perFileBytes),
    }), {
      root: PROJECT,
      query: 'memory search',
      platform: 'codex',
    })

    expect(result.partial).toBe(true)
    expect(result.warnings.map((warning) => warning.code)).toContain('file-read-truncated')
  })

  test('never exceeds the aggregate byte budget and stops subsequent file reads', () => {
    const files: Record<string, string> = {}
    for (let i = 0; i < 10; i += 1) {
      files[codexFile(`budget-${i}`)] = codexSession(`budget-${i}`, [
        { role: 'user', text: 'memory search' },
      ]) + ' '.repeat(RELATED_SESSION_SEARCH_BUDGETS.perFileBytes)
    }
    let bytesRead = 0
    let readCalls = 0
    const result = searchRelatedSessions(boundedFakeFs(files, {
      onRead: (_path, maxBytes) => {
        bytesRead += maxBytes
        readCalls += 1
      },
    }), {
      root: PROJECT,
      query: 'memory search',
      platform: 'codex',
    })

    expect(bytesRead).toBeLessThanOrEqual(RELATED_SESSION_SEARCH_BUDGETS.totalBytes)
    expect(readCalls).toBe(RELATED_SESSION_SEARCH_BUDGETS.totalBytes / RELATED_SESSION_SEARCH_BUDGETS.perFileBytes)
    expect(result.partial).toBe(true)
    expect(result.warnings.map((warning) => warning.code)).toContain('total-read-budget-exhausted')
  })

  test('searches at most the 100 most recently updated candidates', () => {
    const files: Record<string, string> = {}
    const mtimes: Record<string, number> = {}
    for (let i = 0; i <= RELATED_SESSION_SEARCH_BUDGETS.candidates; i += 1) {
      const id = `candidate-${i}`
      const path = codexFile(id)
      const isOldest = i === 0
      files[path] = codexSession(id, [{
        role: 'user',
        text: isOldest ? 'unique oldest needle' : 'unrelated words',
      }])
      mtimes[path] = Date.parse('2026-07-28T00:00:00Z') + i
    }
    const result = searchRelatedSessions(boundedFakeFs(files, { mtimes }), {
      root: PROJECT,
      query: 'oldest needle',
      platform: 'codex',
    })

    expect(result.matches).toEqual([])
  })

  test('caps results at eight while preserving the existing relevance ordering', () => {
    const files: Record<string, string> = {}
    for (let i = 0; i < 10; i += 1) {
      files[codexFile(`result-${i}`)] = codexSession(`result-${i}`, [{
        role: 'user',
        text: `memory search ${'memory '.repeat(i)}`,
      }])
    }
    const result = searchRelatedSessions(boundedFakeFs(files), {
      root: PROJECT,
      query: 'memory search',
      platform: 'codex',
    })

    expect(result.matches).toHaveLength(RELATED_SESSION_SEARCH_BUDGETS.results)
    expect(result.matches[0]?.sessionId).toBe('result-9')
  })
})
