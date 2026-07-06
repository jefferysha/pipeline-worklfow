/**
 * spec-template-scaffold 纯逻辑单测（BACKLOG #33，Trellis parity 收尾 ①）。
 * 覆盖：项目类型分层空文档集构建 + 三态 skip/overwrite/append 计划（对标老仓 apply_strategy）。
 */
import { describe, expect, test } from 'vitest'
import {
  DEFAULT_SPEC_DIR,
  DOC_STRATEGIES,
  PROJECT_TYPES,
  SCAFFOLD_MARKER,
  SPEC_DOC_LAYOUTS,
  buildSpecScaffold,
  isDocStrategy,
  isProjectType,
  planDocScaffold,
  renderScaffoldDoc,
  type DocFile,
} from './doc-scaffold.js'

describe('project type / strategy 枚举守卫', () => {
  test('PROJECT_TYPES = web/cli/lib', () => {
    expect([...PROJECT_TYPES]).toEqual(['web', 'cli', 'lib'])
  })
  test('DOC_STRATEGIES = skip/overwrite/append（对标 apply_strategy 三态）', () => {
    expect([...DOC_STRATEGIES]).toEqual(['skip', 'overwrite', 'append'])
  })
  test('isProjectType / isDocStrategy 守卫', () => {
    expect(isProjectType('web')).toBe(true)
    expect(isProjectType('bogus')).toBe(false)
    expect(isDocStrategy('append')).toBe(true)
    expect(isDocStrategy('merge')).toBe(false)
  })
})

describe('renderScaffoldDoc —— 空文档 stub（含 scaffold marker + 标题 + TODO）', () => {
  test('渲染含 marker/标题/summary/TODO', () => {
    const md = renderScaffoldDoc({ rel: 'x/y.md', title: 'API 契约', summary: '描述对外 API' })
    expect(md).toContain(SCAFFOLD_MARKER)
    expect(md).toContain('# API 契约')
    expect(md).toContain('描述对外 API')
    expect(md.toLowerCase()).toContain('todo')
    expect(md.endsWith('\n')).toBe(true)
  })
})

describe('buildSpecScaffold —— 按类型预写分层空文档集', () => {
  test('web = frontend + backend + guides 三层', () => {
    const files = buildSpecScaffold('web')
    const rels = files.map((f) => f.rel)
    expect(rels.some((r) => r.includes('/frontend/'))).toBe(true)
    expect(rels.some((r) => r.includes('/backend/'))).toBe(true)
    expect(rels.some((r) => r.includes('/guides/'))).toBe(true)
    // 全部落在默认 spec 目录下
    expect(rels.every((r) => r.startsWith(`${DEFAULT_SPEC_DIR}/`))).toBe(true)
    // 每个文件真有 stub 内容（非空、含 marker）
    expect(files.every((f) => f.content.includes(SCAFFOLD_MARKER))).toBe(true)
  })

  test('cli / lib 各有自己的分层集，且都含 guides 层', () => {
    const cli = buildSpecScaffold('cli').map((f) => f.rel)
    const lib = buildSpecScaffold('lib').map((f) => f.rel)
    expect(cli.some((r) => r.includes('/commands/'))).toBe(true)
    expect(lib.some((r) => r.includes('/api/'))).toBe(true)
    expect(cli.some((r) => r.includes('/guides/'))).toBe(true)
    expect(lib.some((r) => r.includes('/guides/'))).toBe(true)
    // 类型间布局确有差异（非同一套）
    expect(cli).not.toEqual(lib)
  })

  test('自定义 specDir 前缀替换默认', () => {
    const files = buildSpecScaffold('lib', '.openspec/specs')
    expect(files.every((f) => f.rel.startsWith('.openspec/specs/'))).toBe(true)
  })

  test('SPEC_DOC_LAYOUTS 每类型至少 2 层非空、rel 唯一', () => {
    for (const t of PROJECT_TYPES) {
      const specs = SPEC_DOC_LAYOUTS[t]
      expect(specs.length).toBeGreaterThanOrEqual(2)
      const rels = specs.map((s) => s.rel)
      expect(new Set(rels).size).toBe(rels.length) // 无重复
    }
  })
})

const FILES: DocFile[] = [
  { rel: 'd/a.md', content: 'A' },
  { rel: 'd/b.md', content: 'B' },
  { rel: 'd/sub/c.md', content: 'C' },
]

describe('planDocScaffold —— 三态计划（对标 registry-source.sh apply_strategy）', () => {
  test('skip + 无冲突 → 全量写', () => {
    const plan = planDocScaffold(FILES, new Set(), 'skip')
    expect(plan.skippedAll).toBe(false)
    expect(plan.writes.map((f) => f.rel)).toEqual(['d/a.md', 'd/b.md', 'd/sub/c.md'])
    expect(plan.removes).toEqual([])
    expect(plan.skipped).toEqual([])
  })

  test('skip + 有任一冲突 → 整体跳过（skippedAll，保留用户文件，对标 skip=存在则不动返非零）', () => {
    const plan = planDocScaffold(FILES, new Set(['d/b.md']), 'skip')
    expect(plan.skippedAll).toBe(true)
    expect(plan.writes).toEqual([])
    expect(plan.skipped).toEqual(['d/a.md', 'd/b.md', 'd/sub/c.md'])
  })

  test('overwrite → 先删现存再全量写（对标 overwrite=先 rm 再拷）', () => {
    const plan = planDocScaffold(FILES, new Set(['d/b.md']), 'overwrite')
    expect(plan.skippedAll).toBe(false)
    expect(plan.removes).toEqual(['d/b.md'])
    expect(plan.writes.map((f) => f.rel)).toEqual(['d/a.md', 'd/b.md', 'd/sub/c.md'])
  })

  test('append → 只补缺失、保留既有（对标 append=_copy_missing 只补不存在含嵌套）', () => {
    const plan = planDocScaffold(FILES, new Set(['d/b.md']), 'append')
    expect(plan.skippedAll).toBe(false)
    expect(plan.writes.map((f) => f.rel)).toEqual(['d/a.md', 'd/sub/c.md'])
    expect(plan.skipped).toEqual(['d/b.md'])
    expect(plan.removes).toEqual([])
  })
})
