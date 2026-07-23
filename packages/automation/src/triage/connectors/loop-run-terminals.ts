import { createHash } from 'node:crypto'
import {
  createLoopLedgerStore,
  type Observation,
  type ObservationPage,
  type ObserveAction,
  type RunRecord,
  type SourceCheckpoint,
} from '@pipeline-lite/kernel'
import type { SourceConnector } from '../source.js'

export type LoopRunTerminalsAction = Extract<ObserveAction, { readonly kind: 'loop-run-terminals' }>

export interface LoopRunTerminalsConnectorOptions {
  readonly repoRoot: string
  readonly maxItems?: number
}

export type LoopRunTerminalsSourceFailureReason =
  | 'checkpoint-invalid'
  | 'checkpoint-not-found'
  | 'ledger-degraded'
  | 'duplicate-record-id'

/** A source integrity failure never yields a partial observation page. */
export class LoopRunTerminalsSourceError extends Error {
  readonly _tag = 'LoopRunTerminalsSourceError'
  readonly observations = Object.freeze([]) as readonly []

  constructor(
    readonly reason: LoopRunTerminalsSourceFailureReason,
    message: string,
  ) {
    super(message)
    this.name = 'LoopRunTerminalsSourceError'
  }
}

/** Canonical typed RunRecord projection carried inside provider-safe Observation.body JSON. */
export interface LoopRunTerminalBody {
  readonly sourceKey: string
  readonly loopId: string
  readonly change: string
  readonly attemptId: string
  readonly runRecordId: string
  readonly result: RunRecord['result']
  readonly reason: RunRecord['reason'] | null
  readonly level: RunRecord['level']
  readonly runner: string
  readonly error: RunRecord['error'] | null
}

/** Opaque SourceCheckpoint.cursor payload issued only after a whole page is materialized. */
export interface LoopRunTerminalsCursor {
  readonly schemaVersion: 1
  readonly lastRunRecordId: string | null
  readonly pageDigest: string
}

export type LoopRunTerminalsConnector = SourceConnector<
  LoopRunTerminalsAction,
  SourceCheckpoint,
  ObservationPage
>

type ObservedRunResult = Extract<RunRecord['result'], 'failed' | 'conflict' | 'retry-queued'>
const OBSERVED_RUN_RESULTS: ReadonlySet<RunRecord['result']> = new Set([
  'failed',
  'conflict',
  'retry-queued',
] satisfies readonly ObservedRunResult[])

const sha256 = (canonical: readonly unknown[]): string =>
  createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex')

