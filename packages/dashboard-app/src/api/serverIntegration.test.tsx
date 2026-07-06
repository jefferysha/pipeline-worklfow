// @vitest-environment node
/**
 * 真 fetch server 集成（GOAL C9 真实证据链）——起真 dashboard server 实例：
 *   真 createStateStore/createFlowEngine/loadManifest（kernel）+ 真临时 fs + 真 node:http + 真 token。
 * 断言：GET /api/snapshot 真形状喂进本前端 selectInbox 选卡正确；POST transition 带 token 真改盘 →
 * 快照真变、change 真进入复核相位、收件箱据此真出现该卡。非 mock 返回。
 */
import { describe, it, expect, afterAll } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDashboardServer } from '@pipeline-lite/server'
import { createFlowEngine, createStateStore, loadManifest } from '@pipeline-lite/kernel'
import { selectInbox } from '../inbox/inbox'
import type { Snapshot } from '../types'

const manifestPath = fileURLToPath(new URL('../../../../templates/manifest.yaml', import.meta.url))
const clock = (): string => '2026-07-07T00:00:00Z'

interface Started {
  port: number
  root: string
  token: string
  close: () => Promise<void>
}

async function startRealServer(): Promise<Started> {
  const root = await mkdtemp(join(tmpdir(), 'pl-dash-it-'))
  const store = createStateStore()
  const flow = createFlowEngine(loadManifest(manifestPath))
  await store.init({ repoRoot: root, name: 'demo', track: 'backend', preset: 'full', clock })
  const srv = createDashboardServer({
    version: 'itest',
    token: 'itest-token',
    registry: () => [root],
    store,
    flow,
    clock,
  })
  const { port } = await srv.listen(0, '127.0.0.1')
  return { port, root, token: srv.token, close: () => srv.close() }
}

const started = await startRealServer()
afterAll(() => started.close())

function url(path: string): string {
  return `http://127.0.0.1:${started.port}${path}`
}

describe('真 server /api/snapshot → 前端 selectInbox', () => {
  it('GET 返回真 Snapshot 形状（含 capabilities/projects）', async () => {
    const res = await fetch(url('/api/snapshot'))
    expect(res.status).toBe(200)
    const snap = (await res.json()) as Snapshot
    expect(snap.capabilities.snapshot).toBe(true)
    expect(snap.projects.map((p) => p.root)).toContain(started.root)
    const demo = snap.projects[0]!.changes.find((c) => c.name === 'demo')
    expect(demo?.phase).toBe('open')
    // open 非复核相位 → 收件箱空
    expect(selectInbox(snap)).toEqual([])
  })

  it('POST transition 带 token 真改盘 → change 进 explore（复核相位）→ 收件箱真出现该卡', async () => {
    const post = await fetch(url('/api/change/demo/transition'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${started.token}` },
      body: JSON.stringify({ root: started.root, event: 'open-complete' }),
    })
    expect(post.status).toBe(200)

    const snap = (await (await fetch(url('/api/snapshot'))).json()) as Snapshot
    const demo = snap.projects[0]!.changes.find((c) => c.name === 'demo')
    expect(demo?.phase).toBe('explore')
    const inbox = selectInbox(snap)
    expect(inbox.map((i) => i.change.name)).toContain('demo')
  })

  it('POST 无 token → 401（B5 写端点鉴权，前端必须带同源注入 token）', async () => {
    const res = await fetch(url('/api/change/demo/transition'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ root: started.root, event: 'explore-complete' }),
    })
    expect(res.status).toBe(401)
  })
})
