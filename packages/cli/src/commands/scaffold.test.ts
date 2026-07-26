/**
 * scaffold 子命令 —— mock 层快速分支回归（TEST-REALITY.md：真实对位在 scaffold.integration.test.ts）。
 * 覆盖 dispatch / scaffold（类型守卫·三态·缺省冲突信号·env 信号）/ resolve-workflow（native·源命中·
 * 未知 id·fallback·marker·removeHash 契约）。fs 面经注入 fake（内存 map），真 fs 面在 integration。
 */
import { describe, expect, test } from 'vitest'
import { makeDeps } from '../test-support.js'
import { cmdScaffold, type ScaffoldFs } from './scaffold.js'

interface FakeFs extends ScaffoldFs {
  map: Map<string, string>
  writes: string[]
  removed: string[]
}
function fakeFs(opts: { files?: Record<string, string>; env?: Record<string, string> } = {}): FakeFs {
  const map = new Map(Object.entries(opts.files ?? {}))
  const envMap = opts.env ?? {}
  const writes: string[] = []
  const removed: string[] = []
  return {
    map,
    writes,
    removed,
    exists: async (abs) => map.has(abs) || [...map.keys()].some((k) => k.startsWith(`${abs}/`)),
    readText: async (abs) => map.get(abs),
    writeText: async (abs, content) => {
      map.set(abs, content)
      writes.push(abs)
    },
    rmrf: async (abs) => {
      for (const k of [...map.keys()]) if (k === abs || k.startsWith(`${abs}/`)) map.delete(k)
      removed.push(abs)
    },
    env: (name) => envMap[name],
  }
}
const P = (rel: string) => `/repo/${rel}`

describe('dispatch', () => {
  test('未知子命令 → stderr + exit 1', async () => {
    const deps = makeDeps()
    expect(await cmdScaffold(deps, 'bogus', [], fakeFs())).toBe(1)
    expect(deps.errLines.join('\n')).toContain('未知 scaffold 子命令')
  })
})

describe('scaffold —— 类型守卫 + 三态', () => {
  test('非法 project type → exit 1', async () => {
    const deps = makeDeps()
    expect(await cmdScaffold(deps, 'scaffold', ['bogus'], fakeFs())).toBe(1)
    expect(deps.errLines.join('\n')).toContain('非法 project type')
  })

  test('web 无冲突 → 全量写、stdout 列出文件、exit 0', async () => {
    const deps = makeDeps()
    const fs = fakeFs()
    expect(await cmdScaffold(deps, 'scaffold', ['web'], fs)).toBe(0)
    expect(fs.writes.length).toBeGreaterThanOrEqual(5)
    expect(fs.writes.some((p) => p.includes('/frontend/'))).toBe(true)
    expect(fs.writes.some((p) => p.includes('/backend/'))).toBe(true)
    expect(deps.outLines.every((l) => l.startsWith('openspec/specs/'))).toBe(true)
  })

  test('缺省冲突（有既存 + 无策略）→ 三选一指引 + exit 2（AskUserQuestion 替代信号）', async () => {
    const deps = makeDeps()
    const fs = fakeFs({ files: { [P('openspec/specs/backend/api.md')]: 'user content' } })
    expect(await cmdScaffold(deps, 'scaffold', ['web'], fs)).toBe(2)
    const err = deps.errLines.join('\n')
    expect(err).toContain('SPEC-CONFLICT')
    expect(err).toContain('skip')
    expect(err).toContain('overwrite')
    expect(err).toContain('append')
    expect(fs.writes).toEqual([]) // 未写
  })

  test('TENON_SPEC_STRATEGY=append 信号（上层注入）→ 冲突下只补缺失', async () => {
    const deps = makeDeps()
    const fs = fakeFs({
      files: { [P('openspec/specs/backend/api.md')]: 'keep me' },
      env: { TENON_SPEC_STRATEGY: 'append' },
    })
    expect(await cmdScaffold(deps, 'scaffold', ['web'], fs)).toBe(0)
    expect(fs.map.get(P('openspec/specs/backend/api.md'))).toBe('keep me') // 既有保留
    expect(fs.writes.some((p) => p.endsWith('/backend/api.md'))).toBe(false) // 未覆盖
    expect(fs.writes.some((p) => p.endsWith('/frontend/README.md'))).toBe(true) // 补缺失
  })

  test('--strategy overwrite → 先删现存再写', async () => {
    const deps = makeDeps()
    const fs = fakeFs({ files: { [P('openspec/specs/backend/api.md')]: 'old' } })
    expect(await cmdScaffold(deps, 'scaffold', ['web', '--strategy', 'overwrite'], fs)).toBe(0)
    expect(fs.removed).toContain(P('openspec/specs/backend/api.md'))
    expect(fs.map.get(P('openspec/specs/backend/api.md'))).toContain('# API 契约')
  })

  test('--strategy skip + 冲突 → 整体保留、不写、exit 0', async () => {
    const deps = makeDeps()
    const fs = fakeFs({ files: { [P('openspec/specs/backend/api.md')]: 'old' } })
    expect(await cmdScaffold(deps, 'scaffold', ['web', '--strategy', 'skip'], fs)).toBe(0)
    expect(fs.writes).toEqual([])
    expect(deps.errLines.join('\n')).toContain('保留')
  })

  test('非法 strategy → exit 1', async () => {
    const deps = makeDeps()
    expect(await cmdScaffold(deps, 'scaffold', ['web', '--strategy', 'merge'], fakeFs())).toBe(1)
    expect(deps.errLines.join('\n')).toContain('非法 strategy')
  })

  test('--spec-dir 自定义前缀', async () => {
    const deps = makeDeps()
    const fs = fakeFs()
    expect(await cmdScaffold(deps, 'scaffold', ['lib', '--spec-dir', '.openspec/specs'], fs)).toBe(0)
    expect(fs.writes.every((p) => p.startsWith(P('.openspec/specs/')))).toBe(true)
  })
})

