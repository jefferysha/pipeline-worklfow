import type { TraceRecord } from './record.js'
import type { SessionRow } from './trace-store.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function decodeSessionRow(value: unknown): SessionRow | null {
  if (!isRecord(value)) return null
  const id = typeof value.id === 'string' ? value.id : null
  const startedAt = typeof value.started_at === 'string' ? value.started_at : null
  const updatedAt = typeof value.updated_at === 'string' ? value.updated_at : null
  const dateKey = typeof value.date_key === 'string' ? value.date_key : null
  const client = typeof value.client === 'string' ? value.client : null
  const proxyMode = typeof value.proxy_mode === 'string' ? value.proxy_mode : null
  const status = typeof value.status === 'string' ? value.status : null
  if (
    id === null
    || startedAt === null
    || updatedAt === null
    || dateKey === null
    || client === null
    || proxyMode === null
    || status === null
    || typeof value.record_count !== 'number'
    || !Number.isSafeInteger(value.record_count)
    || value.record_count < 0
    || (value.summary !== null && !isRecord(value.summary))
  ) {
    return null
  }
  return {
    id,
    started_at: startedAt,
    updated_at: updatedAt,
    date_key: dateKey,
    client,
    proxy_mode: proxyMode,
    status,
    record_count: value.record_count,
    summary: value.summary,
  }
}

export function decodeTraceRecord(value: unknown): TraceRecord | null {
  return isRecord(value) ? value : null
}
