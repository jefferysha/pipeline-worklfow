import type {
  ExpectedOutputKind,
  ResourceAccess,
  ResourceKind,
  TaskPlanRevisionStatus,
  TaskValidatorKind,
} from './types.js'

/** Pure domain model. It deliberately carries no JSON, filesystem, codec, or persistence concerns. */
export interface TaskPlanCatalogItem {
  readonly id: string
  readonly title: string
}

export interface TaskPlanGroup {
  readonly id: string
  readonly title: string
  readonly parentId: string | null
  readonly workItemIds: readonly string[]
}

export interface TaskPlanResourceClaim {
  readonly kind: ResourceKind
  readonly access: ResourceAccess
  readonly key: string
}

export interface TaskPlanExpectedOutput {
  readonly id: string
  readonly kind: ExpectedOutputKind
  readonly ref: string
}

export interface TaskPlanValidator {
  readonly id: string
  readonly kind: TaskValidatorKind
  readonly version: 1
  readonly outputIds: readonly string[]
}

export interface TaskPlanWorkItem {
  readonly id: string
  readonly title: string
  readonly description?: string
  readonly groupId: string
  readonly requirementRefs: readonly string[]
  readonly acceptanceRefs: readonly string[]
  readonly dependsOn: readonly string[]
  readonly resourceClaims: readonly TaskPlanResourceClaim[]
  readonly expectedOutputs: readonly TaskPlanExpectedOutput[]
  readonly validators: readonly TaskPlanValidator[]
}

export interface TaskPlanAggregate {
  readonly schemaVersion: 'task-plan/v1'
  readonly planId: string
  readonly revisionId: string
  readonly revisionNumber: number
  readonly status: TaskPlanRevisionStatus
  readonly createdAt: string
  readonly requirements: readonly TaskPlanCatalogItem[]
  readonly acceptanceCriteria: readonly TaskPlanCatalogItem[]
  readonly groups: readonly TaskPlanGroup[]
  readonly workItems: readonly TaskPlanWorkItem[]
}

export interface TaskPlanAggregateEntityIdEntry {
  readonly id: string
  readonly path: string
}

export function taskPlanAggregateEntityIdEntries(
  value: TaskPlanAggregate,
): readonly TaskPlanAggregateEntityIdEntry[] {
  return [
    { id: value.planId, path: '$.plan_id' },
    { id: value.revisionId, path: '$.revision_id' },
    ...value.requirements.map((entry, index) => ({ id: entry.id, path: `$.requirements[${index}].id` })),
    ...value.acceptanceCriteria.map((entry, index) => ({
      id: entry.id, path: `$.acceptance_criteria[${index}].id`,
    })),
    ...value.groups.map((entry, index) => ({ id: entry.id, path: `$.groups[${index}].id` })),
    ...value.workItems.flatMap((item, index) => [
      { id: item.id, path: `$.work_items[${index}].id` },
      ...item.expectedOutputs.map((entry, outputIndex) => ({
        id: entry.id,
        path: `$.work_items[${index}].expected_outputs[${outputIndex}].id`,
      })),
      ...item.validators.map((entry, validatorIndex) => ({
        id: entry.id,
        path: `$.work_items[${index}].validators[${validatorIndex}].id`,
      })),
    ]),
  ]
}

export function freezeTaskPlanAggregate(aggregate: TaskPlanAggregate): TaskPlanAggregate {
  for (const value of aggregate.requirements) Object.freeze(value)
  for (const value of aggregate.acceptanceCriteria) Object.freeze(value)
  for (const group of aggregate.groups) {
    Object.freeze(group.workItemIds)
    Object.freeze(group)
  }
  for (const item of aggregate.workItems) {
    Object.freeze(item.requirementRefs)
    Object.freeze(item.acceptanceRefs)
    Object.freeze(item.dependsOn)
    for (const claim of item.resourceClaims) Object.freeze(claim)
    Object.freeze(item.resourceClaims)
    for (const output of item.expectedOutputs) Object.freeze(output)
    Object.freeze(item.expectedOutputs)
    for (const validator of item.validators) {
      Object.freeze(validator.outputIds)
      Object.freeze(validator)
    }
    Object.freeze(item.validators)
    Object.freeze(item)
  }
  Object.freeze(aggregate.requirements)
  Object.freeze(aggregate.acceptanceCriteria)
  Object.freeze(aggregate.groups)
  Object.freeze(aggregate.workItems)
  return Object.freeze(aggregate)
}
