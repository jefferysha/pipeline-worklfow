/**
 * record —— trace 记录构建 + 头脱敏 + 会话路由（纯函数，无 socket/无网络）。
 *
 * 老仓真相源（严格只读移植）: skills/pipeline/scripts/tap/capture_proxy.py
 *   HOP_BY_HOP:40 · SENSITIVE_HEADER_KEYS:45 · filter_headers:52 · build_record:69
 *   _extract_real_session_id:113 · TurnCounter:153 · _safe_json:166
 *   noise skip 移植参考 forward_proxy.py should_skip_trace_record:162。
 *
 * 安全护栏（#34e）：本模块纯逻辑，零网络 import——捕获数据构建后只经 trace-store 落**本地盘**。
 */

export type HeaderMap = Record<string, string | string[] | undefined>

export interface TraceRecord {
  timestamp?: string
  request_id?: string
  turn?: number
  duration_ms?: number
  transport?: string
  request?: Record<string, unknown>
  response?: Record<string, unknown>
  upstream_base_url?: string
  [k: string]: unknown
}

// capture_proxy.py:40
export const HOP_BY_HOP: ReadonlySet<string> = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'content-length',
  'host', 'accept-encoding',
])
// capture_proxy.py:45
export const SENSITIVE_HEADER_KEYS: ReadonlySet<string> = new Set([
  'authorization', 'cookie', 'set-cookie', 'set-cookie2', 'x-api-key',
  'x-amz-security-token',
])
// capture_proxy.py:49
export const PREFIX_REDACTED_HEADER_KEYS: ReadonlySet<string> = new Set(['authorization', 'x-api-key'])

function headerValueToString(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v.join(', ') : (v ?? '')
}

/** 剥 hop-by-hop，可选脱敏敏感值（仅用于存储记录）。capture_proxy.py:52 filter_headers。 */
export function filterHeaders(headers: HeaderMap, opts: { redactKeys?: boolean } = {}): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, rawVal] of Object.entries(headers)) {
    const lowered = key.toLowerCase()
    if (HOP_BY_HOP.has(lowered)) continue
    const value = headerValueToString(rawVal)
    if (opts.redactKeys && SENSITIVE_HEADER_KEYS.has(lowered)) {
      if (PREFIX_REDACTED_HEADER_KEYS.has(lowered) && value.length > 12) {
        out[key] = value.slice(0, 12) + '...'
      } else {
        out[key] = '***'
      }
    } else {
      out[key] = value
    }
  }
  return out
}

export interface BuildRecordParams {
  reqId: string
  turn: number
  durationMs: number
  method: string
  path: string
  reqHeaders: HeaderMap
  reqBody: unknown
  status: number
  respHeaders: HeaderMap
  respBody: unknown
  sseEvents?: unknown[] | null
  upstreamBaseUrl?: string | null
  transport?: string
}

/** 构建一条 API trace 记录（headers 已脱敏）。capture_proxy.py:69 build_record。 */
export function buildRecord(p: BuildRecordParams): TraceRecord {
  const record: TraceRecord = {
    timestamp: new Date().toISOString(),
    request_id: p.reqId,
    turn: p.turn,
    duration_ms: p.durationMs,
    transport: p.transport ?? 'reverse',
    request: {
      method: p.method,
      path: p.path,
      headers: filterHeaders(p.reqHeaders, { redactKeys: true }),
      body: p.reqBody,
    },
    response: {
      status: p.status,
      headers: filterHeaders(p.respHeaders, { redactKeys: true }),
      body: p.respBody,
    },
  }
  if (p.sseEvents && p.sseEvents.length) (record.response as Record<string, unknown>).sse_events = p.sseEvents
  if (p.upstreamBaseUrl) record.upstream_base_url = p.upstreamBaseUrl
  return record
}

/** 容错 JSON 解析：合法 → 对象；非法 → utf-8 字符串；空 → null。capture_proxy.py:166 _safe_json。 */
export function safeJson(raw: Buffer | string | null | undefined): unknown {
  if (raw == null) return null
  const buf = typeof raw === 'string' ? Buffer.from(raw, 'utf8') : raw
  if (buf.length === 0) return null
  try {
    return JSON.parse(buf.toString('utf8'))
  } catch {
    return buf.toString('utf8')
  }
}

