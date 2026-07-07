/**
 * server.test —— 真 HTTP 端到端（GOAL C9）：真起 http server（listen(0) 随机端口）、
 * node:http 真发请求、断言真实响应与真实落盘副作用。零 mock。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createDashboardServer } from './server.js'
import type { DashboardServer } from './types.js'
import {
  initChange, makeProject, makeTempManifest, newStore, openSSE, reqGet, reqPost, testFlow,
} from './test-support.js'
import type { StateStore } from '@pipeline-lite/kernel'
import { loadManifest, TRANSITION_EVENTS as KERNEL_EVENTS, eventEdge as kernelEventEdge } from '@pipeline-lite/kernel'
import { TRANSITION_EVENTS, eventEdge } from './transition.js'

/** 接线级：server 真消费 kernel 单一真相源（BACKLOG #25b / GOAL B2）——transition.ts 已删本地镜像，
 * TRANSITION_EVENTS/eventEdge 只是 kernel 的 re-export（引用同一对象=同一真相源）。 */
describe('接线 —— server 事件表 = kernel 单源（无本地镜像）', () => {
  it('TRANSITION_EVENTS 就是 kernel 的（引用同一对象）', () => {
    expect(TRANSITION_EVENTS).toBe(KERNEL_EVENTS)
  })
  it('eventEdge 就是 kernel eventEdge（同一函数）', () => {
    expect(eventEdge).toBe(kernelEventEdge)
  })
})

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
  manifestPath?: string
}

async function start(opts?: {
  version?: string
  token?: string
  pollIntervalMs?: number
  manifestPath?: string
}): Promise<Harness> {
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
    manifestPath: opts?.manifestPath,
  })
  openServers.push(srv)
  const { port } = await srv.listen(0, '127.0.0.1')
  return { srv, port, token: srv.token, root, store, name, manifestPath: opts?.manifestPath }
}

