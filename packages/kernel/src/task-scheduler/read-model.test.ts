import { describe, expect, it } from 'vitest'
import type { TaskPlanRevisionV1, WorkItemV1 } from '../task-plan/index.js'
import { compileTaskSchedule } from './compiler.js'
import { deriveTaskRunReadModel } from './read-model.js'
import type { WorkItemAttemptFact } from './run-types.js'

function item(id: string, dependsOn: readonly string[] = [], groupId = 'root'): WorkItemV1 {
  return {
    id,
    title: id,
    group_id: groupId,
    requirement_refs: ['req'],
    acceptance_refs: ['accept'],
    depends_on: dependsOn,
    resource_claims: [],
    expected_outputs: [],
    validators: [],
  }
}

function plan(): TaskPlanRevisionV1 & { readonly fingerprint: string } {
  const workItems = [item('a'), item('b', ['a'])]
  return {
    schema_version: 'task-plan/v1',
    plan_id: 'plan',
    revision_id: 'revision',
    revision_number: 1,
    fingerprint: 'sha256:plan',
    status: 'frozen',
    created_at: '2026-08-04T00:00:00.000Z',
    requirements: [{ id: 'req', title: 'Requirement' }],
    acceptance_criteria: [{ id: 'accept', title: 'Acceptance' }],
    groups: [{ id: 'root', title: 'Root', parent_id: null, work_item_ids: workItems.map(({ id }) => id) }],
    work_items: workItems,
  }
}

function nestedPlan(): TaskPlanRevisionV1 & { readonly fingerprint: string } {
  const base = plan()
  const workItems = [
    item('root-item'),
    item('child-item', ['root-item'], 'child'),
    item('grandchild-item', ['child-item'], 'grandchild'),
  ]
  return {
    ...base,
    groups: [
      { id: 'root', title: 'Root', parent_id: null, work_item_ids: ['root-item'] },
      { id: 'child', title: 'Child', parent_id: 'root', work_item_ids: ['child-item'] },
      { id: 'grandchild', title: 'Grandchild', parent_id: 'child', work_item_ids: ['grandchild-item'] },
    ],
    work_items: workItems,
  }
}

function attempt(
  workItemId: string,
  number: number,
  status: WorkItemAttemptFact['status'],
  outputDigest?: string,
  inputDigests: Readonly<Record<string, string>> = {},
): WorkItemAttemptFact {
  return {
    attempt_id: `${workItemId}-${number}`,
    work_item_id: workItemId,
    attempt_number: number,
    status,
    recorded_at: `2026-08-04T00:00:0${number}.000Z`,
    input_digests: inputDigests,
    ...(outputDigest === undefined ? {} : { output_digest: outputDigest }),
  }
}

