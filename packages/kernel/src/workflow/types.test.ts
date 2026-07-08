import { describe, expect, it } from 'vitest'
import type { WorkflowDef } from './types.js'

describe('WorkflowDef 类型形状', () => {
  it('一个真实构造的 workflow 对象应该类型检查通过（编译期断言，运行时只做 truthy 检查）', () => {
    const wf: WorkflowDef = {
      name: 'default',
      steps: [
        {
          id: 'explore',
          label: '调研',
          gate: 'review',
          skills: [
            { id: 'superpowers:brainstorming' },
            { id: 'opsx:explore', depends_on: ['superpowers:brainstorming'] },
          ],
          inputs: [],
          outputs: [{ field: 'design_doc', type: 'file_path' }],
          guards: [],
          transitions: [{ event: 'complete', to: 'spec' }],
        },
        {
          id: 'verify',
          label: '验证',
          gate: 'review',
          skills: [],
          inputs: [],
          outputs: [],
          guards: [],
          // 分支：同一个 step 按不同 event 名走向不同的下一个 step（对齐现有 default workflow
          // verify-pass→ship / verify-fail→build 这种真实分支需求，不是纯线性链）。
          transitions: [
            { event: 'pass', to: 'ship' },
            { event: 'fail', to: 'build' },
          ],
        },
      ],
    }
    expect(wf.steps[0]?.id).toBe('explore')
    expect(wf.steps[0]?.skills[1]?.depends_on).toEqual(['superpowers:brainstorming'])
    expect(wf.steps[1]?.transitions).toHaveLength(2)
  })
})