/** 同 start()，但额外真拷贝仓库 manifest.yaml 到临时文件并注入，供 config 端点测试使用。 */
async function startWithConfig(opts?: { version?: string; token?: string }): Promise<Harness & { manifestPath: string }> {
  const manifestPath = await makeTempManifest()
  const h = await start({ ...opts, manifestPath })
  return { ...h, manifestPath }
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

describe('GET /api/config —— M3 config 数据端（Settings 矩阵 tab，本机回环只读不鉴权）', () => {
  it('capabilities.config=false 的实例（未注入 manifestPath）→ 404，snapshot 亦如实标 config:false', async () => {
    const h = await start() // 默认不带 manifestPath（同现有全部既存测试）
    const snap = (await reqGet(h.port, '/api/snapshot')).json<{ capabilities: Record<string, boolean> }>()
    expect(snap.capabilities.config).toBe(false)
    const r = await reqGet(h.port, '/api/config')
    expect(r.status).toBe(404)
  })

  it('capabilities.config=true（注入真 manifestPath）→ 200 且回真 mandatory_skills 扁平映射', async () => {
    const h = await startWithConfig()
    const snap = (await reqGet(h.port, '/api/snapshot')).json<{ capabilities: Record<string, boolean> }>()
    expect(snap.capabilities.config).toBe(true)

    const r = await reqGet(h.port, '/api/config')
    expect(r.status).toBe(200)
    const body = r.json<{ ok: boolean; mandatory_skills: Record<string, string[]> }>()
    expect(body.ok).toBe(true)
    expect(body.mandatory_skills['build.backend']).toContain('superpowers:test-driven-development')
    expect(body.mandatory_skills['open._all']).toContain('opsx:propose|openspec-propose')
  })
})

describe('GET /api/skills/registry —— 全部已注册 skill 列表', () => {
  it('返回本仓真实 skills 目录 + EXTERNAL-SKILLS.md 合并列表', async () => {
    const h = await start()
    const r = await reqGet(h.port, '/api/skills/registry')
    expect(r.status).toBe(200)
    const body = r.json<{ skills: string[] }>()
    expect(body.skills).toContain('pipeline-open') // 本仓真实存在的本地 skill 目录
    expect(body.skills.length).toBeGreaterThan(14) // 必须包含外部登记，不能只有本地 14 个
  })
})

describe('POST /api/config/mandatory-skills —— M3 config 写端点（同 B5 token 鉴权模式）', () => {
  it('无 token → 401（与 transition 端点同一鉴权模式）', async () => {
    const h = await startWithConfig()
    const r = await reqPost(h.port, '/api/config/mandatory-skills', { phase: 'build', track: 'backend', skills: ['x'] })
    expect(r.status).toBe(401)
  })

  it('错 token → 401', async () => {
    const h = await startWithConfig()
    const r = await reqPost(h.port, '/api/config/mandatory-skills', { phase: 'build', track: 'backend', skills: ['x'] }, {
      headers: { Authorization: 'Bearer wrong-token' },
    })
    expect(r.status).toBe(401)
  })

  it('对 token → 200 且真改盘 manifest.yaml（build.backend 真变，其余条目不变）', async () => {
    const h = await startWithConfig()
    const r = await reqPost(h.port, '/api/config/mandatory-skills', { phase: 'build', track: 'backend', skills: ['new-a', 'new-b'] }, {
      headers: { Authorization: `Bearer ${h.token}` },
    })
    expect(r.status).toBe(200)
    const body = r.json<{ ok: boolean; phase: string; track: string; skills: string[] }>()
    expect(body).toEqual({ ok: true, phase: 'build', track: 'backend', skills: ['new-a', 'new-b'] })

    // 真副作用：磁盘上的 manifest.yaml 已改，且真过 kernel loadManifest 重解析
    const reparsed = loadManifest(h.manifestPath!)
    expect(reparsed.mandatorySkills.build.backend).toEqual(['new-a', 'new-b'])
    expect(reparsed.mandatorySkills.explore.pm).toEqual(['superpowers:brainstorming', 'grill-with-docs'])

    // 且 GET /api/config 立刻回显新值（读写一致，非缓存旧值）
    const after = (await reqGet(h.port, '/api/config')).json<{ mandatory_skills: Record<string, string[]> }>()
    expect(after.mandatory_skills['build.backend']).toEqual(['new-a', 'new-b'])
  })

  it('X-Pipeline-Token header 亦被接受（对 token → 200，同 transition 端点）', async () => {
    const h = await startWithConfig()
    const r = await reqPost(h.port, '/api/config/mandatory-skills', { phase: 'spec', track: 'pm', skills: ['ok'] }, {
      headers: { 'X-Pipeline-Token': h.token },
    })
    expect(r.status).toBe(200)
  })

  it('非本地 Host header → 403（同 transition 端点共用的 DNS 重绑定守卫）', async () => {
    const h = await startWithConfig()
    const r = await reqPost(h.port, '/api/config/mandatory-skills', { phase: 'build', track: 'backend', skills: ['x'] }, {
      headers: { Host: 'evil.example:1234', Authorization: `Bearer ${h.token}` },
    })
    expect(r.status).toBe(403)
  })

  it('非 application/json → 400（同 transition 端点共用的同源策略防线）', async () => {
    const h = await startWithConfig()
    const r = await reqPost(h.port, '/api/config/mandatory-skills', null, {
      rawBody: 'phase=build&track=backend',
      headers: { 'Content-Type': 'text/plain', Authorization: `Bearer ${h.token}` },
    })
    expect(r.status).toBe(400)
  })

  it('capabilities.config=false（未注入 manifestPath）→ 404，即便带对 token', async () => {
    const h = await start()
    const r = await reqPost(h.port, '/api/config/mandatory-skills', { phase: 'build', track: 'backend', skills: ['x'] }, {
      headers: { Authorization: `Bearer ${h.token}` },
    })
    expect(r.status).toBe(404)
  })

  it('archive 相位 → 400，原文件不改动', async () => {
    const h = await startWithConfig()
    const before = await readFile(h.manifestPath!, 'utf8')
    const r = await reqPost(h.port, '/api/config/mandatory-skills', { phase: 'archive', track: 'backend', skills: ['x'] }, {
      headers: { Authorization: `Bearer ${h.token}` },
    })
    expect(r.status).toBe(400)
    expect(await readFile(h.manifestPath!, 'utf8')).toBe(before)
  })

  it('未知 track（如 _all）→ 400，原文件不改动', async () => {
    const h = await startWithConfig()
    const before = await readFile(h.manifestPath!, 'utf8')
    const r = await reqPost(h.port, '/api/config/mandatory-skills', { phase: 'build', track: '_all', skills: ['x'] }, {
      headers: { Authorization: `Bearer ${h.token}` },
    })
    expect(r.status).toBe(400)
    expect(await readFile(h.manifestPath!, 'utf8')).toBe(before)
  })

  it('含非法字符的 skill token（注入尝试：逗号 + 方括号 + 伪 key）→ 400，原文件逐字节不改动', async () => {
    const h = await startWithConfig()
    const before = await readFile(h.manifestPath!, 'utf8')
    const r = await reqPost(
      h.port,
      '/api/config/mandatory-skills',
      { phase: 'build', track: 'backend', skills: ['legit', 'evil], injected.key: [pwn'] },
      { headers: { Authorization: `Bearer ${h.token}` } },
    )
    expect(r.status).toBe(400)
    const body = r.json<{ ok: boolean; error: string }>()
    expect(body.ok).toBe(false)
    expect(await readFile(h.manifestPath!, 'utf8')).toBe(before) // 字节级不变——无注入生效
  })

  it('并发提交两个不同 phase.track（多标签页同时编辑）→ 都真生效、互不覆盖丢失', async () => {
    const h = await startWithConfig()
    const [r1, r2] = await Promise.all([
      reqPost(h.port, '/api/config/mandatory-skills', { phase: 'spec', track: 'frontend', skills: ['tab-1'] }, {
        headers: { Authorization: `Bearer ${h.token}` },
      }),
      reqPost(h.port, '/api/config/mandatory-skills', { phase: 'verify', track: 'backend', skills: ['tab-2'] }, {
        headers: { Authorization: `Bearer ${h.token}` },
      }),
    ])
    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)
    const reparsed = loadManifest(h.manifestPath!)
    expect(reparsed.mandatorySkills.spec.frontend).toEqual(['tab-1'])
    expect(reparsed.mandatorySkills.verify.backend).toEqual(['tab-2'])
  })
})

