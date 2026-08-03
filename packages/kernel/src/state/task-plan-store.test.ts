import { describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { encodeTaskPlanRevisionV1, TASK_PLAN_LIMITS, type TaskPlanRevisionV1 } from '../task-plan/index.js'
import {
  TASK_PLAN_CURRENT_FILE,
  TASK_PLAN_STATE_DIR,
  TaskPlanRevisionConflictError,
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

async function seedCanonicalHistory(
  dir: string,
  revisions: readonly TaskPlanRevisionV1[],
  current: TaskPlanRevisionV1,
): Promise<string> {
  const revisionsDir = join(dir, TASK_PLAN_STATE_DIR, 'revisions')
  await mkdir(revisionsDir, { recursive: true })
  for (const revision of revisions) {
    await writeFile(
      join(revisionsDir, `${String(revision.revision_number).padStart(6, '0')}-${revision.revision_id}.json`),
      `${JSON.stringify(revision)}\n`,
      'utf8',
    )
  }
  await writeFile(
    join(dir, TASK_PLAN_STATE_DIR, TASK_PLAN_CURRENT_FILE),
    `${JSON.stringify(current)}\n`,
    'utf8',
  )
  return revisionsDir
}

function revisionRaw(revision: TaskPlanRevisionV1): string {
  return `${encodeTaskPlanRevisionV1(revision)}\n`
}

function sizedOrphanRaw(index: number, desiredBytes: number): string {
  const requirements: { id: string; title: string }[] = []
  const fixture = (): TaskPlanRevisionV1 => plan({
    plan_id: `budget-plan-${index}`,
    revision_id: `budget-revision-${index}`,
    requirements,
    acceptance_criteria: [],
    groups: [],
    work_items: [],
  })
  const render = (): string => `${JSON.stringify(fixture())}\n`
  let raw = render()
  while (Buffer.byteLength(raw) < desiredBytes) {
    const remaining = desiredBytes - Buffer.byteLength(raw)
    const last = requirements.at(-1)
    if (last !== undefined && remaining <= TASK_PLAN_LIMITS.maxTextBytes - Buffer.byteLength(last.title)) {
      last.title += 'x'.repeat(remaining)
      raw = render()
      continue
    }
    requirements.push({ id: `budget-req-${index}-${requirements.length}`, title: '' })
    raw = render()
    const available = desiredBytes - Buffer.byteLength(raw)
    if (available < 0) throw new Error('Requested revision fixture is too small')
    requirements[requirements.length - 1]!.title = 'x'.repeat(Math.min(7_000, available))
    raw = render()
  }
  if (Buffer.byteLength(raw) !== desiredBytes) throw new Error('Revision fixture size is not exact')
  const encoded = revisionRaw(fixture())
  if (Buffer.byteLength(encoded) !== desiredBytes) throw new Error('Encoded revision fixture size changed')
  return encoded
}

async function populateSizedOrphans(
  revisionsDir: string,
  count: number,
  totalBytes: number,
): Promise<void> {
  const each = Math.floor(totalBytes / count)
  let remainder = totalBytes % count
  for (let index = 0; index < count; index += 1) {
    const bytes = each + (remainder > 0 ? 1 : 0)
    remainder = Math.max(0, remainder - 1)
    await writeFile(join(revisionsDir, `000001-budget-revision-${index}.json`), sizedOrphanRaw(index, bytes), 'utf8')
  }
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

  it('rejects reusing the current revision id and leaves the current pointer unchanged', async () => {
    const dir = await changeDir()
    await publishTaskPlanRevision(dir, plan(), { expected_current_revision_id: null })

    await expect(publishTaskPlanRevision(dir, plan({ revision_number: 2 }), {
      expected_current_revision_id: 'revision-1',
    })).rejects.toThrow('TaskPlan revision id already exists in the current lineage')

    expect(await readTaskPlanForChange(dir)).toMatchObject({ revision_id: 'revision-1', revision_number: 1 })
  })

  it('rejects reusing a historical revision id and leaves the current pointer unchanged', async () => {
    const dir = await changeDir()
    await publishTaskPlanRevision(dir, plan(), { expected_current_revision_id: null })
    await publishTaskPlanRevision(dir, plan({ revision_id: 'revision-2', revision_number: 2 }), {
      expected_current_revision_id: 'revision-1',
    })

    await expect(publishTaskPlanRevision(dir, plan({ revision_number: 3 }), {
      expected_current_revision_id: 'revision-2',
    })).rejects.toThrow('TaskPlan revision id already exists in the current lineage')

    expect(await readTaskPlanForChange(dir)).toMatchObject({ revision_id: 'revision-2', revision_number: 2 })
  })

  it('accepts a fresh revision id despite unrelated same-id orphan and different-plan boundaries', async () => {
    const dir = await changeDir()
    await publishTaskPlanRevision(dir, plan(), { expected_current_revision_id: null })
    await publishTaskPlanRevision(dir, plan({ revision_id: 'revision-2', revision_number: 2 }), {
      expected_current_revision_id: 'revision-1',
    })
    const revisionsDir = join(dir, TASK_PLAN_STATE_DIR, 'revisions')
    await writeFile(
      join(revisionsDir, '000099-revision-3.json'),
      `${JSON.stringify(plan({ revision_id: 'revision-3', revision_number: 99 }))}\n`,
      'utf8',
    )
    await writeFile(
      join(revisionsDir, '000001-revision-3.json'),
      `${JSON.stringify(plan({ plan_id: 'other-plan', revision_id: 'revision-3' }))}\n`,
      'utf8',
    )

    await expect(publishTaskPlanRevision(dir, plan({ revision_id: 'revision-3', revision_number: 3 }), {
      expected_current_revision_id: 'revision-2',
    })).resolves.toMatchObject({ revision_id: 'revision-3', revision_number: 3 })
  })

  it('fails closed instead of accepting a reused id hidden behind a seven-digit revision number', async () => {
    const dir = await changeDir()
    const historical = plan({ revision_id: 'historical-big', revision_number: 1_000_000 })
    const current = plan({ revision_id: 'current-big', revision_number: 1_000_001 })
    await seedCanonicalHistory(dir, [historical, current], current)

    await expect(publishTaskPlanRevision(
      dir,
      plan({ revision_id: 'historical-big', revision_number: 1_000_002 }),
      { expected_current_revision_id: 'current-big' },
    )).rejects.toBeInstanceOf(TaskPlanStateCorruptError)
    expect(await readFile(join(dir, TASK_PLAN_STATE_DIR, TASK_PLAN_CURRENT_FILE), 'utf8')).toContain('current-big')
  })

  it('fails closed when the committed lineage already contains duplicate revision ids', async () => {
    const dir = await changeDir()
    const first = plan({ revision_id: 'reused-id' })
    const current = plan({ revision_id: 'reused-id', revision_number: 2 })
    await seedCanonicalHistory(dir, [first, current], current)

    await expect(publishTaskPlanRevision(
      dir,
      plan({ revision_id: 'fresh-id', revision_number: 3 }),
      { expected_current_revision_id: 'reused-id' },
    )).rejects.toBeInstanceOf(TaskPlanStateCorruptError)
  })

  it('fails closed when the committed lineage has a missing revision number', async () => {
    const dir = await changeDir()
    const first = plan()
    const current = plan({ revision_id: 'revision-3', revision_number: 3 })
    await seedCanonicalHistory(dir, [first, current], current)

    await expect(publishTaskPlanRevision(
      dir,
      plan({ revision_id: 'revision-4', revision_number: 4 }),
      { expected_current_revision_id: 'revision-3' },
    )).rejects.toBeInstanceOf(TaskPlanStateCorruptError)
  })

  it('fails closed when a committed lineage filename disagrees with its content', async () => {
    const dir = await changeDir()
    const first = plan()
    const current = plan({ revision_id: 'revision-2', revision_number: 2 })
    const revisionsDir = await seedCanonicalHistory(dir, [current], current)
    await writeFile(join(revisionsDir, '000001-wrong-id.json'), `${JSON.stringify(first)}\n`, 'utf8')

    await expect(publishTaskPlanRevision(
      dir,
      plan({ revision_id: 'revision-3', revision_number: 3 }),
      { expected_current_revision_id: 'revision-2' },
    )).rejects.toBeInstanceOf(TaskPlanStateCorruptError)
  })

  it('fails closed when revision directory enumeration exceeds its entry budget', async () => {
    const dir = await changeDir()
    await publishTaskPlanRevision(dir, plan(), { expected_current_revision_id: null })
    const revisionsDir = join(dir, TASK_PLAN_STATE_DIR, 'revisions')
    for (let index = 0; index < TASK_PLAN_LIMITS.maxRevisionHistoryEntries; index += 1) {
      await writeFile(join(revisionsDir, `orphan-${String(index).padStart(3, '0')}`), '', 'utf8')
    }

    await expect(publishTaskPlanRevision(
      dir,
      plan({ revision_id: 'revision-2', revision_number: 2 }),
      { expected_current_revision_id: 'revision-1' },
    )).rejects.toThrow('TaskPlan revision directory entry budget exceeded')
  })

  it('fails closed when revision history reads exceed their cumulative byte budget', async () => {
    const dir = await changeDir()
    await publishTaskPlanRevision(dir, plan(), { expected_current_revision_id: null })
    const revisionsDir = join(dir, TASK_PLAN_STATE_DIR, 'revisions')
    let historyBytes = 0
    for (let index = 0; historyBytes <= TASK_PLAN_LIMITS.maxRevisionHistoryBytes; index += 1) {
      const requirements = Array.from({ length: 64 }, (_, itemIndex) => ({
        id: `req-${index}-${itemIndex}`,
        title: 'x'.repeat(7_000),
      }))
      const acceptance = Array.from({ length: 64 }, (_, itemIndex) => ({
        id: `acc-${index}-${itemIndex}`,
        title: 'y'.repeat(7_000),
      }))
      const orphan = plan({
        plan_id: `other-plan-${index}`,
        revision_id: `other-revision-${index}`,
        requirements,
        acceptance_criteria: acceptance,
        groups: [{ id: `group-${index}`, title: 'Build', parent_id: null, work_item_ids: [`wi-${index}`] }],
        work_items: [{
          id: `wi-${index}`, title: 'Implement', group_id: `group-${index}`,
          requirement_refs: requirements.map((entry) => entry.id),
          acceptance_refs: acceptance.map((entry) => entry.id), depends_on: [],
          resource_claims: [], expected_outputs: [], validators: [],
        }],
      })
      const raw = `${JSON.stringify(orphan)}\n`
      await writeFile(
        join(revisionsDir, `000001-${orphan.revision_id}.json`),
        raw,
        'utf8',
      )
      historyBytes += Buffer.byteLength(raw)
    }

    await expect(publishTaskPlanRevision(
      dir,
      plan({ revision_id: 'revision-2', revision_number: 2 }),
      { expected_current_revision_id: 'revision-1' },
    )).rejects.toThrow('TaskPlan revision history byte budget exceeded')
  })

  it('rejects a new target before writing when the committed lineage fills the entry budget', async () => {
    const dir = await changeDir()
    const lineage = Array.from({ length: TASK_PLAN_LIMITS.maxRevisionHistoryEntries }, (_, index) => plan({
      revision_id: `revision-${index + 1}`,
      revision_number: index + 1,
    }))
    const current = lineage[lineage.length - 1]!
    const revisionsDir = await seedCanonicalHistory(dir, lineage, current)
    const currentPath = join(dir, TASK_PLAN_STATE_DIR, TASK_PLAN_CURRENT_FILE)
    const currentBefore = await readFile(currentPath, 'utf8')
    const target = plan({ revision_id: 'revision-257', revision_number: 257 })
    const targetPath = join(revisionsDir, '000257-revision-257.json')

    await expect(publishTaskPlanRevision(dir, target, {
      expected_current_revision_id: current.revision_id,
    })).rejects.toBeInstanceOf(TaskPlanRevisionConflictError)
    await expect(readFile(targetPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(currentPath, 'utf8')).toBe(currentBefore)
  })

  it('rejects a new target before writing when only its raw bytes exceed the history byte budget', async () => {
    const dir = await changeDir()
    await publishTaskPlanRevision(dir, plan(), { expected_current_revision_id: null })
    const revisionsDir = join(dir, TASK_PLAN_STATE_DIR, 'revisions')
    const currentPath = join(dir, TASK_PLAN_STATE_DIR, TASK_PLAN_CURRENT_FILE)
    const currentBefore = await readFile(currentPath, 'utf8')
    const target = plan({ revision_id: 'revision-2', revision_number: 2 })
    const targetRaw = revisionRaw(target)
    const existingTargetBytes = TASK_PLAN_LIMITS.maxRevisionHistoryBytes - Buffer.byteLength(targetRaw) + 1
    await populateSizedOrphans(
      revisionsDir,
      18,
      existingTargetBytes - Buffer.byteLength(currentBefore),
    )

    await expect(publishTaskPlanRevision(dir, target, {
      expected_current_revision_id: 'revision-1',
    })).rejects.toBeInstanceOf(TaskPlanRevisionConflictError)
    await expect(readFile(join(revisionsDir, '000002-revision-2.json'), 'utf8'))
      .rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(currentPath, 'utf8')).toBe(currentBefore)
  })

  it('applies proposed admission to an initial publish with an orphan directory at the entry cap', async () => {
    const dir = await changeDir()
    const revisionsDir = join(dir, TASK_PLAN_STATE_DIR, 'revisions')
    await mkdir(revisionsDir, { recursive: true })
    for (let index = 0; index < TASK_PLAN_LIMITS.maxRevisionHistoryEntries; index += 1) {
      await writeFile(join(revisionsDir, `orphan-${String(index).padStart(3, '0')}`), '', 'utf8')
    }

    await expect(publishTaskPlanRevision(dir, plan(), { expected_current_revision_id: null }))
      .rejects.toBeInstanceOf(TaskPlanRevisionConflictError)
    await expect(readFile(join(revisionsDir, '000001-revision-1.json'), 'utf8'))
      .rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(dir, TASK_PLAN_STATE_DIR, TASK_PLAN_CURRENT_FILE), 'utf8'))
      .rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects a single oversized proposed revision as a typed conflict before creating state', async () => {
    const dir = await changeDir()
    const oversized = plan({
      requirements: Array.from({ length: 140 }, (_, index) => ({
        id: `oversized-requirement-${index}`,
        title: 'x'.repeat(TASK_PLAN_LIMITS.maxTextBytes),
      })),
    })

    await expect(publishTaskPlanRevision(dir, oversized, { expected_current_revision_id: null }))
      .rejects.toBeInstanceOf(TaskPlanRevisionConflictError)
    await expect(readFile(join(dir, TASK_PLAN_STATE_DIR, TASK_PLAN_CURRENT_FILE), 'utf8'))
      .rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('validates corrupted history before an exact-current republish and leaves projection untouched', async () => {
    const dir = await changeDir()
    const first = plan({ revision_id: 'reused-id' })
    const current = plan({ revision_id: 'reused-id', revision_number: 2 })
    await seedCanonicalHistory(dir, [first, current], current)
    await writeFile(join(dir, 'tasks.md'), 'projection sentinel\n', 'utf8')

    await expect(publishTaskPlanRevision(dir, current, { expected_current_revision_id: 'reused-id' }))
      .rejects.toBeInstanceOf(TaskPlanStateCorruptError)
    expect(await readFile(join(dir, 'tasks.md'), 'utf8')).toBe('projection sentinel\n')
  })

  it('allows an exact-current republish after validating a healthy committed lineage', async () => {
    const dir = await changeDir()
    await publishTaskPlanRevision(dir, plan(), { expected_current_revision_id: null })
    const current = plan({ revision_id: 'revision-2', revision_number: 2 })
    await publishTaskPlanRevision(dir, current, { expected_current_revision_id: 'revision-1' })

    await expect(publishTaskPlanRevision(dir, current, { expected_current_revision_id: 'revision-2' }))
      .resolves.toMatchObject({ revision_id: 'revision-2', projection: { state: 'current' } })
  })

  it('counts an identical pre-existing target only once across entry, read, and byte admission budgets', async () => {
    const dir = await changeDir()
    await publishTaskPlanRevision(dir, plan(), { expected_current_revision_id: null })
    const revisionsDir = join(dir, TASK_PLAN_STATE_DIR, 'revisions')
    const currentRaw = await readFile(join(dir, TASK_PLAN_STATE_DIR, TASK_PLAN_CURRENT_FILE), 'utf8')
    const target = plan({ revision_id: 'revision-2', revision_number: 2 })
    const targetRaw = revisionRaw(target)
    await writeFile(join(revisionsDir, '000002-revision-2.json'), targetRaw, 'utf8')
    const orphanCount = TASK_PLAN_LIMITS.maxRevisionHistoryEntries - 2
    const existingTargetBytes = TASK_PLAN_LIMITS.maxRevisionHistoryBytes - Buffer.byteLength(targetRaw) + 1
    await populateSizedOrphans(
      revisionsDir,
      orphanCount,
      existingTargetBytes - Buffer.byteLength(currentRaw) - Buffer.byteLength(targetRaw),
    )

    await expect(publishTaskPlanRevision(dir, target, { expected_current_revision_id: 'revision-1' }))
      .resolves.toMatchObject({ revision_id: 'revision-2', revision_number: 2 })
    expect(await readFile(join(dir, TASK_PLAN_STATE_DIR, TASK_PLAN_CURRENT_FILE), 'utf8')).toBe(targetRaw)
  })

  it('rejects a proposed revision number preoccupied by a different same-plan future orphan', async () => {
    const dir = await changeDir()
    await publishTaskPlanRevision(dir, plan(), { expected_current_revision_id: null })
    const revisionsDir = join(dir, TASK_PLAN_STATE_DIR, 'revisions')
    const currentPath = join(dir, TASK_PLAN_STATE_DIR, TASK_PLAN_CURRENT_FILE)
    const currentBefore = await readFile(currentPath, 'utf8')
    const orphan = plan({ revision_id: 'orphan-revision-2', revision_number: 2 })
    const orphanPath = join(revisionsDir, '000002-orphan-revision-2.json')
    const orphanRaw = revisionRaw(orphan)
    await writeFile(orphanPath, orphanRaw, 'utf8')
    const targetPath = join(revisionsDir, '000002-target-revision-2.json')

    await expect(publishTaskPlanRevision(
      dir,
      plan({ revision_id: 'target-revision-2', revision_number: 2 }),
      { expected_current_revision_id: 'revision-1' },
    )).rejects.toBeInstanceOf(TaskPlanRevisionConflictError)
    expect(await readFile(currentPath, 'utf8')).toBe(currentBefore)
    await expect(readFile(targetPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(orphanPath, 'utf8')).toBe(orphanRaw)
  })

  it('allows a proposed revision id present only at a different same-plan future number', async () => {
    const dir = await changeDir()
    await publishTaskPlanRevision(dir, plan(), { expected_current_revision_id: null })
    const revisionsDir = join(dir, TASK_PLAN_STATE_DIR, 'revisions')
    const currentPath = join(dir, TASK_PLAN_STATE_DIR, TASK_PLAN_CURRENT_FILE)
    const orphan = plan({ revision_id: 'reserved-revision-id', revision_number: 9 })
    const orphanPath = join(revisionsDir, '000009-reserved-revision-id.json')
    const orphanRaw = revisionRaw(orphan)
    await writeFile(orphanPath, orphanRaw, 'utf8')
    const targetPath = join(revisionsDir, '000002-reserved-revision-id.json')

    await expect(publishTaskPlanRevision(
      dir,
      plan({ revision_id: 'reserved-revision-id', revision_number: 2 }),
      { expected_current_revision_id: 'revision-1' },
    )).resolves.toMatchObject({ revision_id: 'reserved-revision-id', revision_number: 2 })
    expect(await readFile(currentPath, 'utf8')).toContain('reserved-revision-id')
    expect(await readFile(targetPath, 'utf8')).toContain('reserved-revision-id')
    expect(await readFile(orphanPath, 'utf8')).toBe(orphanRaw)
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
