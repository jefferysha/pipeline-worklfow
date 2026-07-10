import { describe, expect, test } from 'vitest'
import type { InitOptions } from '@pipeline-lite/kernel'
import { cmdInit } from './init.js'
import { makeDeps, spy } from '../test-support.js'

describe('init —— stdout 空 / [INIT] 走 stderr；0/1（oracle 实测回写）', () => {
  test('成功：stdout 无输出，创建路径以 [INIT] 走 stderr，exit 0', async () => {
    const deps = makeDeps()
    const code = await cmdInit(deps, 'demo', { track: 'backend', preset: 'full' })
    expect(code).toBe(0)
    expect(deps.outLines).toEqual([])
    expect(deps.errLines).toEqual(['[INIT] /repo/openspec/changes/demo'])
  })

  test('成功记一条 kind=init 历史（by=user，未传则省略）', async () => {
    const deps = makeDeps()
    await cmdInit(deps, 'demo', { track: 'backend', preset: 'full', user: 'jeff' })
    expect(deps.historyEntries).toEqual([
      ['/repo/openspec/changes/demo', { ts: '2026-07-06T00:00:00Z', kind: 'init', by: 'jeff' }],
    ])
    const deps2 = makeDeps()
    await cmdInit(deps2, 'demo', { track: 'backend', preset: 'full' })
    expect(deps2.historyEntries[0]?.[1]).toEqual({ ts: '2026-07-06T00:00:00Z', kind: 'init' })
  })

  test('InitOptions 装配：repoRoot=cwd、track/preset/user/clock 透传', async () => {
    const deps = makeDeps()
    await cmdInit(deps, 'demo', { track: 'pm', preset: 'hotfix', user: 'jeff' })
    const opts = deps.store.init.calls[0]?.[0]
    expect(opts?.repoRoot).toBe('/repo')
    expect(opts?.name).toBe('demo')
    expect(opts?.track).toBe('pm')
    expect(opts?.preset).toBe('hotfix')
    expect(opts?.user).toBe('jeff')
    expect(opts?.clock).toBe(deps.clock)
  })

  test('非法 track：exit 1，init 不被调用', async () => {
    const deps = makeDeps()
    const code = await cmdInit(deps, 'demo', { track: 'devops', preset: 'full' })
    expect(code).toBe(1)
    expect(deps.store.init.calls).toHaveLength(0)
    expect(deps.errLines.length).toBeGreaterThan(0)
  })

  test('空 preset：exit 1，init 不被调用', async () => {
    const deps = makeDeps()
    const code = await cmdInit(deps, 'demo', { track: 'backend', preset: '' })
    expect(code).toBe(1)
    expect(deps.store.init.calls).toHaveLength(0)
  })

  test('store.init 抛错（已存在等）：exit 1', async () => {
    const deps = makeDeps()
    deps.store.init = spy(async (_o: InitOptions): Promise<string> => {
      throw new Error('已存在')
    })
    const code = await cmdInit(deps, 'demo', { track: 'backend', preset: 'full' })
    expect(code).toBe(1)
    expect(deps.outLines).toEqual([])
  })

  test('非法 change 名：exit 1', async () => {
    const deps = makeDeps()
    const code = await cmdInit(deps, 'a b', { track: 'backend', preset: 'full' })
    expect(code).toBe(1)
    expect(deps.store.init.calls).toHaveLength(0)
  })
})

/**
 * --workflow（whole-branch review 补：此前没有支持的命令能把 change 摆到自定义 workflow 的
 * 首个 step 上）。真实 fs 全链路（workflow 文件真存在 + steps[0] 真读出）在
 * init-workflow.integration.test.ts；这里 mock 层只覆盖不需要真文件系统的分支：省略/default
 * 零回归、找不到 workflow fail-loud 且不落盘。
 */
describe('init --workflow（GOAL E，自定义 workflow 首个 step 落点）', () => {
  test('省略 --workflow：不触发任何 setMany 调用（零回归，同此前行为逐字一致）', async () => {
    const deps = makeDeps()
    const code = await cmdInit(deps, 'demo', { track: 'backend', preset: 'full' })
    expect(code).toBe(0)
    expect(deps.store.setMany.calls).toHaveLength(0)
  })

  test('显式 --workflow default：等同省略，不触发 setMany（default 走 store.init 自身的老路径）', async () => {
    const deps = makeDeps()
    const code = await cmdInit(deps, 'demo', { track: 'backend', preset: 'full', workflow: 'default' })
    expect(code).toBe(0)
    expect(deps.store.setMany.calls).toHaveLength(0)
  })

  test('--workflow 指向不存在的文件：exit 1，store.init 完全不被调用（先校验后落盘，不留半成品 change）', async () => {
    const deps = makeDeps()
    const code = await cmdInit(deps, 'demo', { track: 'backend', preset: 'full', workflow: 'ghost' })
    expect(code).toBe(1)
    expect(deps.store.init.calls).toHaveLength(0)
    expect(deps.errLines.join('\n')).toContain("workflow 'ghost' 未找到")
  })
})

/**
 * 项目注册表 best-effort 自动登记（v5 T2 决策 D）：init 成功后把 repoRoot 交给
 * deps.registerProject；铁律 = 注册表任何故障都不得让 init 失败（exit 0 + WARN 走 stderr）。
 */
describe('init 项目注册表登记（决策 D，best-effort）', () => {
  test('成功：registerProject 收到 deps.cwd（repoRoot），exit 0', async () => {
    const deps = makeDeps()
    const code = await cmdInit(deps, 'demo', { track: 'backend', preset: 'full' })
    expect(code).toBe(0)
    expect(deps.registeredRoots).toEqual(['/repo'])
  })

  test('registerProject 抛错（注册表损坏/目录不可写）：exit 0 不受影响，stderr 出 WARN 行', async () => {
    const deps = makeDeps()
    deps.registerProject = async () => {
      throw new Error('EACCES: permission denied')
    }
    const code = await cmdInit(deps, 'demo', { track: 'backend', preset: 'full' })
    expect(code).toBe(0)
    expect(deps.errLines.some((l) => l.startsWith('WARN:') && l.includes('EACCES'))).toBe(true)
    // [INIT] 主输出不受注册表故障影响
    expect(deps.errLines).toContain('[INIT] /repo/openspec/changes/demo')
  })

  test('registerProject 未注入（可选依赖缺省）：行为与此前完全一致，exit 0', async () => {
    const deps = makeDeps()
    deps.registerProject = undefined
    const code = await cmdInit(deps, 'demo', { track: 'backend', preset: 'full' })
    expect(code).toBe(0)
    expect(deps.errLines).toEqual(['[INIT] /repo/openspec/changes/demo'])
  })

  test('init 失败（store.init 抛错）：不触发登记', async () => {
    const deps = makeDeps()
    deps.store.init = spy(async (_o: InitOptions): Promise<string> => {
      throw new Error('已存在')
    })
    const code = await cmdInit(deps, 'demo', { track: 'backend', preset: 'full' })
    expect(code).toBe(1)
    expect(deps.registeredRoots).toEqual([])
  })

  test('前置校验失败（非法 track）：不触发登记', async () => {
    const deps = makeDeps()
    const code = await cmdInit(deps, 'demo', { track: 'devops', preset: 'full' })
    expect(code).toBe(1)
    expect(deps.registeredRoots).toEqual([])
  })
})
