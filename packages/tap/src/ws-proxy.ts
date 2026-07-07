/**
 * ws-proxy —— WebSocket 升级请求的透明中继 + 帧重组入录（BACKLOG #34-wire：record 路径接 ws 重组）。
 *
 * ws-reconstruct.ts（#34b）只提供了纯解码/重组函数，从未接入过任何真实代理路径——本模块是那批
 * 工具第一次被接进活的 socket 中继。范围限定：只挂 wss://（经 CONNECT + TLS MITM 终结后的
 * mitmServer），不挂明文 ws://（CLIENT_CONFIGS 里没有任何 client 的 defaultTarget 是 ws:// —— 这些
 * 云端 agent API 一律 TLS，明文 ws:// 中继属未要求的 YAGNI 扩展，需要时再加）。
 *
 * 中继策略：**透明字节转发 + 旁路解帧**，不重新发起自己的握手：
 *   client → upstream：http.Server 已解析过 client 自己的握手请求行/头，`'upgrade'` 事件后收到的
 *     `head` + 后续 data 都是原始 WS 帧字节，原样转发给 upstream（同时喂 accumulator 解帧）。
 *   upstream → client：我们主动向 upstream 重放 client 的握手请求（不用自己伪造 key，直接透传
 *     client 的 Sec-WebSocket-Key，故 upstream 的 101 响应对 client 自身校验天然有效），读到
 *     `\r\n\r\n` 边界前原样转发响应头，边界之后的字节才是 WS 帧（同样原样转发 + 喂 accumulator）。
 *   连接结束（任一侧 close/end）→ 重组两侧累积的文本消息，capture ON 且识别出真 prompt
 *     （isPromptBearingWsRequestBody）才落一条结构化 trace 记录；纯心跳/非 prompt 会话不记噪声。
 */
import { connect as netConnect, type Socket } from 'node:net'
import { connect as tlsConnect } from 'node:tls'
import type { IncomingMessage, Server } from 'node:http'
import { buildRecord } from './record.js'
import { isCaptureEnabled } from './security.js'
import type { TraceStore } from './trace-store.js'
import {
  WS_OPCODES,
  decodeFrame,
  isPromptBearingWsRequestBody,
  reconstructWsRequestBody,
  reconstructWsResponseBody,
  type DecodedFrame,
  type WsMessage,
} from './ws-reconstruct.js'

/** 增量帧累加器：跨多次 socket 'data' 事件正确合并 continuation 分片（decodeMessages 的有状态版）。 */
export class WsFrameAccumulator {
  private buf: Buffer = Buffer.alloc(0)
  private pendingOpcode: number | null = null
  private pendingChunks: Buffer[] = []
  readonly messages: WsMessage[] = []

  push(chunk: Buffer): void {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk
    for (;;) {
      const frame = decodeFrame(this.buf, 0)
      if (frame === null) break
      this.buf = this.buf.subarray(frame.frameLength)
      this.consume(frame)
    }
  }

  private consume(frame: DecodedFrame): void {
    if (frame.opcode >= 0x8) {
      this.messages.push({ opcode: frame.opcode, payload: frame.payload })
      return
    }
    if (frame.opcode === WS_OPCODES.CONTINUATION) {
      if (this.pendingOpcode !== null) {
        this.pendingChunks.push(frame.payload)
        if (frame.fin) {
          this.messages.push({ opcode: this.pendingOpcode, payload: Buffer.concat(this.pendingChunks) })
          this.pendingOpcode = null
          this.pendingChunks = []
        }
      }
      return
    }
    if (frame.fin) {
      this.messages.push({ opcode: frame.opcode, payload: frame.payload })
    } else {
      this.pendingOpcode = frame.opcode
      this.pendingChunks = [frame.payload]
    }
  }
}

const textOf = (m: WsMessage): string => m.payload.toString('utf8')

/** 解析出的真实中继目标（mitm 场景：解密后的原 CONNECT host:port；useTls=真实上游是否要 TLS）。 */
export interface WsRelayTarget {
  readonly hostname: string
  readonly port: number
  readonly useTls: boolean
}

export interface WsRelayOptions {
  readonly store: TraceStore
  readonly sessionId: string
  readonly nextTurn: () => number
  /** 从升级请求解析真实上游；返回 null = 不识别该请求，直接断开（不裸转发未知目标）。 */
  readonly resolveTarget: (req: IncomingMessage) => WsRelayTarget | null
}

