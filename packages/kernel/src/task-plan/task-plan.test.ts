import { describe, expect, it } from 'vitest'
import {
  decodeTaskPlanRevisionV1,
  encodeTaskPlanRevisionV1,
  toTaskPlanReadModelV1,
  validateTaskPlanRevisionV1,
  type TaskPlanRevisionV1,
} from './index.js'

function revision(overrides: Partial<TaskPlanRevisionV1> = {}): TaskPlanRevisionV1 {
  return {
    schema_version: 'task-plan/v1',
    plan_id: 'plan-opaque-1',
    revision_id: 'revision-opaque-1',
    revision_number: 1,
    status: 'frozen',
    created_at: '2026-08-03T09:00:00.000Z',
    requirements: [{ id: 'req-1', title: 'Stable task identities' }],
    acceptance_criteria: [{ id: 'acc-1', title: 'Identity survives reorder' }],
    groups: [{ id: 'group-1', title: 'Kernel', parent_id: null, work_item_ids: ['wi-a', 'wi-b'] }],
    work_items: [
      {
        id: 'wi-a',
        title: 'Define contract',
        group_id: 'group-1',
        requirement_refs: ['req-1'],
        acceptance_refs: ['acc-1'],
        depends_on: [],
        resource_claims: [{ kind: 'path', access: 'write', key: 'packages/kernel/src/task-plan/types.ts' }],
        expected_outputs: [{ id: 'out-a', kind: 'file', ref: 'packages/kernel/src/task-plan/types.ts' }],
        validators: [{ id: 'validator-a', kind: 'file-exists', version: 1, output_ids: ['out-a'] }],
      },
      {
        id: 'wi-b',
        title: 'Verify contract',
        group_id: 'group-1',
        requirement_refs: [],
        acceptance_refs: [],
        depends_on: ['wi-a'],
        resource_claims: [{ kind: 'path', access: 'write', key: 'packages/kernel/src/task-plan/types.ts' }],
        expected_outputs: [{ id: 'out-b', kind: 'artifact', ref: 'kernel-test-report' }],
        validators: [{ id: 'validator-b', kind: 'test-report', version: 1, output_ids: ['out-b'] }],
      },
    ],
    ...overrides,
  }
}

describe('TaskPlan v1 codec', () => {
  it('rejects line-breaking control characters before they can escape a Markdown projection', () => {
    const decoded = decodeTaskPlanRevisionV1(revision({
      work_items: revision().work_items.map((item, index) => index === 0
        ? { ...item, title: 'First line\n- [x] injected' }
        : item),
    }))
    expect(decoded.ok).toBe(false)
    if (decoded.ok) throw new Error('expected decode failure')
    expect(decoded.errors).toContainEqual({ code: 'control_character', path: '$.work_items[0].title' })
  })

  it('rejects path-like persistent identifiers', () => {
    for (const revisionId of ['../escaped', 'revision--comment-collision']) {
      const decoded = decodeTaskPlanRevisionV1(revision({ revision_id: revisionId }))
      expect(decoded.ok).toBe(false)
      if (decoded.ok) throw new Error('expected decode failure')
      expect(decoded.errors).toContainEqual({ code: 'identifier_invalid', path: '$.revision_id' })
    }
  })

  it('round-trips opaque IDs without deriving them from title, order, or group', () => {
    const original = revision()
    const decoded = decodeTaskPlanRevisionV1(encodeTaskPlanRevisionV1(original))
    expect(decoded).toEqual({ ok: true, value: original })
    if (!decoded.ok) throw new Error('expected decode success')

    const changed = revision({
      groups: [{ id: 'group-2', title: 'Moved', parent_id: null, work_item_ids: ['wi-b', 'wi-a'] }],
      work_items: [...decoded.value.work_items].reverse().map((item) => ({
        ...item,
        title: `Renamed ${item.title}`,
        group_id: 'group-2',
      })),
    })
    expect(changed.work_items.map((item) => item.id)).toEqual(['wi-b', 'wi-a'])
  })

  it('deep-freezes decoded input and does not retain caller references', () => {
    const raw = JSON.parse(JSON.stringify(revision())) as unknown
    const decoded = decodeTaskPlanRevisionV1(raw)
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) throw new Error('expected decode success')
    expect(Object.isFrozen(decoded.value)).toBe(true)
    expect(Object.isFrozen(decoded.value.work_items[0]?.resource_claims)).toBe(true)
  })

  it.each([
    ['future schema', { ...revision(), schema_version: 'task-plan/v2' }, 'schema_version'],
    ['unknown field', { ...revision(), surprise: true }, '$.surprise'],
    ['control character', { ...revision(), plan_id: 'bad\u0000id' }, '$.plan_id'],
    ['duplicate ID', { ...revision(), work_items: [revision().work_items[0], revision().work_items[0]] }, '$.work_items[1].id'],
  ])('rejects %s with bounded structured errors', (_label, input, expectedPath) => {
    const result = decodeTaskPlanRevisionV1(input)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected decode failure')
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors.length).toBeLessThanOrEqual(64)
    expect(result.errors.some((error) => error.path.includes(expectedPath))).toBe(true)
  })

  it('rejects oversized collections before iterating their contents', () => {
    const result = decodeTaskPlanRevisionV1({ ...revision(), groups: Array.from({ length: 257 }, () => null) })
    expect(result).toMatchObject({ ok: false, errors: [{ code: 'array_too_large', path: '$.groups' }] })
  })

  it('stops object decoding when nested relations exceed the global traversal budget', () => {
    const template = revision().work_items[0]!
    const workItems = Array.from({ length: 500 }, (_, index) => ({
      ...template,
      id: `wi-${index}`,
      depends_on: Array.from({ length: 128 }, () => 'wi-0'),
      expected_outputs: [],
      validators: [],
    }))
    const decoded = decodeTaskPlanRevisionV1(revision({ work_items: workItems }))
    expect(decoded.ok).toBe(false)
    if (decoded.ok) throw new Error('expected decode failure')
    expect(decoded.errors.map((entry) => entry.code)).toContain('document_too_large')
  })
})

