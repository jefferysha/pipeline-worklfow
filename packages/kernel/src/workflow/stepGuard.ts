import { readFileSync } from 'node:fs'
import path from 'node:path'
import { taskCount } from '../flow/guard.js'
import type { StepDef } from './types.js'
import type { PipelineState, FieldName, GuardResult } from '../types.js'

export interface StepGuardContext {
  readonly changeDirAbs: string
}

export type { GuardResult } from '../types.js'

function scalar(v: string | string[] | undefined): string {
  return typeof v === 'string' ? v : ''
}

/** 读 <changeDirAbs>/tasks.md 原文；缺失/不可读 → undefined（taskCount 视作 0 个任务，与 flow/guard.ts 同语义）。 */
function readTasksMd(changeDirAbs: string): string | undefined {
  try {
    return readFileSync(path.join(changeDirAbs, 'tasks.md'), 'utf8')
  } catch {
    return undefined
  }
}

export function evaluateStepGuards(state: PipelineState, step: StepDef, ctx: StepGuardContext): GuardResult {
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
      // 复用 flow/guard.ts 的 taskCount 纯函数（单一真相源），据注入的 changeDirAbs 读 tasks.md 真实计数。
      const count = taskCount(readTasksMd(ctx.changeDirAbs))
      if (count < guard.n) {
        failures.push(`step '${step.id}' 要求 tasks.md 至少 ${guard.n} 个任务（当前=${count}）`)
      }
    }
  }

  return { pass: failures.length === 0, failures }
}
