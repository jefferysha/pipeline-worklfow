import { describe, expect, it } from 'vitest'
import {
  decodeTaskPlanRevisionRecordV1,
  encodeTaskPlanRevisionRecordV1,
  taskPlanDomainToDto,
  taskPlanDomainToRecord,
  taskPlanDtoToDomain,
  taskPlanRecordToDomain,
  validateTaskPlanAggregate,
  type TaskPlanRevisionV1,
} from './index.js'

function revision(): TaskPlanRevisionV1 {
  return {
    schema_version: 'task-plan/v1',
    plan_id: 'plan-1',
    revision_id: 'revision-1',
    revision_number: 1,
    status: 'frozen',
    created_at: '2026-08-04T00:00:00.000Z',
    requirements: [{ id: 'req-1', title: 'Explicit domain boundary' }],
    acceptance_criteria: [{ id: 'acc-1', title: 'Stable compatibility DTO' }],
    groups: [{ id: 'group-1', title: 'Build', parent_id: null, work_item_ids: ['item-1'] }],
    work_items: [{
      id: 'item-1',
      title: 'Separate model and record',
      group_id: 'group-1',
      requirement_refs: ['req-1'],
      acceptance_refs: ['acc-1'],
      depends_on: [],
      resource_claims: [{ kind: 'path', access: 'write', key: 'packages/kernel' }],
      expected_outputs: [{ id: 'out-1', kind: 'file', ref: 'packages/kernel/result.json' }],
      validators: [{ id: 'validator-1', kind: 'file-exists', version: 1, output_ids: ['out-1'] }],
    }],
  }
}

describe('TaskPlan domain and persistence boundary', () => {
  it('maps the public snake_case DTO through a camelCase aggregate and explicit record without wire drift', () => {
    const dto = revision()
    const aggregate = taskPlanDtoToDomain(dto)

    expect(aggregate).toMatchObject({
      schemaVersion: 'task-plan/v1',
      planId: 'plan-1',
      revisionId: 'revision-1',
      revisionNumber: 1,
      createdAt: '2026-08-04T00:00:00.000Z',
      groups: [{ parentId: null, workItemIds: ['item-1'] }],
      workItems: [{ groupId: 'group-1', requirementRefs: ['req-1'], acceptanceRefs: ['acc-1'] }],
    })
    expect(aggregate).not.toHaveProperty('plan_id')
    expect(aggregate.workItems[0]).not.toHaveProperty('group_id')
    expect(Object.isFrozen(aggregate)).toBe(true)
    expect(Object.isFrozen(aggregate.workItems[0]?.validators[0]?.outputIds)).toBe(true)

    const record = taskPlanDomainToRecord(aggregate)
    expect(record).toEqual(dto)
    expect(record).toHaveProperty('plan_id', 'plan-1')
    expect(record).not.toHaveProperty('planId')
    expect(taskPlanRecordToDomain(record)).toEqual(aggregate)
    expect(taskPlanDomainToDto(aggregate)).toEqual(dto)
    expect(decodeTaskPlanRevisionRecordV1(encodeTaskPlanRevisionRecordV1(record)))
      .toEqual({ ok: true, value: dto })
  })

  it('evaluates graph invariants on the aggregate without a persistence record', () => {
    const valid = taskPlanDtoToDomain(revision())
    expect(validateTaskPlanAggregate(valid)).toMatchObject({ valid: true, freezable: true })

    const invalid = {
      ...valid,
      workItems: valid.workItems.map((item) => ({ ...item, requirementRefs: ['missing-requirement'] })),
    }
    expect(validateTaskPlanAggregate(invalid)).toMatchObject({ valid: false, freezable: false })
    expect(validateTaskPlanAggregate(invalid).issues.map((issue) => issue.code))
      .toContain('requirement-ref-unknown')
  })
})
