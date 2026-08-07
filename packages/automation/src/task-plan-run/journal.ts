import { constants } from 'node:fs'
import { lstat, mkdir, open } from 'node:fs/promises'
import { join } from 'node:path'
import {
  withLock,
  type TaskRunOperationFact,
  type TaskValidatorVerdict,
  type WorkItemAttemptFact,
} from '@tenon/kernel'

const JOURNAL_SCHEMA_VERSION = 'task-run-event/v1' as const
const MAX_JOURNAL_BYTES = 8 * 1024 * 1024

interface AttemptEvent {
  readonly schema_version: typeof JOURNAL_SCHEMA_VERSION
  readonly sequence: number
  readonly type: 'attempt'
  readonly attempt: WorkItemAttemptFact
}

interface OperationEvent {
  readonly schema_version: typeof JOURNAL_SCHEMA_VERSION
  readonly sequence: number
  readonly type: 'operation'
  readonly operation: TaskRunOperationFact
}

interface ValidatorEvent {
  readonly schema_version: typeof JOURNAL_SCHEMA_VERSION
  readonly sequence: number
  readonly type: 'validator'
  readonly verdict: TaskRunValidatorFact
}

type TaskRunJournalEvent = AttemptEvent | OperationEvent | ValidatorEvent
type JournalFileHandle = Awaited<ReturnType<typeof open>>

interface JournalFileIdentity {
  readonly dev: number
  readonly ino: number
  readonly size: number
}

export interface TaskRunValidatorFact extends TaskValidatorVerdict {
  readonly recorded_at: string
}

export interface TaskRunJournal {
  readonly run_revision: number
  readonly attempts: readonly WorkItemAttemptFact[]
  readonly operations: readonly TaskRunOperationFact[]
  readonly validator_verdicts: readonly TaskRunValidatorFact[]
}

export class TaskRunRevisionConflictError extends Error {
  override readonly name = 'TaskRunRevisionConflictError'
}

export class TaskRunJournalCorruptError extends Error {
  override readonly name = 'TaskRunJournalCorruptError'
}

function safeId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validAttempt(value: unknown): value is WorkItemAttemptFact {
  if (!isRecord(value)) return false
  return typeof value.attempt_id === 'string'
    && safeId(value.attempt_id)
    && typeof value.work_item_id === 'string'
    && safeId(value.work_item_id)
    && Number.isSafeInteger(value.attempt_number)
    && Number(value.attempt_number) > 0
    && ['pending', 'running', 'succeeded', 'failed', 'cancelled'].includes(String(value.status))
    && typeof value.recorded_at === 'string'
    && !Number.isNaN(Date.parse(value.recorded_at))
    && isRecord(value.input_digests)
    && Object.entries(value.input_digests).every(([key, digest]) => safeId(key) && typeof digest === 'string')
    && (value.output_digest === undefined || typeof value.output_digest === 'string')
    && (value.error_code === undefined || typeof value.error_code === 'string')
}

function validOperation(value: unknown): value is TaskRunOperationFact {
  if (!isRecord(value)) return false
  return typeof value.operation_id === 'string'
    && safeId(value.operation_id)
    && ['retry', 'cancel', 'resume'].includes(String(value.operation))
    && (value.work_item_id === undefined || (typeof value.work_item_id === 'string' && safeId(value.work_item_id)))
    && Number.isSafeInteger(value.expected_run_revision)
    && Number(value.expected_run_revision) >= 0
    && typeof value.expected_state === 'string'
    && typeof value.recorded_at === 'string'
    && !Number.isNaN(Date.parse(value.recorded_at))
}