/** 线程无关的 turn 自增（node 单线程，锁语义天然满足）。capture_proxy.py:153 TurnCounter。 */
export class TurnCounter {
  private n: number
  constructor(initial = 0) { this.n = initial }
  next(): number { this.n += 1; return this.n }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SESSION_IN_STRING_RE = /session_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i

function looksLikeUuid(s: string): boolean { return UUID_RE.test(s) }

/**
 * 从 HTTP 头或请求体提取真实 Claude 会话 id；都缺回落 fallback。
 * 优先级：X-Claude-Code-Session-Id 头 → body metadata.user_id 的 session_<uuid> → metadata.session_id。
 * capture_proxy.py:113 _extract_real_session_id。
 */
export function extractRealSessionId(headers: HeaderMap, bodyBytes: Buffer | null, fallback: string): string {
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === 'x-claude-code-session-id') {
      const val = headerValueToString(v).trim()
      if (looksLikeUuid(val)) return val
      break // 头存在但非法：不下探其它头
    }
  }
  if (bodyBytes && bodyBytes.length) {
    try {
      const body = JSON.parse(bodyBytes.toString('utf8'))
      if (body && typeof body === 'object') {
        const meta = (body as Record<string, unknown>).metadata
        if (meta && typeof meta === 'object') {
          const uid = (meta as Record<string, unknown>).user_id
          if (typeof uid === 'string') {
            const m = SESSION_IN_STRING_RE.exec(uid)
            if (m) return m[1]!
          }
          const nested = (meta as Record<string, unknown>).session_id
          if (typeof nested === 'string' && looksLikeUuid(nested.trim())) return nested.trim()
        }
      }
    } catch {
      /* 非 JSON body：回落 */
    }
  }
  return fallback
}

// ---- 噪声过滤（forward_proxy.py:66-177 移植）----
const IGNORED_HOSTS = new Set([
  'registry.npmjs.org', 'registry.yarnpkg.com', 'registry.npmmirror.com', 'npm.pkg.github.com',
])
const IGNORED_PATH_PREFIXES = ['/-/npm']
const PKG_UA_MARKERS = ['npm/', 'yarn/', 'pnpm/', 'bun/']
const IGNORED_PKG_METADATA_CTYPES = new Set(['application/json', 'application/vnd.npm.install-v1+json'])

export interface SkipParams {
  upstreamUrl: string
  path: string
  responseHeaders: HeaderMap
  requestHeaders?: HeaderMap
  method?: string
}

/** 非模型上游响应：转发但不持久（npm/yarn registry 噪声）。forward_proxy.py:162。 */
export function shouldSkipTraceRecord(p: SkipParams): boolean {
  let hostname = ''
  try { hostname = new URL(p.upstreamUrl).hostname.toLowerCase() } catch { hostname = '' }
  if (IGNORED_HOSTS.has(hostname)) return true
  const cleanPath = (p.path || '/').split('?', 1)[0]!.toLowerCase()
  if (IGNORED_PATH_PREFIXES.some((pre) => cleanPath === pre || cleanPath.startsWith(pre + '/'))) return true
  const media = headerValueToString(headerLookup(p.responseHeaders, 'content-type')).split(';', 1)[0]!.trim().toLowerCase()
  const ua = headerValueToString(headerLookup(p.requestHeaders ?? {}, 'user-agent')).toLowerCase()
  const method = (p.method ?? 'GET').toUpperCase()
  if ((method === 'GET' || method === 'HEAD') && PKG_UA_MARKERS.some((m) => ua.includes(m)) && IGNORED_PKG_METADATA_CTYPES.has(media)) {
    return true
  }
  return false
}

function headerLookup(headers: HeaderMap, name: string): string | string[] | undefined {
  const lower = name.toLowerCase()
  for (const [k, v] of Object.entries(headers)) if (k.toLowerCase() === lower) return v
  return undefined
}
