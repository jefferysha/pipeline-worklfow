/**
 * tls-mitm.test —— forward proxy 真 TLS 终结（CONNECT → 本地 CA 签发 host 证书 → 解密录制）。
 * 零 mock：真 CA 链、真 net CONNECT、真 tls 握手、真 https 上游、真 trace_store 落盘。
 * honest-skip：环境不支持证书生成 / tls 握手 → 打印原因跳过，绝不伪绿（GOAL C9 + A7 门控）。
 * 安全护栏（#34e）：TLS 解密只在 capture ON 时发生；capture OFF → 退回盲隧道不解密不录。
 * 老仓真相源：forward_proxy.py _handle_connect（ssl.wrap_socket MITM）+ certs.py CertificateAuthority。
 */
import { afterEach, describe, expect, it } from 'vitest'
import * as net from 'node:net'
import * as tls from 'node:tls'
import * as http from 'node:http'
import * as https from 'node:https'
import type { AddressInfo } from 'node:net'
import { serveForward, type ForwardProxyHandle } from './forward-proxy.js'
import { createCa, issueHostCert, CertificateAuthority, tlsMitmSupported } from './certs.js'
import { createTraceStore } from './trace-store.js'
import { resetCaptureCache, setCaptureEnabled } from './security.js'
import { rmDir, tempTapDir } from './test-support.js'
// T-c 焦点用例（只增不改）：直测终结机件新接缝（createTlsMitm 合同），不经 serveForward。
import { createTlsMitm, type UpstreamPlan } from './tls-mitm.js'
import { TurnCounter } from './record.js'

const supported = tlsMitmSupported()
if (!supported) {
  // eslint-disable-next-line no-console
  console.warn('[honest-skip] TLS MITM e2e：环境不支持本地 CA 证书生成或 tls 握手 —— 不伪绿')
}

const handles: ForwardProxyHandle[] = []
const upstreams: https.Server[] = []
const dirs: string[] = []
afterEach(async () => {
  while (handles.length) await handles.pop()!.close()
  while (upstreams.length) await new Promise<void>((r) => upstreams.pop()!.close(() => r()))
  resetCaptureCache()
  while (dirs.length) await rmDir(dirs.pop()!)
})

