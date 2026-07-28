import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './transport'
import { fetchHostTargetPlan, fetchHostTargets } from './hostTargetPlanClient'

const catalog = {
  schema_version: 'host-target-plan/v1',
  targets: [{
    id: 'codex',
    kind: 'native',
    cli_flag: '--codex',
    target_scope: 'user',
    supported_operations: ['setup', 'update'],
    capabilities: ['native-marketplace', 'managed-runtime', 'bundled-skills', 'automatic-update'],
  }],
}

const plan = {
  schema_version: 'host-target-plan/v1',
  side_effects: 'none',
  host: catalog.targets[0],
  operation: 'setup',
  command: {
    executable: 'tenon',
    args: ['setup', '--codex'],
    display: 'tenon setup --codex',
  },
  steps: [
    { id: 'managed-runtime', label: 'host-plan.step.managed-runtime', command: null },
    {
      id: 'plugin-install',
      label: 'host-plan.step.plugin-install',
      command: {
        executable: 'codex',
        args: ['plugins', 'install', 'tenon'],
        display: 'codex plugins install tenon',
      },
    },
  ],
  notices: ['host-plan.notice.read-only-generation'],
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('host target plan read-only client', () => {
  it('loads and strictly decodes the v1 target catalog', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(catalog), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchHostTargets()).resolves.toEqual(catalog)
    expect(fetchMock).toHaveBeenCalledWith('/api/host-targets', {
      headers: { Accept: 'application/json' },
    })

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ...catalog, schema_version: 'host-target-plan/v2' }), { status: 200 }),
    )
    await expect(fetchHostTargets()).rejects.toThrow('宿主目录响应形状无效')

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({
        ...catalog,
        targets: [{ ...catalog.targets[0], capabilities: ['unknown-capability'] }],
      }), { status: 200 }),
    )
    await expect(fetchHostTargets()).rejects.toBeInstanceOf(ApiError)

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({
        ...catalog,
        targets: [{ ...catalog.targets[0], internal_path: '/secret/path' }],
      }), { status: 200 }),
    )
    await expect(fetchHostTargets()).rejects.toThrow('宿主目录响应形状无效')
  })

  it('URL-encodes the selected host and operation, then rejects a side-effectful or mismatched plan', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(plan), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchHostTargetPlan('codex', 'setup')).resolves.toEqual(plan)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/host-target-plan?host=codex&operation=setup',
      { headers: { Accept: 'application/json' } },
    )

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ...plan, side_effects: 'writes-files' }), { status: 200 }),
    )
    await expect(fetchHostTargetPlan('codex', 'setup')).rejects.toThrow('宿主计划响应形状无效')

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ...plan, operation: 'update' }), { status: 200 }),
    )
    await expect(fetchHostTargetPlan('codex', 'setup')).rejects.toThrow('与请求不匹配')

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({
        ...plan,
        command: { ...plan.command, display: 'tenon update --codex' },
      }), { status: 200 }),
    )
    await expect(fetchHostTargetPlan('codex', 'setup')).rejects.toThrow('宿主计划响应形状无效')
  })

  it('preserves the server error envelope for retryable catalog failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: '宿主探测暂时不可用' }), { status: 503 }),
    ))

    await expect(fetchHostTargets()).rejects.toMatchObject({
      name: 'ApiError',
      status: 503,
      message: '宿主探测暂时不可用',
    })
  })
})