function validValidator(value: unknown): value is TaskRunValidatorFact {
  if (!isRecord(value)) return false
  const scope = String(value.scope)
  const targetValid = scope === 'run'
    ? value.target_id === undefined
    : typeof value.target_id === 'string' && safeId(value.target_id)
  return typeof value.validator_id === 'string'
    && safeId(value.validator_id)
    && ['work-item', 'group', 'run'].includes(scope)
    && targetValid
    && ['pending', 'passed', 'failed', 'invalidated'].includes(String(value.status))
    && (value.code === undefined || (typeof value.code === 'string' && safeId(value.code)))
    && (value.input_digests === undefined || (isRecord(value.input_digests)
      && Object.entries(value.input_digests).every(([key, digest]) => safeId(key) && typeof digest === 'string')))
    && typeof value.recorded_at === 'string'
    && !Number.isNaN(Date.parse(value.recorded_at))
}

function sameInputDigests(
  left: Readonly<Record<string, string>>,
  right: Readonly<Record<string, string>>,
): boolean {
  const leftEntries = Object.entries(left).sort(([a], [b]) => a.localeCompare(b))
  const rightEntries = Object.entries(right).sort(([a], [b]) => a.localeCompare(b))
  return leftEntries.length === rightEntries.length
    && leftEntries.every(([key, value], index) => {
      const candidate = rightEntries[index]
      return candidate !== undefined && candidate[0] === key && candidate[1] === value
    })
}

function assertAttemptTransition(
  previous: WorkItemAttemptFact | undefined,
  candidate: WorkItemAttemptFact,
): void {
  if (previous === undefined) return
  const coordinatesMatch = previous.work_item_id === candidate.work_item_id
    && previous.attempt_number === candidate.attempt_number
    && sameInputDigests(previous.input_digests, candidate.input_digests)
  const transitionAllowed = (previous.status === 'pending'
    && ['running', 'succeeded', 'failed', 'cancelled'].includes(candidate.status))
    || (previous.status === 'running'
      && ['succeeded', 'failed', 'cancelled'].includes(candidate.status))
  if (!coordinatesMatch || !transitionAllowed) {
    throw new TaskRunJournalCorruptError('Task run attempt transition is invalid')
  }
}

function parseEvent(value: unknown, expectedSequence: number): TaskRunJournalEvent {
  if (!isRecord(value)
    || value.schema_version !== JOURNAL_SCHEMA_VERSION
    || value.sequence !== expectedSequence) {
    throw new TaskRunJournalCorruptError('Task run journal sequence or schema is invalid')
  }
  if (value.type === 'attempt' && validAttempt(value.attempt)) {
    return { schema_version: JOURNAL_SCHEMA_VERSION, sequence: expectedSequence, type: 'attempt', attempt: value.attempt }
  }
  if (value.type === 'operation' && validOperation(value.operation)) {
    return { schema_version: JOURNAL_SCHEMA_VERSION, sequence: expectedSequence, type: 'operation', operation: value.operation }
  }
  if (value.type === 'validator' && validValidator(value.verdict)) {
    return { schema_version: JOURNAL_SCHEMA_VERSION, sequence: expectedSequence, type: 'validator', verdict: value.verdict }
  }
  throw new TaskRunJournalCorruptError('Task run journal event is invalid')
}

function parseEvents(raw: string): readonly TaskRunJournalEvent[] {
  if (raw !== '' && !raw.endsWith('\n')) {
    throw new TaskRunJournalCorruptError('Task run journal ends with an incomplete line')
  }
  const parsed: TaskRunJournalEvent[] = []
  for (const line of raw.split(/\r?\n/)) {
    if (line === '') continue
    let value: unknown
    try {
      value = JSON.parse(line) as unknown
    } catch {
      throw new TaskRunJournalCorruptError('Task run journal contains malformed JSON')
    }
    parsed.push(parseEvent(value, parsed.length + 1))
  }
  return parsed
}

function fileIdentity(stat: { readonly dev: number; readonly ino: number; readonly size: number }): JournalFileIdentity {
  return { dev: stat.dev, ino: stat.ino, size: stat.size }
}

function sameFileIdentity(left: JournalFileIdentity, right: JournalFileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size
}

