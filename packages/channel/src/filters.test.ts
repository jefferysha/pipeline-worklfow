/**
 * filters —— matchesInboxPolicy / classifyDelivery / matchesEventFilter（三过滤 SOT）。
 * 老仓真相源：skills/pipeline/scripts/channel/filters.py。
 */
import { describe, expect, test } from 'vitest'
import type { ChannelEvent, WorkerState } from './types.js'
import { classifyDelivery, matchesEventFilter, matchesInboxPolicy } from './filters.js'

const ev = (o: Partial<ChannelEvent>): ChannelEvent => o as ChannelEvent

describe('matchesInboxPolicy（filters.py:31：worker 永不消费自身）', () => {
  test('非 message → false', () => {
    expect(matchesInboxPolicy(ev({ kind: 'spawned', by: 'x' }), 'w1')).toBe(false)
  })
  test('自己发的 message → false', () => {
    expect(matchesInboxPolicy(ev({ kind: 'message', by: 'w1', to: 'w1' }), 'w1')).toBe(false)
  })
  test('定向到我 → true', () => {
    expect(matchesInboxPolicy(ev({ kind: 'message', by: 'main', to: 'w1' }), 'w1')).toBe(true)
    expect(matchesInboxPolicy(ev({ kind: 'message', by: 'main', to: ['w0', 'w1'] }), 'w1')).toBe(true)
  })
  test('定向到别人 → false', () => {
    expect(matchesInboxPolicy(ev({ kind: 'message', by: 'main', to: 'w2' }), 'w1')).toBe(false)
  })
  test('broadcast 仅 broadcastAndExplicit 收', () => {
    const b = ev({ kind: 'message', by: 'main' })
    expect(matchesInboxPolicy(b, 'w1', 'explicitOnly')).toBe(false)
    expect(matchesInboxPolicy(b, 'w1', 'broadcastAndExplicit')).toBe(true)
  })
})

describe('classifyDelivery（filters.py:45：纯从 registry 判，绝不查 OS liveness）', () => {
  const workers: WorkerState[] = [
    { id: 'live', lifecycle: 'running', activity: 'idle', terminal: false } as WorkerState,
    { id: 'dead', lifecycle: 'killed', activity: 'idle', terminal: true } as WorkerState,
  ]
  test('appendOnly → 恒空（保 pre-spawn backlog）', () => {
    expect(classifyDelivery(['ghost'], workers, 'appendOnly')).toEqual([])
  })
  test('broadcast（无 target）→ 永不 undeliverable', () => {
    expect(classifyDelivery([], workers, 'requireRunningWorker')).toEqual([])
  })
  test('未知 worker → worker-unknown', () => {
    expect(classifyDelivery(['ghost'], workers, 'requireRunningWorker')).toEqual([['ghost', 'worker-unknown']])
  })
  test('requireRunningWorker：terminal → worker-terminal', () => {
    expect(classifyDelivery(['dead'], workers, 'requireRunningWorker')).toEqual([['dead', 'worker-terminal']])
  })
  test('requireKnownWorker：已知即可（terminal 也算投得到）', () => {
    expect(classifyDelivery(['dead'], workers, 'requireKnownWorker')).toEqual([])
  })
  test('live worker → 无 undeliverable', () => {
    expect(classifyDelivery(['live'], workers, 'requireRunningWorker')).toEqual([])
  })
})

describe('matchesEventFilter（filters.py:68：meaningful 门 + 显式 kind 旁路）', () => {
  test('self 排除', () => {
    expect(matchesEventFilter(ev({ kind: 'message', by: 'me' }), { selfId: 'me' })).toBe(false)
  })
  test('非 meaningful kind 默认排除（progress）', () => {
    expect(matchesEventFilter(ev({ kind: 'progress', by: 'w1' }), {})).toBe(false)
  })
  test('显式 wantKind 旁路 meaningful 门（wait --kind supervisor_warning 能工作）', () => {
    expect(matchesEventFilter(ev({ kind: 'supervisor_warning', by: 'sup' }), { wantKind: 'supervisor_warning' })).toBe(true)
  })
  test('meaningful kind 默认收', () => {
    expect(matchesEventFilter(ev({ kind: 'message', by: 'w1' }), {})).toBe(true)
  })
  test('from 白名单', () => {
    expect(matchesEventFilter(ev({ kind: 'message', by: 'alice' }), { fromBy: ['bob'] })).toBe(false)
    expect(matchesEventFilter(ev({ kind: 'message', by: 'bob' }), { fromBy: ['bob'] })).toBe(true)
  })
  test('to 过滤', () => {
    expect(matchesEventFilter(ev({ kind: 'message', by: 'x', to: 'w1' }), { toFilter: 'w1' })).toBe(true)
    expect(matchesEventFilter(ev({ kind: 'message', by: 'x', to: 'w2' }), { toFilter: 'w1' })).toBe(false)
  })
  test('thread key/action 过滤', () => {
    const t = ev({ kind: 'thread', by: 'x', thread: 'T1', action: 'comment' })
    expect(matchesEventFilter(t, { threadKey: 'T1' })).toBe(true)
    expect(matchesEventFilter(t, { threadKey: 'T2' })).toBe(false)
    expect(matchesEventFilter(t, { threadAction: 'comment' })).toBe(true)
    expect(matchesEventFilter(t, { threadAction: 'status' })).toBe(false)
  })
})
