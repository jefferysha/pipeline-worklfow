/**
 * ws-reconstruct —— RFC 6455 WebSocket 帧编解码 + 请求/响应体重组（node stdlib，真 Buffer 处理）。
 *
 * 老仓真相源（严格只读移植）:
 *   skills/pipeline/scripts/tap/ws_frame.py
 *     WS_GUID:15 · OP_* opcodes:16 · build_accept:19 · build_frame:24 · read_frame:45
 *     · read_message:66 · ws_handshake_request:82
 *   skills/pipeline/scripts/tap/ws_reconstruct.py
 *     _json_list_item_key:10 · _merge_json_lists:17 · reconstruct_ws_request_body:29
 *     · reconstruct_ws_response_body:58 · is_prompt_bearing_ws_request_body:98 · _ws_input_item_is_prompt:116
 *   is_capture_only_request 引自 skills/pipeline/scripts/tap/capture_only.py:17（本模块内联移植其非流式判定）。
 *
 * 结构改进：老仓 read_frame 读 blocking file 对象；本仓改「一次性 Buffer + 偏移量」纯函数解码
 *   （decodeFrame 不完整返 null，decodeMessages 全流合并续帧）——零 socket 依赖，可纯 buffer 单测。
 *
 * 安全护栏（#34e）：本模块纯 Buffer/JSON 逻辑，零网络 import——重组结果只经 trace-store 落本地。
 */
import { createHash, randomBytes } from 'node:crypto'

/** RFC 6455 §1.3 magic GUID。ws_frame.py:15。 */
export const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

/** WebSocket opcodes。ws_frame.py:16。 */
export const WS_OPCODES = {
  CONTINUATION: 0x0,
  TEXT: 0x1,
  BINARY: 0x2,
  CLOSE: 0x8,
  PING: 0x9,
  PONG: 0xa,
} as const

/** Sec-WebSocket-Accept = base64(sha1(key + GUID))。ws_frame.py:19 build_accept。 */
export function computeAcceptKey(secWebSocketKey: string): string {
  return createHash('sha1').update(secWebSocketKey + WS_GUID).digest('base64')
}

export interface EncodeFrameOptions {
  mask?: boolean
  fin?: boolean
}

/** 编一个 WS 帧（FIN 默认 1；mask=true 时真生成 4 字节掩码键并 XOR 载荷）。ws_frame.py:24 build_frame。 */
export function encodeFrame(opcode: number, payload: Buffer, opts: EncodeFrameOptions = {}): Buffer {
  const fin = opts.fin ?? true
  const mask = opts.mask ?? false
  const b0 = (fin ? 0x80 : 0x00) | (opcode & 0x0f)
  const len = payload.length
  const maskBit = mask ? 0x80 : 0x00

  let header: Buffer
  if (len < 126) {
    header = Buffer.from([b0, maskBit | len])
  } else if (len < 65536) {
    header = Buffer.alloc(4)
    header[0] = b0
    header[1] = maskBit | 126
    header.writeUInt16BE(len, 2)
  } else {
    header = Buffer.alloc(10)
    header[0] = b0
    header[1] = maskBit | 127
    header.writeBigUInt64BE(BigInt(len), 2)
  }

  if (!mask) return Buffer.concat([header, payload])

  const key = randomBytes(4)
  const masked = Buffer.allocUnsafe(len)
  for (let i = 0; i < len; i++) masked[i] = payload[i]! ^ key[i % 4]!
  return Buffer.concat([header, key, masked])
}

export interface DecodedFrame {
  opcode: number
  payload: Buffer
  fin: boolean
  masked: boolean
  /** 本帧占用的总字节数（含头 + 掩码键 + 载荷），供流式推进偏移。 */
  frameLength: number
}

/** 从 buf[offset..] 解一帧；不足以构成完整帧 → null（不越界）。ws_frame.py:45 read_frame。 */
export function decodeFrame(buf: Buffer, offset = 0): DecodedFrame | null {
  if (buf.length - offset < 2) return null
  const b0 = buf[offset]!
  const b1 = buf[offset + 1]!
  const fin = (b0 & 0x80) !== 0
  const opcode = b0 & 0x0f
  const masked = (b1 & 0x80) !== 0
  let len = b1 & 0x7f
  let pos = offset + 2

  if (len === 126) {
    if (buf.length - pos < 2) return null
    len = buf.readUInt16BE(pos)
    pos += 2
  } else if (len === 127) {
    if (buf.length - pos < 8) return null
    len = Number(buf.readBigUInt64BE(pos))
    pos += 8
  }

  let maskKey: Buffer | null = null
  if (masked) {
    if (buf.length - pos < 4) return null
    maskKey = buf.subarray(pos, pos + 4)
    pos += 4
  }

  if (buf.length - pos < len) return null
  let payload = buf.subarray(pos, pos + len)
  if (masked && maskKey && len > 0) {
    const unmasked = Buffer.allocUnsafe(len)
    for (let i = 0; i < len; i++) unmasked[i] = payload[i]! ^ maskKey[i % 4]!
    payload = unmasked
  }
  return { opcode, payload, fin, masked, frameLength: pos + len - offset }
}

