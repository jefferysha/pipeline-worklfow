import type {
  SessionLink,
  TraceRecordsResponse,
  TraceSessionsResponse,
  TraceTimelineResponse,
  WbRunDetail,
} from './auditTypes'
import {
  decodeRunDetail,
  decodeSessionLink,
  decodeSessionLinks,
  decodeTraceRecords,
  decodeTraceSessions,
  decodeTraceTimeline,
} from './auditDecoders'
import { ApiError, readJson, throwApiError, wrapNetwork } from './transport'

async function decodeResponse<T>(
  response: Response,
  decode: (value: unknown) => T | null,
  invalidMessage: string,
): Promise<T> {
  const body = decode(await readJson(response))
  if (!body) throw new ApiError(invalidMessage, response.status)
  return body
}

export async function fetchRunDetail(name: string, root: string): Promise<WbRunDetail> {
  let response: Response
  try {
    response = await fetch(`/api/change/${encodeURIComponent(name)}/run-detail?root=${encodeURIComponent(root)}`, {
      headers: { Accept: 'application/json' },
    })
  } catch (error) {
    wrapNetwork(error)
  }
  if (!response.ok) await throwApiError(response, '运行审计获取失败')
  return decodeResponse(response, decodeRunDetail, '运行审计响应形状无效')
}

export async function fetchTraceSessions(): Promise<TraceSessionsResponse> {
  const response = await fetch('/api/traces/sessions', { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`traces 会话获取失败（${response.status}）`)
  const decoded = decodeTraceSessions(await readJson(response))
  if (!decoded) throw new Error('traces 会话响应形状无效')
  return decoded
}

export async function fetchTraceRecords(session: string): Promise<TraceRecordsResponse> {
  const response = await fetch(`/api/traces/records?session=${encodeURIComponent(session)}`, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`traces 记录获取失败（${response.status}）`)
  const decoded = decodeTraceRecords(await readJson(response))
  if (!decoded) throw new Error('traces 记录响应形状无效')
  return decoded
}

export async function fetchTraceTimeline(session: string): Promise<TraceTimelineResponse> {
  const response = await fetch(`/api/traces/timeline?session=${encodeURIComponent(session)}`, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`trace timeline 获取失败（${response.status}）`)
  const decoded = decodeTraceTimeline(await readJson(response))
  if (!decoded || decoded.session.id !== session) throw new Error('trace timeline 响应形状无效')
  return decoded
}

export async function fetchSessionLink(root: string, name: string): Promise<SessionLink> {
  const response = await fetch(
    `/api/mem/session-link?root=${encodeURIComponent(root)}&name=${encodeURIComponent(name)}`,
    { headers: { Accept: 'application/json' } },
  )
  if (!response.ok) return { found: false, reason: `http-${response.status}` }
  const decoded = decodeSessionLink(await readJson(response))
  if (!decoded) throw new Error('session link response is malformed')
  return decoded
}

const SESSION_LINKS_CHUNK_SIZE = 50
const SESSION_LINKS_CHUNK_MAX_URL_CHARS = 6000

function sessionLinkParamsLength(items: Array<{ root: string; name: string }>): number {
  const params = new URLSearchParams()
  for (const item of items) {
    params.append('root', item.root)
    params.append('name', item.name)
  }
  return params.toString().length
}

function chunkSessionLinkItems(
  items: Array<{ root: string; name: string }>,
): Array<Array<{ root: string; name: string }>> {
  const chunks: Array<Array<{ root: string; name: string }>> = []
  let current: Array<{ root: string; name: string }> = []
  for (const item of items) {
    const exceedsCount = current.length >= SESSION_LINKS_CHUNK_SIZE
    const exceedsChars =
      current.length > 0 && sessionLinkParamsLength([...current, item]) > SESSION_LINKS_CHUNK_MAX_URL_CHARS
    if (exceedsCount || exceedsChars) {
      chunks.push(current)
      current = []
    }
    current.push(item)
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

async function fetchSessionLinksChunk(
  items: Array<{ root: string; name: string }>,
): Promise<Record<string, SessionLink>> {
  const params = new URLSearchParams()
  for (const item of items) {
    params.append('root', item.root)
    params.append('name', item.name)
  }
  try {
    const response = await fetch(`/api/mem/session-links?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return {}
    return decodeSessionLinks(await readJson(response)) ?? {}
  } catch {
    return {}
  }
}

export async function fetchSessionLinks(
  items: Array<{ root: string; name: string }>,
): Promise<Record<string, SessionLink>> {
  if (items.length === 0) return {}
  const merged: Record<string, SessionLink> = {}
  for (const chunk of chunkSessionLinkItems(items)) {
    Object.assign(merged, await fetchSessionLinksChunk(chunk))
  }
  return merged
}
