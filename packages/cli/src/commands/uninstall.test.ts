/**
 * uninstall 命令 mock 层快速回归（BACKLOG #24，GOAL C9：真 fs 副作用见
 * cli/src/sync-uninstall.integration.test.ts）。这里用内存 fake OwnedFs 穷举决策分支/退出码。
 */
import { describe, expect, test } from 'vitest'
import { computeContentHash, type OwnedFs } from '@tenon/kernel'
import type { CliDeps } from '../deps.js'
import { cmdUninstall } from './uninstall.js'

/** 内存 fake OwnedFs（mock 层用；真 fs 副作用由 integration 覆盖）。 */
function makeFakeFs(init: Record<string, string> = {}, opts: { home?: string; bypass?: boolean } = {}): OwnedFs {
  const files = new Map<string, string>(Object.entries(init))
  const norm = (p: string) => p.replace(/\/+$/, '')
  const childrenUnder = (dir: string): string[] => {
    const prefix = `${norm(dir)}/`
    const names = new Set<string>()
    for (const p of files.keys()) if (p.startsWith(prefix)) names.add(p.slice(prefix.length).split('/')[0] as string)
    return [...names]
  }
  return {
    readText: async (p) => files.get(p),
    writeText: async (p, c) => { files.set(p, c) },
    exists: async (p) => files.has(p) || childrenUnder(p).length > 0,
    isDir: async (p) => !files.has(p) && childrenUnder(p).length > 0,
    unlink: async (p) => files.delete(p),
    rmrf: async (p) => { const pre = `${norm(p)}/`; for (const k of [...files.keys()]) if (k === p || k.startsWith(pre)) files.delete(k) },
    rmdirEmpty: async (p) => childrenUnder(p).length === 0,
    listDir: async (p) => childrenUnder(p),
    homeDir: () => opts.home ?? '/nonexistent-home',
    homedirBypass: () => opts.bypass ?? false,
  }
}

function deps(cwd = '/proj'): { d: CliDeps; out: string[]; err: string[] } {
  const out: string[] = []
  const err: string[] = []
  const d = {
    cwd,
    io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) },
    clock: () => '2026-07-07T00:00:00Z',
  } as unknown as CliDeps
  return { d, out, err }
}

describe('cmdUninstall — 前置守卫', () => {
  test('homedir 守卫：cwd==$HOME 且无旁路 → HARD STOP exit 1', async () => {
    const { d, err } = deps('/home/u')
    const fs = makeFakeFs({}, { home: '/home/u' })
    expect(await cmdUninstall(d, { yes: true }, fs)).toBe(1)
    expect(err.join('\n')).toContain('HARD STOP')
  })
  test('homedir 旁路开启 → 放行（但无清单 → 未安装 exit 0）', async () => {
    const { d } = deps('/home/u')
    const fs = makeFakeFs({}, { home: '/home/u', bypass: true })
    expect(await cmdUninstall(d, { yes: true }, fs)).toBe(0)
  })
  test('前置1：无 .pipeline-owned.json → 未安装幂等 exit 0', async () => {
    const { d, err } = deps()
    const fs = makeFakeFs({})
    expect(await cmdUninstall(d, { yes: true }, fs)).toBe(0)
    expect(err.join('\n')).toContain('未安装')
  })
  test('前置2：清单存在但空对象 {} → 损坏硬失败 exit 1', async () => {
    const { d, err } = deps()
    const fs = makeFakeFs({ '/proj/.pipeline-owned.json': '{}' })
    expect(await cmdUninstall(d, { yes: true }, fs)).toBe(1)
    expect(err.join('\n')).toContain('拒绝盲删')
  })
})