/** 真起一个 https 上游（用本地 CA 签发的 localhost 证书；回显 JSON）。 */
async function startHttpsUpstream(ca: ReturnType<typeof createCa>): Promise<{ server: https.Server; port: number; requests: { path: string; body: string }[] }> {
  const cert = issueHostCert(ca, 'localhost')
  const requests: { path: string; body: string }[] = []
  const server = https.createServer({ key: cert.keyPem, cert: cert.certPem }, (req, res) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      requests.push({ path: req.url ?? '/', body })
      const payload = Buffer.from(JSON.stringify({ ok: true, seen: req.url, echo: body }), 'utf8')
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': payload.length })
      res.end(payload)
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  upstreams.push(server)
  return { server, port: (server.address() as AddressInfo).port, requests }
}

/** 经 forward proxy 做 CONNECT，然后在隧道内建 TLS（信任本地 CA），发一个 HTTP 请求。 */
function mitmRequest(
  proxyPort: number, upstreamPort: number, caPem: string,
  opts: { method: string; path: string; body?: string; rejectUnauthorized?: boolean },
): Promise<{ status: number; body: string; authorized: boolean }> {
  return new Promise((resolve, reject) => {
    const raw = net.connect(proxyPort, '127.0.0.1', () => {
      raw.write(`CONNECT localhost:${upstreamPort} HTTP/1.1\r\nHost: localhost:${upstreamPort}\r\n\r\n`)
    })
    let handshakeBuf = ''
    const onData = (d: Buffer): void => {
      handshakeBuf += d.toString('latin1')
      if (handshakeBuf.includes('\r\n\r\n')) {
        raw.removeListener('data', onData)
        if (!/^HTTP\/1\.1 200/.test(handshakeBuf)) { raw.destroy(); return reject(new Error('CONNECT 未 200: ' + handshakeBuf.split('\r\n')[0])) }
        const tlsSock = tls.connect(
          { socket: raw, servername: 'localhost', ca: [caPem], rejectUnauthorized: opts.rejectUnauthorized ?? true },
          () => {
            const authorized = tlsSock.authorized
            const body = opts.body ?? ''
            const req = http.request(
              { createConnection: () => tlsSock as unknown as net.Socket, method: opts.method, path: opts.path, headers: { Host: 'localhost', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
              (res) => {
                let b = ''
                res.setEncoding('utf8')
                res.on('data', (c) => { b += c })
                res.on('end', () => { tlsSock.destroy(); resolve({ status: res.statusCode ?? 0, body: b, authorized }) })
              },
            )
            req.on('error', reject)
            if (body) req.write(body)
            req.end()
          },
        )
        tlsSock.on('error', reject)
      }
    }
    raw.on('data', onData)
    raw.on('error', reject)
  })
}

describe('forward proxy —— 真 TLS MITM 终结（#34b：接本地 CA 升级盲隧道为解密录制）', () => {
  it.skipIf(!supported)('capture ON + ca：CONNECT → TLS 终结 → 解密请求真录 trace_store + 上游真收到 + 客户端握手 authorized', async () => {
    const dir = await tempTapDir(); dirs.push(dir)
    const store = createTraceStore({ dir })
    const ca = createCa()
    const upstream = await startHttpsUpstream(ca)
    setCaptureEnabled(true, { dir })
    const authority = CertificateAuthority.fromCa(ca)
    const proxy = await serveForward({ port: 0, store, client: 'gemini', ca: authority })
    handles.push(proxy)

    const reqBody = JSON.stringify({ model: 'gemini-pro', input: 'decrypt me' })
    const res = await mitmRequest(proxy.port, upstream.port, ca.certPem, { method: 'POST', path: '/v1/messages', body: reqBody })

    // 客户端信任本地 CA → 握手通过（证明 proxy 用本地签发证书真终结了 TLS）
    expect(res.authorized).toBe(true)
    expect(res.status).toBe(200)
    expect(JSON.parse(res.body).ok).toBe(true)
    // 上游真收到解密后的请求
    expect(upstream.requests.length).toBe(1)
    expect(upstream.requests[0]!.path).toBe('/v1/messages')
    expect(JSON.parse(upstream.requests[0]!.body).input).toBe('decrypt me')
    // 解密后的请求真落 trace_store（MITM 录制成功）
    const recorded = store.listSessions().map((s) => store.readRecords(s.id)).flat()
    expect(recorded.length).toBe(1)
    expect((recorded[0]!.request as { path: string }).path).toBe('/v1/messages')
    expect((recorded[0]!.request as { body: { input: string } }).body.input).toBe('decrypt me')
    expect(recorded[0]!.transport).toBe('forward-tls')
  })

  it.skipIf(!supported)('安全护栏：capture OFF + ca → 退回盲隧道（不解密不录；上游经透传仍收到）', async () => {
    const dir = await tempTapDir(); dirs.push(dir)
    const store = createTraceStore({ dir })
    const ca = createCa()
    const upstream = await startHttpsUpstream(ca)
    resetCaptureCache() // capture 默认 OFF
    const authority = CertificateAuthority.fromCa(ca)
    const proxy = await serveForward({ port: 0, store, client: 'gemini', ca: authority })
    handles.push(proxy)

    // capture OFF → proxy 盲隧道透传，未终结 TLS：客户端直连的是真上游证书（本 CA 签的 localhost），
    // 但 proxy 没有 MITM，因此 trace_store 必为空。用 rejectUnauthorized:false 容忍上游证书细节。
    const res = await mitmRequest(proxy.port, upstream.port, ca.certPem, { method: 'POST', path: '/v1/messages', body: '{"x":1}', rejectUnauthorized: false })
    expect(res.status).toBe(200)
    expect(upstream.requests.length).toBe(1) // 透传：上游仍收到
    const recorded = store.listSessions().map((s) => store.readRecords(s.id)).flat()
    expect(recorded.length).toBe(0) // 默认 OFF：绝不解密录制
  })
})

describe('createTlsMitm —— T-c 焦点：终结机件直连单元（新接缝合同，零 mock TLS 握手）', () => {
  it.skipIf(!supported)('terminate → 本地 CA 真终结 TLS → UpstreamPlan 五字段正确交给注入管路；close() 未终结实例安全 no-op', async () => {
    const dir = await tempTapDir(); dirs.push(dir)
    const store = createTraceStore({ dir })
    const ca = createCa()
    const authority = CertificateAuthority.fromCa(ca)
    const sessionId = store.createSession({ client: 'unit', proxyMode: 'forward' })
    const seen: { plan: UpstreamPlan; body: string }[] = []
    const deps = {
      ca: authority, store, sessionId, counter: new TurnCounter(),
      tunnels: new Set<net.Socket>(), connectTimeoutMs: 30_000,
      // 注入管路 stub：记录 plan 合同并直接应答（不出网），聚焦终结机件本身。
      forwardAndRecord: (_req: http.IncomingMessage, res2: http.ServerResponse, body: Buffer, plan: UpstreamPlan): void => {
        seen.push({ plan, body: body.toString('utf8') })
        const payload = Buffer.from(JSON.stringify({ unit: true }), 'utf8')
        res2.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': payload.length })
        res2.end(payload)
      },
    }
    // close() 合同：从未 terminate（mitm server 未惰性创建）→ no-op 不抛。
    expect(() => createTlsMitm(deps).close()).not.toThrow()

    const tlsMitm = createTlsMitm(deps)
    // 裸 TCP 门：每个连接直接交 terminate——模拟 serveForward 已过 ca&&capture 双护栏后的 CONNECT 分派。
    const gate = net.createServer((sock) => tlsMitm.terminate(sock, Buffer.alloc(0), 'localhost', 8443))
    await new Promise<void>((r) => gate.listen(0, '127.0.0.1', r))
    const gatePort = (gate.address() as AddressInfo).port
    try {
      const res = await new Promise<{ status: number; body: string; authorized: boolean }>((resolve, reject) => {
        const raw = net.connect(gatePort, '127.0.0.1')
        let banner = ''
        const onData = (d: Buffer): void => {
          banner += d.toString('latin1')
          if (banner.includes('\r\n\r\n')) {
            raw.removeListener('data', onData)
            if (!/^HTTP\/1\.1 200/.test(banner)) { raw.destroy(); return reject(new Error('terminate 未回 200 banner: ' + banner.split('\r\n')[0])) }
            const tlsSock = tls.connect({ socket: raw, servername: 'localhost', ca: [ca.certPem], rejectUnauthorized: true }, () => {
              const body = '{"probe":"unit"}'
              const rq = http.request(
                { createConnection: () => tlsSock as unknown as net.Socket, method: 'POST', path: '/unit', headers: { Host: 'localhost', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
                (rs) => {
                  let b = ''
                  rs.setEncoding('utf8')
                  rs.on('data', (c) => { b += c })
                  rs.on('end', () => { const authorized = tlsSock.authorized; tlsSock.destroy(); resolve({ status: rs.statusCode ?? 0, body: b, authorized }) })
                },
              )
              rq.on('error', reject)
              rq.write(body)
              rq.end()
            })
            tlsSock.on('error', reject)
          }
        }
        raw.on('data', onData)
        raw.on('error', reject)
      })
      // client 信任本地 CA → 握手 authorized（终结机件真用逐 host 签发证书终结了 TLS）
      expect(res.authorized).toBe(true)
      expect(res.status).toBe(200)
      expect(JSON.parse(res.body).unit).toBe(true)
      // 注入管路收到解密明文与 UpstreamPlan 合同（T-a 五参差异面）
      expect(seen.length).toBe(1)
      expect(seen[0]!.body).toBe('{"probe":"unit"}')
      const plan = seen[0]!.plan
      expect(plan.transport).toBe('forward-tls')
      expect(plan.host).toBe('localhost') // 裸 hostname（无端口）——MITM 路径历史行为保持
      expect(plan.path).toBe('/unit')
      expect(plan.upstreamBaseUrl).toBe('https://localhost')
      expect(typeof plan.makeReq).toBe('function')
    } finally {
      tlsMitm.close()
      await new Promise<void>((r) => gate.close(() => r()))
    }
  })
})
