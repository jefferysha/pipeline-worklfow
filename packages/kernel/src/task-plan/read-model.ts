import { deepFreeze } from './internal.js'
import { validateTaskPlanRevisionV1 } from './validation.js'
import {
  TASK_PLAN_READ_SCHEMA_VERSION,
  type CanonicalTaskPlanReadModelV1,
  type TaskPlanProjectionStatus,
  type TaskPlanRevisionV1,
} from './types.js'

export function toTaskPlanReadModelV1(
  revision: TaskPlanRevisionV1,
  projection: TaskPlanProjectionStatus,
): CanonicalTaskPlanReadModelV1 {
  const validation = validateTaskPlanRevisionV1(revision)
  return deepFreeze({
    schema_version: TASK_PLAN_READ_SCHEMA_VERSION,
    source: 'canonical',
    schedulable: revision.status === 'frozen' && validation.valid,
    plan_id: revision.plan_id,
    revision_id: revision.revision_id,
    revision_number: revision.revision_number,
    revision_status: revision.status,
    validation,
    completeness: { state: validation.coverage.complete ? 'complete' : 'incomplete' },
    requirements: revision.requirements,
    acceptance_criteria: revision.acceptance_criteria,
    groups: revision.groups,
    items: revision.work_items.map((item) => ({ ...item, identity_quality: 'canonical' as const })),
    coverage: validation.coverage,
    dependencies: validation.dependencies,
    resources: validation.resources,
    projection,
  })
}
