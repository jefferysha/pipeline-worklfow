/**
 * server.test —— 真 HTTP 端到端（GOAL C9）：真起 http server（listen(0) 随机端口）、
 * node:http 真发请求、断言真实响应与真实落盘副作用。零 mock。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createDashboardServer } from './server.js'
import type { DashboardServer } from './types.js'
import {
  initChange, makeProject, makeTempHome, makeTempManifest, makeWorktreeDir, newStore, openSSE, reqDelete, reqGet, reqPost, testFlow,
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
  /** openspec/changes/<name> 绝对路径（afk cancel 等按 changeDir 读写 automation_* 字段的测试用）。 */
  changeDir: string
  /** 真实存在的临时目录，代表本 change 的 automation worktree 根（afk cancel 落标记文件测试用）。 */
  worktreeDir: string
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
  const worktreeDir = await makeWorktreeDir()
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
  return {
    srv, port, token: srv.token, root, store, name,
    changeDir: join(root, 'openspec', 'changes', name),
    worktreeDir,
    manifestPath: opts?.manifestPath,
  }
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

describe('POST /api/change/<name>/transition —— .pipeline-history.jsonl 记账（G20 / v5-T1）', () => {
  it('转换成功 → changeDir/.pipeline-history.jsonl 追加一行，形状对齐 CLI recordHistory（kind=transition + raw=event 不变式）', async () => {
    const h = await start()
    const r = await reqPost(h.port, `/api/change/${h.name}/transition`, { root: h.root, event: 'open-complete' }, {
      headers: { Authorization: `Bearer ${h.token}` },
    })
    expect(r.status).toBe(200)
    const text = await readFile(join(h.changeDir, '.pipeline-history.jsonl'), 'utf8')
    const lines = text.trim().split('\n')
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0]!)).toEqual({
      ts: '2026-07-07T00:00:00Z',
      kind: 'transition',
      from: 'open',
      to: 'explore',
      raw: 'open-complete', // 老仓 transitions_history.event 对位（同 cli/commands/transition.ts 口径）
    })
  })

  it('转换被拒（event 与当前 phase 不匹配 → 409）→ 不写 history（guard 拒绝零记账）', async () => {
    const h = await start()
    const r = await reqPost(h.port, `/api/change/${h.name}/transition`, { root: h.root, event: 'verify-pass' }, {
      headers: { Authorization: `Bearer ${h.token}` },
    })
    expect(r.status).toBe(409)
    expect(existsSync(join(h.changeDir, '.pipeline-history.jsonl'))).toBe(false)
  })

  it('连续两次转换 → 追加两行（append 语义，不覆盖）', async () => {
    const h = await start()
    // explore-complete 有 design_doc 前置校验（字段非空 + 文件真存在）——先满足再转换。
    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(h.root, 'design.md'), '# design\n', 'utf8')
    await h.store.set(h.changeDir, 'design_doc', 'design.md')
    for (const event of ['open-complete', 'explore-complete']) {
      const r = await reqPost(h.port, `/api/change/${h.name}/transition`, { root: h.root, event }, {
        headers: { Authorization: `Bearer ${h.token}` },
      })
      expect(r.status).toBe(200)
    }
    const text = await readFile(join(h.changeDir, '.pipeline-history.jsonl'), 'utf8')
    const rows = text.trim().split('\n').map((l) => JSON.parse(l) as { from: string; to: string })
    expect(rows.map((e) => `${e.from}->${e.to}`)).toEqual(['open->explore', 'explore->spec'])
  })
})

