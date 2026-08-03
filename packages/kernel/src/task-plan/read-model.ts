import { decodeTaskPlanRevisionV1 } from './codec.js'
import { deepFreeze } from './internal.js'
import { validateTaskPlanRevisionV1 } from './validation.js'
import {
  TASK_PLAN_READ_SCHEMA_VERSION,
  type CanonicalTaskPlanReadModelV1,
  type TaskPlanCodecErrorCode,
  type TaskPlanProjectionStatus,
  type TaskPlanRevisionV1,
} from './types.js'

const UNPROJECTABLE_CODEC_ERRORS = new Set<TaskPlanCodecErrorCode>([
  'array_invalid',
  'array_too_large',
  'document_too_large',
  'field_required',
  'field_type',
  'json_invalid',
  'object_invalid',
])

export function toTaskPlanReadModelV1(
  revision: TaskPlanRevisionV1,
  projection: TaskPlanProjectionStatus,
): CanonicalTaskPlanReadModelV1 {
  const decoded = decodeTaskPlanRevisionV1(revision)
  if (!decoded.ok) {
    const structuralError = decoded.errors.find((entry) => UNPROJECTABLE_CODEC_ERRORS.has(entry.code))
    if (decoded.overflow || structuralError !== undefined) {
      throw new TypeError(
        `TaskPlan revision cannot be projected at ${structuralError?.path ?? '$'}${
          structuralError === undefined ? '' : `: ${structuralError.code}`
        }`,
      )
    }
  }
  const projectedRevision = decoded.ok ? decoded.value : revision
  const validation = validateTaskPlanRevisionV1(projectedRevision)
  const requirements = projectedRevision.requirements.map((entry) => ({ ...entry }))
  const acceptanceCriteria = projectedRevision.acceptance_criteria.map((entry) => ({ ...entry }))
  const groups = projectedRevision.groups.map((group) => ({
    ...group,
    work_item_ids: [...group.work_item_ids],
  }))
  const items = projectedRevision.work_items.map((item) => ({
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
    schedulable: projectedRevision.status === 'frozen' && validation.valid,
    plan_id: projectedRevision.plan_id,
    revision_id: projectedRevision.revision_id,
    revision_number: projectedRevision.revision_number,
    revision_status: projectedRevision.status,
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
