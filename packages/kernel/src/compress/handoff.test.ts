/**
 * compress/handoff —— phase handoff 编排单测（fs 注入面 fake，纯确定）。
 * 相位→上游产出文档解析（field 路径 + change 目录文件）+ 逐文档压缩 + 聚合压缩率。
 * 真 fs 对位在 cli handoff.integration.test.ts。
 */
import { describe, expect, test } from 'vitest'
import { buildHandoff, phaseHandoffDocs, type HandoffFs } from './handoff.js'

function fakeFs(map: Record<string, string>): HandoffFs {
  return {
    exists: (p) => Object.prototype.hasOwnProperty.call(map, p),
    readText: (p) => map[p],
  }
}

const DESIGN = [
  '# Design',
  'Lots of background prose that should compress away and carries no signal at all.',
  'Another paragraph of narrative context describing history that downstream never needs.',
  'Yet more filler explaining the same thing again in slightly different words here.',
  'And still more scaffolding text that pads the document without adding any signal.',
  '## Decision',
  'We decided to compress at phase handoff.',
  'The kernel MUST stay zero-dependency.',
  '- [ ] wire into transition',
].join('\n')

const PLAN = [
  '# Plan',
  'Prose prose prose filler that is dropped as boilerplate noise entirely here now.',
  'More narrative padding that repeats template scaffolding and carries zero signal.',
  'A third paragraph of pure filler that the downstream phase does not need to read.',
  'Decision: build before verify.',
  '- [ ] implement cmdHandoff',
].join('\n')

describe('phaseHandoffDocs —— 相位产出文档清单', () => {
  test('build 相位含 plan(field) + design_doc(field) + tasks/design 文件', () => {
    const specs = phaseHandoffDocs('build')
    const refs = specs.map((s) => `${s.kind}:${s.ref}`)
    expect(refs).toContain('field:plan')
    expect(refs).toContain('field:design_doc')
    expect(refs).toContain('changefile:tasks.md')
  })
  test('verify 相位含 verification_report', () => {
    const refs = phaseHandoffDocs('verify').map((s) => `${s.kind}:${s.ref}`)
    expect(refs).toContain('field:verification_report')
  })
  test('未知相位 → 空', () => {
    expect(phaseHandoffDocs('bogus')).toEqual([])
  })
})

describe('buildHandoff —— 解析 + 压缩 + 聚合', () => {
  const input = {
    name: 'chg',
    phase: 'build',
    cwd: '/repo',
    changeDirRel: 'openspec/changes/chg',
    fields: {
      plan: 'openspec/changes/chg/plan.md',
      design_doc: 'docs/design.md',
    } as Record<string, string | string[]>,
  }
  const fs = fakeFs({
    '/repo/openspec/changes/chg/plan.md': PLAN,
    '/repo/docs/design.md': DESIGN,
  })

  test('field 路径相对 cwd 解析 + 逐文档压缩摘要', () => {
    const r = buildHandoff(input, fs)
    // 两个 field 文档（plan + design_doc）都在 → 两条；tasks.md/design.md 缺 → 跳过
    expect(r.docs.map((d) => d.path).sort()).toEqual([
      'docs/design.md',
      'openspec/changes/chg/plan.md',
    ])
    const design = r.docs.find((d) => d.path === 'docs/design.md')!
    expect(design.doc.decisions).toContain('We decided to compress at phase handoff.')
    expect(design.doc.constraints).toContain('The kernel MUST stay zero-dependency.')
    expect(design.doc.openTodos).toContain('wire into transition')
    // 样板正文不入摘要
    expect(design.summary).not.toContain('background prose')
  })

  test('聚合压缩率 = 总压缩/总原（诚实合计）', () => {
    const r = buildHandoff(input, fs)
    expect(r.aggregate.originalChars).toBe(DESIGN.length + PLAN.length)
    expect(r.aggregate.compressedChars).toBeGreaterThan(0)
    expect(r.aggregate.ratio).toBeGreaterThan(0)
  })

  test('缺失/空文档跳过（不炸、不入 docs）', () => {
    const r = buildHandoff(
      { ...input, fields: { plan: 'nope.md', design_doc: 'null' } },
      fakeFs({}),
    )
    expect(r.docs).toEqual([])
    expect(r.aggregate.ratio).toBe(0)
  })

  test('空白文档（仅空格）跳过', () => {
    const r = buildHandoff(
      { ...input, fields: { plan: 'blank.md', design_doc: 'null' } },
      fakeFs({ '/repo/blank.md': '   \n  \n' }),
    )
    expect(r.docs).toEqual([])
  })

  test('specs 覆写 + 同文件去重（一个文件不压两遍）', () => {
    const r = buildHandoff(
      {
        ...input,
        specs: [
          { label: 'design_doc', kind: 'field', ref: 'design_doc' },
          { label: 'design_alias', kind: 'field', ref: 'design_doc' },
        ],
      },
      fs,
    )
    expect(r.docs).toHaveLength(1)
    expect(r.docs[0]!.path).toBe('docs/design.md')
  })

  test('绝对路径 field 值不再拼 cwd', () => {
    const r = buildHandoff(
      { ...input, specs: [{ label: 'design_doc', kind: 'field', ref: 'design_doc' }], fields: { design_doc: '/abs/design.md' } },
      fakeFs({ '/abs/design.md': DESIGN }),
    )
    expect(r.docs).toHaveLength(1)
    expect(r.docs[0]!.path).toBe('/abs/design.md')
  })
})
