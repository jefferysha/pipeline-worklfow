import { createHash } from 'node:crypto'
import { lstat, mkdir, opendir, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'
import { incompletePipelineTasksForExit } from '../workflow/todo-projection.js'
import {
  adaptLegacyTasksMd,
  decodeTaskPlanRevisionRecordV1,
  decodeTaskPlanRevisionV1,
  encodeTaskPlanRevisionRecordV1,
  renderTaskPlanTasksMd,
  TASK_PLAN_LIMITS,
  taskPlanDomainToRecord,
  taskPlanDtoToDomain,
  taskPlanRecordToDomain,
  toTaskPlanReadModelV1,
  validateTaskPlanAggregate,
  type TaskPlanReadModelV1,
  type TaskPlanRevisionRecordV1,
  type TaskPlanRevisionV1,
} from '../task-plan/index.js'
import type { Phase } from '../types.js'
import { atomicLinkPublish, atomicReplaceFile } from './atomic-publish.js'
import { readBoundedRegularFile, readOptionalBoundedRegularTextFile } from './document-path.js'
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
  /** @internal Test-only crash injection at the immutable -> current commit boundary. */
  readonly __test_after_immutable_publish?: () => void | Promise<void>
}

function revisionNumberPrefix(revision: TaskPlanRevisionRecordV1): string {
  return String(revision.revision_number).padStart(6, '0')
}

function planNamespace(planId: string): string {
  return createHash('sha256').update(planId).digest('hex')
}

function revisionFileName(revision: TaskPlanRevisionRecordV1): string {
  // TaskPlan identifiers reject `--`, keeping this address disjoint from legacy `<number>-<id>` files.
  return `${revisionNumberPrefix(revision)}--${planNamespace(revision.plan_id)}--${revision.revision_id}.json`
}

function legacyRevisionFileName(revision: TaskPlanRevisionRecordV1): string {
  return `${revisionNumberPrefix(revision)}-${revision.revision_id}.json`
}

function isRevisionFileNameFor(name: string, revision: TaskPlanRevisionRecordV1): boolean {
  return name === revisionFileName(revision) || name === legacyRevisionFileName(revision)
}

