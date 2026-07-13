import { describe, expect, it } from 'vitest'
import { applyStepTransition, firstStep, planStepTransition, resolveStep, resolveWorkflowName } from './engine.js'
import type { StepDef, WorkflowDef } from './types.js'
import { emptyFields } from '../state/parse.js'
import type { PipelineState } from '../types.js'

function state(fields: Partial<Record<string, string>>): PipelineState {
  return { fields: { ...emptyFields(), ...fields } as PipelineState['fields'], opaqueTail: '' }
}

function step(overrides: Partial<StepDef>): StepDef {
  return { id: 's1', label: 'x', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [], ...overrides }
}

function wf(steps: StepDef[], name = 'ml'): WorkflowDef {
  return { name, steps }
}

describe('resolveWorkflowName —— str(fields.workflow) || "default" 习语单源', () => {
  it('空串（历史遗留）→ 兜底 default（`||` 语义，`??` 不兜空串——这条是习语核心）', () => {
    expect(resolveWorkflowName(state({ workflow: '' }))).toBe('default')
  })

  it('显式 default → default', () => {
    expect(resolveWorkflowName(state({ workflow: 'default' }))).toBe('default')
  })

  it('自定义名 → 原样返回', () => {
    expect(resolveWorkflowName(state({ workflow: 'ml-pipeline' }))).toBe('ml-pipeline')
  })

  it('undefined（防御面：绕过 emptyFields 的残缺 state）→ default', () => {
    const s = state({})
    delete (s.fields as Partial<Record<string, string>>).workflow
    expect(resolveWorkflowName(s)).toBe('default')
  })

  it('列表值（防御面）→ join(",")，对齐 cli str / server fstr 的既有强转口径', () => {
    const s = state({})
    ;(s.fields as Record<string, string | string[]>).workflow = ['a', 'b']
    expect(resolveWorkflowName(s)).toBe('a,b')
  })
})

describe('resolveStep', () => {
  const w = wf([step({ id: 'collect' }), step({ id: 'train' })])

  it('命中 → 返回该 StepDef', () => {
    expect(resolveStep(w, 'train')?.id).toBe('train')
  })

  it('未命中 → null（消息模板留 adapter，kernel 只给判定）', () => {
    expect(resolveStep(w, 'ship')).toBeNull()
  })
})

describe('firstStep —— init.ts:159 wf.steps[0] 习语单源（本轮只建不接）', () => {
  it('非空 → steps[0]', () => {
    expect(firstStep(wf([step({ id: 'a' }), step({ id: 'b' })]))?.id).toBe('a')
  })

  it('空 steps → null', () => {
    expect(firstStep(wf([]))).toBeNull()
  })
})

