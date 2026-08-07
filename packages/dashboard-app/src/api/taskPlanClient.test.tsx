import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  decodeTaskPlanReadModel,
  fetchTaskPlan,
  MAX_TASK_PLAN_CATALOG_ENTRIES,
  MAX_TASK_PLAN_DIAGNOSTIC_ENTRIES,
  MAX_TASK_PLAN_VALIDATION_ISSUES,
  MAX_TASK_PLAN_WORK_ITEMS,
  TaskPlanApiError,
} from './taskPlanClient'

const coverage = {
  complete: true,
  requirements: [{ id: 'req-1', work_item_ids: ['wi-1'] }],
  acceptance_criteria: [{ id: 'acc-1', work_item_ids: ['wi-1'] }],
  uncovered_requirement_ids: [],
  uncovered_acceptance_ids: [],
}

const dependencies = {
  edges: [{ from_work_item_id: 'wi-1', to_work_item_id: 'wi-2' }],
  cyclic_work_item_ids: [],
}

const resources = {
  conflicts: [],
  serialized: [{
    resource: 'path:packages/demo.ts',
    before_work_item_id: 'wi-1',
    after_work_item_id: 'wi-2',
  }],
}

const canonical = {
  schema_version: 'task-plan-read/v1',
  source: 'canonical',
  schedulable: true,
  plan_id: 'plan-1',
  revision_id: 'revision-1',
  revision_number: 1,
  fingerprint: `sha256:${'a'.repeat(64)}`,
  revision_status: 'frozen',
  validation: {
    valid: true,
    freezable: true,
    truncated: false,
    issues: [],
    coverage,
    dependencies,
    resources,
  },
  completeness: { state: 'complete' },
  requirements: [{ id: 'req-1', title: 'Stable task identity' }],
  acceptance_criteria: [{ id: 'acc-1', title: 'Dashboard can render the plan' }],
  groups: [{ id: 'group-1', title: 'Build', parent_id: null, work_item_ids: ['wi-1', 'wi-2'] }],
  items: [
    {
      id: 'wi-1',
      identity_quality: 'canonical',
      title: 'Implement the decoder',
      description: 'Validate the server projection at the Dashboard boundary.',
      group_id: 'group-1',
      requirement_refs: ['req-1'],
      acceptance_refs: ['acc-1'],
      depends_on: [],
      resource_claims: [{ kind: 'path', access: 'write', key: 'packages/demo.ts' }],
      expected_outputs: [{ id: 'out-1', kind: 'file', ref: 'packages/demo.md' }],
      validators: [{ id: 'validator-1', kind: 'file-exists', version: 1, output_ids: ['out-1'] }],
    },
    {
      id: 'wi-2',
      identity_quality: 'canonical',
      title: 'Verify the client',
      group_id: 'group-1',
      requirement_refs: [],
      acceptance_refs: [],
      depends_on: ['wi-1'],
      resource_claims: [],
      expected_outputs: [],
      validators: [],
    },
  ],
  coverage,
  dependencies,
  resources,
  projection: { state: 'current' },
}

const legacy = {
  schema_version: 'task-plan-read/v1',
  source: 'legacy',
  schedulable: false,
  groups: [],
  items: [
    {
      id: 'legacy-display-0001',
      identity_quality: 'legacy-derived',
      title: 'Read the existing task list',
      stage: 'Explore',
      completed: true,
      order: 0,
      depends_on: [],
      requirement_refs: [],
      acceptance_refs: [],
      resource_claims: [],
      expected_outputs: [],
      validators: [],
    },
    {
      id: 'legacy-display-0002',
      identity_quality: 'legacy-derived',
      title: 'Keep the legacy projection read-only',
      stage: null,
      completed: false,
      order: 1,
      depends_on: [],
      requirement_refs: [],
      acceptance_refs: [],
      resource_claims: [],
      expected_outputs: [],
      validators: [],
    },
  ],
  completeness: { state: 'unknown', reason: 'legacy-semantics-unproven' },
  projection: { state: 'legacy' },
}

afterEach(() => vi.unstubAllGlobals())

