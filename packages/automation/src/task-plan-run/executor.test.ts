import { mkdtemp, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { TaskPlanExecutionPlan, TaskRunAdmissionV1, WorkItemV1 } from '@tenon/kernel'
import { appendTaskRunAttempt, appendTaskRunValidatorVerdict, readTaskRunJournal } from './journal.js'
import { claimNextTaskPlanWorkItem } from './executor.js'

function item(id: string, dependsOn: readonly string[] = []): WorkItemV1 {
  return {
    id, title: id, group_id: 'root', requirement_refs: [], acceptance_refs: [],
    depends_on: dependsOn, resource_claims: [], expected_outputs: [], validators: [],
  }
}

function serializedItem(id: string): WorkItemV1 {
  return { ...item(id), resource_claims: [{ kind: 'path', access: 'write', key: 'src/shared.ts' }] }
}

function plan(): TaskPlanExecutionPlan {
  return {
    plan_id: 'plan', revision_id: 'revision', revision_number: 1, fingerprint: 'sha256:plan',
    status: 'frozen', groups: [{ id: 'root', title: 'Root', parent_id: null, work_item_ids: ['a', 'b'] }],
    work_items: [item('a'), item('b', ['a'])],
  }
}

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'tenon-task-executor-'))
  const change = join(root, 'change')
  await mkdir(change)
  return change
}

const admitted: TaskRunAdmissionV1 = { status: 'admitted', blockers: [] }

