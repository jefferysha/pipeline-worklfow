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
// capture_proxy.py:45 + 头侧凭证补全(审计 tap-B1):x-goog-api-key(Gemini/agy)、api-key(Azure OpenAI)、
// x-goog-iam-authorization-token 都是 forward-MITM 全量录 POST 的 client 用来带密钥的头,漏进名单即逐字入
// trace 进 git(与 body/query 脱敏同威胁类)。头侧与 query 名单(含 key)对齐,不再单侧漏。
export const SENSITIVE_HEADER_KEYS: ReadonlySet<string> = new Set([
  'authorization', 'cookie', 'set-cookie', 'set-cookie2', 'x-api-key',
  'x-amz-security-token', 'x-goog-api-key', 'api-key', 'x-goog-iam-authorization-token',
  'x-goog-user-project', 'proxy-authorization',
])
// capture_proxy.py:49
export const PREFIX_REDACTED_HEADER_KEYS: ReadonlySet<string> = new Set(['authorization', 'x-api-key'])

/**
 * body 里必须脱敏的凭证键（#codex-proxy）：header 脱敏之外的第二道防线。forward-MITM 对**所有 POST
 * 全量录 body**（不像 reverse 只录 /v1/messages 白名单），而 trace 会随沙箱 git add -A 提交进 change
 * 分支——codex OAuth 若在会话内触发 token 刷新，refresh_token/access_token 等长效凭证会逐字落进 trace
 * 并入库。这些键的值一律 `***`（JSON body deep + 字符串 body 正则两路，见 redactBodySecrets）。
 * 只匹配**精确键名**（小写），故 codex 用量统计里的 input_tokens/output_tokens 等非凭证键不受影响。
 */
export const SENSITIVE_BODY_KEYS: ReadonlySet<string> = new Set([
  'refresh_token', 'access_token', 'id_token', 'client_secret', 'api_key', 'apikey',
  'code_verifier', 'password', 'secret', 'session_key', 'private_key', 'authorization',
  // 纵深补充（对抗复审 I2）：裸 token / 连字符变体 / session / bearer / cookie 回显。client_id 是公开值不入，免误伤。
  'token', 'session_token', 'access-token', 'refresh-token', 'session-token', 'bearer', 'cookie', 'set-cookie',
])

// 字符串 body（form-urlencoded 如 grant_type=refresh_token&refresh_token=… / JSON-as-string）里的凭证脱敏。
const CRED_KEYS_ALT = [...SENSITIVE_BODY_KEYS].join('|')
const CRED_FORM_RE = new RegExp(`\\b(${CRED_KEYS_ALT})=([^&\\s]+)`, 'gi')
const CRED_JSON_STR_RE = new RegExp(`("(?:${CRED_KEYS_ALT})"\\s*:\\s*)"[^"]*"`, 'gi')

function redactSecretsInString(s: string): string {
  return s.replace(CRED_FORM_RE, '$1=***').replace(CRED_JSON_STR_RE, '$1"***"')
}

/**
 * query 专属敏感参数名（比 body 白名单多 `key`/`code`）：`key` 太通用不能进 SENSITIVE_BODY_KEYS
 * （会误伤任何叫 key 的 body 字段），但在 URL query 里 `?key=<cred>`（Google 式）/`?code=<oauth>`
 * 是明确凭证约定，按**参数名精确匹配**只在 query 段脱敏，故安全。
 */
const QUERY_SENSITIVE_PARAMS: ReadonlySet<string> = new Set([
  'key', 'api_key', 'apikey', 'access_token', 'refresh_token', 'id_token', 'token',
  'session_token', 'client_secret', 'password', 'code', 'code_verifier', 'secret',
])

/** 只脱敏 path 的 query 段（`?a=b&c=d`）里名字命中敏感参数的值；path 段与非敏感参数原样。 */
function redactPathQuery(rawPath: string): string {
  const qIdx = rawPath.indexOf('?')
  if (qIdx < 0) return rawPath
  const base = rawPath.slice(0, qIdx)
  const query = rawPath.slice(qIdx + 1)
  const redacted = query.replace(/([^&=?#]+)=([^&#]*)/g, (m, k: string, _v: string) => {
    let name = k
    try { name = decodeURIComponent(k) } catch { /* 保留原始 */ }
    return QUERY_SENSITIVE_PARAMS.has(name.toLowerCase()) ? `${k}=***` : m
  })
  return `${base}?${redacted}`
}

/**
 * 敏感键命中后的整值遮蔽（审计 tap-B9）：不只遮直接字符串值,连数组/对象包裹的字符串一并遮
 * （如 `{"access_token":["<secret>"]}` 或 `{"token":{"jwt":"<secret>"}}`）——凭证被容器包一层不该逃。
 * 非字符串叶子（数字/布尔）原样保留（token 计数等无意义遮）。
 */
function maskSecretValue(v: unknown, depth = 0): unknown {
  if (typeof v === 'string') return v === '' ? '' : '***'
  if (depth > 40 || v === null || typeof v !== 'object') return v
  if (Array.isArray(v)) return v.map((x) => maskSecretValue(x, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = maskSecretValue(val, depth + 1)
  return out
}

/**
 * 递归脱敏 body 里的凭证值（对象/数组走键名精确匹配 → maskSecretValue 整值遮，字符串走正则）。纯函数、
 * 不改入参，只用于**存储记录**——上游转发的仍是原始 body（脱敏只发生在写盘那一份）。深度上限防病态嵌套。
 */
export function redactBodySecrets(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return redactSecretsInString(value)
  if (depth > 40 || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((v) => redactBodySecrets(v, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_BODY_KEYS.has(k.toLowerCase())
      ? maskSecretValue(v)
      : redactBodySecrets(v, depth + 1)
  }
  return out
}

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
      // path 含 query（forward 的 pathname+search / reverse 的 req.url）：query 里的凭证（?access_token=…、
      // ?api_key=…、?key=… Google 式、?code=… OAuth）同样会随 trace 入库，按参数名脱敏（I1 + codex review：
      // `key`/`code` 只在 query 段按名精确遮，不进 body 白名单免误伤）。path 段与非敏感参数原样。
      path: redactPathQuery(p.path),
      headers: filterHeaders(p.reqHeaders, { redactKeys: true }),
      body: redactBodySecrets(p.reqBody),
    },
    response: {
      status: p.status,
      headers: filterHeaders(p.respHeaders, { redactKeys: true }),
      body: redactBodySecrets(p.respBody),
    },
  }
  // sse_events 同过脱敏（对抗复审 M1 防回归：当前无 caller 传，但一旦有，SSE 里的凭证也不该逐字入库）。
  if (p.sseEvents && p.sseEvents.length) (record.response as Record<string, unknown>).sse_events = redactBodySecrets(p.sseEvents)
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
