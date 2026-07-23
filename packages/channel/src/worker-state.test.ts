/**
 * worker-state —— reduceWorkerRegistry 纯投影（event-sourcing 核心：从事件流重建 worker 注册表）。
 * 老仓真相源：skills/pipeline/scripts/channel/worker_state.py。
 */
import { describe, expect, test } from 'vitest'
import type { ChannelEvent } from './types.js'
import { reduceWorkerRegistry } from './worker-state.js'

const ev = (o: Partial<ChannelEvent> & { seq: number; kind: string; by: string }): ChannelEvent => o as ChannelEvent

describe('canCreate 防幻影（worker_state.py:26/64）', () => {
  test('turn_started 指向不存在 worker → 跳过（不 create）', () => {
    const evs = [ev({ seq: 1, kind: 'turn_started', by: 'w1', worker: 'w1', turnId: 'msg:1', inputSeq: 1 })]
    expect(reduceWorkerRegistry(evs).workers).toHaveLength(0)
  })
  test('spawned 能 create 条目', () => {
    const evs = [ev({ seq: 1, kind: 'spawned', by: 'sup', as: 'w1', ts: 't1', provider: 'echo' })]
    const w = reduceWorkerRegistry(evs).workers
    expect(w).toHaveLength(1)
    expect(w[0]).toMatchObject({ id: 'w1', lifecycle: 'running', activity: 'idle', terminal: false, provider: 'echo' })
  })
})

describe('两正交维度 lifecycle × activity', () => {
  test('spawned → turn_started → turn_finished：running idle→mid-turn→idle', () => {
    const evs = [
      ev({ seq: 1, kind: 'spawned', by: 'sup', as: 'w1', ts: 't1' }),
      ev({ seq: 2, kind: 'turn_started', by: 'w1', worker: 'w1', turnId: 'msg:9', inputSeq: 9, ts: 't2' }),
      ev({ seq: 3, kind: 'turn_finished', by: 'w1', worker: 'w1', turnId: 'msg:9', ts: 't3' }),
    ]
    const w = reduceWorkerRegistry(evs).workers[0]!
    expect(w.lifecycle).toBe('running')
    expect(w.activity).toBe('idle')
    expect(w.activeTurnId).toBeNull()
  })
  test('mid-turn 时 activity=mid-turn + activeTurnId', () => {
    const evs = [
      ev({ seq: 1, kind: 'spawned', by: 'sup', as: 'w1', ts: 't1' }),
      ev({ seq: 2, kind: 'turn_started', by: 'w1', worker: 'w1', turnId: 'msg:9', inputSeq: 9, ts: 't2' }),
    ]
    const w = reduceWorkerRegistry(evs).workers[0]!
    expect(w.activity).toBe('mid-turn')
    expect(w.activeTurnId).toBe('msg:9')
  })
})

describe('done 复用命脉：非 synthesized 仅转 idle 不终结（worker_state.py:104）', () => {
  test('done 无 synthesized → 非 terminal，仍 running/idle', () => {
    const evs = [
      ev({ seq: 1, kind: 'spawned', by: 'sup', as: 'w1', ts: 't1' }),
      ev({ seq: 2, kind: 'done', by: 'w1', worker: 'w1', ts: 't2' }),
    ]
    const w = reduceWorkerRegistry(evs).workers[0]!
    expect(w.terminal).toBe(false)
    expect(w.lifecycle).toBe('running')
    expect(w.activity).toBe('idle')
  })
  test('done synthesized=true → terminal done', () => {
    const evs = [
      ev({ seq: 1, kind: 'spawned', by: 'sup', as: 'w1', ts: 't1' }),
      ev({ seq: 2, kind: 'done', by: 'w1', worker: 'w1', synthesized: true, exit_code: 0, ts: 't2' }),
    ]
    const w = reduceWorkerRegistry(evs).workers[0]!
    expect(w.terminal).toBe(true)
    expect(w.lifecycle).toBe('done')
    expect(w.exitCode).toBe(0)
  })
})

