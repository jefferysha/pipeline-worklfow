/**
 * capture-proxy —— reverse 抓包代理：透明转发所有路径到上游，只对录制路径落 trace_store。
 *
 * 老仓真相源（严格只读移植）: skills/pipeline/scripts/tap/capture_proxy.py
 *   serve:353 · make_handler:226 · _proxy:255 · _open_upstream:210 · shutdown_server:369。
 *   透明转发全路径（否则 claude 断线），只 /v1/messages 录 trace；SSE 流式转发。
 *
 * 与 claude 8766 生命线隔离：本代理绑独立端口（daemon 保证不占 8766）；崩溃不波及 claude。
 * 安全护栏（#34e）：录制受 isCaptureEnabled 门控（默认 OFF）；捕获只经 trace_store 落本地盘。
 *
 * 本批范围：非流式 JSON + SSE 流式透传 + 原始文本落库。SSE→结构化事件重组属 #34b（ws/bedrock/sse）。
 */
import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse, type OutgoingHttpHeaders } from 'node:http'
import { request as httpsRequest, type RequestOptions } from 'node:https'
import type { AddressInfo } from 'node:net'
import { HOP_BY_HOP, TurnCounter, buildRecord, extractRealSessionId, safeJson } from './record.js'
import { isCaptureEnabled, registerIntercept } from './security.js'
import { getTraceStore, type TraceStore } from './trace-store.js'

export const RECORDED_PATH = '/v1/messages'

export interface CaptureProxyOptions {
  target: string
  port?: number
  host?: string
  store?: TraceStore
  client?: string
  recordedPaths?: string[]
  stripPrefix?: string
}

export interface CaptureProxyHandle {
  port: number
  host: string
  target: string
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

export function serve(opts: CaptureProxyOptions): Promise<CaptureProxyHandle> {
  const store = opts.store ?? getTraceStore()
  const client = opts.client ?? 'claude'
  const targetUrl = new URL(opts.target)
  const upstreamBaseUrl = `${targetUrl.protocol}//${targetUrl.host}`
  const recordedSet = new Set(opts.recordedPaths ?? [RECORDED_PATH])
  const stripPrefix = opts.stripPrefix ?? ''
  const host = opts.host ?? '127.0.0.1'
  const sessionId = store.createSession({ client, proxyMode: 'reverse' })
  const counter = new TurnCounter()
  // B10：每 real session 一个进程内 turn 计数（同步自增）。避免同 session 并发请求在各自 handler 头都
  // 读到同一 store.recordCount 撞同一 turn（appendRecord 晚于读，读-写有窗口）。首见用 recordCount 播种。
  const sessionTurns = new Map<string, number>()

  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => { void handle(Buffer.concat(chunks)) })
    req.on('error', () => { try { res.destroy() } catch { /* ignore */ } })
    // B2：挂 res 'error' 静默——client abort 后对已销毁 res 的异步写会 emit 'error'，无监听即抛
    // 未捕获异常带崩整个 daemon（连累所有 client）。回写失败对已断 client 无意义，静默吞。
    res.on('error', () => { /* client 已断，回写失败无害 */ })

