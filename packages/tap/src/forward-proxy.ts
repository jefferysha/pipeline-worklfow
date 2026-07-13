/**
 * forward-proxy —— forward/MITM 代理：给不支持 base-url override 的 CLI 做透明捕获。
 *
 * 老仓真相源（严格只读移植）: skills/pipeline/scripts/tap/forward_proxy.py
 *   serve_forward:594 · _handle_connect:265 · _forward_and_record:322 · should_skip_trace_record:162。
 *
 * 范围:
 *   ① 明文 http 绝对 URI 代理（POST http://host/path）→ 转发上游 + 录制路径落 trace_store；
 *   ② CONNECT 隧道：默认盲隧道透传（不解密）；**传入本地 CA（opts.ca）且 capture ON → 升级为 TLS
 *      MITM 终结**（#34b：本地 CA 签发 host 证书 → 解密 HTTP → 录制 → 再加密转发上游）。
 *
 * TLS 终结新增（#34b，additive）：老仓 forward_proxy.py _handle_connect 用 ssl.wrap_socket 做 MITM；
 *   本仓用 node:tls TLSSocket(isServer) + certs.ts 本地 CA 逐 host 签发对齐。**双护栏**：仅在
 *   ca 提供 **且** isCaptureEnabled 时才解密（否则退回盲隧道，绝不无谓解密）。
 *   机件本体在 tls-mitm.ts（T-c 迁出）；本文件只留明文 server + CONNECT 分派（双护栏判定）+ 生命周期编排。
 *
 * 与 claude 8766 生命线隔离：绑独立端口。安全护栏（#34e）：录制受 isCaptureEnabled 门控（默认 OFF）；
 *   TLS 解密同受 capture 门控；捕获只落本地 trace_store，CA 私钥不外发（见 certs.ts）。
 */
import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse, type OutgoingHttpHeaders } from 'node:http'
import { connect as netConnect, type AddressInfo, type Socket } from 'node:net'
import { HOP_BY_HOP, TurnCounter, buildRecord, safeJson, shouldSkipTraceRecord } from './record.js'
import { isCaptureEnabled, registerIntercept } from './security.js'
import { getTraceStore, type TraceStore } from './trace-store.js'
import type { CertificateAuthority } from './certs.js'
import { assembleBedrockConverseBody, attachBedrockErrors, decodeBedrockEventstreamEvents, isBedrockEventstreamPath } from './bedrock.js'
import { createTlsMitm, type UpstreamPlan } from './tls-mitm.js'

/**
 * 响应体构建（BACKLOG #34-wire：record 路径接 decodeBedrockEventstreamEvents）—— Bedrock
 * SigV4 端点强制走 forward（clients.ts requiresForwardForUrl），其流式响应是 AWS EventStream
 * 二进制帧，safeJson 只会读出乱码字符串。命中 isBedrockEventstreamPath 时真解码 + 装配成
 * 非流式 converse body（+ 挂 bedrock_events 全量事件供审计），解码空/异常 → 回退 safeJson
 * （fail-open，不因解码失败阻断录制）。
 */
function buildRespBody(path: string, raw: Buffer): unknown {
  if (isBedrockEventstreamPath(path)) {
    const events = decodeBedrockEventstreamEvents(raw)
    if (events.length > 0) {
      const assembled = assembleBedrockConverseBody(events)
      return attachBedrockErrors({ ...assembled, bedrock_events: events }, events)
    }
  }
  return safeJson(raw)
}

