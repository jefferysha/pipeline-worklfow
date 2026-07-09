import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import {
  DEFAULT_RULES,
  rulesFromDef,
  useWorkflowRules,
  invalidateWorkflowRules,
} from './workflowModel'
import type { StepDef } from '../workflow/StepDetailPanel'

/** 极简自定义 workflow（demo 语境的 release-train）：draft →(approved) review →(shipped) ship */
function relDef(): { name: string; steps: StepDef[] } {
  const step = (id: string, gate: StepDef['gate'], transitions: StepDef['transitions']): StepDef => ({
    id, label: '', gate, skills: [], inputs: [], outputs: [], guards: [], transitions,
  })
  return {
    name: 'release-train',
    steps: [
      step('draft', null, [{ event: 'approved', to: 'review' }]),
      step('review', 'review', [{ event: 'shipped', to: 'ship' }]),
      step('ship', 'confirm', []),
    ],
  }
}

function okJson(body: unknown): Response {
  return { ok: true, status: 200, json: () => Promise.resolve(body) } as unknown as Response
}
function errJson(status: number, error: string): Response {
  return { ok: false, status, json: () => Promise.resolve({ ok: false, error }) } as unknown as Response
}

beforeEach(() => {
  invalidateWorkflowRules() // 模块级缓存跨用例清空
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('DEFAULT_RULES —— types.ts 四常量的 WorkflowRules 投影', () => {
  it('7 相位顺序 + verify 双出口（ship=verify-pass / build=verify-fail）', () => {
    expect(DEFAULT_RULES.steps).toEqual(['open', 'explore', 'spec', 'build', 'verify', 'ship', 'archive'])
    expect(DEFAULT_RULES.transitions['verify']).toEqual([
      { event: 'verify-pass', to: 'ship' },
      { event: 'verify-fail', to: 'build' },
    ])
    expect(DEFAULT_RULES.transitions['build']).toEqual([{ event: 'build-complete', to: 'verify' }])
  })

  it('gateByStep：REVIEW_PHASES 三相位 = review，其余 null', () => {
    expect(DEFAULT_RULES.gateByStep['explore']).toBe('review')
    expect(DEFAULT_RULES.gateByStep['spec']).toBe('review')
    expect(DEFAULT_RULES.gateByStep['verify']).toBe('review')
    expect(DEFAULT_RULES.gateByStep['open']).toBeNull()
    expect(DEFAULT_RULES.gateByStep['build']).toBeNull()
  })
})

describe('rulesFromDef —— WorkflowDef → WorkflowRules 映射', () => {
  it('steps 顺序 / transitions 逐边 / gate 三态全保留', () => {
    const rules = rulesFromDef(relDef())
    expect(rules.steps).toEqual(['draft', 'review', 'ship'])
    expect(rules.transitions['draft']).toEqual([{ event: 'approved', to: 'review' }])
    expect(rules.transitions['ship']).toEqual([])
    expect(rules.gateByStep['draft']).toBeNull()
    expect(rules.gateByStep['review']).toBe('review')
    expect(rules.gateByStep['ship']).toBe('confirm')
  })
})

describe('useWorkflowRules —— default 零网络 / 自定义 fetch+缓存 / 失败进 errors', () => {
  it("names 只含 'default' → 立即返回 DEFAULT_RULES，零 fetch", async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { result } = renderHook(() => useWorkflowRules('/repo', ['default']))
    expect(result.current.rules.get('default')).toBe(DEFAULT_RULES)
    expect(result.current.loading).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('自定义名触发一次 fetch（URL 带 root），第二次挂载命中缓存零新请求', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(okJson(relDef()))
    vi.stubGlobal('fetch', fetchSpy)
    const first = renderHook(() => useWorkflowRules('/repo', ['default', 'release-train']))
    await waitFor(() => expect(first.result.current.rules.get('release-train')).toBeDefined())
    expect(first.result.current.rules.get('release-train')!.steps).toEqual(['draft', 'review', 'ship'])
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(String(fetchSpy.mock.calls[0]![0])).toBe('/api/workflows/release-train?root=%2Frepo')

    const second = renderHook(() => useWorkflowRules('/repo', ['release-train']))
    await waitFor(() => expect(second.result.current.rules.get('release-train')).toBeDefined())
    expect(fetchSpy).toHaveBeenCalledTimes(1) // 缓存命中，无新请求
  })

  it('fetch 404 → errors 有该名字的 server 文案，rules 无 entry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errJson(404, "workflow 'ghost' 不存在")))
    const { result } = renderHook(() => useWorkflowRules('/repo', ['ghost']))
    await waitFor(() => expect(result.current.errors.get('ghost')).toBeDefined())
    expect(result.current.errors.get('ghost')).toContain('不存在')
    expect(result.current.rules.has('ghost')).toBe(false)
    expect(result.current.loading).toBe(false)
  })

  it('invalidateWorkflowRules 后重新 fetch（编辑器保存后的失效路径）', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(okJson(relDef()))
    vi.stubGlobal('fetch', fetchSpy)
    const first = renderHook(() => useWorkflowRules('/repo', ['release-train']))
    await waitFor(() => expect(first.result.current.rules.get('release-train')).toBeDefined())
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    invalidateWorkflowRules('/repo', 'release-train')
    const second = renderHook(() => useWorkflowRules('/repo', ['release-train']))
    await waitFor(() => expect(second.result.current.rules.get('release-train')).toBeDefined())
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})