describe('GET /api/change/:name/history —— 阶段时间线读端点（G21 / v5-T1）', () => {
  it('无 .pipeline-history.jsonl → 200 空 entries（不是 404，与「change 不存在」区分）', async () => {
    const h = await start()
    const r = await reqGet(h.port, `/api/change/${h.name}/history?root=${encodeURIComponent(h.root)}`)
    expect(r.status).toBe(200)
    expect(r.json<{ entries: unknown[] }>().entries).toEqual([])
  })

  it('有记录 → 按 ts 升序返回（文件里乱序写入也重排）', async () => {
    const h = await start()
    const { writeFile } = await import('node:fs/promises')
    const rows = [
      { ts: '2026-07-07T02:00:00Z', kind: 'transition', from: 'explore', to: 'spec', raw: 'explore-complete' },
      { ts: '2026-07-07T01:00:00Z', kind: 'transition', from: 'open', to: 'explore', raw: 'open-complete' },
    ]
    await writeFile(join(h.changeDir, '.pipeline-history.jsonl'), rows.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8')
    const r = await reqGet(h.port, `/api/change/${h.name}/history?root=${encodeURIComponent(h.root)}`)
    expect(r.status).toBe(200)
    const entries = r.json<{ entries: Array<{ ts: string; to: string }> }>().entries
    expect(entries.map((e) => e.ts)).toEqual(['2026-07-07T01:00:00Z', '2026-07-07T02:00:00Z'])
    expect(entries.map((e) => e.to)).toEqual(['explore', 'spec'])
  })

  it('损坏行（非 JSON）与空行被跳过，其余照常返回（不 500）', async () => {
    const h = await start()
    const { writeFile } = await import('node:fs/promises')
    const good = { ts: '2026-07-07T01:00:00Z', kind: 'init' }
    await writeFile(join(h.changeDir, '.pipeline-history.jsonl'), `not-json{{{\n\n${JSON.stringify(good)}\n`, 'utf8')
    const r = await reqGet(h.port, `/api/change/${h.name}/history?root=${encodeURIComponent(h.root)}`)
    expect(r.status).toBe(200)
    expect(r.json<{ entries: unknown[] }>().entries).toEqual([good])
  })

  it('转换成功后立即可读（写读闭环：POST transition → GET history 回放同一条记录）', async () => {
    const h = await start()
    const w = await reqPost(h.port, `/api/change/${h.name}/transition`, { root: h.root, event: 'open-complete' }, {
      headers: { Authorization: `Bearer ${h.token}` },
    })
    expect(w.status).toBe(200)
    const r = await reqGet(h.port, `/api/change/${h.name}/history?root=${encodeURIComponent(h.root)}`)
    expect(r.status).toBe(200)
    expect(r.json<{ entries: Array<{ kind: string; from: string; to: string; raw: string }> }>().entries).toEqual([
      { ts: '2026-07-07T00:00:00Z', kind: 'transition', from: 'open', to: 'explore', raw: 'open-complete' },
    ])
  })

  it('非法 change 名（.. 路径穿越尝试）→ 400，同 afk log/cancel/retry 兄弟端点的 name 校验', async () => {
    const h = await start()
    const r = await reqGet(h.port, `/api/change/${encodeURIComponent('..')}/history?root=${encodeURIComponent(h.root)}`)
    expect(r.status).toBe(400)
  })

  it('root 不在注册表（不可信项目）→ 404，同兄弟端点共用的信任锚模式', async () => {
    const h = await start()
    const r = await reqGet(h.port, `/api/change/${h.name}/history?root=${encodeURIComponent('/tmp/not-registered')}`)
    expect(r.status).toBe(404)
    // 精确匹配信任锚校验的错误文案（而非落到路由表尾部「未知端点」兜底 404）——证明真走了本端点的 root 校验分支。
    expect(r.json<{ error: string }>().error).toBe('root 未在机器级项目注册表中')
  })

  it('change 名合法但该 change 实际不存在（无 .pipeline.yaml）→ 400，同 afk log 端点的 ENOENT 前置约定，不与「还没记录」的 200 混淆', async () => {
    const h = await start()
    const r = await reqGet(h.port, `/api/change/does-not-exist/history?root=${encodeURIComponent(h.root)}`)
    expect(r.status).toBe(400)
    expect(r.json<{ error: string }>().error).toBe('找不到该 change（无 .pipeline.yaml）')
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

  it('graduation 逻辑拒绝（跨级 L1→L3）→ 400 而非 200，body.applied=false（whole-branch review 抓出的真实回归：此前不管 applyLevelChange 是否真的应用了改档，一律 200，前端只看 res.ok 会把一次真实拒绝误当成功）', async () => {
    const { mkdir, writeFile, readFile: rf } = await import('node:fs/promises')
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

    // L1 直接跳 L3（合法目标档字符串，但 planLevelChange 判定 reject-cross-level，绝不允许一步跨级）
    const r = await reqPost(
      h.port,
      '/api/loops/level',
      { root: h.root, id: 'build-loop', target: 'L3' },
      { headers: { Authorization: `Bearer ${h.token}` } },
    )
    expect(r.status).toBe(400)
    const body = r.json<{ applied: boolean; exitCode: number; errors: string[] }>()
    expect(body.applied).toBe(false)
    expect(body.exitCode).toBe(2)
    expect(body.errors.length).toBeGreaterThan(0)
    // 真没改盘：loops.yaml 仍是原始 L1，不是误应用后的 L3
    const text = await rf(join(h.root, '.pipeline', 'loops.yaml'), 'utf8')
    expect(text).toContain('autonomy_level: L1')
  })
})

describe('POST /api/afk/:name/cancel —— 取消运行中的 automation 任务（afk-workbench Task 4）', () => {
  it('running 状态且 automation_sandbox 非空 → 落 .cancel-requested 标记 + docker kill + 200', async () => {
    const h = await start()
    await h.store.set(h.changeDir, 'automation', 'running')
    await h.store.set(h.changeDir, 'automation_sandbox', 'sandcastle-test-container-not-real')
    await h.store.set(h.changeDir, 'automation_worktree', h.worktreeDir) // 测试 fixture 需真建这个目录
    const r = await reqPost(h.port, `/api/afk/${h.name}/cancel`, { root: h.root }, { headers: { Authorization: `Bearer ${h.token}` } })
    expect(r.status).toBe(200)
    expect(existsSync(join(h.worktreeDir, '.cancel-requested'))).toBe(true)
  })

  it('automation 状态不是 running → 400，且不落标记文件（早退，无副作用）', async () => {
    const h = await start()
    await h.store.set(h.changeDir, 'automation', 'paused')
    const r = await reqPost(h.port, `/api/afk/${h.name}/cancel`, { root: h.root }, { headers: { Authorization: `Bearer ${h.token}` } })
    expect(r.status).toBe(400)
    expect(existsSync(join(h.worktreeDir, '.cancel-requested'))).toBe(false)
  })

  it('running 但 automation_sandbox 为空（容器名缺失，无法定位要 kill 的容器）→ 400，不落标记文件', async () => {
    const h = await start()
    await h.store.set(h.changeDir, 'automation', 'running')
    await h.store.set(h.changeDir, 'automation_worktree', h.worktreeDir)
    // 故意不设 automation_sandbox
    const r = await reqPost(h.port, `/api/afk/${h.name}/cancel`, { root: h.root }, { headers: { Authorization: `Bearer ${h.token}` } })
    expect(r.status).toBe(400)
    expect(existsSync(join(h.worktreeDir, '.cancel-requested'))).toBe(false)
  })

  it('change 名合法但该 change 实际不存在（无 .pipeline.yaml）→ 400，而非 500（kernel store.get 会 ENOENT）', async () => {
    const h = await start()
    const r = await reqPost(h.port, '/api/afk/does-not-exist/cancel', { root: h.root }, {
      headers: { Authorization: `Bearer ${h.token}` },
    })
    expect(r.status).toBe(400)
  })

  it('root 不在注册表（不可信项目）→ 404，同 transition 端点共用的信任锚模式', async () => {
    const h = await start()
    await h.store.set(h.changeDir, 'automation', 'running')
    await h.store.set(h.changeDir, 'automation_sandbox', 'sandcastle-test-container-not-real')
    await h.store.set(h.changeDir, 'automation_worktree', h.worktreeDir)
    const r = await reqPost(h.port, `/api/afk/${h.name}/cancel`, { root: '/tmp/not-registered' }, {
      headers: { Authorization: `Bearer ${h.token}` },
    })
    expect(r.status).toBe(404)
    expect(existsSync(join(h.worktreeDir, '.cancel-requested'))).toBe(false)
  })

  it('无 token → 401（确认新路由确实接在 handlePost 统一鉴权守卫之后，而非绕过）', async () => {
    const h = await start()
    await h.store.set(h.changeDir, 'automation', 'running')
    await h.store.set(h.changeDir, 'automation_sandbox', 'sandcastle-test-container-not-real')
    await h.store.set(h.changeDir, 'automation_worktree', h.worktreeDir)
    const r = await reqPost(h.port, `/api/afk/${h.name}/cancel`, { root: h.root })
    expect(r.status).toBe(401)
    expect(existsSync(join(h.worktreeDir, '.cancel-requested'))).toBe(false)
  })

  it('非法 change 名（.. 路径穿越尝试）→ 400，同 transition 端点的 change 名校验', async () => {
    const h = await start()
    const r = await reqPost(h.port, `/api/afk/${encodeURIComponent('..')}/cancel`, { root: h.root }, {
      headers: { Authorization: `Bearer ${h.token}` },
    })
    expect(r.status).toBe(400)
  })
})

describe('POST /api/afk/:name/retry —— 重试 failed/conflict/paused 任务（afk-workbench Task 5）', () => {
  it.each(['failed', 'conflict', 'paused'])('automation=%s → CAS 回 queued + 200，automation_attempts 清零', async (from) => {
    const h = await start()
    await h.store.set(h.changeDir, 'automation', from)
    await h.store.set(h.changeDir, 'automation_attempts', '3')
    const r = await reqPost(h.port, `/api/afk/${h.name}/retry`, { root: h.root }, { headers: { Authorization: `Bearer ${h.token}` } })
    expect(r.status).toBe(200)
    expect(await h.store.get(h.changeDir, 'automation')).toBe('queued')
    expect(await h.store.get(h.changeDir, 'automation_attempts')).toBe('0')
  })

  it('automation=running → 400（运行中不可重试，应先取消）', async () => {
    const h = await start()
    await h.store.set(h.changeDir, 'automation', 'running')
    const r = await reqPost(h.port, `/api/afk/${h.name}/retry`, { root: h.root }, { headers: { Authorization: `Bearer ${h.token}` } })
    expect(r.status).toBe(400)
  })

  it('change 名合法但该 change 实际不存在（无 .pipeline.yaml）→ 400，而非 500（同 cancel 端点已修的同类 ENOENT 坑）', async () => {
    const h = await start()
    const r = await reqPost(h.port, '/api/afk/does-not-exist/retry', { root: h.root }, {
      headers: { Authorization: `Bearer ${h.token}` },
    })
    expect(r.status).toBe(400)
  })

  it('root 不在注册表（不可信项目）→ 404，同 transition/cancel 端点共用的信任锚模式，且不改盘', async () => {
    const h = await start()
    await h.store.set(h.changeDir, 'automation', 'failed')
    const r = await reqPost(h.port, `/api/afk/${h.name}/retry`, { root: '/tmp/not-registered' }, {
      headers: { Authorization: `Bearer ${h.token}` },
    })
    expect(r.status).toBe(404)
    expect(await h.store.get(h.changeDir, 'automation')).toBe('failed')
  })

  it('无 token → 401（确认新路由确实接在 handlePost 统一鉴权守卫之后，而非绕过），且不改盘', async () => {
    const h = await start()
    await h.store.set(h.changeDir, 'automation', 'failed')
    const r = await reqPost(h.port, `/api/afk/${h.name}/retry`, { root: h.root })
    expect(r.status).toBe(401)
    expect(await h.store.get(h.changeDir, 'automation')).toBe('failed')
  })

  it('非法 change 名（.. 路径穿越尝试）→ 400，同 transition/cancel 端点的 change 名校验', async () => {
    const h = await start()
    const r = await reqPost(h.port, `/api/afk/${encodeURIComponent('..')}/retry`, { root: h.root }, {
      headers: { Authorization: `Bearer ${h.token}` },
    })
    expect(r.status).toBe(400)
  })
})

describe('POST /api/afk/:name/enqueue —— 挂入 AFK 队列（afk-workbench 缺口修复，真机验证发现）', () => {
  it('automation 未设（新 change）→ 200，automation=queued + automation_queued_at 落真时间戳', async () => {
    const h = await start()
    const r = await reqPost(h.port, `/api/afk/${h.name}/enqueue`, { root: h.root }, { headers: { Authorization: `Bearer ${h.token}` } })
    expect(r.status).toBe(200)
    expect(await h.store.get(h.changeDir, 'automation')).toBe('queued')
    expect(await h.store.get(h.changeDir, 'automation_queued_at')).not.toBe('')
  })

  it('automation=off（显式）→ 200，同未设语义一致', async () => {
    const h = await start()
    await h.store.set(h.changeDir, 'automation', 'off')
    const r = await reqPost(h.port, `/api/afk/${h.name}/enqueue`, { root: h.root }, { headers: { Authorization: `Bearer ${h.token}` } })
    expect(r.status).toBe(200)
    expect(await h.store.get(h.changeDir, 'automation')).toBe('queued')
  })

  it('已经 queued/running 等非 off 态 → 400，不重复挂队（而非静默幂等成功）', async () => {
    const h = await start()
    await h.store.set(h.changeDir, 'automation', 'running')
    const r = await reqPost(h.port, `/api/afk/${h.name}/enqueue`, { root: h.root }, { headers: { Authorization: `Bearer ${h.token}` } })
    expect(r.status).toBe(400)
    expect(await h.store.get(h.changeDir, 'automation')).toBe('running')
  })

  it('PM track → 400（PM 永不入队 AFK，同 automation 包 queue/gate.ts::optedIn 的硬规则）', async () => {
    // start() 的本地 harness 不接受 track 覆盖（固定走 initChange 默认 backend）——真设置
    // track 字段本身就是本端点要判定的前置状态，这里直接调 store.set 覆盖，同本文件其它
    // "先摆好状态再断言判定"用例的一致写法（如上面 cancel/retry 系列对 automation 字段的做法）。
    const h = await start()
    await h.store.set(h.changeDir, 'track', 'pm')
    const r = await reqPost(h.port, `/api/afk/${h.name}/enqueue`, { root: h.root }, { headers: { Authorization: `Bearer ${h.token}` } })
    expect(r.status).toBe(400)
    expect(await h.store.get(h.changeDir, 'automation')).not.toBe('queued')
  })

  it('change 名合法但该 change 实际不存在（无 .pipeline.yaml）→ 400，同 cancel/retry 端点已修的同类 ENOENT 坑', async () => {
    const h = await start()
    const r = await reqPost(h.port, '/api/afk/does-not-exist/enqueue', { root: h.root }, {
      headers: { Authorization: `Bearer ${h.token}` },
    })
    expect(r.status).toBe(400)
  })

  it('root 不在注册表（不可信项目）→ 404，同 cancel/retry 端点共用的信任锚模式，且不改盘', async () => {
    const h = await start()
    const r = await reqPost(h.port, `/api/afk/${h.name}/enqueue`, { root: '/tmp/not-registered' }, {
      headers: { Authorization: `Bearer ${h.token}` },
    })
    expect(r.status).toBe(404)
    expect(await h.store.get(h.changeDir, 'automation')).not.toBe('queued')
  })

  it('无 token → 401（确认新路由确实接在 handlePost 统一鉴权守卫之后，而非绕过），且不改盘', async () => {
    const h = await start()
    const r = await reqPost(h.port, `/api/afk/${h.name}/enqueue`, { root: h.root })
    expect(r.status).toBe(401)
    expect(await h.store.get(h.changeDir, 'automation')).not.toBe('queued')
  })

  it('非法 change 名（.. 路径穿越尝试）→ 400，同 transition/cancel/retry 端点的 change 名校验', async () => {
    const h = await start()
    const r = await reqPost(h.port, `/api/afk/${encodeURIComponent('..')}/enqueue`, { root: h.root }, {
      headers: { Authorization: `Bearer ${h.token}` },
    })
    expect(r.status).toBe(400)
  })
})

describe('GET /api/afk/:name/log —— 单个 change 的原始运行日志文本（afk-workbench Task 6）', () => {
  it('change 目录内有 .sandcastle-run.log → 原样返回内容', async () => {
    const h = await start()
    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(h.changeDir, '.sandcastle-run.log'), 'line1\nline2\n', 'utf8')
    const r = await reqGet(h.port, `/api/afk/${h.name}/log?root=${encodeURIComponent(h.root)}`)
    expect(r.status).toBe(200)
    expect(r.json<{ log: string }>().log).toBe('line1\nline2\n')
  })

  it('没有日志文件 → { log: null }，不是 404', async () => {
    const h = await start()
    const r = await reqGet(h.port, `/api/afk/${h.name}/log?root=${encodeURIComponent(h.root)}`)
    expect(r.status).toBe(200)
    expect(r.json<{ log: string | null }>().log).toBeNull()
  })

  it('root 不在注册表（不可信项目）→ 404，同 cancel/retry 端点共用的信任锚模式', async () => {
    const h = await start()
    const r = await reqGet(h.port, `/api/afk/${h.name}/log?root=${encodeURIComponent('/tmp/not-registered')}`)
    expect(r.status).toBe(404)
    // 精确匹配信任锚校验的错误文案（而非落到路由表尾部「未知端点」兜底 404）——证明真走了本端点的 root 校验分支。
    expect(r.json<{ error: string }>().error).toBe('root 未在机器级项目注册表中')
  })

  it('非法 change 名（.. 路径穿越尝试）→ 400，同 cancel/retry 端点的 change 名校验', async () => {
    const h = await start()
    const r = await reqGet(h.port, `/api/afk/${encodeURIComponent('..')}/log?root=${encodeURIComponent(h.root)}`)
    expect(r.status).toBe(400)
  })

  it('change 名合法但该 change 实际不存在（无 .pipeline.yaml）→ 400，同 cancel/retry 端点对同一存在性前置校验的约定，不与「还没日志」的 200 混淆', async () => {
    const h = await start()
    const r = await reqGet(h.port, `/api/afk/does-not-exist/log?root=${encodeURIComponent(h.root)}`)
    expect(r.status).toBe(400)
    // 精确匹配 ENOENT 前置校验的错误文案（而非落到路由表尾部「未知端点」兜底 404）——证明真走了 changeDir 存在性校验分支。
    expect(r.json<{ error: string }>().error).toBe('找不到该 change（无 .pipeline.yaml）')
  })
})

describe('GET /api/workflows —— 列出自定义 workflow（GOAL E8）', () => {
  it('root 未在注册表 → 404', async () => {
    const h = await start()
    const r = await reqGet(h.port, `/api/workflows?root=${encodeURIComponent('/tmp/not-registered')}`)
    expect(r.status).toBe(404)
  })

  it('真扫 .pipeline/workflows/*.yaml，排除 default，200 返回 names', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises')
    const h = await start()
    const dir = join(h.root, '.pipeline', 'workflows')
    await mkdir(dir, { recursive: true })
    const wf = 'name: onboarding\nsteps:\n  - id: s1\n    label: x\n    gate: null\n    skills: []\n    inputs: []\n    outputs: []\n    guards: []\n    transitions: []\n'
    await writeFile(join(dir, 'onboarding.yaml'), wf, 'utf8')
    await writeFile(join(dir, 'default.yaml'), wf.replace('onboarding', 'default'), 'utf8')
    const r = await reqGet(h.port, `/api/workflows?root=${encodeURIComponent(h.root)}`)
    expect(r.status).toBe(200)
    expect(r.json<{ names: string[] }>().names).toEqual(['onboarding'])
  })

  it('无 .pipeline/workflows 目录 → 200 + 空数组（不是错误）', async () => {
    const h = await start()
    const r = await reqGet(h.port, `/api/workflows?root=${encodeURIComponent(h.root)}`)
    expect(r.status).toBe(200)
    expect(r.json<{ names: string[] }>().names).toEqual([])
  })
})

describe('GET /api/workflows/:name —— 读单个 workflow（GOAL E8）', () => {
  it('真读 + 解析，200 返回 WorkflowDef', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises')
    const h = await start()
    const dir = join(h.root, '.pipeline', 'workflows')
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'onboarding.yaml'),
      'name: onboarding\nsteps:\n  - id: s1\n    label: x\n    gate: null\n    skills: []\n    inputs: []\n    outputs: []\n    guards: []\n    transitions: []\n',
      'utf8',
    )
    const r = await reqGet(h.port, `/api/workflows/onboarding?root=${encodeURIComponent(h.root)}`)
    expect(r.status).toBe(200)
    const body = r.json<{ name: string; steps: Array<{ id: string }> }>()
    expect(body.name).toBe('onboarding')
    expect(body.steps.map((s) => s.id)).toEqual(['s1'])
  })

  it('workflow 不存在 → 404', async () => {
    const h = await start()
    const r = await reqGet(h.port, `/api/workflows/ghost?root=${encodeURIComponent(h.root)}`)
    expect(r.status).toBe(404)
  })

  it('root 未注册 → 404（信任锚）', async () => {
    const h = await start()
    const r = await reqGet(h.port, `/api/workflows/onboarding?root=${encodeURIComponent('/tmp/not-registered')}`)
    expect(r.status).toBe(404)
  })

  it('非法 workflow 文件 → 500 + 错误详情（loadWorkflow 的 validateWorkflow 拒绝原因透传）', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises')
    const h = await start()
    const dir = join(h.root, '.pipeline', 'workflows')
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'broken.yaml'),
      'name: broken\nsteps:\n  - id: s1\n    label: x\n    gate: null\n    skills: []\n    inputs: []\n    outputs: []\n    guards: []\n    transitions:\n      - event: go\n        to: does-not-exist\n',
      'utf8',
    )
    const r = await reqGet(h.port, `/api/workflows/broken?root=${encodeURIComponent(h.root)}`)
    expect(r.status).toBe(500)
    expect(r.json<{ error: string }>().error).toContain('does-not-exist')
  })

  it('非法 workflow 文件，且校验错误信息里恰好含"未找到"字样（用户自起的 transition 目标名）→ 仍是 500，不会被误判成 404（round 2 review fix：证明分类不靠错误文本子串匹配）', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises')
    const h = await start()
    const dir = join(h.root, '.pipeline', 'workflows')
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'broken2.yaml'),
      'name: broken2\nsteps:\n  - id: s1\n    label: x\n    gate: null\n    skills: []\n    inputs: []\n    outputs: []\n    guards: []\n    transitions:\n      - event: go\n        to: 未找到\n',
      'utf8',
    )
    const r = await reqGet(h.port, `/api/workflows/broken2?root=${encodeURIComponent(h.root)}`)
    expect(r.status).toBe(500)
    expect(r.json<{ error: string }>().error).toContain('未找到')
  })

  it('非法 workflow 名（.. 路径穿越尝试）→ 400，同 afk 系列端点共用的 name 校验模式，且先于 root 校验被拦（root 未注册也命中这个 400，不是 root 校验的 404）', async () => {
    const h = await start()
    const r = await reqGet(h.port, `/api/workflows/${encodeURIComponent('..')}?root=${encodeURIComponent(h.root)}`)
    expect(r.status).toBe(400)
  })

  it('非法 workflow 名（编码后内含 / 的路径穿越尝试）→ 400，不会被当成合法文件名读取', async () => {
    const h = await start()
    const r = await reqGet(h.port, `/api/workflows/${encodeURIComponent('../../etc/passwd')}?root=${encodeURIComponent(h.root)}`)
    expect(r.status).toBe(400)
  })
})

