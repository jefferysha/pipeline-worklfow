/**
 * session activate / route-context —— 真实端到端集成测试（BACKLOG #17，GOAL C9：无伪测试）。
 *
 * 零 mock：freshHarness 真临时项目 + 真 `init`（走 buildProgram 真路径）+ 真 `set` 落 related_files +
 * realDeps 构造真 kernel deps（createStateStore）+ 真调 cmdSession（默认 REAL_FS：真读
 * .pipeline-project.yaml、真写 .pipeline-active）。断言真实副作用：activate 真落盘 .pipeline-active
 * 指针文件；route-context 真读盘 related_files + 真解析 packages 声明 + 真路由输出。
 *
 * 覆盖（C10）：activate happy（真落盘）+ 缺 change（exit 1）+ degraded（写失败不炸）；
 *   route-context 单仓（全未归属）+ monorepo（真 .pipeline-project.yaml 路由）+ 空集 + --json + 缺 change。
 */
import { readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { freshHarness, realDeps, rm, type Harness } from './integration-harness.js'
import { cmdSession, type SessionFs } from './commands/session.js'

interface Run {
  code: number
  out: string[]
  err: string[]
}

/** 真调 cmdSession（realDeps 真 kernel + 真 fs；默认 REAL_FS 走真 loadPackages/bindPointer）。 */
async function session(h: Harness, sub: string, args: string[], fs?: SessionFs): Promise<Run> {
  const out: string[] = []
  const err: string[] = []
  const code = await cmdSession(realDeps(h.cwd, out, err), sub, args, fs)
  return { code, out, err }
}

async function init(h: Harness, name: string): Promise<void> {
  expect(await h.run(['init', name, '--track', 'backend', '--preset', 'full'])).toBe(0)
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

describe('真实 e2e —— session activate（.pipeline-active 真落盘）', () => {
  let h: Harness
  beforeEach(async () => {
    h = await freshHarness()
    await init(h, 'feat')
  })
  afterEach(async () => {
    await rm(h.cwd, { recursive: true, force: true })
  })

  test('activate 存在 change → 真写 .pipeline-active（内容=change 名）、[OK] 走 stderr、无 stdout、exit 0', async () => {
    const r = await session(h, 'activate', ['feat'])
    expect(r.code).toBe(0)
    expect(r.out).toEqual([])
    expect(r.err.join('\n')).toContain('[OK] activate feat')
    const pointer = await readFile(join(h.cwd, '.pipeline-active'), 'utf8')
    expect(pointer.trim()).toBe('feat')
  })

  test('activate 缺 change → exit 1、未落指针（ensure_state_exists 硬门）', async () => {
    const r = await session(h, 'activate', ['ghost'])
    expect(r.code).toBe(1)
    expect(r.err.join('\n')).toContain('状态文件不存在')
    expect(await exists(join(h.cwd, '.pipeline-active'))).toBe(false)
  })

  test('activate 指针写失败 → degraded、exit 0（degraded-safe，绝不炸）', async () => {
    const degraded: SessionFs = {
      loadPackages: async () => null,
      bindPointer: async () => {
        throw new Error('EACCES: simulated pointer store failure')
      },
    }
    const r = await session(h, 'activate', ['feat'], degraded)
    expect(r.code).toBe(0)
    expect(r.err.join('\n')).toContain('degraded')
    expect(await exists(join(h.cwd, '.pipeline-active'))).toBe(false)
  })
})

describe('真实 e2e —— session route-context 单仓（无 .pipeline-project.yaml → 全未归属）', () => {
  let h: Harness
  beforeEach(async () => {
    h = await freshHarness()
    await init(h, 'feat')
    // 真写 related_files（走真 set 命令，CSV → 块序列列表落盘）
    expect(await h.run(['set', 'feat', 'related_files', 'apps/web/a.ts,services/api/b.py'])).toBe(0)
  })
  afterEach(async () => {
    await rm(h.cwd, { recursive: true, force: true })
  })

  test('route-context 单仓 → header + [(未归属)] 分组（真读盘 related_files）', async () => {
    const r = await session(h, 'route-context', ['feat'])
    expect(r.code).toBe(0)
    expect(r.out).toEqual([
      '[ROUTE-CONTEXT] feat related_files 按 package 归属：',
      '  [(未归属)]',
      '    - apps/web/a.ts',
      '    - services/api/b.py',
    ])
  })

  test('route-context --json 单仓 → {"null":[...]}（真读盘）', async () => {
    const r = await session(h, 'route-context', ['feat', '--json'])
    expect(r.code).toBe(0)
    expect(JSON.parse(r.out.join('\n'))).toEqual({ null: ['apps/web/a.ts', 'services/api/b.py'] })
  })
})

describe('真实 e2e —— session route-context monorepo（真 .pipeline-project.yaml 路由）', () => {
  let h: Harness
  const MONO_CFG =
    'packages:\n' +
    '  web:\n' +
    '    path: apps/web\n' +
    '  api:\n' +
    '    path: services/api\n' +
    '  webadmin:\n' +
    '    path: apps/web/admin\n' +
    'default_package: web\n'
  beforeEach(async () => {
    h = await freshHarness()
    await init(h, 'feat')
    // 真写项目根 .pipeline-project.yaml packages 声明（REAL_FS.loadPackages 真读真解析）
    await writeFile(join(h.cwd, '.pipeline-project.yaml'), MONO_CFG, 'utf8')
    expect(
      await h.run([
        'set',
        'feat',
        'related_files',
        'apps/web/src/App.tsx,services/api/main.py,apps/web/admin/panel.tsx,docs/readme.md',
      ]),
    ).toBe(0)
  })
  afterEach(async () => {
    await rm(h.cwd, { recursive: true, force: true })
  })

  test('route-context --json → 按声明 path 最长前缀真路由 + 未归属 null 桶', async () => {
    const r = await session(h, 'route-context', ['feat', '--json'])
    expect(r.code).toBe(0)
    expect(JSON.parse(r.out.join('\n'))).toEqual({
      web: ['apps/web/src/App.tsx'],
      api: ['services/api/main.py'],
      webadmin: ['apps/web/admin/panel.tsx'], // 最长前缀最具体子树赢（非 web）
      null: ['docs/readme.md'],
    })
  })

  test('route-context 文本 → null 桶排最后 + 其余字典序 header 分组', async () => {
    const r = await session(h, 'route-context', ['feat'])
    expect(r.code).toBe(0)
    expect(r.out).toEqual([
      '[ROUTE-CONTEXT] feat related_files 按 package 归属：',
      '  [api]',
      '    - services/api/main.py',
      '  [web]',
      '    - apps/web/src/App.tsx',
      '  [webadmin]',
      '    - apps/web/admin/panel.tsx',
      '  [(未归属)]',
      '    - docs/readme.md',
    ])
  })
})

describe('真实 e2e —— session route-context 空集 / 错误路径', () => {
  let h: Harness
  beforeEach(async () => {
    h = await freshHarness()
    await init(h, 'feat')
  })
  afterEach(async () => {
    await rm(h.cwd, { recursive: true, force: true })
  })

  test('空 related_files → header + 未配置提示', async () => {
    const r = await session(h, 'route-context', ['feat'])
    expect(r.code).toBe(0)
    expect(r.out).toEqual([
      '[ROUTE-CONTEXT] feat related_files 按 package 归属：',
      '  (no related files / 未配置 package — 全未归属)',
    ])
  })

  test('缺 change → exit 1', async () => {
    const r = await session(h, 'route-context', ['ghost'])
    expect(r.code).toBe(1)
    expect(r.err.join('\n')).toContain('状态文件不存在')
  })
})
