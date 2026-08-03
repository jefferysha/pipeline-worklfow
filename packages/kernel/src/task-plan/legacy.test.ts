import { describe, expect, it } from 'vitest'
import { adaptLegacyTasksMd, renderTaskPlanTasksMd, type TaskPlanRevisionV1 } from './index.js'

describe('legacy tasks.md adapter', () => {
  it('preserves only stage, text, completion, and order without inferred semantics', () => {
    const read = adaptLegacyTasksMd([
      '# Tasks',
      '## Build',
      '- [x] Add API after schema',
      '- [ ] Verify output `report.json`',
      '## Verify',
      '- [ ] Run checks',
    ].join('\n'))

    expect(read.schema_version).toBe('task-plan-read/v1')
    expect(read.source).toBe('legacy')
    expect(read.schedulable).toBe(false)
    expect(read.items.map((item) => ({ stage: item.stage, text: item.title, completed: item.completed, order: item.order }))).toEqual([
      { stage: 'Build', text: 'Add API after schema', completed: true, order: 0 },
      { stage: 'Build', text: 'Verify output `report.json`', completed: false, order: 1 },
      { stage: 'Verify', text: 'Run checks', completed: false, order: 2 },
    ])
    for (const item of read.items) {
      expect(item.identity_quality).toBe('legacy-derived')
      expect(item.depends_on).toEqual([])
      expect(item.requirement_refs).toEqual([])
      expect(item.acceptance_refs).toEqual([])
      expect(item.resource_claims).toEqual([])
      expect(item.expected_outputs).toEqual([])
      expect(item.validators).toEqual([])
    }
    expect(read.completeness).toEqual({ state: 'unknown', reason: 'legacy-semantics-unproven' })
  })

  it('renders canonical tasks.md with revision markers but never treats it as an editable round-trip', () => {
    const input: TaskPlanRevisionV1 = {
      schema_version: 'task-plan/v1', plan_id: 'p1', revision_id: 'r1', revision_number: 2,
      status: 'frozen', created_at: '2026-08-03T09:00:00.000Z', requirements: [], acceptance_criteria: [],
      groups: [{ id: 'g1', title: 'Build', parent_id: null, work_item_ids: ['w1'] }],
      work_items: [{
        id: 'w1', title: 'Implement domain', group_id: 'g1', requirement_refs: [], acceptance_refs: [],
        depends_on: [], resource_claims: [], expected_outputs: [], validators: [],
      }],
    }
    const markdown = renderTaskPlanTasksMd(input, { completed_work_item_ids: ['w1'], digest: 'sha256:abc' })
    expect(markdown).toContain('<!-- tenon-task-plan revision=r1 digest=sha256:abc -->')
    expect(markdown).toContain('## Build <!-- task-group:g1 -->')
    expect(markdown).toContain('- [x] Implement domain <!-- work-item:w1 -->')

    const legacy = adaptLegacyTasksMd(markdown)
    expect(legacy.schedulable).toBe(false)
    expect(legacy.items[0]?.id).not.toBe('w1')
    expect(legacy.items[0]?.stage).toBe('Build <!-- task-group:g1 -->')
    expect(legacy.items[0]?.title).toBe('Implement domain <!-- work-item:w1 -->')
  })

  it('preserves marker-shaped prose in a genuinely legacy document', () => {
    const legacy = adaptLegacyTasksMd([
      '## Build <!-- task-group:user-note -->',
      '- [ ] Keep <!-- work-item:user-note -->',
    ].join('\n'))
    expect(legacy.items[0]).toMatchObject({
      stage: 'Build <!-- task-group:user-note -->',
      title: 'Keep <!-- work-item:user-note -->',
    })
  })

  it('does not upgrade a header-spoofed legacy document into a trusted canonical projection', () => {
    const legacy = adaptLegacyTasksMd([
      '# Tasks',
      '',
      '<!-- tenon-task-plan revision=spoof digest=spoof -->',
      '',
      '## Notes <!-- task-group:user-note -->',
      '- [ ] Keep <!-- work-item:user-note -->',
    ].join('\n'))
    expect(legacy.items[0]).toMatchObject({
      stage: 'Notes <!-- task-group:user-note -->',
      title: 'Keep <!-- work-item:user-note -->',
    })
  })
})
