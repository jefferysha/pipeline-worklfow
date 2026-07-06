/**
 * capture-proxy.test —— 真 socket e2e（GOAL C9 硬约束）：
 *   真起 fake upstream（listen 0）+ 真起 capture proxy（listen 0）+ 真 http 请求过 proxy
 *   → 断言 ① 真转发到 upstream（upstream 真收到）② 响应真回来 ③ trace_store 真落盘捕获记录。
 *   默认 OFF 时真不落记录（透明转发照旧）。零 mock，全真 socket。
 * 老仓真相源：capture_proxy.py serve / make_handler / _proxy。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { serve, type CaptureProxyHandle } from './capture-proxy.js'
import { createTraceStore } from './trace-store.js'
import { resetCaptureCache, setCaptureEnabled } from './security.js'
import { httpReq, rmDir, startFakeUpstream, startFakeSseUpstream, tempTapDir, type FakeUpstream } from './test-support.js'

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