export interface WsMessage {
  opcode: number
  payload: Buffer
}

/**
 * 解一整段字节流为消息列表：数据帧的 continuation 分片真合并成整消息；
 * 控制帧（>=0x8）单独成条。ws_frame.py:66 read_message（这里作用于全 Buffer）。
 */
export function decodeMessages(buf: Buffer): WsMessage[] {
  const out: WsMessage[] = []
  let offset = 0
  let current: { opcode: number; chunks: Buffer[] } | null = null

  while (offset < buf.length) {
    const frame = decodeFrame(buf, offset)
    if (frame === null) break
    offset += frame.frameLength

    if (frame.opcode >= 0x8) {
      // 控制帧（ping/pong/close）：不参与分片，独立成条
      out.push({ opcode: frame.opcode, payload: frame.payload })
      continue
    }
    if (frame.opcode === WS_OPCODES.CONTINUATION) {
      if (current) {
        current.chunks.push(frame.payload)
        if (frame.fin) {
          out.push({ opcode: current.opcode, payload: Buffer.concat(current.chunks) })
          current = null
        }
      }
      continue
    }
    // 数据帧起始（text/binary）
    if (frame.fin) {
      out.push({ opcode: frame.opcode, payload: frame.payload })
    } else {
      current = { opcode: frame.opcode, chunks: [frame.payload] }
    }
  }
  return out
}

