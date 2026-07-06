import { describe, expect, test } from 'vitest'
import { IllegalTransitionError } from '@pipeline-lite/kernel'
import type { Phase, PipelineState, TransitionResult } from '@pipeline-lite/kernel'
import { cmdTransition } from './transition.js'
import { FIXED_CLOCK, makeDeps, mockState, spy } from '../test-support.js'

describe('transition —— [TRANSITION] 走 stderr / 非法 exit 1（oracle 实测回写）', () => {
  test('合法转换：stdout 无输出，[TRANSITION] 走 stderr，exit 0', async () => {
    const deps = makeDeps({ state: mockState({ phase: 'open' }) })
    const code = await cmdTransition(deps, 'demo', 'open-complete')
    expect(code).toBe(0)
    expect(deps.outLines).toEqual([])
    expect(deps.errLines).toContain('[TRANSITION] demo: open -> explore')
  })

  test('事件映射目标相位并透传注入时钟给 flow.transition', async () => {
    const deps = makeDeps({ state: mockState({ phase: 'spec' }) })
    await cmdTransition(deps, 'demo', 'spec-complete')
    const call = deps.flow.transition.calls[0]
    expect(call?.[1]).toBe('build')
    expect(call?.[2]).toBe(deps.clock)
  })

  test('新状态经 store.write 落盘，且整体在 withLock 内', async () => {
    const deps = makeDeps({ state: mockState({ phase: 'build' }) })
    await cmdTransition(deps, 'demo', 'build-complete')
    expect(deps.store.withLock.calls).toHaveLength(1)
    expect(deps.store.write.calls).toHaveLength(1)
    const written = deps.store.write.calls[0]?.[1] as PipelineState
    expect(written.fields.phase).toBe('verify')
  })

  test('verify-fail 回退边：verify -> build（stderr），且 build_sha 清 null', async () => {
    const deps = makeDeps({ state: mockState({ phase: 'verify' }) })
    const code = await cmdTransition(deps, 'demo', 'verify-fail')
    expect(code).toBe(0)
    expect(deps.outLines).toEqual([])
    expect(deps.errLines).toContain('[TRANSITION] demo: verify -> build')
  })

  test('archived 终态自环：archive -> archive（stderr）', async () => {
    const deps = makeDeps({ state: mockState({ phase: 'archive' }) })
    const code = await cmdTransition(deps, 'demo', 'archived')
    expect(code).toBe(0)
    expect(deps.outLines).toEqual([])
    expect(deps.errLines).toContain('[TRANSITION] demo: archive -> archive')
  })

  test('当前 phase 与事件 from 不符：exit 1（老内核口径），flow 不被调用、不写盘', async () => {
    const deps = makeDeps({ state: mockState({ phase: 'open' }) })
    const code = await cmdTransition(deps, 'demo', 'verify-pass')
    expect(code).toBe(1)
    expect(deps.outLines).toEqual([])
    expect(deps.flow.transition.calls).toHaveLength(0)
    expect(deps.store.write.calls).toHaveLength(0)
  })

  test('flow 抛 IllegalTransitionError：exit 2，无 stdout', async () => {
    const deps = makeDeps({ state: mockState({ phase: 'verify' }) })
    deps.flow.transition = spy((_s: PipelineState, _to: Phase, _c?: () => string): TransitionResult => {
      throw new IllegalTransitionError('verify', 'ship')
    })
    const code = await cmdTransition(deps, 'demo', 'verify-pass')
    expect(code).toBe(1)
    expect(deps.outLines).toEqual([])
    expect(deps.store.write.calls).toHaveLength(0)
  })

  test('未知 event：exit 1（老内核口径），store 不被触碰', async () => {
    const deps = makeDeps()
    const code = await cmdTransition(deps, 'demo', 'warp-speed')
    expect(code).toBe(1)
    expect(deps.store.read.calls).toHaveLength(0)
  })

  test('状态文件缺失（read 抛错）：exit 1', async () => {
    const deps = makeDeps()
    deps.store.read = spy(async (_d: string): Promise<PipelineState> => {
      throw new Error('ENOENT')
    })
    const code = await cmdTransition(deps, 'demo', 'open-complete')
    expect(code).toBe(1)
  })

  test('成功后写 breadcrumb 缓存（CONTRACT §5.4）', async () => {
    const deps = makeDeps({ state: mockState({ phase: 'open' }) })
    await cmdTransition(deps, 'demo', 'open-complete')
    expect(deps.breadcrumbs).toHaveLength(1)
    expect(deps.breadcrumbs[0]?.[0]).toBe('/repo/openspec/changes/demo')
    expect(deps.breadcrumbs[0]?.[1]).toContain('explore')
  })

  test('成功后 append 一条 transition 历史（.pipeline-history.jsonl 语义）', async () => {
    const deps = makeDeps({ state: mockState({ phase: 'open' }) })
    await cmdTransition(deps, 'demo', 'open-complete')
    expect(deps.historyEntries).toEqual([
      ['/repo/openspec/changes/demo', { ts: FIXED_CLOCK, kind: 'transition', from: 'open', to: 'explore' }],
    ])
  })

  test('breadcrumb 写失败仅 WARN，不影响 exit 0', async () => {
    const deps = makeDeps({ state: mockState({ phase: 'open' }) })
    deps.writeBreadcrumb = async () => {
      throw new Error('EACCES')
    }
    const code = await cmdTransition(deps, 'demo', 'open-complete')
    expect(code).toBe(0)
    expect(deps.outLines).toEqual([])
    expect(deps.errLines.join('\n')).toContain('WARN')
  })

  test('非法 change 名：exit 1', async () => {
    const deps = makeDeps()
    const code = await cmdTransition(deps, 'bad name', 'open-complete')
    expect(code).toBe(1)
  })
})