describe('error terminal 判定（synthesized 或 by supervisor: 前缀，worker_state.py:114）', () => {
  test('error 普通 by → 非 terminal', () => {
    const evs = [
      ev({ seq: 1, kind: 'spawned', by: 'sup', as: 'w1', ts: 't1' }),
      ev({ seq: 2, kind: 'error', by: 'w1', worker: 'w1', message: 'oops', ts: 't2' }),
    ]
    expect(reduceWorkerRegistry(evs).workers[0]!.terminal).toBe(false)
  })
  test('error by supervisor: → terminal', () => {
    const evs = [
      ev({ seq: 1, kind: 'spawned', by: 'sup', as: 'w1', ts: 't1' }),
      ev({ seq: 2, kind: 'error', by: 'supervisor:w1', worker: 'w1', message: 'boom', ts: 't2' }),
    ]
    const w = reduceWorkerRegistry(evs).workers[0]!
    expect(w.terminal).toBe(true)
    expect(w.lifecycle).toBe('error')
  })
})

describe('killed reason=crash → crashed（worker_state.py:126）', () => {
  test('普通 killed → killed', () => {
    const evs = [
      ev({ seq: 1, kind: 'spawned', by: 'sup', as: 'w1', ts: 't1' }),
      ev({ seq: 2, kind: 'killed', by: 'sup', worker: 'w1', ts: 't2' }),
    ]
    expect(reduceWorkerRegistry(evs).workers[0]!.lifecycle).toBe('killed')
  })
  test('killed reason=crash → crashed', () => {
    const evs = [
      ev({ seq: 1, kind: 'spawned', by: 'sup', as: 'w1', ts: 't1' }),
      ev({ seq: 2, kind: 'killed', by: 'sup', worker: 'w1', reason: 'crash', ts: 't2' }),
    ]
    expect(reduceWorkerRegistry(evs).workers[0]!.lifecycle).toBe('crashed')
  })
})

describe('respawn 后复活（spawned 清 terminal，worker_state.py:75）', () => {
  test('done(synthesized)→spawned → 复活 running 非 terminal', () => {
    const evs = [
      ev({ seq: 1, kind: 'spawned', by: 'sup', as: 'w1', ts: 't1' }),
      ev({ seq: 2, kind: 'done', by: 'w1', worker: 'w1', synthesized: true, ts: 't2' }),
      ev({ seq: 3, kind: 'spawned', by: 'sup', as: 'w1', ts: 't3' }),
    ]
    const w = reduceWorkerRegistry(evs).workers[0]!
    expect(w.terminal).toBe(false)
    expect(w.lifecycle).toBe('running')
  })
})

describe('pendingMessageCount（worker_state.py:138：durable 事件 + consumedInputSeq 水位）', () => {
  test('定向 message 未消费 → 计 1；turn_started 抬水位后不再计', () => {
    const evs = [
      ev({ seq: 1, kind: 'spawned', by: 'sup', as: 'w1', ts: 't1' }),
      ev({ seq: 2, kind: 'message', by: 'main', to: 'w1', text: 'hi', ts: 't2' }),
    ]
    expect(reduceWorkerRegistry(evs).workers[0]!.pendingMessageCount).toBe(1)
    const evs2 = [
      ...evs,
      ev({ seq: 3, kind: 'turn_started', by: 'w1', worker: 'w1', turnId: 'msg:2', inputSeq: 2, ts: 't3' }),
    ]
    expect(reduceWorkerRegistry(evs2).workers[0]!.pendingMessageCount).toBe(0)
  })
  test('terminal worker 恒 0', () => {
    const evs = [
      ev({ seq: 1, kind: 'spawned', by: 'sup', as: 'w1', ts: 't1' }),
      ev({ seq: 2, kind: 'message', by: 'main', to: 'w1', text: 'hi', ts: 't2' }),
      ev({ seq: 3, kind: 'killed', by: 'sup', worker: 'w1', ts: 't3' }),
    ]
    expect(reduceWorkerRegistry(evs).workers[0]!.pendingMessageCount).toBe(0)
  })
})

describe('输出确定性 + channel 注入', () => {
  test('按 id 排序 + 丢 consumedInputSeq + channel 字段', () => {
    const evs = [
      ev({ seq: 1, kind: 'spawned', by: 'sup', as: 'wB', ts: 't1' }),
      ev({ seq: 2, kind: 'spawned', by: 'sup', as: 'wA', ts: 't2' }),
    ]
    const out = reduceWorkerRegistry(evs, 'chan').workers
    expect(out.map((w) => w.id)).toEqual(['wA', 'wB'])
    expect(out[0]!.channel).toBe('chan')
    expect(out[0]).not.toHaveProperty('consumedInputSeq')
  })
})
