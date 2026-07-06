/**
 * traces.test —— #34d traffic 查看器数据端真 HTTP 端到端（GOAL C9 / A7）。
 * 真起 http server + 真建 @pipeline-lite/tap 的 TraceStore（真落盘 sessions/*.json + records/*.jsonl）
 * → 真 node:http GET /api/traces/sessions、/api/traces/records?session=<id> → 断言真捕获数据。零 mock。
 *
 * #34e 护栏延续：traces 只读本地捕获、GET-only、不外发（server 绑 127.0.0.1，响应带 outbound=local-only）。
 * 本测试真用 tap 的 TraceStore（源零 outbound，见 tap/security.test），server 只投影本地结果。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDashboardServer } from './server.js'
import type { DashboardServer } from './types.js'
import { makeProject, newStore, initChange, reqGet, reqPost, testFlow } from './test-support.js'
// tap 是 workspace 包（root node_modules 符号链接）——测试文件不入 tsc build，可直接 import 真 API。
import { createTraceStore } from '@pipeline-lite/tap'

const openServers: DashboardServer[] = []
afterEach(async () => {
  while (openServers.length) await openServers.pop()!.close()
})

/** 真建一个 tap TraceStore（临时目录），落两条真 session + 记录。返回 store + 会话 id。 */
async function seedTraceStore(): Promise<{ dir: string; store: ReturnType<typeof createTraceStore>; s1: string; s2: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'pl-traces-'))
  const store = createTraceStore({ dir })
  const s1 = store.createSession({ client: 'claude', proxyMode: 'reverse', startedAt: new Date('2026-07-07T00:00:00Z') })
  store.appendRecord(s1, { timestamp: '2026-07-07T00:00:01Z', request_id: 'req-1', turn: 1, request: { path: '/v1/messages' }, response: { status: 200 } })
  store.appendRecord(s1, { timestamp: '2026-07-07T00:00:02Z', request_id: 'req-2', turn: 2, request: { path: '/v1/messages' }, response: { status: 200 } })
  store.finalizeSession(s1, { api_calls: 2 })
  const s2 = store.createSession({ client: 'codex', proxyMode: 'forward', startedAt: new Date('2026-07-07T01:00:00Z') })
  store.appendRecord(s2, { timestamp: '2026-07-07T01:00:01Z', request_id: 'req-3', turn: 1 })
  return { dir, store, s1, s2 }
}

async function startServer(traceStore?: ReturnType<typeof createTraceStore>): Promise<{ srv: DashboardServer; port: number; root: string }> {
  const store = newStore()
  const root = await makeProject()
  await initChange(store, root, 'demo')
  const srv = createDashboardServer({
    version: '9.9.9', token: 't', registry: () => [root], store, flow: testFlow(),
    clock: () => '2026-07-07T00:00:00Z', traceStore,
  })
  openServers.push(srv)
  const { port } = await srv.listen(0, '127.0.0.1')
  return { srv, port, root }
}

describe('#34d capabilities.traffic —— 注入 traceStore 才报 true（未装则占位）', () => {
  it('注入 traceStore → capabilities.traffic = true', async () => {
    const seeded = await seedTraceStore()
    const { port } = await startServer(seeded.store)
    const s = (await reqGet(port, '/api/snapshot')).json<any>()
    expect(s.capabilities.traffic).toBe(true)
  })

  it('未注入 traceStore → capabilities.traffic = false（不谎报），端点 404', async () => {
    const { port } = await startServer(undefined)
    const s = (await reqGet(port, '/api/snapshot')).json<any>()
    expect(s.capabilities.traffic).toBe(false)
    const r = await reqGet(port, '/api/traces/sessions')
    expect(r.status).toBe(404)
  })
})

describe('GET /api/traces/sessions —— TraceStore.listSessions 真投影', () => {
  it('返回真落盘的两条 session（含 client/record_count/status）', async () => {
    const seeded = await seedTraceStore()
    const { port } = await startServer(seeded.store)
    const r = await reqGet(port, '/api/traces/sessions')
    expect(r.status).toBe(200)
    const body = r.json<any>()
    expect(body.outbound).toBe('local-only')
    expect(body.count).toBe(2)
    const byId = new Map(body.sessions.map((s: any) => [s.id, s]))
    expect(byId.get(seeded.s1).client).toBe('claude')
    expect(byId.get(seeded.s1).record_count).toBe(2)
    expect(byId.get(seeded.s1).status).toBe('complete')
    expect(byId.get(seeded.s2).client).toBe('codex')
  })
})

describe('GET /api/traces/records?session=<id> —— TraceStore.readRecords 真投影', () => {
  it('返回该 session 的两条真记录（保序 + 字段完好）', async () => {
    const seeded = await seedTraceStore()
    const { port } = await startServer(seeded.store)
    const r = await reqGet(port, `/api/traces/records?session=${encodeURIComponent(seeded.s1)}`)
    expect(r.status).toBe(200)
    const body = r.json<any>()
    expect(body.outbound).toBe('local-only')
    expect(body.session).toBe(seeded.s1)
    expect(body.count).toBe(2)
    expect(body.records.map((x: any) => x.request_id)).toEqual(['req-1', 'req-2'])
    expect(body.records[0].response.status).toBe(200)
  })

  it('缺 session 参数 → 400', async () => {
    const seeded = await seedTraceStore()
    const { port } = await startServer(seeded.store)
    const r = await reqGet(port, '/api/traces/records')
    expect(r.status).toBe(400)
  })

  it('未知 session → 200 空记录（readRecords 容错，不泄露它源）', async () => {
    const seeded = await seedTraceStore()
    const { port } = await startServer(seeded.store)
    const r = await reqGet(port, '/api/traces/records?session=does-not-exist')
    expect(r.status).toBe(200)
    expect(r.json<any>().count).toBe(0)
  })
})

describe('#34e 护栏 —— traces 只读、不外发', () => {
  it('traces 端点仅 GET；POST /api/traces/sessions 非写回路由（404/405 之类非 200）', async () => {
    const seeded = await seedTraceStore()
    const { port, root } = await startServer(seeded.store)
    const r = await reqPost(port, '/api/traces/sessions', { root }, {
      headers: { Authorization: 'Bearer t' },
    })
    expect(r.status).not.toBe(200)
  })
})