describe('TaskPlan v1 validation and read projection', () => {
  it('reports complete coverage and dependency-serialized writers', () => {
    const result = validateTaskPlanRevisionV1(revision())
    expect(result.valid).toBe(true)
    expect(result.freezable).toBe(true)
    expect(result.coverage).toEqual({
      complete: true,
      requirements: [{ id: 'req-1', work_item_ids: ['wi-a'] }],
      acceptance_criteria: [{ id: 'acc-1', work_item_ids: ['wi-a'] }],
      uncovered_requirement_ids: [],
      uncovered_acceptance_ids: [],
    })
    expect(result.resources.conflicts).toEqual([])
    expect(result.resources.serialized).toEqual([{
      resource: 'path:packages/kernel/src/task-plan/types.ts',
      before_work_item_id: 'wi-a',
      after_work_item_id: 'wi-b',
    }])
  })

  it('does not invent dependency edges from group order', () => {
    const input = revision({
      work_items: revision().work_items.map((item) => ({
        ...item,
        depends_on: [],
        resource_claims: [],
      })),
    })
    const read = toTaskPlanReadModelV1(input, { state: 'current' })
    expect(read.requirements).toEqual([{ id: 'req-1', title: 'Stable task identities' }])
    expect(read.acceptance_criteria).toEqual([{ id: 'acc-1', title: 'Identity survives reorder' }])
    expect(read.dependencies.edges).toEqual([])
  })

  it('returns stable sorted issues for ownership, refs, cycles, and uncovered catalogs', () => {
    const input = revision({
      groups: [
        { id: 'group-1', title: 'One', parent_id: 'group-2', work_item_ids: ['wi-a', 'wi-b'] },
        { id: 'group-2', title: 'Two', parent_id: 'group-1', work_item_ids: ['wi-a'] },
      ],
      work_items: [
        { ...revision().work_items[0]!, requirement_refs: ['missing'], acceptance_refs: [], depends_on: ['wi-b'] },
        { ...revision().work_items[1]!, requirement_refs: [], acceptance_refs: [], depends_on: ['wi-a'] },
      ],
    })
    const first = validateTaskPlanRevisionV1(input)
    const second = validateTaskPlanRevisionV1(input)
    expect(first).toEqual(second)
    expect(first.valid).toBe(false)
    expect(first.freezable).toBe(false)
    expect(first.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'acceptance-uncovered',
      'dependency-cycle',
      'group-cycle',
      'requirement-ref-unknown',
      'requirement-uncovered',
      'work-item-multiple-groups',
    ]))
    expect(first.issues).toEqual([...first.issues].sort((left, right) =>
      `${left.code}\u0000${left.path}\u0000${left.related_ids.join('\u0000')}`
        .localeCompare(`${right.code}\u0000${right.path}\u0000${right.related_ids.join('\u0000')}`),
    ))
  })

  it('rejects unordered exact writer overlap but allows distinct exact resources', () => {
    const conflicting = revision({
      work_items: revision().work_items.map((item) => ({ ...item, depends_on: [] })),
    })
    expect(validateTaskPlanRevisionV1(conflicting).resources.conflicts).toEqual([{
      resource: 'path:packages/kernel/src/task-plan/types.ts',
      work_item_ids: ['wi-a', 'wi-b'],
    }])

    const distinct = revision({
      work_items: revision().work_items.map((item, index) => ({
        ...item,
        depends_on: [],
        resource_claims: [{ kind: 'logical', access: 'write', key: `task-plan/${index}` }],
      })),
    })
    expect(validateTaskPlanRevisionV1(distinct).resources.conflicts).toEqual([])
  })

  it('fails closed with bounded diagnostics when resource pairs exceed the analysis budget', () => {
    const template = revision().work_items[0]!
    const workItems = Array.from({ length: 92 }, (_, index) => ({
      ...template,
      id: `wi-${index}`,
      depends_on: [],
      expected_outputs: [{ id: `out-${index}`, kind: 'file' as const, ref: `out/${index}.json` }],
      validators: [{ id: `validator-${index}`, kind: 'file-exists' as const, version: 1 as const, output_ids: [`out-${index}`] }],
    }))
    const result = validateTaskPlanRevisionV1(revision({
      groups: [{ id: 'group-1', title: 'Kernel', parent_id: null, work_item_ids: workItems.map((item) => item.id) }],
      work_items: workItems,
    }))
    expect(result).toMatchObject({ valid: false, freezable: false, truncated: true })
    expect(result.issues.length).toBeLessThanOrEqual(256)
    expect(result.resources.conflicts.length).toBeLessThanOrEqual(4096)
    expect(result.issues.map((entry) => entry.code)).toContain('diagnostic-budget-exceeded')
  })

  it.each(['../secret', '/absolute', 'src//file.ts', 'src/./file.ts', 'src\\file.ts']) (
    'strictly rejects non-normal project-relative resource %s',
    (key) => {
      const input = JSON.parse(JSON.stringify(revision())) as Record<string, unknown>
      const workItems = input.work_items as Array<Record<string, unknown>>
      workItems[0]!.resource_claims = [{ kind: 'path', access: 'read', key }]
      const decoded = decodeTaskPlanRevisionV1(input)
      expect(decoded.ok).toBe(false)
      if (decoded.ok) throw new Error('expected decode failure')
      expect(decoded.errors.some((error) => error.code === 'resource_not_normalized')).toBe(true)
    },
  )

  it('rejects arbitrary command validators and unknown output references', () => {
    const raw = JSON.parse(JSON.stringify(revision())) as Record<string, unknown>
    const workItems = raw.work_items as Array<Record<string, unknown>>
    workItems[0]!.validators = [{
      id: 'validator-command',
      kind: 'command',
      version: 1,
      output_ids: ['unknown-output'],
      command: 'rm -rf .',
    }]
    const decoded = decodeTaskPlanRevisionV1(raw)
    expect(decoded.ok).toBe(false)
    if (decoded.ok) throw new Error('expected decode failure')
    expect(decoded.errors.map((error) => error.code)).toEqual(expect.arrayContaining(['enum_invalid', 'unknown_field']))

    const invalidRef = revision({
      work_items: revision().work_items.map((item, index) => index === 0
        ? { ...item, validators: [{ ...item.validators[0]!, output_ids: ['unknown-output'] }] }
        : item),
    })
    expect(validateTaskPlanRevisionV1(invalidRef).issues.map((issue) => issue.code)).toContain('validator-output-unknown')
  })

  it('only marks a valid frozen canonical revision schedulable', () => {
    expect(toTaskPlanReadModelV1(revision(), { state: 'current' }).schedulable).toBe(true)
    expect(toTaskPlanReadModelV1(revision({ status: 'draft' }), { state: 'current' }).schedulable).toBe(false)
  })
})
