import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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

describe('evaluateStepGuards —— tasks-at-least（B2：复用 flow/guard.ts taskCount 真实计数，勿无条件卡死）', () => {
  let changeDirAbs: string
  beforeEach(async () => {
    changeDirAbs = await mkdtemp(join(tmpdir(), 'pl-stepguard-'))
  })
  afterEach(async () => {
    await rm(changeDirAbs, { recursive: true, force: true })
  })

  it('tasks.md 任务数 ≥ n → pass（回归：老实现无条件 fail，任何满足量的自定义 workflow 也卡死）', async () => {
    await writeFile(join(changeDirAbs, 'tasks.md'), '- [ ] a\n- [x] b\n- [ ] c\n', 'utf8')
    const s = step({ guards: [{ type: 'tasks-at-least', n: 3 }] })
    const result = evaluateStepGuards(state({}), s, { changeDirAbs })
    expect(result.pass).toBe(true)
    expect(result.failures).toEqual([])
  })

  it('tasks.md 任务数 < n → fail，且 failures 点名要求的任务数', async () => {
    await writeFile(join(changeDirAbs, 'tasks.md'), '- [ ] only one\n', 'utf8')
    const s = step({ guards: [{ type: 'tasks-at-least', n: 3 }] })
    const result = evaluateStepGuards(state({}), s, { changeDirAbs })
    expect(result.pass).toBe(false)
    expect(result.failures.some((f) => f.includes('3'))).toBe(true)
  })

  it('tasks.md 缺失 → 计 0 个任务，n≥1 时 fail（与 flow/guard.ts 缺文件语义一致）', () => {
    const s = step({ guards: [{ type: 'tasks-at-least', n: 1 }] })
    const result = evaluateStepGuards(state({}), s, { changeDirAbs })
    expect(result.pass).toBe(false)
  })

  it('大写 [X] 不计（照 taskCount 老仓 regex），仅 [ ]/[x] 计数', async () => {
    await writeFile(join(changeDirAbs, 'tasks.md'), '- [X] 不计\n- [x] 计\n', 'utf8')
    const s = step({ guards: [{ type: 'tasks-at-least', n: 2 }] })
    const result = evaluateStepGuards(state({}), s, { changeDirAbs })
    expect(result.pass).toBe(false) // 只有 1 个计数（[x]），< 2
  })
})
