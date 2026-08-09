import { constants } from 'node:fs'
import { lstat, open } from 'node:fs/promises'
import { join } from 'node:path'
import {
  INTERACTION_PROJECTION_FILE,
  interactionLineHash,
  type InteractionEventV1,
} from '../interaction/contract.js'
import { parseInteractionEventLine, serializeInteractionEvent } from '../interaction/codec.js'
import { createInteractionEvent } from '../interaction/codec.js'
import type { InteractionEventRecordDraft, InteractionEventRecorder } from '../interaction/ports.js'
import { decodeUtf8Text, DocumentLedgerError, readBoundedRegularFile } from './document-path.js'

export const INTERACTION_MAX_BYTES = 1024 * 1024
export const INTERACTION_MAX_LINE_BYTES = 64 * 1024
export const INTERACTION_MAX_EVENTS = 10_000

export type InteractionProjectionReadResult =
  | { readonly kind: 'missing'; readonly path: string; readonly diagnostic: 'projection-unavailable' }
  | {
      readonly kind: 'valid'
      readonly path: string
      readonly events: readonly InteractionEventV1[]
      readonly rawLines: readonly string[]
    }

export class InteractionProjectionError extends Error {
  readonly diagnostic:
    | 'projection-unavailable'
    | 'sequence-gap'
    | 'hash-chain-mismatch'
    | 'event-schema-invalid'
    | 'projection-size-exceeded'
    | 'projection-not-regular'

  constructor(diagnostic: InteractionProjectionError['diagnostic'], message: string) {
    super(message)
    this.name = 'InteractionProjectionError'
    this.diagnostic = diagnostic
  }
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const value = Reflect.get(error, 'code')
  return typeof value === 'string' ? value : undefined
}

type RegularStats = Awaited<ReturnType<typeof lstat>>

async function assertRegular(path: string, missingAllowed: boolean): Promise<RegularStats | false> {
  try {
    const entry = await lstat(path)
    if (entry.isSymbolicLink() || !entry.isFile()) {
      throw new InteractionProjectionError('projection-not-regular', 'interaction projection 必须是非 symlink 普通文件')
    }
    return entry
  } catch (error) {
    if (missingAllowed && errorCode(error) === 'ENOENT') return false
    throw error
  }
}

function splitLines(raw: string): readonly string[] {
  if (raw === '') return []
  if (!raw.endsWith('\n')) throw new InteractionProjectionError('event-schema-invalid', 'interaction projection 尾行缺少换行')
  const lines = raw.split('\n').slice(0, -1).map((line) => `${line}\n`)
  if (lines.some((line) => Buffer.byteLength(line, 'utf8') > INTERACTION_MAX_LINE_BYTES)) {
    throw new InteractionProjectionError('projection-size-exceeded', 'interaction projection 单行超过大小上限')
  }
  if (lines.length > INTERACTION_MAX_EVENTS) {
    throw new InteractionProjectionError('projection-size-exceeded', 'interaction projection event 数超过上限')
  }
  return lines
}

export function interactionProjectionPath(changeDir: string): string {
  return join(changeDir, INTERACTION_PROJECTION_FILE)
}

export async function readInteractionProjection(changeDir: string): Promise<InteractionProjectionReadResult> {
  const path = interactionProjectionPath(changeDir)
  const entry = await assertRegular(path, true)
  if (entry === false) return { kind: 'missing', path, diagnostic: 'projection-unavailable' }
  if (entry.size > INTERACTION_MAX_BYTES) {
    throw new InteractionProjectionError('projection-size-exceeded', 'interaction projection 超过大小上限')
  }
  let content: Buffer
  try {
    content = await readBoundedRegularFile(path, INTERACTION_MAX_BYTES, 'interaction projection')
  } catch (error) {
    if (error instanceof DocumentLedgerError && error.message.includes('超过')) {
      throw new InteractionProjectionError('projection-size-exceeded', 'interaction projection 超过大小上限')
    }
    if (error instanceof DocumentLedgerError && (error.message.includes('symlink') || error.message.includes('普通文件'))) {
      throw new InteractionProjectionError('projection-not-regular', 'interaction projection 必须是非 symlink 普通文件')
    }
    throw new InteractionProjectionError('projection-unavailable', 'interaction projection 读取失败')
  }
  let raw: string
  try {
    raw = decodeUtf8Text(content, 'interaction projection')
  } catch {
    throw new InteractionProjectionError('event-schema-invalid', 'interaction projection 不是有效 UTF-8 文本')
  }
  if (Buffer.byteLength(raw, 'utf8') > INTERACTION_MAX_BYTES) {
    throw new InteractionProjectionError('projection-size-exceeded', 'interaction projection 超过大小上限')
  }
  const rawLines = splitLines(raw)
  const events: InteractionEventV1[] = []
  let previousRaw: string | undefined
  for (const line of rawLines) {
    let event: InteractionEventV1
    try {
      event = parseInteractionEventLine(line)
    } catch (error) {
      throw new InteractionProjectionError('event-schema-invalid', `interaction projection event 非法: ${String(error)}`)
    }
    const expectedSequence = events.length + 1
    if (event.sequence !== expectedSequence) {
      throw new InteractionProjectionError('sequence-gap', `interaction projection sequence 断裂: expected=${expectedSequence} observed=${event.sequence}`)
    }
    const expectedPrevious = previousRaw === undefined ? null : interactionLineHash(previousRaw)
    if (event.previousEventHash !== expectedPrevious) {
      throw new InteractionProjectionError('hash-chain-mismatch', 'interaction projection previous_event_hash 不匹配')
    }
    events.push(event)
    previousRaw = line
  }
  return { kind: 'valid', path, events, rawLines }
}

