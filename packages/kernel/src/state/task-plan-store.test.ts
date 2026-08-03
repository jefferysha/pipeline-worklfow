import { describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TaskPlanRevisionV1 } from '../task-plan/index.js'
import {
  TASK_PLAN_CURRENT_FILE,
  TASK_PLAN_STATE_DIR,
  TaskPlanStateCorruptError,
  publishTaskPlanRevision,
  readTaskPlanForChange,
} from './task-plan-store.js'

function plan(overrides: Partial<TaskPlanRevisionV1> = {}): TaskPlanRevisionV1 {
  return {
    schema_version: 'task-plan/v1',
    plan_id: 'plan-1',
    revision_id: 'revision-1',
    revision_number: 1,
    status: 'frozen',
    created_at: '2026-08-03T09:00:00.000Z',
    requirements: [{ id: 'req-1', title: 'Read model' }],
    acceptance_criteria: [{ id: 'acc-1', title: 'Stable response' }],
    groups: [{ id: 'group-1', title: 'Build', parent_id: null, work_item_ids: ['wi-1'] }],
    work_items: [{
      id: 'wi-1', title: 'Implement', group_id: 'group-1', requirement_refs: ['req-1'],
      acceptance_refs: ['acc-1'], depends_on: [], resource_claims: [], expected_outputs: [], validators: [],
    }],
    ...overrides,
  }
}

async function changeDir(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'task-plan-store-'))
  const dir = join(root, 'openspec', 'changes', 'demo')
  await mkdir(dir, { recursive: true })
  return dir
}