describe('GET /api/loops/snapshot —— 跨项目聚合 loops.yaml', () => {
  it('capabilities.loops=true；无 loops.yaml 时返回空 rows 而非报错', async () => {
    const h = await start()
    const capRes = await reqGet(h.port, '/api/snapshot')
    expect(capRes.json<any>().capabilities.loops).toBe(true)

    const r = await reqGet(h.port, '/api/loops/snapshot')
    expect(r.status).toBe(200)
    expect(r.json<{ rows: unknown[] }>().rows).toEqual([])
  })
})

// ── loops 升降档写端点 ──
const SEED_LOOP_YAML_READY_FOR_L2 = `version: 1
loops:
  - id: build-loop
    name: build-loop 编排 loop
    kind: orchestrator
    goal: 每小时从队列发现立项跑通四门收编收敛到架构报告的单写者目标架构直至全部成功判据勾满
    cadence: 1h
    risk: medium
    runner: cron-session
    change_prefix: build-loop-
    phases:
      - decide
      - record
    human_gates:
      - P2 战略项只写提案
      - push/合并到远端
    state: .superpowers/loops/progress.md
    design_doc: docs/loops/build-loop.md
    status: active
    budget:
      max_runs_per_day: 24
      max_in_flight: 1
      on_exceed: skip
      max_tokens_per_day: 100000
    kill_criteria:
      - backlog 连续 2 轮空
      - 同项连败 3 次
    autonomy_level: L1
`

