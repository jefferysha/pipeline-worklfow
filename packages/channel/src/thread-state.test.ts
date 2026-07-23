/**
 * thread-state —— forum thread 投影（event-sourcing：thread 事件流 → ThreadState）。
 * 老仓真相源：skills/pipeline/scripts/channel/thread_state.py。
 */
import { describe, expect, test } from 'vitest'
import type { ChannelEvent } from './types.js'
import {
  buildThreadAliasResolver,
  collectThreadTimeline,
  formatThreadBoard,
  normalizeThreadKey,
  reduceThreads,
} from './thread-state.js'

const ev = (o: Partial<ChannelEvent> & { seq: number; kind: string }): ChannelEvent => ({ by: 'x', ...o }) as ChannelEvent

describe('normalizeThreadKey（thread_state.py:29：唯一校验 SOT）', () => {
  test('trim 保留', () => {
    expect(normalizeThreadKey('  T1 ')).toBe('T1')
  })
  test('空 → 抛', () => {
    expect(() => normalizeThreadKey('   ')).toThrow(/empty/)
  })
  test('非白名单字符 → 抛', () => {
    expect(() => normalizeThreadKey('bad key!')).toThrow(/letters, numbers/)
  })
  test('允许 . _ -', () => {
    expect(normalizeThreadKey('a.b_c-1')).toBe('a.b_c-1')
  })
})

describe('reduceThreads（thread_state.py:194：投影 + updatedAt 倒序）', () => {
  test('opened + comment + status', () => {
    const evs = [
      ev({ seq: 1, kind: 'thread', thread: 'T1', action: 'opened', title: 'Hello', ts: 't1' }),
      ev({ seq: 2, kind: 'thread', thread: 'T1', action: 'comment', ts: 't2' }),
      ev({ seq: 3, kind: 'thread', thread: 'T1', action: 'comment', ts: 't3' }),
      ev({ seq: 4, kind: 'thread', thread: 'T1', action: 'status', status: 'closed', ts: 't4' }),
    ]
    const states = reduceThreads(evs)
    expect(states).toHaveLength(1)
    expect(states[0]).toMatchObject({ thread: 'T1', title: 'Hello', comments: 2, status: 'closed', lastSeq: 4 })
  })
  test('多 thread 按 updatedAt 倒序', () => {
    const evs = [
      ev({ seq: 1, kind: 'thread', thread: 'A', action: 'opened', ts: '2026-01-01T00:00:00Z' }),
      ev({ seq: 2, kind: 'thread', thread: 'B', action: 'opened', ts: '2026-02-01T00:00:00Z' }),
    ]
    expect(reduceThreads(evs).map((s) => s.thread)).toEqual(['B', 'A'])
  })
  test('labels/assignees', () => {
    const evs = [
      ev({ seq: 1, kind: 'thread', thread: 'T', action: 'opened', ts: 't1' }),
      ev({ seq: 2, kind: 'thread', thread: 'T', action: 'labels', labels: ['bug', 'p1'], ts: 't2' }),
      ev({ seq: 3, kind: 'thread', thread: 'T', action: 'assignees', assignees: ['alice'], ts: 't3' }),
    ]
    const s = reduceThreads(evs)[0]!
    expect(s.labels).toEqual(['bug', 'p1'])
    expect(s.assignees).toEqual(['alice'])
  })
})

describe('rename 别名链（thread_state.py:108：防 silently merge）', () => {
  const evs = [
    ev({ seq: 1, kind: 'thread', thread: 'old', action: 'opened', ts: 't1' }),
    ev({ seq: 2, kind: 'thread', thread: 'old', action: 'comment', ts: 't2' }),
    ev({ seq: 3, kind: 'thread', thread: 'old', action: 'rename', newThread: 'new', ts: 't3' }),
    ev({ seq: 4, kind: 'thread', thread: 'new', action: 'comment', ts: 't4' }),
  ]
  test('resolve 把旧 key 映到当前 key', () => {
    const r = buildThreadAliasResolver(evs)
    expect(r.resolve('old')).toBe('new')
    expect(r.resolve('new')).toBe('new')
    expect(r.aliasesFor('new')).toContain('old')
  })
  test('reduceThreads 归并同一 timeline（2 comments，别名含 old）', () => {
    const states = reduceThreads(evs)
    expect(states).toHaveLength(1)
    expect(states[0]!.thread).toBe('new')
    expect(states[0]!.comments).toBe(2)
    expect(states[0]!.aliases).toContain('old')
  })
  test('collectThreadTimeline 含 rename 别名事件', () => {
    const tl = collectThreadTimeline(evs, 'new')
    expect(tl.map((e) => e.seq)).toEqual([1, 2, 3, 4])
  })
})

describe('formatThreadBoard（thread_state.py:261）', () => {
  test('空 → (no threads)', () => {
    expect(formatThreadBoard([])).toBe('(no threads)')
  })
  test('渲染 status/title/comments', () => {
    const evs = [
      ev({ seq: 1, kind: 'thread', thread: 'T1', action: 'opened', title: 'Fix bug', ts: 't1' }),
      ev({ seq: 2, kind: 'thread', thread: 'T1', action: 'comment', ts: 't2' }),
    ]
    const board = formatThreadBoard(reduceThreads(evs))
    expect(board).toContain('[open] T1 — Fix bug')
    expect(board).toContain('1 comments')
  })
})
