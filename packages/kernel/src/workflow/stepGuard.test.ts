import { describe, expect, it } from 'vitest'
import { evaluateStepGuards } from './stepGuard.js'
import type { StepDef } from './types.js'
import { emptyFields } from '../state/parse.js'
import type { PipelineState } from '../types.js'

function state(fields: Partial<Record<string, string>>): PipelineState {
  return { fields: { ...emptyFields(), ...fields } as PipelineState['fields'], opaqueTail: '' }
}

function step(overrides: Partial<StepDef>): StepDef {
  return { id: 's1', label: 'x', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [], ...overrides }
}

describe('evaluateStepGuards', () => {
  it('outputs 声明的字段已设置（非 null 哨兵）→ pass', () => {
    const s = step({ outputs: [{ field: 'design_doc', type: 'file_path' }], guards: [{ type: 'nonempty-output' }] })
    const result = evaluateStepGuards(state({ design_doc: '/tmp/x/design.md' }), s, { changeDirAbs: '/tmp/x' })
    expect(result.pass).toBe(true)
  })

  it('outputs 声明的字段仍是 null 哨兵 → fail，failures 里点名具体字段', () => {
    const s = step({ outputs: [{ field: 'design_doc', type: 'file_path' }], guards: [{ type: 'nonempty-output' }] })
    const result = evaluateStepGuards(state({ design_doc: 'null' }), s, { changeDirAbs: '/tmp/x' })
    expect(result.pass).toBe(false)
    expect(result.failures.some((f) => f.includes('design_doc'))).toBe(true)
  })

  it('没有 nonempty-output guard 时，字段是否设置不影响结果（guards 列表说了算，不是隐式全查）', () => {
    const s = step({ outputs: [{ field: 'design_doc', type: 'file_path' }], guards: [] })
    const result = evaluateStepGuards(state({ design_doc: 'null' }), s, { changeDirAbs: '/tmp/x' })
    expect(result.pass).toBe(true)
  })
})