    async function handle(body: Buffer): Promise<void> {
      const path = req.url ?? '/'
      const cleanPath = path.split('?', 1)[0] ?? ''
      const method = (req.method ?? 'GET').toUpperCase()
      const recorded = method === 'POST' && recordedSet.has(cleanPath) && isCaptureEnabled({ dir: store.dir })

      let realSid = sessionId
      let turn = 0
      if (recorded) {
        try {
          realSid = extractRealSessionId(req.headers, body, sessionId)
          const { recordCount } = store.getOrCreateSession(realSid, { client, proxyMode: 'reverse' })
          // B10：原子自增（本段同步、无 await 穿插，node 单线程天然互斥）。首见该 session 用落盘
          // recordCount 播种，之后进程内自增 → 同 session 并发请求拿到互异 turn，不再撞号。
          const base = sessionTurns.get(realSid) ?? recordCount
          turn = base + 1
          sessionTurns.set(realSid, turn)
        } catch {
          realSid = sessionId
          turn = counter.next()
        }
      }

      let upstreamPath = path
      // B7：仅当 stripPrefix 是完整路径段（===prefix 或 prefix+'/'）才剥，避免裸 startsWith 把
      // `/v1internal/x` 误剥成 `internal/x`（丢前导斜杠）。对齐 record.ts shouldSkipTraceRecord 的段判定。
      if (stripPrefix && (cleanPath === stripPrefix || cleanPath.startsWith(stripPrefix + '/'))) {
        upstreamPath = path.slice(stripPrefix.length) || '/'
      }

      const fwdHeaders: OutgoingHttpHeaders = {}
      for (const [k, v] of Object.entries(req.headers)) {
        if (HOP_BY_HOP.has(k.toLowerCase())) continue
        if (v !== undefined) fwdHeaders[k] = v
      }
      fwdHeaders.Host = targetUrl.host

      const t0 = Date.now()
      const reqBody = recorded ? safeJson(body) : null
      const isHttps = targetUrl.protocol === 'https:'
      const reqFn = isHttps ? httpsRequest : httpRequest
      const reqOpts: RequestOptions = {
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname,
        port: targetUrl.port || (isHttps ? 443 : 80),
        method,
        path: upstreamPath,
        headers: fwdHeaders,
      }

      const upReq = reqFn(reqOpts, (upstream) => {
        const status = upstream.statusCode ?? 502
        const ctype = String(upstream.headers['content-type'] ?? '').toLowerCase()
        const isStream = ctype.includes('text/event-stream')
        const captureBuf: Buffer[] = []

        if (isStream) {
          // B2：成功回写全包 try/catch——client 中途 abort 后对已销毁 res 的 write/writeHead 会
          // 同步抛（ERR_STREAM_WRITE_AFTER_END/DESTROYED），裸调即带崩 daemon。仍照常收 captureBuf 落录。
          try { res.writeHead(status, relayHeaders(upstream, false, 0)) } catch { /* client 已断 */ }
          upstream.on('data', (c: Buffer) => {
            try { res.write(c) } catch { /* client 已断 */ }
            if (recorded) captureBuf.push(c)
          })
          upstream.on('end', () => {
            try { res.end() } catch { /* client 已断 */ }
            if (recorded) {
              const rawText = Buffer.concat(captureBuf).toString('utf8')
              appendCapture(status, upstream, rawText, rawText)
            }
          })
        } else {
          upstream.on('data', (c: Buffer) => captureBuf.push(c))
          upstream.on('end', () => {
            const raw = Buffer.concat(captureBuf)
            try { res.writeHead(status, relayHeaders(upstream, true, raw.length)); res.end(raw) } catch { /* client 已断 */ }
            if (recorded) appendCapture(status, upstream, safeJson(raw), undefined)
          })
        }
      })

      upReq.on('error', (err) => {
        const msg = Buffer.from(JSON.stringify({ error: `upstream unavailable: ${err.message}` }), 'utf8')
        try {
          res.writeHead(502, { 'Content-Type': 'application/json', 'Content-Length': msg.length })
          res.end(msg)
        } catch { /* headers already sent */ }
        if (recorded) {
          try {
            store.appendRecord(realSid, buildRecord({
              reqId: reqId(), turn, durationMs: Date.now() - t0, method, path,
              reqHeaders: req.headers, reqBody, status: 502, respHeaders: {},
              respBody: { error: err.message }, upstreamBaseUrl,
            }))
          } catch { /* store best-effort */ }
        }
      })

      if (body.length) upReq.write(body)
      upReq.end()

      function appendCapture(status: number, upstream: IncomingMessage, respBody: unknown, _raw?: string): void {
        try {
          store.appendRecord(realSid, buildRecord({
            reqId: reqId(), turn, durationMs: Date.now() - t0, method, path,
            reqHeaders: req.headers, reqBody, status,
            respHeaders: upstream.headers as Record<string, string | string[] | undefined>,
            respBody, upstreamBaseUrl,
          }))
        } catch { /* store best-effort */ }
      }
    }
  })

  return new Promise<CaptureProxyHandle>((resolve, reject) => {
    server.once('error', reject)
    server.listen(opts.port ?? 0, host, () => {
      server.removeAllListeners('error')
      const boundPort = (server.address() as AddressInfo).port
      const unregister = registerIntercept({ kind: 'reverse', port: boundPort, client, target: opts.target })
      resolve({
        port: boundPort,
        host,
        target: opts.target,
        client,
        sessionId,
        store,
        close(): Promise<void> {
          return new Promise((res) => {
            unregister()
            try {
              const row = store.loadSessionRow(sessionId)
              store.finalizeSession(sessionId, { api_calls: row?.record_count ?? 0, has_error: false })
            } catch { /* best-effort */ }
            server.close(() => res())
            if ('closeAllConnections' in server && typeof server.closeAllConnections === 'function') {
              server.closeAllConnections()
            }
          })
        },
      })
    })
  })
}

function reqId(): string { return Math.random().toString(16).slice(2, 14) }
