/**
 * TS 全局 dashboard server —— 全机唯一 Global server（对位老仓 dashboard-server.py）。
 * Node stdlib http，零第三方运行时依赖；只依赖 @pipeline-lite/kernel（消费方，只 import 不改）。
 *
 * 端点：
 *   GET  /                          前端落地页（同源注入本 server token，B5 交付；#26 前端重构承接）
 *   GET  /api/health                存活探针 + 本 server 版本（B4）
 *   GET  /api/snapshot              聚合本机所有注册 Project 的 .pipeline.yaml → JSON
 *   GET  /api/stream                SSE：.pipeline.yaml 变化即推新快照 + 心跳
 *   GET  /api/config                Settings 矩阵 tab 数据源：manifest.yaml mandatory_skills 扁平映射（M3）
 *   POST /api/change/<name>/transition        写回转换（B5 token 鉴权 + Host 守卫 + application/json）
 *   POST /api/config/mandatory-skills         写回一条 phase.track 强制 skill（同 B5 鉴权；M3 可选增量收编，
 *                                              全机唯一 manifest.yaml、无 root/name，见 config.ts 头注释）
 *
 * 安全模型（B5，修老仓「写端点无鉴权，已接受风险」CONTEXT.md L33 / 欠账 #4）：
 *   · GET 只读端点：绑 127.0.0.1，不鉴权（本机回环）。
 *   · 所有 POST 写端点：三道纵深——(1) Host 头 DNS 重绑定守卫；(2) **一次性 token 强制校验**
 *     （Authorization: Bearer / X-Pipeline-Token，缺/错 → 401）；(3) 强制 application/json（借同源策略）。
 *   token 启动生成、写 0600 握手文件、同源注入前端；较老仓「仅靠同源 + 无 token」是净收紧。
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dirname, join, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyLevelChange, createFlowEngine, createStateStore, loadManifest, loadRegistry } from '@pipeline-lite/kernel'
import type { FlowEngine, GraduationFs, StateStore, WorkflowDef } from '@pipeline-lite/kernel'
import { buildAfkLog, buildAfkSnapshot, cancelAfkRun, readAfkRunLog, retryAfkRun } from './afk.js'
import { buildLoopsSnapshot } from './loops.js'
import { readMandatorySkills, validateMandatorySkillsBody, writeMandatorySkills } from './config.js'
import { resolveServerPaths } from './paths.js'
import { deleteWorkflowForApi, listWorkflowNames, readWorkflowForApi, writeWorkflowForApi, WorkflowNotFoundError } from './workflows.js'
import { readRegistry } from './registry.js'
import { listAllSkills } from './skillsRegistry.js'
import { buildSnapshot, computeFingerprint, dedupeRoots, type SnapshotDeps } from './snapshot.js'
import { generateToken, tokenFromHeaders, tokensMatch } from './token.js'
import { listTraceSessions, readTraceRecords } from './traces.js'
import { performTransition } from './transition.js'
import type { DashboardServer, DashboardServerOptions } from './types.js'
import { SERVER_VERSION } from './version.js'

const MAX_POST_BODY = 64 * 1024

function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

// ── #38 graduation 真 node fs（登记 + run-log + LOOP.md 镜像 + loops.yaml 原文读写）──
const REAL_GRADUATION_FS: GraduationFs = {
  loadRegistry: (repoRoot) => loadRegistry(repoRoot),
  readRunLog: (repoRoot) => {
    try {
      return readFileSync(join(repoRoot, '.superpowers', 'loops', 'progress.md'), 'utf8')
    } catch {
      return null
    }
  },
  readLoopDoc: (repoRoot) => {
    try {
      return readFileSync(join(repoRoot, 'LOOP.md'), 'utf8')
    } catch {
      return null
    }
  },
  readRegistryText: (repoRoot) => {
    try {
      return readFileSync(join(repoRoot, '.pipeline', 'loops.yaml'), 'utf8')
    } catch {
      return null
    }
  },
  writeRegistryText: (repoRoot, text) => writeFileSync(join(repoRoot, '.pipeline', 'loops.yaml'), text, 'utf8'),
}

/** 从 packages/server/dist/server.js 位置往上定位到仓库根（对位 main.ts 的 manifestPath 写法）。 */
function repoRootForSkills(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** DNS-rebinding guard（老仓 core._host_is_local 逐条对位）：仅 loopback（± :port）放行。 */
export function isLocalHost(host: string | undefined, port: number): boolean {
  if (!host) return false
  const h = host.trim().toLowerCase()
  const allowed = new Set([
    '127.0.0.1', 'localhost', '[::1]',
    `127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`,
  ])
  return allowed.has(h)
}

function indexHtml(token: string): string {
  // 最小落地页 —— 同源前端读取注入的 token 后带 header 调写端点（B5）。信息架构重构见 BACKLOG #26。
  // token 作 JS 字符串注入；转义 `<` 防 `</script>` 断出（纵深防护，token 本就 server 生成可信）。
  const jsToken = JSON.stringify(token).replace(/</g, '\\u003c')
  return `<!doctype html><meta charset="utf-8"><title>Pipeline Dashboard</title>
<h1>Pipeline Global Dashboard</h1>
<p>TS 全局 server 已就绪。只读数据见 <code>/api/snapshot</code> / <code>/api/stream</code>；健康探针 <code>/api/health</code>。</p>
<p>写端点需带一次性 token（B5）。前端信息架构重构：BACKLOG #26。</p>
<script>window.__PIPELINE_DASHBOARD_TOKEN__ = ${jsToken};</script>`
}

export function createDashboardServer(options: DashboardServerOptions = {}): DashboardServer {
  const version = options.version ?? SERVER_VERSION
  const token = options.token ?? generateToken()
  const clock = options.clock ?? isoNow
  const paths = resolveServerPaths({ home: options.home })
  const registry: () => string[] = options.registry ?? (() => readRegistry(paths.registryPath))
  const store: StateStore = options.store ?? createStateStore()
  const flow: FlowEngine = options.flow
    ?? (options.manifestPath
      ? createFlowEngine(loadManifest(options.manifestPath))
      : (() => { throw new Error('createDashboardServer: 需注入 flow 或 manifestPath') })())
  const pollIntervalMs = options.pollIntervalMs ?? 1000
  const heartbeatMs = options.heartbeatMs ?? 15000
  const gitHeadSha = options.gitHeadSha
  const traceStore = options.traceStore
  // config 写端点（M3 可选增量）数据源：manifest.yaml 路径。未注入（如测试只传 flow 而非
  // manifestPath）→ capabilities.config=false，GET/POST config 端点降级 404（不谎报，同 traffic 手法）。
  const manifestPath = options.manifestPath

  // 能力声明（GOAL B6）：afk 数据端始终已接线（读同一 registry+store 的 automation_* 字段）；
  // traffic 仅注入 traceStore 时为真（未装 → 前端 Advanced 仍占位，不谎报）；
  // loops 数据端始终已接线（无可选运行时依赖）。#29d / #34d。
  const capabilities: Record<string, boolean> = { afk: true, loops: true, traffic: Boolean(traceStore), config: Boolean(manifestPath) }
  const snapshotDeps = (): SnapshotDeps => ({ registry, store, version, clock, capabilities })

  const fileExists = (root: string, relPath: string): boolean => {
    try {
      return statSync(join(root, relPath)).isFile()
    } catch {
      return false
    }
  }

  let boundPort = 0

  // ── SSE 推送引擎 ──
  const clients = new Set<ServerResponse>()
  let lastFp = ''
  let lastBeat = Date.now()
  let pollTimer: ReturnType<typeof setInterval> | null = null

  function broadcast(event: string, data: string): void {
    lastBeat = Date.now()
    const frame = `event: ${event}\ndata: ${data}\n\n`
    for (const res of clients) {
      try { res.write(frame) } catch { /* 断开的连接会在 close 事件里清理 */ }
    }
  }

  function stopPoll(): void {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  async function pollTick(): Promise<void> {
    if (clients.size === 0) {
      stopPoll() // 零客户端不空转
      return
    }
    let fp: string
    try {
      fp = await computeFingerprint(registry())
    } catch {
      return
    }
    if (fp !== lastFp) {
      lastFp = fp
      try {
        broadcast('snapshot', JSON.stringify(await buildSnapshot(snapshotDeps())))
      } catch {
        /* 一次失败下轮再试 */
      }
    } else if (Date.now() - lastBeat > heartbeatMs) {
      lastBeat = Date.now()
      for (const res of clients) {
        try { res.write(': ping\n\n') } catch { /* ignore */ }
      }
    }
  }

  function startPoll(): void {
    if (pollTimer) return
    pollTimer = setInterval(() => { void pollTick() }, pollIntervalMs)
    pollTimer.unref?.()
  }

  // ── 响应工具 ──
  function sendJson(res: ServerResponse, code: number, obj: unknown): void {
    const body = Buffer.from(JSON.stringify(obj), 'utf8')
    res.writeHead(code, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
    })
    res.end(body)
  }

  function sendHtml(res: ServerResponse, code: number, html: string): void {
    const body = Buffer.from(html, 'utf8')
    res.writeHead(code, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
    })
    res.end(body)
  }

  function readJsonBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve) => {
      let done = false
      const finish = (v: unknown): void => { if (!done) { done = true; resolve(v) } }
      const len = Number.parseInt(String(req.headers['content-length'] ?? ''), 10)
      if (Number.isFinite(len) && len > MAX_POST_BODY) return finish(undefined)
      let data = ''
      let size = 0
      req.setEncoding('utf8')
      req.on('data', (c: string) => {
        size += Buffer.byteLength(c)
        if (size > MAX_POST_BODY) { finish(undefined); req.destroy(); return }
        data += c
      })
      req.on('end', () => {
        try { finish(JSON.parse(data)) } catch { finish(undefined) }
      })
      req.on('error', () => finish(undefined))
    })
  }

  // ── SSE 端点 ──
  async function handleStream(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    clients.add(res)
    try {
      lastFp = await computeFingerprint(registry())
      res.write(`event: snapshot\ndata: ${JSON.stringify(await buildSnapshot(snapshotDeps()))}\n\n`)
    } catch {
      /* 初始快照失败不影响后续推送 */
    }
    startPoll()
    req.on('close', () => {
      clients.delete(res)
      if (clients.size === 0) stopPoll()
    })
  }

  // ── SPA 静态供给（BACKLOG #26c）：webRoot 存在则服务 dashboard-app 产物 ──
  const webRoot = options.webRoot
  const STATIC_TYPES: Record<string, string> = {
    '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  }
  function serveIndexWithToken(res: ServerResponse): boolean {
    if (!webRoot) return false
    try {
      let html = readFileSync(join(webRoot, 'index.html'), 'utf8')
      const jsToken = JSON.stringify(token).replace(/</g, '\\u003c')
      const inject = `<script>window.__PIPELINE_DASHBOARD_TOKEN__ = ${jsToken};</script>`
      html = html.includes('</head>') ? html.replace('</head>', `${inject}</head>`) : `${inject}${html}`
      sendHtml(res, 200, html)
      return true
    } catch { return false }
  }
  /** /assets/* 静态供给：限 webRoot/assets 子树（防路径穿越），命中返回 true。 */
  function serveAsset(res: ServerResponse, path: string): boolean {
    if (!webRoot || !path.startsWith('/assets/')) return false
    const rel = path.slice(1) // 去前导 /
    if (rel.includes('..')) return false
    const abs = join(webRoot, rel)
    if (!abs.startsWith(join(webRoot, 'assets'))) return false
    try {
      const body = readFileSync(abs)
      const ext = abs.slice(abs.lastIndexOf('.'))
      res.writeHead(200, {
        'Content-Type': STATIC_TYPES[ext] ?? 'application/octet-stream',
        'Content-Length': body.length,
        'Cache-Control': 'public, max-age=31536000, immutable',
      })
      res.end(body)
      return true
    } catch { return false }
  }

  // ── 路由 ──
  async function handleGet(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
    if (path === '/' || path === '/index.html') {
      if (serveIndexWithToken(res)) return // SPA 产物存在 → 服务真前端
      return sendHtml(res, 200, indexHtml(token)) // 回退最小落地页
    }
    if (serveAsset(res, path)) return
    if (path === '/api/health') {
      return sendJson(res, 200, { ok: true, scope: 'global', version, pid: process.pid })
    }
    if (path === '/api/snapshot') {
      try {
        return sendJson(res, 200, await buildSnapshot(snapshotDeps()))
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: errMsg(e) })
      }
    }
    if (path === '/api/stream') return handleStream(req, res)
    // ── #29d AFK 指挥面数据端：聚合 automation_* → 泳道 + 调度器 doctor 灯 + 流水 ──
    if (path === '/api/afk/snapshot') {
      try {
        return sendJson(res, 200, buildAfkSnapshot(await buildSnapshot(snapshotDeps()), clock))
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: errMsg(e) })
      }
    }
    if (path === '/api/afk/log') {
      try {
        return sendJson(res, 200, buildAfkLog(await buildSnapshot(snapshotDeps()), clock))
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: errMsg(e) })
      }
    }
    // ── afk-workbench Task 6：GET /api/afk/:name/log —— 单个 change 的原始运行日志文本
    //    （.sandcastle-run.log 原样读取，见 afk.ts::readAfkRunLog）。与上面字面量路由
    //    /api/afk/log（聚合时间线）语义、路径结构均不同，正则要求 /log 前必有 change 名段，
    //    故不会误吞不带名字的旧路由——仍把参数化路由放在字面量判断之后，减少认知负担。
    //    校验顺序同 /api/afk/<name>/cancel、/api/afk/<name>/retry：先 change 名格式、
    //    再 root 信任锚（两侧 resolvePath 规范化再比对注册表）、最后 changeDir 存在性
    //    （ENOENT 前置校验，避免把「change 真不存在」误报成「还没日志」的 200 null）。
    //    读端点本身对齐 /api/config、/api/skills/registry：本机回环 GET 不鉴权。
    const logMatch = /^\/api\/afk\/([^/]+)\/log$/.exec(path)
    if (logMatch) {
      const name = decodeURIComponent(logMatch[1]!)
      if (!name || !/^[a-zA-Z0-9_-]+$/.test(name) || name.includes('..')) {
        return sendJson(res, 400, { ok: false, error: '非法 change 名（仅允许 a-z A-Z 0-9 - _）' })
      }
      const root = new URL(req.url ?? '/', 'http://localhost').searchParams.get('root') ?? ''
      // 信任锚：同 /api/afk/<name>/cancel、/api/afk/<name>/retry 共用的「两侧规范化再比较」模式。
      if (!dedupeRoots(registry()).includes(resolvePath(root))) {
        return sendJson(res, 404, { ok: false, error: 'root 未在机器级项目注册表中' })
      }
      const dir = join(root, 'openspec', 'changes', name)
      // ENOENT 前置校验（同 cancelAfkRun/retryAfkRun 的存在性前置）：change 真不存在时给 400，
      // 不与「change 存在但还没日志」的 200 { log: null } 混为一谈。这里刻意用 400 而非看似更
      // "RESTful" 的 404——三个同由 root+name 寻址的兄弟端点（cancel/retry/log）在这条完全相同
      // 的 !existsSync(.pipeline.yaml) 判断上必须给同一状态码：cancel/retry 经
      // `sendJson(res, result.ok ? 200 : 400, result)` 把这个条件统一收敛成 400（见下方两个
      // handlePost 分支），log 若单独选 404 会让共享这三个端点错误处理逻辑的前端踩坑（review
      // finding）。root 未注册（上面那个分支）仍是 404，因为那是三端点另一个真正统一使用 404
      // 的既有约定，与此处无关。
      if (!existsSync(join(dir, '.pipeline.yaml'))) {
        return sendJson(res, 400, { ok: false, error: '找不到该 change（无 .pipeline.yaml）' })
      }
      return sendJson(res, 200, { log: await readAfkRunLog(dir) })
    }
    // ── loops 治理面数据端：跨项目聚合 loops.yaml ──
    if (path === '/api/loops/snapshot') {
      try {
        const snap = await buildLoopsSnapshot({ registry: () => dedupeRoots(registry()), now: () => new Date(clock()) })
        return sendJson(res, 200, snap)
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: errMsg(e) })
      }
    }
    // ── #34d traffic 查看器数据端：TraceStore.listSessions / readRecords（#34e 只读本地、不外发）──
    if (path === '/api/traces/sessions') {
      if (!traceStore) return sendJson(res, 404, { ok: false, error: 'traces 数据端未装（capabilities.traffic=false）' })
      try {
        return sendJson(res, 200, listTraceSessions(traceStore, clock))
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: errMsg(e) })
      }
    }
    if (path === '/api/traces/records') {
      if (!traceStore) return sendJson(res, 404, { ok: false, error: 'traces 数据端未装（capabilities.traffic=false）' })
      const session = new URL(req.url ?? '/', 'http://localhost').searchParams.get('session')
      if (!session) return sendJson(res, 400, { ok: false, error: '缺 session 查询参数' })
      try {
        return sendJson(res, 200, readTraceRecords(traceStore, session, clock))
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: errMsg(e) })
      }
    }
    // ── M3 config 数据端：Settings 矩阵 tab 的 phase×track 强制 skill 表（GET 只读，本机回环不鉴权）──
    if (path === '/api/config') {
      if (!manifestPath) return sendJson(res, 404, { ok: false, error: 'config 数据端未装（capabilities.config=false）' })
      try {
        return sendJson(res, 200, { ok: true, generated_at: clock(), mandatory_skills: readMandatorySkills(manifestPath) })
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: errMsg(e) })
      }
    }
    // ── skills registry 数据端：本仓 skills 目录 + EXTERNAL-SKILLS.md 合并列表（GET 只读，本机回环不鉴权）──
    if (path === '/api/skills/registry') {
      try {
        return sendJson(res, 200, { skills: listAllSkills(repoRootForSkills()) })
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: errMsg(e) })
      }
    }
    // ── workflow 编辑器（GOAL E8）：GET /api/workflows —— 列出自定义 workflow（排除 default）──
    if (path === '/api/workflows') {
      const root = new URL(req.url ?? '/', 'http://localhost').searchParams.get('root') ?? ''
      if (!dedupeRoots(registry()).includes(resolvePath(root))) {
        return sendJson(res, 404, { ok: false, error: 'root 未在机器级项目注册表中' })
      }
      try {
        return sendJson(res, 200, { names: listWorkflowNames(root) })
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: errMsg(e) })
      }
    }

    // ── workflow 编辑器（GOAL E8）：GET /api/workflows/:name —— 读单个 workflow ──
    // 校验顺序同 /api/afk/<name>/log、/api/afk/<name>/cancel、/api/afk/<name>/retry：
    // 先 name 格式（防路径穿越：拒 '..' 等非法段落入 loadWorkflow 内部的 join），
    // 再 root 信任锚，最后真读+解析。
    const mWfGet = /^\/api\/workflows\/([^/]+)$/.exec(path)
    if (mWfGet) {
      const wfName = decodeURIComponent(mWfGet[1]!)
      if (!wfName || !/^[a-zA-Z0-9_-]+$/.test(wfName) || wfName.includes('..')) {
        return sendJson(res, 400, { ok: false, error: '非法 workflow 名（仅允许 a-z A-Z 0-9 - _）' })
      }
      const root = new URL(req.url ?? '/', 'http://localhost').searchParams.get('root') ?? ''
      if (!dedupeRoots(registry()).includes(resolvePath(root))) {
        return sendJson(res, 404, { ok: false, error: 'root 未在机器级项目注册表中' })
      }
      try {
        return sendJson(res, 200, readWorkflowForApi(root, wfName))
      } catch (e) {
        // 结构化判断（round 2 review fix）：不再对错误信息做子串匹配（loadWorkflow 的校验/
        // 解析错误会把用户自起的 step id / event 名等任意文本原样拼进消息，子串匹配会被
        // 这些文本误导），改用 WorkflowNotFoundError 的类型区分「真不存在」（404）与
        // 「存在但校验/解析失败」（500）。
        return sendJson(res, e instanceof WorkflowNotFoundError ? 404 : 500, { ok: false, error: errMsg(e) })
      }
    }
    return sendJson(res, 404, { ok: false, error: '未知端点' })
  }

  async function handlePost(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
    // (1) DNS-rebinding 守卫
    if (!isLocalHost(req.headers.host, boundPort)) {
      return sendJson(res, 403, { ok: false, error: 'Host header 不合法（疑似 DNS 重绑定攻击）' })
    }
    // (2) B5：所有写端点强制 token 鉴权
    const provided = tokenFromHeaders(req.headers)
    if (!provided || !tokensMatch(provided, token)) {
      return sendJson(res, 401, { ok: false, error: '缺少或无效 token（写端点需鉴权）' })
    }
    // (3) 强制 application/json（借同源策略：跨源 JSON POST 触发预检，本 server 零 CORS 头 → 被阻断）
    const ctype = String(req.headers['content-type'] ?? '').split(';', 1)[0]!.trim().toLowerCase()
    if (ctype !== 'application/json') {
      return sendJson(res, 400, { ok: false, error: '写回端点要求 Content-Type: application/json' })
    }

    // ── M3 config 写端点：全机唯一 manifest.yaml，无 root/name（不是按 Project 分立的资源）──
    if (path === '/api/config/mandatory-skills') {
      if (!manifestPath) return sendJson(res, 404, { ok: false, error: 'config 数据端未装（capabilities.config=false）' })
      const body = await readJsonBody(req)
      const validated = validateMandatorySkillsBody(body)
      if (!validated.ok) return sendJson(res, 400, { ok: false, error: validated.error })
      const { phase, track, skills } = validated.value
      try {
        await writeMandatorySkills(manifestPath, phase, track, skills)
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: errMsg(e) })
      }
      return sendJson(res, 200, { ok: true, phase, track, skills })
    }

    // ── loops 升降档写端点：POST /api/loops/level ──
    if (path === '/api/loops/level') {
      const body = await readJsonBody(req)
      const root = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).root : undefined
      const id = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).id : undefined
      const target = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).target : undefined
      if (typeof root !== 'string' || typeof id !== 'string' || typeof target !== 'string' || !root || !id || !target) {
        return sendJson(res, 400, { ok: false, error: 'root/id/target 必填' })
      }
      // 信任锚：与 /api/change/<name>/transition 同一「两侧规范化再比较」模式——注册表条目
      // （dedupeRoots 已 resolve）与提交的 root（此处同样 resolvePath）都规范化后再比较，
      // 防止「同一路径的非规范写法（如结尾多一个斜杠）」被误判为未注册。
      if (!dedupeRoots(registry()).includes(resolvePath(root))) {
        return sendJson(res, 404, { ok: false, error: 'root 未在机器级项目注册表中' })
      }
      const result = applyLevelChange(root, id, target, { now: new Date(clock()), confirm: true }, REAL_GRADUATION_FS)
      // exitCode 0 = 已应用 或 合法 noop（如目标档已达到，dry-run 语义）；2 = 逻辑拒绝（跨级/
      // 就绪未达标）；3 = 载入/未知 loop/写回错误——只有前者是「请求本身处理成功」，非 0 必须
      // 映射非 2xx，否则前端只看 res.ok 会把一次真实拒绝误当成功（同 cancel/retry 两个兄弟
      // 端点的 `result.ok ? 200 : 400` 处置一致，这里字段名是 exitCode 不是 ok，语义对齐）。
      return sendJson(res, result.exitCode === 0 ? 200 : 400, result)
    }

    // ── workflow 编辑器（GOAL E8）：POST /api/workflows/:name —— 新建/覆盖 ──
    const mWfPost = /^\/api\/workflows\/([^/]+)$/.exec(path)
    if (mWfPost) {
      const wfName = decodeURIComponent(mWfPost[1]!)
      // 防路径穿越（同 GET /api/workflows/:name、/api/afk/<name>/log、/api/afk/<name>/cancel、
      // /api/afk/<name>/retry 共用的 name 校验模式）：写端点比读端点更需要这道门——不挡住的话，
      // 恶意 name 能让 writeWorkflowForApi 内部的 join(dir, `${name}.yaml`) 写到
      // .pipeline/workflows/ 之外的任意文件。必须先于下面的 'default' 检查执行。
      if (!wfName || !/^[a-zA-Z0-9_-]+$/.test(wfName) || wfName.includes('..')) {
        return sendJson(res, 400, { ok: false, error: '非法 workflow 名（仅允许 a-z A-Z 0-9 - _）' })
      }
      if (wfName === 'default') {
        return sendJson(res, 400, { ok: false, error: 'default workflow 不可通过编辑器创建/覆盖（运行时不读这个文件）' })
      }
      const rawBody = await readJsonBody(req)
      // 同 /api/change/<name>/transition 共用的 body 形状校验：空/非对象 body（如空字符串
      // JSON.parse 失败后 readJsonBody 回落的 undefined）若不提前拦，下面的属性访问会直接
      // 抛 TypeError，被最外层 handler.catch 兜成 500——本文件其余写端点（/api/loops/level、
      // /api/afk/<name>/cancel、/api/afk/<name>/retry、/api/change/<name>/transition）都对此
      // 有前置校验，这里补齐保持一致（清晰的 400 而非属性访问抛错的 500）。
      if (typeof rawBody !== 'object' || rawBody === null) {
        return sendJson(res, 400, { ok: false, error: '请求体须为 JSON 对象' })
      }
      const body = rawBody as Record<string, unknown>
      const root = typeof body.root === 'string' ? body.root : ''
      if (!dedupeRoots(registry()).includes(resolvePath(root))) {
        return sendJson(res, 404, { ok: false, error: 'root 未在机器级项目注册表中' })
      }
      try {
        const result = writeWorkflowForApi(root, wfName, body as unknown as WorkflowDef)
        return sendJson(res, result.ok ? 200 : 400, result)
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: errMsg(e) })
      }
    }

    // ── afk-workbench Task 4：POST /api/afk/:name/cancel —— 取消运行中的 automation 任务
    //    （落 .cancel-requested 标记 + docker kill 容器，见 afk.ts::cancelAfkRun）──
    const cancelMatch = /^\/api\/afk\/([^/]+)\/cancel$/.exec(path)
    if (cancelMatch) {
      const name = decodeURIComponent(cancelMatch[1]!)
      // 同 /api/change/<name>/transition 的 change 名校验（防路径穿越：拒 '..' 等非法段落入 join）。
      if (!name || !/^[a-zA-Z0-9_-]+$/.test(name) || name.includes('..')) {
        return sendJson(res, 400, { ok: false, error: '非法 change 名（仅允许 a-z A-Z 0-9 - _）' })
      }
      const body = await readJsonBody(req)
      const root = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).root : undefined
      if (typeof root !== 'string' || !root) {
        return sendJson(res, 400, { ok: false, error: 'root 须为非空字符串' })
      }
      // 信任锚：同 /api/loops/level、/api/change/<name>/transition 共用的「两侧规范化再比较」模式。
      if (!dedupeRoots(registry()).includes(resolvePath(root))) {
        return sendJson(res, 404, { ok: false, error: 'root 未在机器级项目注册表中' })
      }
      const dir = join(root, 'openspec', 'changes', name)
      const result = await cancelAfkRun(store, dir)
      return sendJson(res, result.ok ? 200 : 400, result)
    }

    // ── afk-workbench Task 5：POST /api/afk/:name/retry —— 重试 failed/conflict/paused 任务
    //    （CAS automation→queued + automation_attempts 清零，见 afk.ts::retryAfkRun）──
    const retryMatch = /^\/api\/afk\/([^/]+)\/retry$/.exec(path)
    if (retryMatch) {
      const name = decodeURIComponent(retryMatch[1]!)
      // 同 /api/change/<name>/transition、/api/afk/<name>/cancel 的 change 名校验（防路径穿越：拒 '..' 等非法段落入 join）。
      if (!name || !/^[a-zA-Z0-9_-]+$/.test(name) || name.includes('..')) {
        return sendJson(res, 400, { ok: false, error: '非法 change 名（仅允许 a-z A-Z 0-9 - _）' })
      }
      const body = await readJsonBody(req)
      const root = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).root : undefined
      if (typeof root !== 'string' || !root) {
        return sendJson(res, 400, { ok: false, error: 'root 须为非空字符串' })
      }
      // 信任锚：同 /api/loops/level、/api/change/<name>/transition、/api/afk/<name>/cancel 共用的「两侧规范化再比较」模式。
      if (!dedupeRoots(registry()).includes(resolvePath(root))) {
        return sendJson(res, 404, { ok: false, error: 'root 未在机器级项目注册表中' })
      }
      const dir = join(root, 'openspec', 'changes', name)
      const result = await retryAfkRun(store, dir)
      return sendJson(res, result.ok ? 200 : 400, result)
    }

    const mTr = /^\/api\/change\/([^/]+)\/transition$/.exec(path)
    if (!mTr) return sendJson(res, 404, { ok: false, error: '未知写回端点' })

    const body = await readJsonBody(req)
    if (typeof body !== 'object' || body === null) {
      return sendJson(res, 400, { ok: false, error: '请求体须为 JSON 对象' })
    }
    const b = body as Record<string, unknown>
    const root = b.root
    const event = b.event
    if (typeof root !== 'string' || typeof event !== 'string') {
      return sendJson(res, 400, { ok: false, error: 'root / event 须为字符串' })
    }
    // 信任锚：root 必须是已注册 Project（挡路径穿越到任意目录）——对位老仓 resolve_change_worktree。
    // 统一用 dedupeRoots 规范化（同下面四个写端点），而不是本地重新拼一遍 Set——inline 版本
    // 对注册表里的空字符串条目会解析成 resolvePath('')=cwd 当一个"可信"条目，dedupeRoots 已
    // 显式过滤掉空条目（whole-branch review 抓出的真实不一致，两者对合法注册表行为等价，
    // 仅在这个边界输入上有差异）。
    if (!dedupeRoots(registry()).includes(resolvePath(root))) {
      return sendJson(res, 404, { ok: false, error: 'root 非已知 Project（未注册或不可信）' })
    }
    const name = decodeURIComponent(mTr[1]!)
    const outcome = await performTransition({ store, flow, clock, fileExists, gitHeadSha }, root, name, event)
    return sendJson(res, outcome.code, outcome.body)
  }

  async function handleDelete(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
    // (1)(2) 同 handlePost 的 Host 守卫 + token 鉴权，DELETE 无请求体不需要 Content-Type 校验。
    if (!isLocalHost(req.headers.host, boundPort)) {
      return sendJson(res, 403, { ok: false, error: 'Host header 不合法（疑似 DNS 重绑定攻击）' })
    }
    const provided = tokenFromHeaders(req.headers)
    if (!provided || !tokensMatch(provided, token)) {
      return sendJson(res, 401, { ok: false, error: '缺少或无效 token（写端点需鉴权）' })
    }

    // ── workflow 编辑器（GOAL E8）：DELETE /api/workflows/:name ──
    const mWfDelete = /^\/api\/workflows\/([^/]+)$/.exec(path)
    if (mWfDelete) {
      const wfName = decodeURIComponent(mWfDelete[1]!)
      // 防路径穿越（同 POST /api/workflows/:name、GET /api/workflows/:name 共用的 name 校验
      // 模式）：必须先于下面的 'default' 检查执行——不挡住的话，恶意 name 能让
      // deleteWorkflowForApi 内部的 join(dir, `${name}.yaml`) 删到 .pipeline/workflows/ 之外
      // 的任意文件（DELETE 比 POST 更危险：一次成功调用即不可逆地抹掉目标文件）。
      if (!wfName || !/^[a-zA-Z0-9_-]+$/.test(wfName) || wfName.includes('..')) {
        return sendJson(res, 400, { ok: false, error: '非法 workflow 名（仅允许 a-z A-Z 0-9 - _）' })
      }
      if (wfName === 'default') {
        return sendJson(res, 400, { ok: false, error: 'default workflow 不可通过编辑器删除' })
      }
      const root = new URL(req.url ?? '/', 'http://localhost').searchParams.get('root') ?? ''
      if (!dedupeRoots(registry()).includes(resolvePath(root))) {
        return sendJson(res, 404, { ok: false, error: 'root 未在机器级项目注册表中' })
      }
      try {
        const deleted = deleteWorkflowForApi(root, wfName)
        return sendJson(res, deleted ? 200 : 404, deleted ? { ok: true } : { ok: false, error: `workflow '${wfName}' 不存在` })
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: errMsg(e) })
      }
    }

    return sendJson(res, 404, { ok: false, error: '未知端点' })
  }

  const httpServer: Server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?', 1)[0]!
    const method = req.method ?? 'GET'
    const handler = method === 'GET'
      ? handleGet(req, res, path)
      : method === 'POST'
        ? handlePost(req, res, path)
        : method === 'DELETE'
          ? handleDelete(req, res, path)
          : Promise.resolve(sendJson(res, 405, { ok: false, error: 'method not allowed' }))
    handler.catch((e) => {
      try { sendJson(res, 500, { ok: false, error: errMsg(e) }) } catch { /* 已写头 */ }
    })
  })

  return {
    token,
    version,
    httpServer,
    listen(port = 0, host = '127.0.0.1'): Promise<{ port: number; host: string }> {
      return new Promise((resolve, reject) => {
        const onError = (e: Error): void => reject(e)
        httpServer.once('error', onError)
        httpServer.listen(port, host, () => {
          httpServer.removeListener('error', onError)
          boundPort = (httpServer.address() as AddressInfo).port
          resolve({ port: boundPort, host })
        })
      })
    },
    close(): Promise<void> {
      return new Promise((resolve) => {
        stopPoll()
        for (const res of clients) {
          try { res.end() } catch { /* ignore */ }
        }
        clients.clear()
        httpServer.close(() => resolve())
        ;(httpServer as unknown as { closeAllConnections?: () => void }).closeAllConnections?.()
      })
    },
  }
}
