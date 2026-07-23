import { describe, expect, test } from 'vitest'
import { makeDeps } from '../test-support.js'
import { cmdDashboard, type DashboardRuntime } from './dashboard.js'

interface Calls {
  launches: Array<{ serverBundle: string; env: NodeJS.ProcessEnv }>
}

function runtime(overrides: Partial<DashboardRuntime> = {}): { runtime: DashboardRuntime; calls: Calls } {
  const calls: Calls = { launches: [] }
  return {
    runtime: {
      resolveRoot: () => '/plugin/pipeline-lite',
      fileExists: () => true,
      launch: async (serverBundle, env) => {
        calls.launches.push({ serverBundle, env })
        return 0
      },
      ...overrides,
    },
    calls,
  }
}

describe('pipeline dashboard', () => {
  test('starts the server and SPA bundled inside the installed plugin, with the default single port', async () => {
    const deps = makeDeps()
    const { runtime: dashboard, calls } = runtime()

    expect(await cmdDashboard(deps, {}, dashboard)).toBe(0)
    expect(calls.launches).toHaveLength(1)
    expect(calls.launches[0]?.serverBundle).toBe('/plugin/pipeline-lite/packages/server/dist/dashboard.mjs')
    expect(calls.launches[0]?.env.PIPELINE_DASHBOARD_PORT).toBeUndefined()
    expect(deps.outLines.join('\n')).toContain('http://127.0.0.1:8765/')
    expect(deps.outLines.join('\n')).toContain('/plugin/pipeline-lite/packages/dashboard-app/dist/index.html')
  })

  test('supports the former 18765 port as an explicit compatibility override', async () => {
    const deps = makeDeps()
    const { runtime: dashboard, calls } = runtime()

    expect(await cmdDashboard(deps, { port: '18765' }, dashboard)).toBe(0)
    expect(calls.launches[0]?.env.PIPELINE_DASHBOARD_PORT).toBe('18765')
    expect(deps.outLines.join('\n')).toContain('http://127.0.0.1:18765/')
  })

  test('dry-run verifies the released assets without launching a child process', async () => {
    const deps = makeDeps()
    const { runtime: dashboard, calls } = runtime()

    expect(await cmdDashboard(deps, { dryRun: true }, dashboard)).toBe(0)
    expect(calls.launches).toEqual([])
    expect(deps.outLines.join('\n')).toContain('--dry-run')
  })

  test('fails before launch when either release asset is absent', async () => {
    const deps = makeDeps()
    const { runtime: dashboard, calls } = runtime({
      fileExists: (path) => !path.endsWith('/packages/dashboard-app/dist/index.html'),
    })

    expect(await cmdDashboard(deps, {}, dashboard)).toBe(1)
    expect(calls.launches).toEqual([])
    expect(deps.errLines.join('\n')).toContain('缺少已发布 dashboard 资产')
    expect(deps.errLines.join('\n')).toContain('pipeline update --codex')
  })

  test('rejects an invalid port before inspecting or launching the package', async () => {
    const deps = makeDeps()
    const { runtime: dashboard, calls } = runtime({
      fileExists: () => {
        throw new Error('asset lookup must not run')
      },
    })

    expect(await cmdDashboard(deps, { port: '70000' }, dashboard)).toBe(1)
    expect(calls.launches).toEqual([])
    expect(deps.errLines.join('\n')).toContain('1 到 65535')
  })
})
