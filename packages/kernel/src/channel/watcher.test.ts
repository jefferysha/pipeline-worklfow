/**
 * watcher —— 增量 tailer 单测（carry 跨 chunk / 截断归零 / 三起始模式 / tailEvents 生成器）。
 * 纯逻辑用内存 TailFs（可控字节切片）+ 注入 sleep；真 fd tail 在 channel-process.integration.test.ts。
 */
import { describe, expect, test } from 'vitest'
import { initialOffset, readNewEvents, tailEvents, type TailFs, type TailState } from './watcher.js'

/** 内存 TailFs：以字符串为文件字节（ascii/json 无多字节，byte=char 对齐）。 */
function memTailFs(store: { text: string }): TailFs {
  return {
    size: () => Buffer.byteLength(store.text, 'utf8'),
    readSlice: (_p, start, length) => Buffer.from(store.text, 'utf8').toString('utf8', start, start + length),
  }
}

function line(seq: number, kind = 'message', extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ seq, kind, by: 'x', ...extra }) + '\n'
}

describe('initialOffset 三起始模式', () => {
  test('fromStart → 0', () => {
    const fs = memTailFs({ text: line(1) + line(2) })
    expect(initialOffset(fs, 'p', { fromStart: true })).toBe(0)
  })
  test('sinceSeq → 0（读全但 yield 过滤）', () => {
    const fs = memTailFs({ text: line(1) + line(2) })
    expect(initialOffset(fs, 'p', { sinceSeq: 5 })).toBe(0)
  })
  test('都没 → 当前文件 size（只看新）', () => {
    const text = line(1) + line(2)
    const fs = memTailFs({ text })
    expect(initialOffset(fs, 'p', {})).toBe(Buffer.byteLength(text, 'utf8'))
  })
})

describe('readNewEvents 增量 + carry + 截断', () => {
  test('增量读只吐新事件，state.byteOffset 前进', () => {
    const store = { text: line(1) }
    const fs = memTailFs(store)
    const state: TailState = { byteOffset: 0, carry: '' }
    expect(readNewEvents(fs, 'p', state).map((e) => e.seq)).toEqual([1])
    // 再读无新 → 空
    expect(readNewEvents(fs, 'p', state)).toEqual([])
    // 追加一条
    store.text += line(2)
    expect(readNewEvents(fs, 'p', state).map((e) => e.seq)).toEqual([2])
  })

  test('carry 跨 chunk：半行留到下次不丢事件', () => {
    const full = line(7)
    const store = { text: full.slice(0, 10) } // 半行（无换行）
    const fs = memTailFs(store)
    const state: TailState = { byteOffset: 0, carry: '' }
    expect(readNewEvents(fs, 'p', state)).toEqual([]) // 半行挂起
    expect(state.carry.length).toBeGreaterThan(0)
    store.text = full // 补齐
    const evs = readNewEvents(fs, 'p', state)
    expect(evs.map((e) => e.seq)).toEqual([7])
  })

  test('截断/轮转：size < byteOffset → 归零重读', () => {
    const store = { text: line(1) + line(2) + line(3) }
    const fs = memTailFs(store)
    const state: TailState = { byteOffset: 0, carry: '' }
    readNewEvents(fs, 'p', state) // 读满三条
    store.text = line(9) // 截断重写（更短）
    const evs = readNewEvents(fs, 'p', state)
    expect(evs.map((e) => e.seq)).toEqual([9])
  })

  test('坏行/空行跳过', () => {
    const store = { text: 'not json\n\n' + line(4) }
    const fs = memTailFs(store)
    const state: TailState = { byteOffset: 0, carry: '' }
    expect(readNewEvents(fs, 'p', state).map((e) => e.seq)).toEqual([4])
  })

  test('文件缺失 → 归零返回空', () => {
    const fs: TailFs = { size: () => undefined, readSlice: () => undefined }
    const state: TailState = { byteOffset: 100, carry: 'stale' }
    expect(readNewEvents(fs, 'p', state)).toEqual([])
    expect(state.byteOffset).toBe(0)
    expect(state.carry).toBe('')
  })
})

describe('tailEvents 生成器（注入 sleep + maxEvents + sinceSeq + filter）', () => {
  test('fromStart 读全 backlog 到 maxEvents 即停', async () => {
    const store = { text: line(1) + line(2) + line(3) }
    const fs = memTailFs(store)
    const got: number[] = []
    for await (const ev of tailEvents(fs, 'p', { fromStart: true, maxEvents: 3, sleep: async () => {}, pollMs: 0 })) {
      got.push(ev.seq)
    }
    expect(got).toEqual([1, 2, 3])
  })

  test('sinceSeq 边界：seq<=since 跳过', async () => {
    const store = { text: line(1) + line(2) + line(3) }
    const fs = memTailFs(store)
    const got: number[] = []
    for await (const ev of tailEvents(fs, 'p', { sinceSeq: 1, maxEvents: 2, sleep: async () => {}, pollMs: 0 })) {
      got.push(ev.seq)
    }
    expect(got).toEqual([2, 3])
  })

  test('filter 过滤 kind', async () => {
    const store = { text: line(1, 'message') + line(2, 'progress') + line(3, 'message') }
    const fs = memTailFs(store)
    const got: number[] = []
    for await (const ev of tailEvents(fs, 'p', {
      fromStart: true,
      maxEvents: 2,
      filter: (e) => e.kind === 'message',
      sleep: async () => {},
      pollMs: 0,
    })) {
      got.push(ev.seq)
    }
    expect(got).toEqual([1, 3])
  })

  test('aborted 立即停（不吐）', async () => {
    const store = { text: line(1) }
    const fs = memTailFs(store)
    const got: number[] = []
    for await (const ev of tailEvents(fs, 'p', { fromStart: true, aborted: () => true, sleep: async () => {}, pollMs: 0 })) {
      got.push(ev.seq)
    }
    expect(got).toEqual([])
  })

  test('timeoutMs 到即停（注入 now 步进）', async () => {
    const store = { text: '' } // 无事件
    const fs = memTailFs(store)
    let t = 0
    const got: number[] = []
    for await (const ev of tailEvents(fs, 'p', {
      fromStart: true,
      timeoutMs: 100,
      now: () => (t += 60), // 每次 now() 前进 60ms → 第二轮超时
      sleep: async () => {},
      pollMs: 0,
    })) {
      got.push(ev.seq)
    }
    expect(got).toEqual([])
  })
})
