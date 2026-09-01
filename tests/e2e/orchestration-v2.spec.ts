import { join } from 'node:path'
import { rm } from 'node:fs/promises'
import { test, expect } from 'playwright/test'
import { createOrchestrationLedger } from '@tenon/kernel'
import { createDashboardServer } from '../../packages/server/src/server.js'
import { resolveServerPaths } from '../../packages/server/src/paths.js'
import { initChange, makeProject, makeTempHome, newStore, testFlow } from '../../packages/server/src/test-support.js'
import type { DashboardServer } from '../../packages/server/src/types.js'

let server: DashboardServer
let root: string
let home: string
let port: number
const change = 'e2e-change'

test.beforeAll(async () => {
  root = await makeProject()
  home = await makeTempHome()
  const store = newStore()
  await initChange(store, root, change)
  await createOrchestrationLedger().initialize(join(root, 'openspec', 'changes', change), { project_id: 'project-e2e', change_id: change, correlation_id: 'corr-e2e', updated_at: '2026-09-02T00:00:00.000Z' })
  server = createDashboardServer({
    paths: resolveServerPaths({ home, env: {} }), token: 'e2e-token', registry: () => [root], store, flow: testFlow(),
    webRoot: join(process.cwd(), 'packages/dashboard-app/dist'), orchestrationLedger: createOrchestrationLedger(),
  })
  const address = await server.listen(0, '127.0.0.1')
  port = address.port
})

test.afterAll(async () => {
  await server.close()
  await Promise.all([rm(root, { recursive: true, force: true }), rm(home, { recursive: true, force: true })])
})

test('renders the real V2 board and consumes the durable snapshot stream', async ({ page }) => {
  await page.goto(`http://127.0.0.1:${port}/?view=progress&root=${encodeURIComponent(root)}&change=${change}`)
  await expect(page.getByTestId('progress-view')).toBeVisible()
  await expect(page.getByTestId('orchestration-v2-panel')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('orchestration-v2-status')).toHaveText('draft')
  await expect(page.getByTestId('orchestration-v2-revision')).toHaveText('rev 0')
  await expect(page.getByRole('button', { name: /刷新编排|Refresh orchestration/ })).toBeVisible()
})
