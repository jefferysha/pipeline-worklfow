import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDashboardServer } from './server.js'
import { resolveServerPaths } from './paths.js'
import {
  resolveHostTargetPlanRoute,
  type HostTargetPlanRouteDeps,
} from './serverGetHostTargetPlanRoutes.js'
import {
  makeTempHome,
  reqGet,
  testFlow,
} from './test-support.js'
import type { DashboardServer } from './types.js'
import type { PipelineCliRunner } from './operations.js'

const CODEX_TARGET = {
  id: 'codex',
  kind: 'native',
  cli_flag: '--codex',
  target_scope: 'user',
  supported_operations: ['setup', 'update'],
  capabilities: ['native-marketplace', 'managed-runtime', 'bundled-skills', 'automatic-update'],
} as const

const HOST_IDS = [
  'codex', 'claude', 'cursor', 'gemini', 'copilot', 'pi',
  'devin', 'zed', 'aider', 'continue', 'cline', 'amp',
] as const

const CATALOG = {
  schema_version: 'host-target-plan/v1',
  targets: HOST_IDS.map((id) => {
    const native = id === 'codex' || id === 'claude'
    return {
      id,
      kind: native ? 'native' : 'adapter',
      cli_flag: `--${id}`,
      target_scope: native ? 'user' : 'project',
      supported_operations: ['setup', 'update'],
      capabilities: native
        ? ['native-marketplace', 'managed-runtime', 'bundled-skills', 'automatic-update']
        : ['project-adapter', 'managed-runtime', 'bundled-skills'],
    }
  }),
} as const

const PLAN = {
  schema_version: 'host-target-plan/v1',
  side_effects: 'none',
  host: CODEX_TARGET,
  operation: 'update',
  command: {
    executable: 'tenon',
    args: ['update', '--codex'],
    display: 'tenon update --codex',
  },
  steps: [{
    id: 'marketplace-refresh',
    label: 'host-plan.step.marketplace-refresh',
    command: {
      executable: 'codex',
      args: ['plugin', 'marketplace', 'update', 'tenon'],
      display: 'codex plugin marketplace update tenon',
    },
  }, {
    id: 'plugin-update',
    label: 'host-plan.step.plugin-update',
    command: {
      executable: 'codex',
      args: ['plugin', 'update', 'tenon@tenon', '--json'],
      display: 'codex plugin update tenon@tenon --json',
    },
  }, {
    id: 'plugin-inventory',
    label: 'host-plan.step.plugin-inventory',
    command: {
      executable: 'codex',
      args: ['plugin', 'list', '--json'],
      display: 'codex plugin list --json',
    },
  }, {
    id: 'managed-runtime',
    label: 'host-plan.step.managed-runtime',
    command: null,
  }, {
    id: 'bundled-skills',
    label: 'host-plan.step.bundled-skills',
    command: null,
  }, {
    id: 'runtime-readiness',
    label: 'host-plan.step.runtime-readiness',
    command: null,
  }],
  notices: [
    'host-plan.notice.read-only-generation',
    'host-plan.notice.manual-command-has-effects',
  ],
} as const

function jsonResult(value: unknown): { exitCode: number; stdout: string; stderr: string } {
  return { exitCode: 0, stdout: JSON.stringify(value), stderr: '' }
}

function deps(
  runner: PipelineCliRunner,
  operationsAvailable = true,
): HostTargetPlanRouteDeps {
  return {
    hostHome: '/host/home',
    operationsAvailable,
    operationRunner: runner,
  }
}

const openServers: DashboardServer[] = []
afterEach(async () => {
  while (openServers.length > 0) await openServers.pop()?.close()
})

async function start(runner: PipelineCliRunner): Promise<{ port: number }> {
  const hostHome = await makeTempHome()
  const srv = createDashboardServer({
    paths: resolveServerPaths({ home: hostHome, env: {} }),
    hostHome,
    registry: () => [],
    flow: testFlow(),
    runPipelineCli: runner,
  })
  openServers.push(srv)
  const { port } = await srv.listen(0, '127.0.0.1')
  return { port }
}