describe('resolve-workflow —— 多 id 解析 + marker + removeHash 契约', () => {
  test('无 id → native（offline-first），hash-contract=record', async () => {
    const deps = makeDeps()
    expect(await cmdScaffold(deps, 'resolve-workflow', [], fakeFs())).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('id=native')
    expect(out).toContain('native=true')
    expect(out).toContain('hash-contract=record')
  })

  test('--source-index 命中 id → 非 native、source=true、hash-contract=remove', async () => {
    const deps = makeDeps()
    const fs = fakeFs({ files: { [P('idx.txt')]: 'strict 严格\nlean 精简\nnative (bundled)\n' } })
    expect(await cmdScaffold(deps, 'resolve-workflow', ['lean', '--source-index', 'idx.txt'], fs)).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('id=lean')
    expect(out).toContain('native=false')
    expect(out).toContain('hash-contract=remove')
  })

  test('未知 id（无 fallback）→ exit 1', async () => {
    const deps = makeDeps()
    const fs = fakeFs({ files: { [P('idx.txt')]: 'strict\n' } })
    expect(await cmdScaffold(deps, 'resolve-workflow', ['ghost', '--source-index', 'idx.txt'], fs)).toBe(1)
    expect(deps.errLines.join('\n')).toContain('unknown workflow id')
  })

  test('未知 id + --fallback-native → 降级 native、exit 0', async () => {
    const deps = makeDeps()
    const fs = fakeFs({ files: { [P('idx.txt')]: 'strict\n' } })
    expect(
      await cmdScaffold(deps, 'resolve-workflow', ['ghost', '--source-index', 'idx.txt', '--fallback-native'], fs),
    ).toBe(0)
    expect(deps.outLines.join('\n')).toContain('id=native')
    expect(deps.errLines.join('\n')).toContain('降级 native')
  })

  test('缺 source-index 文件 → exit 1', async () => {
    const deps = makeDeps()
    expect(await cmdScaffold(deps, 'resolve-workflow', ['x', '--source-index', 'nope.txt'], fakeFs())).toBe(1)
    expect(deps.errLines.join('\n')).toContain('source index 不存在')
  })

  test('--marker（非 native）→ 写 .pipeline-workflow-source', async () => {
    const deps = makeDeps()
    const fs = fakeFs({ files: { [P('idx.txt')]: 'lean\n' } })
    expect(
      await cmdScaffold(deps, 'resolve-workflow', ['lean', '--source-index', 'idx.txt', '--marker'], fs),
    ).toBe(0)
    expect(fs.map.has(P('.pipeline-workflow-source'))).toBe(true)
    expect(fs.map.get(P('.pipeline-workflow-source'))).toContain('id=lean')
  })

  test('--apply-hash 非 native → 从 owned manifest 删 workflow 条目', async () => {
    const deps = makeDeps()
    const fs = fakeFs({
      files: {
        [P('idx.txt')]: 'lean\n',
        [P('.pipeline-owned.json')]: JSON.stringify({ '.pipeline/workflow.md': 'stale', 'a.md': 'h' }),
      },
    })
    expect(
      await cmdScaffold(deps, 'resolve-workflow', ['lean', '--source-index', 'idx.txt', '--apply-hash'], fs),
    ).toBe(0)
    const manifest = JSON.parse(fs.map.get(P('.pipeline-owned.json')) as string)
    expect('.pipeline/workflow.md' in manifest).toBe(false) // removeHash 契约
    expect(manifest['a.md']).toBe('h') // 其它不动
  })

  test('--apply-hash native → 记 workflow.md 的 content hash', async () => {
    const deps = makeDeps()
    const fs = fakeFs({
      files: {
        [P('.pipeline/workflow.md')]: '# native workflow\n',
        [P('.pipeline-owned.json')]: JSON.stringify({}),
      },
    })
    expect(await cmdScaffold(deps, 'resolve-workflow', ['native', '--apply-hash'], fs)).toBe(0)
    const manifest = JSON.parse(fs.map.get(P('.pipeline-owned.json')) as string)
    expect(typeof manifest['.pipeline/workflow.md']).toBe('string')
    expect(manifest['.pipeline/workflow.md'].length).toBe(64) // sha256 hex
  })
})