describe('task plan store', () => {
  it('publishes immutable revision before current and builds a canonical read model', async () => {
    const dir = await changeDir()
    await publishTaskPlanRevision(dir, plan(), { expected_current_revision_id: null, completed_work_item_ids: [] })
    const read = await readTaskPlanForChange(dir)
    expect(read).toMatchObject({
      schema_version: 'task-plan-read/v1', source: 'canonical', revision_id: 'revision-1', schedulable: true,
      projection: { state: 'current' },
    })
    const immutable = await readFile(join(dir, TASK_PLAN_STATE_DIR, 'revisions', '000001-revision-1.json'), 'utf8')
    const current = await readFile(join(dir, TASK_PLAN_STATE_DIR, TASK_PLAN_CURRENT_FILE), 'utf8')
    expect(current).toBe(immutable)
    expect(await readFile(join(dir, 'tasks.md'), 'utf8')).toContain('work-item:wi-1')
  })

  it('does not expose an immutable orphan without a committed current pointer', async () => {
    const dir = await changeDir()
    await mkdir(join(dir, TASK_PLAN_STATE_DIR, 'revisions'), { recursive: true })
    await writeFile(
      join(dir, TASK_PLAN_STATE_DIR, 'revisions', '000001-revision-1.json'),
      `${JSON.stringify(plan())}\n`,
      'utf8',
    )
    await writeFile(join(dir, 'tasks.md'), '## Build\n- [ ] Legacy only\n', 'utf8')
    expect(await readTaskPlanForChange(dir)).toMatchObject({ source: 'legacy', schedulable: false })
  })

  it('never falls back to legacy when current exists but is corrupt or lacks its immutable twin', async () => {
    const dir = await changeDir()
    await mkdir(join(dir, TASK_PLAN_STATE_DIR), { recursive: true })
    await writeFile(join(dir, TASK_PLAN_STATE_DIR, TASK_PLAN_CURRENT_FILE), '{broken', 'utf8')
    await writeFile(join(dir, 'tasks.md'), '## Build\n- [ ] Do not trust this\n', 'utf8')
    await expect(readTaskPlanForChange(dir)).rejects.toBeInstanceOf(TaskPlanStateCorruptError)

    await writeFile(
      join(dir, TASK_PLAN_STATE_DIR, TASK_PLAN_CURRENT_FILE),
      `${JSON.stringify(plan())}\n`,
      'utf8',
    )
    await expect(readTaskPlanForChange(dir)).rejects.toBeInstanceOf(TaskPlanStateCorruptError)
  })

  it('rejects a symlinked canonical leaf without following it', async () => {
    const dir = await changeDir()
    await mkdir(join(dir, TASK_PLAN_STATE_DIR), { recursive: true })
    await writeFile(join(dir, 'outside.json'), `${JSON.stringify(plan())}\n`, 'utf8')
    await symlink(join(dir, 'outside.json'), join(dir, TASK_PLAN_STATE_DIR, TASK_PLAN_CURRENT_FILE))
    await expect(readTaskPlanForChange(dir)).rejects.toBeInstanceOf(TaskPlanStateCorruptError)
  })

  it('reports projection drift without demoting a committed canonical plan', async () => {
    const dir = await changeDir()
    await publishTaskPlanRevision(dir, plan(), { expected_current_revision_id: null, completed_work_item_ids: [] })
    await writeFile(join(dir, 'tasks.md'), '## Build\n- [ ] Hand edited\n', 'utf8')
    expect(await readTaskPlanForChange(dir)).toMatchObject({
      source: 'canonical', revision_id: 'revision-1', projection: { state: 'drift' },
    })
  })

  it('reports drift when the marker is retained but the projected body is edited', async () => {
    const dir = await changeDir()
    await publishTaskPlanRevision(dir, plan(), { expected_current_revision_id: null, completed_work_item_ids: [] })
    const projected = await readFile(join(dir, 'tasks.md'), 'utf8')
    await writeFile(join(dir, 'tasks.md'), projected.replace('Implement', 'Hand edited'), 'utf8')
    expect(await readTaskPlanForChange(dir)).toMatchObject({
      source: 'canonical', revision_id: 'revision-1', projection: { state: 'drift' },
    })
  })

  it('allows completion-only projection updates without treating them as canonical drift', async () => {
    const dir = await changeDir()
    await publishTaskPlanRevision(dir, plan(), { expected_current_revision_id: null, completed_work_item_ids: [] })
    const projected = await readFile(join(dir, 'tasks.md'), 'utf8')
    await writeFile(join(dir, 'tasks.md'), projected.replace('- [ ] Implement', '- [x] Implement'), 'utf8')
    expect(await readTaskPlanForChange(dir)).toMatchObject({
      source: 'canonical', revision_id: 'revision-1', projection: { state: 'current' },
    })
  })

  it('rejects an invalid or draft plan before publishing any current state', async () => {
    const dir = await changeDir()
    await expect(publishTaskPlanRevision(dir, plan({ status: 'draft' }), { expected_current_revision_id: null }))
      .rejects.toThrow('TaskPlan revision is not freezable')
    await expect(readFile(join(dir, TASK_PLAN_STATE_DIR, TASK_PLAN_CURRENT_FILE), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('uses expected-current and lineage checks to reject a stale rollback', async () => {
    const dir = await changeDir()
    await publishTaskPlanRevision(dir, plan(), { expected_current_revision_id: null })
    await publishTaskPlanRevision(dir, plan({ revision_id: 'revision-2', revision_number: 2 }), {
      expected_current_revision_id: 'revision-1',
    })
    await expect(publishTaskPlanRevision(dir, plan({ revision_id: 'revision-stale', revision_number: 2 }), {
      expected_current_revision_id: 'revision-1',
    })).rejects.toThrow('TaskPlan current revision changed')
    expect(await readTaskPlanForChange(dir)).toMatchObject({ revision_id: 'revision-2' })
  })

  it('reports projection pending after current commits but tasks.md publication fails', async () => {
    const dir = await changeDir()
    await mkdir(join(dir, 'tasks.md'))
    const published = await publishTaskPlanRevision(dir, plan(), { expected_current_revision_id: null })
    expect(published).toMatchObject({
      source: 'canonical', revision_id: 'revision-1', projection: { state: 'pending' },
    })
    expect(await readFile(join(dir, TASK_PLAN_STATE_DIR, TASK_PLAN_CURRENT_FILE), 'utf8')).toContain('revision-1')
    await expect(readTaskPlanForChange(dir)).resolves.toMatchObject({
      source: 'canonical', revision_id: 'revision-1', projection: { state: 'drift' },
    })
    await rm(join(dir, 'tasks.md'), { recursive: true })
    await expect(publishTaskPlanRevision(dir, plan(), { expected_current_revision_id: null }))
      .resolves.toMatchObject({ projection: { state: 'current' } })
  })
})
