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

  test('init 缺 --track（非交互）：fail-loud exit 1（向导引入后 track/preset 改 option）', async () => {
    // 交互向导（BT6）落地后 --track/--preset 由 requiredOption 改 option：commander 不再抢在
    // action 前抛 missingMandatoryOptionValue；非 TTY（agent/CI，含 vitest）缺参由 cmdInit 接管
    // fail-loud（exit 1 + 明确 err），脚本可依赖的 exit 1 契约不变；TTY 下则走交互向导。
    const deps = makeDeps()
    const code = await run(deps, ['init', 'demo', '--preset', 'full'])
    expect(code).toBe(1)
    expect(deps.errLines.join('\n')).toContain('非交互模式缺少必填项')
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
