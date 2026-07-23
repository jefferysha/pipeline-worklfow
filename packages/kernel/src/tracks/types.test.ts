/**
 * TRACK_ID_RE 行为测试——track id 词法闭集（小写字母开头、仅 a-z0-9_-、总长 ≤32、
 * 禁 '.'、禁下划线开头）。'_all' 的保留字专门文案在 validate.test.ts 断言；
 * 这里只验证正则本身就把它排除在外。
 */
import { describe, expect, test } from 'vitest'
import { TRACK_ID_RE } from './types.js'

describe('TRACK_ID_RE', () => {
  test('放行：小写字母开头 + a-z0-9_- + 长度 1..32', () => {
    for (const ok of ['a', 'data', 'ml-ops', 'track_2', 'a123', `a${'b'.repeat(31)}`]) {
      expect(TRACK_ID_RE.test(ok), ok).toBe(true)
    }
  })

  test("拒绝：空串/大写/数字开头/下划线开头（含 '_all'）/含点/超长/空格/非 ASCII", () => {
    const tooLong = `a${'b'.repeat(32)}` // 33 字符
    for (const bad of ['', 'Data', '1data', '_all', '_x', 'a.b', 'chat.custom', tooLong, 'a b', 'é']) {
      expect(TRACK_ID_RE.test(bad), JSON.stringify(bad)).toBe(false)
    }
  })
})