describe('POST /api/loops/level —— 升降档写回', () => {
  it('对 token + root 在注册表里 → 200 且真改盘 loops.yaml', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises')
    const h = await start()
    // seed 一个已就绪的 loop（readiness 会满足 L1→L2）到 h.root
    // 需要：registry + LOOP.md（防镜像漂移）+ progress.md（运行流水）
    await mkdir(join(h.root, '.pipeline'), { recursive: true })
    await writeFile(join(h.root, '.pipeline', 'loops.yaml'), SEED_LOOP_YAML_READY_FOR_L2, 'utf8')
    await writeFile(join(h.root, 'LOOP.md'), '# LOOP.md\n\n### `build-loop` — build-loop 协议\n\n- goal：见 registry\n', 'utf8')
    await mkdir(join(h.root, '.superpowers', 'loops'), { recursive: true })
    await writeFile(
      join(h.root, '.superpowers', 'loops', 'progress.md'),
      '| ts | loop | action | inflight | note |\n|----|------|--------|----------|------|\n| 2026-07-06T23:30 | build-loop | run | 0 | result=ok change=build-loop-3 |\n',
      'utf8',
    )

    const r = await reqPost(
      h.port,
      '/api/loops/level',
      { root: h.root, id: 'build-loop', target: 'L2' },
      { headers: { Authorization: `Bearer ${h.token}` } },
    )
    expect(r.status).toBe(200)
    const body = r.json<{ applied: boolean }>()
    expect(body.applied).toBe(true)
    const text = readFile(join(h.root, '.pipeline', 'loops.yaml'), 'utf8')
    expect(await text).toContain('autonomy_level: L2')
  })

  it('root 不在机器级注册表里 → 404，不改盘', async () => {
    const h = await start()
    const r = await reqPost(
      h.port,
      '/api/loops/level',
      { root: '/tmp/not-registered', id: 'x', target: 'L2' },
      { headers: { Authorization: `Bearer ${h.token}` } },
    )
    expect(r.status).toBe(404)
  })

  it('无 token → 401', async () => {
    const h = await start()
    const r = await reqPost(h.port, '/api/loops/level', { root: h.root, id: 'build-loop', target: 'L2' })
    expect(r.status).toBe(401)
  })

  it('root 以非规范但等价形式提交（结尾多一个斜杠）→ 仍视为已注册（200），两侧规范化后比较（同 transition 端点模式）', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises')
    const h = await start()
    await mkdir(join(h.root, '.pipeline'), { recursive: true })
    await writeFile(join(h.root, '.pipeline', 'loops.yaml'), SEED_LOOP_YAML_READY_FOR_L2, 'utf8')
    await writeFile(join(h.root, 'LOOP.md'), '# LOOP.md\n\n### `build-loop` — build-loop 协议\n\n- goal：见 registry\n', 'utf8')
    await mkdir(join(h.root, '.superpowers', 'loops'), { recursive: true })
    await writeFile(
      join(h.root, '.superpowers', 'loops', 'progress.md'),
      '| ts | loop | action | inflight | note |\n|----|------|--------|----------|------|\n| 2026-07-06T23:30 | build-loop | run | 0 | result=ok change=build-loop-3 |\n',
      'utf8',
    )

    const r = await reqPost(
      h.port,
      '/api/loops/level',
      { root: `${h.root}/`, id: 'build-loop', target: 'L2' },
      { headers: { Authorization: `Bearer ${h.token}` } },
    )
    expect(r.status).toBe(200)
    const body = r.json<{ applied: boolean }>()
    expect(body.applied).toBe(true)
  })

  it('root/id/target 为空字符串 → 400（不该落入 404 registry-miss 或 200 内核错误信封）', async () => {
    const h = await start()
    const base = { root: h.root, id: 'build-loop', target: 'L2' }
    const cases = [
      { ...base, root: '' },
      { ...base, id: '' },
      { ...base, target: '' },
    ]
    for (const body of cases) {
      const r = await reqPost(h.port, '/api/loops/level', body, {
        headers: { Authorization: `Bearer ${h.token}` },
      })
      expect(r.status).toBe(400)
    }
  })
})
