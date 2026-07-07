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
 *
 * 与 claude 8766 生命线隔离：绑独立端口。安全护栏（#34e）：录制受 isCaptureEnabled 门控（默认 OFF）；
 *   TLS 解密同受 capture 门控；捕获只落本地 trace_store，CA 私钥不外发（见 certs.ts）。
 */
import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse, type OutgoingHttpHeaders } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { TLSSocket, createSecureContext } from 'node:tls'
import { connect as netConnect, type AddressInfo, type Socket } from 'node:net'
import { HOP_BY_HOP, TurnCounter, buildRecord, safeJson, shouldSkipTraceRecord } from './record.js'
import { isCaptureEnabled, registerIntercept } from './security.js'
import { getTraceStore, type TraceStore } from './trace-store.js'
import type { CertificateAuthority } from './certs.js'
import { assembleBedrockConverseBody, attachBedrockErrors, decodeBedrockEventstreamEvents, isBedrockEventstreamPath } from './bedrock.js'
import { attachWsRelay } from './ws-proxy.js'

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

export function serveForward(opts: ForwardProxyOptions = {}): Promise<ForwardProxyHandle> {
  const store = opts.store ?? getTraceStore()
  const client = opts.client ?? 'forward'
  const host = opts.host ?? '127.0.0.1'
  const sessionId = store.createSession({ client, proxyMode: 'forward' })
  const counter = new TurnCounter()
  const tunnels = new Set<Socket>()

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

    function forward(body: Buffer): void {
      const method = (req.method ?? 'GET').toUpperCase()
      const path = (targetUrl.pathname || '/') + (targetUrl.search || '')
      const upstreamBaseUrl = `${targetUrl.protocol}//${targetUrl.host}`
      const captureGate = method === 'POST' && isCaptureEnabled({ dir: store.dir })
      const turn = counter.next()
      const t0 = Date.now()
      const reqBody = captureGate ? safeJson(body) : null

      const fwdHeaders: OutgoingHttpHeaders = {}
      for (const [k, v] of Object.entries(req.headers)) {
        if (HOP_BY_HOP.has(k.toLowerCase())) continue
        if (v !== undefined) fwdHeaders[k] = v
      }
      fwdHeaders.Host = targetUrl.host

      const upReq = httpRequest({
        protocol: 'http:', hostname: targetUrl.hostname, port: targetUrl.port || 80,
        method, path, headers: fwdHeaders,
      }, (upstream) => {
        const status = upstream.statusCode ?? 502
        const buf: Buffer[] = []
        upstream.on('data', (c: Buffer) => buf.push(c))
        upstream.on('end', () => {
          const raw = Buffer.concat(buf)
          res.writeHead(status, relayHeaders(upstream, true, raw.length))
          res.end(raw)
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
                  respBody: buildRespBody(path, raw), upstreamBaseUrl, transport: 'forward',
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
              respBody: { error: err.message }, upstreamBaseUrl, transport: 'forward',
            }))
          } catch { /* best-effort */ }
        }
      })
      if (body.length) upReq.write(body)
      upReq.end()
    }
  })

  // ── TLS MITM 终结机件（仅 opts.ca 提供时启用；#34b additive）──
  const ca = opts.ca
  let mitmServer: Server | null = null
  interface MitmTarget { hostname: string; port: number }
  const resolveMitmTarget = (req: IncomingMessage): MitmTarget =>
    (req.socket as unknown as { __mitmTarget?: MitmTarget }).__mitmTarget ?? { hostname: String(req.headers.host ?? '').split(':')[0] || '', port: 443 }

  function getMitmServer(): Server {
    if (mitmServer) return mitmServer
    mitmServer = createServer((req: IncomingMessage, res: ServerResponse) => handleMitmRequest(req, res))
    mitmServer.on('clientError', () => { /* 单连接错误不影响 daemon */ })
    // #34-wire：wss:// 升级请求（TLS 已被上面终结）真中继 + 帧重组入录（ws-reconstruct 工具首次接活路径）。
    attachWsRelay(mitmServer, {
      store, sessionId, nextTurn: () => counter.next(),
      resolveTarget: (req) => { const t = resolveMitmTarget(req); return { hostname: t.hostname, port: t.port, useTls: true } },
    })
    return mitmServer
  }

  function terminateTls(clientSocket: Socket, head: Buffer, hostname: string, port: number): void {
    try {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head && head.length) clientSocket.unshift(head)
      const { key, cert } = ca!.secureContextOptions(hostname)
      const tlsSocket = new TLSSocket(clientSocket, { isServer: true, secureContext: createSecureContext({ key, cert }) })
      ;(tlsSocket as unknown as { __mitmTarget: MitmTarget }).__mitmTarget = { hostname, port }
      tunnels.add(clientSocket)
      tunnels.add(tlsSocket)
      const drop = (): void => { tunnels.delete(clientSocket); tunnels.delete(tlsSocket) }
      tlsSocket.on('error', () => { try { tlsSocket.destroy() } catch { /* ignore */ } ; try { clientSocket.destroy() } catch { /* ignore */ } ; drop() })
      tlsSocket.on('close', drop)
      clientSocket.on('error', () => { try { tlsSocket.destroy() } catch { /* ignore */ } ; drop() })
      getMitmServer().emit('connection', tlsSocket)
    } catch {
      try { clientSocket.destroy() } catch { /* ignore */ }
    }
  }

  function handleMitmRequest(req: IncomingMessage, res: ServerResponse): void {
    const target = resolveMitmTarget(req)
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => forwardMitm(Buffer.concat(chunks)))
    req.on('error', () => { try { res.destroy() } catch { /* ignore */ } })

    function forwardMitm(body: Buffer): void {
      const method = (req.method ?? 'GET').toUpperCase()
      const path = req.url ?? '/'
      const upstreamBaseUrl = `https://${target.hostname}`
      const captureGate = method === 'POST' && isCaptureEnabled({ dir: store.dir })
      const turn = counter.next()
      const t0 = Date.now()
      const reqBody = captureGate ? safeJson(body) : null

      const fwdHeaders: OutgoingHttpHeaders = {}
      for (const [k, v] of Object.entries(req.headers)) {
        if (HOP_BY_HOP.has(k.toLowerCase())) continue
        if (v !== undefined) fwdHeaders[k] = v
      }
      fwdHeaders.Host = target.hostname

      const upReq = httpsRequest({
        hostname: target.hostname, port: target.port, method, path, headers: fwdHeaders,
        rejectUnauthorized: false, // MITM 代理不校验上游证书（对齐老仓 forward 语义）
      }, (upstream) => {
        const status = upstream.statusCode ?? 502
        const buf: Buffer[] = []
        upstream.on('data', (c: Buffer) => buf.push(c))
        upstream.on('end', () => {
          const raw = Buffer.concat(buf)
          try { res.writeHead(status, relayHeaders(upstream, true, raw.length)); res.end(raw) } catch { /* sent */ }
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
                  respBody: buildRespBody(path, raw), upstreamBaseUrl, transport: 'forward-tls',
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
              respBody: { error: err.message }, upstreamBaseUrl, transport: 'forward-tls',
            }))
          } catch { /* best-effort */ }
        }
      })
      if (body.length) upReq.write(body)
      upReq.end()
    }
  }

  // ── ② CONNECT 隧道：ca+capture → TLS MITM 终结；否则盲隧道透传 ──
  server.on('connect', (req: IncomingMessage, clientSocket: Socket, head: Buffer) => {
    const authority = req.url ?? ''
    const idx = authority.lastIndexOf(':')
    const hostname = idx > 0 ? authority.slice(0, idx) : authority
    const port = idx > 0 ? Number(authority.slice(idx + 1)) || 443 : 443

    // 双护栏：仅 ca 提供 **且** capture ON 才解密；否则盲隧道（默认 OFF 绝不解密）。
    if (ca && isCaptureEnabled({ dir: store.dir })) {
      terminateTls(clientSocket, head, hostname, port)
      return
    }

    const upstream = netConnect(port, hostname, () => {
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
      try { upstream.destroy() } catch { /* ignore */ }
      try { clientSocket.destroy() } catch { /* ignore */ }
    }
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
            if (mitmServer) { try { mitmServer.close() } catch { /* ignore */ } }
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
