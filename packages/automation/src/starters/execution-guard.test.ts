import { describe, expect, it, vi } from 'vitest'
import type { LoopEntry, LoopRegistrySnapshot, WorkflowDef, WorkflowIR } from '@pipeline-lite/kernel'
import {
  enforceActiveLoopExecutionWiring,
  type LoopExecutionGuardDeps,
} from './execution-guard.js'

function loop(over: Partial<LoopEntry> = {}): LoopEntry {
  return {
    id: 'starter-loop', name: 'Starter', kind: 'orchestrator', goal: 'run starter safely', cadence: '1h',
    risk: 'low', runner: 'codex', change_prefix: 'starter-', phases: ['open'], human_gates: [],
    state: '.superpowers/loops/progress.md', design_doc: 'LOOP.md', status: 'active',
    budget: { max_runs_per_day: 1, max_in_flight: 1, on_exceed: 'skip' }, kill_criteria: ['manual stop'],
    autonomy_level: 'L1', allowlist: [], denylist: [], template_id: 'daily-triage', template_version: 1,
    workflow_id: 'default', skill_bundle_id: 'backend', ...over,
  }
}

function snapshot(entry: LoopEntry, epoch = 'epoch-a'): LoopRegistrySnapshot {
  return { text: '', epoch, registry: { version: 1, loops: [entry] }, errors: [] }
}

function deps(over: Partial<LoopExecutionGuardDeps> = {}): LoopExecutionGuardDeps {
  return {
    repoRoot: '/repo',
    wiring: {
      repoRoot: '/repo',
      skillBundleWiring: {
        resolver: { resolveDefault: () => [], resolveCustom: () => [] },
        locator: { locate: async (skillId) => ({ skillId, contentDir: `/skills/${skillId}` }) },
      },
    },
    readSnapshot: vi.fn(async () => snapshot(loop())),
    pauseAtEpoch: vi.fn(async () => ({ ok: true as const })),
    evaluate: vi.fn(async (entry) => ({
      status: 'invalid' as const,
      loopId: entry.id,
      dimension: 'workflow' as const,
      reason: 'workflow missing',
      starter: null,
    })),
    ...over,
  }
}

