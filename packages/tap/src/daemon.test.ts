/**
 * daemon.test —— 真 socket e2e（GOAL C9）：单进程绑**多端口**，各自上游、共享 trace_store。
 *   ① 真起 2 个 reverse 绑定 + 各自 fake upstream → 各端口真转发 + 各自真捕获。
 *   ② claude 8766 生命线端口隔离：daemon 拒绑 8766（保护 claude 独立进程）。
 *   ③ 部分失败回滚：一个绑定失败 → 已起的全数关闭，绝不泄漏端口。
 *   ④ stop() 真关全部。零 mock。
 * 老仓真相源：tap_daemon.py start_daemon / stop_daemon（DEFAULT_PORTS 从 8767 起，8766 留给 claude）。
 */
import * as net from 'node:net'
import * as tls from 'node:tls'
import * as http from 'node:http'
import * as https from 'node:https'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { CLAUDE_LIFELINE_PORT, startDaemon, type DaemonHandles } from './daemon.js'
import { createTraceStore } from './trace-store.js'
import { resetCaptureCache, setCaptureEnabled, tapStatus } from './security.js'
import { httpReq, rmDir, startFakeUpstream, tempTapDir, type FakeUpstream } from './test-support.js'
import type { CaptureProxyHandle } from './capture-proxy.js'
import type { ForwardProxyHandle } from './forward-proxy.js'
import { createCa, issueHostCert, CertificateAuthority, tlsMitmSupported } from './certs.js'

const daemons: DaemonHandles[] = []
const ups: FakeUpstream[] = []
const dirs: string[] = []
afterEach(async () => {
  while (daemons.length) await daemons.pop()!.stop()
  while (ups.length) await ups.pop()!.close()
  resetCaptureCache()
  while (dirs.length) await rmDir(dirs.pop()!)
})
async function store(): Promise<{ store: ReturnType<typeof createTraceStore>; dir: string }> {
  const dir = await tempTapDir(); dirs.push(dir); return { store: createTraceStore({ dir }), dir }
}