describe('deriveTaskRunReadModel', () => {
  it('blocks descendants after an upstream terminal failure', () => {
    const revision = plan()
    const model = deriveTaskRunReadModel({
      plan: revision,
      schedule: compileTaskSchedule(revision),
      attempts: [attempt('a', 1, 'failed')],
      validator_verdicts: [],
      admission: { status: 'admitted', blockers: [] },
      run_revision: 3,
    })

    expect(model.items.find(({ work_item_id }) => work_item_id === 'b')?.state).toBe('blocked-upstream')
    expect(model.state).toBe('failed')
  })

  it('offers no server-authorized operations while authoritative admission is blocked', () => {
    const revision = plan()
    const model = deriveTaskRunReadModel({
      plan: revision,
      schedule: compileTaskSchedule(revision),
      attempts: [attempt('a', 1, 'failed')],
      validator_verdicts: [],
      admission: {
        status: 'blocked',
        blockers: [{ code: 'AUTHORITATIVE_ADMISSION_MISSING', detail: 'missing', remediation: 'RECHECK' }],
      },
      run_revision: 1,
    })

    expect(model.state).toBe('blocked')
    expect(model.allowed_operations).toEqual([])
  })

  it('offers no server-authorized operations when schedule compilation is invalid', () => {
    const revision = { ...plan(), status: 'draft' as const }
    const schedule = compileTaskSchedule(revision)
    const model = deriveTaskRunReadModel({
      plan: revision,
      schedule,
      attempts: [attempt('a', 1, 'failed')],
      validator_verdicts: [],
      admission: { status: 'admitted', blockers: [] },
      run_revision: 1,
    })

    expect(schedule.valid).toBe(false)
    expect(model.state).toBe('blocked')
    expect(model.allowed_operations).toEqual([])
  })

  it('uses the latest append-only status fact for the same attempt number', () => {
    const revision = plan()
    const running = { ...attempt('a', 1, 'running'), journal_sequence: 1 }
    const succeeded = {
      ...attempt('a', 1, 'succeeded', 'sha256:a'),
      attempt_id: running.attempt_id,
      journal_sequence: 2,
    }
    const model = deriveTaskRunReadModel({
      plan: revision,
      schedule: compileTaskSchedule(revision),
      attempts: [running, succeeded],
      validator_verdicts: [],
      admission: { status: 'admitted', blockers: [] },
      run_revision: 2,
    })

    expect(model.items.find(({ work_item_id }) => work_item_id === 'a')?.state).toBe('succeeded')
    expect(model.items.find(({ work_item_id }) => work_item_id === 'b')?.state).toBe('ready')
  })

  it('invalidates a descendant built from an older upstream digest', () => {
    const revision = plan()
    const model = deriveTaskRunReadModel({
      plan: revision,
      schedule: compileTaskSchedule(revision),
      attempts: [
        attempt('a', 1, 'succeeded', 'sha256:old'),
        attempt('b', 1, 'succeeded', 'sha256:b', { a: 'sha256:old' }),
        attempt('a', 2, 'succeeded', 'sha256:new'),
      ],
      validator_verdicts: [],
      admission: { status: 'admitted', blockers: [] },
      run_revision: 4,
    })

    expect(model.items.find(({ work_item_id }) => work_item_id === 'b')?.state).toBe('invalidated')
    expect(model.invalidations).toEqual([{
      work_item_id: 'b',
      caused_by_work_item_id: 'a',
      expected_digest: 'sha256:old',
      actual_digest: 'sha256:new',
    }])
    expect(model.state).toBe('running')
  })

  it('keeps run-only validation failures out of group state', () => {
    const revision = plan()
    const model = deriveTaskRunReadModel({
      plan: revision,
      schedule: compileTaskSchedule(revision),
      attempts: [
        attempt('a', 1, 'succeeded', 'sha256:a'),
        attempt('b', 1, 'succeeded', 'sha256:b', { a: 'sha256:a' }),
      ],
      validator_verdicts: [
        { validator_id: 'group-integration', scope: 'group', target_id: 'root', status: 'passed' },
        { validator_id: 'integration', scope: 'run', status: 'failed', code: 'TEST_FAILED' },
      ],
      admission: { status: 'admitted', blockers: [] },
      run_revision: 5,
    })

    expect(model.groups).toEqual([{ group_id: 'root', state: 'succeeded', work_item_ids: ['a', 'b'] }])
    expect(model.state).toBe('failed')
  })

  it('fails the group and run for a group-scoped validator failure', () => {
    const revision = plan()
    const model = deriveTaskRunReadModel({
      plan: revision,
      schedule: compileTaskSchedule(revision),
      attempts: [
        attempt('a', 1, 'succeeded', 'sha256:a'),
        attempt('b', 1, 'succeeded', 'sha256:b', { a: 'sha256:a' }),
      ],
      validator_verdicts: [
        { validator_id: 'group-integration', scope: 'group', target_id: 'root', status: 'failed', code: 'TEST_FAILED' },
        { validator_id: 'run-integration', scope: 'run', status: 'passed' },
      ],
      admission: { status: 'admitted', blockers: [] },
      run_revision: 5,
    })

    expect(model.groups).toEqual([{ group_id: 'root', state: 'failed', work_item_ids: ['a', 'b'] }])
    expect(model.state).toBe('failed')
  })

  it('does not complete a group or run while its required validator is pending', () => {
    const revision = plan()
    const attempts = [
      attempt('a', 1, 'succeeded', 'sha256:a'),
      attempt('b', 1, 'succeeded', 'sha256:b', { a: 'sha256:a' }),
    ]
    const model = deriveTaskRunReadModel({
      plan: revision,
      schedule: compileTaskSchedule(revision),
      attempts,
      validator_verdicts: [
        { validator_id: 'group-integration', scope: 'group', target_id: 'root', status: 'pending' },
        { validator_id: 'run-integration', scope: 'run', status: 'passed' },
      ],
      admission: { status: 'admitted', blockers: [] },
      run_revision: 5,
    })
    expect(model.groups[0]?.state).toBe('pending')
    expect(model.state).toBe('running')
  })

  it('derives nested group ownership and waits for descendant completion', () => {
    const revision = nestedPlan()
    const validatorVerdicts = [
      { validator_id: 'root-integration', scope: 'group' as const, target_id: 'root', status: 'passed' as const },
      { validator_id: 'child-integration', scope: 'group' as const, target_id: 'child', status: 'passed' as const },
      { validator_id: 'run-integration', scope: 'run' as const, status: 'passed' as const },
    ]
    const input = {
      plan: revision,
      schedule: compileTaskSchedule(revision),
      validator_verdicts: validatorVerdicts,
      admission: { status: 'admitted' as const, blockers: [] },
      run_revision: 8,
    }
    const incomplete = deriveTaskRunReadModel({
      ...input,
      attempts: [
        attempt('root-item', 1, 'succeeded', 'sha256:root'),
        attempt('child-item', 1, 'succeeded', 'sha256:child', { 'root-item': 'sha256:root' }),
      ],
    })

    expect(incomplete.groups).toEqual([
      { group_id: 'child', state: 'pending', work_item_ids: ['child-item', 'grandchild-item'] },
      { group_id: 'grandchild', state: 'pending', work_item_ids: ['grandchild-item'] },
      { group_id: 'root', state: 'pending', work_item_ids: ['child-item', 'grandchild-item', 'root-item'] },
    ])
    expect(incomplete.state).toBe('running')

    const complete = deriveTaskRunReadModel({
      ...input,
      attempts: [
        attempt('root-item', 1, 'succeeded', 'sha256:root'),
        attempt('child-item', 1, 'succeeded', 'sha256:child', { 'root-item': 'sha256:root' }),
        attempt('grandchild-item', 1, 'succeeded', 'sha256:grandchild', { 'child-item': 'sha256:child' }),
      ],
    })

    expect(complete.groups.every(({ state: groupState }) => groupState === 'succeeded')).toBe(true)
    expect(complete.state).toBe('succeeded')
  })

  it('completes parent and run only after group and run integration validators pass', () => {
    const revision = plan()
    const model = deriveTaskRunReadModel({
      plan: revision,
      schedule: compileTaskSchedule(revision),
      attempts: [
        attempt('a', 1, 'succeeded', 'sha256:a'),
        attempt('b', 1, 'succeeded', 'sha256:b', { a: 'sha256:a' }),
      ],
      validator_verdicts: [
        { validator_id: 'group-integration', scope: 'group', target_id: 'root', status: 'passed' },
        { validator_id: 'run-integration', scope: 'run', status: 'passed' },
      ],
      admission: { status: 'admitted', blockers: [] },
      run_revision: 6,
    })
    expect(model.groups[0]?.state).toBe('succeeded')
    expect(model.state).toBe('succeeded')
  })

  it('invalidates a passed integration verdict when a pinned output digest changes', () => {
    const revision = plan()
    const model = deriveTaskRunReadModel({
      plan: revision,
      schedule: compileTaskSchedule(revision),
      attempts: [
        attempt('a', 2, 'succeeded', 'sha256:new'),
        attempt('b', 2, 'succeeded', 'sha256:b-new', { a: 'sha256:new' }),
      ],
      validator_verdicts: [
        {
          validator_id: 'group-integration', scope: 'group', target_id: 'root', status: 'passed',
          input_digests: { a: 'sha256:old', b: 'sha256:b-old' },
        },
        {
          validator_id: 'run-integration', scope: 'run', status: 'passed',
          input_digests: { a: 'sha256:old', b: 'sha256:b-old' },
        },
      ],
      admission: { status: 'admitted', blockers: [] },
      run_revision: 7,
    })

    expect(model.validator_verdicts).toEqual([
      expect.objectContaining({ validator_id: 'group-integration', status: 'invalidated', code: 'UPSTREAM_OUTPUT_CHANGED' }),
      expect.objectContaining({ validator_id: 'run-integration', status: 'invalidated', code: 'UPSTREAM_OUTPUT_CHANGED' }),
    ])
    expect(model.groups[0]?.state).toBe('pending')
    expect(model.state).toBe('running')
  })

  it('waits for each declared WorkItem validator verdict before accepting its output', () => {
    const base = plan()
    const revision = {
      ...base,
      work_items: base.work_items.map((workItem) => workItem.id === 'a'
        ? { ...workItem, validators: [{ id: 'artifact', kind: 'artifact-digest' as const, version: 1 as const, output_ids: [] }] }
        : workItem),
    }
    const input = {
      plan: revision,
      schedule: compileTaskSchedule(revision),
      attempts: [attempt('a', 1, 'succeeded', 'sha256:a')],
      admission: { status: 'admitted' as const, blockers: [] },
      run_revision: 1,
    }
    expect(deriveTaskRunReadModel({ ...input, validator_verdicts: [] }).items[0]?.state).toBe('running')
    expect(deriveTaskRunReadModel({
      ...input,
      validator_verdicts: [{
        validator_id: 'artifact', scope: 'work-item', target_id: 'a', status: 'passed',
      }],
    }).items[0]?.state).toBe('succeeded')
  })

  it('applies retry, cancel, and resume facts without erasing attempt history', () => {
    const revision = plan()
    const failed = attempt('a', 1, 'failed')
    const retried = deriveTaskRunReadModel({
      plan: revision,
      schedule: compileTaskSchedule(revision),
      attempts: [failed],
      operations: [{
        operation_id: 'retry-a', operation: 'retry', work_item_id: 'a',
        expected_run_revision: 1, expected_state: 'failed', recorded_at: '2026-08-04T00:00:02.000Z',
      }],
      validator_verdicts: [], admission: { status: 'admitted', blockers: [] }, run_revision: 2,
    })
    expect(retried.items.find(({ work_item_id }) => work_item_id === 'a')?.state).toBe('ready')
    expect(retried.attempts).toEqual([failed])

    const cancelled = deriveTaskRunReadModel({
      plan: revision,
      schedule: compileTaskSchedule(revision),
      attempts: [attempt('a', 1, 'running')],
      operations: [{
        operation_id: 'cancel-a', operation: 'cancel', work_item_id: 'a',
        expected_run_revision: 1, expected_state: 'running', recorded_at: '2026-08-04T00:00:02.000Z',
      }],
      validator_verdicts: [], admission: { status: 'admitted', blockers: [] }, run_revision: 2,
    })
    expect(cancelled.items.find(({ work_item_id }) => work_item_id === 'a')?.state).toBe('cancelled')

    const resumed = deriveTaskRunReadModel({
      plan: revision,
      schedule: compileTaskSchedule(revision),
      attempts: [attempt('a', 1, 'cancelled')],
      operations: [{
        operation_id: 'resume-run', operation: 'resume', expected_run_revision: 1,
        expected_state: 'cancelled', recorded_at: '2026-08-04T00:00:02.000Z',
      }],
      validator_verdicts: [], admission: { status: 'admitted', blockers: [] }, run_revision: 2,
    })
    expect(resumed.items.find(({ work_item_id }) => work_item_id === 'a')?.state).toBe('ready')
  })
})
