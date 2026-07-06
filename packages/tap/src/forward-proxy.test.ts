/**
 * forward-proxy.test —— 真 socket e2e（GOAL C9）：
 *   ① 明文 http 绝对 URI 代理：POST http://upstream/v1/messages 真过 forward proxy
 *      → upstream 真收到 + 响应真回 + trace_store 真落一条（capture on）。
 *   ② CONNECT 盲隧道：透明转发到真 TCP 上游（TLS MITM 终结属 #34b certs，本批盲隧道透传）。
 *   ③ 默认 OFF 时不落记录。零 mock，全真 socket。
 * 老仓真相源：forward_proxy.py serve_forward / _handle_connect / _forward_and_record。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { serveForward, type ForwardProxyHandle } from './forward-proxy.js'
import { createTraceStore } from './trace-store.js'
import { resetCaptureCache, setCaptureEnabled } from './security.js'
import { connectThroughProxy, forwardHttpReq, rmDir, startFakeUpstream, startTcpEcho, tempTapDir, type FakeUpstream, type TcpEcho } from './test-support.js'

const handles: ForwardProxyHandle[] = []
const ups: FakeUpstream[] = []
const echoes: TcpEcho[] = []
const dirs: string[] = []
afterEach(async () => {
  while (handles.length) await handles.pop()!.close()
  while (ups.length) await ups.pop()!.close()
  while (echoes.length) await echoes.pop()!.close()
  resetCaptureCache()
  while (dirs.length) await rmDir(dirs.pop()!)
})
async function store(): Promise<{ store: ReturnType<typeof createTraceStore>; dir: string }> {
  const dir = await tempTapDir(); dirs.push(dir); return { store: createTraceStore({ dir }), dir }
}

describe('forward proxy —— 明文绝对 URI 转发 + 捕获', () => {
  it('capture ON：POST http://upstream/v1/messages 真过 forward proxy → upstream 真收到 + 响应真回 + 真落一条', async () => {
    const s = await store()
    const upstream = await startFakeUpstream()
    ups.push(upstream)
    setCaptureEnabled(true, { dir: s.dir })
    const proxy = await serveForward({ port: 0, store: s.store, client: 'forward' })
    handles.push(proxy)

    const res = await forwardHttpReq(proxy.port, { host: '127.0.0.1', port: upstream.port, path: '/v1/messages' }, { method: 'POST', body: JSON.stringify({ model: 'gemini' }), headers: { 'Content-Type': 'application/json' } })
    expect(res.status).toBe(200)
    expect(res.json<{ ok: boolean }>().ok).toBe(true)
    expect(upstream.requests.length).toBe(1)
    expect(upstream.requests[0]!.url).toBe('/v1/messages')
    const recorded = s.store.listSessions().map((row) => s.store.readRecords(row.id)).flat()
    expect(recorded.length).toBe(1)
    expect((recorded[0]!.request as any).path).toBe('/v1/messages')
  })

  it('默认 OFF：真转发但零捕获', async () => {
    const s = await store()
    const upstream = await startFakeUpstream()
    ups.push(upstream)
    resetCaptureCache()
    const proxy = await serveForward({ port: 0, store: s.store })
    handles.push(proxy)
    const res = await forwardHttpReq(proxy.port, { host: '127.0.0.1', port: upstream.port, path: '/v1/messages' }, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } })
    expect(res.status).toBe(200)
    expect(upstream.requests.length).toBe(1)
    const recorded = s.store.listSessions().map((row) => s.store.readRecords(row.id)).flat()
    expect(recorded.length).toBe(0)
  })
})

describe('forward proxy —— CONNECT 盲隧道透明转发（TLS MITM 属 #34b）', () => {
  it('CONNECT 到真 TCP 上游 → 隧道建立，字节双向透明转发（echo 原样返回）', async () => {
    const s = await store()
    const echo = await startTcpEcho()
    echoes.push(echo)
    const proxy = await serveForward({ port: 0, store: s.store })
    handles.push(proxy)

    const sock = await connectThroughProxy(proxy.port, `127.0.0.1:${echo.port}`)
    const got = await new Promise<string>((resolve, reject) => {
      let buf = ''
      sock.on('data', (d) => { buf += d.toString('utf8'); if (buf.includes('PING')) resolve(buf) })
      sock.on('error', reject)
      sock.write('PING-THROUGH-TUNNEL')
      setTimeout(() => reject(new Error('隧道回显超时')), 2000)
    })
    expect(got).toContain('PING-THROUGH-TUNNEL')
    expect(echo.connections).toBe(1) // 上游真被连上
    sock.destroy()
  })
})
