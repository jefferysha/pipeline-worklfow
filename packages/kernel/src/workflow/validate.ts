import type { WorkflowDef } from './types.js'

function detectCycle(skillIds: string[], dependsOn: Map<string, string[]>): string[] {
  const WHITE = 0, GRAY = 1, BLACK = 2
  const color = new Map(skillIds.map((id) => [id, WHITE]))
  const errors: string[] = []

  function visit(id: string, path: string[]): void {
    color.set(id, GRAY)
    for (const dep of dependsOn.get(id) ?? []) {
      if (color.get(dep) === GRAY) {
        errors.push(`循环依赖：${[...path, id, dep].join(' -> ')}`)
        continue
      }
      if (color.get(dep) === WHITE) visit(dep, [...path, id])
    }
    color.set(id, BLACK)
  }

  for (const id of skillIds) {
    if (color.get(id) === WHITE) visit(id, [])
  }
  return errors
}

export function validateWorkflow(wf: WorkflowDef): string[] {
  const errors: string[] = []
  const producedByEarlierStep = new Set<string>()
  const allStepIds = new Set(wf.steps.map((s) => s.id))

  wf.steps.forEach((step, index) => {
    const skillIds = step.skills.map((s) => s.id)
    const dependsOn = new Map(step.skills.map((s) => [s.id, [...(s.depends_on ?? [])]]))

    for (const skill of step.skills) {
      for (const dep of skill.depends_on ?? []) {
        if (!skillIds.includes(dep)) {
          errors.push(`step '${step.id}' 的 skill '${skill.id}' 依赖了同 step 内不存在的 '${dep}'`)
        }
      }
    }
    errors.push(...detectCycle(skillIds, dependsOn).map((e) => `step '${step.id}': ${e}`))

    for (const input of step.inputs) {
      if (!producedByEarlierStep.has(input.field)) {
        errors.push(`step '${step.id}' 的 inputs 字段 '${input.field}' 不对应任何更早 step 的 outputs`)
      }
    }
    for (const output of step.outputs) producedByEarlierStep.add(output.field)

    // 每条 transition 的 to 必须指向同一 workflow 里真实存在的 step id——否则
    // pipeline transition 在真运行时才会发现走不到，属于本该在保存时就拦下的错误。
    for (const t of step.transitions) {
      if (!allStepIds.has(t.to)) {
        errors.push(`step '${step.id}' 的 transitions 里 event '${t.event}' 的 to '${t.to}' 不存在`)
      }
    }

    // 只有数组里最后一个 step 允许零 transitions（视为终态，如 archive）；中间任何一个
    // step 零 transitions 意味着一旦真运行到这一步就再也走不出去，是配置错误而非合法终态，
    // 保存时就该拦，不能留到用户真跑 transition 命令时才发现卡死。
    const isLastStep = index === wf.steps.length - 1
    if (!isLastStep && step.transitions.length === 0) {
      errors.push(`step '${step.id}' 没有声明任何 transitions（不是最后一个 step，会导致走进死路）`)
    }
  })

  return errors
}