const assertPositiveLimit = (value: number, name: string): void => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`)
  }
}

const invalidCheckpoint = (message: string): LoopRunTerminalsSourceError =>
  new LoopRunTerminalsSourceError('checkpoint-invalid', message)

const cursorFrom = (
  checkpoint: SourceCheckpoint | null,
  action: LoopRunTerminalsAction,
): LoopRunTerminalsCursor => {
  if (checkpoint === null) return { schemaVersion: 1, lastRunRecordId: null, pageDigest: sha256([]) }
  if (
    checkpoint.schemaVersion !== 1
    || checkpoint.sourceId !== action.sourceId
    || checkpoint.actionKind !== 'loop-run-terminals'
  ) {
    throw invalidCheckpoint('loop-run-terminals checkpoint is not bound to the requested source and action')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(checkpoint.cursor)
  } catch {
    throw invalidCheckpoint('loop-run-terminals checkpoint cursor is not valid JSON')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw invalidCheckpoint('loop-run-terminals checkpoint cursor must be an object')
  }
  const cursor = parsed as Partial<LoopRunTerminalsCursor>
  const keys = Object.keys(cursor)
  if (
    keys.length !== 3
    || !keys.includes('schemaVersion')
    || !keys.includes('lastRunRecordId')
    || !keys.includes('pageDigest')
    || cursor.schemaVersion !== 1
    || (cursor.lastRunRecordId !== null && (
      typeof cursor.lastRunRecordId !== 'string' || cursor.lastRunRecordId === ''
    ))
    || typeof cursor.pageDigest !== 'string'
    || !/^[0-9a-f]{64}$/.test(cursor.pageDigest)
  ) throw invalidCheckpoint('loop-run-terminals checkpoint cursor has an invalid canonical shape')
  return cursor as LoopRunTerminalsCursor
}

const bodyFor = (body: LoopRunTerminalBody): string => JSON.stringify(body)

const observationFor = (sourceId: string, record: RunRecord): Observation => ({
  schemaVersion: 1,
  observationId: `loop-run-terminal:${sha256([1, 'loop-run-terminals', sourceId, record.record_id])}`,
  sourceId,
  actionKind: 'loop-run-terminals',
  observedAt: record.finished_at,
  title: `Loop run ${record.result}: ${record.change}`,
  body: bodyFor({
    sourceKey: record.record_id,
    loopId: record.loop_id,
    change: record.change,
    attemptId: record.attempt_id,
    runRecordId: record.run_record_id,
    result: record.result,
    reason: record.reason ?? null,
    level: record.level,
    runner: record.runner,
    error: record.error ?? null,
  }),
})

/** Observe triage-worthy loop terminal records from the repository's durable append-only ledger. */
export function createLoopRunTerminalsConnector(
  options: LoopRunTerminalsConnectorOptions,
): LoopRunTerminalsConnector {
  const ledger = createLoopLedgerStore()
  const maxItems = options.maxItems ?? 100
  assertPositiveLimit(maxItems, 'maxItems')

  return {
    kind: 'loop-run-terminals',
    async observe({ action, checkpoint, limit, signal }): Promise<ObservationPage> {
      assertPositiveLimit(limit, 'limit')
      signal.throwIfAborted()
      const { records, rejected } = await ledger.read(options.repoRoot)
      signal.throwIfAborted()
      if (rejected.length > 0) {
        throw new LoopRunTerminalsSourceError(
          'ledger-degraded',
          `loop-run-terminals ledger contains ${rejected.length} rejected line(s)`,
        )
      }
      const recordIds = new Set<string>()
      for (const record of records) {
        if (recordIds.has(record.record_id)) {
          throw new LoopRunTerminalsSourceError(
            'duplicate-record-id',
            `loop-run-terminals ledger repeats record_id ${JSON.stringify(record.record_id)}`,
          )
        }
        recordIds.add(record.record_id)
      }

      const previousCursor = cursorFrom(checkpoint, action)
      let resumeIndex = 0
      if (previousCursor.lastRunRecordId !== null) {
        const checkpointIndex = records.findIndex(
          (record) => record.kind === 'run' && record.record_id === previousCursor.lastRunRecordId,
        )
        if (checkpointIndex < 0) {
          throw new LoopRunTerminalsSourceError(
            'checkpoint-not-found',
            `loop-run-terminals checkpoint record '${previousCursor.lastRunRecordId}' is absent`,
          )
        }
        resumeIndex = checkpointIndex + 1
      }

      const terminals = records.slice(resumeIndex).filter(
        (record): record is RunRecord => record.kind === 'run' && OBSERVED_RUN_RESULTS.has(record.result),
      )
      const selected = terminals.slice(0, Math.min(limit, maxItems))
      const observations = selected.map((record) => observationFor(action.sourceId, record))
      const lastRunRecordId = selected.at(-1)?.record_id ?? previousCursor.lastRunRecordId
      const hasMore = terminals.length > selected.length
      const cursor: LoopRunTerminalsCursor = {
        schemaVersion: 1,
        lastRunRecordId,
        pageDigest: sha256([
          1,
          'loop-run-terminals',
          action.sourceId,
          previousCursor.lastRunRecordId,
          selected.map((record) => record.record_id),
          hasMore,
        ]),
      }

      return {
        schemaVersion: 1,
        action: { schemaVersion: 1, kind: 'loop-run-terminals', sourceId: action.sourceId },
        observations,
        nextCheckpoint: {
          schemaVersion: 1,
          sourceId: action.sourceId,
          actionKind: 'loop-run-terminals',
          cursor: JSON.stringify(cursor),
        },
        hasMore,
      }
    },
  }
}