describe('POST /api/workflows/:name —— 新建/覆盖自定义 workflow（GOAL E8）', () => {
  const VALID_BODY = {
    name: 'onboarding',
    steps: [
      { id: 'intake', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [{ event: 'complete', to: 'done' }] },
      { id: 'done', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
    ],
  }

  it('无 token → 401', async () => {
    const h = await start()
    const r = await reqPost(h.port, '/api/workflows/onboarding', { ...VALID_BODY, root: h.root })
    expect(r.status).toBe(401)
  })

  it('请求体不是 JSON 对象（如空 body）→ 400，同 /api/change/<name>/transition 共用的 body 形状校验（而非落到属性访问抛错的 500）', async () => {
    const h = await start()
    const r = await reqPost(h.port, '/api/workflows/onboarding', null, {
      rawBody: '',
      headers: { Authorization: `Bearer ${h.token}` },
    })
    expect(r.status).toBe(400)
  })

  it('root 未注册 → 404', async () => {
    const h = await start()
    const r = await reqPost(
      h.port, '/api/workflows/onboarding', { ...VALID_BODY, root: '/tmp/not-registered' },
      { headers: { Authorization: `Bearer ${h.token}` } },
    )
    expect(r.status).toBe(404)
  })

  it('name === default → 400（即便 body 合法）', async () => {
    const h = await start()
    const r = await reqPost(
      h.port, '/api/workflows/default', { ...VALID_BODY, name: 'default', root: h.root },
      { headers: { Authorization: `Bearer ${h.token}` } },
    )
    expect(r.status).toBe(400)
  })

  it('合法 body → 200，真落盘', async () => {
    const { readFile } = await import('node:fs/promises')
    const h = await start()
    const r = await reqPost(
      h.port, '/api/workflows/onboarding', { ...VALID_BODY, root: h.root },
      { headers: { Authorization: `Bearer ${h.token}` } },
    )
    expect(r.status).toBe(200)
    const content = await readFile(join(h.root, '.pipeline', 'workflows', 'onboarding.yaml'), 'utf8')
    expect(content).toContain('name: onboarding')
  })

  it('非法 body（validateWorkflow 拒绝）→ 400 + errors 数组，不落盘', async () => {
    const h = await start()
    const invalidBody = {
      name: 'broken',
      steps: [{ id: 's1', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [{ event: 'go', to: 'does-not-exist' }] }],
      root: h.root,
    }
    const r = await reqPost(
      h.port, '/api/workflows/broken', invalidBody,
      { headers: { Authorization: `Bearer ${h.token}` } },
    )
    expect(r.status).toBe(400)
    expect(r.json<{ errors: string[] }>().errors.some((e) => e.includes('does-not-exist'))).toBe(true)
    expect(existsSync(join(h.root, '.pipeline', 'workflows', 'broken.yaml'))).toBe(false)
  })

  it('G16 纵深防御：event 名含空格（绕过浏览器直调已鉴权 HTTP）→ 400 + errors，不落盘', async () => {
    const h = await start()
    const bodyWithBadEvent = {
      name: 'sneaky',
      steps: [
        { id: 's1', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [{ event: 'bad event', to: 's2' }] },
        { id: 's2', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
      ],
      root: h.root,
    }
    const r = await reqPost(
      h.port, '/api/workflows/sneaky', bodyWithBadEvent,
      { headers: { Authorization: `Bearer ${h.token}` } },
    )
    expect(r.status).toBe(400)
    expect(r.json<{ errors: string[] }>().errors.some((e) => e.includes("'bad event'"))).toBe(true)
    expect(existsSync(join(h.root, '.pipeline', 'workflows', 'sneaky.yaml'))).toBe(false)
  })

  it('非法 workflow 名（.. 路径穿越尝试）→ 400，同 GET /api/workflows/:name 共用的 name 防护，且先于落盘发生（.pipeline/workflows 目录都不会被创建）', async () => {
    const h = await start()
    const r = await reqPost(
      h.port, `/api/workflows/${encodeURIComponent('..')}`, { ...VALID_BODY, root: h.root },
      { headers: { Authorization: `Bearer ${h.token}` } },
    )
    expect(r.status).toBe(400)
    expect(existsSync(join(h.root, '.pipeline', 'workflows'))).toBe(false)
  })

  it('非法 workflow 名（编码后内含 / 的路径穿越尝试）→ 400，不会被当成合法文件名写入', async () => {
    const h = await start()
    const r = await reqPost(
      h.port, `/api/workflows/${encodeURIComponent('../../etc/passwd')}`, { ...VALID_BODY, root: h.root },
      { headers: { Authorization: `Bearer ${h.token}` } },
    )
    expect(r.status).toBe(400)
  })
})

describe('DELETE /api/workflows/:name —— 删除自定义 workflow（GOAL E8）', () => {
  it('无 token → 401', async () => {
    const h = await start()
    const r = await reqDelete(h.port, `/api/workflows/onboarding?root=${encodeURIComponent(h.root)}`)
    expect(r.status).toBe(401)
  })

  it('name === default → 400', async () => {
    const h = await start()
    const r = await reqDelete(
      h.port, `/api/workflows/default?root=${encodeURIComponent(h.root)}`,
      { headers: { Authorization: `Bearer ${h.token}` } },
    )
    expect(r.status).toBe(400)
  })

  it('真删存在的 workflow → 200，真从磁盘消失', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises')
    const h = await start()
    const dir = join(h.root, '.pipeline', 'workflows')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'onboarding.yaml'), 'name: onboarding\nsteps: []\n', 'utf8')
    const r = await reqDelete(
      h.port, `/api/workflows/onboarding?root=${encodeURIComponent(h.root)}`,
      { headers: { Authorization: `Bearer ${h.token}` } },
    )
    expect(r.status).toBe(200)
    expect(existsSync(join(dir, 'onboarding.yaml'))).toBe(false)
  })

  it('不存在的 workflow → 404', async () => {
    const h = await start()
    const r = await reqDelete(
      h.port, `/api/workflows/ghost?root=${encodeURIComponent(h.root)}`,
      { headers: { Authorization: `Bearer ${h.token}` } },
    )
    expect(r.status).toBe(404)
  })

  it('非法 workflow 名（.. 路径穿越尝试）→ 400，同 GET/POST /api/workflows/:name 共用的 name 防护，且先于删除发生', async () => {
    const h = await start()
    const r = await reqDelete(
      h.port, `/api/workflows/${encodeURIComponent('..')}?root=${encodeURIComponent(h.root)}`,
      { headers: { Authorization: `Bearer ${h.token}` } },
    )
    expect(r.status).toBe(400)
  })

  it('非法 workflow 名（编码后内含 / 的路径穿越尝试）→ 400，不会被当成合法文件名删除', async () => {
    const h = await start()
    const r = await reqDelete(
      h.port, `/api/workflows/${encodeURIComponent('../../etc/passwd')}?root=${encodeURIComponent(h.root)}`,
      { headers: { Authorization: `Bearer ${h.token}` } },
    )
    expect(r.status).toBe(400)
  })
})

