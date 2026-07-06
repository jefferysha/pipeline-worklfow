/**
 * server.test —— 真 HTTP 端到端（GOAL C9）：真起 http server（listen(0) 随机端口）、
 * node:http 真发请求、断言真实响应与真实落盘副作用。零 mock。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { createDashboardServer } from './server.js'
import type { DashboardServer } from './types.js'
import {
  initChange, makeProject, newStore, openSSE, reqGet, reqPost, testFlow,
} from './test-support.js'
import type { StateStore } from '@pipeline-lite/kernel'

const openServers: DashboardServer[] = []
afterEach(async () => {
  while (openServers.length) await openServers.pop()!.close()
})

interface Harness {
  srv: DashboardServer
  port: number
  token: string
  root: string
  store: StateStore
  name: string
}

async function start(opts?: { version?: string; token?: string; pollIntervalMs?: number }): Promise<Harness> {
  const store = newStore()
  const root = await makeProject()
  const name = 'my-change'
  await initChange(store, root, name)
  const srv = createDashboardServer({
    version: opts?.version ?? '9.9.9',
    token: opts?.token ?? 'secret-token-abc',
    registry: () => [root],
    store,
    flow: testFlow(),
    clock: () => '2026-07-07T00:00:00Z',
    pollIntervalMs: opts?.pollIntervalMs ?? 20,
  })
  openServers.push(srv)
  const { port } = await srv.listen(0, '127.0.0.1')
  return { srv, port, token: srv.token, root, store, name }
}

describe('GET /api/health —— 存活探针 + 本 server 版本（B4）', () => {
  it('回显 ok/scope/version（version 取注入值，证明报的是本 server 版本非硬编码）', async () => {
    const h = await start({ version: '3.1.4' })
    const r = await reqGet(h.port, '/api/health')
    expect(r.status).toBe(200)
    const body = r.json<{ ok: boolean; scope: string; version: string }>()
    expect(body.ok).toBe(true)
    expect(body.scope).toBe('global')
    expect(body.version).toBe('3.1.4')
  })
})

describe('GET /api/snapshot —— 聚合注册 Project 的真 .pipeline.yaml', () => {
  it('含真 change（phase=open）+ 计数 + 能力声明', async () => {
    const h = await start()
    const r = await reqGet(h.port, '/api/snapshot')
    expect(r.status).toBe(200)
    const s = r.json<any>()
    expect(s.version).toBe('9.9.9')
    expect(s.project_count).toBe(1)
    expect(s.change_count).toBe(1)
    const proj = s.projects[0]
    expect(proj.root).toBe(h.root)
    expect(proj.changes[0].name).toBe('my-change')
    expect(proj.changes[0].phase).toBe('open')
    expect(proj.changes[0].track).toBe('backend')
    expect(s.capabilities.transition).toBe(true)
    expect(s.capabilities.stream).toBe(true)
  })

  it('聚合多个注册 Project（真两根、各自 change）', async () => {
    const store = newStore()
    const a = await makeProject()
    const b = await makeProject()
    await initChange(store, a, 'alpha')
    await initChange(store, b, 'beta')
    const srv = createDashboardServer({
      version: '9.9.9', token: 't', registry: () => [a, b], store, flow: testFlow(),
    })
    openServers.push(srv)
    const { port } = await srv.listen(0, '127.0.0.1')
    const s = (await reqGet(port, '/api/snapshot')).json<any>()
    expect(s.project_count).toBe(2)
    expect(s.change_count).toBe(2)
    const names = s.projects.flatMap((p: any) => p.changes.map((c: any) => c.name)).sort()
    expect(names).toEqual(['alpha', 'beta'])
  })
})

describe('GET 未知路由 → 404', () => {
  it('404 not found', async () => {
    const h = await start()
    const r = await reqGet(h.port, '/api/nope')
    expect(r.status).toBe(404)
  })
})

describe('GET / —— 前端落地页 + 同源 token 注入（B5 交付）', () => {
  it('200 text/html，内嵌本 server 的一次性 token（同源前端读取）', async () => {
    const h = await start({ token: 'inject-me-xyz' })
    const r = await reqGet(h.port, '/')
    expect(r.status).toBe(200)
    expect(String(r.headers['content-type'])).toContain('text/html')
    expect(r.body).toContain('inject-me-xyz')
  })
})

describe('GET / + /assets/* —— webRoot 存在时服务真 SPA（BACKLOG #26c）', () => {
  it('GET / 返回 SPA index.html 且注入 token；/assets/* 真供给静态资源', async () => {
    const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const web = await mkdtemp(join(tmpdir(), 'spa-'))
    await writeFile(join(web, 'index.html'), '<!doctype html><head><title>SPA</title></head><body><div id=app></div></body>', 'utf8')
    await mkdir(join(web, 'assets'), { recursive: true })
    await writeFile(join(web, 'assets', 'app.js'), 'console.log("real bundle")', 'utf8')
    const store = newStore()
    const root = await makeProject()
    await initChange(store, root, 'c1')
    const srv = createDashboardServer({
      token: 'spa-token', registry: () => [root], store, flow: testFlow(),
      clock: () => '2026-07-07T00:00:00Z', webRoot: web,
    })
    openServers.push(srv)
    const { port } = await srv.listen(0, '127.0.0.1')
    // GET / → 真 SPA index.html（含 <div id=app>）+ token 注入进 </head> 前
    const idx = await reqGet(port, '/')
    expect(idx.status).toBe(200)
    expect(idx.body).toContain('<div id=app>')
    expect(idx.body).toContain('window.__PIPELINE_DASHBOARD_TOKEN__')
    expect(idx.body).toContain('spa-token')
    // GET /assets/app.js → 真静态供给 + js content-type
    const asset = await reqGet(port, '/assets/app.js')
    expect(asset.status).toBe(200)
    expect(String(asset.headers['content-type'])).toContain('javascript')
    expect(asset.body).toContain('real bundle')
    // 路径穿越防护：/assets/../server.ts 不泄露
    const evil = await reqGet(port, '/assets/../package.json')
    expect(evil.status).not.toBe(200)
  })
})

describe('POST /api/change/<name>/transition —— B5 token 鉴权', () => {
  it('无 token → 401', async () => {
    const h = await start()
    const r = await reqPost(h.port, `/api/change/${h.name}/transition`, { root: h.root, event: 'open-complete' })
    expect(r.status).toBe(401)
  })

  it('错 token → 401', async () => {
    const h = await start()
    const r = await reqPost(h.port, `/api/change/${h.name}/transition`, { root: h.root, event: 'open-complete' }, {
      headers: { Authorization: 'Bearer wrong-token' },
    })
    expect(r.status).toBe(401)
  })

  it('对 token → 200 且真改盘 .pipeline.yaml（open → explore）', async () => {
    const h = await start()
    const before = await h.store.read(join(h.root, 'openspec', 'changes', h.name))
    expect(before.fields.phase).toBe('open')

    const r = await reqPost(h.port, `/api/change/${h.name}/transition`, { root: h.root, event: 'open-complete' }, {
      headers: { Authorization: `Bearer ${h.token}` },
    })
    expect(r.status).toBe(200)
    const body = r.json<{ ok: boolean; from: string; to: string }>()
    expect(body.ok).toBe(true)
    expect(body.from).toBe('open')
    expect(body.to).toBe('explore')

    // 真副作用：磁盘上的 .pipeline.yaml 已改
    const after = await h.store.read(join(h.root, 'openspec', 'changes', h.name))
    expect(after.fields.phase).toBe('explore')
  })

  it('X-Pipeline-Token header 亦被接受（对 token → 200）', async () => {
    const h = await start()
    const r = await reqPost(h.port, `/api/change/${h.name}/transition`, { root: h.root, event: 'open-complete' }, {
      headers: { 'X-Pipeline-Token': h.token },
    })
    expect(r.status).toBe(200)
  })
})

describe('POST 写端点纵深防线（老仓安全模型 parity）', () => {
  it('非本地 Host header → 403（DNS 重绑定守卫）', async () => {
    const h = await start()
    const r = await reqPost(h.port, `/api/change/${h.name}/transition`, { root: h.root, event: 'open-complete' }, {
      headers: { Host: 'evil.example:1234', Authorization: `Bearer ${h.token}` },
    })
    expect(r.status).toBe(403)
  })

  it('非 application/json → 400（同源策略防线）', async () => {
    const h = await start()
    const r = await reqPost(h.port, `/api/change/${h.name}/transition`, null, {
      rawBody: 'root=x&event=open-complete',
      headers: { 'Content-Type': 'text/plain', Authorization: `Bearer ${h.token}` },
    })
    expect(r.status).toBe(400)
  })

  it('root 不在注册表（不可信项目）→ 404', async () => {
    const h = await start()
    const r = await reqPost(h.port, `/api/change/${h.name}/transition`, { root: '/tmp/not-registered', event: 'open-complete' }, {
      headers: { Authorization: `Bearer ${h.token}` },
    })
    expect(r.status).toBe(404)
  })

  it('event 与当前 phase 不自洽（open 收 verify-pass）→ 409，零改盘', async () => {
    const h = await start()
    const r = await reqPost(h.port, `/api/change/${h.name}/transition`, { root: h.root, event: 'verify-pass' }, {
      headers: { Authorization: `Bearer ${h.token}` },
    })
    expect(r.status).toBe(409)
    const after = await h.store.read(join(h.root, 'openspec', 'changes', h.name))
    expect(after.fields.phase).toBe('open')
  })

  it('未知 event → 400', async () => {
    const h = await start()
    const r = await reqPost(h.port, `/api/change/${h.name}/transition`, { root: h.root, event: 'bogus' }, {
      headers: { Authorization: `Bearer ${h.token}` },
    })
    expect(r.status).toBe(400)
  })
})

describe('GET /api/stream —— SSE 真推送（.pipeline.yaml 变化即推）', () => {
  it('首连推初始快照；transition 改盘后推新快照（phase=explore）', async () => {
    const h = await start({ pollIntervalMs: 20 })
    const sse = await openSSE(h.port, '/api/stream')
    // 初始快照
    const first = await sse.waitFor((e) => e.event === 'snapshot')
    const s0 = JSON.parse(first.data)
    expect(s0.projects[0].changes[0].phase).toBe('open')

    // 真改盘
    const r = await reqPost(h.port, `/api/change/${h.name}/transition`, { root: h.root, event: 'open-complete' }, {
      headers: { Authorization: `Bearer ${h.token}` },
    })
    expect(r.status).toBe(200)

    // 轮询检测到变化 → 推新快照
    const next = await sse.waitFor((e) => {
      if (e.event !== 'snapshot') return false
      try { return JSON.parse(e.data).projects[0].changes[0].phase === 'explore' } catch { return false }
    }, 4000)
    expect(JSON.parse(next.data).projects[0].changes[0].phase).toBe('explore')
    sse.close()
  })
})
