/**
 * task 子命令 —— mock 层快速分支回归（TEST-REALITY.md：真实对位在 task.integration.test.ts）。
 * 覆盖 dispatch / add-dep / remove-dep 全分支 + children/cascade/canonical 输出格式
 * （树经注入的 fake TaskFs，避免 fs——真 fs 面在 integration）。
 */
import { describe, expect, test } from 'vitest'
import { makeDeps, mockState } from '../test-support.js'
import { cmdTask, type TaskFs, type ChangeNode } from './task.js'

function fakeFs(tree: ChangeNode[]): TaskFs {
  return {
    loadTree: async () => tree,
    resolveDir: async (cwd: string, name: string) => `${cwd}/openspec/changes/${name}`,
  }
}

describe('dispatch', () => {
  test('未知子命令 → stderr + exit 1', async () => {
    const deps = makeDeps()
    expect(await cmdTask(deps, 'bogus', [])).toBe(1)
    expect(deps.errLines.join('\n')).toContain('未知 task 子命令')
  })
})

describe('add-dep —— 去重幂等 + 防自环 + 尾接（老仓 cmd_add_dep）', () => {
  test('新依赖 → store.set 写数组、history 记账、无 stdout、exit 0', async () => {
    const deps = makeDeps({ state: mockState({ depends_on: ['a'] }) })
    expect(await cmdTask(deps, 'add-dep', ['chg', 'b'])).toBe(0)
    expect(deps.outLines).toEqual([])
    expect(deps.store.set.calls).toHaveLength(1)
    expect(deps.store.set.calls[0]).toEqual(['/repo/openspec/changes/chg', 'depends_on', ['a', 'b']])
    expect(deps.historyEntries[0]?.[1]).toMatchObject({ kind: 'set', field: 'depends_on', to: 'a,b' })
  })

  test('空集追加第一个 → [dep]', async () => {
    const deps = makeDeps({ state: mockState({ depends_on: 'null' }) })
    expect(await cmdTask(deps, 'add-dep', ['chg', 'b'])).toBe(0)
    expect(deps.store.set.calls[0]?.[2]).toEqual(['b'])
  })

  test('已含 → 幂等：不写、stderr [OK] 去重、exit 0', async () => {
    const deps = makeDeps({ state: mockState({ depends_on: ['a', 'b'] }) })
    expect(await cmdTask(deps, 'add-dep', ['chg', 'b'])).toBe(0)
    expect(deps.store.set.calls).toHaveLength(0)
    expect(deps.errLines.join('\n')).toContain('已含')
  })

  test('自环（dep==name）→ stderr + exit 1、不写', async () => {
    const deps = makeDeps({ state: mockState() })
    expect(await cmdTask(deps, 'add-dep', ['chg', 'chg'])).toBe(1)
    expect(deps.errLines.join('\n')).toContain('自环')
    expect(deps.store.set.calls).toHaveLength(0)
  })

  test('缺 dep 参数 → Usage + exit 1', async () => {
    const deps = makeDeps()
    expect(await cmdTask(deps, 'add-dep', ['chg'])).toBe(1)
    expect(deps.errLines.join('\n')).toContain('Usage')
  })

  test('非法 change 名 → exit 1、不读', async () => {
    const deps = makeDeps()
    expect(await cmdTask(deps, 'add-dep', ['bad/../x', 'b'])).toBe(1)
    expect(deps.store.read.calls).toHaveLength(0)
  })

  test('非法 dep 名 → exit 1', async () => {
    const deps = makeDeps()
    expect(await cmdTask(deps, 'add-dep', ['chg', 'bad/../x'])).toBe(1)
  })

  test('状态文件缺失（read 抛）→ exit 1', async () => {
    const deps = makeDeps({ states: {} }) // 任何 read 抛 ENOENT
    expect(await cmdTask(deps, 'add-dep', ['chg', 'b'])).toBe(1)
    expect(deps.errLines.join('\n')).toContain('ERROR')
  })
})

describe('remove-dep —— 精确移除 + 清空回空集（老仓 cmd_remove_dep）', () => {
  test('移除存在项 → store.set 剩余数组', async () => {
    const deps = makeDeps({ state: mockState({ depends_on: ['a', 'b', 'c'] }) })
    expect(await cmdTask(deps, 'remove-dep', ['chg', 'b'])).toBe(0)
    expect(deps.store.set.calls[0]?.[2]).toEqual(['a', 'c'])
  })

  test('移除末项 → 空数组 []', async () => {
    const deps = makeDeps({ state: mockState({ depends_on: ['a'] }) })
    expect(await cmdTask(deps, 'remove-dep', ['chg', 'a'])).toBe(0)
    expect(deps.store.set.calls[0]?.[2]).toEqual([])
  })

  test('缺 dep 参数 → Usage + exit 1', async () => {
    const deps = makeDeps()
    expect(await cmdTask(deps, 'remove-dep', ['chg'])).toBe(1)
    expect(deps.errLines.join('\n')).toContain('Usage')
  })
})