describe('未知 HTTP 方法（非 GET/POST/DELETE）仍 405（既有兜底不因新增 DELETE 分支而失效）', () => {
  it('PUT → 405', async () => {
    const h = await start()
    const r = await new Promise<{ status: number }>((resolve, reject) => {
      const req = (require('node:http') as typeof import('node:http')).request(
        { host: '127.0.0.1', port: h.port, path: '/api/workflows/x', method: 'PUT' },
        (res) => resolve({ status: res.statusCode ?? 0 }),
      )
      req.on('error', reject)
      req.end()
    })
    expect(r.status).toBe(405)
  })
})

// ═══════════ G18：项目注册端点（spec §3.1，dashboard 闭环第一环）═══════════

/** G18 端点专用 harness：不注入 registry（走真 <home>/.claude/pipeline-projects.json 文件读写）。 */
async function startWithHome(): Promise<{ srv: DashboardServer; port: number; token: string; home: string; store: StateStore; registryPath: string }> {
  const home = await makeTempHome()
  const store = newStore()
  const srv = createDashboardServer({
    version: '9.9.9',
    token: 'secret-token-abc',
    home,
    store,
    flow: testFlow(),
    clock: () => '2026-07-09T00:00:00Z',
    pollIntervalMs: 20,
  })
  openServers.push(srv)
  const { port } = await srv.listen(0, '127.0.0.1')
  return { srv, port, token: srv.token, home, store, registryPath: join(home, '.claude', 'pipeline-projects.json') }
}

