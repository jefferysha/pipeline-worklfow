/**
 * mem/search —— 相关性评分 + 多 token AND 检索 + 段落对齐 chunk（真逻辑）。
 * 对位老仓 skills/pipeline/scripts/mem/search.py。
 */
import { describe, expect, test } from 'vitest'
import { hostSummaryTurn } from './dialogue.js'
import { chunkAround, relevanceScore, searchInDialogue } from './search.js'

describe('relevanceScore —— (3*user + asst)/total（老仓 relevance_score:15）', () => {
  test('user 命中加权 ×3', () => {
    expect(relevanceScore({ count: 3, userCount: 2, asstCount: 1, totalTurns: 4, excerpts: [] })).toBeCloseTo(1.75)
  })

  test('totalTurns==0 → 0', () => {
    expect(relevanceScore({ count: 0, userCount: 0, asstCount: 0, totalTurns: 0, excerpts: [] })).toBe(0)
  })
})

describe('chunkAround —— 段落对齐窗（老仓 chunk_around:27）', () => {
  test('居中命中 → 两侧 \\n\\n 之间的段落', () => {
    // 'alpha\n\nbeta gamma\n\ndelta'：'gamma' 在 idx 12，段落 [7,17) = 'beta gamma'
    expect(chunkAround('alpha\n\nbeta gamma\n\ndelta', 12, 400)).toEqual({ start: 7, end: 17, truncated: false })
  })

  test('超长自然段 → 居中字符窗回退 + truncated', () => {
    const text = 'x'.repeat(50)
    const r = chunkAround(text, 25, 10)
    expect(r.truncated).toBe(true)
    expect(r.end - r.start).toBeLessThanOrEqual(10)
  })
})

describe('searchInDialogue —— 多 token AND grep（老仓 search_in_dialogue:42）', () => {
  const turns = [
    { role: 'user' as const, text: 'I love memory systems' },
    { role: 'assistant' as const, text: 'memory is great, memory rocks' },
  ]

  test('单 token：user/asst 命中计数 + user excerpt 前置', () => {
    const hit = searchInDialogue(turns, 'memory')
    expect(hit.count).toBe(3)
    expect(hit.userCount).toBe(1)
    expect(hit.asstCount).toBe(2)
    expect(hit.totalTurns).toBe(2)
    expect(hit.excerpts[0]).toEqual({ role: 'user', snippet: 'I love memory systems' })
    expect(hit.excerpts[1]).toEqual({ role: 'assistant', snippet: 'memory is great, memory rocks' })
  })

  test('多 token AND：每个 token 都须在同一 turn 出现', () => {
    const hit = searchInDialogue(turns, 'memory systems')
    // 只有 user turn 同时含 memory + systems
    expect(hit.userCount).toBe(2) // memory×1 + systems×1
    expect(hit.asstCount).toBe(0)
    expect(hit.count).toBe(2)
    expect(hit.excerpts).toHaveLength(1)
    expect(hit.excerpts[0]?.role).toBe('user')
  })

  test('空关键词 → 零命中', () => {
    const hit = searchInDialogue(turns, '   ')
    expect(hit.count).toBe(0)
    expect(hit.totalTurns).toBe(2)
    expect(hit.excerpts).toEqual([])
  })

  test('无命中 → count 0', () => {
    expect(searchInDialogue(turns, 'nonexistent').count).toBe(0)
  })

  test('host summaries retain their legacy user counts and excerpts by default', () => {
    const hit = searchInDialogue([
      hostSummaryTurn('[compact summary]\nsynthetic summary needle'),
    ], 'summary needle')

    expect(hit.userCount).toBe(3)
    expect(hit.asstCount).toBe(0)
    expect(hit.excerpts).toEqual([{
      role: 'user',
      snippet: '[compact summary]\nsynthetic summary needle',
    }])
  })

  test('callers can opt into treating host summaries as assistant provenance', () => {
    const hit = searchInDialogue(
      [hostSummaryTurn('[compact summary]\nsynthetic summary needle')],
      'summary needle',
      3,
      400,
      { hostSummariesAsAssistant: true },
    )

    expect(hit.userCount).toBe(0)
    expect(hit.asstCount).toBe(3)
    expect(hit.excerpts).toEqual([{
      role: 'assistant',
      snippet: '[compact summary]\nsynthetic summary needle',
    }])
  })

  test('long repetitive turns keep exact counts and deterministic bounded excerpts', () => {
    const repetitions = 5_000
    const raw = 'needle '.repeat(repetitions)
    const instrumented = new String(raw)
    const nativeSlice = String.prototype.slice
    let chunkSlices = 0
    Object.defineProperty(instrumented, 'slice', {
      value: (start?: number, end?: number) => {
        chunkSlices += 1
        return nativeSlice.call(instrumented, start, end)
      },
    })
    const text = instrumented as unknown as string

    const first = searchInDialogue([{ role: 'user', text }], 'needle needle', 3, 80)
    const second = searchInDialogue([{ role: 'user', text }], 'needle needle', 3, 80)

    expect(first.count).toBe(repetitions * 2)
    expect(first.userCount).toBe(repetitions * 2)
    expect(first.asstCount).toBe(0)
    expect(first.excerpts).toHaveLength(3)
    expect(first.excerpts).toEqual(second.excerpts)
    expect(chunkSlices).toBeLessThanOrEqual(6)
  })

  test('keeps a later full-coverage paragraph ahead of earlier partial candidates', () => {
    const text = [
      'alpha first',
      'alpha second',
      'alpha third',
      'beta first',
      'beta second',
      'beta third',
      'alpha beta together',
    ].join('\n\n')

    const hit = searchInDialogue([{ role: 'user', text }], 'alpha beta', 3, 80)

    expect(hit.excerpts[0]).toEqual({ role: 'user', snippet: 'alpha beta together' })
  })
})
