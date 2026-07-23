/**
 * events —— 21 kind 白名单 + parseKind/parseKinds + 幂等扫描 + jsonl 读（纯逻辑）。
 * 老仓真相源：skills/pipeline/scripts/channel/events.py。
 */
import { describe, expect, test } from 'vitest'
import {
  CHANNEL_EVENT_KINDS,
  findIdempotentEvent,
  parseChannelKind,
  parseChannelKinds,
  parseEventsText,
  validateEventBase,
  VALID_ORIGINS,
} from './events.js'

describe('CHANNEL_EVENT_KINDS —— 冻结 21 白名单（events.py:27）', () => {
  test('恰 21 个 kind', () => {
    expect(CHANNEL_EVENT_KINDS).toHaveLength(21)
  })
  test('含生命周期/投递/turn 全部真相 kind', () => {
    for (const k of ['create', 'message', 'spawned', 'killed', 'undeliverable', 'turn_started', 'turn_finished', 'interrupted', 'interrupt_requested', 'supervisor_warning']) {
      expect(CHANNEL_EVENT_KINDS).toContain(k)
    }
  })
})

describe('parseChannelKind（events.py:42）', () => {
  test('undefined/null 透传', () => {
    expect(parseChannelKind(undefined)).toBeUndefined()
    expect(parseChannelKind(null)).toBeUndefined()
  })
  test('命中白名单返回原值', () => {
    expect(parseChannelKind('message')).toBe('message')
  })
  test('未知 kind 抛错且消息含完整白名单', () => {
    expect(() => parseChannelKind('bogus')).toThrow(/未知 channel event kind/)
    try {
      parseChannelKind('bogus')
    } catch (e) {
      expect((e as Error).message).toContain('message')
      expect((e as Error).message).toContain('spawned')
    }
  })
})

describe('parseChannelKinds CSV（events.py:53：split/trim/去空/去重保序）', () => {
  test('CSV → 去重保序', () => {
    expect(parseChannelKinds('message, spawned ,message')).toEqual(['message', 'spawned'])
  })
  test('空 → undefined', () => {
    expect(parseChannelKinds('')).toBeUndefined()
    expect(parseChannelKinds(' , ,')).toBeUndefined()
    expect(parseChannelKinds(undefined)).toBeUndefined()
  })
  test('含非法 → 抛（单值错误消息是 SOT）', () => {
    expect(() => parseChannelKinds('message,bogus')).toThrow(/未知 channel event kind/)
  })
})

describe('validateEventBase（events.py:133）', () => {
  test('idempotencyKey 空白串拒', () => {
    expect(() => validateEventBase({ idempotencyKey: '  ' })).toThrow(/idempotencyKey/)
  })
  test('非法 origin 拒', () => {
    expect(() => validateEventBase({ origin: 'ghost' })).toThrow(/origin/)
  })
  test('合法 origin 全过', () => {
    for (const o of VALID_ORIGINS) expect(() => validateEventBase({ origin: o })).not.toThrow()
  })
  test('meta 非对象拒', () => {
    expect(() => validateEventBase({ meta: 'x' as unknown as Record<string, unknown> })).toThrow(/meta/)
  })
})

describe('findIdempotentEvent（events.py:146：同 key 同 kind 返回旧；不同 kind 抛）', () => {
  const text = [
    JSON.stringify({ seq: 1, kind: 'message', by: 'a', idempotencyKey: 'k1' }),
    JSON.stringify({ seq: 2, kind: 'message', by: 'b' }),
  ].join('\n')
  test('同 key 同 kind → 返回旧事件', () => {
    const found = findIdempotentEvent(text, 'k1', 'message')
    expect(found?.seq).toBe(1)
  })
  test('无匹配 → undefined', () => {
    expect(findIdempotentEvent(text, 'nope', 'message')).toBeUndefined()
    expect(findIdempotentEvent(undefined, 'k1', 'message')).toBeUndefined()
  })
  test('同 key 不同 kind → 抛（不静默）', () => {
    expect(() => findIdempotentEvent(text, 'k1', 'thread')).toThrow(/idempotencyKey/)
  })
})

describe('parseEventsText（坏行跳过，events.py:205 read_events）', () => {
  test('逐行解析，坏 JSON / 空行跳过', () => {
    const text = [
      JSON.stringify({ seq: 1, kind: 'create', by: 'main' }),
      '',
      'not json',
      JSON.stringify({ seq: 2, kind: 'message', by: 'a' }),
      '  ',
    ].join('\n')
    const evs = parseEventsText(text)
    expect(evs.map((e) => e.seq)).toEqual([1, 2])
  })
  test('空/undefined → []', () => {
    expect(parseEventsText('')).toEqual([])
    expect(parseEventsText(undefined)).toEqual([])
  })
})
