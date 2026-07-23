/**
 * stringUnrepresentableReason —— serialize 引号策略拒绝面的唯一事实源（validate 与 serialize
 * 共用同一谓词，防两处拒绝面漂移）。本文件钉死拒绝面清单：一字不多、一字不少。
 */
import { describe, expect, test } from 'vitest'
import { stringUnrepresentableReason } from './representable.js'

describe('stringUnrepresentableReason —— 拒绝面清单', () => {
  test('拒：控制字符 \\n / \\r / \\t（换行按行 tokenize 写不出；tab 是窄子集显式排除项）', () => {
    expect(stringUnrepresentableReason('a\nb')).toMatch(/换行/)
    expect(stringUnrepresentableReason('a\rb')).toMatch(/回车/)
    expect(stringUnrepresentableReason('a\tb')).toMatch(/tab/)
  })

  test('拒：同含单双引号（本子集无转义语义，两种引号都包不住）', () => {
    expect(stringUnrepresentableReason(`a'b"c`)).toMatch(/单双引号/)
  })

  test('拒：未配对 UTF-16 surrogate（UTF-8 落盘会被 U+FFFD 替换，无法往返；codex R3 阻断 2）', () => {
    expect(stringUnrepresentableReason('a\uD800b')).toMatch(/surrogate/) // 孤立高位
    expect(stringUnrepresentableReason('a\uDC00b')).toMatch(/surrogate/) // 孤立低位
    expect(stringUnrepresentableReason('\uD800')).toMatch(/surrogate/) // 结尾孤立高位
    // 成对 surrogate（合法 astral 码点，如 😀 = U+1F600）可表示，不误伤
    expect(stringUnrepresentableReason('emoji 😀 ok')).toBeNull()
  })

  test('可表示（null）：单/双引号单方、前后导空白、#、逗号、歧义标量形、空串、中文、* 与 ~、' +
    'U+2028/U+2029 行分隔符（parser 值捕获已放宽到 [\\s\\S]*，能读回）', () => {
    for (const ok of [
      "it's", 'say "hi"', ' 前导', '尾随 ', 'a #b', 'x,y', 'true', '123', '-7', '', '会话', '*', '~',
      'a\u2028b', 'a\u2029b',
    ]) {
      expect(stringUnrepresentableReason(ok), JSON.stringify(ok)).toBeNull()
    }
  })
})