describe('POST /api/projects —— 注册项目进机器级注册表（G18）', () => {
  it('200：真目录注册成功 → 文件落盘规范化路径 + snapshot 立即可见', async () => {
    const h = await startWithHome()
    const proj = await makeProject()
    const r = await reqPost(h.port, '/api/projects', { root: proj }, { headers: { Authorization: `Bearer ${h.token}` } })
    expect(r.status).toBe(200)
    expect(r.json<{ ok: boolean; root: string }>().root).toBe(proj)
    const onDisk = JSON.parse(await readFile(h.registryPath, 'utf8')) as string[]
    expect(onDisk).toContain(proj)
    const snap = await reqGet(h.port, '/api/snapshot')
    expect(snap.json<{ project_count: number }>().project_count).toBe(1)
  })

  it('409：重复注册（含尾斜杠等非规范写法，两侧规范化后判重）', async () => {
    const h = await startWithHome()
    const proj = await makeProject()
    await reqPost(h.port, '/api/projects', { root: proj }, { headers: { Authorization: `Bearer ${h.token}` } })
    const dup = await reqPost(h.port, '/api/projects', { root: `${proj}/` }, { headers: { Authorization: `Bearer ${h.token}` } })
    expect(dup.status).toBe(409)
    const onDisk = JSON.parse(await readFile(h.registryPath, 'utf8')) as string[]
    expect(onDisk).toHaveLength(1)
  })

  it('400：body 非对象 / root 非字符串', async () => {
    const h = await startWithHome()
    const r1 = await reqPost(h.port, '/api/projects', 'just-a-string', { headers: { Authorization: `Bearer ${h.token}` } })
    expect(r1.status).toBe(400)
    const r2 = await reqPost(h.port, '/api/projects', { root: 5 }, { headers: { Authorization: `Bearer ${h.token}` } })
    expect(r2.status).toBe(400)
  })

  it('404：路径不存在；404：路径是文件非目录', async () => {
    const h = await startWithHome()
    const r1 = await reqPost(h.port, '/api/projects', { root: '/tmp/definitely-not-exist-g18-xyz' }, { headers: { Authorization: `Bearer ${h.token}` } })
    expect(r1.status).toBe(404)
    const proj = await makeProject()
    const filePath = join(proj, 'a-file.txt')
    await (await import('node:fs/promises')).writeFile(filePath, 'x', 'utf8')
    const r2 = await reqPost(h.port, '/api/projects', { root: filePath }, { headers: { Authorization: `Bearer ${h.token}` } })
    expect(r2.status).toBe(404)
  })

  it('401 无 token / 403 假 Host / 400 非 JSON Content-Type（三层鉴权在新路由同样生效），且不改盘', async () => {
    const h = await startWithHome()
    const proj = await makeProject()
    const r1 = await reqPost(h.port, '/api/projects', { root: proj })
    expect(r1.status).toBe(401)
    const r2 = await reqPost(h.port, '/api/projects', { root: proj }, { headers: { Authorization: `Bearer ${h.token}`, Host: 'evil.com' } })
    expect(r2.status).toBe(403)
    const r3 = await reqPost(h.port, '/api/projects', { root: proj }, { headers: { Authorization: `Bearer ${h.token}`, 'Content-Type': 'text/plain' } })
    expect(r3.status).toBe(400)
    expect(existsSync(h.registryPath)).toBe(false)
  })
})