describe('claimNextTaskPlanWorkItem', () => {
  it('rechecks authoritative admission before appending a claim', async () => {
    const changeDir = await fixture()
    const result = await claimNextTaskPlanWorkItem({
      changeDir, plan: plan(), authoritativeAdmission: vi.fn(async () => ({
        admission: { status: 'blocked', blockers: [{ code: 'EVIDENCE_MISSING', detail: 'missing', remediation: 'RESTORE' }] },
        prepared_context: null,
      })),
      clock: () => '2026-08-04T00:00:00.000Z', attemptId: () => 'attempt-1',
    })
    expect(result).toMatchObject({ status: 'blocked', blockers: [{ code: 'EVIDENCE_MISSING' }] })
    expect((await readTaskRunJournal(changeDir, 'revision')).attempts).toEqual([])
  })

  it('holds a compiled wave barrier for serialized resource writers', async () => {
    const changeDir = await fixture()
    const serializedPlan: TaskPlanExecutionPlan = {
      ...plan(),
      work_items: [serializedItem('a'), serializedItem('b')],
    }
    const authoritativeAdmission = vi.fn(async ({ work_item_id }: { readonly work_item_id: string }) => ({
      admission: admitted,
      prepared_context: { token: `prepared-${work_item_id}` },
    }))
    const attemptIds = ['a-1', 'b-1']
    const input = {
      changeDir,
      plan: serializedPlan,
      authoritativeAdmission,
      clock: () => '2026-08-04T00:00:00.000Z',
      attemptId: () => attemptIds.shift() ?? 'unexpected-attempt',
    }

    const first = await claimNextTaskPlanWorkItem(input)
    expect(first).toMatchObject({ status: 'claimed', work_item_id: 'a' })

    const second = await claimNextTaskPlanWorkItem(input)
    expect(second).toMatchObject({ status: 'idle', run_revision: 1 })
    expect(authoritativeAdmission.mock.calls.map(([coordinate]) => coordinate.work_item_id)).toEqual(['a'])
    expect((await readTaskRunJournal(changeDir, 'revision')).attempts).toHaveLength(1)

    await appendTaskRunAttempt(changeDir, 'revision', 1, {
      attempt_id: 'a-1', work_item_id: 'a', attempt_number: 1, status: 'succeeded',
      recorded_at: '2026-08-04T00:00:01.000Z', input_digests: {}, output_digest: 'sha256:a',
    })

    const third = await claimNextTaskPlanWorkItem(input)
    expect(third).toMatchObject({ status: 'claimed', work_item_id: 'b', run_revision: 3 })
    expect(authoritativeAdmission.mock.calls.map(([coordinate]) => coordinate.work_item_id)).toEqual(['a', 'b'])
    expect((await readTaskRunJournal(changeDir, 'revision')).attempts).toHaveLength(3)
  })

  it('keeps independent items in the same compiled wave claimable while one is running', async () => {
    const changeDir = await fixture()
    const parallelPlan: TaskPlanExecutionPlan = {
      ...plan(),
      work_items: [item('a'), item('b')],
    }
    let attemptNumber = 0
    const resultFor = (workItemId: string) => ({
      admission: admitted,
      prepared_context: { token: `prepared-${workItemId}` },
    })
    const input = {
      changeDir,
      plan: parallelPlan,
      authoritativeAdmission: vi.fn(async ({ work_item_id }: { readonly work_item_id: string }) => resultFor(work_item_id)),
      clock: () => '2026-08-04T00:00:00.000Z',
      attemptId: () => attemptNumber++ === 0 ? 'a-1' : 'b-1',
    }

    const first = await claimNextTaskPlanWorkItem(input)
    const second = await claimNextTaskPlanWorkItem(input)

    expect(first).toMatchObject({ status: 'claimed', work_item_id: 'a' })
    expect(second).toMatchObject({ status: 'claimed', work_item_id: 'b' })
    expect((await readTaskRunJournal(changeDir, 'revision')).attempts).toHaveLength(2)
  })

  it('fails closed when admission does not issue a prepared execution context', async () => {
    const changeDir = await fixture()
    const result = await claimNextTaskPlanWorkItem({
      changeDir, plan: plan(), authoritativeAdmission: async () => ({
        admission: admitted, prepared_context: null,
      }),
      clock: () => '2026-08-04T00:00:00.000Z', attemptId: () => 'attempt-1',
    })
    expect(result).toMatchObject({ status: 'blocked', blockers: [{ code: 'PREPARED_CONTEXT_MISSING' }] })
    expect((await readTaskRunJournal(changeDir, 'revision')).attempts).toEqual([])
  })

  it('claims one deterministic ready item and pins upstream output digests', async () => {
    const changeDir = await fixture()
    await appendTaskRunAttempt(changeDir, 'revision', 0, {
      attempt_id: 'a-1', work_item_id: 'a', attempt_number: 1, status: 'succeeded',
      recorded_at: '2026-08-04T00:00:00.000Z', input_digests: {}, output_digest: 'sha256:a',
    })
    const result = await claimNextTaskPlanWorkItem({
      changeDir, plan: plan(), authoritativeAdmission: async () => ({ admission: admitted, prepared_context: { token: 'prepared-b' } }),
      clock: () => '2026-08-04T00:00:01.000Z', attemptId: () => 'b-1',
    })
    expect(result).toMatchObject({ status: 'claimed', work_item_id: 'b', run_revision: 2 })
    expect(result).toMatchObject({ prepared_context: { token: 'prepared-b' } })
    expect((await readTaskRunJournal(changeDir, 'revision')).attempts[1]).toMatchObject({
      work_item_id: 'b', status: 'running', input_digests: { a: 'sha256:a' },
    })
  })

  it('uses persisted validator verdicts when selecting downstream work', async () => {
    const changeDir = await fixture()
    const validatedPlan = plan()
    validatedPlan.work_items[0] = {
      ...validatedPlan.work_items[0],
      validators: [{ id: 'validate-a', kind: 'artifact-digest', version: 1, output_ids: [] }],
    }
    await appendTaskRunAttempt(changeDir, 'revision', 0, {
      attempt_id: 'a-1', work_item_id: 'a', attempt_number: 1, status: 'succeeded',
      recorded_at: '2026-08-04T00:00:00.000Z', input_digests: {}, output_digest: 'sha256:a',
    })
    await appendTaskRunValidatorVerdict(changeDir, 'revision', 1, {
      validator_id: 'validate-a', scope: 'work-item', target_id: 'a', status: 'passed',
      recorded_at: '2026-08-04T00:00:01.000Z',
    })

    const result = await claimNextTaskPlanWorkItem({
      changeDir, plan: validatedPlan, authoritativeAdmission: async () => ({
        admission: admitted, prepared_context: { token: 'prepared-b' },
      }),
      clock: () => '2026-08-04T00:00:02.000Z', attemptId: () => 'b-1',
    })

    expect(result).toMatchObject({ status: 'claimed', work_item_id: 'b', run_revision: 3 })
  })

  it('turns concurrent journal CAS loss into a non-executing claim-lost result', async () => {
    const changeDir = await fixture()
    const input = {
      changeDir, plan: plan(), authoritativeAdmission: async () => ({ admission: admitted, prepared_context: { token: 'prepared-a' } }),
      clock: () => '2026-08-04T00:00:00.000Z', attemptId: () => 'same-attempt',
    }
    const results = await Promise.all([claimNextTaskPlanWorkItem(input), claimNextTaskPlanWorkItem(input)])
    expect(results.filter(({ status }) => status === 'claimed')).toHaveLength(1)
    expect(results.filter(({ status }) => status === 'claim-lost')).toHaveLength(1)
    expect((await readTaskRunJournal(changeDir, 'revision')).attempts).toHaveLength(1)
  })
})
