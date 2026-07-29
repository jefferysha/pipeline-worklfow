/**
 * traces 域 —— tap 流量查看器数据端（BACKLOG #34d / GOAL A7）。
 *
 * 消费 @tenon/tap 的 TraceStore（listSessions / readRecords）——但为守两条硬约束：
 *   ① server 零第三方运行时依赖 + tsc 构建不耦合 tap 构建顺序（tap 在 server 之后 build）；
 *   ② 只读 import tap 的 API（绝不改 tap）。
 * 故此处只定义**结构化 port**（TraceStoreReader），真 TraceStore 由上层注入（bin 装配 / 测试）。
 * tap 的 TraceStore 在结构上满足此 port（listSessions/readRecords 签名一致）。
 *
 * 安全护栏（#34e 延续，收编前置）：traces **只读本地捕获、GET-only、绝不外发**——
 *   · server 绑 127.0.0.1 回环，写端点鉴权与 traces 无关（traces 是只读 GET）；
 *   · 本模块不发起任何网络，只把注入的**本地** store 结果投影成 JSON；
 *   · 响应显式带 outbound: 'local-only'，供前端 / doctor 明示「捕获数据不外发」。
 */

/** tap SessionRow 的只读投影（结构对位 tap/trace-store.ts::SessionRow）。 */
export interface TraceSessionRow {
  id: string
  started_at: string
  updated_at: string
  date_key: string
  client: string
  proxy_mode: string
  status: string
  record_count: number
  summary: Record<string, unknown> | null
}

/** 注入 port —— tap 的 TraceStore 结构上满足（只用其只读两法）。 */
export interface TraceStoreReader {
  listSessions(): TraceSessionRow[]
  readRecords(id: string): unknown[]
}

/** Additive timeline port; the legacy TraceStoreReader surface stays source-compatible. */
export interface TraceTimelineStoreReader extends TraceStoreReader {
  loadSessionRow(id: string): TraceSessionRow | null
  readRecordWindow(id: string): TraceRecordWindow
}

export type TraceTimelineWarning =
  | 'record-limit'
  | 'byte-limit'
  | 'malformed-record'
  | 'count-mismatch'

const TRACE_TIMELINE_WARNING_ORDER: readonly TraceTimelineWarning[] = [
  'record-limit',
  'byte-limit',
  'malformed-record',
  'count-mismatch',
]

export interface TraceRecordWindow {
  total_count: number
  returned_count: number
  skipped_count: number
  truncated: boolean
  integrity: 'complete' | 'partial'
  warnings: TraceTimelineWarning[]
  records: unknown[]
}

export interface TraceSessionsResponse {
  generated_at: string
  outbound: 'local-only'
  count: number
  sessions: TraceSessionRow[]
}

export interface TraceRecordsResponse {
  generated_at: string
  outbound: 'local-only'
  session: string
  count: number
  records: unknown[]
}

export type TraceTimelineOutcome = 'success' | 'error' | 'unknown'

export interface TraceTimelineEntry {
  sequence: number
  request_id: string | null
  turn: number | null
  timestamp: string | null
  duration_ms: number | null
  transport: string | null
  method: string | null
  path: string | null
  status_code: number | null
  outcome: TraceTimelineOutcome
  model: string | null
  input_tokens: number | null
  output_tokens: number | null
  cached_input_tokens: number | null
  stream_event_count: number | null
}

export interface TraceTimelineSummary {
  success_count: number
  error_count: number
  unknown_count: number
  total_duration_ms: number | null
  input_tokens: number | null
  output_tokens: number | null
  cached_input_tokens: number | null
}

export interface TraceTimelineResponse {
  generated_at: string
  outbound: 'local-only'
  content: 'metadata-only'
  session: Pick<TraceSessionRow, 'id' | 'client' | 'proxy_mode' | 'status' | 'started_at' | 'updated_at'>
  total_count: number
  returned_count: number
  skipped_count: number
  truncated: boolean
  integrity: 'complete' | 'partial'
  warnings: TraceTimelineWarning[]
  summary: TraceTimelineSummary
  entries: TraceTimelineEntry[]
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function objectField(value: unknown, key: string): Record<string, unknown> | null {
  if (!isObject(value)) return null
  const nested = value[key]
  return isObject(nested) ? nested : null
}

function boundedString(value: unknown, maxLength: number): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength ? value : null
}

function nonNegativeSafeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

function httpStatus(value: unknown): number | null {
  const status = nonNegativeSafeInteger(value)
  return status !== null && status >= 100 && status <= 599 ? status : null
}

function outcomeOf(status: number | null): TraceTimelineOutcome {
  if (status !== null && status >= 200 && status <= 399) return 'success'
  if (status !== null && status >= 400) return 'error'
  return 'unknown'
}

function firstActualInteger(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = nonNegativeSafeInteger(value)
    if (parsed !== null) return parsed
  }
  return null
}