function assertRegularJournalFile(
  stat: { readonly isFile: () => boolean; readonly dev: number; readonly ino: number; readonly size: number },
): JournalFileIdentity {
  if (!stat.isFile()) {
    throw new TaskRunJournalCorruptError('Task run journal leaf is not a regular file')
  }
  return fileIdentity(stat)
}

async function assertJournalPathIdentity(path: string, expected: JournalFileIdentity): Promise<void> {
  let current: Awaited<ReturnType<typeof lstat>>
  try {
    current = await lstat(path)
  } catch {
    throw new TaskRunJournalCorruptError('Task run journal leaf changed during access')
  }
  if (current.isSymbolicLink() || !current.isFile() || !sameFileIdentity(fileIdentity(current), expected)) {
    throw new TaskRunJournalCorruptError('Task run journal leaf is not a stable regular file')
  }
}

function journalLeafError(error: unknown): boolean {
  return isRecord(error)
    && ['ELOOP', 'EISDIR', 'ENODEV', 'ENXIO', 'ENOTDIR'].includes(String(error.code))
}

async function openJournalFile(path: string, flags: number, mode?: number): Promise<JournalFileHandle | null> {
  try {
    return await open(path, flags, mode)
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') return null
    if (journalLeafError(error)) {
      throw new TaskRunJournalCorruptError('Task run journal leaf is not a safe regular file')
    }
    throw error
  }
}

async function readEventsFromHandle(
  path: string,
  handle: JournalFileHandle,
): Promise<{ readonly events: readonly TaskRunJournalEvent[]; readonly identity: JournalFileIdentity }> {
  const opened = assertRegularJournalFile(await handle.stat())
  if (opened.size > MAX_JOURNAL_BYTES) {
    throw new TaskRunJournalCorruptError('Task run journal exceeds its byte budget')
  }
  await assertJournalPathIdentity(path, opened)

  const bytes = Buffer.allocUnsafe(Math.min(opened.size, MAX_JOURNAL_BYTES) + 1)
  let total = 0
  while (total < bytes.byteLength) {
    const { bytesRead } = await handle.read(bytes, total, bytes.byteLength - total, total)
    if (bytesRead === 0) break
    total += bytesRead
  }
  if (total > MAX_JOURNAL_BYTES) {
    throw new TaskRunJournalCorruptError('Task run journal exceeds its byte budget')
  }

  const afterRead = assertRegularJournalFile(await handle.stat())
  if (!sameFileIdentity(opened, afterRead)) {
    throw new TaskRunJournalCorruptError('Task run journal changed during read')
  }
  await assertJournalPathIdentity(path, afterRead)
  return {
    events: parseEvents(bytes.subarray(0, total).toString('utf8')),
    identity: afterRead,
  }
}

async function ordinaryDirectory(path: string): Promise<boolean> {
  try {
    const openedDirectoryPath = process.platform === 'linux'
      && /^\/(?:dev\/fd|proc\/self\/fd)\/\d+$/.test(path)
      ? `${path}/.`
      : path
    const info = await lstat(openedDirectoryPath)
    return info.isDirectory() && !info.isSymbolicLink()
  } catch {
    return false
  }
}

async function journalDirectory(
  changeDir: string,
  revisionId: string,
  create: boolean,
): Promise<string | null> {
  if (!safeId(revisionId) || !await ordinaryDirectory(changeDir)) {
    throw new TypeError('Task run journal identity is invalid')
  }
  let current = changeDir
  for (const segment of ['.pipeline', 'task-runs', revisionId]) {
    current = join(current, segment)
    if (create) {
      try {
        await mkdir(current)
      } catch (error) {
        if (!isRecord(error) || error.code !== 'EEXIST') throw error
      }
    } else {
      try {
        await lstat(current)
      } catch (error) {
        if (isRecord(error) && error.code === 'ENOENT') return null
        throw error
      }
    }
    if (!await ordinaryDirectory(current)) {
      throw new TaskRunJournalCorruptError('Task run journal directory is not an owned directory')
    }
  }
  return current
}