describe('decodeTaskPlanReadModel', () => {
  it('accepts a representative canonical read model without importing kernel types', () => {
    expect(decodeTaskPlanReadModel(canonical)).toEqual(canonical)
  })

  it('accepts canonical semantic diagnostics for an unknown dependency and preserves the DTO', () => {
    const dependencyUnknown = {
      ...canonical,
      schedulable: false,
      validation: {
        ...canonical.validation,
        valid: false,
        freezable: false,
        issues: [{
          severity: 'error',
          code: 'dependency-unknown',
          path: '$.work_items[1].depends_on',
          related_ids: ['wi-2', 'missing-item'],
        }],
        dependencies: { edges: [], cyclic_work_item_ids: [] },
      },
      items: [
        canonical.items[0],
        { ...canonical.items[1], depends_on: ['missing-item'] },
      ],
      dependencies: { edges: [], cyclic_work_item_ids: [] },
    }
    expect(decodeTaskPlanReadModel(dependencyUnknown)).toEqual(dependencyUnknown)
  })

  it('accepts a draft canonical read model without making it schedulable', () => {
    const draft = { ...canonical, revision_status: 'draft', schedulable: false }
    expect(decodeTaskPlanReadModel(draft)).toEqual(draft)
  })

  it('accepts incomplete canonical coverage with matching completeness state', () => {
    const incompleteCoverage = {
      ...coverage,
      complete: false,
      requirements: [{ id: 'req-1', work_item_ids: [] }],
      uncovered_requirement_ids: ['req-1'],
    }
    const incomplete = {
      ...canonical,
      schedulable: false,
      validation: {
        ...canonical.validation,
        valid: false,
        freezable: false,
        issues: [{
          severity: 'error',
          code: 'requirement-uncovered',
          path: '$.requirements',
          related_ids: ['req-1'],
        }],
        coverage: incompleteCoverage,
      },
      completeness: { state: 'incomplete' },
      coverage: incompleteCoverage,
    }
    expect(decodeTaskPlanReadModel(incomplete)).toEqual(incomplete)
  })

  it('accepts the explicit legacy read model while preserving its non-schedulable invariants', () => {
    expect(decodeTaskPlanReadModel(legacy)).toEqual(legacy)
  })

  it.each([
    { state: 'pending', reason: 'tasks.md projection missing' },
    { state: 'drift', reason: 'tasks.md projection content mismatch' },
  ] as const)('accepts canonical projection state $state without recomputing it', (projection) => {
    expect(decodeTaskPlanReadModel({ ...canonical, projection })).toMatchObject({ projection })
  })

  it.each([
    { label: 'unknown top-level field', value: { ...canonical, future: true } },
    { label: 'malformed nested catalog entry', value: { ...canonical, requirements: [null] } },
    { label: 'unsafe display text', value: { ...canonical, requirements: [{ id: 'req-1', title: 'line\nbreak' }] } },
    { label: 'oversized display text', value: { ...canonical, requirements: [{ id: 'req-1', title: 'x'.repeat(8193) }] } },
    {
      label: 'duplicate entity id',
      value: { ...canonical, acceptance_criteria: [{ id: 'req-1', title: 'collides with requirement' }] },
    },
    {
      label: 'dangling dependency diagnostic',
      value: { ...canonical, dependencies: { edges: [{ from_work_item_id: 'missing-item', to_work_item_id: 'wi-2' }], cyclic_work_item_ids: [] } },
    },
    {
      label: 'dangling resource diagnostic',
      value: { ...canonical, resources: { conflicts: [], serialized: [{ ...resources.serialized[0], after_work_item_id: 'missing-item' }] } },
    },
    { label: 'non-safe revision integer', value: { ...canonical, revision_number: Number.MAX_SAFE_INTEGER + 1 } },
    { label: 'coerced revision integer', value: { ...canonical, revision_number: '1' } },
    { label: 'future revision status', value: { ...canonical, revision_status: 'future' } },
    { label: 'future projection state', value: { ...canonical, projection: { state: 'future' } } },
    { label: 'future validator kind', value: { ...canonical, items: [{ ...canonical.items[0], validators: [{ ...canonical.items[0].validators[0], kind: 'future-validator' }] }, canonical.items[1]] } },
    { label: 'coerced legacy completion', value: { ...legacy, items: [{ ...legacy.items[0], completed: 'true' }, legacy.items[1]] } },
    { label: 'legacy item order mismatch', value: { ...legacy, items: [{ ...legacy.items[0], order: 1 }, legacy.items[1]] } },
    { label: 'legacy invariant mismatch', value: { ...legacy, schedulable: true } },
    { label: 'canonical invariant mismatch', value: { ...canonical, schedulable: false } },
    { label: 'canonical completeness mismatch', value: { ...canonical, completeness: { state: 'incomplete' } } },
    { label: 'legacy canonical field injection', value: { ...legacy, plan_id: 'plan-1' } },
  ])('rejects $label', ({ value }) => {
    expect(decodeTaskPlanReadModel(value)).toBeNull()
  })

  it('rejects excessive arrays and diagnostic budget overflows before rendering them', () => {
    expect(decodeTaskPlanReadModel({
      ...canonical,
      requirements: Array.from({ length: MAX_TASK_PLAN_CATALOG_ENTRIES + 1 }, (_, index) => ({
        id: `req-${index}`,
        title: 'too many requirements',
      })),
    })).toBeNull()
    expect(decodeTaskPlanReadModel({
      ...canonical,
      items: Array.from({ length: MAX_TASK_PLAN_WORK_ITEMS + 1 }, (_, index) => ({
        ...canonical.items[0],
        id: `wi-${index}`,
      })),
    })).toBeNull()
    expect(decodeTaskPlanReadModel({
      ...canonical,
      validation: {
        ...canonical.validation,
        issues: Array.from({ length: MAX_TASK_PLAN_VALIDATION_ISSUES + 1 }, () => ({
          severity: 'error',
          code: 'task-plan-contract-invalid',
          path: '$',
          related_ids: [],
        })),
      },
    })).toBeNull()
    expect(decodeTaskPlanReadModel({
      ...canonical,
      dependencies: {
        edges: Array.from({ length: MAX_TASK_PLAN_DIAGNOSTIC_ENTRIES + 1 }, () => ({
          from_work_item_id: 'wi-1',
          to_work_item_id: 'wi-2',
        })),
        cyclic_work_item_ids: [],
      },
    })).toBeNull()
  })

  it('rejects malformed nested arrays and non-safe validator versions without coercion', () => {
    expect(decodeTaskPlanReadModel({
      ...canonical,
      groups: [{ ...canonical.groups[0], work_item_ids: [['wi-1']] }],
    })).toBeNull()
    expect(decodeTaskPlanReadModel({
      ...canonical,
      items: [{ ...canonical.items[0], validators: [{ ...canonical.items[0].validators[0], version: '1' }] }, canonical.items[1]],
    })).toBeNull()
    expect(decodeTaskPlanReadModel({
      ...canonical,
      items: [{ ...canonical.items[0], expected_outputs: [{ ...canonical.items[0].expected_outputs[0], ref: 'packages/../secret' }] }, canonical.items[1]],
    })).toBeNull()
  })
})

