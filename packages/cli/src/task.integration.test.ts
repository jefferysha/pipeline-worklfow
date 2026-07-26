/**
 * task lifecycle —— 真实端到端集成测试（BACKLOG #15，GOAL C9：无伪测试）。
 *
 * 零 mock：freshHarness 真临时项目 + 真 `init` 多个 change（走 buildProgram 真路径）+
 * realDeps 构造真 kernel deps（createStateStore/createHistoryWriter）+ 真调 cmdTask。
 * 断言真实落盘的 .pipeline.yaml depends_on 块序列字节、真 history JSONL、真反查/级联传播。
 *
 * 覆盖（C10）：add-dep/remove-dep happy + 去重 + 自环拒 + 关键错误；children/cascade 真反查
 * （含真归档区节点）；canonical 真投影；跨命令串联 init→add-dep→children→cascade→canonical。
 */
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { freshHarness, realDeps, rm, type Harness } from './integration-harness.js'
import { cmdTask } from './commands/task.js'

interface TaskRun {
  code: number
  out: string[]
  err: string[]
}

/** 真调 cmdTask（realDeps 真 kernel + 真 fs，默认 REAL_FS 走真 loadTaskTree/resolveChangeDir）。 */
async function task(h: Harness, sub: string, ...args: string[]): Promise<TaskRun> {
  const out: string[] = []
  const err: string[] = []
  const code = await cmdTask(realDeps(h.cwd, out, err), sub, args)
  return { code, out, err }
}

async function init(h: Harness, name: string): Promise<void> {
  expect(await h.run(['init', name, '--track', 'backend', '--preset', 'full'])).toBe(0)
}

describe('真实 e2e —— task add-dep / remove-dep（depends_on 真落盘）', () => {
  let h: Harness
  beforeEach(async () => {
    h = await freshHarness()
    await init(h, 'a')
    await init(h, 'b')
    await init(h, 'c')
  })
  afterEach(async () => {
    await rm(h.cwd, { recursive: true, force: true })
  })

  test('add-dep 真写 depends_on 块序列 + 保序尾接 + 真 history', async () => {
    expect((await task(h, 'add-dep', 'b', 'a')).code).toBe(0)
    let yaml = await h.read('b')
    expect(yaml).toContain('depends_on:\n  - a\n')

    // 尾接第二个（保序 a, c）
    expect((await task(h, 'add-dep', 'b', 'c')).code).toBe(0)
    yaml = await h.read('b')
    expect(yaml).toContain('depends_on:\n  - a\n  - c\n')

    // 真 history JSONL 记账（kind=set field=depends_on）
    const hist = await h.readIn('b', '.pipeline-history.jsonl')
    const lines = hist.trim().split('\n').map((l) => JSON.parse(l))
    const depEntries = lines.filter((e) => e.field === 'depends_on')
    expect(depEntries).toHaveLength(2)
    expect(depEntries.at(-1)).toMatchObject({ kind: 'set', field: 'depends_on', to: 'a,c' })
  })

  test('add-dep 去重幂等：不改盘、stderr [OK]', async () => {
    await task(h, 'add-dep', 'b', 'a')
    const before = await h.read('b')
    const r = await task(h, 'add-dep', 'b', 'a')
    expect(r.code).toBe(0)
    expect(r.err.join('\n')).toContain('已含')
    expect(await h.read('b')).toBe(before) // 字节不变
  })

  test('add-dep 自环拒：exit 1、盘不变（depends_on 仍为 null 哨兵）', async () => {
    const r = await task(h, 'add-dep', 'a', 'a')
    expect(r.code).toBe(1)
    expect(r.err.join('\n')).toContain('自环')
    expect(await h.read('a')).toContain('depends_on: null')
  })

  test('add-dep 状态文件缺失 → exit 1', async () => {
    const r = await task(h, 'add-dep', 'nonexist', 'a')
    expect(r.code).toBe(1)
    expect(r.err.join('\n')).toContain('ERROR')
  })

  test('remove-dep 真移除 + 清空回空集 []', async () => {
    await task(h, 'add-dep', 'b', 'a')
    await task(h, 'add-dep', 'b', 'c')
    expect((await task(h, 'remove-dep', 'b', 'a')).code).toBe(0)
    expect(await h.read('b')).toContain('depends_on:\n  - c\n')

    expect((await task(h, 'remove-dep', 'b', 'c')).code).toBe(0)
    expect(await h.read('b')).toContain('depends_on: []')
  })
})

