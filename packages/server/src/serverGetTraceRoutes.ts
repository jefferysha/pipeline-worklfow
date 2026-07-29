import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  hasTraceTimelineReader,
  listTraceSessions,
  readTraceRecords,
  readTraceTimeline,
  type TraceStoreReader,
} from './traces.js'

interface TraceRouteDeps {
  traceStore?: TraceStoreReader
  clock: () => string
  sendJson: (res: ServerResponse, code: number, body: unknown) => void
}

/** Bounded local Trace read routes; returns true only when the path belongs to this domain. */
export function handleGetTraceRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  deps: TraceRouteDeps,
): boolean {
  const { clock, sendJson, traceStore } = deps
  if (path === '/api/traces/sessions') {
    if (!traceStore) {
      sendJson(res, 404, { ok: false, error: 'traces 数据端未装（capabilities.traffic=false）' })
      return true
    }
    try {
      sendJson(res, 200, listTraceSessions(traceStore, clock))
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
    }
    return true
  }

  if (path === '/api/traces/records') {
    if (!traceStore) {
      sendJson(res, 404, { ok: false, error: 'traces 数据端未装（capabilities.traffic=false）' })
      return true
    }
    const session = new URL(req.url ?? '/', 'http://localhost').searchParams.get('session')
    if (!session) {
      sendJson(res, 400, { ok: false, error: '缺 session 查询参数' })
      return true
    }
    try {
      sendJson(res, 200, readTraceRecords(traceStore, session, clock))
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
    }
    return true
  }

  if (path !== '/api/traces/timeline') return false
  if (!traceStore) {
    sendJson(res, 404, { ok: false, error: 'traces 数据端未装（capabilities.traffic=false）' })
    return true
  }
  const session = new URL(req.url ?? '/', 'http://localhost').searchParams.get('session')
  if (!session) {
    sendJson(res, 400, { ok: false, error: '缺 session 查询参数' })
    return true
  }
  if (!hasTraceTimelineReader(traceStore)) {
    sendJson(res, 404, { ok: false, error: 'trace timeline 数据端未装' })
    return true
  }
  try {
    const row = traceStore.loadSessionRow(session)
    if (!row) {
      sendJson(res, 404, { ok: false, error: 'trace session 不存在' })
      return true
    }
    sendJson(res, 200, readTraceTimeline(traceStore, row, clock))
  } catch {
    sendJson(res, 500, { ok: false, error: 'trace timeline 暂时不可用' })
  }
  return true
}