async function events(changeDir: string, revisionId: string): Promise<readonly TaskRunJournalEvent[]> {
  const directory = await journalDirectory(changeDir, revisionId, false)
  if (directory === null) return []
  const path = join(directory, 'events.jsonl')
  const handle = await openJournalFile(
    path,
    constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW,
  )
  if (handle === null) return []
  try {
    return (await readEventsFromHandle(path, handle)).events
  } finally {
    await handle.close()
  }
}

export async function readTaskRunJournal(changeDir: string, revisionId: string): Promise<TaskRunJournal> {
  const history = await events(changeDir, revisionId)
  const attempts: WorkItemAttemptFact[] = []
  const operations: TaskRunOperationFact[] = []
  const validatorVerdicts = new Map<string, TaskRunValidatorFact>()
  const identities = new Set<string>()
  const attemptCoordinates = new Map<string, string>()
  const latestAttemptById = new Map<string, WorkItemAttemptFact>()
  for (const event of history) {
    const identity = event.type === 'attempt'
      ? `attempt:${event.attempt.attempt_id}:${event.sequence}`
      : event.type === 'operation'
        ? `operation:${event.operation.operation_id}`
        : `validator:${event.verdict.scope}:${event.verdict.target_id ?? 'run'}:${event.verdict.validator_id}:${event.sequence}`
    if (identities.has(identity)) throw new TaskRunJournalCorruptError('Task run event identity is duplicated')
    identities.add(identity)
    if (event.type === 'attempt') {
      const coordinate = `${event.attempt.work_item_id}:${event.attempt.attempt_number}`
      const coordinateAttemptId = attemptCoordinates.get(coordinate)
      if (coordinateAttemptId !== undefined && coordinateAttemptId !== event.attempt.attempt_id) {
        throw new TaskRunJournalCorruptError('Task run attempt coordinate has conflicting identities')
      }
      attemptCoordinates.set(coordinate, event.attempt.attempt_id)
      const previous = latestAttemptById.get(event.attempt.attempt_id)
      assertAttemptTransition(previous, event.attempt)
      const projected = { ...event.attempt, journal_sequence: event.sequence }
      latestAttemptById.set(event.attempt.attempt_id, projected)
      attempts.push(projected)
    }
    else if (event.type === 'operation') operations.push({ ...event.operation, journal_sequence: event.sequence })
    else validatorVerdicts.set(
      `${event.verdict.scope}:${event.verdict.target_id ?? 'run'}:${event.verdict.validator_id}`,
      event.verdict,
    )
  }
  return {
    run_revision: history.length,
    attempts,
    operations,
    validator_verdicts: [...validatorVerdicts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, verdict]) => verdict),
  }
}

