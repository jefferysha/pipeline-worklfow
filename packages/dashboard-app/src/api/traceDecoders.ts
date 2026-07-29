import type {
  TraceRecordsResponse,
  TraceSessionRow,
  TraceSessionsResponse,
  TraceTimelineEntry,
  TraceTimelineResponse,
  TraceTimelineWarning,
} from './auditTypes'
import { isRecord } from './transport'

export function decodeTraceSessions(value: unknown): TraceSessionsResponse | null {
  if (!isRecord(value)
    || typeof value.generated_at !== 'string'
    || value.outbound !== 'local-only'
    || typeof value.count !== 'number'
    || !Array.isArray(value.sessions)) return null
  const sessions: TraceSessionRow[] = []
  for (const session of value.sessions) {
    if (!isRecord(session)
      || typeof session.id !== 'string'
      || typeof session.started_at !== 'string'
      || typeof session.updated_at !== 'string'
      || typeof session.date_key !== 'string'
      || typeof session.client !== 'string'
      || typeof session.proxy_mode !== 'string'
      || typeof session.status !== 'string'
      || typeof session.record_count !== 'number'
      || (session.summary !== null && !isRecord(session.summary))) return null
    sessions.push({
      id: session.id,
      started_at: session.started_at,
      updated_at: session.updated_at,
      date_key: session.date_key,
      client: session.client,
      proxy_mode: session.proxy_mode,
      status: session.status,
      record_count: session.record_count,
      summary: session.summary,
    })
  }
  return { generated_at: value.generated_at, outbound: value.outbound, count: value.count, sessions }
}

export function decodeTraceRecords(value: unknown): TraceRecordsResponse | null {
  if (!isRecord(value)
    || typeof value.generated_at !== 'string'
    || typeof value.outbound !== 'string'
    || typeof value.session !== 'string'
    || typeof value.count !== 'number'
    || !Array.isArray(value.records)
    || !value.records.every(isRecord)) return null
  return {
    generated_at: value.generated_at,
    outbound: value.outbound,
    session: value.session,
    count: value.count,
    records: value.records,
  }
}

function isTraceTimelineWarning(value: string): value is TraceTimelineWarning {
  return value === 'record-limit'
    || value === 'byte-limit'
    || value === 'malformed-record'
    || value === 'count-mismatch'
}

function safeNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function nullableSafeNonNegativeInteger(value: unknown): value is number | null {
  return value === null || safeNonNegativeInteger(value)
}

function nullableBoundedText(value: unknown, maxLength: number): value is string | null {
  return value === null || (typeof value === 'string' && value.length > 0 && value.length <= maxLength)
}

function decodeTraceTimelineEntry(value: unknown, expectedSequence: number): TraceTimelineEntry | null {
  if (!isRecord(value)
    || value.sequence !== expectedSequence
    || !nullableBoundedText(value.request_id, 256)
    || !nullableSafeNonNegativeInteger(value.turn)
    || !nullableBoundedText(value.timestamp, 64)
    || !nullableSafeNonNegativeInteger(value.duration_ms)
    || !nullableBoundedText(value.transport, 64)
    || !nullableBoundedText(value.method, 32)
    || !nullableBoundedText(value.path, 2048)
    || (typeof value.path === 'string' && value.path.includes('?'))
    || !(value.status_code === null
      || (safeNonNegativeInteger(value.status_code) && value.status_code >= 100 && value.status_code <= 599))
    || (value.outcome !== 'success' && value.outcome !== 'error' && value.outcome !== 'unknown')
    || (value.status_code === null && value.outcome !== 'unknown')
    || (typeof value.status_code === 'number' && value.status_code < 200 && value.outcome !== 'unknown')
    || (typeof value.status_code === 'number'
      && value.status_code >= 200 && value.status_code <= 399
      && value.outcome !== 'success')
    || (typeof value.status_code === 'number' && value.status_code >= 400 && value.outcome !== 'error')
    || !nullableBoundedText(value.model, 256)
    || !nullableSafeNonNegativeInteger(value.input_tokens)
    || !nullableSafeNonNegativeInteger(value.output_tokens)
    || !nullableSafeNonNegativeInteger(value.cached_input_tokens)
    || !nullableSafeNonNegativeInteger(value.stream_event_count)) return null
  return {
    sequence: value.sequence,
    request_id: value.request_id,
    turn: value.turn,
    timestamp: value.timestamp,
    duration_ms: value.duration_ms,
    transport: value.transport,
    method: value.method,
    path: value.path,
    status_code: value.status_code,
    outcome: value.outcome,
    model: value.model,
    input_tokens: value.input_tokens,
    output_tokens: value.output_tokens,
    cached_input_tokens: value.cached_input_tokens,
    stream_event_count: value.stream_event_count,
  }
}

