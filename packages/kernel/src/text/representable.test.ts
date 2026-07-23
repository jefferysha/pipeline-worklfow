/**
 * stringUnrepresentableReason（中性模块）—— 窄行序列化子集 UTF-8 落盘往返的通用拒绝面，钉死
 * 一字不多一字不少。schema 层（workflow/representable.ts）委托本模块再叠加各自 parser 的行解析
 * 限制；两处 cross-check 一致性契约见 workflow/representable.test.ts。
 */
import { describe, expect, it } from 'vitest'
import { stringUnrepresentableReason } from './representable.js'

describe('stringUnrepresentableReason —— 中性 UTF-8 往返拒绝面', () => {
  it('拒：空串（逐行值捕获读不回零字符）', () => {
    expect(stringUnrepresentableReason('')).toMatch(/空串/)
  })

  it('拒：控制字符（\\n/\\r/\\t 及 C0/C1 其余控制符，覆盖面广于 \\n\\r\\t）', () => {
    for (const s of ['a\nb', 'a\rb', 'a\tb', 'a\u0001b', 'a\u007Fb', 'a\u009Fb']) {
      expect(stringUnrepresentableReason(s), JSON.stringify(s)).toMatch(/控制字符/)
    }
  })

  it('拒：首尾空白（读回被 trim 丢失）', () => {
    for (const s of [' pad', 'pad ', '  ', ' both ']) {
      expect(stringUnrepresentableReason(s), JSON.stringify(s)).toMatch(/首尾空白/)
    }
  })

  it('拒：未配对 UTF-16 surrogate（UTF-8 落盘被 U+FFFD 替换，无法往返）', () => {
    for (const s of ['a\uD800b', 'a\uDC00b', '\uD800', '\uDBFF', '\uDC00', '\uDFFF']) {
      expect(stringUnrepresentableReason(s), JSON.stringify(s)).toMatch(/surrogate/)
    }
  })

  it('可表示（null）：普通值/标点/歧义标量/单双引号（含同含两款）/CJK/成对 emoji/内部 U+2028·U+2029', () => {
    // 中性层刻意不拒引号（quoted/bare 由 schema 层裁量）与 U+2028/U+2029（能否往返取决于 parser 是否
    // 开 dotAll——UTF-8 物理上它俩可往返，故中性层放行；workflow 逐行 parser 的限制在其自身叠加）。
    for (const s of [
      'handled', 'needs review', 'a: b', 'a #b', 'x,y', 'true', '123', '-7', '~', '*', 'yes', 'no', 'null',
      "it's", 'say "hi"', `a'b"c`, '会话', 'emoji 😀 ok', 'a\u2028b', 'a\u2029b',
    ]) {
      expect(stringUnrepresentableReason(s), JSON.stringify(s)).toBeNull()
    }
  })
})