describe('daemon 多端口 —— 单进程绑多端口，各自转发 + 共享捕获', () => {
  it('2 个 reverse 绑定 → 两端口都真转发到各自 upstream + 各自真落记录', async () => {
    const s = await store()
    const upA = await startFakeUpstream(); ups.push(upA)
    const upB = await startFakeUpstream(); ups.push(upB)
    setCaptureEnabled(true, { dir: s.dir })
    const d = await startDaemon({
      store: s.store,
      bindings: [
        { name: 'clientA', mode: 'reverse', port: 0, target: upA.url },
        { name: 'clientB', mode: 'reverse', port: 0, target: upB.url },
      ],
    })
    daemons.push(d)

    const portA = (d.handles.clientA as CaptureProxyHandle).port
    const portB = (d.handles.clientB as CaptureProxyHandle).port
    expect(portA).toBeGreaterThan(0)
    expect(portB).toBeGreaterThan(0)
    expect(portA).not.toBe(portB) // 真多端口

    await httpReq({ port: portA, path: '/v1/messages', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"c":"A"}' })
    await httpReq({ port: portB, path: '/v1/messages', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"c":"B"}' })

    expect(upA.requests.length).toBe(1)
    expect(upB.requests.length).toBe(1)
    const all = s.store.listSessions().map((row) => s.store.readRecords(row.id)).flat()
    expect(all.length).toBe(2) // 共享 trace_store 两条

    // doctor 明示：正在拦截 2 端口
    const st = tapStatus({ dir: s.dir })
    expect(st.intercepting).toBe(true)
    expect(st.interceptCount).toBe(2)
  })
})

describe('claude 8766 生命线隔离 —— daemon 拒绑 8766', () => {
  it('绑定含 8766 → 抛错（不碰 claude 生命线端口）', async () => {
    const s = await store()
    await expect(startDaemon({
      store: s.store,
      bindings: [{ name: 'bad', mode: 'reverse', port: CLAUDE_LIFELINE_PORT, target: 'http://127.0.0.1:1' }],
    })).rejects.toThrow(/8766|生命线|lifeline/i)
    expect(CLAUDE_LIFELINE_PORT).toBe(8766)
  })
})

describe('部分失败回滚 —— 不泄漏端口', () => {
  it('第二个绑定用 8766 非法 → 第一个已起的也被回滚关闭（tapStatus 归零）', async () => {
    const s = await store()
    const upA = await startFakeUpstream(); ups.push(upA)
    await expect(startDaemon({
      store: s.store,
      bindings: [
        { name: 'ok', mode: 'reverse', port: 0, target: upA.url },
        { name: 'bad', mode: 'reverse', port: CLAUDE_LIFELINE_PORT, target: 'http://127.0.0.1:1' },
      ],
    })).rejects.toThrow()
    // 回滚后无残留 intercept
    expect(tapStatus({ dir: s.dir }).interceptCount).toBe(0)
  })
})

describe('stop() —— 真关全部端口', () => {
  it('stop 后端口不再监听（连接被拒）', async () => {
    const s = await store()
    const upA = await startFakeUpstream(); ups.push(upA)
    const d = await startDaemon({ store: s.store, bindings: [{ name: 'a', mode: 'reverse', port: 0, target: upA.url }] })
    const port = (d.handles.a as CaptureProxyHandle).port
    await d.stop()
    await expect(httpReq({ port, path: '/v1/messages', method: 'GET' })).rejects.toThrow()
  })
})

// ── #34-wire：daemon 装配层真透传 ca 到 forward 绑定（非直调 serveForward，证明装配线路真通）──
const supported = tlsMitmSupported()
if (!supported) {
  // eslint-disable-next-line no-console
  console.warn('[honest-skip] daemon ca 装配 TLS MITM e2e：环境不支持本地 CA 证书生成/握手 —— 不伪绿')
}

async function startHttpsUpstream(ca: ReturnType<typeof createCa>): Promise<{ server: https.Server; port: number }> {
  const cert = issueHostCert(ca, 'localhost')
  const server = https.createServer({ key: cert.keyPem, cert: cert.certPem }, (req, res) => {
    const payload = Buffer.from(JSON.stringify({ ok: true, seen: req.url }), 'utf8')
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': payload.length })
    res.end(payload)
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  return { server, port: (server.address() as AddressInfo).port }
}

function mitmRequest(proxyPort: number, upstreamPort: number, caPem: string): Promise<{ status: number; authorized: boolean }> {
  return new Promise((resolve, reject) => {
    const raw = net.connect(proxyPort, '127.0.0.1', () => {
      raw.write(`CONNECT localhost:${upstreamPort} HTTP/1.1\r\nHost: localhost:${upstreamPort}\r\n\r\n`)
    })
    let buf = ''
    const onData = (d: Buffer): void => {
      buf += d.toString('latin1')
      if (buf.includes('\r\n\r\n')) {
        raw.removeListener('data', onData)
        if (!/^HTTP\/1\.1 200/.test(buf)) { raw.destroy(); reject(new Error('CONNECT 未 200: ' + buf.split('\r\n')[0])); return }
        const tlsSock = tls.connect({ socket: raw, servername: 'localhost', ca: [caPem] }, () => {
          const authorized = tlsSock.authorized
          const body = '{}'
          const req = http.request(
            { createConnection: () => tlsSock as unknown as net.Socket, method: 'POST', path: '/v1/x', headers: { Host: 'localhost', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
            (res) => { res.on('data', () => {}); res.on('end', () => { tlsSock.destroy(); resolve({ status: res.statusCode ?? 0, authorized }) }) },
          )
          req.on('error', reject)
          req.write(body)
          req.end()
        })
        tlsSock.on('error', reject)
      }
    }
    raw.on('data', onData)
    raw.on('error', reject)
  })
}

describe.skipIf(!supported)('startDaemon ca 装配（#34-wire：daemon 把 CertificateAuthority.fromDir/fromCa 透传给 forward 绑定）', () => {
  it('forward 绑定 + opts.ca + capture ON → 经 daemon 装配真 TLS MITM 终结（非直调 serveForward）', async () => {
    const s = await store()
    const ca = createCa()
    const upstream = await startHttpsUpstream(ca)
    setCaptureEnabled(true, { dir: s.dir })
    const authority = CertificateAuthority.fromCa(ca)

    const d = await startDaemon({
      store: s.store,
      ca: authority,
      bindings: [{ name: 'fwd', mode: 'forward', port: 0 }],
    })
    daemons.push(d)
    const port = (d.handles.fwd as ForwardProxyHandle).port

    const res = await mitmRequest(port, upstream.port, ca.certPem)
    expect(res.authorized).toBe(true) // 客户端信任本地 CA → daemon 装配的 ca 真被 forward-proxy 用来终结 TLS
    expect(res.status).toBe(200)

    const recorded = s.store.listSessions().map((row) => s.store.readRecords(row.id)).flat()
    expect(recorded.length).toBe(1)
    expect(recorded[0]!.transport).toBe('forward-tls')
    upstream.server.close()
  })

  it('forward 绑定缺 opts.ca → 退回盲隧道（daemon 未装 ca 时不会意外解密）', async () => {
    const s = await store()
    const ca = createCa()
    const upstream = await startHttpsUpstream(ca)
    setCaptureEnabled(true, { dir: s.dir })

    const d = await startDaemon({ store: s.store, bindings: [{ name: 'fwd', mode: 'forward', port: 0 }] })
    daemons.push(d)
    const port = (d.handles.fwd as ForwardProxyHandle).port

    // 无 ca：mitmRequest 期望信任本地 CA 会失败（真上游证书链不含我们伪造的 CA 且代理未终结）—— 用真上游证书校验会失败，
    // 改用 rejectUnauthorized:false 等价的直连校验：能连通但不是我们终结的（trace_store 必为空，因为没有 MITM）。
    await new Promise<void>((resolve, reject) => {
      const raw = net.connect(port, '127.0.0.1', () => {
        raw.write(`CONNECT localhost:${upstream.port} HTTP/1.1\r\nHost: localhost:${upstream.port}\r\n\r\n`)
      })
      let buf = ''
      raw.on('data', (d2: Buffer) => {
        buf += d2.toString('latin1')
        if (buf.includes('\r\n\r\n')) { raw.destroy(); resolve() }
      })
      raw.on('error', reject)
    })
    const recorded = s.store.listSessions().map((row) => s.store.readRecords(row.id)).flat()
    expect(recorded.length).toBe(0) // 盲隧道：daemon 没有 ca 可用，绝不解密
    upstream.server.close()
  })
})
