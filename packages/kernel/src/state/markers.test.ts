import { describe, expect, test } from 'vitest'
import { reviewHint } from './markers.js'

/**
 * reviewHint 的逐字映射独立锚定（G1 REFACTOR 第二轮 codex review 指出：server.test.ts 的
 * "精确格式"断言用 reviewHint('explore') 拼期望值，与生产实现同源自证——若这个函数的文案被
 * 误改，产物和期望会一起漂移、测试仍绿。这里用硬编码字面量钉死，充当独立 oracle。
 */
describe('reviewHint —— review 相位的 marker 指引文案（老内核 state-transition.sh 同款三行格式第二行）', () => {
  test('explore → design_doc 指引', () => {
    expect(reviewHint('explore')).toBe('design_doc（深度设计 / 调研 + 关键决策）')
  })
  test('spec → plan 指引', () => {
    expect(reviewHint('spec')).toBe('plan / 用户旅程 / delta spec（实施计划）')
  })
  test('verify → verification_report 指引', () => {
    expect(reviewHint('verify')).toBe('verification_report（验证结论）')
  })
  test('非复核相位（open/build/ship/archive）→ 通用兜底文案', () => {
    expect(reviewHint('open')).toBe('（待复核）')
    expect(reviewHint('build')).toBe('（待复核）')
    expect(reviewHint('ship')).toBe('（待复核）')
    expect(reviewHint('archive')).toBe('（待复核）')
  })
})
