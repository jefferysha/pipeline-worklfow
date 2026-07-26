import { createHash } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import {
  atomicWriteFile,
  validateObserveAction,
  validateSourceCheckpoint,
  withLock,
  type ObserveActionKind,
  type SourceCheckpoint,
} from '@tenon/kernel'

export interface TriageCheckpointKey {
  readonly sourceId: string
  readonly actionKind: ObserveActionKind
}

export interface TriageCheckpointSnapshot {
  readonly key: TriageCheckpointKey
  /** Monotonic per-key CAS revision. Zero means the key has never been committed. */
  readonly revision: number
  readonly checkpoint: SourceCheckpoint | null
}

export interface TriageCheckpointStore {
  read(key: TriageCheckpointKey): Promise<TriageCheckpointSnapshot>
  /**
   * Serialize the full observe→materialize→checkpoint sequence for one source/action. Aborting
   * while queued rejects the caller immediately; the deferred lock callback checks the same signal
   * before invoking work, so it cannot run later after cancellation.
   */
  withRunLock<T>(
    key: TriageCheckpointKey,
    signal: AbortSignal,
    work: () => Promise<T>,
  ): Promise<T>
  compareAndSet(
    key: TriageCheckpointKey,
    expectedRevision: number,
    next: SourceCheckpoint,
  ): Promise<boolean>
}

export interface TriageCheckpointStoreOptions {
  readonly repoRoot: string
}

export type TriageCheckpointStoreErrorReason =
  | 'invalid-key'
  | 'invalid-checkpoint'
  | 'binding-mismatch'
  | 'corrupt'
  | 'io'

export class TriageCheckpointStoreError extends Error {
  readonly _tag = 'TriageCheckpointStoreError' as const

  constructor(
    readonly reason: TriageCheckpointStoreErrorReason,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'TriageCheckpointStoreError'
  }
}

interface DurableCheckpointRecord {
  readonly schemaVersion: 1
  readonly sourceId: string
  readonly actionKind: ObserveActionKind
  readonly revision: number
  readonly checkpoint: SourceCheckpoint
}

const RECORD_KEYS = new Set([
  'schemaVersion',
  'sourceId',
  'actionKind',
  'revision',
  'checkpoint',
])

const safeErrorText = (error: unknown): string => {
  try {
    if (error instanceof Error && error.message !== '') return error.message
    return String(error)
  } catch {
    return '<unreadable error>'
  }
}

const isEnoent = (error: unknown): boolean => (
  typeof error === 'object'
  && error !== null
  && 'code' in error
  && (error as NodeJS.ErrnoException).code === 'ENOENT'
)

function canonicalKey(input: TriageCheckpointKey): TriageCheckpointKey {
  const validated = validateObserveAction({
    schemaVersion: 1,
    kind: input.actionKind,
    sourceId: input.sourceId,
  })
  if (!validated.ok) {
    throw new TriageCheckpointStoreError(
      'invalid-key',
      `invalid triage checkpoint key: ${validated.errors.join('; ')}`,
    )
  }
  return Object.freeze({
    sourceId: validated.value.sourceId,
    actionKind: validated.value.kind,
  })
}

function checkpointForKey(input: unknown, key: TriageCheckpointKey): SourceCheckpoint {
  const validated = validateSourceCheckpoint(input)
  if (!validated.ok) {
    throw new TriageCheckpointStoreError(
      'invalid-checkpoint',
      `invalid triage checkpoint: ${validated.errors.join('; ')}`,
    )
  }
  if (
    validated.value.sourceId !== key.sourceId
    || validated.value.actionKind !== key.actionKind
  ) {
    throw new TriageCheckpointStoreError(
      'binding-mismatch',
      'triage checkpoint is not bound to the requested sourceId/actionKind',
    )
  }
  return validated.value
}

const keyDigest = (key: TriageCheckpointKey): string => createHash('sha256')
  .update(JSON.stringify([1, key.sourceId, key.actionKind]), 'utf8')
  .digest('hex')

function slotDirectory(repoRoot: string, key: TriageCheckpointKey): string {
  return join(resolve(repoRoot), '.pipeline', 'triage', 'checkpoints', keyDigest(key))
}

export function triageCheckpointFilePath(
  repoRoot: string,
  input: TriageCheckpointKey,
): string {
  const key = canonicalKey(input)
  return join(slotDirectory(repoRoot, key), 'checkpoint.json')
}

function emptySnapshot(key: TriageCheckpointKey): TriageCheckpointSnapshot {
  return Object.freeze({ key, revision: 0, checkpoint: null })
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted', 'AbortError')
}

