/**
 * loops yamlBlock —— loops.yaml 条目块定位共享内件（update / graduation 两处手术的同款去重）。
 * 覆盖：locateLoop 命中（常规两块 / 行尾注释 / 块内空行跳过 / 末块到文件尾 / dash 任意缩进 /
 * dash 后多空格的 fieldIndent 与 dashIndent 分离）、未命中（未知 id / 前缀 id 不误吃）、
 * insertPointAtBlockEnd（常规块尾 / 尾空行回缩 / 全空区间回落 end / 子块头行当 start）、indentOf 各列。
 */
import { describe, expect, test } from 'vitest'
import { indentOf, insertPointAtBlockEnd, locateLoop } from './yamlBlock.js'

// 行号图（断言按下标）：
//  0 # 顶注释
//  1 version: 1
//  2 loops:
//  3   # 条目注释
//  4   - id: build-loop
//  5     name: Build
//  6 （块内空行）
//  7     status: active
//  8   - id: docs-loop  # 行尾注释
//  9     name: Docs
// 10 （尾空行）
const LINES = [
  '# 顶注释',
  'version: 1',
  'loops:',
  '  # 条目注释',
  '  - id: build-loop',
  '    name: Build',
  '',
  '    status: active',
  '  - id: docs-loop  # 行尾注释',
  '    name: Docs',
  '',
]

describe('locateLoop —— 命中', () => {
  test('常规块：start 指 `- id:` 行，end 停在下一个缩进 ≤ dashIndent 的非空行（块内空行跳过）', () => {
    expect(locateLoop(LINES, 'build-loop')).toEqual({ start: 4, end: 8, dashIndent: 2, fieldIndent: 4 })
  })

  test('行尾注释的 id 行照常命中；末块 end = 行数（尾空行不截断）', () => {
    expect(locateLoop(LINES, 'docs-loop')).toEqual({ start: 8, end: 11, dashIndent: 2, fieldIndent: 4 })
  })

  test('dash 后多空格：fieldIndent 对齐 id 键真实列（dashIndent + 1 + 空白长），两值分离', () => {
    const wide = [
      'loops:',
      '  -   id: a',
      '      x: 1',
      'tail: 1',
    ]
    expect(locateLoop(wide, 'a')).toEqual({ start: 1, end: 3, dashIndent: 2, fieldIndent: 6 })
  })

  test('dash 顶格（缩进 0）：块界定与列推导不依赖固定两格缩进', () => {
    const top = [
      '- id: t',
      '  k: v',
      '- id: u',
    ]
    expect(locateLoop(top, 't')).toEqual({ start: 0, end: 2, dashIndent: 0, fieldIndent: 2 })
    expect(locateLoop(top, 'u')).toEqual({ start: 2, end: 3, dashIndent: 0, fieldIndent: 2 })
  })
})

describe('locateLoop —— 未命中', () => {
  test('未知 id → null', () => {
    expect(locateLoop(LINES, 'nope')).toBeNull()
  })

  test('目标是既有 id 的前缀 → null（值精确比对，不吃前缀同名）', () => {
    expect(locateLoop(LINES, 'build')).toBeNull()
    expect(locateLoop(LINES, 'docs')).toBeNull()
  })

  test('空文档 / 无 loops 条目 → null', () => {
    expect(locateLoop([], 'x')).toBeNull()
    expect(locateLoop(['version: 1', 'loops: []'], 'x')).toBeNull()
  })
})

describe('insertPointAtBlockEnd', () => {
  test('常规：区间 (start, end) 内最后一个非空行之后', () => {
    // build-loop 块 (4, 8)：最后非空行 = 7（status），插入点 8
    expect(insertPointAtBlockEnd(LINES, 4, 8)).toBe(8)
  })

  test('块尾空行回缩：插入点落在最后一个非空行之后，不落在尾空行之后', () => {
    // docs-loop 块 (8, 11)：行 10 为空，最后非空行 = 9（name），插入点 10
    expect(insertPointAtBlockEnd(LINES, 8, 11)).toBe(10)
  })

  test('区间内全空 → 回落 end', () => {
    expect(insertPointAtBlockEnd(['a:', '', '', 'b:'], 0, 3)).toBe(3)
  })

  test('块仅剩 id 行（end === start+1）：循环不进,直接回落 end（评审加固——防日后改循环边界无网）', () => {
    expect(insertPointAtBlockEnd(['- id: only', 'next:'], 0, 1)).toBe(1)
  })

  test('子块语境：start 传子块头行（如 budget:）同样成立', () => {
    const sub = [
      '    budget:',
      '      max_runs_per_day: 2',
      '      on_exceed: skip',
      '    kill_criteria:',
    ]
    expect(insertPointAtBlockEnd(sub, 0, 3)).toBe(3)
  })
})

describe('indentOf', () => {
  test('各列：0 / 2 / 4；空串 0；全空白行计全长', () => {
    expect(indentOf('top: 1')).toBe(0)
    expect(indentOf('  - id: x')).toBe(2)
    expect(indentOf('    name: y')).toBe(4)
    expect(indentOf('')).toBe(0)
    expect(indentOf('    ')).toBe(4)
  })
})