/**
 * Append exactly one event while the caller already owns the canonical Change lock.  This method
 * intentionally does not acquire a lock itself: nested withLock calls are non-reentrant.
 */
export async function appendInteractionEventUnderLock(
  changeDir: string,
  event: InteractionEventV1,
): Promise<void> {
  const path = interactionProjectionPath(changeDir)
  const existing = await readInteractionProjection(changeDir)
  if (existing.kind === 'valid' && existing.events.length >= INTERACTION_MAX_EVENTS) {
    throw new InteractionProjectionError('projection-size-exceeded', 'interaction projection event 数达到上限')
  }
  const previousEvent = existing.kind === 'valid' ? existing.events.at(-1) : undefined
  const previousRaw = existing.kind === 'valid' ? existing.rawLines.at(-1) : undefined
  const expectedSequence = (previousEvent?.sequence ?? 0) + 1
  if (event.sequence !== expectedSequence) {
    throw new InteractionProjectionError('sequence-gap', `append sequence 非法: expected=${expectedSequence} observed=${event.sequence}`)
  }
  const expectedPrevious = previousRaw === undefined ? null : interactionLineHash(previousRaw)
  if (event.previousEventHash !== expectedPrevious) {
    throw new InteractionProjectionError('hash-chain-mismatch', 'append previous_event_hash 不匹配')
  }
  const line = serializeInteractionEvent(event)
  if (Buffer.byteLength(line, 'utf8') > INTERACTION_MAX_LINE_BYTES) {
    throw new InteractionProjectionError('projection-size-exceeded', 'interaction event 超过单行大小上限')
  }
  const existingSize = existing.kind === 'valid'
    ? existing.rawLines.reduce((total, current) => total + Buffer.byteLength(current, 'utf8'), 0)
    : 0
  if (existingSize + Buffer.byteLength(line, 'utf8') > INTERACTION_MAX_BYTES) {
    throw new InteractionProjectionError('projection-size-exceeded', 'interaction projection 超过大小上限')
  }
  try {
    const handle = await open(
      path,
      constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW,
      0o600,
    )
    try {
      const opened = await handle.stat()
      if (!opened.isFile()) throw new InteractionProjectionError('projection-not-regular', 'interaction projection 必须是非 symlink 普通文件')
      await handle.write(line, undefined, 'utf8')
    } finally {
      await handle.close()
    }
  } catch (error) {
    if (error instanceof InteractionProjectionError) throw error
    const code = errorCode(error)
    if (code === 'ELOOP' || code === 'EISDIR' || code === 'ENOTDIR') {
      throw new InteractionProjectionError('projection-not-regular', 'interaction projection 必须是非 symlink 普通文件')
    }
    throw new InteractionProjectionError('projection-unavailable', `interaction projection append 失败: ${String(error)}`)
  }
}

export interface InteractionEventStore {
  readonly appendUnderLock: (changeDir: string, event: InteractionEventV1) => Promise<void>
  readonly read: (changeDir: string) => Promise<InteractionProjectionReadResult>
}

export function createInteractionEventStore(): InteractionEventStore {
  return {
    appendUnderLock: appendInteractionEventUnderLock,
    read: readInteractionProjection,
  }
}

export function createInteractionEventRecorder(): InteractionEventRecorder {
  return {
    recordUnderLock: async (changeDir: string, draft: InteractionEventRecordDraft): Promise<InteractionEventV1> => {
      const current = await readInteractionProjection(changeDir)
      const previous = current.kind === 'valid' ? current.events.at(-1) : undefined
      const previousRaw = current.kind === 'valid' ? current.rawLines.at(-1) : undefined
      const event = createInteractionEvent({
        ...draft,
        sequence: (previous?.sequence ?? 0) + 1,
        previousEventHash: previousRaw === undefined ? null : interactionLineHash(previousRaw),
      })
      await appendInteractionEventUnderLock(changeDir, event)
      return event
    },
  }
}
