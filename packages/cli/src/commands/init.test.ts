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
