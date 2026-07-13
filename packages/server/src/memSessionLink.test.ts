/**
 * memSessionLink.test —— v9-I GET /api/mem/session-link 真 HTTP 端到端（GOAL C9：零 mock）。
 * 真起 http server（listen(0)）+ 真建带 automation_worktree 的 change（kernel StateStore 真落盘）
 * + 真写 claude/codex 会话 fixture 树（nodeMemFs(fakeHome) 注入，hermetic 不碰真 ~/.claude）
 * → 真 node:http GET → 断言 found 三态 / resumeCmd 拼法 / 校验顺序（400/404 先例对齐）。
 *
 * 能力边界（端点如实返回，测试如实钉住）：
 *   · claude → `cd "<dir>" && claude --resume <sid>`；codex → `cd "<dir>" && codex resume <sid>`
 *     （二者拼法宿主机 --help 实测确认）；其余平台 resumeCmd:null（不造假命令）。
 *   · 查不到会话恒 200 { found:false, reason }——AFK 沙箱 claude 会话随容器 HOME=/tmp 销毁，
 *     宿主机查不到是常态不是错误。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { nodeMemFs } from '@pipeline-lite/kernel'
import { createDashboardServer } from './server.js'
import type { DashboardServer } from './types.js'
import { initChange, makeProject, makeTempHome, makeWorktreeDir, newStore, reqGet, testFlow } from './test-support.js'

const openServers: DashboardServer[] = []
afterEach(async () => {
  while (openServers.length) await openServers.pop()!.close()
})

/** 真写一个 claude 会话 fixture：<home>/.claude/projects/<dirName>/<sid>.jsonl（首事件带 cwd）。 */
async function writeClaudeSession(home: string, dirName: string, sid: string, cwd: string): Promise<string> {
  const dir = join(home, '.claude', 'projects', dirName)
  await mkdir(dir, { recursive: true })
  const file = join(dir, `${sid}.jsonl`)
  const evt = { type: 'user', cwd, timestamp: '2026-07-10T00:00:00Z', message: { role: 'user', content: 'hi' } }
  await writeFile(file, `${JSON.stringify(evt)}\n`, 'utf8')
  return file
}

/** 真写一个 codex 会话 fixture：<home>/.codex/sessions/2026/07/rollout-…-<n>.jsonl（首行 payload meta）。 */
async function writeCodexSession(home: string, sid: string, cwd: string): Promise<string> {
  const dir = join(home, '.codex', 'sessions', '2026', '07')
  await mkdir(dir, { recursive: true })
  const file = join(dir, `rollout-2026-07-12T10-00-00-${sid}.jsonl`)
  const first = { timestamp: '2026-07-12T10:00:00.000Z', payload: { id: sid, cwd } }
  await writeFile(file, `${JSON.stringify(first)}\n`, 'utf8')
  return file
}

interface Harness {
  port: number
  root: string
  home: string
}

/** 真建 server + 一批 change（可带 automation_worktree），mem 根指向独立 fixture home。 */
async function startWith(changes: Record<string, { worktree?: string }>): Promise<Harness> {
  const store = newStore()
  const root = await makeProject()
  const home = await makeTempHome()
  for (const [name, cfg] of Object.entries(changes)) {
    await initChange(store, root, name)
    if (cfg.worktree !== undefined) {
      await store.set(join(root, 'openspec', 'changes', name), 'automation_worktree' as never, cfg.worktree)
    }
  }
  const srv = createDashboardServer({
    version: '9.9.9', token: 't', registry: () => [root], store, flow: testFlow(),
    clock: () => '2026-07-13T00:00:00Z', memFs: nodeMemFs(home),
  })
  openServers.push(srv)
  const { port } = await srv.listen(0, '127.0.0.1')
  return { port, root, home }
}

function linkPath(root: string, name: string): string {
  return `/api/mem/session-link?root=${encodeURIComponent(root)}&name=${encodeURIComponent(name)}`
}