async function appendEvent(
  changeDir: string,
  revisionId: string,
  expectedRunRevision: number,
  event: Omit<AttemptEvent, 'sequence'> | Omit<OperationEvent, 'sequence'> | Omit<ValidatorEvent, 'sequence'>,
): Promise<number> {
  if (!Number.isSafeInteger(expectedRunRevision) || expectedRunRevision < 0) {
    throw new TypeError('Task run expected revision is invalid')
  }
  return withLock(changeDir, async () => {
    const directory = await journalDirectory(changeDir, revisionId, true)
    if (directory === null) throw new TaskRunJournalCorruptError('Task run journal directory is missing')
    const path = join(directory, 'events.jsonl')
    const handle = await openJournalFile(
      path,
      constants.O_RDWR | constants.O_APPEND | constants.O_CREAT | constants.O_NONBLOCK | constants.O_NOFOLLOW,
      0o600,
    )
    if (handle === null) throw new TaskRunJournalCorruptError('Task run journal leaf disappeared')
    try {
      const snapshot = await readEventsFromHandle(path, handle)
      const current = snapshot.events
      if (current.length !== expectedRunRevision) {
        throw new TaskRunRevisionConflictError('Task run expected revision is stale')
      }
      if (event.type === 'attempt') {
        const coordinateConflict = current.find((entry) => entry.type === 'attempt'
          && entry.attempt.work_item_id === event.attempt.work_item_id
          && entry.attempt.attempt_number === event.attempt.attempt_number
          && entry.attempt.attempt_id !== event.attempt.attempt_id)
        if (coordinateConflict !== undefined) {
          throw new TaskRunJournalCorruptError('Task run attempt coordinate has conflicting identities')
        }
        const previous = [...current].reverse().find((entry) =>
          entry.type === 'attempt' && entry.attempt.attempt_id === event.attempt.attempt_id)
        assertAttemptTransition(previous?.type === 'attempt' ? previous.attempt : undefined, event.attempt)
      } else if (event.type === 'operation' && current.some((entry) =>
        entry.type === 'operation' && entry.operation.operation_id === event.operation.operation_id)) {
        throw new TaskRunJournalCorruptError('Task run event identity is duplicated')
      }
      const sequence = current.length + 1
      const line = `${JSON.stringify({ ...event, sequence })}\n`
      const beforeWrite = assertRegularJournalFile(await handle.stat())
      if (!sameFileIdentity(beforeWrite, snapshot.identity)) {
        throw new TaskRunJournalCorruptError('Task run journal changed before append')
      }
      await assertJournalPathIdentity(path, beforeWrite)
      const encodedLine = Buffer.from(line, 'utf8')
      if (beforeWrite.size + encodedLine.byteLength > MAX_JOURNAL_BYTES) {
        throw new TaskRunJournalCorruptError('Task run journal would exceed its byte budget')
      }
      const { bytesWritten } = await handle.write(encodedLine, 0, encodedLine.byteLength, null)
      if (bytesWritten !== encodedLine.byteLength) {
        throw new TaskRunJournalCorruptError('Task run journal append was incomplete')
      }
      await handle.sync()
      const afterWrite = assertRegularJournalFile(await handle.stat())
      if (!sameFileIdentity(afterWrite, {
        dev: beforeWrite.dev,
        ino: beforeWrite.ino,
        size: beforeWrite.size + encodedLine.byteLength,
      })) {
        throw new TaskRunJournalCorruptError('Task run journal changed during append')
      }
      await assertJournalPathIdentity(path, afterWrite)
      return sequence
    } finally {
      await handle.close()
    }
  })
}

export async function appendTaskRunAttempt(
  changeDir: string,
  revisionId: string,
  expectedRunRevision: number,
  attempt: WorkItemAttemptFact,
): Promise<number> {
  if (!validAttempt(attempt)) throw new TypeError('Task run attempt is invalid')
  return appendEvent(changeDir, revisionId, expectedRunRevision, {
    schema_version: JOURNAL_SCHEMA_VERSION,
    type: 'attempt',
    attempt,
  })
}

export async function appendTaskRunOperation(
  changeDir: string,
  revisionId: string,
  operation: TaskRunOperationFact,
): Promise<number> {
  if (!validOperation(operation)) throw new TypeError('Task run operation is invalid')
  return appendEvent(changeDir, revisionId, operation.expected_run_revision, {
    schema_version: JOURNAL_SCHEMA_VERSION,
    type: 'operation',
    operation,
  })
}

export async function appendTaskRunValidatorVerdict(
  changeDir: string,
  revisionId: string,
  expectedRunRevision: number,
  verdict: TaskRunValidatorFact,
): Promise<number> {
  if (!validValidator(verdict)) throw new TypeError('Task run validator verdict is invalid')
  return appendEvent(changeDir, revisionId, expectedRunRevision, {
    schema_version: JOURNAL_SCHEMA_VERSION,
    type: 'validator',
    verdict,
  })
}
