import { afterEach, describe, expect, it } from 'vitest'
import { rm } from 'node:fs/promises'
import { createDashboardServer } from './server.js'
import { resolveServerPaths } from './paths.js'
import { createOrchestrationLedger, type DevelopmentRequestV2 } from '@tenon/kernel'
import { initChange, makeProject, makeTempHome, newStore, openSSE, reqGet, reqPost, testFlow } from './test-support.js'
import type { DashboardServer } from './types.js'

const open: DashboardServer[] = []
const roots: string[] = []
const now = '2026-09-02T00:00:00.000Z'

afterEach(async () => {
  await Promise.all(open.splice(0).map((server) => server.close()))
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function request(root: string): DevelopmentRequestV2 {
  return {
    schema_version: 'development-request/v2', record_id: 'request:req-1', project_id: 'project-1', change_id: 'change-1',
    revision: 0, correlation_id: 'corr-1', actor: { kind: 'user', id: 'alice' }, created_at: now,
    request_id: 'req-1', intent: `Build a test in ${root}`, interaction_policy: 'recommended-defaults', requested_effects: ['read'],
    constraints: [], user_skills: [], user_mcps: [], auto_select: true,
  }
}

describe('V2 orchestration dashboard HTTP integration', () => {
  it('initializes, appends, reads and streams the same durable revision chain', async () => {
    const root = await makeProject(); roots.push(root)
    await initChange(newStore(), root, 'change-1')
    const home = await makeTempHome(); roots.push(home)
    const server = createDashboardServer({
      paths: resolveServerPaths({ home, env: {} }), token: 'e2e-token', registry: () => [root],
      store: newStore(), flow: testFlow(), clock: () => now, orchestrationLedger: createOrchestrationLedger(),
    })
    open.push(server)
    const { port } = await server.listen(0, '127.0.0.1')
    const initialized = await reqPost(port, '/api/orchestration/changes', { root, project_id: 'project-1', change_id: 'change-1', correlation_id: 'corr-1' }, { headers: { Authorization: 'Bearer e2e-token' } })
    expect(initialized.status).toBe(201)
    const initBody = initialized.json<{ snapshot: { revision: number } }>()
    expect(initBody.snapshot.revision).toBe(0)
    const command = {
      schema_version: 'board-command/v2', command_id: 'cmd-accept', idempotency_key: 'idem-accept', expected_revision: 0,
      actor: { kind: 'user', id: 'alice' }, issued_at: now, correlation_id: 'corr-1', change_id: 'change-1', type: 'accept-request', request: request(root),
    }
    const appended = await reqPost(port, '/api/orchestration/changes/change-1/commands', { root, command }, { headers: { Authorization: 'Bearer e2e-token' } })
    expect(appended.status).toBe(200)
    expect(appended.json<{ snapshot: { revision: number; status: string } }>().snapshot).toMatchObject({ revision: 1, status: 'draft' })
    const read = await reqGet(port, `/api/orchestration/changes/change-1?root=${encodeURIComponent(root)}`)
    expect(read.status).toBe(200)
    expect(read.json<{ snapshot: { revision: number } }>().snapshot.revision).toBe(1)
    const metrics = await reqGet(port, `/api/orchestration/changes/change-1/metrics?root=${encodeURIComponent(root)}`)
    expect(metrics.status).toBe(200)
    expect(metrics.json<{ schema_version: string; revision: number; work_items: { total: number } }>().schema_version).toBe('orchestration-metrics/v1')
    expect(metrics.json<{ work_items: { total: number } }>().work_items.total).toBe(0)
    const stream = await openSSE(port, `/api/orchestration/changes/change-1/stream?root=${encodeURIComponent(root)}&after_revision=0`)
    const snapshotFrame = await stream.waitFor((frame) => frame.event === 'snapshot')
    expect(JSON.parse(snapshotFrame.data)).toMatchObject({ ok: true, snapshot: { revision: 1 } })
    const eventFrame = await stream.waitFor((frame) => frame.event === 'event')
    expect(JSON.parse(eventFrame.data)).toMatchObject({ event_type: 'accept-request', revision: 1 })
    stream.close()
    const unauthorized = await reqPost(port, '/api/orchestration/changes/change-1/commands', { root, command }, { headers: { Authorization: 'Bearer wrong' } })
    expect(unauthorized.status).toBe(401)
  })
})