describe('DELETE /api/projects —— 注销项目（G18 对称操作）', () => {
  it('200：注销后文件更新 + snapshot 不再包含', async () => {
    const h = await startWithHome()
    const proj = await makeProject()
    await reqPost(h.port, '/api/projects', { root: proj }, { headers: { Authorization: `Bearer ${h.token}` } })
    const r = await reqDelete(h.port, `/api/projects?root=${encodeURIComponent(proj)}`, { headers: { Authorization: `Bearer ${h.token}` } })
    expect(r.status).toBe(200)
    const onDisk = JSON.parse(await readFile(h.registryPath, 'utf8')) as string[]
    expect(onDisk).toHaveLength(0)
    const snap = await reqGet(h.port, '/api/snapshot')
    expect(snap.json<{ project_count: number }>().project_count).toBe(0)
  })

  it('404 未注册；400 缺 root query；401 无 token', async () => {
    const h = await startWithHome()
    const r1 = await reqDelete(h.port, `/api/projects?root=${encodeURIComponent('/tmp/never-registered')}`, { headers: { Authorization: `Bearer ${h.token}` } })
    expect(r1.status).toBe(404)
    const r2 = await reqDelete(h.port, '/api/projects', { headers: { Authorization: `Bearer ${h.token}` } })
    expect(r2.status).toBe(400)
    const r3 = await reqDelete(h.port, '/api/projects?root=%2Ftmp%2Fx')
    expect(r3.status).toBe(401)
  })
})

