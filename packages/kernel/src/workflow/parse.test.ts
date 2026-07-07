import { describe, expect, it } from 'vitest'
import { parseWorkflow } from './parse.js'

const SAMPLE = `name: default
steps:
  - id: open
    label: 立项
    gate: null
    skills: []
    inputs: []
    outputs: []
    guards: []
    transitions:
      - event: complete
        to: explore
  - id: explore
    label: 调研
    gate: review
    skills:
      - id: superpowers:brainstorming
      - id: opsx:explore
        depends_on: [superpowers:brainstorming]
    inputs: []
    outputs:
      - field: design_doc
        type: file_path
    guards: []
    transitions: []
  - id: verify
    label: 验证
    gate: review
    skills: []
    inputs: []
    outputs: []
    guards: []
    transitions:
      - event: pass
        to: ship
      - event: fail
        to: build
`

const SAMPLE_WITH_GUARDS = `name: workflow-with-guards
steps:
  - id: step1
    label: 步骤一
    gate: null
    skills: []
    inputs: []
    outputs: []
    guards:
      - type: nonempty-output
    transitions: []
  - id: step2
    label: 步骤二
    gate: review
    skills: []
    inputs: []
    outputs: []
    guards:
      - type: tasks-at-least
        n: 3
    transitions: []
  - id: step3
    label: 步骤三
    gate: null
    skills: []
    inputs: []
    outputs: []
    guards:
      - type: nonempty-output
      - type: tasks-at-least
        n: 2
    transitions: []
`

describe('parseWorkflow', () => {
  it('解析出 3 个 step，第二个 step 的第二个 skill 带 depends_on', () => {
    const wf = parseWorkflow(SAMPLE)
    expect(wf.name).toBe('default')
    expect(wf.steps).toHaveLength(3)
    expect(wf.steps[1]?.id).toBe('explore')
    expect(wf.steps[1]?.gate).toBe('review')
    expect(wf.steps[1]?.skills[1]).toEqual({ id: 'opsx:explore', depends_on: ['superpowers:brainstorming'] })
    expect(wf.steps[1]?.outputs[0]).toEqual({ field: 'design_doc', type: 'file_path' })
  })

  it('第一个 step 的 transitions 解析出单条边', () => {
    const wf = parseWorkflow(SAMPLE)
    expect(wf.steps[0]?.transitions).toEqual([{ event: 'complete', to: 'explore' }])
  })

  it('verify step 的 transitions 解析出两条分支边（同一 step 不同 event 走向不同 to）', () => {
    const wf = parseWorkflow(SAMPLE)
    expect(wf.steps[2]?.transitions).toEqual([
      { event: 'pass', to: 'ship' },
      { event: 'fail', to: 'build' },
    ])
  })

  it('格式错误（steps 不是数组）→ 真抛错，不静默返回空', () => {
    expect(() => parseWorkflow('name: x\nsteps: not-a-list\n')).toThrow()
  })

  // Guards block tests
  it('单个 nonempty-output 守卫解析正确', () => {
    const wf = parseWorkflow(SAMPLE_WITH_GUARDS)
    expect(wf.steps[0]?.id).toBe('step1')
    expect(wf.steps[0]?.guards).toEqual([{ type: 'nonempty-output' }])
  })

  it('tasks-at-least 守卫带 n 值解析正确', () => {
    const wf = parseWorkflow(SAMPLE_WITH_GUARDS)
    expect(wf.steps[1]?.id).toBe('step2')
    expect(wf.steps[1]?.guards).toEqual([{ type: 'tasks-at-least', n: 3 }])
  })

  it('多个守卫（nonempty-output + tasks-at-least）在同一 step 解析正确', () => {
    const wf = parseWorkflow(SAMPLE_WITH_GUARDS)
    expect(wf.steps[2]?.id).toBe('step3')
    expect(wf.steps[2]?.guards).toEqual([
      { type: 'nonempty-output' },
      { type: 'tasks-at-least', n: 2 },
    ])
  })
})
