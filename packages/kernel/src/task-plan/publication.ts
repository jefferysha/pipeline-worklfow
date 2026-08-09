import {
  prepareTaskPlanPublication,
  publishTaskPlanStateRevision,
  type PublishTaskPlanOptions,
} from '../state/task-plan-store.js'
import {
  beginNativeTaskPlanInvocation,
  completeNativeTaskPlanInvocation,
  failNativeTaskPlanInvocation,
} from '../skill-invocation/native-task-plan.js'
import type { TaskPlanReadModelV1, TaskPlanRevisionV1 } from './types.js'

export type { PublishTaskPlanOptions } from '../state/task-plan-store.js'

/** Public TaskPlan publication use case; native Skill lifecycle surrounds the state lock. */
export async function publishTaskPlanRevision(
  changeDir: string,
  revision: TaskPlanRevisionV1,
  options: PublishTaskPlanOptions,
): Promise<TaskPlanReadModelV1> {
  const prepared = prepareTaskPlanPublication(revision, options)
  const invocation = await beginNativeTaskPlanInvocation(changeDir, prepared.revision)
  try {
    const result = await publishTaskPlanStateRevision(changeDir, prepared, options)
    if (invocation !== undefined) await completeNativeTaskPlanInvocation(invocation, prepared.revision)
    return result
  } catch (error) {
    if (invocation !== undefined) await failNativeTaskPlanInvocation(invocation).catch(() => {})
    throw error
  }
}
