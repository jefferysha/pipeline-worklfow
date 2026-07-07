import { describe, expect, it } from 'vitest'
import { validateWorkflow } from './validate.js'
import type { WorkflowDef } from './types.js'

function wf(overrides: Partial<WorkflowDef>): WorkflowDef {
  return { name: 'test', steps: [], ...overrides }
}

describe('validateWorkflow', () => {
  it('skill 依赖成环 → 报错', () => {
    const result = validateWorkflow(wf({
      steps: [{
        id: 's1', label: 'x', gate: null, inputs: [], outputs: [], guards: [], transitions: [],
        skills: [
          { id: 'a', depends_on: ['b'] },
          { id: 'b', depends_on: ['a'] },
        ],
      }],
    }))
    expect(result.some((e) => e.includes('循环依赖'))).toBe(true)
  })

  it('depends_on 引用跨 step 不存在的 skill id → 报错', () => {
    const result = validateWorkflow(wf({
      steps: [{
        id: 's1', label: 'x', gate: null, inputs: [], outputs: [], guards: [], transitions: [],
        skills: [{ id: 'a', depends_on: ['does-not-exist'] }],
      }],
    }))
    expect(result.some((e) => e.includes('does-not-exist'))).toBe(true)
  })

  it('inputs 引用的字段不是任何更早 step 的 outputs → 报错', () => {
    const result = validateWorkflow(wf({
      steps: [
        { id: 's1', label: 'a', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [{ event: 'complete', to: 's2' }] },
        { id: 's2', label: 'b', gate: null, skills: [], inputs: [{ field: 'design_doc', type: 'file_path' }], outputs: [], guards: [], transitions: [] },
      ],
    }))
    expect(result.some((e) => e.includes('design_doc'))).toBe(true)
  })

  it('transitions 的 to 引用不存在的 step id → 报错', () => {
    const result = validateWorkflow(wf({
      steps: [
        { id: 's1', label: 'a', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [{ event: 'complete', to: 'does-not-exist' }] },
      ],
    }))
    expect(result.some((e) => e.includes("'does-not-exist'") && e.includes('不存在'))).toBe(true)
  })

  it('非终止 step（没有任何后续 transitions 声明）→ 报错，防止用户漏配走进死路', () => {
    const result = validateWorkflow(wf({
      steps: [
        { id: 's1', label: 'a', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
        { id: 's2', label: 'b', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
      ],
    }))
    // s1 前面还有 s2 这个后续 step 存在，s1 自己却没声明任何 transition 能走到它或任何地方——
    // 只有"数组里最后一个 step"允许零 transitions（终态，如 archive），中间的 step 零
    // transitions 视为配置错误。
    expect(result.some((e) => e.includes("step 's1'") && e.includes('没有声明任何 transitions'))).toBe(true)
  })

  it('合法 workflow（含分支 transitions）→ 空数组', () => {
    const result = validateWorkflow(wf({
      steps: [
        { id: 's1', label: 'a', gate: null, skills: [], inputs: [], outputs: [{ field: 'design_doc', type: 'file_path' }], guards: [], transitions: [{ event: 'complete', to: 's2' }] },
        { id: 's2', label: 'b', gate: null, skills: [], inputs: [{ field: 'design_doc', type: 'file_path' }], outputs: [], guards: [], transitions: [{ event: 'pass', to: 's3' }, { event: 'fail', to: 's1' }] },
        { id: 's3', label: 'c', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
      ],
    }))
    expect(result).toEqual([])
  })
})