describe('cmdUninstall — 计划决策（buildPlan）', () => {
  test('不透明文件 unmodified → 删；user-modified → 保留（hash 升格删除决策，lite 改进）', async () => {
    const installed = 'INSTALLED'
    const fs = makeFakeFs({
      '/proj/.pipeline-owned.json': JSON.stringify({
        '.claude/a.md': computeContentHash(installed),
        '.claude/b.md': computeContentHash(installed),
      }),
      '/proj/.claude/a.md': installed, // 未改 → 删
      '/proj/.claude/b.md': 'USER EDIT', // 改过 → 保留
    })
    const { d, out } = deps()
    expect(await cmdUninstall(d, { yes: true }, fs)).toBe(0)
    expect(await fs.exists('/proj/.claude/a.md')).toBe(false) // 真删
    expect(await fs.readText('/proj/.claude/b.md')).toBe('USER EDIT') // 真保留
    expect(out.join('\n')).toContain('user-modified')
  })

  test('结构化 hooks.json → scrub 写回（剥本插件条目、保留用户）', async () => {
    const hooks = JSON.stringify({
      hooks: {
        SessionStart: [
          { hooks: [{ command: 'python3 .claude/hooks/pl.py' }] },
          { hooks: [{ command: 'user-tool run' }] },
        ],
      },
    })
    const fs = makeFakeFs({
      '/proj/.pipeline-owned.json': JSON.stringify({
        '.claude/hooks/pl.py': 'h1',
        '.claude/settings.json': 'h2',
      }),
      '/proj/.claude/hooks/pl.py': 'PLUGIN HOOK',
      '/proj/.claude/settings.json': hooks,
    })
    const { d } = deps()
    expect(await cmdUninstall(d, { yes: true }, fs)).toBe(0)
    // pl.py 整删（unmodified? hash h1 ≠ 内容 hash → user-modified 保留？）——它是不透明文件，
    // 但 hash 'h1' 与内容不符 → 视为 user-modified → 保留。settings.json 走 scrub 写回。
    const settings = JSON.parse((await fs.readText('/proj/.claude/settings.json'))!)
    expect(settings.hooks.SessionStart).toHaveLength(1) // 本插件 hook 剥掉、用户 hook 留
  })

  test('清单内文件磁盘缺失 → missing 桶（跳过、不计删除）', async () => {
    const fs = makeFakeFs({
      '/proj/.pipeline-owned.json': JSON.stringify({ 'gone.md': 'h1' }),
    })
    const { d, out } = deps()
    expect(await cmdUninstall(d, { yes: true }, fs)).toBe(0)
    expect(out.join('\n')).toMatch(/missing/i)
  })
})

describe('cmdUninstall — dry-run / confirm', () => {
  test('--dry-run：render 后 return 0，不动任何文件', async () => {
    const c = 'INSTALLED'
    const fs = makeFakeFs({
      '/proj/.pipeline-owned.json': JSON.stringify({ 'x.md': computeContentHash(c) }),
      '/proj/x.md': c,
    })
    const { d, err } = deps()
    expect(await cmdUninstall(d, { dryRun: true }, fs)).toBe(0)
    expect(await fs.exists('/proj/x.md')).toBe(true) // 未删
    expect(err.join('\n')).toContain('Dry run')
  })
  test('无 --yes（非 dry-run）→ fail-closed exit 1，不动文件', async () => {
    const c = 'INSTALLED'
    const fs = makeFakeFs({
      '/proj/.pipeline-owned.json': JSON.stringify({ 'x.md': computeContentHash(c) }),
      '/proj/x.md': c,
    })
    const { d, err } = deps()
    expect(await cmdUninstall(d, {}, fs)).toBe(1)
    expect(await fs.exists('/proj/x.md')).toBe(true)
    expect(err.join('\n')).toContain('--yes')
  })
})

describe('cmdUninstall — prune 去毒 + 诚实 stub', () => {
  test('孤儿 AGENTS.md（无哨兵）prune 掉、不进删除计划（用户自带保留）', async () => {
    const fs = makeFakeFs({
      '/proj/.pipeline-owned.json': JSON.stringify({ 'AGENTS.md': 'h1', 'owned.md': computeContentHash('X') }),
      '/proj/AGENTS.md': 'user own no sentinel',
      '/proj/owned.md': 'X',
    })
    const { d, err } = deps()
    expect(await cmdUninstall(d, { yes: true }, fs)).toBe(0)
    expect(await fs.readText('/proj/AGENTS.md')).toBe('user own no sentinel') // 用户 AGENTS.md 保留
    expect(err.join('\n')).toMatch(/剪除|孤儿/) // prune 通知
  })
  test('诚实 stub：.opencode/package.json → 保留不删 + 标注 stub（fail-safe，降级可见）', async () => {
    const fs = makeFakeFs({
      '/proj/.pipeline-owned.json': JSON.stringify({ '.opencode/package.json': 'h1' }),
      '/proj/.opencode/package.json': '{"dependencies":{"@opencode-ai/plugin":"1"}}',
    })
    const { d, out } = deps()
    expect(await cmdUninstall(d, { yes: true }, fs)).toBe(0)
    expect(await fs.exists('/proj/.opencode/package.json')).toBe(true) // 保守保留
    expect(out.join('\n')).toMatch(/stub/i)
  })
})
