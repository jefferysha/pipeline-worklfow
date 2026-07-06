import { describe, expect, test } from 'vitest'
import type { FieldName, GuardResult, PipelineState } from '@pipeline-lite/kernel'
import { buildProgram, CliExit } from './program.js'
import { makeDeps, mockState, spy, type TestDeps } from './test-support.js'

async function run(deps: TestDeps, args: string[]): Promise<number> {
  try {
    await buildProgram(deps).parseAsync(args, { from: 'user' })
    return 0
  } catch (e) {
    if (e instanceof CliExit) return e.code
    throw e
  }
}

describe('program —— commander 装配与 exit code 逐格对齐', () => {
  test('get 走通：stdout 裸值，code 0', async () => {
    const deps = makeDeps({ state: mockState({ phase: 'build' }) })
    const code = await run(deps, ['get', 'demo', 'phase'])
    expect(code).toBe(0)
    expect(deps.outLines).toEqual(['build'])
  })

  test('get 未知字段：空行 + code 0（oracle 实测回写）', async () => {
    const deps = makeDeps()
    expect(await run(deps, ['get', 'demo', 'nope'])).toBe(0)
    expect(deps.outLines).toEqual([''])
  })

  test('set 走通：code 0，无 stdout', async () => {
    const deps = makeDeps()
    const code = await run(deps, ['set', 'demo', 'plan', 'docs/p.md'])
    expect(code).toBe(0)
    expect(deps.outLines).toEqual([])
    expect(deps.store.set.calls).toHaveLength(1)
  })

  test('set-many 变长参数路由', async () => {
    const deps = makeDeps()
    const code = await run(deps, ['set-many', 'demo', 'build_mode=direct', 'isolation=branch'])
    expect(code).toBe(0)
    expect(deps.store.setMany.calls[0]?.[1]).toEqual({ build_mode: 'direct', isolation: 'branch' })
  })

  test('cas 不匹配：code 3', async () => {
    const deps = makeDeps()
    deps.store.cas = spy(async (_d: string, _f: FieldName, _e: string, _n: string) => false)
    expect(await run(deps, ['cas', 'demo', 'automation', 'queued', 'scheduled'])).toBe(3)
  })

  test('transition 非法：code 1（oracle 实测回写）', async () => {
    const deps = makeDeps({ state: mockState({ phase: 'open' }) })
    expect(await run(deps, ['transition', 'demo', 'verify-pass'])).toBe(1)
  })

  test('transition 合法：stdout 空、[TRANSITION] 走 stderr，code 0', async () => {
    const deps = makeDeps({ state: mockState({ phase: 'open' }) })
    expect(await run(deps, ['transition', 'demo', 'open-complete'])).toBe(0)
    expect(deps.outLines).toEqual([])
    expect(deps.errLines).toContain('[TRANSITION] demo: open -> explore')
  })

  test('check 不过：code 2', async () => {
    const deps = makeDeps({ state: mockState({ phase: 'spec' }) })
    deps.flow.guardCheck = spy((_s: PipelineState): GuardResult => ({ pass: false, failures: ['x'] }))
    expect(await run(deps, ['check', 'demo'])).toBe(2)
  })

  test('init 缺 --track：commander 报错（usage error）', async () => {
    const deps = makeDeps()
    await expect(
      buildProgram(deps).parseAsync(['init', 'demo', '--preset', 'full'], { from: 'user' }),
    ).rejects.toMatchObject({ code: 'commander.missingMandatoryOptionValue' })
  })

  test('init 全参：stdout 空、[INIT] 走 stderr', async () => {
    const deps = makeDeps()
    const code = await run(deps, ['init', 'demo', '--track', 'backend', '--preset', 'full', '--user', 'jeff'])
    expect(code).toBe(0)
    expect(deps.outLines).toEqual([])
    expect(deps.errLines).toContain('[INIT] /repo/openspec/changes/demo')
  })

  test('status --json 路由', async () => {
    const deps = makeDeps({ states: { 'demo-a': mockState({ track: 'backend', phase: 'build' }) } })
    expect(await run(deps, ['status', '--json'])).toBe(0)
    expect(deps.outLines[0]).toContain('"active_changes"')
  })

  test('status <name> 路由', async () => {
    const deps = makeDeps({ states: { 'demo-a': mockState({ track: 'backend', phase: 'build' }) } })
    expect(await run(deps, ['status', 'demo-a'])).toBe(0)
    expect(deps.outLines[0]).toContain('demo-a')
  })

  test('list --json 路由', async () => {
    const deps = makeDeps({ changes: [] })
    expect(await run(deps, ['list', '--json'])).toBe(0)
    expect(deps.outLines).toEqual(['{"changes":[]}'])
  })

  test('未知子命令：commander 报错', async () => {
    const deps = makeDeps()
    await expect(
      buildProgram(deps).parseAsync(['frobnicate'], { from: 'user' }),
    ).rejects.toMatchObject({ code: 'commander.unknownCommand' })
  })
})
