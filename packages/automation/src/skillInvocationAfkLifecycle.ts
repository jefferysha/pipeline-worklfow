import {
  type DurableAfkSkillInvocationHandle,
  type VerifiedAfkInteractionReceipt,
} from '@tenon/kernel'
import {
  finishDurableAfkSkillInvocations,
  startDurableAfkSkillInvocations,
} from '../../kernel/dist/skill-invocation/producer-internal.js'
import type { PreparedExecutionContext } from './admission/execution-context.js'
import { canonicalAfkInteractionReceipts } from './skillInvocationAfkInteractionPolicy.js'

export type AfkSkillInvocationHandle = DurableAfkSkillInvocationHandle

export interface AfkSkillInvocationLifecycle {
  start(context: PreparedExecutionContext, recordedAt: string): Promise<readonly AfkSkillInvocationHandle[]>
  finish(handles: readonly AfkSkillInvocationHandle[]): Promise<void>
}

export interface AfkInteractionReceiptPort {
  verifiedReceiptsFor(context: PreparedExecutionContext): Promise<readonly VerifiedAfkInteractionReceipt[]>
}

export function createAfkSkillInvocationLifecycle(
  changeDirFor: (change: string) => string,
  interactionReceipts?: AfkInteractionReceiptPort,
): AfkSkillInvocationLifecycle {
  const start = async (context: PreparedExecutionContext, recordedAt: string) => {
    // Legacy AFK runs predate WorkflowRun identity and cannot mint v1 evidence. Preserve their
    // execution compatibility without inventing a binding; any context that declares a run id
    // enters the strict canonical path below and fails closed on absence or drift.
    if (context.preparedKind !== 'loop-bundle' || context.workflow_run_id === undefined) return []
    const changeDir = changeDirFor(context.change)
    const receipts = interactionReceipts === undefined
      ? await canonicalAfkInteractionReceipts(context, recordedAt)
      : await interactionReceipts.verifiedReceiptsFor(context)
    return startDurableAfkSkillInvocations(changeDir, context.reservation_id, receipts)
  }
  return {
    start,
    async finish(handles) {
      await finishDurableAfkSkillInvocations(handles)
    },
  }
}