/** 把一个 http.Server 的 'upgrade' 事件接成真中继（BACKLOG #34-wire）。 */
export function attachWsRelay(server: Server, opts: WsRelayOptions): void {
  server.on('upgrade', (req: IncomingMessage, clientSocket: Socket, head: Buffer) => {
    const resolved = opts.resolveTarget(req)
    if (!resolved) {
      try { clientSocket.destroy() } catch { /* ignore */ }
      return
    }
    // 绑定到一个非空类型的局部变量：narrowing 不会穿透下面 finalize() 这个嵌套函数声明
    // （TS 对嵌套函数闭包引用外层 const 的收窄支持有限），故显式固定类型而非依赖流分析。
    const target: WsRelayTarget = resolved

    const t0 = Date.now()
    const upstreamSocket = target.useTls
      ? tlsConnect({ host: target.hostname, port: target.port, rejectUnauthorized: false })
      : netConnect(target.port, target.hostname)

    let settled = false
    const teardown = (): void => {
      if (settled) return
      settled = true
      try { clientSocket.destroy() } catch { /* ignore */ }
      try { upstreamSocket.destroy() } catch { /* ignore */ }
      finalize()
    }
    clientSocket.on('error', teardown)
    upstreamSocket.on('error', teardown)
    clientSocket.on('close', teardown)
    upstreamSocket.on('close', teardown)

    const clientAcc = new WsFrameAccumulator()
    const serverAcc = new WsFrameAccumulator()

    // client → upstream：'upgrade' 事件之后的一切字节都是 WS 帧（http 已消费完握手请求行/头）。
    if (head && head.length) clientAcc.push(head)
    clientSocket.on('data', (chunk: Buffer) => {
      clientAcc.push(chunk)
      if (!settled) upstreamSocket.write(chunk)
    })

    upstreamSocket.once('connect', () => {
      if (settled) return
      const lines = [`${req.method ?? 'GET'} ${req.url ?? '/'} HTTP/1.1`, `Host: ${target.hostname}`]
      for (const [k, v] of Object.entries(req.headers)) {
        if (k.toLowerCase() === 'host') continue
        const vals = Array.isArray(v) ? v : v !== undefined ? [String(v)] : []
        for (const val of vals) lines.push(`${k}: ${val}`)
      }
      upstreamSocket.write(Buffer.from(lines.join('\r\n') + '\r\n\r\n', 'latin1'))
      if (head && head.length) upstreamSocket.write(head)
    })

    let handshakeBuf = Buffer.alloc(0)
    let inHandshake = true
    upstreamSocket.on('data', (chunk: Buffer) => {
      if (settled) return
      if (inHandshake) {
        handshakeBuf = Buffer.concat([handshakeBuf, chunk])
        const idx = handshakeBuf.indexOf('\r\n\r\n')
        if (idx === -1) return // 握手响应头还没读全，先不转发（避免半截头触发客户端解析错误）
        inHandshake = false
        const headerPart = handshakeBuf.subarray(0, idx + 4)
        const remainder = handshakeBuf.subarray(idx + 4)
        clientSocket.write(headerPart)
        if (remainder.length) {
          serverAcc.push(remainder)
          clientSocket.write(remainder)
        }
        return
      }
      serverAcc.push(chunk)
      clientSocket.write(chunk)
    })

    let finalized = false
    function finalize(): void {
      if (finalized) return
      finalized = true
      const clientTexts = clientAcc.messages.filter((m) => m.opcode === WS_OPCODES.TEXT).map(textOf)
      if (clientTexts.length === 0) return // 无真数据帧（纯心跳/被拒握手）：没什么可重组
      const requestBody = reconstructWsRequestBody(clientTexts)
      if (!requestBody || !isPromptBearingWsRequestBody(requestBody)) return // 非 prompt 会话：不记噪声
      if (!isCaptureEnabled({ dir: opts.store.dir })) return // 安全护栏：capture OFF 绝不落盘

      const serverEvents = serverAcc.messages
        .filter((m) => m.opcode === WS_OPCODES.TEXT)
        .map((m) => { try { return JSON.parse(textOf(m)) } catch { return undefined } })
        .filter((v) => v !== undefined)
      const responseBody = reconstructWsResponseBody(serverEvents)

      try {
        opts.store.appendRecord(opts.sessionId, buildRecord({
          reqId: 'ws_' + Math.random().toString(16).slice(2, 14),
          turn: opts.nextTurn(),
          durationMs: Date.now() - t0,
          method: 'WS',
          path: req.url ?? '/',
          reqHeaders: req.headers,
          reqBody: requestBody,
          status: 101,
          respHeaders: {},
          respBody: responseBody,
          upstreamBaseUrl: `${target.useTls ? 'wss' : 'ws'}://${target.hostname}`,
          transport: 'forward-ws',
        }))
      } catch { /* best-effort，同其余 tap 落盘路径 */ }
    }
  })
}