describe('POST /api/changes —— pipeline init 的 HTTP 化（G18）', () => {
  /** 先经真端点注册项目（G18 闭环语义），返回可用的 proj root。 */
  async function withRegisteredProject(h: Awaited<ReturnType<typeof startWithHome>>): Promise<string> {
    const proj = await makeProject()
    const r = await reqPost(h.port, '/api/projects', { root: proj }, { headers: { Authorization: `Bearer ${h.token}` } })
    expect(r.status).toBe(200)
    return proj
  }

  it('200 默认：.pipeline.yaml 真落盘（phase=open / track=chat / preset=full）+ snapshot 出现', async () => {
    const h = await startWithHome()
    const proj = await withRegisteredProject(h)
    const r = await reqPost(h.port, '/api/changes', { root: proj, name: 'demo-a' }, { headers: { Authorization: `Bearer ${h.token}` } })
    expect(r.status).toBe(200)
    const body = r.json<{ ok: boolean; name: string; path: string }>()
    expect(body.name).toBe('demo-a')
    const dir = join(proj, 'openspec', 'changes', 'demo-a')
    expect(existsSync(join(dir, '.pipeline.yaml'))).toBe(true)
    expect(await h.store.get(dir, 'phase')).toBe('open')
    expect(await h.store.get(dir, 'track')).toBe('chat')
    expect(await h.store.get(dir, 'preset')).toBe('full')
    const snap = await reqGet(h.port, '/api/snapshot')
    expect(JSON.stringify(snap.json())).toContain('demo-a')
  })

  it('G19①：200 后真写 history 记账（kind=init 单行 JSONL，对齐 cli init 的 best-effort 记账）', async () => {
    const h = await startWithHome()
    const proj = await withRegisteredProject(h)
    const r = await reqPost(h.port, '/api/changes', { root: proj, name: 'hist-a' }, { headers: { Authorization: `Bearer ${h.token}` } })
    expect(r.status).toBe(200)
    const { readFile } = await import('node:fs/promises')
    const raw = await readFile(join(proj, 'openspec', 'changes', 'hist-a', '.pipeline-history.jsonl'), 'utf8')
    const lines = raw.trim().split('\n').map((l) => JSON.parse(l) as { kind: string; ts: string })
    expect(lines).toHaveLength(1)
    expect(lines[0]!.kind).toBe('init')
    expect(typeof lines[0]!.ts).toBe('string')
  })

  it('200 显式 track=frontend', async () => {
    const h = await startWithHome()
    const proj = await withRegisteredProject(h)
    const r = await reqPost(h.port, '/api/changes', { root: proj, name: 'fe-x', track: 'frontend' }, { headers: { Authorization: `Bearer ${h.token}` } })
    expect(r.status).toBe(200)
    expect(await h.store.get(join(proj, 'openspec', 'changes', 'fe-x'), 'track')).toBe('frontend')
  })

  it('200 自定义 workflow：phase 种到首 step、workflow 字段写入（对齐 cli init --workflow 语义）', async () => {
    const h = await startWithHome()
    const proj = await withRegisteredProject(h)
    const { mkdir, writeFile } = await import('node:fs/promises')
    await mkdir(join(proj, '.pipeline', 'workflows'), { recursive: true })
    await writeFile(join(proj, '.pipeline', 'workflows', 'rel.yaml'), `name: rel
steps:
  - id: draft
    label: x
    gate: null
    skills: []
    inputs: []
    outputs: []
    guards: []
    transitions:
      - event: approved
        to: review
  - id: review
    label: y
    gate: review
    skills: []
    inputs: []
    outputs: []
    guards: []
    transitions: []
`, 'utf8')
    const r = await reqPost(h.port, '/api/changes', { root: proj, name: 'rel-x', workflow: 'rel' }, { headers: { Authorization: `Bearer ${h.token}` } })
    expect(r.status).toBe(200)
    const dir = join(proj, 'openspec', 'changes', 'rel-x')
    expect(await h.store.get(dir, 'phase')).toBe('draft')
    expect(await h.store.get(dir, 'workflow')).toBe('rel')
  })

  it('400：name 非法 / track 非法 / 重复 name', async () => {
    const h = await startWithHome()
    const proj = await withRegisteredProject(h)
    const bad1 = await reqPost(h.port, '/api/changes', { root: proj, name: 'bad name' }, { headers: { Authorization: `Bearer ${h.token}` } })
    expect(bad1.status).toBe(400)
    const bad2 = await reqPost(h.port, '/api/changes', { root: proj, name: 'ok-name', track: 'designer' }, { headers: { Authorization: `Bearer ${h.token}` } })
    expect(bad2.status).toBe(400)
    const first = await reqPost(h.port, '/api/changes', { root: proj, name: 'dup-x' }, { headers: { Authorization: `Bearer ${h.token}` } })
    expect(first.status).toBe(200)
    const dup = await reqPost(h.port, '/api/changes', { root: proj, name: 'dup-x' }, { headers: { Authorization: `Bearer ${h.token}` } })
    expect(dup.status).toBe(400)
  })

  it('404：workflow 不存在；404：root 未注册（信任锚在本端点生效）；401 无 token', async () => {
    const h = await startWithHome()
    const proj = await withRegisteredProject(h)
    const r1 = await reqPost(h.port, '/api/changes', { root: proj, name: 'x1', workflow: 'ghost' }, { headers: { Authorization: `Bearer ${h.token}` } })
    expect(r1.status).toBe(404)
    const outsider = await makeProject()
    const r2 = await reqPost(h.port, '/api/changes', { root: outsider, name: 'x2' }, { headers: { Authorization: `Bearer ${h.token}` } })
    expect(r2.status).toBe(404)
    const r3 = await reqPost(h.port, '/api/changes', { root: proj, name: 'x3' })
    expect(r3.status).toBe(401)
    expect(existsSync(join(proj, 'openspec', 'changes', 'x3'))).toBe(false)
  })
})

