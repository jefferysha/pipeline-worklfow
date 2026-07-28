import { ApiError, getToken, isRecord, readJson, throwListApiError, wrapNetwork } from './transport'

export type LoopScopePreviewReason = 'allowlist' | 'path-denied' | 'path-outside-allowlist'

export interface LoopScopePreviewItem {
  path: string
  verdict: 'allowed' | 'blocked'
  reason: LoopScopePreviewReason
  matched_pattern: string | null
}

export interface LoopScopePreviewResponse {
  ok: true
  schema_version: 1
  loop_id: string
  loop_status: 'active' | 'paused' | 'retired'
  autonomy_level: 'L1' | 'L2' | 'L3'
  enforced_for_unattended_merge: boolean
  summary: { total: number; allowed: number; blocked: number }
  items: LoopScopePreviewItem[]
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const expected = [...keys].sort()
  const actual = Object.keys(value).sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function decodeItem(value: unknown): LoopScopePreviewItem | null {
  if (!isRecord(value)
    || !exactKeys(value, ['path', 'verdict', 'reason', 'matched_pattern'])
    || typeof value.path !== 'string'
    || (value.verdict !== 'allowed' && value.verdict !== 'blocked')) return null
  if (value.verdict === 'allowed') {
    return value.reason === 'allowlist' && typeof value.matched_pattern === 'string' && value.matched_pattern !== ''
      ? { path: value.path, verdict: 'allowed', reason: 'allowlist', matched_pattern: value.matched_pattern }
      : null
  }
  if (value.reason === 'path-denied' && typeof value.matched_pattern === 'string' && value.matched_pattern !== '') {
    return { path: value.path, verdict: 'blocked', reason: 'path-denied', matched_pattern: value.matched_pattern }
  }
  return value.reason === 'path-outside-allowlist' && value.matched_pattern === null
    ? { path: value.path, verdict: 'blocked', reason: 'path-outside-allowlist', matched_pattern: null }
    : null
}

export function decodeLoopScopePreview(value: unknown): LoopScopePreviewResponse | null {
  if (!isRecord(value)
    || !exactKeys(value, [
      'ok', 'schema_version', 'loop_id', 'loop_status', 'autonomy_level',
      'enforced_for_unattended_merge', 'summary', 'items',
    ])
    || value.ok !== true
    || value.schema_version !== 1
    || typeof value.loop_id !== 'string'
    || !['active', 'paused', 'retired'].includes(String(value.loop_status))
    || !['L1', 'L2', 'L3'].includes(String(value.autonomy_level))
    || typeof value.enforced_for_unattended_merge !== 'boolean'
    || !isRecord(value.summary)
    || !exactKeys(value.summary, ['total', 'allowed', 'blocked'])
    || !Array.isArray(value.items)) return null
  const summary = value.summary
  if (![summary.total, summary.allowed, summary.blocked].every(Number.isSafeInteger)) return null
  const total = summary.total as number
  const allowed = summary.allowed as number
  const blocked = summary.blocked as number
  if (total < 0 || allowed < 0 || blocked < 0 || total !== allowed + blocked || total !== value.items.length) return null
  const items = value.items.map(decodeItem)
  if (items.some((item) => item === null)) return null
  const decoded = items as LoopScopePreviewItem[]
  if (new Set(decoded.map((item) => item.path)).size !== decoded.length
    || decoded.filter((item) => item.verdict === 'allowed').length !== allowed) return null
  return {
    ok: true,
    schema_version: 1,
    loop_id: value.loop_id,
    loop_status: value.loop_status as LoopScopePreviewResponse['loop_status'],
    autonomy_level: value.autonomy_level as LoopScopePreviewResponse['autonomy_level'],
    enforced_for_unattended_merge: value.enforced_for_unattended_merge,
    summary: { total, allowed, blocked },
    items: decoded,
  }
}

export async function postLoopScopePreview(input: {
  root: string
  loopId: string
  paths: readonly string[]
}): Promise<LoopScopePreviewResponse> {
  let response: Response
  try {
    response = await fetch('/api/loops/scope-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ root: input.root, loop_id: input.loopId, paths: input.paths }),
    })
  } catch (error) {
    wrapNetwork(error)
  }
  if (!response.ok) await throwListApiError(response, 'Loop 路径策略预检失败')
  const decoded = decodeLoopScopePreview(await readJson(response))
  if (decoded === null) throw new ApiError('Loop 路径策略预检响应形状无效', response.status)
  return decoded
}