function usageFromResponse(response: Record<string, unknown> | null): {
  input_tokens: number | null
  output_tokens: number | null
  cached_input_tokens: number | null
} {
  const body = objectField(response, 'body')
  const usage = objectField(body, 'usage')
  const inputDetails = objectField(usage, 'input_tokens_details')
  const promptDetails = objectField(usage, 'prompt_tokens_details')
  return {
    input_tokens: firstActualInteger(usage?.input_tokens, usage?.prompt_tokens),
    output_tokens: firstActualInteger(usage?.output_tokens, usage?.completion_tokens),
    cached_input_tokens: firstActualInteger(
      usage?.cache_read_input_tokens,
      inputDetails?.cached_tokens,
      promptDetails?.cached_tokens,
    ),
  }
}

function metadataPath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null
  let path = value.split(/[?#]/, 1)[0] ?? ''
  const absoluteForm = /^[A-Za-z][A-Za-z\d+.-]*:/.test(value) || value.startsWith('//')
  if (absoluteForm) {
    try {
      path = new URL(value.startsWith('//') ? `http:${value}` : value).pathname
    } catch {
      return null
    }
  }
  return path.length > 0 && path.length <= 2048 ? path : null
}

function projectEntry(record: unknown, sequence: number): TraceTimelineEntry {
  const source = isObject(record) ? record : {}
  const request = objectField(source, 'request')
  const response = objectField(source, 'response')
  const requestBody = objectField(request, 'body')
  const status = httpStatus(response?.status)
  const usage = usageFromResponse(response)
  const streamEvents = response?.sse_events
  return {
    sequence,
    request_id: boundedString(source.request_id, 256),
    turn: nonNegativeSafeInteger(source.turn),
    timestamp: boundedString(source.timestamp, 64),
    duration_ms: nonNegativeSafeInteger(source.duration_ms),
    transport: boundedString(source.transport, 64),
    method: boundedString(request?.method, 32),
    path: metadataPath(request?.path),
    status_code: status,
    outcome: outcomeOf(status),
    model: boundedString(requestBody?.model, 256),
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cached_input_tokens: usage.cached_input_tokens,
    stream_event_count: Array.isArray(streamEvents) ? streamEvents.length : null,
  }
}

function saturatingAdd(total: number, value: number): number {
  return total > Number.MAX_SAFE_INTEGER - value ? Number.MAX_SAFE_INTEGER : total + value
}

function sumActual(entries: TraceTimelineEntry[], field: 'duration_ms' | 'input_tokens' | 'output_tokens' | 'cached_input_tokens'): number | null {
  let total = 0
  let found = false
  for (const entry of entries) {
    const value = entry[field]
    if (value === null) continue
    found = true
    total = saturatingAdd(total, value)
  }
  return found ? total : null
}

/** Strict allowlist projector: raw request/response bodies never cross this return boundary. */
export function projectTraceTimeline(
  row: TraceSessionRow,
  window: TraceRecordWindow,
  clock: () => string,
): TraceTimelineResponse {
  const entries = window.records.map((record, index) => projectEntry(record, index + 1))
  return {
    generated_at: clock(),
    outbound: 'local-only',
    content: 'metadata-only',
    session: {
      id: row.id,
      client: row.client,
      proxy_mode: row.proxy_mode,
      status: row.status,
      started_at: row.started_at,
      updated_at: row.updated_at,
    },
    total_count: window.total_count,
    returned_count: entries.length,
    skipped_count: window.skipped_count,
    truncated: window.truncated,
    integrity: window.integrity,
    warnings: TRACE_TIMELINE_WARNING_ORDER.filter((warning) => window.warnings.includes(warning)),
    summary: {
      success_count: entries.filter((entry) => entry.outcome === 'success').length,
      error_count: entries.filter((entry) => entry.outcome === 'error').length,
      unknown_count: entries.filter((entry) => entry.outcome === 'unknown').length,
      total_duration_ms: sumActual(entries, 'duration_ms'),
      input_tokens: sumActual(entries, 'input_tokens'),
      output_tokens: sumActual(entries, 'output_tokens'),
      cached_input_tokens: sumActual(entries, 'cached_input_tokens'),
    },
    entries,
  }
}

/** GET /api/traces/sessions —— 列本地捕获会话（最近更新在前）。 */
export function listTraceSessions(store: TraceStoreReader, clock: () => string): TraceSessionsResponse {
  const sessions = store.listSessions().slice()
  sessions.sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0))
  return { generated_at: clock(), outbound: 'local-only', count: sessions.length, sessions }
}

/** GET /api/traces/records?session=<id> —— 读某会话的本地记录（保序，未知会话 → 空）。 */
export function readTraceRecords(store: TraceStoreReader, session: string, clock: () => string): TraceRecordsResponse {
  const records = store.readRecords(session)
  return { generated_at: clock(), outbound: 'local-only', session, count: records.length, records }
}

/** GET /api/traces/timeline?session=<id> —— known session 的 metadata-only 最近窗口。 */
export function readTraceTimeline(
  store: TraceTimelineStoreReader,
  row: TraceSessionRow,
  clock: () => string,
): TraceTimelineResponse {
  return projectTraceTimeline(row, store.readRecordWindow(row.id), clock)
}

export function hasTraceTimelineReader(store: TraceStoreReader): store is TraceTimelineStoreReader {
  const candidate = store as Partial<TraceTimelineStoreReader>
  return typeof candidate.loadSessionRow === 'function' && typeof candidate.readRecordWindow === 'function'
}
