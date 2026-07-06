/**
 * trafficData —— tap 流量查看器数据端客户端（消费 packages/server GET /api/traces/*，#34d）。
 * 形状逐字镜像 server/src/traces.ts。#34e 护栏：只读本地捕获、GET-only、响应带 outbound=local-only。
 */

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
  outbound: string
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

/** 列本地捕获会话（同源 GET）。 */
export async function fetchTraceSessions(): Promise<TraceSessionsResponse> {
  const res = await fetch('/api/traces/sessions', { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`traces 会话获取失败（${res.status}）`)
  return (await res.json()) as TraceSessionsResponse
}

/** 读某会话的本地记录（同源 GET）。 */
export async function fetchTraceRecords(session: string): Promise<TraceRecordsResponse> {
  const res = await fetch(`/api/traces/records?session=${encodeURIComponent(session)}`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`traces 记录获取失败（${res.status}）`)
  return (await res.json()) as TraceRecordsResponse
}

/** 从一条记录抽取人读摘要（path + status；容错未知形状）。 */
export function recordSummary(r: Record<string, unknown>): string {
  const req = (r.request ?? {}) as Record<string, unknown>
  const resp = (r.response ?? {}) as Record<string, unknown>
  const method = typeof req.method === 'string' ? req.method : ''
  const path = typeof req.path === 'string' ? req.path : ''
  const status = resp.status != null ? String(resp.status) : ''
  const id = typeof r.request_id === 'string' ? r.request_id : ''
  return [id, `${method} ${path}`.trim(), status && `→ ${status}`].filter(Boolean).join('  ')
}
