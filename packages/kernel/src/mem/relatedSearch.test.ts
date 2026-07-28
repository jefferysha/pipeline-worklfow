import { basename, dirname } from 'node:path'
import { describe, expect, test } from 'vitest'
import { MEM_SESSION_METADATA_BYTES, type BoundedTextRead, type MemDirent, type MemFs } from './fs.js'
import {
  RELATED_SESSION_SEARCH_BUDGETS,
  RelatedSessionSearchInputError,
  searchRelatedSessions,
} from './relatedSearch.js'

const PROJECT = '/home/u/work/proj'

function codexFile(id: string): string {
  return `/home/u/.codex/sessions/2026/07/rollout-2026-07-28T12-00-00-${id}.jsonl`
}

function claudeFile(id: string): string {
  return `/home/u/.claude/projects/-home-u-work-proj/${id}.jsonl`
}

function piFile(id: string): string {
  return `/home/u/custom-pi-sessions/${id}.jsonl`
}

function codexSession(
  id: string,
  turns: Array<{ role: 'user' | 'assistant'; text: string }>,
  cwd = PROJECT,
): string {
  const lines = [
    JSON.stringify({
      timestamp: '2026-07-28T12:00:00Z',
      payload: { id, cwd },
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

function claudeSession(id: string, text: string): string {
  return JSON.stringify({
    type: 'user',
    message: { role: 'user', content: text },
    cwd: PROJECT,
    sessionId: id,
    timestamp: '2026-07-28T12:00:00Z',
  })
}

function piSession(id: string, cwd: string, text: string): string {
  return [
    JSON.stringify({ type: 'session', id, cwd, timestamp: '2026-07-28T12:00:00Z' }),
    JSON.stringify({
      type: 'message',
      id: `${id}-message`,
      message: { role: 'user', content: text, timestamp: '2026-07-28T12:00:01Z' },
    }),
  ].join('\n')
}

function boundedFakeFs(
  files: Record<string, string>,
  options: {
    mtimes?: Record<string, number>
    onRead?: (path: string, maxBytes: number) => void
    env?: Record<string, string>
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
    env: (name) => options.env?.[name],
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

    expect(reads).toEqual([{ path, maxBytes: MEM_SESSION_METADATA_BYTES }])
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
    expect(readCalls).toBe(10 + Math.ceil(
      (RELATED_SESSION_SEARCH_BUDGETS.totalBytes - 10 * MEM_SESSION_METADATA_BYTES)
      / RELATED_SESSION_SEARCH_BUDGETS.perFileBytes,
    ))
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
    let reads = 0
    const result = searchRelatedSessions(boundedFakeFs(files, {
      mtimes,
      onRead: () => { reads += 1 },
    }), {
      root: PROJECT,
      query: 'oldest needle',
      platform: 'codex',
    })

    expect(reads).toBe(RELATED_SESSION_SEARCH_BUDGETS.candidates + 1)
    expect(result.matches).toEqual([])
    expect(result.partial).toBe(true)
    expect(result.warnings.map((warning) => warning.code)).toContain('candidate-limit-reached')
  })

  test('chooses the global newest project candidates before adapter order in all mode', () => {
    const files: Record<string, string> = {}
    const mtimes: Record<string, number> = {}
    for (let i = 0; i < RELATED_SESSION_SEARCH_BUDGETS.candidates; i += 1) {
      const path = claudeFile(`claude-${i}`)
      files[path] = claudeSession(`claude-${i}`, 'unrelated claude history')
      mtimes[path] = Date.parse('2026-07-28T00:00:00Z') + i
    }
    const newestCodex = codexFile('newest-codex')
    files[newestCodex] = codexSession('newest-codex', [{
      role: 'user',
      text: 'global candidate needle',
    }])
    mtimes[newestCodex] = Date.parse('2026-07-29T00:00:00Z')

    const result = searchRelatedSessions(boundedFakeFs(files, { mtimes }), {
      root: PROJECT,
      query: 'candidate needle',
      platform: 'all',
    })

    expect(result.matches).toEqual([
      expect.objectContaining({ platform: 'codex', sessionId: 'newest-codex' }),
    ])
    expect(result.partial).toBe(true)
    expect(result.warnings.map((warning) => warning.code)).toContain('candidate-limit-reached')
  })

  test('foreign Codex sessions do not consume project candidate admission', () => {
    const files: Record<string, string> = {}
    const mtimes: Record<string, number> = {}
    for (let i = 0; i < RELATED_SESSION_SEARCH_BUDGETS.candidates; i += 1) {
      const id = `foreign-${i}`
      const path = codexFile(id)
      files[path] = codexSession(id, [{ role: 'user', text: 'foreign words' }], '/home/u/work/other')
      mtimes[path] = Date.parse('2026-07-29T00:00:00Z') + i
    }
    const target = codexFile('target-codex')
    files[target] = codexSession('target-codex', [{ role: 'user', text: 'target project needle' }])
    mtimes[target] = Date.parse('2026-07-28T00:00:00Z')

    const result = searchRelatedSessions(boundedFakeFs(files, { mtimes }), {
      root: PROJECT,
      query: 'project needle',
      platform: 'codex',
    })

    expect(result.matches).toEqual([
      expect.objectContaining({ sessionId: 'target-codex' }),
    ])
  })

  test('foreign Pi sessions in a custom root do not consume project candidate admission', () => {
    const files: Record<string, string> = {}
    const mtimes: Record<string, number> = {}
    for (let i = 0; i < RELATED_SESSION_SEARCH_BUDGETS.candidates; i += 1) {
      const id = `foreign-pi-${i}`
      const path = piFile(id)
      files[path] = piSession(id, '/home/u/work/other', 'foreign words')
      mtimes[path] = Date.parse('2026-07-29T00:00:00Z') + i
    }
    const target = piFile('target-pi')
    files[target] = piSession('target-pi', PROJECT, 'target project needle')
    mtimes[target] = Date.parse('2026-07-28T00:00:00Z')

    const result = searchRelatedSessions(boundedFakeFs(files, {
      mtimes,
      env: { PI_CODING_AGENT_SESSION_DIR: '/home/u/custom-pi-sessions' },
    }), {
      root: PROJECT,
      query: 'project needle',
      platform: 'pi',
    })

    expect(result.matches).toEqual([
      expect.objectContaining({ sessionId: 'target-pi' }),
    ])
  })

  test('does not expose a Claude host compaction summary as an original user match', () => {
    const path = claudeFile('summary-only')
    const result = searchRelatedSessions(boundedFakeFs({
      [path]: JSON.stringify({
        type: 'user',
        isCompactSummary: true,
        message: { role: 'user', content: 'synthetic summary needle' },
        cwd: PROJECT,
        timestamp: '2026-07-28T12:00:00Z',
      }),
    }), {
      root: PROJECT,
      query: 'summary needle',
      platform: 'claude',
    })

    expect(result.matches).toEqual([])
  })

  test.each(['compaction', 'branch_summary'] as const)(
    'does not expose a Pi %s as an original user match',
    (type) => {
      const path = piFile(`pi-${type}`)
      const result = searchRelatedSessions(boundedFakeFs({
        [path]: [
          JSON.stringify({
            type: 'session',
            id: `pi-${type}`,
            cwd: PROJECT,
            timestamp: '2026-07-28T12:00:00Z',
          }),
          JSON.stringify({
            type,
            id: `${type}-entry`,
            summary: 'synthetic summary needle',
          }),
        ].join('\n'),
      }, {
        env: { PI_CODING_AGENT_SESSION_DIR: '/home/u/custom-pi-sessions' },
      }), {
        root: PROJECT,
        query: 'summary needle',
        platform: 'pi',
      })

      expect(result.matches).toEqual([])
    },
  )

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
