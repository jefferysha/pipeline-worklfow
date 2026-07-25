/**
 * compress/compress —— 确定性文档压缩单测（纯逻辑，零 LLM，可 oracle）。
 * 抽结构（标题层级）+ 决策 + 约束 + 开 todo + front-matter key，去正文/代码/样板；
 * 量化压缩率（原字符 → 压缩字符）。真实长文档压缩率达标在 handoff.integration.test.ts。
 */
import { describe, expect, test } from 'vitest'
import { compressDocument, renderHandoffSummary, ratioOf } from './compress.js'

const DOC = [
  '---',
  'title: Sample Design',
  'owner: alice',
  '---',
  '# Sample Design',
  '',
  'This is a long prose paragraph that explains background context and should be',
  'dropped as boilerplate noise during compression because it carries no signal.',
  '',
  '## Approach',
  '',
  'We decided to use a JSONL side-file for history storage.',
  'Decision: reject the yaml npm package to preserve byte compatibility.',
  '',
  'Some more filler prose that repeats template scaffolding and adds nothing.',
  '',
  '## Constraints',
  '',
  '- The parser MUST reject values containing a colon-space sequence.',
  '- 禁止引入通用 yaml 解析器。',
  '',
  '## Tasks',
  '',
  '- [x] wrote the parser',
  '- [ ] wire handoff into transition',
  '- [ ] measure compression ratio',
  '',
  '```ts',
  'const x = 1 // code body should be dropped as boilerplate',
  '```',
  '',
].join('\n')

describe('compressDocument —— 结构化抽取', () => {
  const doc = compressDocument(DOC)

  test('title = 首个 H1', () => {
    expect(doc.title).toBe('Sample Design')
  })

  test('headings = 全标题骨架（带 # 级别）', () => {
    expect(doc.headings).toEqual([
      '# Sample Design',
      '## Approach',
      '## Constraints',
      '## Tasks',
    ])
  })

  test('decisions = 决策行（去前缀，保序）', () => {
    expect(doc.decisions).toEqual([
      'We decided to use a JSONL side-file for history storage.',
      'Decision: reject the yaml npm package to preserve byte compatibility.',
    ])
  })

  test('constraints = 约束行（去 bullet 前缀）', () => {
    expect(doc.constraints).toEqual([
      'The parser MUST reject values containing a colon-space sequence.',
      '禁止引入通用 yaml 解析器。',
    ])
  })

  test('openTodos = 仅未完成项；doneTodoCount 计闭项', () => {
    expect(doc.openTodos).toEqual(['wire handoff into transition', 'measure compression ratio'])
    expect(doc.doneTodoCount).toBe(1)
  })

  test('keyFields = front-matter 键值', () => {
    expect(doc.keyFields).toEqual([
      { key: 'title', value: 'Sample Design' },
      { key: 'owner', value: 'alice' },
    ])
  })

  test('样板/正文/代码体被丢弃（不入任何桶）', () => {
    const bag = JSON.stringify(doc)
    expect(bag).not.toContain('background context')
    expect(bag).not.toContain('filler prose')
    expect(bag).not.toContain('code body should be dropped')
  })

  test('压缩率量化：压缩字符 < 原字符，ratio > 0', () => {
    expect(doc.stats.originalChars).toBe(DOC.length)
    expect(doc.stats.compressedChars).toBeLessThan(doc.stats.originalChars)
    expect(doc.stats.ratio).toBeGreaterThan(0)
    expect(doc.stats.originalLines).toBe(DOC.split('\n').length)
  })
})

describe('renderHandoffSummary —— 下游可读结构化摘要', () => {
  test('保留决策/约束/待办；空段省略', () => {
    const doc = compressDocument(DOC)
    const s = renderHandoffSummary(doc)
    expect(s).toContain('# 交接摘要: Sample Design')
    expect(s).toContain('## 结构')
    expect(s).toContain('## 决策 (2)')
    expect(s).toContain('- We decided to use a JSONL side-file for history storage.')
    expect(s).toContain('## 约束 (2)')
    expect(s).toContain('- 禁止引入通用 yaml 解析器。')
    expect(s).toContain('## 待办 (2)')
    expect(s).toContain('- [ ] wire handoff into transition')
    expect(s).toContain('## 关键字段')
    // 关键：样板正文不出现
    expect(s).not.toContain('background context')
  })

  test('label 覆写标题', () => {
    const doc = compressDocument(DOC)
    expect(renderHandoffSummary(doc, 'chg/design')).toContain('# 交接摘要: chg/design')
  })

  test('空段（无 decisions）不产出该 section 头', () => {
    const doc = compressDocument('# Only Heading\n\nplain prose only\n')
    const s = renderHandoffSummary(doc)
    expect(s).toContain('## 结构')
    expect(s).not.toContain('## 决策')
    expect(s).not.toContain('## 约束')
    expect(s).not.toContain('## 待办')
  })

  test('显式 en 保留英文摘要', () => {
    const doc = compressDocument(DOC, { documentLocale: 'en' })
    const s = renderHandoffSummary(doc, undefined, 'en')
    expect(s).toContain('# Handoff: Sample Design')
    expect(s).toContain('## Structure')
    expect(s).toContain('## Decisions (2)')
    expect(s).toContain('## Constraints (2)')
    expect(s).toContain('## Open TODOs (2)')
    expect(s).toContain('## Key Fields')
  })
})

describe('ratioOf —— 压缩率公式（4 位小数，原为 0 → 0）', () => {
  test('1 - 压缩/原', () => {
    expect(ratioOf(1000, 250)).toBe(0.75)
    expect(ratioOf(100, 100)).toBe(0)
    expect(ratioOf(0, 0)).toBe(0)
  })
  test('压缩比原大 → 负值（诚实报告，短文档可能膨胀）', () => {
    expect(ratioOf(10, 40)).toBeLessThan(0)
  })
})
