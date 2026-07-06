import { describe, expect, it } from 'vitest'
import { BoundedTail, MAX_TAIL_CHARS } from './boundedTail.js'

/**
 * boundedTail 64KiB 滚动尾部（老仓 runner/boundedTail.ts:36-72，DESIGN §7-item9）。
 * 纯逻辑真单测——不需 docker，防长任务 V8 RangeError 拖死整批。
 */
describe('BoundedTail', () => {
  it('MAX_TAIL_CHARS 默认 64KiB', () => {
    expect(MAX_TAIL_CHARS).toBe(64 * 1024)
  })

  it('预算内 push → toString 按 separator 拼接', () => {
    const t = new BoundedTail(100, '\n')
    t.push('a')
    t.push('b')
    t.push('c')
    expect(t.toString()).toBe('a\nb\nc')
  })

  it('超预算 → 逐出最旧项，长度恒 ≤ maxChars', () => {
    const t = new BoundedTail(10, '')
    for (const s of ['1234', '5678', 'abcd']) t.push(s) // 12 chars > 10
    const out = t.toString()
    expect(out.length).toBeLessThanOrEqual(10)
    expect(out.endsWith('abcd')).toBe(true) // 最新项保留
    expect(out.includes('1234')).toBe(false) // 最旧项被逐出
  })

  it('单项长于 maxChars → 截成自身尾部（一次 push 不溢出）', () => {
    const t = new BoundedTail(5, '')
    t.push('0123456789')
    expect(t.toString()).toBe('56789')
    expect(t.toString().length).toBe(5)
  })

  it('separator 长度计入预算', () => {
    const t = new BoundedTail(5, '\n')
    t.push('ab')
    t.push('cd') // "ab\ncd" = 5 chars
    expect(t.toString()).toBe('ab\ncd')
    t.push('ef') // 会溢出 → 逐出 "ab"
    expect(t.toString().length).toBeLessThanOrEqual(5)
    expect(t.toString().endsWith('ef')).toBe(true)
  })

  it('完成信号可落 64KiB 尾部内（result tag 在末尾 emit）', () => {
    const t = new BoundedTail(MAX_TAIL_CHARS, '\n')
    for (let i = 0; i < 5000; i++) t.push(`noise-line-${i}`)
    t.push('<output>{"verify_result":"pass"}</output>')
    expect(t.toString()).toContain('<output>{"verify_result":"pass"}</output>')
  })
})