export interface ForwardProxyOptions {
  port?: number
  host?: string
  store?: TraceStore
  client?: string
  /** 提供本地 CA → CONNECT 在 capture ON 时做 TLS MITM 终结（解密录制）；缺省=盲隧道透传（#34b）。 */
  ca?: CertificateAuthority
  /**
   * B3：CONNECT 盲隧道 / ws 中继 upstream 的连接(setup)超时(ms)——上游 TCP 握手挂起（黑洞地址/
   * 防火墙丢包），upstream 既不 'connect' 也不 'error'，clientSocket+upstream 两个 fd 无限期泄漏。
   * 默认 30s；测试可注入短值(如 20ms)验证兜底。
   */
  connectTimeoutMs?: number
  /**
   * B3：CONNECT 盲隧道建立后的双向空闲超时(ms)——半开连接对端消失（TCP 不发 FIN）时 socket 永挂。
   * 默认 300s（保守取大：避免误杀慢/静默的合法隧道；仅兜底真死连的 fd 泄漏）。测试可注入短值。
   */
  tunnelIdleTimeoutMs?: number
}

export interface ForwardProxyHandle {
  port: number
  host: string
  client: string
  sessionId: string
  store: TraceStore
  close(): Promise<void>
}

function relayHeaders(upstream: IncomingMessage, includeLength: boolean, bodyLen: number): OutgoingHttpHeaders {
  const out: OutgoingHttpHeaders = {}
  for (const [k, v] of Object.entries(upstream.headers)) {
    if (HOP_BY_HOP.has(k.toLowerCase())) continue
    if (v !== undefined) out[k] = v
  }
  if (includeLength) out['Content-Length'] = String(bodyLen)
  return out
}

/** forwardAndRecord 的会话上下文（serveForward 闭包三件套，显式传参保持 helper 模块级）。 */
interface ForwardCtx { store: TraceStore; sessionId: string; counter: TurnCounter }

/**
 * 「转发 + 录制」管路单源（T-a 提取；UpstreamPlan 类型见 tls-mitm.ts——因两模块共用且本文件被
 * index.ts export *，类型落在不入 index 的 tls-mitm.ts 以免外泄公共 API）——此前 forward/
 * forwardMitm 是 ~60 行近逐字复制，
 * B2 漂移（明文侧漏 try/catch 崩 daemon）即由这对复制养出。captureGate、turn、fwdHeaders
 * 过滤、成功/502 两路 writeHead+end、shouldSkipTraceRecord、buildRecord+appendRecord、
 * B2 防崩 try/catch 自此只此一份；两调用点只算 UpstreamPlan。脱敏接缝（buildRecord）不动。
 */
function forwardAndRecord(ctx: ForwardCtx, req: IncomingMessage, res: ServerResponse, body: Buffer, plan: UpstreamPlan): void {
  const { store, sessionId, counter } = ctx
  const { path, upstreamBaseUrl, transport } = plan
  const method = (req.method ?? 'GET').toUpperCase()
  const captureGate = method === 'POST' && isCaptureEnabled({ dir: store.dir })
  const turn = counter.next()
  const t0 = Date.now()
  const reqBody = captureGate ? safeJson(body) : null

  const fwdHeaders: OutgoingHttpHeaders = {}
  for (const [k, v] of Object.entries(req.headers)) {
    if (HOP_BY_HOP.has(k.toLowerCase())) continue
    if (v !== undefined) fwdHeaders[k] = v
  }
  fwdHeaders.Host = plan.host

  const upReq = plan.makeReq({ method, path, headers: fwdHeaders }, (upstream) => {
    const status = upstream.statusCode ?? 502
    const buf: Buffer[] = []
    upstream.on('data', (c: Buffer) => buf.push(c))
    upstream.on('end', () => {
      const raw = Buffer.concat(buf)
      // B2：成功回写包 try/catch——client abort 后裸调对已销毁 res 写会同步抛，带崩 daemon。捕获仍照常进行。
      try { res.writeHead(status, relayHeaders(upstream, true, raw.length)); res.end(raw) } catch { /* client 已断 */ }
      if (captureGate) {
        const skip = shouldSkipTraceRecord({
          upstreamUrl: upstreamBaseUrl + path, path,
          responseHeaders: upstream.headers as Record<string, string | string[] | undefined>,
          requestHeaders: req.headers, method,
        })
        if (!skip) {
          try {
            store.appendRecord(sessionId, buildRecord({
              reqId: reqId(), turn, durationMs: Date.now() - t0, method, path,
              reqHeaders: req.headers, reqBody, status,
              respHeaders: upstream.headers as Record<string, string | string[] | undefined>,
              respBody: buildRespBody(path, raw), upstreamBaseUrl, transport,
            }))
          } catch { /* best-effort */ }
        }
      }
    })
  })
  upReq.on('error', (err) => {
    const msg = Buffer.from(JSON.stringify({ error: `upstream unavailable: ${err.message}` }), 'utf8')
    try { res.writeHead(502, { 'Content-Type': 'application/json', 'Content-Length': msg.length }); res.end(msg) } catch { /* sent */ }
    if (captureGate) {
      try {
        store.appendRecord(sessionId, buildRecord({
          reqId: reqId(), turn, durationMs: Date.now() - t0, method, path,
          reqHeaders: req.headers, reqBody, status: 502, respHeaders: {},
          respBody: { error: err.message }, upstreamBaseUrl, transport,
        }))
      } catch { /* best-effort */ }
    }
  })
  if (body.length) upReq.write(body)
  upReq.end()
}

