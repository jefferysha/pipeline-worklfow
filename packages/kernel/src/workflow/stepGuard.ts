import type { StepDef } from './types.js'
import type { PipelineState, FieldName } from '../types.js'

export interface StepGuardContext {
  readonly changeDirAbs: string
}

export interface GuardResult {
  readonly pass: boolean
  readonly failures: string[]
}

function scalar(v: string | string[] | undefined): string {
  return typeof v === 'string' ? v : ''
}

export function evaluateStepGuards(state: PipelineState, step: StepDef, _ctx: StepGuardContext): GuardResult {
  const failures: string[] = []

  for (const guard of step.guards) {
    if (guard.type === 'nonempty-output') {
      for (const output of step.outputs) {
        const v = scalar(state.fields[output.field as FieldName])
        if (!v || v === 'null') {
          failures.push(`字段 '${output.field}' 未设置（step '${step.id}' 声明为必须产出）`)
        }
      }
    }
    if (guard.type === 'tasks-at-least') {
      // TODO（实现时先读 packages/kernel/src/flow/guard.ts 抽出任务计数纯函数并在此复用，
      // 不要重新实现一份不同的计数逻辑）：
      failures.push(`guard 'tasks-at-least' 暂未实现（需复用 packages/kernel/src/flow/guard.ts 的任务计数逻辑）`)
    }
  }

  return { pass: failures.length === 0, failures }
}