describe('POST /api/change/:name/transition —— 自定义 workflow 双轨（G17 端到端补全）', () => {
  async function startWithCustomChange(): Promise<Harness & { relDir: string }> {
    const h = await start()
    const { mkdir, writeFile } = await import('node:fs/promises')
    await mkdir(join(h.root, '.pipeline', 'workflows'), { recursive: true })
    await writeFile(join(h.root, '.pipeline', 'workflows', 'rel.yaml'), `name: rel
steps:
  - id: draft
    label: x
    gate: null
    skills: []
    inputs: []
    outputs: []
    guards: []
    transitions:
      - event: approved
        to: review
  - id: review
    label: y
    gate: review
    skills: []
    inputs: []
    outputs: []
    guards:
      - type: tasks-at-least
        n: 1
    transitions:
      - event: shipped
        to: ship
  - id: ship
    label: z
    gate: null
    skills: []
    inputs: []
    outputs: []
    guards: []
    transitions: []
`, 'utf8')
    const relDir = await initChange(h.store, h.root, 'rel-x')
    await h.store.setMany(relDir, { workflow: 'rel', phase: 'draft' })
    return { ...h, relDir }
  }

  it('200：自定义 event（approved）按 step transitions 推进，phase 真改盘', async () => {
    const h = await startWithCustomChange()
    const r = await reqPost(h.port, '/api/change/rel-x/transition', { root: h.root, event: 'approved' }, { headers: { Authorization: `Bearer ${h.token}` } })
    expect(r.status).toBe(200)
    const body = r.json<{ ok: boolean; from: string; to: string }>()
    expect(body.from).toBe('draft')
    expect(body.to).toBe('review')
    expect(await h.store.get(h.relDir, 'phase')).toBe('review')
  })

  it('409：当前 step 不支持的 event（文案列出可用 event），零写盘', async () => {
    const h = await startWithCustomChange()
    const r = await reqPost(h.port, '/api/change/rel-x/transition', { root: h.root, event: 'shipped' }, { headers: { Authorization: `Bearer ${h.token}` } })
    expect(r.status).toBe(409)
    expect(r.json<{ error: string }>().error).toContain('approved')
    expect(await h.store.get(h.relDir, 'phase')).toBe('draft')
  })

  it('409：step guard 未通过（review 的 tasks-at-least n=1，tasks 为空）→ 拒绝且零写盘', async () => {
    const h = await startWithCustomChange()
    await h.store.setMany(h.relDir, { phase: 'review' })
    const r = await reqPost(h.port, '/api/change/rel-x/transition', { root: h.root, event: 'shipped' }, { headers: { Authorization: `Bearer ${h.token}` } })
    expect(r.status).toBe(409)
    expect(await h.store.get(h.relDir, 'phase')).toBe('review')
  })

  it('default workflow 的行为零回归：未知 event 仍 400', async () => {
    const h = await startWithCustomChange()
    const r = await reqPost(h.port, `/api/change/${h.name}/transition`, { root: h.root, event: 'approved' }, { headers: { Authorization: `Bearer ${h.token}` } })
    expect(r.status).toBe(400)
  })
})
