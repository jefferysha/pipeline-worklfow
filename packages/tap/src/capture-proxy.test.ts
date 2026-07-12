/**
 * capture-proxy.test —— 真 socket e2e（GOAL C9 硬约束）：
 *   真起 fake upstream（listen 0）+ 真起 capture proxy（listen 0）+ 真 http 请求过 proxy
 *   → 断言 ① 真转发到 upstream（upstream 真收到）② 响应真回来 ③ trace_store 真落盘捕获记录。
 *   默认 OFF 时真不落记录（透明转发照旧）。零 mock，全真 socket。
 * 老仓真相源：capture_proxy.py serve / make_handler / _proxy。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { connect as netConnect } from 'node:net'
import { serve, type CaptureProxyHandle } from './capture-proxy.js'
import { createTraceStore } from './trace-store.js'
import { resetCaptureCache, setCaptureEnabled } from './security.js'
import { httpReq, rmDir, sleep, startFakeUpstream, startFakeSseUpstream, tempTapDir, type FakeUpstream } from './test-support.js'

const handles: CaptureProxyHandle[] = []
const ups: FakeUpstream[] = []
const dirs: string[] = []
afterEach(async () => {
  while (handles.length) await handles.pop()!.close()
  while (ups.length) await ups.pop()!.close()
  resetCaptureCache()
  while (dirs.length) await rmDir(dirs.pop()!)
})
async function store(): Promise<{ store: ReturnType<typeof createTraceStore>; dir: string }> {
  const dir = await tempTapDir(); dirs.push(dir); return { store: createTraceStore({ dir }), dir }
}

describe('reverse capture proxy —— 真转发 + 真捕获', () => {
  it('capture ENABLED：POST /v1/messages 真过 proxy → upstream 真收到 + 响应真回 + trace_store 真落一条', async () => {
    const s = await store()
    const upstream = await startFakeUpstream()
    ups.push(upstream)
    setCaptureEnabled(true, { dir: s.dir })
    const proxy = await serve({ port: 0, target: upstream.url, store: s.store, client: 'claude' })
    handles.push(proxy)

    const res = await httpReq({ port: proxy.port, path: '/v1/messages', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'claude', messages: [] }) })

    // ② 响应真回来
    expect(res.status).toBe(200)
    expect(res.json<{ ok: boolean }>().ok).toBe(true)
    // ① upstream 真收到转发
    expect(upstream.requests.length).toBe(1)
    expect(upstream.requests[0]!.url).toBe('/v1/messages')
    expect(upstream.requests[0]!.method).toBe('POST')
    expect(JSON.parse(upstream.requests[0]!.body).model).toBe('claude')
    // ③ trace_store 真落盘一条捕获记录
    const sessions = s.store.listSessions()
    const recorded = sessions.map((row) => s.store.readRecords(row.id)).flat()
    expect(recorded.length).toBe(1)
    expect((recorded[0]!.request as any).path).toBe('/v1/messages')
    expect((recorded[0]!.response as any).status).toBe(200)
  })

  it('默认 OFF：不 setCaptureEnabled → 仍真转发，但 trace_store 零记录（不启动不抓）', async () => {
    const s = await store()
    const upstream = await startFakeUpstream()
    ups.push(upstream)
    resetCaptureCache() // 缺 flag = OFF
    const proxy = await serve({ port: 0, target: upstream.url, store: s.store, client: 'claude' })
    handles.push(proxy)

    const res = await httpReq({ port: proxy.port, path: '/v1/messages', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"x":1}' })
    // 透明转发照旧
    expect(res.status).toBe(200)
    expect(upstream.requests.length).toBe(1)
    // 但零捕获
    const recorded = s.store.listSessions().map((row) => s.store.readRecords(row.id)).flat()
    expect(recorded.length).toBe(0)
  })

  it('非录制路径（GET /v1/models）：透明转发但不落记录', async () => {
    const s = await store()
    const upstream = await startFakeUpstream()
    ups.push(upstream)
    setCaptureEnabled(true, { dir: s.dir })
    const proxy = await serve({ port: 0, target: upstream.url, store: s.store })
    handles.push(proxy)
    const res = await httpReq({ port: proxy.port, path: '/v1/models', method: 'GET' })
    expect(res.status).toBe(200)
    expect(upstream.requests.length).toBe(1) // 真转发
    const recorded = s.store.listSessions().map((row) => s.store.readRecords(row.id)).flat()
    expect(recorded.length).toBe(0) // 非录制路径不落
  })

  it('upstream 不可达 → 502 + 录 error（capture on）', async () => {
    const s = await store()
    setCaptureEnabled(true, { dir: s.dir })
    // 指向一个立刻拒连的端口（无 server）
    const dead = await startFakeUpstream(); const deadUrl = dead.url; await dead.close()
    const proxy = await serve({ port: 0, target: deadUrl, store: s.store })
    handles.push(proxy)
    const res = await httpReq({ port: proxy.port, path: '/v1/messages', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    expect(res.status).toBe(502)
    const recorded = s.store.listSessions().map((row) => s.store.readRecords(row.id)).flat()
    expect(recorded.length).toBe(1)
    expect((recorded[0]!.response as any).status).toBe(502)
  })

  it('SSE 上游：真流式透传 + 捕获（body 收集流文本）', async () => {
    const s = await store()
    const sse = await startFakeSseUpstream(['data: {"type":"a"}\n\n', 'data: {"type":"b"}\n\n'])
    ups.push(sse)
    setCaptureEnabled(true, { dir: s.dir })
    const proxy = await serve({ port: 0, target: sse.url, store: s.store })
    handles.push(proxy)
    const res = await httpReq({ port: proxy.port, path: '/v1/messages', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    expect(res.status).toBe(200)
    expect(res.body).toContain('"type":"a"')
    expect(res.body).toContain('"type":"b"')
    const recorded = s.store.listSessions().map((row) => s.store.readRecords(row.id)).flat()
    expect(recorded.length).toBe(1)
    expect(String((recorded[0]!.response as any).body)).toContain('type')
  })

  it('claude 会话路由：X-Claude-Code-Session-Id 头把记录归到真实会话 id', async () => {
    const s = await store()
    const upstream = await startFakeUpstream()
    ups.push(upstream)
    setCaptureEnabled(true, { dir: s.dir })
    const proxy = await serve({ port: 0, target: upstream.url, store: s.store })
    handles.push(proxy)
    const realSid = 'abcdef12-3456-7890-abcd-ef1234567890'
    await httpReq({ port: proxy.port, path: '/v1/messages', method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Claude-Code-Session-Id': realSid }, body: '{}' })
    const row = s.store.loadSessionRow(realSid)
    expect(row).not.toBeNull()
    expect(s.store.readRecords(realSid).length).toBe(1)
  })
})

describe('reverse capture proxy —— B7：strip-prefix 段边界（不误剥 /v1internal）', () => {
  it('stripPrefix=/v1：完整段 /v1/x → 剥成 /x；但 /v1internal/x 非同段 → 原样不误剥（不丢前导斜杠）', async () => {
    const s = await store()
    const upstream = await startFakeUpstream()
    ups.push(upstream)
    const proxy = await serve({ port: 0, target: upstream.url, store: s.store, stripPrefix: '/v1' })
    handles.push(proxy)
    // 完整段：/v1/models → 上游收到 /models
    await httpReq({ port: proxy.port, path: '/v1/models', method: 'GET' })
    expect(upstream.requests.at(-1)!.url).toBe('/models')
    // 非同段：/v1internal/foo 不该被裸 startsWith 剥成 internal/foo（丢前导斜杠）；应原样保留
    await httpReq({ port: proxy.port, path: '/v1internal/foo', method: 'GET' })
    expect(upstream.requests.at(-1)!.url).toBe('/v1internal/foo')
  })
})

describe('reverse capture proxy —— B10：同 session 并发请求 turn 原子自增不撞号', () => {
  it('两并发录制请求（同 session id + 慢上游）→ 两条记录 turn 互异（非都 =1）', async () => {
    const s = await store()
    // 慢上游：保证两请求的 handler 都在任一 appendRecord 之前跑完（复现读-写竞态窗口）
    const upstream = await startFakeUpstream({
      respond: (_req, res) => setTimeout(() => {
        const p = Buffer.from(JSON.stringify({ ok: true }), 'utf8')
        res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': p.length }); res.end(p)
      }, 80),
    })
    ups.push(upstream)
    setCaptureEnabled(true, { dir: s.dir })
    const proxy = await serve({ port: 0, target: upstream.url, store: s.store })
    handles.push(proxy)
    const sid = 'abcdef12-3456-7890-abcd-ef1234567890'
    const hdr = { 'Content-Type': 'application/json', 'X-Claude-Code-Session-Id': sid }
    const [r1, r2] = await Promise.all([
      httpReq({ port: proxy.port, path: '/v1/messages', method: 'POST', headers: hdr, body: '{"n":1}' }),
      httpReq({ port: proxy.port, path: '/v1/messages', method: 'POST', headers: hdr, body: '{"n":2}' }),
    ])
    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)
    const records = s.store.readRecords(sid)
    expect(records.length).toBe(2)
    const turns = records.map((r) => r.turn as number).sort((a, b) => a - b)
    expect(turns).toEqual([1, 2]) // 老码两条都读到 recordCount=0 → 都 turn=1（撞号）
  })
})

describe('reverse capture proxy —— B2：client 中断不崩 daemon', () => {
  it('SSE 流式中 client 中途 abort → 对已断 res 反复回写不抛未捕获异常，daemon 存活', async () => {
    const s = await store()
    const sse = await startFakeSseUpstream(Array.from({ length: 14 }, (_, i) => `data: {"i":${i}}\n\n`))
    ups.push(sse)
    setCaptureEnabled(true, { dir: s.dir })
    const proxy = await serve({ port: 0, target: sse.url, store: s.store })
    handles.push(proxy)

    // 挂 uncaughtException 监听：既捕获 bug 抛出的未捕获异常（断言其不发生），又阻止 node 真崩进程。
    const uncaught: unknown[] = []
    const onErr = (e: unknown): void => { uncaught.push(e) }
    process.on('uncaughtException', onErr)
    try {
      await new Promise<void>((resolve) => {
        const sock = netConnect(proxy.port, '127.0.0.1', () => {
          sock.write('POST /v1/messages HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{}')
          sock.once('data', () => setTimeout(() => { try { sock.destroy() } catch { /* ignore */ } ; resolve() }, 5)) // 收首块即断
          setTimeout(() => { try { sock.destroy() } catch { /* ignore */ } ; resolve() }, 300) // 兜底
        })
        sock.on('error', () => resolve())
      })
      await sleep(250) // 等 SSE 剩余块推完：proxy 对已销毁 res 反复 write/end
      expect(uncaught).toEqual([]) // 无未捕获异常
      const res = await httpReq({ port: proxy.port, path: '/v1/messages', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      expect(res.status).toBe(200) // daemon 仍活，后续请求照常
    } finally {
      process.off('uncaughtException', onErr)
    }
  })
})