function digest(raw: string | Uint8Array): string {
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

interface StrictTaskPlanStateFile {
  readonly bytes: Buffer
  readonly text: string
}

async function readStateFile(path: string, maxBytes: number): Promise<StrictTaskPlanStateFile | undefined> {
  let bytes: Buffer
  try {
    bytes = await readBoundedRegularFile(path, maxBytes, 'TaskPlan state file')
  } catch (error) {
    if (
      typeof error === 'object'
      && error !== null
      && Reflect.get(error, 'code') === 'ENOENT'
    ) return undefined
    if (error instanceof TaskPlanStateCorruptError) throw error
    throw new TaskPlanStateCorruptError('TaskPlan state file is not a stable bounded regular file')
  }
  try {
    return {
      bytes,
      text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    }
  } catch {
    throw new TaskPlanStateCorruptError('TaskPlan state file is not valid UTF-8')
  }
}

interface TaskPlanRevisionAdmission {
  readonly targetExists: boolean
}

function assertCommittedRevisionSemantics(revision: TaskPlanRevisionRecordV1): void {
  const validation = validateTaskPlanAggregate(taskPlanRecordToDomain(revision))
  if (revision.status !== 'frozen' || !validation.freezable) {
    throw new TaskPlanStateCorruptError('TaskPlan committed lineage contains non-freezable state')
  }
}

async function assertCommittedLineageAndAdmission(
  revisionsDir: string,
  proposed: TaskPlanRevisionRecordV1,
  proposedRaw: string,
  current: TaskPlanRevisionRecordV1 | undefined,
  exactCurrent: boolean,
): Promise<TaskPlanRevisionAdmission> {
  const proposedBuffer = Buffer.from(proposedRaw, 'utf8')
  const proposedBytes = proposedBuffer.byteLength
  const revisionIds = new Set<string>()
  const revisionNumbers = new Set<number>()
  const immutableRevisionIds = new Set<string>()
  let targetExists = false
  let proposedIdOccupied = false
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
    const raw = await readStateFile(path, Math.min(TASK_PLAN_LIMITS.maxRevisionBytes, remainingBytes))
    if (raw === undefined) continue
    bytesRead += raw.bytes.byteLength
    if (bytesRead > TASK_PLAN_LIMITS.maxRevisionHistoryBytes) {
      throw new TaskPlanStateCorruptError('TaskPlan revision history byte budget exceeded')
    }
    const decoded = decodeTaskPlanRevisionRecordV1(raw.text)
    if (!decoded.ok) throw new TaskPlanStateCorruptError('TaskPlan revision history contains malformed state')
    const historical = decoded.value
    const isProposedIdentity = historical.plan_id === proposed.plan_id
      && historical.revision_number === proposed.revision_number
      && historical.revision_id === proposed.revision_id
    if (!isRevisionFileNameFor(entry.name, historical)) {
      throw new TaskPlanStateCorruptError('TaskPlan revision history filename disagrees with its content')
    }
    if (isProposedIdentity) {
      if (!raw.bytes.equals(proposedBuffer)) {
        throw new TaskPlanStateCorruptError('TaskPlan target revision already exists with different content')
      }
      targetExists = true
    }
    if (historical.plan_id === proposed.plan_id) {
      if (immutableRevisionIds.has(historical.revision_id)) {
        throw new TaskPlanStateCorruptError('TaskPlan immutable history contains a duplicate revision id')
      }
      immutableRevisionIds.add(historical.revision_id)
      if (historical.revision_id === proposed.revision_id && !isProposedIdentity) {
        proposedIdOccupied = true
      }
    }
    if (
      historical.plan_id === proposed.plan_id
      && historical.revision_number === proposed.revision_number
      && !isProposedIdentity
    ) {
      proposedNumberOccupied = true
    }
    if (
      current === undefined
      || historical.plan_id !== current.plan_id
      || historical.revision_number > current.revision_number
    ) continue
    assertCommittedRevisionSemantics(historical)
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
  if (!exactCurrent && proposedIdOccupied) {
    throw new TaskPlanRevisionConflictError('TaskPlan revision id already exists in immutable history')
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

async function readImmutableTwin(
  revisionsDir: string,
  revision: TaskPlanRevisionRecordV1,
  expectedRaw: Buffer,
): Promise<StrictTaskPlanStateFile | undefined> {
  const canonical = await readStateFile(
    join(revisionsDir, revisionFileName(revision)),
    TASK_PLAN_LIMITS.maxRevisionBytes,
  )
  if (canonical !== undefined) {
    if (!canonical.bytes.equals(expectedRaw)) {
      throw new TaskPlanStateCorruptError('TaskPlan current immutable revision disagrees with its content')
    }
    return canonical
  }
  const legacy = await readStateFile(
    join(revisionsDir, legacyRevisionFileName(revision)),
    TASK_PLAN_LIMITS.maxRevisionBytes,
  )
  if (legacy === undefined) return undefined
  if (legacy.bytes.equals(expectedRaw)) return legacy
  const decoded = decodeTaskPlanRevisionRecordV1(legacy.text)
  if (
    decoded.ok
    && decoded.value.plan_id !== revision.plan_id
    && decoded.value.revision_number === revision.revision_number
    && decoded.value.revision_id === revision.revision_id
  ) return undefined
  throw new TaskPlanStateCorruptError('TaskPlan current immutable revision disagrees with its content')
}

async function publishImmutable(path: string, dir: string, raw: string): Promise<void> {
  try {
    await atomicLinkPublish(dir, '.revision.tmp', path, raw)
  } catch (error) {
    if (typeof error !== 'object' || error === null || Reflect.get(error, 'code') !== 'EEXIST') throw error
    const existing = await readStateFile(path, TASK_PLAN_LIMITS.maxRevisionBytes)
    if (existing === undefined || !existing.bytes.equals(Buffer.from(raw, 'utf8'))) {
      throw new TaskPlanStateCorruptError('TaskPlan revision id already exists with different content')
    }
  }
}

async function publishProjection(
  changeDir: string,
  revision: TaskPlanRevisionRecordV1,
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
  const aggregate = taskPlanDtoToDomain(decoded.value)
  const validation = validateTaskPlanAggregate(aggregate)
  const accepted = taskPlanDomainToRecord(aggregate)
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
    const raw = `${encodeTaskPlanRevisionRecordV1(accepted)}\n`
    const rawBytes = Buffer.from(raw, 'utf8')
    const currentRaw = await readStateFile(join(stateDir, TASK_PLAN_CURRENT_FILE), TASK_PLAN_LIMITS.maxRevisionBytes)
    let current: TaskPlanRevisionRecordV1 | undefined
    let exactCurrent = false
    if (currentRaw !== undefined) {
      const currentDecoded = decodeTaskPlanRevisionRecordV1(currentRaw.text)
      if (!currentDecoded.ok) throw new TaskPlanStateCorruptError('TaskPlan current is malformed')
      current = currentDecoded.value
      const immutable = await readImmutableTwin(revisionsDir, current, currentRaw.bytes)
      if (immutable === undefined) {
        throw new TaskPlanStateCorruptError('TaskPlan current lacks an identical immutable revision')
      }
      exactCurrent = currentRaw.bytes.equals(rawBytes)
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
      await options.__test_after_immutable_publish?.()
    }
    await atomicReplaceFile(join(stateDir, TASK_PLAN_CURRENT_FILE), raw)

    return publishProjection(changeDir, accepted, raw, completed)
  })
}

interface CanonicalTaskPlanState {
  readonly revision: TaskPlanRevisionRecordV1
  readonly currentBytes: Buffer
}

async function readCanonicalTaskPlanState(changeDir: string): Promise<CanonicalTaskPlanState | undefined> {
  const stateDir = join(changeDir, TASK_PLAN_STATE_DIR)
  const currentPath = join(stateDir, TASK_PLAN_CURRENT_FILE)
  const currentRaw = await readStateFile(currentPath, TASK_PLAN_LIMITS.maxRevisionBytes)
  if (currentRaw === undefined) return undefined
  const decoded = decodeTaskPlanRevisionRecordV1(currentRaw.text)
  if (!decoded.ok) throw new TaskPlanStateCorruptError('TaskPlan current is malformed')
  const revision = decoded.value
  assertCommittedRevisionSemantics(revision)
  await assertOwnedDirectory(changeDir, stateDir)
  await assertOwnedDirectory(changeDir, join(stateDir, TASK_PLAN_REVISIONS_DIR))
  const immutableRaw = await readImmutableTwin(
    join(stateDir, TASK_PLAN_REVISIONS_DIR),
    revision,
    currentRaw.bytes,
  )
  if (immutableRaw === undefined) {
    throw new TaskPlanStateCorruptError('TaskPlan current lacks an identical immutable revision')
  }
  return { revision, currentBytes: currentRaw.bytes }
}

export async function isCurrentTaskPlanProjectionForChange(
  changeDir: string,
  source: string,
): Promise<boolean> {
  return (await classifyTaskPlanProjectionForChange(changeDir, source)) === 'current'
}

export async function classifyTaskPlanProjectionForChange(
  changeDir: string,
  source: string,
): Promise<'current' | 'legacy' | 'invalid'> {
  const state = await readCanonicalTaskPlanState(changeDir)
  if (state === undefined) return 'legacy'
  const expected = renderTaskPlanTasksMd(state.revision, { digest: digest(state.currentBytes) })
  return normalizeProjectionCompletion(source) === expected ? 'current' : 'invalid'
}
export async function taskPlanTasksThroughPhaseForChange(changeDir: string, phase: Phase, sourceOverride?: string | null): Promise<{ readonly pass: boolean; readonly failure?: string }> {
  const state = await readCanonicalTaskPlanState(changeDir)
  const limit = state ? MAX_CANONICAL_TASKS_MD_BYTES : MAX_LEGACY_TASKS_MD_BYTES
  let source = sourceOverride ?? undefined
  if (sourceOverride === undefined) try { source = await readRegular(join(changeDir, 'tasks.md'), limit) } catch { return { pass: false, failure: `${phase} 出口：tasks.md 不可信或超出预算` } }
  if (source === undefined) return phase === 'build' ? { pass: false, failure: `${phase} 出口：tasks.md 缺失` } : { pass: true }
  if (Buffer.byteLength(source) > limit) return { pass: false, failure: `${phase} 出口：tasks.md 不可信或超出预算` }
  if (state && normalizeProjectionCompletion(source) !== renderTaskPlanTasksMd(state.revision, { digest: digest(state.currentBytes) }))
    return { pass: false, failure: `${phase} 出口：canonical TaskPlan tasks.md 投影认证失败` }
  const status = incompletePipelineTasksForExit({ phase, tasksMarkdown: source, trustedCanonicalProjection: state !== undefined })
  return status.incomplete > 0 ? { pass: false, failure: `${phase} 出口：tasks.md 仍有 ${status.incomplete} 项未勾` } : { pass: true }
}
export async function readTaskPlanForChange(changeDir: string): Promise<TaskPlanReadModelV1 | null> {
  const state = await readCanonicalTaskPlanState(changeDir)
  if (state === undefined) {
    const legacy = await readRegular(join(changeDir, 'tasks.md'), MAX_LEGACY_TASKS_MD_BYTES)
    return legacy === undefined ? null : adaptLegacyTasksMd(legacy)
  }

  let tasks: string | undefined
  let projectionReadFailed = false
  try {
    tasks = await readRegular(join(changeDir, 'tasks.md'), MAX_CANONICAL_TASKS_MD_BYTES)
  } catch {
    projectionReadFailed = true
  }
  const expected = renderTaskPlanTasksMd(state.revision, { digest: digest(state.currentBytes) })
  const projection = projectionReadFailed
    ? { state: 'drift', reason: 'tasks.md projection is not a readable bounded regular file' } as const
    : tasks === undefined
    ? { state: 'pending', reason: 'tasks.md projection missing' } as const
    : normalizeProjectionCompletion(tasks) === expected
      ? { state: 'current' } as const
      : { state: 'drift', reason: 'tasks.md projection content mismatch' } as const
  return toTaskPlanReadModelV1(state.revision, projection)
}
