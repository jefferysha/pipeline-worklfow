/**
 * bedrock —— AWS EventStream 二进制解码 + Converse-stream 装配（node stdlib，真 Buffer 处理）。
 *
 * 老仓真相源（严格只读移植）: skills/pipeline/scripts/tap/bedrock.py
 *   帧格式顶注:1-20 · BEDROCK_STREAM_SUFFIXES:35 · BEDROCK_ERROR_EVENT_KEYS:36 · _BEDROCK_MODEL_PATH_RE:47
 *   · is_bedrock_eventstream_path:57 · bedrock_model_from_path:63 · _HEADER_TYPE_FIXED_SIZES:76
 *   · _decode_headers:90 · decode_bedrock_eventstream_events:142 · bedrock_error_events:225
 *   · attach_bedrock_errors:242 · assemble_bedrock_converse_body:263。
 *
 * AWS EventStream 二进制帧布局（大端）:
 *   [0..4) total_len  [4..8) headers_len  [8..12) prelude_crc32(bytes[0..8))
 *   [12..12+H) headers blob   [12+H..total-4) JSON payload   [total-4..total) message_crc32(bytes[0..total-4))
 *   header entry: 1B name_len · N name(utf8) · 1B type · (type7:2B val_len + val)。
 *
 * 结构改进：老仓用 zlib.crc32（python stdlib）；本仓内置纯 JS CRC32（IEEE，与 node:zlib.crc32
 *   逐位相符，见 bedrock.test 交叉校验），零版本/依赖耦合。真 Buffer 逐帧解码，容错契约同老仓。
 *
 * 安全护栏（#34e）：本模块纯 Buffer/JSON 逻辑，零网络 import——解码结果只经 trace-store 落本地。
 */

// ── CRC32（IEEE 802.3，reflected；与 node:zlib.crc32 位相符）────────────────────
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

