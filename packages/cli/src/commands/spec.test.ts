/**
 * spec 子命令 —— mock 层快速分支回归（TEST-REALITY.md：真实对位在 spec.integration.test.ts）。
 * 覆盖 dispatch / specs 文本+json 渲染 / set-spec-scope 写值+消息 / inject-jsonl 全分支渲染
 * （listing 与 inject outcome 经注入的 fake SpecFs，避免 fs——真 fs 面在 integration）。
 */
import { describe, expect, test } from 'vitest'
import { makeDeps, mockState } from '../test-support.js'
import { cmdSpec, type SpecFs } from './spec.js'
import type { InjectOutcome, SpecListing } from './spec.js'

function fakeFs(over: Partial<SpecFs> = {}): SpecFs {
  return {
    listSpecs: async (): Promise<SpecListing> => ({ dir: 'openspec/specs', exists: true, entries: [] }),
    inject: async (): Promise<InjectOutcome> => ({
      kind: 'ok',
      jsonlPath: 'openspec/changes/x/implement.jsonl',
      chunks: [],
      warnings: [],
      sawReal: false,
    }),
    ...over,
  }
}

describe('dispatch', () => {
  test('未知子命令 → stderr + exit 1', async () => {
    const deps = makeDeps()
    expect(await cmdSpec(deps, 'bogus', [])).toBe(1)
    expect(deps.errLines.join('\n')).toContain('未知 spec 子命令')
  })
})

describe('specs —— capability 列表（老仓 cmd_specs）', () => {
  const listing: SpecListing = {
    dir: 'openspec/specs',
    exists: true,
    entries: [
      { name: 'auth', specPath: 'openspec/specs/auth/spec.md', hasSpec: true },
      { name: 'billing', specPath: '', hasSpec: false },
    ],
  }

  test('text：header + 每 capability 一行（对齐/无 spec 标注）', async () => {
    const deps = makeDeps()
    expect(await cmdSpec(deps, 'specs', [], fakeFs({ listSpecs: async () => listing }))).toBe(0)
    expect(deps.outLines).toEqual([
      '## Main Specs（capability → spec.md）',
      `  - ${'auth'.padEnd(32)} openspec/specs/auth/spec.md`,
      `  - ${'billing'.padEnd(32)} (无 spec.md)`,
    ])
  })

  test('--json：紧凑数组，has_spec boolean，缺 spec 时 spec_path 空串', async () => {
    const deps = makeDeps()
    expect(await cmdSpec(deps, 'specs', ['--json'], fakeFs({ listSpecs: async () => listing }))).toBe(0)
    expect(deps.outLines).toHaveLength(1)
    expect(JSON.parse(deps.outLines[0]!)).toEqual([
      { name: 'auth', spec_path: 'openspec/specs/auth/spec.md', has_spec: true },
      { name: 'billing', spec_path: '', has_spec: false },
    ])
  })

  test('specs 目录缺失 text：(无 main spec — <dir> 不存在)', async () => {
    const deps = makeDeps()
    const fs = fakeFs({ listSpecs: async () => ({ dir: 'openspec/specs', exists: false, entries: [] }) })
    expect(await cmdSpec(deps, 'specs', [], fs)).toBe(0)
    expect(deps.outLines).toEqual(['(无 main spec — openspec/specs 不存在)'])
  })

  test('specs 目录缺失 --json：[]', async () => {
    const deps = makeDeps()
    const fs = fakeFs({ listSpecs: async () => ({ dir: 'openspec/specs', exists: false, entries: [] }) })
    expect(await cmdSpec(deps, 'specs', ['--json'], fs)).toBe(0)
    expect(deps.outLines).toEqual(['[]'])
  })

  test('specs 存在但空 text：header + (无 main spec)', async () => {
    const deps = makeDeps()
    expect(await cmdSpec(deps, 'specs', [], fakeFs())).toBe(0)
    expect(deps.outLines).toEqual(['## Main Specs（capability → spec.md）', '  (无 main spec)'])
  })
})