describe('真实 e2e —— children / cascade 真反查（含真归档区）', () => {
  let h: Harness
  beforeEach(async () => {
    h = await freshHarness()
    // 链 + 分叉：a ← b ← c ← d，且 e 也依赖 a（a 的直接子 = b, e）
    for (const n of ['a', 'b', 'c', 'd', 'e']) await init(h, n)
    await task(h, 'add-dep', 'b', 'a')
    await task(h, 'add-dep', 'c', 'b')
    await task(h, 'add-dep', 'd', 'c')
    await task(h, 'add-dep', 'e', 'a')
    // 真归档区：init 'oldx' → add-dep 依赖 a → 物理移入 archive/2026-07/99-oldx（archived 子）
    await init(h, 'oldx')
    await task(h, 'add-dep', 'oldx', 'a')
    const archiveDir = join(h.cwd, 'openspec', 'changes', 'archive', '2026-07')
    await mkdir(archiveDir, { recursive: true })
    await rename(join(h.cwd, 'openspec', 'changes', 'oldx'), join(archiveDir, '99-oldx'))
  })
  afterEach(async () => {
    await rm(h.cwd, { recursive: true, force: true })
  })

  test('children a：直接子 b/e(active) + 99-oldx(archived)，sort -u', async () => {
    const r = await task(h, 'children', 'a')
    expect(r.code).toBe(0)
    expect(r.out).toEqual([
      '[CHILDREN] a（depends_on 指向它的 change）：',
      '  99-oldx [archived]',
      '  b [active]',
      '  e [active]',
    ])
  })

  test('children a --json：真反查含归档 boolean', async () => {
    const r = await task(h, 'children', 'a', '--json')
    expect(r.code).toBe(0)
    expect(JSON.parse(r.out.join('\n'))).toEqual([
      { name: '99-oldx', archived: true },
      { name: 'b', archived: false },
      { name: 'e', archived: false },
    ])
  })

  test('children c：仅 d', async () => {
    const r = await task(h, 'children', 'c')
    expect(r.out).toEqual(['[CHILDREN] c（depends_on 指向它的 change）：', '  d [active]'])
  })

  test('children d：无子 → (none)', async () => {
    const r = await task(h, 'children', 'd')
    expect(r.out).toEqual(['(none) d 无子 change（无 depends_on 指向它）'])
  })

  test('cascade a：真传递闭包 b,c,d,e + 归档 99-oldx（状态逐个标）', async () => {
    const r = await task(h, 'cascade', 'a')
    expect(r.code).toBe(0)
    expect(r.out[0]).toBe('[CASCADE] a 的全部传递后代 dependent：')
    const body = r.out.slice(1)
    // BFS：第一层 a 的直接子（99-oldx / b / e，index 排序），后续层 c、d
    expect(body).toContain('  b [active]')
    expect(body).toContain('  e [active]')
    expect(body).toContain('  c [active]')
    expect(body).toContain('  d [active]')
    expect(body).toContain('  99-oldx [archived]')
    // 全部后代恰 5 个（防环、无重复）
    expect(body).toHaveLength(5)
  })

  test('cascade d：无后代 → (none)', async () => {
    const r = await task(h, 'cascade', 'd')
    expect(r.out).toEqual(['[CASCADE] d 的全部传递后代 dependent：', '  (none) 无后代 dependent'])
  })
})

describe('真实 e2e —— canonical 真投影（Tenon contract 24 字段）+ 跨命令串联', () => {
  let h: Harness
  beforeEach(async () => {
    h = await freshHarness()
  })
  afterEach(async () => {
    await rm(h.cwd, { recursive: true, force: true })
  })

  test('init→set→add-dep→canonical：真读盘投影 24 字段', async () => {
    await init(h, 'proj')
    await init(h, 'dep1')
    await init(h, 'kid')
    // proj 依赖 dep1；kid 依赖 proj（→ kid 是 proj 的子）
    await task(h, 'add-dep', 'proj', 'dep1')
    await task(h, 'add-dep', 'kid', 'proj')
    // 真写字段
    expect(await h.run(['set', 'proj', 'scope', 'api'])).toBe(0)
    expect(await h.run(['set', 'proj', 'branch', 'feat/proj'])).toBe(0)

    const r = await task(h, 'canonical', 'proj', '--json')
    expect(r.code).toBe(0)
    const rec = JSON.parse(r.out.join('\n'))
    // 24 字段键序即 schema
    expect(Object.keys(rec)).toEqual([
      'id', 'name', 'title', 'description', 'status', 'dev_type', 'scope', 'package',
      'priority', 'creator', 'assignee', 'createdAt', 'completedAt', 'branch', 'base_branch',
      'worktree_path', 'commit', 'pr_url', 'subtasks', 'children', 'parent', 'relatedFiles',
      'notes', 'meta',
    ])
    expect(rec).toMatchObject({
      id: 'proj',
      name: 'proj',
      title: 'proj',
      status: 'open',
      dev_type: 'backend',
      scope: 'api',
      branch: 'feat/proj',
      base_branch: 'main',
      subtasks: ['dep1'],
      children: ['kid'],
      parent: null,
      priority: 'normal',
      meta: {},
    })
    // 未设可空字段 → null（nz 归一）
    expect(rec.completedAt).toBeNull()
    expect(rec.worktree_path).toBeNull()
    expect(rec.pr_url).toBeNull()
    expect(rec.createdAt).not.toBe('') // init 真写 created_at
  })

  test('canonical 默认 pretty：2 空格缩进、可 JSON.parse 回', async () => {
    await init(h, 'solo')
    const r = await task(h, 'canonical', 'solo')
    expect(r.code).toBe(0)
    const text = r.out.join('\n')
    expect(text).toContain('\n  "id": "solo"')
    expect(JSON.parse(text)).toMatchObject({ id: 'solo', subtasks: [], children: [] })
  })

  test('canonical 状态文件缺失 → exit 1', async () => {
    const r = await task(h, 'canonical', 'ghost')
    expect(r.code).toBe(1)
  })
})
