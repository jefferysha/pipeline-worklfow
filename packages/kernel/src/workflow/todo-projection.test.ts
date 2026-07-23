import { describe, expect, it } from 'vitest'
import { DEFAULT_WORKFLOW_TODO_STAGES, projectPipelineTodo } from './todo-projection.js'

describe('projectPipelineTodo', () => {
  it('default 顺序来自 default.yaml 的生成步骤，并把带阶段标题的 OpenSpec checkbox 投影到对应阶段', () => {
    const todo = projectPipelineTodo({
      phase: 'build',
      tasksMarkdown: `# Tasks

## Open
- [x] Confirm the scope

## 实现
- [ ] Implement the API

## Verify
- [ ] Run browser acceptance
`,
    })

    expect(DEFAULT_WORKFLOW_TODO_STAGES.map((stage) => stage.id)).toEqual(
      ['open', 'explore', 'spec', 'build', 'verify', 'ship', 'archive'],
    )
    expect(todo.stages.map((stage) => stage.label)).toEqual(['立项', '调研', '规格', '实现', '验证', '交付', '归档'])
    expect(todo.stages.map((stage) => stage.status)).toEqual(['done', 'done', 'done', 'current', 'pending', 'pending', 'pending'])
    expect(todo.stages[0]?.tasks).toEqual([{ text: 'Confirm the scope', completed: true }])
    expect(todo.stages[3]?.tasks).toEqual([{ text: 'Implement the API', completed: false }])
    expect(todo.stages[4]?.tasks).toEqual([{ text: 'Run browser acceptance', completed: false }])
  })

  it('没有可识别阶段标题的 checkbox 不消失，而是归到当前 phase', () => {
    const todo = projectPipelineTodo({
      phase: 'explore',
      tasksMarkdown: `# Tasks

## Notes
- [ ] Investigate the current implementation
`,
    })
    expect(todo.stages.find((stage) => stage.id === 'explore')?.tasks).toEqual([
      { text: 'Investigate the current implementation', completed: false },
    ])
  })

  it('custom workflow 可传自己的有序阶段，不错误展示 default 七步', () => {
    const todo = projectPipelineTodo({
      phase: 'review',
      stages: [{ id: 'draft', label: 'Draft' }, { id: 'review', label: 'Review' }],
      tasksMarkdown: '## Review\n- [x] Review the proposal\n',
    })
    expect(todo.stages).toEqual([
      { id: 'draft', label: 'Draft', status: 'done', tasks: [] },
      { id: 'review', label: 'Review', status: 'current', tasks: [{ text: 'Review the proposal', completed: true }] },
    ])
  })
})
