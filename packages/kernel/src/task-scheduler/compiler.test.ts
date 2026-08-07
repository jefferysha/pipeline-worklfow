import { describe, expect, it } from 'vitest'
import type { TaskPlanRevisionV1, WorkItemV1 } from '../task-plan/index.js'
import { compileTaskSchedule } from './compiler.js'

function item(id: string, dependsOn: readonly string[] = []): WorkItemV1 {
  return {
    id,
    title: id,
    group_id: 'root',
    requirement_refs: ['req'],
    acceptance_refs: ['accept'],
    depends_on: dependsOn,
    resource_claims: [],
    expected_outputs: [],
    validators: [],
  }
}

function withClaim(
  workItem: WorkItemV1,
  access: 'read' | 'write',
  key: string,
): WorkItemV1 {
  return { ...workItem, resource_claims: [{ kind: 'path', access, key }] }
}

function plan(workItems: readonly WorkItemV1[]): TaskPlanRevisionV1 {
  return {
    schema_version: 'task-plan/v1',
    plan_id: 'plan',
    revision_id: 'revision',
    revision_number: 1,
    status: 'frozen',
    created_at: '2026-08-04T00:00:00.000Z',
    requirements: [{ id: 'req', title: 'Requirement' }],
    acceptance_criteria: [{ id: 'accept', title: 'Acceptance' }],
    groups: [{ id: 'root', title: 'Root', parent_id: null, work_item_ids: workItems.map(({ id }) => id) }],
    work_items: workItems,
  }
}

describe('compileTaskSchedule', () => {
  it('places independent items in one stable wave', () => {
    const result = compileTaskSchedule(plan([item('b'), item('a')]))

    expect(result.valid).toBe(true)
    expect(result.waves).toEqual([{ index: 0, work_item_ids: ['a', 'b'], parallelism: 2 }])
  })

  it('derives waves only from explicit depends_on edges', () => {
    const result = compileTaskSchedule(plan([item('child', ['parent']), item('parent')]))

    expect(result.valid).toBe(true)
    expect(result.waves).toEqual([
      { index: 0, work_item_ids: ['parent'], parallelism: 1 },
      { index: 1, work_item_ids: ['child'], parallelism: 1 },
    ])
  })

  it('fails closed for an unknown dependency target', () => {
    const result = compileTaskSchedule(plan([item('child', ['missing'])]))

    expect(result.valid).toBe(false)
    expect(result.blockers).toMatchObject([{ code: 'DEPENDENCY_UNKNOWN' }])
    expect(result.waves).toEqual([])
  })

  it('fails closed for a dependency cycle', () => {
    const result = compileTaskSchedule(plan([
      item('a', ['b']), item('b', ['a']), item('downstream', ['a']),
    ]))

    expect(result.valid).toBe(false)
    expect(result.blockers).toMatchObject([{ code: 'DEPENDENCY_CYCLE', work_item_ids: ['a', 'b'] }])
  })

  it('serializes same-resource writers by stable WorkItem id', () => {
    const result = compileTaskSchedule(plan([
      withClaim(item('b'), 'write', 'src/shared.ts'),
      withClaim(item('a'), 'write', 'src/shared.ts'),
    ]))

    expect(result.valid).toBe(true)
    expect(result.waves).toEqual([
      { index: 0, work_item_ids: ['a'], parallelism: 1 },
      { index: 1, work_item_ids: ['b'], parallelism: 1 },
    ])
    expect(result.serialized_resource_conflicts).toEqual([{
      resource: 'path:src/shared.ts',
      before_work_item_id: 'a',
      after_work_item_id: 'b',
    }])
  })

  it('keeps same-resource readers parallel', () => {
    const result = compileTaskSchedule(plan([
      withClaim(item('b'), 'read', 'src/shared.ts'),
      withClaim(item('a'), 'read', 'src/shared.ts'),
    ]))

    expect(result.waves).toEqual([{ index: 0, work_item_ids: ['a', 'b'], parallelism: 2 }])
    expect(result.serialized_resource_conflicts).toEqual([])
  })
})
