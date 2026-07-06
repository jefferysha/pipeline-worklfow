/**
 * mem/context —— 上下文窗选择（真逻辑）：user 优先 / around 扩展 / 半预算头截断 / 保底一条。
 * 对位老仓 skills/pipeline/scripts/mem/context.py。
 */
import { describe, expect, test } from 'vitest'
import { selectContextTurns } from './context.js'

const turns = [
  { role: 'user' as const, text: 'find the memory bug' },
  { role: 'assistant' as const, text: 'ok' },
  { role: 'user' as const, text: 'memory again' },
  { role: 'assistant' as const, text: 'memory fix done' },
]

describe('selectContextTurns —— grep 排名（老仓 select_context_turns:11）', () => {
  test('user 优先 > hits 降 > idx 升，取 top nTurns', () => {
    const r = selectContextTurns(turns, 'memory', 2, 0, 6000)
    expect(r.totalHitTurns).toBe(3)
    expect(r.turns.map((t) => t.idx)).toEqual([0, 2]) // 两个 user 优先于 asst
    expect(r.turns.every((t) => t.isHit)).toBe(true)
    expect(r.budgetUsed).toBe('find the memory bug'.length + 'memory again'.length)
  })

  test('around 扩展相邻 turn（非 hit 标 isHit=false）', () => {
    const r = selectContextTurns(turns, 'fix', 1, 1, 6000)
    // 命中 idx3（asst），around=1 → 含 idx2（user，非 hit）
    expect(r.turns.map((t) => t.idx)).toEqual([2, 3])
    expect(r.turns.find((t) => t.idx === 2)?.isHit).toBe(false)
    expect(r.turns.find((t) => t.idx === 3)?.isHit).toBe(true)
  })

  test('无 grep → 会话开头前 nTurns', () => {
    const r = selectContextTurns(turns, null, 2, 0, 6000)
    expect(r.totalHitTurns).toBe(0)
    expect(r.turns.map((t) => t.idx)).toEqual([0, 1])
  })

  test('单 turn 超半预算 → 头截断标记 + 保底出一条', () => {
    const long = [{ role: 'user' as const, text: 'abcdefghijklmnopqrstuvwxyz1234' }] // 30 chars
    const r = selectContextTurns(long, null, 1, 0, 20)
    expect(r.turns).toHaveLength(1)
    expect(r.turns[0]?.text.startsWith('abcdefghij')).toBe(true)
    expect(r.turns[0]?.text).toContain('[+20 chars]')
  })
})
