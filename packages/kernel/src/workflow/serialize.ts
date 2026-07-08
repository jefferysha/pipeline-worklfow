/**
 * workflow 定义文件序列化——`parseWorkflow`（parse.ts）的反向操作。往返等价
 * （`parseWorkflow(serializeWorkflow(wf))` 深度等于 `wf`）是唯一正确性判据，
 * 不是字面字符串匹配；字段/缩进写法逐条对齐 parse.ts 的读入期望，改动前先读一遍
 * parse.ts 各 parse*Block 函数确认没有漂移。
 */
import type { FieldRef, GuardConfig, SkillRef, StepDef, StepTransition, WorkflowDef } from './types.js'

function serializeSkill(s: SkillRef): string[] {
  const lines = [`      - id: ${s.id}`]
  if (s.depends_on && s.depends_on.length > 0) {
    lines.push(`        depends_on: [${s.depends_on.join(', ')}]`)
  }
  return lines
}

function serializeFieldRef(r: FieldRef): string[] {
  return [`      - field: ${r.field}`, `        type: ${r.type}`]
}

function serializeGuard(g: GuardConfig): string[] {
  if (g.type === 'tasks-at-least') {
    return [`      - type: tasks-at-least`, `        n: ${g.n}`]
  }
  return [`      - type: nonempty-output`]
}

function serializeTransition(t: StepTransition): string[] {
  return [`      - event: ${t.event}`, `        to: ${t.to}`]
}

function serializeBlockField<T>(name: string, items: readonly T[], each: (item: T) => string[]): string[] {
  if (items.length === 0) return [`    ${name}: []`]
  return [`    ${name}:`, ...items.flatMap(each)]
}

function serializeStep(step: StepDef): string[] {
  const lines = [`  - id: ${step.id}`]
  if (step.label !== '') lines.push(`    label: ${step.label}`)
  lines.push(`    gate: ${step.gate ?? 'null'}`)
  lines.push(...serializeBlockField('skills', step.skills, serializeSkill))
  lines.push(...serializeBlockField('inputs', step.inputs, serializeFieldRef))
  lines.push(...serializeBlockField('outputs', step.outputs, serializeFieldRef))
  lines.push(...serializeBlockField('guards', step.guards, serializeGuard))
  lines.push(...serializeBlockField('transitions', step.transitions, serializeTransition))
  return lines
}

export function serializeWorkflow(wf: WorkflowDef): string {
  const lines = [`name: ${wf.name}`, 'steps:', ...wf.steps.flatMap(serializeStep)]
  return lines.join('\n') + '\n'
}
