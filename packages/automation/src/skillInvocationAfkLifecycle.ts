import {
  AfkSkillInvocationProofError,
  finishDurableAfkSkillInvocations,
  startDurableAfkSkillInvocations,
  type DurableAfkSkillInvocationHandle,
} from '@tenon/kernel'
import type { PreparedExecutionContext } from './admission/execution-context.js'

export type AfkSkillInvocationHandle = DurableAfkSkillInvocationHandle

export interface AfkSkillInvocationLifecycle {
  start(context: PreparedExecutionContext, recordedAt: string): Promise<readonly AfkSkillInvocationHandle[]>
  finish(handles: readonly AfkSkillInvocationHandle[]): Promise<void>
}

export function createAfkSkillInvocationLifecycle(
  changeDirFor: (change: string) => string,
): AfkSkillInvocationLifecycle {
  const start = async (context: PreparedExecutionContext, _recordedAt: string) => {
    // Legacy AFK runs predate WorkflowRun identity and cannot mint v1 evidence. Preserve their
    // execution compatibility without inventing a binding; any context that declares a run id
    // enters the strict canonical path below and fails closed on absence or drift.
    if (context.preparedKind !== 'loop-bundle' || context.workflow_run_id === undefined) return []
    const changeDir = changeDirFor(context.change)
    try {
      return await startDurableAfkSkillInvocations(changeDir, context.reservation_id)
    } catch (error) {
      if (error instanceof AfkSkillInvocationProofError
        && error.message === 'canonical WorkflowRun StepVisit identity is missing') return []
      throw error
    }
  }
  return {
    start,
    async finish(handles) {
      await finishDurableAfkSkillInvocations(handles)
    },
  }
}