describe('GET /api/mem/session-link —— found 三态', () => {
  it('claude 会话命中 worktree：found:true + `claude --resume` 恢复命令', async () => {
    const wt = await makeWorktreeDir()
    const h = await startWith({ hotfix: { worktree: wt } })
    const sid = 'aaaabbbb-1111-2222-3333-444455556666'
    await writeClaudeSession(h.home, 'proj-a', sid, wt)

    const r = await reqGet(h.port, linkPath(h.root, 'hotfix'))
    expect(r.status).toBe(200)
    const j = r.json<any>()
    expect(j.found).toBe(true)
    expect(j.platform).toBe('claude')
    expect(j.sessionId).toBe(sid)
    expect(j.dir).toBe(wt)
    expect(j.resumeCmd).toBe(`cd "${wt}" && claude --resume ${sid}`)
    expect(typeof j.mtime).toBe('string')
  })

  it('codex 会话命中 worktree：resumeCmd 用 `codex resume <id>` 拼法', async () => {
    const wt = await makeWorktreeDir()
    const h = await startWith({ cdx: { worktree: wt } })
    await writeCodexSession(h.home, 'cdx-uuid-1', wt)

    const j = (await reqGet(h.port, linkPath(h.root, 'cdx'))).json<any>()
    expect(j.found).toBe(true)
    expect(j.platform).toBe('codex')
    expect(j.sessionId).toBe('cdx-uuid-1')
    expect(j.resumeCmd).toBe(`cd "${wt}" && codex resume cdx-uuid-1`)
  })

  it('同 cwd 多会话取最近（mtime 倒序首条）', async () => {
    const wt = await makeWorktreeDir()
    const h = await startWith({ multi: { worktree: wt } })
    const oldFile = await writeClaudeSession(h.home, 'proj-m', 'old-session-id-0000', wt)
    await writeClaudeSession(h.home, 'proj-m', 'new-session-id-9999', wt)
    const past = new Date('2026-07-01T00:00:00Z')
    await utimes(oldFile, past, past) // 旧会话 mtime 拨回，新会话必须排前

    const j = (await reqGet(h.port, linkPath(h.root, 'multi'))).json<any>()
    expect(j.found).toBe(true)
    expect(j.sessionId).toBe('new-session-id-9999')
  })

  it('automation_worktree 未设 → 回落 root 目录查（本机直跑会话）', async () => {
    const h = await startWith({ plain: {} }) // init 后 worktree 为空串
    const sid = 'root-session-id-1234'
    await writeClaudeSession(h.home, 'proj-r', sid, h.root)

    const j = (await reqGet(h.port, linkPath(h.root, 'plain'))).json<any>()
    expect(j.found).toBe(true)
    expect(j.sessionId).toBe(sid)
    expect(j.dir).toBe(h.root)
  })

  it('查不到任何会话：恒 200 found:false + reason（不是错误——AFK 沙箱会话随容器销毁是常态）', async () => {
    const wt = await makeWorktreeDir()
    const h = await startWith({ ghost: { worktree: wt } })

    const r = await reqGet(h.port, linkPath(h.root, 'ghost'))
    expect(r.status).toBe(200)
    const j = r.json<any>()
    expect(j.found).toBe(false)
    expect(j.dir).toBe(wt)
    expect(j.reason).toBe('no-session')
    expect(j.resumeCmd).toBeUndefined()
  })
})

describe('GET /api/mem/session-link —— 校验顺序（400/404 先例对齐）', () => {
  it('非法 change 名 → 400（先于 root 校验）', async () => {
    const h = await startWith({ ok: {} })
    const r = await reqGet(h.port, `/api/mem/session-link?root=${encodeURIComponent(h.root)}&name=${encodeURIComponent('../evil')}`)
    expect(r.status).toBe(400)
  })

  it('缺 root 参数 → 400', async () => {
    const h = await startWith({ ok: {} })
    const r = await reqGet(h.port, '/api/mem/session-link?name=ok')
    expect(r.status).toBe(400)
    expect(r.json<any>().error).toContain('root')
  })

  it('root 未注册 → 404（信任锚，同 /api/change/:name/history 先例）', async () => {
    const h = await startWith({ ok: {} })
    const evil = await makeProject()
    const r = await reqGet(h.port, linkPath(evil, 'ok'))
    expect(r.status).toBe(404)
  })

  it('change 不存在（无 .pipeline.yaml）→ 400（三兄弟端点统一状态码约定）', async () => {
    const h = await startWith({ ok: {} })
    const r = await reqGet(h.port, linkPath(h.root, 'nope'))
    expect(r.status).toBe(400)
  })

  it('伪造 Host 头 → 403（DNS 重绑定守卫统一施加）', async () => {
    const h = await startWith({ ok: {} })
    const r = await reqGet(h.port, linkPath(h.root, 'ok'), '127.0.0.1', { Host: 'evil.com' })
    expect(r.status).toBe(403)
  })
})
