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
  const requirements = revision.requirements.map((entry) => ({ ...entry }))
  const acceptanceCriteria = revision.acceptance_criteria.map((entry) => ({ ...entry }))
  const groups = revision.groups.map((group) => ({
    ...group,
    work_item_ids: [...group.work_item_ids],
  }))
  const items = revision.work_items.map((item) => ({
    ...item,
    requirement_refs: [...item.requirement_refs],
    acceptance_refs: [...item.acceptance_refs],
    depends_on: [...item.depends_on],
    resource_claims: item.resource_claims.map((claim) => ({ ...claim })),
    expected_outputs: item.expected_outputs.map((output) => ({ ...output })),
    validators: item.validators.map((validator) => ({
      ...validator,
      output_ids: [...validator.output_ids],
    })),
    identity_quality: 'canonical' as const,
  }))
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
    requirements,
    acceptance_criteria: acceptanceCriteria,
    groups,
    items,
    coverage: validation.coverage,
    dependencies: validation.dependencies,
    resources: validation.resources,
    projection: { ...projection },
  })
}