describe('Host Target Plan route resolver', () => {
  it('maps catalog and plan requests to fixed CLI argv and returns strictly decoded DTOs', async () => {
    const runner = vi.fn<PipelineCliRunner>(async (_root, args) =>
      jsonResult(args.includes('--host') ? PLAN : CATALOG))

    const catalog = await resolveHostTargetPlanRoute('/api/host-targets', '/api/host-targets', deps(runner))
    expect(catalog).toEqual({ status: 200, body: CATALOG })
    expect(runner).toHaveBeenNthCalledWith(1, '/host/home', ['host-target-plan', '--json'])

    const plan = await resolveHostTargetPlanRoute(
      '/api/host-target-plan?host=codex&operation=update',
      '/api/host-target-plan',
      deps(runner),
    )
    expect(plan).toEqual({ status: 200, body: PLAN })
    expect(runner).toHaveBeenNthCalledWith(
      2,
      '/host/home',
      ['host-target-plan', '--host', 'codex', '--operation', 'update', '--json'],
    )
  })

  it.each([
    '/api/host-targets?extra=1',
    '/api/host-target-plan',
    '/api/host-target-plan?host=&operation=setup',
    '/api/host-target-plan?host=codex',
    '/api/host-target-plan?operation=setup',
    '/api/host-target-plan?host=codex&host=claude&operation=setup',
    '/api/host-target-plan?host=codex&operation=setup&operation=update',
    '/api/host-target-plan?host=unknown&operation=setup',
    '/api/host-target-plan?host=codex&operation=remove',
    '/api/host-target-plan?host=codex&operation=setup&root=%2Ftmp',
  ])('rejects invalid query before invoking the runner: %s', async (url) => {
    const runner = vi.fn<PipelineCliRunner>()
    const path = url.split('?', 1)[0] ?? url
    const result = await resolveHostTargetPlanRoute(url, path, deps(runner))

    expect(result).toEqual({
      status: 400,
      body: {
        ok: false,
        code: 'HOST_TARGET_QUERY_INVALID',
        error: '宿主计划查询参数无效',
      },
    })
    expect(runner).not.toHaveBeenCalled()
  })

  it('returns a stable 503 without invoking the runner when the CLI is unavailable', async () => {
    const runner = vi.fn<PipelineCliRunner>()
    const result = await resolveHostTargetPlanRoute(
      '/api/host-targets',
      '/api/host-targets',
      deps(runner, false),
    )

    expect(result).toEqual({
      status: 503,
      body: {
        ok: false,
        code: 'HOST_TARGET_PLAN_UNAVAILABLE',
        error: '宿主计划功能当前不可用',
      },
    })
    expect(runner).not.toHaveBeenCalled()
  })

  it.each([
    { name: 'nonzero CLI', run: async () => ({ exitCode: 9, stdout: '', stderr: '/secret/path token=abc' }) },
    { name: 'non-JSON output', run: async () => ({ exitCode: 0, stdout: 'not json', stderr: '' }) },
    { name: 'wrong schema', run: async () => jsonResult({ ...CATALOG, schema_version: 'host-target-plan/v2' }) },
    { name: 'unknown top-level key', run: async () => jsonResult({ ...CATALOG, internal_path: '/secret/path' }) },
    { name: 'unknown target', run: async () => jsonResult({
      ...CATALOG,
      targets: [{ ...CODEX_TARGET, id: 'foo', cli_flag: '--foo' }, ...CATALOG.targets.slice(1)],
    }) },
    { name: 'missing target', run: async () => jsonResult({ ...CATALOG, targets: CATALOG.targets.slice(0, -1) }) },
    { name: 'duplicate target', run: async () => jsonResult({
      ...CATALOG,
      targets: [CODEX_TARGET, CODEX_TARGET, ...CATALOG.targets.slice(2)],
    }) },
    { name: 'invalid capability', run: async () => jsonResult({
      ...CATALOG,
      targets: [{ ...CODEX_TARGET, capabilities: ['shell-access'] }, ...CATALOG.targets.slice(1)],
    }) },
    { name: 'runner rejection', run: async () => { throw new Error('/secret/path token=abc') } },
  ])('maps $name to a redacted stable 502', async ({ run }) => {
    const result = await resolveHostTargetPlanRoute(
      '/api/host-targets',
      '/api/host-targets',
      deps(run),
    )

    expect(result).toEqual({
      status: 502,
      body: {
        ok: false,
        code: 'HOST_TARGET_PLAN_INVALID',
        error: '宿主计划响应无效',
      },
    })
    expect(JSON.stringify(result)).not.toContain('/secret/path')
    expect(JSON.stringify(result)).not.toContain('token=abc')
  })

  it.each([
    { name: 'host does not match query', value: { ...PLAN, host: { ...CODEX_TARGET, id: 'claude', cli_flag: '--claude' } } },
    { name: 'operation does not match query', value: { ...PLAN, operation: 'setup' } },
    { name: 'side effects are not none', value: { ...PLAN, side_effects: 'writes-files' } },
    { name: 'command has an extra key', value: { ...PLAN, command: { ...PLAN.command, cwd: '/secret/path' } } },
    { name: 'step has an extra key', value: { ...PLAN, steps: [{ ...PLAN.steps[0], detail: 'internal' }] } },
    { name: 'duplicate step ids', value: { ...PLAN, steps: [PLAN.steps[0], PLAN.steps[0]] } },
    { name: 'unknown step label token', value: { ...PLAN, steps: [{ ...PLAN.steps[0], label: 'Update plugin' }, ...PLAN.steps.slice(1)] } },
    { name: 'unknown notice token', value: { ...PLAN, notices: ['preview-only'] } },
  ])('strictly rejects a malformed plan: $name', async ({ value }) => {
    const runner = vi.fn<PipelineCliRunner>(async () => jsonResult(value))
    const result = await resolveHostTargetPlanRoute(
      '/api/host-target-plan?host=codex&operation=update',
      '/api/host-target-plan',
      deps(runner),
    )

    expect(result?.status).toBe(502)
    expect(result?.body).toEqual({
      ok: false,
      code: 'HOST_TARGET_PLAN_INVALID',
      error: '宿主计划响应无效',
    })
  })

  it('ignores unrelated paths', async () => {
    const runner = vi.fn<PipelineCliRunner>()
    await expect(resolveHostTargetPlanRoute('/api/health', '/api/health', deps(runner))).resolves.toBeNull()
    expect(runner).not.toHaveBeenCalled()
  })
})

describe('Host Target Plan server assembly', () => {
  it('serves both read-only APIs through the real GET router', async () => {
    const runner = vi.fn<PipelineCliRunner>(async (_root, args) =>
      jsonResult(args.includes('--host') ? PLAN : CATALOG))
    const { port } = await start(runner)

    const catalog = await reqGet(port, '/api/host-targets')
    expect(catalog.status).toBe(200)
    expect(catalog.json()).toEqual(CATALOG)

    const plan = await reqGet(port, '/api/host-target-plan?host=codex&operation=update')
    expect(plan.status).toBe(200)
    expect(plan.json()).toEqual(PLAN)
  })

  it('inherits the unified GET Host guard before the runner', async () => {
    const runner = vi.fn<PipelineCliRunner>(async () => jsonResult(CATALOG))
    const { port } = await start(runner)

    const response = await reqGet(port, '/api/host-targets', '127.0.0.1', { Host: 'evil.example.com' })
    expect(response.status).toBe(403)
    expect(runner).not.toHaveBeenCalled()
  })
})
