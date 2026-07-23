/**
 * turns —— TurnTracker 主机本地 turn 栈（idle↔mid-turn 跃迁 hook）。
 * 老仓真相源：skills/pipeline/scripts/channel/turns.py。
 */
import { describe, expect, test } from 'vitest'
import { TurnTracker } from './turns.js'

describe('TurnTracker（turns.py:19）', () => {
  test('turnId = msg:<inputSeq>', () => {
    const t = new TurnTracker()
    expect(t.begin(7).turnId).toBe('msg:7')
    expect(t.current()?.inputSeq).toBe(7)
  })

  test('begin 从 0→1 触发 onIdleExit（暂停 timer）', () => {
    const events: string[] = []
    const t = new TurnTracker(() => events.push('exit'), () => events.push('enter'))
    t.begin(1)
    expect(events).toEqual(['exit'])
    // 嵌套 begin 不再触发（非 0→1）
    t.begin(2)
    expect(events).toEqual(['exit'])
  })

  test('finish 从 1→0 触发 onIdleEnter（重启 timer）', () => {
    const events: string[] = []
    const t = new TurnTracker(() => events.push('exit'), () => events.push('enter'))
    t.begin(1)
    t.begin(2)
    t.finish() // 2→1，不触发
    expect(events).toEqual(['exit'])
    t.finish() // 1→0，触发 enter
    expect(events).toEqual(['exit', 'enter'])
  })

  test('abortCurrent 弹栈并在归零时触发 enter', () => {
    const events: string[] = []
    const t = new TurnTracker(() => events.push('exit'), () => events.push('enter'))
    t.begin(5)
    const aborted = t.abortCurrent()
    expect(aborted?.turnId).toBe('msg:5')
    expect(events).toEqual(['exit', 'enter'])
    expect(t.current()).toBeUndefined()
  })

  test('空栈 finish/abort 返回 undefined 不触发 enter', () => {
    const events: string[] = []
    const t = new TurnTracker(() => events.push('exit'), () => events.push('enter'))
    expect(t.finish()).toBeUndefined()
    expect(t.abortCurrent()).toBeUndefined()
    expect(events).toEqual([])
  })
})