describe('enforceActiveLoopExecutionWiring', () => {
  it('custom workflow 的真实 StepIR skills 在 pre-claim 守卫求值；default 同名 phase 为空也不得误报 ready', async () => {
    const entry = loop({ workflow_id: 'custom-wf', phases: ['open'] })
    const resolveDefault = vi.fn(() => [])
    const resolveCustom = vi.fn(() => [{
      token: 'custom-only-skill', alternatives: ['custom-only-skill'],
    }])
    const locate = vi.fn(async () => {
      throw Object.assign(new Error('custom-only-skill 未安装'), { _tag: 'SkillContentNotFoundError' })
    })
    const pauseAtEpoch = vi.fn(async () => ({ ok: true as const }))
    const definition = { name: 'custom-wf', steps: [] } satisfies WorkflowDef
    const compiled: WorkflowIR = {
      name: 'custom-wf',
      steps: [{
        id: 'open', label: 'open', gate: null, skills: [], inputs: [], outputs: [],
        guards: [], artifacts: [], transitions: [],
      }],
    }
    const d = deps({
      readSnapshot: vi.fn(async () => snapshot(entry)),
      pauseAtEpoch,
      evaluate: undefined,
      wiring: {
        repoRoot: '/repo',
        skillBundleWiring: {
          resolver: { resolveDefault, resolveCustom },
          locator: { locate },
          isSkillProfileKnown: () => true,
        },
        loadWorkflow: () => definition,
        compileWorkflow: () => compiled,
        customWorkflowRuntimeWired: true,
      },
    })

    const result = await enforceActiveLoopExecutionWiring(['starter-loop'], d)

    expect(result.blocked).toEqual([expect.objectContaining({
      loopId: 'starter-loop', status: 'invalid', dimension: 'skill-bundle',
    })])
    expect(result.blocked[0]?.reason).toMatch(/custom-only-skill/)
    expect(resolveDefault).not.toHaveBeenCalled()
    expect(resolveCustom).toHaveBeenCalledOnce()
    expect(locate).toHaveBeenCalledWith('custom-only-skill')
    expect(pauseAtEpoch).toHaveBeenCalledWith('/repo', 'starter-loop', 'epoch-a')
  })

  it('非 starter loop 显式绑定 custom workflow 时也不得走 default 解析旁路', async () => {
    const entry = loop({ template_id: undefined, template_version: undefined, workflow_id: 'custom-wf' })
    const resolveDefault = vi.fn(() => [])
    const resolveCustom = vi.fn(() => [])
    const pauseAtEpoch = vi.fn(async () => ({ ok: true as const }))
    const d = deps({
      readSnapshot: vi.fn(async () => snapshot(entry)),
      pauseAtEpoch,
      evaluate: undefined,
      wiring: {
        repoRoot: '/repo',
        skillBundleWiring: {
          resolver: { resolveDefault, resolveCustom },
          locator: { locate: async (skillId) => ({ skillId, contentDir: `/skills/${skillId}` }) },
          isSkillProfileKnown: () => true,
        },
      },
    })

    const result = await enforceActiveLoopExecutionWiring(['starter-loop'], d)

    expect(result.blocked).toEqual([expect.objectContaining({
      loopId: 'starter-loop', status: 'invalid', dimension: 'skill-bundle',
    })])
    expect(result.blocked[0]?.reason).toMatch(/custom-wf|custom workflow|StepIR|解析计划/i)
    expect(resolveDefault).not.toHaveBeenCalled()
    expect(resolveCustom).not.toHaveBeenCalled()
    expect(pauseAtEpoch).toHaveBeenCalledOnce()
  })

  it('active wiring invalid → governance epoch-CAS 暂停，并返回结构化阻断', async () => {
    const d = deps()

    const result = await enforceActiveLoopExecutionWiring(['starter-loop'], d)

    expect(result.blocked).toEqual([{
      loopId: 'starter-loop', dimension: 'workflow', reason: 'workflow missing', status: 'invalid',
    }])
    expect(d.pauseAtEpoch).toHaveBeenCalledWith('/repo', 'starter-loop', 'epoch-a')
  })

  it('paused loop 不复验、不写；guard 只管真实可运行的 active 边界', async () => {
    const d = deps({ readSnapshot: vi.fn(async () => snapshot(loop({ status: 'paused' }))) })

    const result = await enforceActiveLoopExecutionWiring(['starter-loop'], d)

    expect(result.blocked).toEqual([])
    expect(d.evaluate).not.toHaveBeenCalled()
    expect(d.pauseAtEpoch).not.toHaveBeenCalled()
  })

  it('CAS 竞态后配置已修好且仍 active → 重读重判 ready，不用旧结论误暂停', async () => {
    const readSnapshot = vi.fn()
      .mockResolvedValueOnce(snapshot(loop(), 'epoch-old'))
      .mockResolvedValueOnce(snapshot(loop(), 'epoch-fixed'))
    const evaluate = vi.fn()
      .mockResolvedValueOnce({
        status: 'invalid' as const, loopId: 'starter-loop', dimension: 'workflow' as const,
        reason: 'old missing workflow', starter: null,
      })
      .mockResolvedValueOnce({ status: 'ready' as const, loopId: 'starter-loop', starter: null })
    const pauseAtEpoch = vi.fn()
      .mockResolvedValueOnce({ ok: false as const, error: 'epoch changed' })
    const d = deps({ readSnapshot, evaluate, pauseAtEpoch })

    const result = await enforceActiveLoopExecutionWiring(['starter-loop'], d)

    expect(result.blocked).toEqual([])
    expect(evaluate).toHaveBeenCalledTimes(2)
    expect(pauseAtEpoch).toHaveBeenCalledTimes(1)
  })

  it('CAS 竞态后已由别人暂停 → 保留阻断结论但不重复写', async () => {
    const readSnapshot = vi.fn()
      .mockResolvedValueOnce(snapshot(loop(), 'epoch-old'))
      .mockResolvedValueOnce(snapshot(loop({ status: 'paused' }), 'epoch-new'))
    const pauseAtEpoch = vi.fn()
      .mockResolvedValueOnce({ ok: false as const, error: 'epoch changed' })
    const d = deps({ readSnapshot, pauseAtEpoch })

    const result = await enforceActiveLoopExecutionWiring(['starter-loop'], d)

    expect(result.blocked).toHaveLength(1)
    expect(pauseAtEpoch).toHaveBeenCalledTimes(1)
  })

  it('有界 CAS 重试始终失败 → fail-loud，绝不报告已安全暂停', async () => {
    const d = deps({
      maxCasAttempts: 2,
      pauseAtEpoch: vi.fn(async () => ({ ok: false as const, error: 'contended' })),
    })

    await expect(enforceActiveLoopExecutionWiring(['starter-loop'], d)).rejects.toThrow(/CAS|2.*失败|contended/i)
  })

  it('registry 损坏/缺失 fail-loud，不把无法验证冒充 ready', async () => {
    const d = deps({
      readSnapshot: vi.fn(async () => ({ text: 'bad', epoch: 'bad', registry: null, errors: ['schema bad'] })),
    })

    await expect(enforceActiveLoopExecutionWiring(['starter-loop'], d)).rejects.toThrow(/registry|schema bad/i)
  })
})
