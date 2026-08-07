import { describe, expect, it } from 'vitest'
import type {
  CanonicalTaskPlanReadModelV1,
  LegacyTaskPlanReadModelV1,
} from '../api/taskPlanClient'
import { filterTaskPlanItems, taskPlanSearchableText } from './taskPlanPresentation'

const canonical = (overrides: Partial<CanonicalTaskPlanReadModelV1> = {}): CanonicalTaskPlanReadModelV1 => ({
  schema_version: 'task-plan-read/v1',
  source: 'canonical',
  schedulable: false,
  plan_id: 'plan-1',
  revision_id: 'revision-1',
  revision_number: 1,
  fingerprint: `sha256:${'a'.repeat(64)}`,
  revision_status: 'draft',
  validation: {
    valid: true,
    freezable: true,
    truncated: false,
    issues: [],
    coverage: {
      complete: true,
      requirements: [],
      acceptance_criteria: [],
      uncovered_requirement_ids: [],
      uncovered_acceptance_ids: [],
    },
    dependencies: { edges: [], cyclic_work_item_ids: [] },
    resources: { conflicts: [], serialized: [] },
  },
  completeness: { state: 'complete' },
  requirements: [{ id: 'requirement-auth', title: 'Authentication boundary' }],
  acceptance_criteria: [{ id: 'acceptance-keyboard', title: 'Keyboard path works' }],
  groups: [{ id: 'group-ui', title: 'Dashboard UI', parent_id: null, work_item_ids: ['item-ui'] }],
  items: [{
    id: 'item-ui',
    identity_quality: 'canonical',
    title: 'Render the dashboard panel',
    group_id: 'group-ui',
    requirement_refs: ['requirement-auth'],
    acceptance_refs: ['acceptance-keyboard'],
    depends_on: [],
    resource_claims: [],
    expected_outputs: [],
    validators: [],
  }],
  coverage: {
    complete: true,
    requirements: [{ id: 'requirement-auth', work_item_ids: ['item-ui'] }],
    acceptance_criteria: [{ id: 'acceptance-keyboard', work_item_ids: ['item-ui'] }],
    uncovered_requirement_ids: [],
    uncovered_acceptance_ids: [],
  },
  dependencies: { edges: [], cyclic_work_item_ids: [] },
  resources: { conflicts: [], serialized: [] },
  projection: { state: 'current' },
  ...overrides,
})

const legacy: LegacyTaskPlanReadModelV1 = {
  schema_version: 'task-plan-read/v1',
  source: 'legacy',
  schedulable: false,
  groups: [],
  items: [{
    id: 'legacy-item-1',
    identity_quality: 'legacy-derived',
    title: 'Legacy task',
    stage: 'Build',
    completed: false,
    order: 0,
    depends_on: [],
    requirement_refs: [],
    acceptance_refs: [],
    resource_claims: [],
    expected_outputs: [],
    validators: [],
  }],
  completeness: { state: 'unknown', reason: 'legacy-semantics-unproven' },
  projection: { state: 'legacy' },
}

describe('taskPlanPresentation', () => {
  it('searches canonical IDs, titles, group labels, and requirement/acceptance refs without changing DTOs', () => {
    const plan = canonical()
    const before = JSON.stringify(plan)

    expect(filterTaskPlanItems(plan, 'dashboard ui')).toHaveLength(1)
    expect(filterTaskPlanItems(plan, 'authentication')).toHaveLength(1)
    expect(filterTaskPlanItems(plan, 'acceptance-keyboard')).toHaveLength(1)
    expect(taskPlanSearchableText(plan, plan.items[0]!)).toContain('dashboard ui')
    expect(JSON.stringify(plan)).toBe(before)
  })

  it('keeps legacy searches honest and does not invent relationship fields', () => {
    expect(filterTaskPlanItems(legacy, 'legacy task')).toHaveLength(1)
    expect(filterTaskPlanItems(legacy, 'group')).toHaveLength(0)
    expect(taskPlanSearchableText(legacy, legacy.items[0])).not.toContain('depends')
  })
})