/** 构造对上游的 WS Upgrade GET 请求字节。ws_frame.py:82 ws_handshake_request。 */
export function buildWsHandshakeRequest(host: string, path: string, headers: Record<string, string>, secKey: string): Buffer {
  const lines = [
    `GET ${path} HTTP/1.1`,
    `Host: ${host}`,
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Key: ${secKey}`,
    'Sec-WebSocket-Version: 13',
  ]
  for (const [k, v] of Object.entries(headers)) lines.push(`${k}: ${v}`)
  return Buffer.from(lines.join('\r\n') + '\r\n\r\n', 'latin1')
}

// ── body 重组（ws_reconstruct.py）────────────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** python `value in (None, "", [], {})` 的等价（值语义空判定）。 */
function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (v === '') return true
  if (Array.isArray(v)) return v.length === 0
  if (isPlainObject(v)) return Object.keys(v).length === 0
  return false
}

function stableKey(item: unknown): string {
  try {
    return JSON.stringify(item, (_k, val) => {
      if (isPlainObject(val)) {
        const sorted: Record<string, unknown> = {}
        for (const k of Object.keys(val).sort()) sorted[k] = val[k]
        return sorted
      }
      return val
    })
  } catch {
    return String(item)
  }
}

/** 按 JSON key 去重合并两个列表（保序追加新项）。ws_reconstruct.py:17 _merge_json_lists。 */
function mergeJsonLists(existing: unknown[], incoming: unknown[]): unknown[] {
  const merged = [...existing]
  const seen = new Set(merged.map(stableKey))
  for (const item of incoming) {
    const key = stableKey(item)
    if (seen.has(key)) continue
    merged.push(item)
    seen.add(key)
  }
  return merged
}

function parseMessage(msg: string | Buffer): unknown {
  const text = Buffer.isBuffer(msg) ? msg.toString('utf8') : String(msg)
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** 合并 client WS 消息成最完整的请求体。ws_reconstruct.py:29 reconstruct_ws_request_body。 */
export function reconstructWsRequestBody(clientMessages: Array<string | Buffer>): Record<string, unknown> | null {
  let merged: Record<string, unknown> | null = null
  for (const msg of clientMessages) {
    const parsed = parseMessage(msg)
    if (!isPlainObject(parsed)) continue
    if (merged === null) {
      merged = { ...parsed }
      continue
    }
    for (const [key, value] of Object.entries(parsed)) {
      if (key === 'input' || key === 'tools') {
        if (Array.isArray(merged[key]) && Array.isArray(value)) {
          merged[key] = mergeJsonLists(merged[key] as unknown[], value)
        } else if (value) {
          merged[key] = value
        } else if (!(key in merged)) {
          merged[key] = value
        }
        continue
      }
      if (!isEmptyValue(value)) merged[key] = value
      else if (!(key in merged)) merged[key] = value
    }
  }
  return merged
}

const RESPONSE_MERGE_TYPES = new Set(['response.created', 'response.in_progress', 'response.completed', 'response.done'])

/** 从 WS 事件 best-effort 重建响应体。ws_reconstruct.py:58 reconstruct_ws_response_body。 */
export function reconstructWsResponseBody(wsEvents: unknown[]): Record<string, unknown> | null {
  let merged: Record<string, unknown> | null = null
  const outputItems = new Map<number, unknown>()

  for (const event of wsEvents) {
    if (!isPlainObject(event)) continue
    const eventType = event.type
    const payload = 'response' in event ? event.response : event
    if (isPlainObject(payload) && typeof eventType === 'string' && RESPONSE_MERGE_TYPES.has(eventType)) {
      if (merged === null) {
        merged = { ...payload }
      } else {
        for (const [key, value] of Object.entries(payload)) {
          if (key === 'output' || key === 'usage') {
            if (value) merged[key] = value
            else if (!(key in merged)) merged[key] = value
            continue
          }
          if (!isEmptyValue(value)) merged[key] = value
          else if (!(key in merged)) merged[key] = value
        }
      }
    }
    if (eventType === 'response.output_item.done') {
      const item = event.item
      const outputIndex = event.output_index
      if (isPlainObject(item) && typeof outputIndex === 'number' && Number.isInteger(outputIndex)) {
        outputItems.set(outputIndex, item)
      }
    }
  }

  if (outputItems.size > 0) {
    const ordered = [...outputItems.keys()].sort((a, b) => a - b).map((idx) => outputItems.get(idx))
    if (merged === null) merged = { output: ordered }
    else if (!merged.output) merged.output = ordered
  }
  return merged
}

// ── is_capture_only_request（非流式判定，capture_only.py:17 内联移植）────────────

const CAPTURE_ONLY_MODEL_PREFIXES = [
  '/v1/messages', '/v1/complete', '/model/', '/v1/responses', '/responses',
  '/v1/chat/completions', '/chat/completions', '/v1/completions', '/completions',
  '/v1/models', '/models', '/v1beta/models', '/v1alpha/models',
]
const CAPTURE_ONLY_BODY_KEYS = ['system', 'messages', 'instructions', 'input', 'contents', 'system_instruction']

/** 是否该短路合成（只对模型 API）。capture_only.py:17 is_capture_only_request。 */
export function isCaptureOnlyRequest(path: string, body: unknown): boolean {
  const cleanPath = path.split('?', 1)[0]!
  if (cleanPath.startsWith('/v1/embeddings') || cleanPath.startsWith('/embeddings') || cleanPath.startsWith('/v1/files') || cleanPath.startsWith('/files')) {
    return false
  }
  if (CAPTURE_ONLY_MODEL_PREFIXES.some((p) => cleanPath.startsWith(p))) return true
  if (cleanPath.startsWith('/v1internal:') || cleanPath.startsWith('/v1internal/')) {
    return cleanPath.toLowerCase().includes('generatecontent')
  }
  if (isPlainObject(body) && isPlainObject(body.request)) return isCaptureOnlyRequest(path, body.request)
  return isPlainObject(body) && CAPTURE_ONLY_BODY_KEYS.some((k) => k in body)
}

function wsInputItemIsPrompt(item: unknown): boolean {
  if (typeof item === 'string') return item.trim().length > 0
  if (!isPlainObject(item)) return false
  if (item.type === 'function_call_output') return false
  if (item.role === 'user' || item.role === 'developer' || item.role === 'system') return true
  return ['content', 'text', 'input_text'].some((k) => k in item)
}

const PROMPT_BEARING_KEYS = ['system', 'instructions', 'system_instruction', 'systemInstruction', 'messages', 'contents', 'prompt']

/** 重组的 WS 请求是否真含 prompt。ws_reconstruct.py:98 is_prompt_bearing_ws_request_body。 */
export function isPromptBearingWsRequestBody(body: unknown): boolean {
  if (!isPlainObject(body)) return false
  if (!isCaptureOnlyRequest('', body)) return false
  for (const key of PROMPT_BEARING_KEYS) {
    if (body[key]) return true
  }
  const input = body.input
  if (typeof input === 'string') return input.trim().length > 0
  if (Array.isArray(input)) return input.some((item) => wsInputItemIsPrompt(item))
  const nested = body.request
  return isPlainObject(nested) && isPromptBearingWsRequestBody(nested)
}
