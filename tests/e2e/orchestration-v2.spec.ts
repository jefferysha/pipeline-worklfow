import { join } from 'node:path'
import { rm } from 'node:fs/promises'
import { test, expect } from 'playwright/test'
import { createOrchestrationLedger } from '@tenon/kernel'
import { createDashboardServer } from '../../packages/server/src/server.js'
import { resolveServerPaths } from '../../packages/server/src/paths.js'
import { initChange, makeProject, makeTempHome, newStore, testFlow } from '../../packages/server/src/test-support.js'
import { createAutonomousOrchestratorV2 } from '../../packages/automation/src/orchestration/autonomous-orchestrator-v2.js'
import type { DevelopmentRequestV2, RepositoryContextV2 } from '@tenon/kernel'
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
  const changeDir = join(root, 'openspec', 'changes', change)
  await createOrchestrationLedger().initialize(changeDir, { project_id: 'project-e2e', change_id: change, correlation_id: 'corr-e2e', updated_at: '2026-09-02T00:00:00.000Z' })
  const request: DevelopmentRequestV2 = {
    schema_version: 'development-request/v2', record_id: 'request:e2e', project_id: 'project-e2e', change_id: change, revision: 0,
    correlation_id: 'corr-e2e', actor: { kind: 'user', id: 'e2e' }, created_at: '2026-09-02T00:00:00.000Z', request_id: 'request-e2e',
    intent: 'Build a TypeScript API and run tests', interaction_policy: 'recommended-defaults', requested_effects: ['read', 'write'], constraints: [], user_skills: [], user_mcps: [], auto_select: true,
  }
  const context: RepositoryContextV2 = {
    schema_version: 'repository-context/v2', record_id: 'context:e2e', project_id: 'project-e2e', change_id: change, revision: 1,
    correlation_id: 'corr-e2e', actor: { kind: 'system', id: 'e2e-host' }, created_at: '2026-09-02T00:00:00.000Z', request_id: 'request-e2e',
    repository: { ref: 'e2e', branch: 'main', base_branch: 'main', head_sha: 'abc', dirty: false }, workspace_fingerprint: `sha256:${'1'.repeat(64)}`,
    policy_digest: `sha256:${'2'.repeat(64)}`, skill_catalog_digest: `sha256:${'3'.repeat(64)}`, mcp_catalog_digest: `sha256:${'4'.repeat(64)}`, observed_facts: [],
  }
  const outcome = await createAutonomousOrchestratorV2({
    change_dir: changeDir, request, context, catalog: { skills: [
      { id: 'api', version: '1.0.0', source: 'builtin', availability: 'available', capabilities: ['backend.api'], supports_parallel: false, permissions: ['repo.write'], resource_claims: [], output_schema_id: 'api/output-v1', validators: [] },
      { id: 'tests', version: '1.0.0', source: 'builtin', availability: 'available', capabilities: ['test.run'], supports_parallel: false, permissions: ['repo.read'], resource_claims: [], output_schema_id: 'test/report-v1', validators: [] },
    ], mcps: [], allowed_permissions: ['repo.read', 'repo.write'] }, worker_id: 'e2e-worker',
    executor: { async execute(input) { const child = await import('node:child_process').then(({ execFile }) => new Promise<{ stdout: string }>((resolve, reject) => execFile(process.execPath, ['-e', "process.stdout.write(JSON.stringify({ok:true}))"], { encoding: 'utf8' }, (error, stdout) => error ? reject(error) : resolve({ stdout })))) ; return { output: child.stdout, artifacts: [], diagnostics: [`executed:${input.skill_id}`] } } },
    validator: { async validate(input) { return { status: 'pass', checks: [], target_digests: [], evidence_refs: [`run:${input.run_id}`] } } },
    id_factory: (() => { let n = 0; return (prefix: string) => `${prefix}:e2e:${++n}` })(), retry: { max_attempts: 1, max_parallel: 2 }, clock: () => '2026-09-02T00:00:00.000Z',
  }).run()
  if (!outcome.ok) throw new Error(`real e2e orchestration failed: ${outcome.issues.join(',')}`)
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
  await expect(page.getByTestId('orchestration-v2-status')).toHaveText('completed')
  await expect(page.getByTestId('orchestration-v2-pipeline')).toBeVisible()
  await expect(page.getByTestId('orchestration-v2-pipeline')).toContainText('default@auto-v2')
  await expect(page.getByTestId('orchestration-v2-pipeline')).toContainText('backend')
  await expect(page.getByTestId('orchestration-v2-pipeline')).toContainText('api@1.0.0')
  await expect(page.getByTestId('orchestration-v2-pipeline')).toContainText('tests@1.0.0')
  await expect(page.getByRole('button', { name: /刷新编排|Refresh orchestration/ })).toBeVisible()
})

test('renders the cross-terminal adapter picker and completes a real dry-run state stream', async ({ page }) => {
  await page.goto(`http://127.0.0.1:${port}/?view=hostPlan&root=${encodeURIComponent(root)}`)
  await expect(page.getByTestId('adapter-install-wizard')).toBeVisible({ timeout: 15_000 })
  const cursor = page.getByTestId('adapter-install-wizard').getByText('Cursor', { exact: true })
  await expect(cursor).toBeVisible()
  await cursor.click()
  await page.getByRole('button', { name: /预检|Preflight/ }).click()
  await expect(page.getByTestId('adapter-install-wizard')).toContainText('planned', { timeout: 15_000 })
})

test('reconciles a newly saved custom Workflow into an already-open Change dialog', async ({ page }) => {
  await page.goto(`http://127.0.0.1:${port}/?view=progress&root=${encodeURIComponent(root)}&change=${change}`)
  await page.getByTestId('prg9-scrim').click({ position: { x: 4, y: 4 } })
  await expect(page.getByTestId('prg9-drawer')).toBeHidden()
  await page.getByTestId('progress-new-change').click()
  await page.getByTestId('change-intent').fill('Build a stable API endpoint')
  await expect(page.getByTestId('route-winner')).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('route-candidate-chat').click()

  const token = await page.evaluate(() => window.__TENON_DASHBOARD_TOKEN__ ?? '')
  const response = await page.evaluate(async ({ projectRoot, authToken }) => {
    const body = {
      root: projectRoot,
      name: 'realtime-flow',
      steps: [
        { id: 'intake', label: 'intake', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [{ event: 'complete', to: 'done' }] },
        { id: 'done', label: 'done', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
      ],
    }
    const result = await fetch('/api/workflows/realtime-flow', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` }, body: JSON.stringify(body),
    })
    return result.status
  }, { projectRoot: root, authToken: token })
  expect(response).toBe(200)
  await expect.poll(async () => page.evaluate(async ({ projectRoot }) => {
    const result = await fetch(`/api/catalog?root=${encodeURIComponent(projectRoot)}`)
    const body = await result.json() as { workflows?: Array<{ id: string }> }
    return body.workflows?.some((workflow) => workflow.id === 'realtime-flow') ?? false
  }, { projectRoot: root })).toBe(true)
  await expect.poll(async () => page.getByTestId('change-workflow').locator('option').allTextContents(), { timeout: 15_000 }).toContain('realtime-flow')
})
