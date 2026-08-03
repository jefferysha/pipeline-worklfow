import { decodeTaskPlanRevisionV1, encodeTaskPlanRevisionV1 } from './codec.js'
import { freezeTaskPlanAggregate, type TaskPlanAggregate } from './domain.js'
import type {
  ExpectedOutputKind,
  ResourceAccess,
  ResourceKind,
  TaskPlanRevisionStatus,
  TaskPlanCodecError,
  TaskPlanRevisionV1,
  TaskValidatorKind,
} from './types.js'

export interface TaskPlanCatalogRecordV1 {
  readonly id: string
  readonly title: string
}

export interface TaskPlanGroupRecordV1 {
  readonly id: string
  readonly title: string
  readonly parent_id: string | null
  readonly work_item_ids: readonly string[]
}

export interface TaskPlanResourceClaimRecordV1 {
  readonly kind: ResourceKind
  readonly access: ResourceAccess
  readonly key: string
}

export interface TaskPlanExpectedOutputRecordV1 {
  readonly id: string
  readonly kind: ExpectedOutputKind
  readonly ref: string
}

export interface TaskPlanValidatorRecordV1 {
  readonly id: string
  readonly kind: TaskValidatorKind
  readonly version: 1
  readonly output_ids: readonly string[]
}

export interface TaskPlanWorkItemRecordV1 {
  readonly id: string
  readonly title: string
  readonly description?: string
  readonly group_id: string
  readonly requirement_refs: readonly string[]
  readonly acceptance_refs: readonly string[]
  readonly depends_on: readonly string[]
  readonly resource_claims: readonly TaskPlanResourceClaimRecordV1[]
  readonly expected_outputs: readonly TaskPlanExpectedOutputRecordV1[]
  readonly validators: readonly TaskPlanValidatorRecordV1[]
}

/** Exact on-disk task-plan/v1 record. Public DTO compatibility is maintained by explicit adapters. */
export interface TaskPlanRevisionRecordV1 {
  readonly schema_version: 'task-plan/v1'
  readonly plan_id: string
  readonly revision_id: string
  readonly revision_number: number
  readonly status: TaskPlanRevisionStatus
  readonly created_at: string
  readonly requirements: readonly TaskPlanCatalogRecordV1[]
  readonly acceptance_criteria: readonly TaskPlanCatalogRecordV1[]
  readonly groups: readonly TaskPlanGroupRecordV1[]
  readonly work_items: readonly TaskPlanWorkItemRecordV1[]
}

export type TaskPlanRecordDecodeResultV1 =
  | { readonly ok: true; readonly value: TaskPlanRevisionRecordV1 }
  | { readonly ok: false; readonly errors: readonly TaskPlanCodecError[]; readonly overflow: boolean }

/** Persistence codec. The public DTO codec remains a compatibility surface with the same wire JSON. */
export function decodeTaskPlanRevisionRecordV1(input: string | unknown): TaskPlanRecordDecodeResultV1 {
  const decoded = decodeTaskPlanRevisionV1(input)
  return decoded.ok ? { ok: true, value: decoded.value } : decoded
}

export function encodeTaskPlanRevisionRecordV1(record: TaskPlanRevisionRecordV1): string {
  return encodeTaskPlanRevisionV1(record)
}

export function taskPlanRecordToDomain(record: TaskPlanRevisionRecordV1): TaskPlanAggregate {
  return freezeTaskPlanAggregate({
    schemaVersion: record.schema_version,
    planId: record.plan_id,
    revisionId: record.revision_id,
    revisionNumber: record.revision_number,
    status: record.status,
    createdAt: record.created_at,
    requirements: record.requirements.map((entry) => ({ ...entry })),
    acceptanceCriteria: record.acceptance_criteria.map((entry) => ({ ...entry })),
    groups: record.groups.map((group) => ({
      id: group.id,
      title: group.title,
      parentId: group.parent_id,
      workItemIds: [...group.work_item_ids],
    })),
    workItems: record.work_items.map((item) => ({
      id: item.id,
      title: item.title,
      ...(item.description === undefined ? {} : { description: item.description }),
      groupId: item.group_id,
      requirementRefs: [...item.requirement_refs],
      acceptanceRefs: [...item.acceptance_refs],
      dependsOn: [...item.depends_on],
      resourceClaims: item.resource_claims.map((claim) => ({ ...claim })),
      expectedOutputs: item.expected_outputs.map((output) => ({ ...output })),
      validators: item.validators.map((validator) => ({
        id: validator.id,
        kind: validator.kind,
        version: validator.version,
        outputIds: [...validator.output_ids],
      })),
    })),
  })
}

export function taskPlanDomainToRecord(aggregate: TaskPlanAggregate): TaskPlanRevisionRecordV1 {
  return {
    schema_version: aggregate.schemaVersion,
    plan_id: aggregate.planId,
    revision_id: aggregate.revisionId,
    revision_number: aggregate.revisionNumber,
    status: aggregate.status,
    created_at: aggregate.createdAt,
    requirements: aggregate.requirements.map((entry) => ({ ...entry })),
    acceptance_criteria: aggregate.acceptanceCriteria.map((entry) => ({ ...entry })),
    groups: aggregate.groups.map((group) => ({
      id: group.id,
      title: group.title,
      parent_id: group.parentId,
      work_item_ids: [...group.workItemIds],
    })),
    work_items: aggregate.workItems.map((item) => ({
      id: item.id,
      title: item.title,
      ...(item.description === undefined ? {} : { description: item.description }),
      group_id: item.groupId,
      requirement_refs: [...item.requirementRefs],
      acceptance_refs: [...item.acceptanceRefs],
      depends_on: [...item.dependsOn],
      resource_claims: item.resourceClaims.map((claim) => ({ ...claim })),
      expected_outputs: item.expectedOutputs.map((output) => ({ ...output })),
      validators: item.validators.map((validator) => ({
        id: validator.id,
        kind: validator.kind,
        version: validator.version,
        output_ids: [...validator.outputIds],
      })),
    })),
  }
}

export function taskPlanDtoToDomain(dto: TaskPlanRevisionV1): TaskPlanAggregate {
  return taskPlanRecordToDomain(dto)
}

export function taskPlanDomainToDto(aggregate: TaskPlanAggregate): TaskPlanRevisionV1 {
  return taskPlanDomainToRecord(aggregate)
}