describe('children —— 反查子（老仓 cmd_children）', () => {
  const tree: ChangeNode[] = [
    { name: 'a', archived: false, deps: [] },
    { name: 'b', archived: false, deps: ['a'] },
    { name: 'old', archived: true, deps: ['a'] },
  ]

  test('text：header + 逐行 active/archived 标（sort -u）', async () => {
    const deps = makeDeps()
    expect(await cmdTask(deps, 'children', ['a'], fakeFs(tree))).toBe(0)
    expect(deps.outLines).toEqual([
      '[CHILDREN] a（depends_on 指向它的 change）：',
      '  b [active]',
      '  old [archived]',
    ])
  })

  test('无子 → (none) 行、exit 0', async () => {
    const deps = makeDeps()
    expect(await cmdTask(deps, 'children', ['b'], fakeFs(tree))).toBe(0)
    expect(deps.outLines).toEqual(['(none) b 无子 change（无 depends_on 指向它）'])
  })

  test('--json：紧凑数组、boolean archived', async () => {
    const deps = makeDeps()
    expect(await cmdTask(deps, 'children', ['a', '--json'], fakeFs(tree))).toBe(0)
    expect(deps.outLines).toHaveLength(1)
    expect(JSON.parse(deps.outLines[0]!)).toEqual([
      { name: 'b', archived: false },
      { name: 'old', archived: true },
    ])
  })

  test('非法 change 名 → exit 1', async () => {
    const deps = makeDeps()
    expect(await cmdTask(deps, 'children', ['bad/../x'], fakeFs(tree))).toBe(1)
  })
})

describe('cascade —— BFS 传递闭包（老仓 cmd_cascade）', () => {
  const tree: ChangeNode[] = [
    { name: 'a', archived: false, deps: [] },
    { name: 'b', archived: false, deps: ['a'] },
    { name: 'c', archived: true, deps: ['b'] },
  ]

  test('text：header + BFS 逐行', async () => {
    const deps = makeDeps()
    expect(await cmdTask(deps, 'cascade', ['a'], fakeFs(tree))).toBe(0)
    expect(deps.outLines).toEqual([
      '[CASCADE] a 的全部传递后代 dependent：',
      '  b [active]',
      '  c [archived]',
    ])
  })

  test('无后代 → (none) 行', async () => {
    const deps = makeDeps()
    expect(await cmdTask(deps, 'cascade', ['c'], fakeFs(tree))).toBe(0)
    expect(deps.outLines).toEqual(['[CASCADE] c 的全部传递后代 dependent：', '  (none) 无后代 dependent'])
  })
})

describe('canonical —— Tenon contract 24 字段投影（老仓 cmd_canonical）', () => {
  const tree: ChangeNode[] = [
    { name: 'foo', archived: false, deps: ['dep-a'] },
    { name: 'kid', archived: false, deps: ['foo'] },
  ]

  test('--json：紧凑单行、字段/子任务/子投影正确', async () => {
    const deps = makeDeps({
      state: mockState({ phase: 'build', track: 'backend', depends_on: ['dep-a'], related_files: ['src/x.ts'] }),
    })
    expect(await cmdTask(deps, 'canonical', ['foo', '--json'], fakeFs(tree))).toBe(0)
    const rec = JSON.parse(deps.outLines.join('\n'))
    expect(rec.id).toBe('foo')
    expect(rec.status).toBe('build')
    expect(rec.dev_type).toBe('backend')
    expect(rec.subtasks).toEqual(['dep-a'])
    expect(rec.children).toEqual(['kid'])
    expect(rec.relatedFiles).toEqual(['src/x.ts'])
    expect(rec.parent).toBeNull()
    expect(rec.meta).toEqual({})
  })

  test('默认 pretty：2 空格缩进多行', async () => {
    const deps = makeDeps({ state: mockState({ phase: 'open' }) })
    expect(await cmdTask(deps, 'canonical', ['foo'], fakeFs(tree))).toBe(0)
    const text = deps.outLines.join('\n')
    expect(text).toContain('\n  "id": "foo"')
    expect(JSON.parse(text).status).toBe('open')
  })

  test('状态文件缺失 → exit 1', async () => {
    const deps = makeDeps({ states: {} })
    expect(await cmdTask(deps, 'canonical', ['foo'], fakeFs(tree))).toBe(1)
  })
})
