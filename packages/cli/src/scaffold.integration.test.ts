/**
 * scaffold —— 真实端到端集成测试（BACKLOG #33，GOAL C9：无伪测试）。
 *
 * 零 mock：freshHarness 真临时项目 + realDeps 构造真 kernel deps（loadManifest/createStateStore）+
 * 真调 cmdScaffold（默认 REAL_FS：真 stat/readFile/writeFile/rm、真读 process.env 信号）。
 * 断言真实副作用：真落盘的分层空文档集（frontend/backend/guides 真文件 + 真 marker 内容）+ 三态
 * 真删/真补/真保留 + resolve-workflow 真读源索引文件 + 真写 marker + removeHash 真改 owned manifest。
 *
 * 覆盖（C10）：scaffold web/cli/lib happy（真落盘分层）+ 缺省冲突 exit 2（真不写）+ 三态
 *   overwrite/append/skip（真删/真补/真保留）+ env 信号 + 非法参数；resolve-workflow native + 源命中 +
 *   未知 id + fallback + marker 真写 + apply-hash 真改 manifest（native 记 / 非 native 删）。
 */
import { mkdir, readFile, stat, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { freshHarness, realDeps, rm, type Harness } from './integration-harness.js'
import { cmdScaffold } from './commands/scaffold.js'

interface Run {
  code: number
  out: string[]
  err: string[]
}

/** 真调 cmdScaffold（realDeps 真 kernel + 默认 REAL_FS 真 fs）。 */
async function scaffold(h: Harness, sub: string, args: string[]): Promise<Run> {
  const out: string[] = []
  const err: string[] = []
  const code = await cmdScaffold(realDeps(h.cwd, out, err), sub, args)
  return { code, out, err }
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

describe('真实 e2e —— scaffold 按类型铺分层空文档集（真落盘）', () => {
  let h: Harness
  beforeEach(async () => {
    h = await freshHarness()
  })
  afterEach(async () => {
    await rm(h.cwd, { recursive: true, force: true })
  })

  test('web → 真写 frontend/backend/guides 三层空文档，含 scaffold marker', async () => {
    const r = await scaffold(h, 'scaffold', ['web'])
    expect(r.code).toBe(0)
    for (const rel of [
      'openspec/specs/frontend/README.md',
      'openspec/specs/backend/api.md',
      'openspec/specs/backend/data-model.md',
      'openspec/specs/guides/architecture.md',
    ]) {
      expect(await exists(join(h.cwd, rel))).toBe(true)
    }
    const api = await readFile(join(h.cwd, 'openspec/specs/backend/api.md'), 'utf8')
    expect(api).toContain('<!-- pipeline:scaffold -->')
    expect(api).toContain('# API 契约')
    expect(api).toContain('[待填写:explore]')
    // stdout 列出真实写入的 rel
    expect(r.out).toContain('openspec/specs/backend/api.md')
  })

  test('cli / lib → 各自分层真落盘（commands / api），独立 spec-dir', async () => {
    expect((await scaffold(h, 'scaffold', ['cli'])).code).toBe(0)
    expect(await exists(join(h.cwd, 'openspec/specs/commands/reference.md'))).toBe(true)
    // lib 铺到独立 spec-dir，避免与 cli 的 guides/ 层真实冲突（冲突检测另有用例覆盖）
    expect((await scaffold(h, 'scaffold', ['lib', '--spec-dir', 'docs/lib-specs'])).code).toBe(0)
    expect(await exists(join(h.cwd, 'docs/lib-specs/api/reference.md'))).toBe(true)
  })

  test('非法 type → exit 1（无落盘）', async () => {
    const r = await scaffold(h, 'scaffold', ['mobile'])
    expect(r.code).toBe(1)
    expect(await exists(join(h.cwd, 'openspec/specs'))).toBe(false)
  })

  test('显式 --document-locale en 生成英文；非法 locale fail-loud', async () => {
    const english = await scaffold(h, 'scaffold', ['web', '--document-locale', 'en'])
    expect(english.code).toBe(0)
    await expect(readFile(join(h.cwd, 'openspec/specs/backend/api.md'), 'utf8')).resolves.toContain('# API Contracts')

    const invalidRoot = await freshHarness()
    try {
      const invalid = await scaffold(invalidRoot, 'scaffold', ['web', '--document-locale', 'fr'])
      expect(invalid.code).toBe(1)
      expect(invalid.err.join('\n')).toContain('document locale 非法')
      expect(await exists(join(invalidRoot.cwd, 'openspec/specs'))).toBe(false)
    } finally {
      await rm(invalidRoot.cwd, { recursive: true, force: true })
    }
  })

  test('裸 --document-locale 缺值时 fail-loud，不静默写中文', async () => {
    const result = await scaffold(h, 'scaffold', ['web', '--document-locale'])
    expect(result.code).toBe(1)
    expect(result.err.join('\n')).toContain('--document-locale')
    expect(await exists(join(h.cwd, 'openspec/specs'))).toBe(false)
  })

  test('--spec-dir 拒绝绝对路径、父级穿越与父目录 symlink', async () => {
    const outside = `${h.cwd}-outside`
    await mkdir(outside, { recursive: true })
    try {
      for (const specDir of [outside, '../outside-specs']) {
        const result = await scaffold(h, 'scaffold', ['web', '--spec-dir', specDir])
        expect(result.code).toBe(1)
        expect(result.err.join('\n')).toMatch(/spec-dir|项目根|路径/)
      }

      await mkdir(join(h.cwd, 'docs'), { recursive: true })
      await symlink(outside, join(h.cwd, 'docs', 'linked-specs'))
      const symlinked = await scaffold(h, 'scaffold', [
        'web', '--spec-dir', 'docs/linked-specs',
      ])
      expect(symlinked.code).toBe(1)
      expect(symlinked.err.join('\n')).toMatch(/symlink|路径/)
      expect(await exists(join(outside, 'frontend', 'README.md'))).toBe(false)
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  test('目标文件本身是 symlink 时 fail-loud，不按冲突策略跟随或保留', async () => {
    const outside = `${h.cwd}-target-outside.md`
    await writeFile(outside, '外部内容', 'utf8')
    try {
      await mkdir(join(h.cwd, 'openspec', 'specs', 'backend'), { recursive: true })
      await symlink(outside, join(h.cwd, 'openspec', 'specs', 'backend', 'api.md'))
      const result = await scaffold(h, 'scaffold', ['web', '--strategy', 'append'])
      expect(result.code).toBe(1)
      expect(result.err.join('\n')).toMatch(/symlink|普通文件/)
      await expect(readFile(outside, 'utf8')).resolves.toBe('外部内容')
    } finally {
      await rm(outside, { force: true })
    }
  })
})

describe('真实 e2e —— scaffold 三态冲突（真删/真补/真保留）', () => {
  let h: Harness
  const CONFLICT = 'openspec/specs/backend/api.md'
  beforeEach(async () => {
    h = await freshHarness()
    await mkdir(join(h.cwd, 'openspec/specs/backend'), { recursive: true })
    await writeFile(join(h.cwd, CONFLICT), 'USER OWNED CONTENT', 'utf8')
  })
  afterEach(async () => {
    await rm(h.cwd, { recursive: true, force: true })
  })

  test('缺省冲突（无策略）→ exit 2 三选一指引，用户文件真保留、无其它文件写入', async () => {
    const r = await scaffold(h, 'scaffold', ['web'])
    expect(r.code).toBe(2)
    expect(r.err.join('\n')).toContain('SPEC-CONFLICT')
    expect(await readFile(join(h.cwd, CONFLICT), 'utf8')).toBe('USER OWNED CONTENT') // 真保留
    // 未写入其它文件（如 frontend/README.md 不该出现）
    expect(await exists(join(h.cwd, 'openspec/specs/frontend/README.md'))).toBe(false)
  })

  test('--strategy overwrite → 真删用户文件再重铺', async () => {
    const r = await scaffold(h, 'scaffold', ['web', '--strategy', 'overwrite'])
    expect(r.code).toBe(0)
    const api = await readFile(join(h.cwd, CONFLICT), 'utf8')
    expect(api).not.toBe('USER OWNED CONTENT')
    expect(api).toContain('# API 契约')
  })

  test('--strategy append → 用户文件真保留、缺失文件真补', async () => {
    const r = await scaffold(h, 'scaffold', ['web', '--strategy', 'append'])
    expect(r.code).toBe(0)
    expect(await readFile(join(h.cwd, CONFLICT), 'utf8')).toBe('USER OWNED CONTENT') // 保留
    expect(await exists(join(h.cwd, 'openspec/specs/frontend/README.md'))).toBe(true) // 补缺
  })

  test('--strategy skip → 整体保留、零写入', async () => {
    const r = await scaffold(h, 'scaffold', ['web', '--strategy', 'skip'])
    expect(r.code).toBe(0)
    expect(await readFile(join(h.cwd, CONFLICT), 'utf8')).toBe('USER OWNED CONTENT')
    expect(await exists(join(h.cwd, 'openspec/specs/frontend/README.md'))).toBe(false)
  })

  test('TENON_SPEC_STRATEGY=append 信号（真读 process.env）→ 冲突下只补缺失', async () => {
    const prev = process.env.TENON_SPEC_STRATEGY
    process.env.TENON_SPEC_STRATEGY = 'append'
    try {
      const r = await scaffold(h, 'scaffold', ['web'])
      expect(r.code).toBe(0)
      expect(await readFile(join(h.cwd, CONFLICT), 'utf8')).toBe('USER OWNED CONTENT')
      expect(await exists(join(h.cwd, 'openspec/specs/frontend/README.md'))).toBe(true)
    } finally {
      if (prev === undefined) delete process.env.TENON_SPEC_STRATEGY
      else process.env.TENON_SPEC_STRATEGY = prev
    }
  })
})

describe('真实 e2e —— resolve-workflow（真读源索引 / 真写 marker / removeHash 真改 manifest）', () => {
  let h: Harness
  beforeEach(async () => {
    h = await freshHarness()
  })
  afterEach(async () => {
    await rm(h.cwd, { recursive: true, force: true })
  })

  test('无 id → native、hash-contract=record', async () => {
    const r = await scaffold(h, 'resolve-workflow', [])
    expect(r.code).toBe(0)
    expect(r.out.join('\n')).toContain('id=native')
    expect(r.out.join('\n')).toContain('hash-contract=record')
  })

  test('真源索引文件命中 id → 非 native、source=true、hash-contract=remove', async () => {
    await writeFile(join(h.cwd, 'wf-index.txt'), '# marketplace\nstrict 严格\nlean 精简\nnative (bundled)\n', 'utf8')
    const r = await scaffold(h, 'resolve-workflow', ['lean', '--source-index', 'wf-index.txt'])
    expect(r.code).toBe(0)
    expect(r.out.join('\n')).toContain('id=lean')
    expect(r.out.join('\n')).toContain('native=false')
    expect(r.out.join('\n')).toContain('hash-contract=remove')
  })

  test('未知 id → exit 1；+ --fallback-native → 降级 native exit 0', async () => {
    await writeFile(join(h.cwd, 'wf-index.txt'), 'strict\n', 'utf8')
    expect((await scaffold(h, 'resolve-workflow', ['ghost', '--source-index', 'wf-index.txt'])).code).toBe(1)
    const r = await scaffold(h, 'resolve-workflow', ['ghost', '--source-index', 'wf-index.txt', '--fallback-native'])
    expect(r.code).toBe(0)
    expect(r.out.join('\n')).toContain('id=native')
  })

  test('--marker（非 native）→ 真写 .pipeline-workflow-source', async () => {
    await writeFile(join(h.cwd, 'wf-index.txt'), 'lean\n', 'utf8')
    const r = await scaffold(h, 'resolve-workflow', ['lean', '--source-index', 'wf-index.txt', '--marker'])
    expect(r.code).toBe(0)
    const marker = await readFile(join(h.cwd, '.pipeline-workflow-source'), 'utf8')
    expect(marker).toContain('id=lean')
    expect(marker).toContain('source=wf-index.txt')
  })

  test('--apply-hash 非 native → owned manifest 真删 workflow 条目（removeHash 契约，升级不还原 native）', async () => {
    await writeFile(join(h.cwd, 'wf-index.txt'), 'lean\n', 'utf8')
    await writeFile(
      join(h.cwd, '.pipeline-owned.json'),
      JSON.stringify({ '.pipeline/workflow.md': 'staleHash', 'AGENTS.md': 'h0' }, null, 2),
      'utf8',
    )
    const r = await scaffold(h, 'resolve-workflow', ['lean', '--source-index', 'wf-index.txt', '--apply-hash'])
    expect(r.code).toBe(0)
    const manifest = JSON.parse(await readFile(join(h.cwd, '.pipeline-owned.json'), 'utf8'))
    expect('.pipeline/workflow.md' in manifest).toBe(false) // 真删
    expect(manifest['AGENTS.md']).toBe('h0') // 其它不动
  })

  test('--apply-hash native → owned manifest 真记 workflow.md content hash', async () => {
    await mkdir(join(h.cwd, '.pipeline'), { recursive: true })
    await writeFile(join(h.cwd, '.pipeline/workflow.md'), '# native workflow\nphases: 7\n', 'utf8')
    await writeFile(join(h.cwd, '.pipeline-owned.json'), '{}', 'utf8')
    const r = await scaffold(h, 'resolve-workflow', ['native', '--apply-hash'])
    expect(r.code).toBe(0)
    const manifest = JSON.parse(await readFile(join(h.cwd, '.pipeline-owned.json'), 'utf8'))
    expect(typeof manifest['.pipeline/workflow.md']).toBe('string')
    expect(manifest['.pipeline/workflow.md']).toHaveLength(64) // 真 sha256 hex
  })
})
