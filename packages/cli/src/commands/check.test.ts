import { describe, expect, test } from 'vitest'
import type { GuardContext, GuardResult, PipelineState } from '@pipeline-lite/kernel'
import { cmdCheck } from './check.js'
import { makeDeps, mockState, spy } from '../test-support.js'

describe('check —— guard 报告（人读）；0 过 / 2 不过（CONTRACT §3）', () => {
  test('通过：报告打 stdout，exit 0', async () => {
    const deps = makeDeps({ state: mockState({ phase: 'build' }) })
    const code = await cmdCheck(deps, 'demo')
    expect(code).toBe(0)
    expect(deps.outLines).toEqual(['[CHECK] demo (phase=build)', '  [PASS] 所有检查通过'])
  })

  test('不过：逐条列出 failure + 汇总行，exit 2', async () => {
    const deps = makeDeps({ state: mockState({ phase: 'spec' }) })
    deps.flow.guardCheck = spy(
      (_s: PipelineState): GuardResult => ({ pass: false, failures: ['design_doc 缺失', 'plan 缺失'] }),
    )
    const code = await cmdCheck(deps, 'demo')
    expect(code).toBe(2)
    expect(deps.outLines).toEqual([
      '[CHECK] demo (phase=spec)',
      '  [FAIL] design_doc 缺失',
      '  [FAIL] plan 缺失',
      '  [FAIL] 共 2 项未通过',
    ])
  })

  test('guardCheck 收到读出的完整 state', async () => {
    const state = mockState({ phase: 'verify', track: 'backend' })
    const deps = makeDeps({ state })
    await cmdCheck(deps, 'demo')
    expect(deps.flow.guardCheck.calls[0]?.[0]).toBe(state)
  })

  test('注入 deps.guardCtx：按 change 名构造 GuardContext 并传给 guardCheck（全量文件面）', async () => {
    const seen: string[] = []
    const deps = makeDeps({
      state: mockState({ phase: 'open' }),
      guardCtx: (name: string): GuardContext => {
        seen.push(name)
        return { changeDirRel: `openspec/changes/${name}` }
      },
    })
    await cmdCheck(deps, 'demo')
    expect(seen).toEqual(['demo'])
    expect(deps.flow.guardCheck.calls[0]?.[1]?.changeDirRel).toBe('openspec/changes/demo')
  })

  test('未注入 guardCtx：guardCheck 第二参 undefined（lite 纯字段面，向后兼容）', async () => {
    const deps = makeDeps({ state: mockState({ phase: 'open' }) })
    await cmdCheck(deps, 'demo')
    expect(deps.flow.guardCheck.calls[0]?.[1]).toBeUndefined()
  })

  test('warnings 渲染为 [WARN] 行（老 guard yellow 面），不影响 exit 0', async () => {
    const deps = makeDeps({ state: mockState({ phase: 'spec' }) })
    deps.flow.guardCheck = spy(
      (_s: PipelineState): GuardResult => ({
        pass: true,
        failures: [],
        warnings: ['hotfix：2 层覆盖留空（已豁免，建议补；🔒 锁不豁免）'],
      }),
    )
    const code = await cmdCheck(deps, 'demo')
    expect(code).toBe(0)
    expect(deps.outLines).toEqual([
      '[CHECK] demo (phase=spec)',
      '  [WARN] hotfix：2 层覆盖留空（已豁免，建议补；🔒 锁不豁免）',
      '  [PASS] 所有检查通过',
    ])
  })

  test('不过且带 warnings：先 WARN 后 FAIL 明细，exit 2', async () => {
    const deps = makeDeps({ state: mockState({ phase: 'spec' }) })
    deps.flow.guardCheck = spy(
      (_s: PipelineState): GuardResult => ({
        pass: false,
        failures: ['spec 出口：全栈 Spec 覆盖（1 层阻塞）'],
        warnings: ['覆盖阻塞: L6_security required blank BLOCKED LOCKVIOLATION'],
      }),
    )
    const code = await cmdCheck(deps, 'demo')
    expect(code).toBe(2)
    expect(deps.outLines).toEqual([
      '[CHECK] demo (phase=spec)',
      '  [WARN] 覆盖阻塞: L6_security required blank BLOCKED LOCKVIOLATION',
      '  [FAIL] spec 出口：全栈 Spec 覆盖（1 层阻塞）',
      '  [FAIL] 共 1 项未通过',
    ])
  })

  test('状态文件缺失：exit 1', async () => {
    const deps = makeDeps()
    deps.store.read = spy(async (_d: string): Promise<PipelineState> => {
      throw new Error('ENOENT')
    })
    const code = await cmdCheck(deps, 'demo')
    expect(code).toBe(1)
  })

  test('非法 change 名：exit 1', async () => {
    const deps = makeDeps()
    const code = await cmdCheck(deps, '../etc')
    expect(code).toBe(1)
    expect(deps.store.read.calls).toHaveLength(0)
  })
})
