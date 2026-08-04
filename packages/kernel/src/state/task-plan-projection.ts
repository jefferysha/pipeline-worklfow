import { createHash } from 'node:crypto'
import { join } from 'node:path'
import {
  renderTaskPlanTasksMd,
  TASK_PLAN_LIMITS,
  toTaskPlanReadModelV1,
  type TaskPlanReadModelV1,
  type TaskPlanRevisionRecordV1,
} from '../task-plan/index.js'
import { atomicReplaceFile } from './atomic-publish.js'

export async function publishTaskPlanProjection(
  changeDir: string,
  revision: TaskPlanRevisionRecordV1,
  raw: string,
  completedWorkItemIds: readonly string[],
): Promise<TaskPlanReadModelV1> {
  const markdown = renderTaskPlanTasksMd(revision, {
    completed_work_item_ids: completedWorkItemIds,
    digest: `sha256:${createHash('sha256').update(raw).digest('hex')}`,
  })
  if (Buffer.byteLength(markdown) > TASK_PLAN_LIMITS.maxRevisionBytes) {
    return toTaskPlanReadModelV1(revision, {
      state: 'pending', reason: 'tasks.md projection exceeds the canonical byte budget',
    })
  }
  try {
    await atomicReplaceFile(join(changeDir, 'tasks.md'), markdown)
    return toTaskPlanReadModelV1(revision, { state: 'current' })
  } catch {
    return toTaskPlanReadModelV1(revision, {
      state: 'pending', reason: 'tasks.md projection publication failed',
    })
  }
}