describe('planStepTransition —— 解析 step/找边/评 guard 的编排单源', () => {
  const ctx = { changeDirAbs: '/nonexistent-dir-for-engine-test' }

  it('当前 phase 不在图里 → step-not-in-graph，携带 stepId 供 adapter 复原逐字消息', () => {
    const w = wf([step({ id: 'collect' })])
    const plan = planStepTransition(w, state({ phase: 'ghost' }), 'go', ctx)
    expect(plan).toEqual({ ok: false, kind: 'step-not-in-graph', stepId: 'ghost' })
  })

  it('step 命中但无该 event 出边 → event-unsupported，available 按声明序全量携带', () => {
    const w = wf([
      step({ id: 'verify', transitions: [{ event: 'pass', to: 'ship' }, { event: 'fail', to: 'build' }] }),
    ])
    const plan = planStepTransition(w, state({ phase: 'verify' }), 'explode', ctx)
    expect(plan).toEqual({ ok: false, kind: 'event-unsupported', stepId: 'verify', available: ['pass', 'fail'] })
  })

  it('step 零出边（终点 step）→ event-unsupported 且 available 为空数组（adapter 兜 "(无)"）', () => {
    const w = wf([step({ id: 'done', transitions: [] })])
    const plan = planStepTransition(w, state({ phase: 'done' }), 'go', ctx)
    expect(plan).toEqual({ ok: false, kind: 'event-unsupported', stepId: 'done', available: [] })
  })

  it('guard 不过 → guard-failed，failures 原样携带（evaluateStepGuards 单源产出）', () => {
    const w = wf([
      step({
        id: 'collect',
        outputs: [{ field: 'design_doc', type: 'file_path' }],
        guards: [{ type: 'nonempty-output' }],
        transitions: [{ event: 'go', to: 'train' }],
      }),
    ])
    const plan = planStepTransition(w, state({ phase: 'collect', design_doc: 'null' }), 'go', ctx)
    expect(plan.ok).toBe(false)
    if (plan.ok || plan.kind !== 'guard-failed') throw new Error('期望 guard-failed')
    expect(plan.stepId).toBe('collect')
    expect(plan.failures.length).toBe(1)
    expect(plan.failures[0]).toContain('design_doc')
  })

  it('次序钉死：无边 + guard 也会挂 → 先报 event-unsupported（对齐 cli/server 现行「找边先于评 guard」）', () => {
    const w = wf([
      step({
        id: 'collect',
        outputs: [{ field: 'design_doc', type: 'file_path' }],
        guards: [{ type: 'nonempty-output' }],
        transitions: [{ event: 'go', to: 'train' }],
      }),
    ])
    const plan = planStepTransition(w, state({ phase: 'collect', design_doc: 'null' }), 'wrong-event', ctx)
    expect(plan.ok).toBe(false)
    if (plan.ok) throw new Error('unreachable')
    expect(plan.kind).toBe('event-unsupported')
  })

  it('全通过 → ok，from=当前 step id、to=该 event 边的目标', () => {
    const w = wf([
      step({ id: 'collect', transitions: [{ event: 'go', to: 'train' }] }),
      step({ id: 'train' }),
    ])
    const plan = planStepTransition(w, state({ phase: 'collect' }), 'go', ctx)
    expect(plan).toEqual({ ok: true, from: 'collect', to: 'train' })
  })

  it('多出边 step：不同 event 选不同目标（verify-pass→ship / verify-fail→build 型分支）', () => {
    const w = wf([
      step({ id: 'verify', transitions: [{ event: 'pass', to: 'ship' }, { event: 'fail', to: 'build' }] }),
    ])
    const p1 = planStepTransition(w, state({ phase: 'verify' }), 'pass', ctx)
    const p2 = planStepTransition(w, state({ phase: 'verify' }), 'fail', ctx)
    expect(p1).toEqual({ ok: true, from: 'verify', to: 'ship' })
    expect(p2).toEqual({ ok: true, from: 'verify', to: 'build' })
  })
})

describe('applyStepTransition —— 纯变换：phase + updated_at，不 mutate 输入', () => {
  const clock = (): string => '2026-07-13T00:00:00Z'

  it('产出新 state：phase=to、updated_at=clock()，其余字段与 opaqueTail 原样保留', () => {
    const before = state({ phase: 'collect', design_doc: 'docs/d.md', updated_at: '2020-01-01T00:00:00Z' })
    const beforeWithTail: PipelineState = { ...before, opaqueTail: '#legacy-tail\n' }
    const next = applyStepTransition(beforeWithTail, 'train', clock)
    expect(next.fields.phase).toBe('train')
    expect(next.fields.updated_at).toBe('2026-07-13T00:00:00Z')
    expect(next.fields.design_doc).toBe('docs/d.md')
    expect(next.opaqueTail).toBe('#legacy-tail\n')
  })

  it('输入零 mutate：原 state 的 phase/updated_at/fields 引用全部不变', () => {
    const before = state({ phase: 'collect', updated_at: '2020-01-01T00:00:00Z' })
    const fieldsRef = before.fields
    const next = applyStepTransition(before, 'train', clock)
    expect(before.fields.phase).toBe('collect')
    expect(before.fields.updated_at).toBe('2020-01-01T00:00:00Z')
    expect(before.fields).toBe(fieldsRef)
    expect(next).not.toBe(before)
    expect(next.fields).not.toBe(before.fields)
  })
})