describe('fetchTaskPlan', () => {
  it('encodes the change path and root query, sends JSON Accept, and forwards AbortSignal', async () => {
    const signal = new AbortController().signal
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(canonical), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchTaskPlan('/repo with space', 'demo/a', signal)).resolves.toEqual(canonical)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/task-plans/demo%2Fa?root=%2Frepo%20with%20space',
      { headers: { Accept: 'application/json' }, signal },
    )
  })

  it.each([
    ['TASK_PLAN_CHANGE_INVALID', 400],
    ['TASK_PLAN_ROOT_REQUIRED', 400],
    ['TASK_PLAN_ROOT_NOT_REGISTERED', 404],
    ['TASK_PLAN_ROOT_FORBIDDEN', 403],
    ['TASK_PLAN_NOT_FOUND', 404],
    ['TASK_PLAN_PATH_FORBIDDEN', 403],
    ['TASK_PLAN_CORRUPT', 409],
  ] as const)('preserves stable error code %s without trusting server prose', async (code, status) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      code,
      error: 'private server detail must not become display data',
    }), { status })))

    const result = fetchTaskPlan('/repo', 'demo')
    await expect(result).rejects.toBeInstanceOf(TaskPlanApiError)
    await expect(result).rejects.toMatchObject({ status, code })
    await expect(result).rejects.not.toThrow(/private server detail/)
  })

  it('keeps TASK_PLAN_NOT_FOUND distinguishable from an unrelated 404', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      code: 'TASK_PLAN_NOT_FOUND',
      error: 'not found',
    }), { status: 404 })))
    await expect(fetchTaskPlan('/repo', 'missing')).rejects.toMatchObject({
      name: 'TaskPlanApiError',
      status: 404,
      code: 'TASK_PLAN_NOT_FOUND',
    })

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'old server 404' }), { status: 404 })))
    await expect(fetchTaskPlan('/repo', 'missing')).rejects.toMatchObject({
      name: 'TaskPlanApiError',
      status: 404,
    })
    await expect(fetchTaskPlan('/repo', 'missing')).rejects.not.toMatchObject({ code: 'TASK_PLAN_NOT_FOUND' })
  })

  it('fails closed on malformed 200 responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
    await expect(fetchTaskPlan('/repo', 'demo')).rejects.toMatchObject({
      name: 'TaskPlanApiError',
      status: 200,
    })
  })
})