/** IEEE CRC32（无符号 32 位）。等价 node:zlib.crc32 / python zlib.crc32。 */
export function crc32(buf: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    const byte = buf.readUInt8(i)
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

// ── 路径助手（faithful port）───────────────────────────────────────────────────
export const BEDROCK_STREAM_SUFFIXES = ['/invoke-with-response-stream', '/converse-stream'] as const
export const BEDROCK_ERROR_EVENT_KEYS: ReadonlySet<string> = new Set([
  'internalServerException', 'modelStreamErrorException', 'modelTimeoutException',
  'serviceUnavailableException', 'throttlingException', 'validationException',
])

const BEDROCK_MODEL_PATH_RE = /\/model\/(.+)\/(?:invoke|invoke-with-response-stream|messages|converse|converse-stream)(?:[?#].*)?$/

/** Bedrock 是否返回 AWS EventStream 的流式路由。bedrock.py:57。 */
export function isBedrockEventstreamPath(path: string): boolean {
  const cleanPath = (path.split('?', 1)[0] ?? '').replace(/\/+$/, '')
  return BEDROCK_STREAM_SUFFIXES.some((s) => cleanPath.endsWith(s))
}

/** 从 /model/{modelId}/... 抽取并 url-decode modelId。bedrock.py:63。 */
export function bedrockModelFromPath(path: string): string {
  const m = BEDROCK_MODEL_PATH_RE.exec(path)
  if (!m) return ''
  const encoded = m[1] ?? ''
  try {
    return decodeURIComponent(encoded)
  } catch {
    return encoded
  }
}

// ── 二进制 EventStream 解码 ────────────────────────────────────────────────────
// 固定大小 header 类型（type 6/7 用 2 字节长度 + 变长数据）。bedrock.py:76。
const HEADER_TYPE_FIXED_SIZES: Record<number, number> = {
  0: 0, 1: 0, 2: 1, 3: 2, 4: 4, 5: 8, 8: 8, 9: 16,
}
const HEADER_TYPE_VAR_LEN: ReadonlySet<number> = new Set([6, 7])

/** 解 headers blob → name→value（只存 string 型 type=7）。bedrock.py:90 _decode_headers。 */
function decodeHeaders(data: Buffer): Record<string, string> {
  const headers: Record<string, string> = {}
  let pos = 0
  while (pos < data.length) {
    if (pos + 1 > data.length) break
    const nameLen = data.readUInt8(pos)
    pos += 1
    if (pos + nameLen > data.length) break
    const name = data.subarray(pos, pos + nameLen).toString('utf8')
    pos += nameLen

    if (pos + 1 > data.length) break
    const hdrType = data.readUInt8(pos)
    pos += 1

    if (hdrType === 7) {
      if (pos + 2 > data.length) break
      const valLen = data.readUInt16BE(pos)
      pos += 2
      if (pos + valLen > data.length) break
      headers[name] = data.subarray(pos, pos + valLen).toString('utf8')
      pos += valLen
    } else if (HEADER_TYPE_VAR_LEN.has(hdrType)) {
      if (pos + 2 > data.length) break
      const valLen = data.readUInt16BE(pos)
      pos += 2 + valLen
    } else {
      const fixed = HEADER_TYPE_FIXED_SIZES[hdrType]
      if (fixed === undefined) break
      pos += fixed
    }
  }
  return headers
}

export interface BedrockEvent {
  headers: Record<string, string>
  event: string
  data: Record<string, unknown>
}

/**
 * 解 AWS EventStream 二进制体为事件列表。bedrock.py:142。
 * 容错契约：截断 body → 停并返回已解出；坏 prelude-CRC → 停（长度不可信）；
 *   坏 message-CRC → 跳过该帧继续下一帧；均不抛异常。
 */
export function decodeBedrockEventstreamEvents(body: Buffer): BedrockEvent[] {
  if (!Buffer.isBuffer(body) || body.length < 16) return []
  const events: BedrockEvent[] = []
  let pos = 0

  while (pos < body.length) {
    if (pos + 12 > body.length) break // 截断：读不出 prelude
    const totalLen = body.readUInt32BE(pos)
    const headersLen = body.readUInt32BE(pos + 4)
    if (totalLen < 16) break // 非法帧长
    if (pos + totalLen > body.length) break // 截断帧

    const preludeCrc = body.readUInt32BE(pos + 8)
    if (preludeCrc !== crc32(body.subarray(pos, pos + 8))) break // 长度字段不可信 → 停

    const msgCrc = body.readUInt32BE(pos + totalLen - 4)
    if (msgCrc !== crc32(body.subarray(pos, pos + totalLen - 4))) {
      pos += totalLen // 内容损坏 → 跳过该帧继续
      continue
    }

    const headersStart = pos + 12
    const headersEnd = headersStart + headersLen
    const headers = decodeHeaders(body.subarray(headersStart, headersEnd))

    const payloadBytes = body.subarray(headersEnd, pos + totalLen - 4)
    let data: unknown = {}
    if (payloadBytes.length > 0) {
      try {
        data = JSON.parse(payloadBytes.toString('utf8'))
      } catch {
        data = {}
      }
    }
    if (typeof data !== 'object' || data === null || Array.isArray(data)) data = {}

    events.push({ headers, event: headers[':event-type'] ?? '', data: data as Record<string, unknown> })
    pos += totalLen
  }
  return events
}

// ── error 助手（faithful port）─────────────────────────────────────────────────
/** 归一 Bedrock EventStream error 事件。bedrock.py:225。 */
export function bedrockErrorEvents(events: BedrockEvent[]): Array<Record<string, unknown>> {
  const errors: Array<Record<string, unknown>> = []
  for (const event of events) {
    const eventType = event.event
    if (typeof eventType !== 'string' || !BEDROCK_ERROR_EVENT_KEYS.has(eventType)) continue
    const data = event.data
    const error: Record<string, unknown> = { type: eventType }
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) Object.assign(error, data)
    else if (data !== undefined && data !== null) error.message = String(data)
    errors.push(error)
  }
  return errors
}

/** 即便原始 stream 事件被省略，也把 Bedrock 流错误挂到 body 上。bedrock.py:242。 */
export function attachBedrockErrors(body: unknown, events: BedrockEvent[]): unknown {
  const errors = bedrockErrorEvents(events)
  if (errors.length === 0) return body
  const first = errors[0]
  if (!first) return body
  const annotated: Record<string, unknown> =
    typeof body === 'object' && body !== null && !Array.isArray(body) ? { ...(body as Record<string, unknown>) } : { raw_body: body }
  if (!('error' in annotated)) annotated.error = first
  annotated.bedrock_errors = errors
  return annotated
}

// ── Converse-stream body 装配（faithful port）──────────────────────────────────
export interface BedrockConverseBody {
  output: { message: { role: string; content: Array<Record<string, unknown>> } }
  usage: Record<string, unknown>
}

/** 把解码后的 Converse-stream 事件装配成非流式 Converse body。bedrock.py:263。 */
export function assembleBedrockConverseBody(events: BedrockEvent[]): BedrockConverseBody {
  let role = 'assistant'
  const blockOrder: number[] = []
  const blockKind = new Map<number, string>() // 'text' | 'tool_use' | 'reasoning'
  const blockToolMeta = new Map<number, { toolUseId: string; name: string }>()
  const blockTextParts = new Map<number, string[]>()
  const blockToolInputParts = new Map<number, string[]>()
  const blockReasoningParts = new Map<number, string[]>()
  const blockReasoningSig = new Map<number, string>()
  let usage: Record<string, unknown> = {}

  const toIdx = (v: unknown): number => {
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isFinite(n) ? Math.trunc(n) : 0
  }

  for (const event of events) {
    const eventType = event.event || event.headers[':event-type'] || ''
    let data: Record<string, unknown> = event.data
    if (typeof data !== 'object' || data === null || Array.isArray(data)) data = {}

    if (eventType === 'messageStart') {
      role = (data.role as string) || 'assistant'
    } else if (eventType === 'contentBlockStart') {
      const idx = toIdx(data.contentBlockIndex)
      const start = (typeof data.start === 'object' && data.start !== null ? data.start : {}) as Record<string, unknown>
      const toolUse = typeof start.toolUse === 'object' && start.toolUse !== null ? (start.toolUse as Record<string, unknown>) : null
      if (!blockKind.has(idx)) blockOrder.push(idx)
      if (toolUse) {
        blockKind.set(idx, 'tool_use')
        blockToolMeta.set(idx, { toolUseId: (toolUse.toolUseId as string) ?? '', name: (toolUse.name as string) ?? '' })
        blockToolInputParts.set(idx, [])
      } else if (!blockKind.has(idx)) {
        blockKind.set(idx, 'text')
        blockTextParts.set(idx, [])
      }
    } else if (eventType === 'contentBlockDelta') {
      const idx = toIdx(data.contentBlockIndex)
      const delta = (typeof data.delta === 'object' && data.delta !== null && !Array.isArray(data.delta) ? data.delta : {}) as Record<string, unknown>
      if (!blockKind.has(idx)) blockOrder.push(idx)

      const text = delta.text
      const toolDelta = delta.toolUse
      const reasoningDelta = delta.reasoningContent

      if (typeof text === 'string') {
        if (blockKind.get(idx) !== 'tool_use') {
          if (!blockKind.has(idx)) blockKind.set(idx, 'text')
          const parts = blockTextParts.get(idx) ?? []
          parts.push(text)
          blockTextParts.set(idx, parts)
        }
      } else if (typeof toolDelta === 'object' && toolDelta !== null && !Array.isArray(toolDelta)) {
        if (!blockKind.has(idx)) {
          blockKind.set(idx, 'tool_use')
          if (!blockToolMeta.has(idx)) blockToolMeta.set(idx, { toolUseId: '', name: '' })
          blockToolInputParts.set(idx, [])
        }
        const partial = (toolDelta as Record<string, unknown>).input
        if (typeof partial === 'string') {
          const parts = blockToolInputParts.get(idx) ?? []
          parts.push(partial)
          blockToolInputParts.set(idx, parts)
        }
      } else if (typeof reasoningDelta === 'object' && reasoningDelta !== null && !Array.isArray(reasoningDelta)) {
        if (!blockKind.has(idx)) blockKind.set(idx, 'reasoning')
        if (!blockReasoningParts.has(idx)) blockReasoningParts.set(idx, [])
        const rtext = (reasoningDelta as Record<string, unknown>).text
        if (typeof rtext === 'string') {
          const parts = blockReasoningParts.get(idx) ?? []
          parts.push(rtext)
          blockReasoningParts.set(idx, parts)
        }
        const sig = (reasoningDelta as Record<string, unknown>).signature
        if (typeof sig === 'string' && sig) blockReasoningSig.set(idx, sig)
      }
    } else if (eventType === 'metadata') {
      const u = data.usage
      if (typeof u === 'object' && u !== null && !Array.isArray(u)) usage = u as Record<string, unknown>
    }
    // messageStop / contentBlockStop：装配无需动作
  }

  const content: Array<Record<string, unknown>> = []
  for (const idx of blockOrder) {
    const kind = blockKind.get(idx) ?? 'text'
    if (kind === 'tool_use') {
      const rawInput = (blockToolInputParts.get(idx) ?? []).join('')
      let parsedInput: unknown = {}
      if (rawInput) {
        try {
          parsedInput = JSON.parse(rawInput)
        } catch {
          parsedInput = {}
        }
      }
      const meta = blockToolMeta.get(idx) ?? { toolUseId: '', name: '' }
      content.push({ toolUse: { toolUseId: meta.toolUseId ?? '', name: meta.name ?? '', input: parsedInput } })
    } else if (kind === 'reasoning') {
      const rtext = (blockReasoningParts.get(idx) ?? []).join('')
      const rc: Record<string, unknown> = { text: rtext }
      const sig = blockReasoningSig.get(idx)
      if (sig) rc.signature = sig
      content.push({ reasoningContent: rc })
    } else {
      const textAcc = (blockTextParts.get(idx) ?? []).join('')
      if (textAcc) content.push({ text: textAcc })
    }
  }

  return { output: { message: { role, content } }, usage }
}
