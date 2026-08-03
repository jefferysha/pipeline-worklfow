import { createHash } from 'node:crypto'
import { lstat, mkdir, opendir, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'
import {
  adaptLegacyTasksMd,
  decodeTaskPlanRevisionV1,
  encodeTaskPlanRevisionV1,
  renderTaskPlanTasksMd,
  TASK_PLAN_LIMITS,
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
const MAX_LEGACY_TASKS_MD_BYTES = 256 * 1024
const MAX_CANONICAL_TASKS_MD_BYTES = TASK_PLAN_LIMITS.maxRevisionBytes

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

interface TaskPlanRevisionAdmission {
  readonly targetExists: boolean
}

function assertCommittedRevisionSemantics(revision: TaskPlanRevisionV1): void {
  const validation = validateTaskPlanRevisionV1(revision)
  if (revision.status !== 'frozen' || !validation.freezable) {
    throw new TaskPlanStateCorruptError('TaskPlan committed lineage contains non-freezable state')
  }
}

async function assertCommittedLineageAndAdmission(
  revisionsDir: string,
  proposed: TaskPlanRevisionV1,
  proposedRaw: string,
  current: TaskPlanRevisionV1 | undefined,
  exactCurrent: boolean,
): Promise<TaskPlanRevisionAdmission> {
  const proposedBytes = Buffer.byteLength(proposedRaw)
  const targetName = revisionFileName(proposed)
  const revisionIds = new Set<string>()
  const revisionNumbers = new Set<number>()
  let targetExists = false
  let proposedNumberOccupied = false
  let entries = 0
  let reads = 0
  let bytesRead = 0
  const directory = await opendir(revisionsDir)
  for await (const entry of directory) {
    entries += 1
    if (entries > TASK_PLAN_LIMITS.maxRevisionHistoryEntries) {
      throw new TaskPlanStateCorruptError('TaskPlan revision directory entry budget exceeded')
    }
    if (!/^\d+-.+\.json$/u.test(entry.name)) continue
    reads += 1
    if (reads > TASK_PLAN_LIMITS.maxRevisionHistoryReads) {
      throw new TaskPlanStateCorruptError('TaskPlan revision history read budget exceeded')
    }
    const path = join(revisionsDir, entry.name)
    const remainingBytes = TASK_PLAN_LIMITS.maxRevisionHistoryBytes - bytesRead
    const info = await lstat(path)
    if (info.isFile() && info.size > remainingBytes) {
      throw new TaskPlanStateCorruptError('TaskPlan revision history byte budget exceeded')
    }
    const raw = await readRegular(path, Math.min(TASK_PLAN_LIMITS.maxRevisionBytes, remainingBytes))
    if (raw === undefined) continue
    bytesRead += Buffer.byteLength(raw)
    if (bytesRead > TASK_PLAN_LIMITS.maxRevisionHistoryBytes) {
      throw new TaskPlanStateCorruptError('TaskPlan revision history byte budget exceeded')
    }
    const decoded = decodeTaskPlanRevisionV1(raw)
    if (!decoded.ok) throw new TaskPlanStateCorruptError('TaskPlan revision history contains malformed state')
    const historical = decoded.value
    if (entry.name === targetName) {
      if (raw !== proposedRaw) {
        throw new TaskPlanStateCorruptError('TaskPlan target revision already exists with different content')
      }
      targetExists = true
    }
    if (
      historical.plan_id === proposed.plan_id
      && historical.revision_number === proposed.revision_number
      && entry.name !== targetName
    ) {
      proposedNumberOccupied = true
    }
    if (
      current === undefined
      || historical.plan_id !== current.plan_id
      || historical.revision_number > current.revision_number
    ) continue
    assertCommittedRevisionSemantics(historical)
    if (entry.name !== revisionFileName(historical)) {
      throw new TaskPlanStateCorruptError('TaskPlan committed lineage filename disagrees with its content')
    }
    if (revisionNumbers.has(historical.revision_number)) {
      throw new TaskPlanStateCorruptError('TaskPlan committed lineage contains a duplicate revision number')
    }
    if (revisionIds.has(historical.revision_id)) {
      throw new TaskPlanStateCorruptError('TaskPlan committed lineage contains a duplicate revision id')
    }
    revisionNumbers.add(historical.revision_number)
    revisionIds.add(historical.revision_id)
  }
  if (current !== undefined) {
    if (
      revisionNumbers.size !== current.revision_number
      || !revisionNumbers.has(1)
      || !revisionNumbers.has(current.revision_number)
    ) {
      throw new TaskPlanStateCorruptError('TaskPlan committed lineage revision numbers are not continuous')
    }
    if (!exactCurrent && revisionIds.has(proposed.revision_id)) {
      throw new TaskPlanRevisionConflictError('TaskPlan revision id already exists in the current lineage')
    }
  }
  if (!exactCurrent && proposedNumberOccupied) {
    throw new TaskPlanRevisionConflictError('TaskPlan proposed revision number is already occupied')
  }
  if (proposedBytes > TASK_PLAN_LIMITS.maxRevisionBytes) {
    throw new TaskPlanRevisionConflictError('TaskPlan proposed revision exceeds the revision byte budget')
  }
  if (!targetExists && (
    entries + 1 > TASK_PLAN_LIMITS.maxRevisionHistoryEntries
    || reads + 1 > TASK_PLAN_LIMITS.maxRevisionHistoryReads
    || bytesRead + proposedBytes > TASK_PLAN_LIMITS.maxRevisionHistoryBytes
  )) {
    throw new TaskPlanRevisionConflictError('TaskPlan proposed revision exceeds the revision history admission budget')
  }
  return { targetExists }
}

async function publishImmutable(path: string, dir: string, raw: string): Promise<void> {
  try {
    await atomicLinkPublish(dir, '.revision.tmp', path, raw)
  } catch (error) {
    if (typeof error !== 'object' || error === null || Reflect.get(error, 'code') !== 'EEXIST') throw error
    const existing = await readRegular(path, TASK_PLAN_LIMITS.maxRevisionBytes)
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
  if (Buffer.byteLength(markdown) > MAX_CANONICAL_TASKS_MD_BYTES) {
    return toTaskPlanReadModelV1(revision, {
      state: 'pending',
      reason: 'tasks.md projection exceeds the canonical byte budget',
    })
  }
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
  if (!decoded.ok) {
    if (decoded.errors.some((error) => error.code === 'document_too_large')) {
      throw new TaskPlanRevisionConflictError('TaskPlan proposed revision exceeds the revision byte budget')
    }
    throw new Error('TaskPlan revision does not satisfy task-plan/v1')
  }
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
    const currentRaw = await readRegular(join(stateDir, TASK_PLAN_CURRENT_FILE), TASK_PLAN_LIMITS.maxRevisionBytes)
    let current: TaskPlanRevisionV1 | undefined
    let exactCurrent = false
    if (currentRaw !== undefined) {
      const currentDecoded = decodeTaskPlanRevisionV1(currentRaw)
      if (!currentDecoded.ok) throw new TaskPlanStateCorruptError('TaskPlan current is malformed')
      current = currentDecoded.value
      const immutable = await readRegular(join(revisionsDir, revisionFileName(current)), TASK_PLAN_LIMITS.maxRevisionBytes)
      if (immutable !== currentRaw) {
        throw new TaskPlanStateCorruptError('TaskPlan current lacks an identical immutable revision')
      }
      exactCurrent = currentRaw === raw
    }
    if (!exactCurrent) {
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
    }
    const admission = await assertCommittedLineageAndAdmission(revisionsDir, accepted, raw, current, exactCurrent)
    if (exactCurrent) return publishProjection(changeDir, accepted, raw, completed)
    if (!admission.targetExists) {
      await publishImmutable(join(revisionsDir, revisionFileName(accepted)), revisionsDir, raw)
    }
    await atomicReplaceFile(join(stateDir, TASK_PLAN_CURRENT_FILE), raw)

    return publishProjection(changeDir, accepted, raw, completed)
  })
}

export async function readTaskPlanForChange(changeDir: string): Promise<TaskPlanReadModelV1 | null> {
  const stateDir = join(changeDir, TASK_PLAN_STATE_DIR)
  const currentPath = join(stateDir, TASK_PLAN_CURRENT_FILE)
  const currentRaw = await readRegular(currentPath, TASK_PLAN_LIMITS.maxRevisionBytes)
  if (currentRaw === undefined) {
    const legacy = await readRegular(join(changeDir, 'tasks.md'), MAX_LEGACY_TASKS_MD_BYTES)
    return legacy === undefined ? null : adaptLegacyTasksMd(legacy)
  }
  const decoded = decodeTaskPlanRevisionV1(currentRaw)
  if (!decoded.ok) throw new TaskPlanStateCorruptError('TaskPlan current is malformed')
  assertCommittedRevisionSemantics(decoded.value)
  await assertOwnedDirectory(changeDir, stateDir)
  await assertOwnedDirectory(changeDir, join(stateDir, TASK_PLAN_REVISIONS_DIR))
  const immutablePath = join(stateDir, TASK_PLAN_REVISIONS_DIR, revisionFileName(decoded.value))
  const immutableRaw = await readRegular(immutablePath, TASK_PLAN_LIMITS.maxRevisionBytes)
  if (immutableRaw === undefined || immutableRaw !== currentRaw) {
    throw new TaskPlanStateCorruptError('TaskPlan current lacks an identical immutable revision')
  }

  let tasks: string | undefined
  let projectionReadFailed = false
  try {
    tasks = await readRegular(join(changeDir, 'tasks.md'), MAX_CANONICAL_TASKS_MD_BYTES)
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