describe('set-spec-scope —— 写值归一 + 消息（老仓 cmd_set_spec_scope，green → stderr）', () => {
  test('list CSV → store.set 标量 + history + [OK] stderr', async () => {
    const deps = makeDeps({ state: mockState() })
    expect(await cmdSpec(deps, 'set-spec-scope', ['chg', 'auth,billing'])).toBe(0)
    expect(deps.store.set.calls[0]).toEqual(['/repo/openspec/changes/chg', 'spec_scope', 'auth,billing'])
    expect(deps.outLines).toEqual([])
    expect(deps.errLines.join('\n')).toContain('[OK] set-spec-scope chg: auth,billing')
    expect(deps.historyEntries[0]?.[1]).toMatchObject({ kind: 'set', field: 'spec_scope', to: 'auth,billing' })
  })

  test('空 scope → 写 null 哨兵 + 全扫消息', async () => {
    const deps = makeDeps({ state: mockState() })
    expect(await cmdSpec(deps, 'set-spec-scope', ['chg', ''])).toBe(0)
    expect(deps.store.set.calls[0]?.[2]).toBe('null')
    expect(deps.errLines.join('\n')).toContain('null（全扫，fail-open）')
  })

  test('缺 scope 参数（undefined）→ 也归一 null', async () => {
    const deps = makeDeps({ state: mockState() })
    expect(await cmdSpec(deps, 'set-spec-scope', ['chg'])).toBe(0)
    expect(deps.store.set.calls[0]?.[2]).toBe('null')
  })

  test('非法 change 名 → exit 1、不写', async () => {
    const deps = makeDeps()
    expect(await cmdSpec(deps, 'set-spec-scope', ['bad/../x', 'auth'])).toBe(1)
    expect(deps.store.set.calls).toHaveLength(0)
  })

  test('状态文件缺失（set 抛）→ exit 1', async () => {
    const deps = makeDeps({ states: {} })
    expect(await cmdSpec(deps, 'set-spec-scope', ['chg', 'auth'])).toBe(1)
    expect(deps.errLines.join('\n')).toContain('ERROR')
  })
})

describe('inject-jsonl —— 注入渲染（老仓 cmd_inject_jsonl，fail-open rc0）', () => {
  test('非法 change 名 → exit 1', async () => {
    const deps = makeDeps()
    expect(await cmdSpec(deps, 'inject-jsonl', ['bad/../x'])).toBe(1)
  })

  test('bad-agent → stderr Error + rc0（fail-open）', async () => {
    const deps = makeDeps()
    const fs = fakeFs({ inject: async () => ({ kind: 'bad-agent', jsonlPath: '', chunks: [], warnings: [], sawReal: false }) })
    expect(await cmdSpec(deps, 'inject-jsonl', ['chg', 'bogus'], fs)).toBe(0)
    expect(deps.outLines).toEqual([])
    expect(deps.errLines.join('\n')).toContain('jsonl agent 仅支持 implement / check（得到: bogus）')
  })

  test('missing → stderr WARN + rc0', async () => {
    const deps = makeDeps()
    const fs = fakeFs({
      inject: async () => ({ kind: 'missing', jsonlPath: 'openspec/changes/chg/implement.jsonl', chunks: [], warnings: [], sawReal: false }),
    })
    expect(await cmdSpec(deps, 'inject-jsonl', ['chg'], fs)).toBe(0)
    expect(deps.outLines).toEqual([])
    expect(deps.errLines.join('\n')).toContain('implement.jsonl 不存在')
  })

  test('ok：header + chunk（blank/marker/内容行）+ 无 real WARN 不出', async () => {
    const deps = makeDeps()
    const fs = fakeFs({
      inject: async () => ({
        kind: 'ok',
        jsonlPath: 'openspec/changes/chg/implement.jsonl',
        chunks: [{ path: 'src/a.md', content: 'L1\nL2\n' }],
        warnings: [],
        sawReal: true,
      }),
    })
    expect(await cmdSpec(deps, 'inject-jsonl', ['chg'], fs)).toBe(0)
    expect(deps.outLines).toEqual([
      '## Curated Context Manifest · implement (openspec/changes/chg/implement.jsonl)',
      '',
      '=== src/a.md ===',
      'L1',
      'L2',
    ])
    expect(deps.errLines).toEqual([])
  })

  test('ok：warnings → stderr、sawReal false → only-seed WARN', async () => {
    const deps = makeDeps()
    const fs = fakeFs({
      inject: async () => ({
        kind: 'ok',
        jsonlPath: 'openspec/changes/chg/check.jsonl',
        chunks: [],
        warnings: ['  > [WARN] file not found（注入期跳过）: gone.md'],
        sawReal: false,
      }),
    })
    expect(await cmdSpec(deps, 'inject-jsonl', ['chg', 'check'], fs)).toBe(0)
    expect(deps.outLines).toEqual(['## Curated Context Manifest · check (openspec/changes/chg/check.jsonl)'])
    const err = deps.errLines.join('\n')
    expect(err).toContain('file not found（注入期跳过）: gone.md')
    expect(err).toContain('has no curated entries (only seed)')
  })

  test('agent 默认 implement（不传第二参）', async () => {
    const deps = makeDeps()
    let seenAgent = ''
    const fs = fakeFs({
      inject: async (_cwd, _name, agent) => {
        seenAgent = agent
        return { kind: 'ok', jsonlPath: 'openspec/changes/chg/implement.jsonl', chunks: [], warnings: [], sawReal: true }
      },
    })
    expect(await cmdSpec(deps, 'inject-jsonl', ['chg'], fs)).toBe(0)
    expect(seenAgent).toBe('implement')
  })
})
