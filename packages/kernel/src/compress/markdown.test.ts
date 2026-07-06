/**
 * compress/markdown —— 行级分类原语单测（纯逻辑，确定性，零 LLM）。
 * 覆盖 heading / decision / constraint / todo（开/闭）/ front-matter / 去前缀标记。
 * 真实对位在 handoff.integration.test.ts（真文档真压缩率）。
 */
import { describe, expect, test } from 'vitest'
import {
  isHeading,
  isDecision,
  isConstraint,
  isDoneTodo,
  openTodoText,
  stripLeadMarkers,
  parseFrontMatter,
} from './markdown.js'

describe('isHeading', () => {
  test('# .. ###### 逐级识别 + text trim', () => {
    expect(isHeading('# Title')).toEqual({ level: 1, text: 'Title' })
    expect(isHeading('###   Deep Section  ')).toEqual({ level: 3, text: 'Deep Section' })
    expect(isHeading('###### h6')).toEqual({ level: 6, text: 'h6' })
  })
  test('非标题 → null（无空格 / 超 6 级 / 正文）', () => {
    expect(isHeading('#nospace')).toBeNull()
    expect(isHeading('####### too-deep')).toBeNull()
    expect(isHeading('plain prose')).toBeNull()
    expect(isHeading('   # indented-not-heading')).toBeNull()
  })
})

describe('isDecision —— 决策标记（EN + ZH）', () => {
  test('命中：Decision: / we decided / chosen / conclusion / 决策 / 采用', () => {
    expect(isDecision('Decision: use JSONL side-file')).toBe(true)
    expect(isDecision('We decided to reject the yaml package')).toBe(true)
    expect(isDecision('The chosen approach is a narrow parser')).toBe(true)
    expect(isDecision('Conclusion: ship the lite kernel')).toBe(true)
    expect(isDecision('决策：采用块序列写回')).toBe(true)
    expect(isDecision('最终采用 mkdir 原子锁')).toBe(true)
  })
  test('不命中：普通叙述无标记', () => {
    expect(isDecision('This paragraph is background context only.')).toBe(false)
    expect(isDecision('It runs fast and looks fine.')).toBe(false)
  })
})

describe('isConstraint —— 约束标记（RFC2119 大写 + ZH）', () => {
  test('命中：MUST / SHALL / REQUIRED / constraint / 必须 / 禁止', () => {
    expect(isConstraint('The parser MUST reject colon-space values')).toBe(true)
    expect(isConstraint('It SHALL NOT spawn node on the hot path')).toBe(true)
    expect(isConstraint('base_branch is REQUIRED')).toBe(true)
    expect(isConstraint('Hard constraint: kernel zero deps')).toBe(true)
    expect(isConstraint('必须字节级兼容老内核')).toBe(true)
    expect(isConstraint('禁止引入通用 yaml 解析器')).toBe(true)
  })
  test('不命中：小写 must 的日常叙述不误伤压缩率', () => {
    expect(isConstraint('we must consider the tradeoffs later')).toBe(false)
    expect(isConstraint('plain sentence')).toBe(false)
  })
})

describe('todo 分类', () => {
  test('开 checkbox → 文本；闭 checkbox → done', () => {
    expect(openTodoText('- [ ] wire handoff into transition')).toBe('wire handoff into transition')
    expect(openTodoText('  * [ ]  measure ratio ')).toBe('measure ratio')
    expect(isDoneTodo('- [x] wrote the parser')).toBe(true)
    expect(isDoneTodo('- [X] upper done')).toBe(true)
    expect(openTodoText('- [x] wrote the parser')).toBeNull()
  })
  test('TODO/待办 关键词行 → 开 todo（去前缀）', () => {
    expect(openTodoText('- TODO: finish the report')).toBe('TODO: finish the report')
    expect(openTodoText('> 待办：补充覆盖用例')).toBe('待办：补充覆盖用例')
    expect(openTodoText('just prose')).toBeNull()
  })
})

describe('stripLeadMarkers —— 去列表/引用前缀', () => {
  test('去 - / * / + / > 前缀 + trim', () => {
    expect(stripLeadMarkers('- a decision')).toBe('a decision')
    expect(stripLeadMarkers('  * item')).toBe('item')
    expect(stripLeadMarkers('> quoted note')).toBe('quoted note')
    expect(stripLeadMarkers('  > - nested')).toBe('nested')
    expect(stripLeadMarkers('no prefix')).toBe('no prefix')
  })
})

describe('parseFrontMatter —— YAML front-matter 顶块 key:value', () => {
  test('提取 key:value + bodyStart 指向闭合 --- 之后', () => {
    const lines = ['---', 'title: Sample', 'owner: alice', '---', '# Body', 'text']
    const fm = parseFrontMatter(lines)
    expect(fm.keyFields).toEqual([
      { key: 'title', value: 'Sample' },
      { key: 'owner', value: 'alice' },
    ])
    expect(fm.bodyStart).toBe(4)
  })
  test('无 front-matter → 空 + bodyStart 0', () => {
    const fm = parseFrontMatter(['# Body', 'text'])
    expect(fm.keyFields).toEqual([])
    expect(fm.bodyStart).toBe(0)
  })
  test('未闭合 --- → 不当 front-matter', () => {
    const fm = parseFrontMatter(['---', 'title: x', '# never closes'])
    expect(fm.keyFields).toEqual([])
    expect(fm.bodyStart).toBe(0)
  })
})
