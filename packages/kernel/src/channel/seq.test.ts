/**
 * seq —— .seq 侧车解析 + jsonl 尾 last-seq 恢复（纯逻辑）。
 * 老仓真相源：skills/pipeline/scripts/channel/seq.py。
 */
import { describe, expect, test } from 'vitest'
import { lastSeqInLines, nextSeq, parseSidecar, readLastJsonlSeqFromText } from './seq.js'

describe('parseSidecar（seq.py:27：严格 ^[0-9]+$，前后空白非法）', () => {
  test('纯整数合法', () => {
    expect(parseSidecar('42')).toBe(42)
    expect(parseSidecar('0')).toBe(0)
  })
  test('容忍单个尾随换行', () => {
    expect(parseSidecar('7\n')).toBe(7)
  })
  test('前导/中间空白非法 → undefined', () => {
    expect(parseSidecar(' 7')).toBeUndefined()
    expect(parseSidecar('7 ')).toBeUndefined()
  })
  test('负数/小数/0x/+ → undefined', () => {
    expect(parseSidecar('-1')).toBeUndefined()
    expect(parseSidecar('1.5')).toBeUndefined()
    expect(parseSidecar('0x10')).toBeUndefined()
    expect(parseSidecar('+3')).toBeUndefined()
    expect(parseSidecar('')).toBeUndefined()
  })
})

describe('lastSeqInLines（seq.py:52：从后往前找首个 seq:int）', () => {
  test('取最后一条有 seq 的行', () => {
    const lines = [
      JSON.stringify({ seq: 1, kind: 'create' }),
      'garbage',
      JSON.stringify({ seq: 5, kind: 'message' }),
      '',
    ]
    expect(lastSeqInLines(lines)).toBe(5)
  })
  test('无 seq → undefined', () => {
    expect(lastSeqInLines(['garbage', '{}'])).toBeUndefined()
  })
})

describe('readLastJsonlSeqFromText（seq.py:67：宁崩不猜）', () => {
  test('空文本 → 0', () => {
    expect(readLastJsonlSeqFromText('')).toBe(0)
  })
  test('正常 → 尾 seq', () => {
    const text = [JSON.stringify({ seq: 3, kind: 'x' }), JSON.stringify({ seq: 4, kind: 'y' })].join('\n')
    expect(readLastJsonlSeqFromText(text)).toBe(4)
  })
  test('有非空行却无可解析 seq → 抛（宁崩不猜，防重复 seq）', () => {
    expect(() => readLastJsonlSeqFromText('not-json-line\nanother')).toThrow(/宁崩不猜|last seq/)
  })
})

describe('nextSeq', () => {
  test('last+1', () => {
    expect(nextSeq(0)).toBe(1)
    expect(nextSeq(9)).toBe(10)
  })
})
