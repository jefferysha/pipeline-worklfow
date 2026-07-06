/**
 * forward-proxy —— forward/MITM 代理：给不支持 base-url override 的 CLI 做透明捕获。
 *
 * 老仓真相源（严格只读移植）: skills/pipeline/scripts/tap/forward_proxy.py
 *   serve_forward:594 · _handle_connect:265 · _forward_and_record:322 · should_skip_trace_record:162。
 *
 * 本批范围（#34 核心地基）:
 *   ① 明文 http 绝对 URI 代理（POST http://host/path）→ 转发上游 + 录制路径落 trace_store；
 *   ② CONNECT 盲隧道 → 对真上游透明 TCP 转发（不解密）。
 * TLS MITM 终结（CONNECT + ssl.wrap_socket + 本地 CA 签发）需 certs → 属 **#34b**；本批盲隧道透传，
 *   ws 重组 / bedrock eventstream 亦属 #34b。此处打地基：CONNECT 路径已就位，接 CA 即升级为解密录制。
 *
 * 与 claude 8766 生命线隔离：绑独立端口。安全护栏（#34e）：录制受 isCaptureEnabled 门控（默认 OFF）。
 */
import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse, type OutgoingHttpHeaders } from 'node:http'
import { connect as netConnect, type AddressInfo, type Socket } from 'node:net'
import { HOP_BY_HOP, TurnCounter, buildRecord, safeJson, shouldSkipTraceRecord } from './record.js'
import { isCaptureEnabled, registerIntercept } from './security.js'
import { getTraceStore, type TraceStore } from './trace-store.js'

export interface ForwardProxyOptions {
  port?: number
  host?: string
  store?: TraceStore
  client?: string
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
                  respBody: safeJson(raw), upstreamBaseUrl, transport: 'forward',
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

  // ── ② CONNECT 盲隧道（透明；TLS MITM 解密属 #34b）──
  server.on('connect', (req: IncomingMessage, clientSocket: Socket, head: Buffer) => {
    const authority = req.url ?? ''
    const idx = authority.lastIndexOf(':')
    const hostname = idx > 0 ? authority.slice(0, idx) : authority
    const port = idx > 0 ? Number(authority.slice(idx + 1)) || 443 : 443

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
      const unregister = registerIntercept({ kind: 'forward', port: boundPort, client })
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
