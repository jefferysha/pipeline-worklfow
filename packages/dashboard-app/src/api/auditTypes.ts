export interface WbRunIdentity {
  id: string
  workflow_id: string
  current_step: string
  lifecycle: 'active' | 'archived'
  transition_sequence: number
  transition_head?: string
  created_at: string
  updated_at: string
  policy_id?: string
  policy_version?: string
  loop_id?: string
  iteration_id?: string
  automation_policy?: Record<string, unknown>
}

export interface WbRunRevision {
  revision: number
  revisionId: string
  previousRevisionId?: string
  stateDigest: string
  mutation: { kind: string; observedAt?: string; transitionRecordId?: string }
  [key: string]: unknown
}

export interface WbTransitionRecord {
  id: string
  runId: string
  sequence: number
  event: string
  from: string
  to: string
  observedAt: string
  effects: unknown[]
  [key: string]: unknown
}

export type WbLedgerRecord = {
  kind: string
  record_id: string
  recorded_at: string
  [key: string]: unknown
}

export interface WbAttemptContext {
  record_id: string
  recorded_at: string
  reservation_id: string
  attempt_id: string
  iteration_id?: string
  loop_id: string
  source_run_record_ids: string[]
  omitted_attempt_ids: string[]
  rendered: string
  stagnation: {
    stagnant: boolean
    fingerprint?: string
    repeated_attempt_ids: string[]
  }
}

export interface WbRunDetail {
  ok: true
  root: string
  change: string
  source: 'canonical' | 'legacy'
  projection: { status: string; [key: string]: unknown }
  workflow_run: WbRunIdentity | null
  current_revision: WbRunRevision | null
  revisions: WbRunRevision[]
  transitions: WbTransitionRecord[]
  attempt_contexts: WbAttemptContext[]
  ledger: {
    health: 'ok' | 'degraded' | 'missing'
    rejected: Array<{ line: number; raw_hash: string; error: string }>
    records: WbLedgerRecord[]
  }
}

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

export interface TraceSessionsResponse {
  generated_at: string
  outbound: 'local-only'
  count: number
  sessions: TraceSessionRow[]
}

export interface TraceRecordsResponse {
  generated_at: string
  outbound: string
  session: string
  count: number
  records: Array<Record<string, unknown>>
}

export type TraceTimelineIntegrity = 'complete' | 'partial'
export type TraceTimelineOutcome = 'success' | 'error' | 'unknown'
export type TraceTimelineWarning =
  | 'record-limit'
  | 'byte-limit'
  | 'malformed-record'
  | 'count-mismatch'

export interface TraceTimelineSession {
  id: string
  client: string
  proxy_mode: string
  status: string
  started_at: string
  updated_at: string
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

export interface TraceTimelineResponse {
  generated_at: string
  outbound: 'local-only'
  content: 'metadata-only'
  session: TraceTimelineSession
  total_count: number
  returned_count: number
  skipped_count: number
  truncated: boolean
  integrity: TraceTimelineIntegrity
  warnings: TraceTimelineWarning[]
  summary: TraceTimelineSummary
  entries: TraceTimelineEntry[]
}

export interface SessionLink {
  found: boolean
  platform?: string
  sessionId?: string
  dir?: string
  resumeCmd?: string | null
  mtime?: string
  reason?: string
}
