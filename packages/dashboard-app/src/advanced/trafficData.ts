/**
 * trafficData —— tap 流量查看器数据端（#34d）。fetch 函数与响应形状随 dashboard-client-seam
 * 收拢迁入 api/client.ts（单一 HTTP 接缝），本模块 re-export 保持 TrafficPanel 的 import 面
 * 不变，并保留纯展示工具 recordSummary。#34e 护栏（只读本地捕获、GET-only、outbound=local-only）
 * 与错误文案均在 client 侧逐字保持。
 */

export {
  fetchTraceRecords,
  fetchTraceSessions,
  type TraceRecordsResponse,
  type TraceSessionRow,
  type TraceSessionsResponse,
} from '../api/client'

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