export function serveForward(opts: ForwardProxyOptions = {}): Promise<ForwardProxyHandle> {
  const store = opts.store ?? getTraceStore()
  const client = opts.client ?? 'forward'
  const host = opts.host ?? '127.0.0.1'
  const sessionId = store.createSession({ client, proxyMode: 'forward' })
  const counter = new TurnCounter()
  const tunnels = new Set<Socket>()
  // B3 超时兜底默认值（生产值）；测试经 opts 注入毫秒级短值验证兜底触发。
  const connectTimeoutMs = opts.connectTimeoutMs ?? 30_000
  const tunnelIdleTimeoutMs = opts.tunnelIdleTimeoutMs ?? 300_000

  // ── ① 明文绝对 URI 代理 ──
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let targetUrl: URL
    try {
      targetUrl = new URL(req.url ?? '')
      if (!/^https?:$/.test(targetUrl.protocol)) throw new Error('non-http')
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'forward proxy 需绝对 URI' }))
      return
    }
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => forward(Buffer.concat(chunks)))
    req.on('error', () => { try { res.destroy() } catch { /* ignore */ } })
    // B2：挂 res 'error' 静默——client abort 后对已销毁 res 的异步写会 emit 'error'，无监听即抛未捕获带崩 daemon（连累所有 client）。
    res.on('error', () => { /* client 已断，回写失败无害 */ })

    // 明文路径的 UpstreamPlan：path/BaseUrl/Host 从绝对 URI 推导（Host 含端口——历史行为保持）。
    function forward(body: Buffer): void {
      forwardAndRecord({ store, sessionId, counter }, req, res, body, {
        makeReq: (o, onResp) => httpRequest({
          protocol: 'http:', hostname: targetUrl.hostname, port: targetUrl.port || 80,
          method: o.method, path: o.path, headers: o.headers,
        }, onResp),
        path: (targetUrl.pathname || '/') + (targetUrl.search || ''),
        upstreamBaseUrl: `${targetUrl.protocol}//${targetUrl.host}`,
        transport: 'forward',
        host: targetUrl.host,
      })
    }
  })

  // ── TLS MITM 终结机件（T-c 迁至 tls-mitm.ts；仅 opts.ca 提供时装配；#34b additive）──
  // 装配零副作用：内部 mitm http server 仍**惰性**创建（首个 terminate 才起，行为保持）。
  const ca = opts.ca
  const tlsMitm = ca ? createTlsMitm({
    ca, store, sessionId, counter, tunnels, connectTimeoutMs,
    // T-a 共享管路以 DI 注入（预绑 ctx）——不从本文件 export（index.ts 对本文件是 export *，导出即漏公共 API）。
    forwardAndRecord: (req, res, body, plan: UpstreamPlan) => forwardAndRecord({ store, sessionId, counter }, req, res, body, plan),
  }) : null

  // ── ② CONNECT 隧道：ca+capture → TLS MITM 终结；否则盲隧道透传 ──
  server.on('connect', (req: IncomingMessage, clientSocket: Socket, head: Buffer) => {
    const authority = req.url ?? ''
    const idx = authority.lastIndexOf(':')
    const hostname = idx > 0 ? authority.slice(0, idx) : authority
    const port = idx > 0 ? Number(authority.slice(idx + 1)) || 443 : 443

    // 双护栏：仅 ca 提供（tlsMitm 已装配）**且** capture ON 才解密；否则盲隧道（默认 OFF 绝不解密）。
    if (tlsMitm && isCaptureEnabled({ dir: store.dir })) {
      tlsMitm.terminate(clientSocket, head, hostname, port)
      return
    }

    const upstream = netConnect(port, hostname, () => {
      // 隧道建立：TCP 握手已完成 → 把 connect 超时放宽为更长的双向 idle 超时（同一 socket.setTimeout
      // 语义，重设时长即可；'timeout' 事件监听沿用同一个 cleanup）。
      upstream.setTimeout(tunnelIdleTimeoutMs)
      clientSocket.setTimeout(tunnelIdleTimeoutMs)
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head && head.length) upstream.write(head)
      upstream.pipe(clientSocket)
      clientSocket.pipe(upstream)
    })
    tunnels.add(clientSocket)
    tunnels.add(upstream)
    const cleanup = (): void => {
      tunnels.delete(clientSocket)
      tunnels.delete(upstream)
      // 关掉计时器再销毁（timer 不泄漏）：setTimeout(0) 幂等，对已销毁 socket 亦安全（try 兜底）。
      try { upstream.setTimeout(0) } catch { /* ignore */ }
      try { clientSocket.setTimeout(0) } catch { /* ignore */ }
      try { upstream.destroy() } catch { /* ignore */ }
      try { clientSocket.destroy() } catch { /* ignore */ }
    }
    // B3：connect/idle 超时兜底——上游握手挂起(黑洞/丢包)时 upstream 既不 'connect' 也不 'error'；
    // 隧道建立后半开静默时对端不发 FIN。两种情形现有 error/close 都不触发，两个 fd 无限期泄漏。
    // socket.setTimeout 按「无活动」计时：connect 阶段计 connectTimeoutMs，建立后重设为 idle 值。
    upstream.setTimeout(connectTimeoutMs)
    upstream.on('timeout', cleanup)
    clientSocket.on('timeout', cleanup)
    upstream.on('error', () => { try { clientSocket.end() } catch { /* ignore */ } ; cleanup() })
    clientSocket.on('error', cleanup)
    upstream.on('close', cleanup)
    clientSocket.on('close', cleanup)
  })

  return new Promise<ForwardProxyHandle>((resolve, reject) => {
    server.once('error', reject)
    server.listen(opts.port ?? 0, host, () => {
      server.removeAllListeners('error')
      const boundPort = (server.address() as AddressInfo).port
      const unregister = registerIntercept({ kind: 'forward', port: boundPort, client, tls: !!ca })
      resolve({
        port: boundPort,
        host,
        client,
        sessionId,
        store,
        close(): Promise<void> {
          return new Promise((res) => {
            unregister()
            for (const s of tunnels) { try { s.destroy() } catch { /* ignore */ } }
            tunnels.clear()
            if (tlsMitm) tlsMitm.close() // mitm server 关闭责任随 T-c 迁移（内部自带 try/catch）
            try {
              const row = store.loadSessionRow(sessionId)
              store.finalizeSession(sessionId, { api_calls: row?.record_count ?? 0, has_error: false })
            } catch { /* best-effort */ }
            server.close(() => res())
            ;(server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.()
          })
        },
      })
    })
  })
}

function reqId(): string { return 'req_' + Math.random().toString(16).slice(2, 14) }
