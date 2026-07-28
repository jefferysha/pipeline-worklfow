import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDashboardServer } from './server.js'
import { resolveServerPaths } from './paths.js'
import {
  createHostTargetPlanRuntime,
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
      args: ['plugin', 'marketplace', 'upgrade', 'tenon', '--json'],
      display: 'codex plugin marketplace upgrade tenon --json',
    },
  }, {
    id: 'plugin-update',
    label: 'host-plan.step.plugin-update',
    command: {
      executable: 'codex',
      args: ['plugin', 'add', 'tenon@tenon', '--json'],
      display: 'codex plugin add tenon@tenon --json',
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

type HostId = (typeof HOST_IDS)[number]
type Operation = 'setup' | 'update'

function planCommand(executable: string, args: readonly string[]) {
  return { executable, args: [...args], display: [executable, ...args].join(' ') }
}

const NATIVE_COMMANDS = {
  codex: {
    setup: [
      planCommand('codex', ['plugin', 'marketplace', 'add', 'jefferysha/tenon', '--ref', 'main']),
      planCommand('codex', ['plugin', 'add', 'tenon@tenon', '--json']),
      planCommand('codex', ['plugin', 'list', '--json']),
    ],
    update: [
      planCommand('codex', ['plugin', 'marketplace', 'upgrade', 'tenon', '--json']),
      planCommand('codex', ['plugin', 'add', 'tenon@tenon', '--json']),
      planCommand('codex', ['plugin', 'list', '--json']),
    ],
  },
  claude: {
    setup: [
      planCommand('claude', ['plugin', 'marketplace', 'add', 'jefferysha/tenon']),
      planCommand('claude', ['plugin', 'install', 'tenon@tenon']),
      planCommand('claude', ['plugin', 'list', '--json']),
    ],
    update: [
      planCommand('claude', ['plugin', 'marketplace', 'update', 'tenon']),
      planCommand('claude', ['plugin', 'update', 'tenon@tenon']),
      planCommand('claude', ['plugin', 'list', '--json']),
    ],
  },
} as const

function planFor(host: HostId, operation: Operation) {
  const target = CATALOG.targets.find((candidate) => candidate.id === host)
  if (target === undefined) throw new Error(`missing test target ${host}`)
  const native = host === 'codex' || host === 'claude'
  const command = planCommand(
    'tenon',
    native ? [operation, `--${host}`] : [operation, `--${host}`, '--target', '<project>'],
  )
  const nativeIds = operation === 'setup'
    ? ['marketplace-register', 'plugin-install', 'plugin-inventory']
    : ['marketplace-refresh', 'plugin-update', 'plugin-inventory']
  const steps = native
    ? NATIVE_COMMANDS[host][operation].map((stepCommand, index) => {
        const id = nativeIds[index]
        if (id === undefined) throw new Error('missing native test step id')
        return { id, label: `host-plan.step.${id}`, command: stepCommand }
      })
    : [
        { id: 'package-assets', label: 'host-plan.step.package-assets', command: null },
        { id: 'managed-runtime', label: 'host-plan.step.managed-runtime', command: null },
        { id: 'adapter-deploy', label: 'host-plan.step.adapter-deploy', command },
      ]
  if (native) {
    steps.push({ id: 'managed-runtime', label: 'host-plan.step.managed-runtime', command: null })
  }
  steps.push(
    { id: 'bundled-skills', label: 'host-plan.step.bundled-skills', command: null },
    { id: 'runtime-readiness', label: 'host-plan.step.runtime-readiness', command: null },
  )
  return {
    schema_version: 'host-target-plan/v1',
    side_effects: 'none',
    host: target,
    operation,
    command,
    steps,
    notices: [
      'host-plan.notice.read-only-generation',
      'host-plan.notice.manual-command-has-effects',
      ...(native ? [] : ['host-plan.notice.project-placeholder']),
    ],
  }
}

function jsonResult(value: unknown): { exitCode: number; stdout: string; stderr: string } {
  return { exitCode: 0, stdout: JSON.stringify(value), stderr: '' }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function valueForArgs(args: readonly string[]): typeof CATALOG | ReturnType<typeof planFor> {
  const hostIndex = args.indexOf('--host')
  if (hostIndex < 0) return CATALOG
  const operationIndex = args.indexOf('--operation')
  const host = args[hostIndex + 1]
  const operation = args[operationIndex + 1]
  if (!HOST_IDS.some((candidate) => candidate === host)) throw new Error(`unexpected host ${host}`)
  if (operation !== 'setup' && operation !== 'update') throw new Error(`unexpected operation ${operation}`)
  return planFor(host, operation)
}

const ALL_ROUTE_URLS = [
  '/api/host-targets',
  ...HOST_IDS.flatMap((host) =>
    (['setup', 'update'] as const).map((operation) =>
      `/api/host-target-plan?host=${host}&operation=${operation}`)),
] as const

function deps(
  runner: PipelineCliRunner,
  operationsAvailable = true,
): HostTargetPlanRouteDeps {
  return {
    hostHome: '/host/home',
    operationsAvailable,
    operationRunner: runner,
    runtime: createHostTargetPlanRuntime(),
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

  it('rejects an impossible empty CLI catalog instead of caching it as success', async () => {
    const empty = { schema_version: 'host-target-plan/v1', targets: [] }
    const runner = vi.fn<PipelineCliRunner>(async () => jsonResult(empty))

    await expect(resolveHostTargetPlanRoute(
      '/api/host-targets',
      '/api/host-targets',
      deps(runner),
    )).resolves.toEqual({
      status: 502,
      body: {
        ok: false,
        code: 'HOST_TARGET_PLAN_INVALID',
        error: '宿主计划响应无效',
      },
    })
  })

  it.each(HOST_IDS.flatMap((host) =>
    (['setup', 'update'] as const).map((operation) => ({ host, operation }))),
  )('accepts the exact CLI plan truth for $host $operation', async ({ host, operation }) => {
    const value = planFor(host, operation)
    const runner = vi.fn<PipelineCliRunner>(async () => jsonResult(value))

    await expect(resolveHostTargetPlanRoute(
      `/api/host-target-plan?host=${host}&operation=${operation}`,
      '/api/host-target-plan',
      deps(runner),
    )).resolves.toEqual({ status: 200, body: value })
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
    { name: 'wrong target kind', run: async () => jsonResult({
      ...CATALOG,
      targets: [{ ...CODEX_TARGET, kind: 'adapter' }, ...CATALOG.targets.slice(1)],
    }) },
    { name: 'wrong target scope', run: async () => jsonResult({
      ...CATALOG,
      targets: [{ ...CODEX_TARGET, target_scope: 'project' }, ...CATALOG.targets.slice(1)],
    }) },
    { name: 'wrong target flag', run: async () => jsonResult({
      ...CATALOG,
      targets: [{ ...CODEX_TARGET, cli_flag: '--claude' }, ...CATALOG.targets.slice(1)],
    }) },
    { name: 'wrong target operations', run: async () => jsonResult({
      ...CATALOG,
      targets: [{ ...CODEX_TARGET, supported_operations: ['update', 'setup'] }, ...CATALOG.targets.slice(1)],
    }) },
    { name: 'out-of-order targets', run: async () => jsonResult({
      ...CATALOG,
      targets: [CATALOG.targets[1], CATALOG.targets[0], ...CATALOG.targets.slice(2)],
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
    { name: 'native step command differs from CLI truth', value: {
      ...PLAN,
      steps: [{
        ...PLAN.steps[0],
        command: planCommand('codex', ['plugin', 'marketplace', 'update', 'tenon']),
      }, ...PLAN.steps.slice(1)],
    } },
    { name: 'native commands are swapped under valid step ids', value: {
      ...PLAN,
      steps: [
        { ...PLAN.steps[0], command: PLAN.steps[1].command },
        { ...PLAN.steps[1], command: PLAN.steps[0].command },
        ...PLAN.steps.slice(2),
      ],
    } },
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

  it.each([
    {
      name: 'top command omits the project placeholder',
      mutate: (value: ReturnType<typeof planFor>) => ({
        ...value,
        command: planCommand('tenon', ['setup', '--cursor']),
      }),
    },
    {
      name: 'adapter deploy command differs from the top command',
      mutate: (value: ReturnType<typeof planFor>) => ({
        ...value,
        steps: value.steps.map((step) => step.id === 'adapter-deploy'
          ? { ...step, command: planCommand('tenon', ['setup', '--cursor', '--target', '/tmp']) }
          : step),
      }),
    },
    {
      name: 'package-assets unexpectedly gains a command',
      mutate: (value: ReturnType<typeof planFor>) => ({
        ...value,
        steps: [
          { ...value.steps[0], command: value.command },
          ...value.steps.slice(1),
        ],
      }),
    },
    {
      name: 'project-placeholder notice is missing',
      mutate: (value: ReturnType<typeof planFor>) => ({
        ...value,
        notices: value.notices.slice(0, 2),
      }),
    },
  ])('strictly rejects adapter semantic drift: $name', async ({ mutate }) => {
    const runner = vi.fn<PipelineCliRunner>(async () => jsonResult(mutate(planFor('cursor', 'setup'))))
    const result = await resolveHostTargetPlanRoute(
      '/api/host-target-plan?host=cursor&operation=setup',
      '/api/host-target-plan',
      deps(runner),
    )

    expect(result).toEqual({
      status: 502,
      body: {
        ok: false,
        code: 'HOST_TARGET_PLAN_INVALID',
        error: '宿主计划响应无效',
      },
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

  it('shares one in-flight CLI request for concurrent requests with the same key', async () => {
    const runner = vi.fn<PipelineCliRunner>(async () => {
      await delay(30)
      return jsonResult(CATALOG)
    })
    const { port } = await start(runner)

    const [first, second] = await Promise.all([
      reqGet(port, '/api/host-targets'),
      reqGet(port, '/api/host-targets'),
    ])

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(first.json()).toEqual(CATALOG)
    expect(second.json()).toEqual(CATALOG)
    expect(runner).toHaveBeenCalledTimes(1)
  })

  it('caches every successful response in the fixed 25-key host-plan space', async () => {
    const runner = vi.fn<PipelineCliRunner>(async (_root, args) => jsonResult(valueForArgs(args)))
    const { port } = await start(runner)

    const first = await Promise.all(ALL_ROUTE_URLS.map((url) => reqGet(port, url)))
    const second = await Promise.all(ALL_ROUTE_URLS.map((url) => reqGet(port, url)))

    expect(first.every((result) => result.status === 200)).toBe(true)
    expect(second.every((result) => result.status === 200)).toBe(true)
    expect(runner).toHaveBeenCalledTimes(25)
  })

  it('does not cache failures permanently, then caches the successful retry', async () => {
    const runner = vi.fn<PipelineCliRunner>(async () =>
      runner.mock.calls.length === 1
        ? { exitCode: 1, stdout: '', stderr: 'transient' }
        : jsonResult(CATALOG))
    const { port } = await start(runner)

    expect((await reqGet(port, '/api/host-targets')).status).toBe(502)
    expect((await reqGet(port, '/api/host-targets')).status).toBe(200)
    expect((await reqGet(port, '/api/host-targets')).status).toBe(200)
    expect(runner).toHaveBeenCalledTimes(2)
  })

  it('caps cross-key CLI concurrency at one across all 25 valid keys', async () => {
    let active = 0
    let maxActive = 0
    const runner = vi.fn<PipelineCliRunner>(async (_root, args) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await delay(5)
      active -= 1
      return jsonResult(valueForArgs(args))
    })
    const { port } = await start(runner)

    const responses = await Promise.all(ALL_ROUTE_URLS.map((url) => reqGet(port, url)))

    expect(responses.every((result) => result.status === 200)).toBe(true)
    expect(runner).toHaveBeenCalledTimes(25)
    expect(maxActive).toBe(1)
  })
})