export function decodeTraceTimeline(value: unknown): TraceTimelineResponse | null {
  if (!isRecord(value)
    || typeof value.generated_at !== 'string'
    || value.outbound !== 'local-only'
    || value.content !== 'metadata-only'
    || !isRecord(value.session)
    || typeof value.session.id !== 'string'
    || typeof value.session.client !== 'string'
    || typeof value.session.proxy_mode !== 'string'
    || typeof value.session.status !== 'string'
    || typeof value.session.started_at !== 'string'
    || typeof value.session.updated_at !== 'string'
    || !safeNonNegativeInteger(value.total_count)
    || !safeNonNegativeInteger(value.returned_count)
    || !safeNonNegativeInteger(value.skipped_count)
    || value.returned_count > value.total_count
    || typeof value.truncated !== 'boolean'
    || (value.integrity !== 'complete' && value.integrity !== 'partial')
    || !Array.isArray(value.warnings)
    || !Array.isArray(value.entries)
    || value.entries.length > 200
    || !isRecord(value.summary)
    || !safeNonNegativeInteger(value.summary.success_count)
    || !safeNonNegativeInteger(value.summary.error_count)
    || !safeNonNegativeInteger(value.summary.unknown_count)
    || !nullableSafeNonNegativeInteger(value.summary.total_duration_ms)
    || !nullableSafeNonNegativeInteger(value.summary.input_tokens)
    || !nullableSafeNonNegativeInteger(value.summary.output_tokens)
    || !nullableSafeNonNegativeInteger(value.summary.cached_input_tokens)) return null

  const warnings: TraceTimelineWarning[] = []
  const warningOrder: readonly TraceTimelineWarning[] = [
    'record-limit',
    'byte-limit',
    'malformed-record',
    'count-mismatch',
  ]
  for (const warning of value.warnings) {
    if (typeof warning !== 'string' || !isTraceTimelineWarning(warning)) return null
    if (warnings.includes(warning)) return null
    const previous = warnings.at(-1)
    if (previous !== undefined
      && warningOrder.indexOf(warning) <= warningOrder.indexOf(previous)) return null
    warnings.push(warning)
  }
  const hasPartialWarning = warnings.some((warning) => warning !== 'record-limit')
  const hasTruncationWarning = warnings.includes('record-limit') || warnings.includes('byte-limit')
  if ((value.integrity === 'complete' && hasPartialWarning)
    || (value.integrity === 'partial' && !hasPartialWarning)
    || value.truncated !== hasTruncationWarning) return null
  const entries: TraceTimelineEntry[] = []
  for (const [index, entry] of value.entries.entries()) {
    const decoded = decodeTraceTimelineEntry(entry, index + 1)
    if (!decoded) return null
    entries.push(decoded)
  }
  const outcomeCounts = entries.reduce(
    (counts, entry) => ({ ...counts, [entry.outcome]: counts[entry.outcome] + 1 }),
    { success: 0, error: 0, unknown: 0 },
  )
  if (value.returned_count !== entries.length
    || value.summary.success_count !== outcomeCounts.success
    || value.summary.error_count !== outcomeCounts.error
    || value.summary.unknown_count !== outcomeCounts.unknown) return null

  return {
    generated_at: value.generated_at,
    outbound: 'local-only',
    content: 'metadata-only',
    session: {
      id: value.session.id,
      client: value.session.client,
      proxy_mode: value.session.proxy_mode,
      status: value.session.status,
      started_at: value.session.started_at,
      updated_at: value.session.updated_at,
    },
    total_count: value.total_count,
    returned_count: value.returned_count,
    skipped_count: value.skipped_count,
    truncated: value.truncated,
    integrity: value.integrity,
    warnings,
    summary: {
      success_count: value.summary.success_count,
      error_count: value.summary.error_count,
      unknown_count: value.summary.unknown_count,
      total_duration_ms: value.summary.total_duration_ms,
      input_tokens: value.summary.input_tokens,
      output_tokens: value.summary.output_tokens,
      cached_input_tokens: value.summary.cached_input_tokens,
    },
    entries,
  }
}
