import { createHash } from 'node:crypto'
import { lstat, mkdir, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'
import {
  adaptLegacyTasksMd,
  decodeTaskPlanRevisionV1,
  encodeTaskPlanRevisionV1,
  renderTaskPlanTasksMd,
  toTaskPlanReadModelV1,
  validateTaskPlanRevisionV1,
  type TaskPlanReadModelV1,
  type TaskPlanRevisionV1,
} from '../task-plan/index.js'
import { atomicLinkPublish, atomicReplaceFile } from './atomic-publish.js'
import { readOptionalBoundedRegularTextFile } from './document-path.js'
import { withLock } from './lock.js'

export const TASK_PLAN_STATE_DIR = '.pipeline-task-plan'
export const TASK_PLAN_CURRENT_FILE = 'current.json'
export const TASK_PLAN_REVISIONS_DIR = 'revisions'
const MAX_TASKS_MD_BYTES = 256 * 1024

export class TaskPlanStateCorruptError extends Error {
  override readonly name = 'TaskPlanStateCorruptError'
}

export class TaskPlanRevisionConflictError extends Error {
  override readonly name = 'TaskPlanRevisionConflictError'
}

export interface PublishTaskPlanOptions {
  readonly expected_current_revision_id: string | null
  readonly completed_work_item_ids?: readonly string[]
}

function revisionFileName(revision: TaskPlanRevisionV1): string {
  return `${String(revision.revision_number).padStart(6, '0')}-${revision.revision_id}.json`
}

function digest(raw: string): string {
  return `sha256:${createHash('sha256').update(raw).digest('hex')}`
}

function normalizeProjectionCompletion(markdown: string): string {
  return markdown.split('\n').map((line) => {
    const item = /^- \[[ xX]\] (.+ <!-- work-item:[^>]+ -->)$/u.exec(line)
    return item === null ? line : `- [ ] ${item[1]}`
  }).join('\n')
}

async function assertOwnedDirectory(base: string, candidate: string): Promise<void> {
  try {
    const [baseReal, candidateInfo, candidateReal] = await Promise.all([
      realpath(base),
      lstat(candidate),
      realpath(candidate),
    ])
    const fromBase = relative(baseReal, candidateReal)
    if (
      candidateInfo.isSymbolicLink()
      || !candidateInfo.isDirectory()
      || fromBase === ''
      || fromBase === '..'
      || fromBase.startsWith(`..${sep}`)
      || isAbsolute(fromBase)
    ) throw new TaskPlanStateCorruptError('TaskPlan state directory is not trusted')
  } catch (error) {
    if (error instanceof TaskPlanStateCorruptError) throw error
    throw new TaskPlanStateCorruptError('TaskPlan state directory is not trusted')
  }
}

async function ensureOwnedDirectory(base: string, candidate: string): Promise<void> {
  try {
    await mkdir(candidate)
  } catch (error) {
    if (typeof error !== 'object' || error === null || Reflect.get(error, 'code') !== 'EEXIST') throw error
  }
  await assertOwnedDirectory(base, candidate)
}

async function readRegular(path: string, maxBytes: number): Promise<string | undefined> {
  try {
    return await readOptionalBoundedRegularTextFile(path, maxBytes, 'TaskPlan state file')
  } catch (error) {
    if (error instanceof TaskPlanStateCorruptError) throw error
    throw new TaskPlanStateCorruptError('TaskPlan state file is not a stable bounded regular file')
  }
}

async function publishImmutable(path: string, dir: string, raw: string): Promise<void> {
  try {
    await atomicLinkPublish(dir, '.revision.tmp', path, raw)
  } catch (error) {
    if (typeof error !== 'object' || error === null || Reflect.get(error, 'code') !== 'EEXIST') throw error
    const existing = await readRegular(path, raw.length * 4 + 16)
    if (existing !== raw) throw new TaskPlanStateCorruptError('TaskPlan revision id already exists with different content')
  }
}

async function publishProjection(
  changeDir: string,
  revision: TaskPlanRevisionV1,
  raw: string,
  completedWorkItemIds: readonly string[],
): Promise<TaskPlanReadModelV1> {
  const markdown = renderTaskPlanTasksMd(revision, {
    completed_work_item_ids: completedWorkItemIds,
    digest: digest(raw),
  })
  try {
    await atomicReplaceFile(join(changeDir, 'tasks.md'), markdown)
    return toTaskPlanReadModelV1(revision, { state: 'current' })
  } catch {
    return toTaskPlanReadModelV1(revision, {
      state: 'pending',
      reason: 'tasks.md projection publication failed',
    })
  }
}

export async function publishTaskPlanRevision(
  changeDir: string,
  revision: TaskPlanRevisionV1,
  options: PublishTaskPlanOptions,
): Promise<TaskPlanReadModelV1> {
  const decoded = decodeTaskPlanRevisionV1(revision)
  if (!decoded.ok) throw new Error('TaskPlan revision does not satisfy task-plan/v1')
  const accepted = decoded.value
  const validation = validateTaskPlanRevisionV1(accepted)
  if (accepted.status !== 'frozen' || !validation.freezable) {
    throw new Error('TaskPlan revision is not freezable')
  }
  if (options.expected_current_revision_id !== null && typeof options.expected_current_revision_id !== 'string') {
    throw new TypeError('TaskPlan expected current revision id is invalid')
  }
  const knownItemIds = new Set(accepted.work_items.map((item) => item.id))
  const completed = options.completed_work_item_ids ?? []
  if (!Array.isArray(completed) || completed.length > accepted.work_items.length
    || completed.some((id) => typeof id !== 'string' || !knownItemIds.has(id))) {
    throw new TypeError('TaskPlan completed work item ids are invalid')
  }
  return withLock(changeDir, async () => {
    const stateDir = join(changeDir, TASK_PLAN_STATE_DIR)
    const revisionsDir = join(stateDir, TASK_PLAN_REVISIONS_DIR)
    await ensureOwnedDirectory(changeDir, stateDir)
    await ensureOwnedDirectory(changeDir, revisionsDir)
    const raw = `${encodeTaskPlanRevisionV1(accepted)}\n`
    const currentRaw = await readRegular(join(stateDir, TASK_PLAN_CURRENT_FILE), 1024 * 1024 + 1)
    let current: TaskPlanRevisionV1 | undefined
    if (currentRaw !== undefined) {
      const currentDecoded = decodeTaskPlanRevisionV1(currentRaw)
      if (!currentDecoded.ok) throw new TaskPlanStateCorruptError('TaskPlan current is malformed')
      current = currentDecoded.value
      const immutable = await readRegular(
        join(revisionsDir, revisionFileName(current)),
        1024 * 1024 + 1,
      )
      if (immutable !== currentRaw) {
        throw new TaskPlanStateCorruptError('TaskPlan current lacks an identical immutable revision')
      }
      if (currentRaw === raw) return publishProjection(changeDir, accepted, raw, completed)
    }
    const actualCurrentId = current?.revision_id ?? null
    if (actualCurrentId !== options.expected_current_revision_id) {
      throw new TaskPlanRevisionConflictError('TaskPlan current revision changed')
    }
    if (current === undefined) {
      if (accepted.revision_number !== 1) {
        throw new TaskPlanRevisionConflictError('TaskPlan initial revision number must be 1')
      }
    } else if (
      accepted.plan_id !== current.plan_id
      || accepted.revision_number !== current.revision_number + 1
    ) {
      throw new TaskPlanRevisionConflictError('TaskPlan revision does not extend the current lineage')
    }
    await publishImmutable(join(revisionsDir, revisionFileName(accepted)), revisionsDir, raw)
    await atomicReplaceFile(join(stateDir, TASK_PLAN_CURRENT_FILE), raw)

    return publishProjection(changeDir, accepted, raw, completed)
  })
}

export async function readTaskPlanForChange(changeDir: string): Promise<TaskPlanReadModelV1 | null> {
  const stateDir = join(changeDir, TASK_PLAN_STATE_DIR)
  const currentPath = join(stateDir, TASK_PLAN_CURRENT_FILE)
  const currentRaw = await readRegular(currentPath, 1024 * 1024 + 1)
  if (currentRaw === undefined) {
    const legacy = await readRegular(join(changeDir, 'tasks.md'), MAX_TASKS_MD_BYTES)
    return legacy === undefined ? null : adaptLegacyTasksMd(legacy)
  }
  const decoded = decodeTaskPlanRevisionV1(currentRaw)
  if (!decoded.ok) throw new TaskPlanStateCorruptError('TaskPlan current is malformed')
  await assertOwnedDirectory(changeDir, stateDir)
  await assertOwnedDirectory(changeDir, join(stateDir, TASK_PLAN_REVISIONS_DIR))
  const immutablePath = join(stateDir, TASK_PLAN_REVISIONS_DIR, revisionFileName(decoded.value))
  const immutableRaw = await readRegular(immutablePath, 1024 * 1024 + 1)
  if (immutableRaw === undefined || immutableRaw !== currentRaw) {
    throw new TaskPlanStateCorruptError('TaskPlan current lacks an identical immutable revision')
  }

  let tasks: string | undefined
  let projectionReadFailed = false
  try {
    tasks = await readRegular(join(changeDir, 'tasks.md'), MAX_TASKS_MD_BYTES)
  } catch {
    projectionReadFailed = true
  }
  const expected = renderTaskPlanTasksMd(decoded.value, { digest: digest(currentRaw) })
  const projection = projectionReadFailed
    ? { state: 'drift', reason: 'tasks.md projection is not a readable bounded regular file' } as const
    : tasks === undefined
    ? { state: 'pending', reason: 'tasks.md projection missing' } as const
    : normalizeProjectionCompletion(tasks) === expected
      ? { state: 'current' } as const
      : { state: 'drift', reason: 'tasks.md projection content mismatch' } as const
  return toTaskPlanReadModelV1(decoded.value, projection)
}
