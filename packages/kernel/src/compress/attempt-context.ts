/**
 * Durable attempt context pruning (GOAL H2).
 *
 * The input is a compact projection of append-only run facts.  It deliberately has no `pattern`
 * or autonomy `level`: those are policy metadata, not evidence that an execution is making
 * progress.  All functions are deterministic and side-effect free.
 */
import { createHash } from 'node:crypto'
import type { RunResult } from '../loops/ledger-types.js'
import { required } from '../required.js'

export interface RunAttemptRecord {
  readonly attempt_id: string
  readonly loop_id: string
  readonly change: string
  readonly result: RunResult
  readonly recorded_at: string
  /** Durable human-readable terminal detail, when one was recorded. */
  readonly detail?: string
}

export interface NormalizedAttemptError {
  readonly message: string
  readonly fingerprint: string
}

export interface AttemptStagnation {
  readonly stagnant: boolean
  readonly fingerprint?: string
  readonly repeatedAttempts: readonly string[]
}

export interface AttemptContextOptions {
  /** Number of newest attempts retained even when they add no new signal. Default: 3. */
  readonly tail?: number
  /** Maximum rendered characters. Whole attempt lines are removed; lines are never sliced. */
  readonly maxChars?: number
  /** Consecutive equal failure fingerprints required for stagnation. Default: 3. */
  readonly stagnationThreshold?: number
}

export interface AttemptContext {
  readonly loop_id: string | null
  readonly change: string | null
  readonly attempts: readonly RunAttemptRecord[]
  readonly omittedAttemptIds: readonly string[]
  readonly stagnation: AttemptStagnation
  readonly rendered: string
}

const FAILURE_RESULTS = new Set<RunResult>(['failed', 'retry-queued', 'conflict'])

/** Remove volatile execution coordinates while retaining the semantic failure message. */
export function normalizeAttemptError(input: unknown): NormalizedAttemptError {
  const source = input instanceof Error ? input.message : typeof input === 'string' ? input : String(input)
  const message = source
    .replace(/^\s*(?:(?:[A-Za-z][A-Za-z0-9_.]*Error|Error):\s*)/i, '')
    .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/g, '<timestamp>')
    .replace(/\breq_[A-Za-z0-9_-]+\b/g, '<request-id>')
    .replace(/(?:\/private)?\/tmp\/[^/\s]+/g, '<tmp>')
    .replace(/:(\d+)(?::\d+)?\b/g, ':<line>')
    .replace(/\s+/g, ' ')
    .trim()
  return {
    message,
    fingerprint: createHash('sha256').update(message).digest('hex'),
  }
}

function failureFingerprint(record: RunAttemptRecord): string | null {
  if (!FAILURE_RESULTS.has(record.result) || record.detail === undefined || record.detail.trim() === '') return null
  return normalizeAttemptError(record.detail).fingerprint
}

/** Detect a repeated failure at the newest edge; a non-failure or changed fingerprint breaks it. */
export function detectAttemptStagnation(
  records: readonly RunAttemptRecord[],
  options: { readonly threshold?: number } = {},
): AttemptStagnation {
  const threshold = Math.max(2, Math.floor(options.threshold ?? 3))
  if (records.length === 0) return { stagnant: false, repeatedAttempts: [] }
  const newest = required(records[records.length - 1])
  const fingerprint = failureFingerprint(newest)
  if (fingerprint === null) return { stagnant: false, repeatedAttempts: [] }

  const repeated: string[] = []
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const record = required(records[i])
    if (failureFingerprint(record) !== fingerprint) break
    repeated.unshift(record.attempt_id)
  }
  return {
    stagnant: repeated.length >= threshold,
    fingerprint,
    repeatedAttempts: repeated,
  }
}

function assertOneRun(records: readonly RunAttemptRecord[]): void {
  const first = records[0]
  if (first === undefined) return
  if (records.some((record) => record.loop_id !== first.loop_id || record.change !== first.change)) {
    throw new Error('attempt context records must share the same loop_id and change')
  }
}

function recordLine(record: RunAttemptRecord): string {
  const normalized = record.detail === undefined ? '' : normalizeAttemptError(record.detail).message
  return `- ${record.attempt_id} ${record.recorded_at} ${record.result}${normalized === '' ? '' : `: ${normalized}`}`
}

function render(
  loopId: string,
  change: string,
  records: readonly RunAttemptRecord[],
  omitted: readonly string[],
): string {
  const lines = [`# Attempts: ${loopId}/${change}`, ...records.map(recordLine)]
  if (omitted.length > 0) lines.push(`- omitted: ${omitted.join(', ')}`)
  return lines.join('\n')
}

function signalChanged(previous: RunAttemptRecord, current: RunAttemptRecord): boolean {
  return previous.result !== current.result || failureFingerprint(previous) !== failureFingerprint(current)
}

/**
 * Keep the first observation, every semantic result/fingerprint transition, and a configurable
 * newest tail.  If the character budget is exceeded, remove oldest non-newest whole records.
 */
export function buildAttemptContext(
  records: readonly RunAttemptRecord[],
  options: AttemptContextOptions = {},
): AttemptContext {
  assertOneRun(records)
  if (records.length === 0) {
    return {
      loop_id: null,
      change: null,
      attempts: [],
      omittedAttemptIds: [],
      stagnation: { stagnant: false, repeatedAttempts: [] },
      rendered: '',
    }
  }

  const tail = Math.max(1, Math.floor(options.tail ?? 3))
  const maxChars = Math.max(1, Math.floor(options.maxChars ?? 8_000))
  const selected = new Set<number>([0, records.length - 1])
  for (let i = 1; i < records.length; i += 1) {
    if (signalChanged(required(records[i - 1]), required(records[i]))) selected.add(i)
  }
  for (let i = Math.max(0, records.length - tail); i < records.length; i += 1) selected.add(i)

  let indexes = [...selected].sort((a, b) => a - b)
  const loopId = required(records[0]).loop_id
  const change = required(records[0]).change
  const omittedFor = (kept: readonly number[]): string[] => records
    .filter((_record, index) => !kept.includes(index))
    .map((record) => record.attempt_id)

  let omitted = omittedFor(indexes)
  let rendered = render(loopId, change, indexes.map((index) => required(records[index])), omitted)
  while (rendered.length > maxChars && indexes.length > 1) {
    indexes = indexes.slice(1)
    omitted = omittedFor(indexes)
    rendered = render(loopId, change, indexes.map((index) => required(records[index])), omitted)
  }
  if (rendered.length > maxChars) {
    // A single newest detail may itself exceed the budget. Keep the complete record identity and
    // result, but omit its optional detail as one whole field rather than slicing arbitrary bytes.
    const newest = required(records[required(indexes[indexes.length - 1])])
    const compact = { ...newest, detail: undefined }
    const compactRendered = render(loopId, change, [compact], omittedFor([records.length - 1]))
    rendered = compactRendered.length <= maxChars ? compactRendered : recordLine(compact)
    indexes = [records.length - 1]
    omitted = omittedFor(indexes)
  }

  return {
    loop_id: loopId,
    change,
    attempts: indexes.map((index) => required(records[index])),
    omittedAttemptIds: omitted,
    stagnation: detectAttemptStagnation(records, { threshold: options.stagnationThreshold }),
    rendered,
  }
}