async function withAbortableWait<T>(
  slot: string,
  signal: AbortSignal,
  work: () => Promise<T>,
): Promise<T> {
  signal.throwIfAborted()
  return new Promise<T>((resolvePromise, rejectPromise) => {
    let entered = false
    let callerSettled = false
    const settle = (kind: 'resolve' | 'reject', value: T | unknown): void => {
      if (callerSettled) return
      callerSettled = true
      signal.removeEventListener('abort', onAbort)
      if (kind === 'resolve') resolvePromise(value as T)
      else rejectPromise(value)
    }
    const onAbort = (): void => {
      // Once work has entered the critical section, its own signal checks own cancellation. This
      // branch is specifically the lock-wait boundary: return immediately without later work.
      if (!entered) settle('reject', abortReason(signal))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    const lock = withLock(slot, async () => {
      entered = true
      signal.throwIfAborted()
      return work()
    })
    void lock.then(
      (value) => settle('resolve', value),
      (error) => settle('reject', error),
    )
  })
}

function parseDurableRecord(text: string, key: TriageCheckpointKey): TriageCheckpointSnapshot {
  let input: unknown
  try {
    input = JSON.parse(text)
  } catch (error) {
    throw new TriageCheckpointStoreError(
      'corrupt',
      `triage checkpoint file is not valid JSON: ${safeErrorText(error)}`,
      { cause: error },
    )
  }
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new TriageCheckpointStoreError('corrupt', 'triage checkpoint file must contain an object')
  }
  const record = input as Record<string, unknown>
  const keys = Reflect.ownKeys(record)
  if (
    keys.some((field) => typeof field !== 'string' || !RECORD_KEYS.has(field))
    || keys.length !== RECORD_KEYS.size
  ) {
    throw new TriageCheckpointStoreError(
      'corrupt',
      'triage checkpoint file has missing or unknown fields',
    )
  }
  if (
    record.schemaVersion !== 1
    || record.sourceId !== key.sourceId
    || record.actionKind !== key.actionKind
    || typeof record.revision !== 'number'
    || !Number.isSafeInteger(record.revision)
    || record.revision <= 0
  ) {
    throw new TriageCheckpointStoreError(
      'corrupt',
      'triage checkpoint file has an invalid version, binding, or revision',
    )
  }
  let checkpoint: SourceCheckpoint
  try {
    checkpoint = checkpointForKey(record.checkpoint, key)
  } catch (error) {
    throw new TriageCheckpointStoreError(
      'corrupt',
      `triage checkpoint file contains an invalid checkpoint: ${safeErrorText(error)}`,
      { cause: error },
    )
  }
  return Object.freeze({
    key,
    revision: record.revision,
    checkpoint,
  })
}

async function readPath(
  file: string,
  key: TriageCheckpointKey,
): Promise<TriageCheckpointSnapshot> {
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    if (isEnoent(error)) return emptySnapshot(key)
    throw new TriageCheckpointStoreError(
      'io',
      `triage checkpoint read failed: ${safeErrorText(error)}`,
      { cause: error },
    )
  }
  return parseDurableRecord(text, key)
}

const encodeRecord = (
  key: TriageCheckpointKey,
  revision: number,
  checkpoint: SourceCheckpoint,
): string => `${JSON.stringify({
  schemaVersion: 1,
  sourceId: key.sourceId,
  actionKind: key.actionKind,
  revision,
  checkpoint,
} satisfies DurableCheckpointRecord)}\n`

/** Project-local, per-source/action checkpoint store with cross-process CAS serialization. */
export function createTriageCheckpointStore(
  options: TriageCheckpointStoreOptions,
): TriageCheckpointStore {
  const repoRoot = resolve(options.repoRoot)

  return {
    async read(input) {
      const key = canonicalKey(input)
      return readPath(triageCheckpointFilePath(repoRoot, key), key)
    },

    async withRunLock(input, signal, work) {
      const key = canonicalKey(input)
      const runSlot = join(slotDirectory(repoRoot, key), 'orchestration')
      signal.throwIfAborted()
      await mkdir(runSlot, { recursive: true })
      signal.throwIfAborted()
      return withAbortableWait(runSlot, signal, work)
    },

    async compareAndSet(input, expectedRevision, inputCheckpoint) {
      const key = canonicalKey(input)
      if (
        !Number.isSafeInteger(expectedRevision)
        || expectedRevision < 0
        || expectedRevision >= Number.MAX_SAFE_INTEGER
      ) {
        throw new TriageCheckpointStoreError(
          'invalid-checkpoint',
          'expected checkpoint revision must be a non-negative safe integer',
        )
      }
      const checkpoint = checkpointForKey(inputCheckpoint, key)
      const file = triageCheckpointFilePath(repoRoot, key)
      const slot = dirname(file)
      await mkdir(slot, { recursive: true })
      return withLock(slot, async () => {
        const current = await readPath(file, key)
        if (current.revision !== expectedRevision) return false
        try {
          await atomicWriteFile(file, encodeRecord(key, expectedRevision + 1, checkpoint))
        } catch (error) {
          throw new TriageCheckpointStoreError(
            'io',
            `triage checkpoint atomic write failed: ${safeErrorText(error)}`,
            { cause: error },
          )
        }
        return true
      })
    },
  }
}
