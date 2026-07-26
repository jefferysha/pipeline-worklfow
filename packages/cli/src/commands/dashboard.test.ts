import { describe, expect, test } from 'vitest'
import { makeDeps } from '../test-support.js'
import { cmdDashboard, startReleasedDashboard, type DashboardRuntime } from './dashboard.js'

interface Calls {
  launches: Array<{ serverBundle: string; env: NodeJS.ProcessEnv }>
  detached: Array<{ serverBundle: string; env: NodeJS.ProcessEnv }>
  healthPorts: number[]
  expectedReleaseIds: Array<string | undefined>
  expectedStateScopeIds: string[]
  openedUrls: string[]
}

function runtime(overrides: Partial<DashboardRuntime> = {}): { runtime: DashboardRuntime; calls: Calls } {
  const calls: Calls = {
    launches: [],
    detached: [],
    healthPorts: [],
    expectedReleaseIds: [],
    expectedStateScopeIds: [],
    openedUrls: [],
  }
  return {
    runtime: {
      resolveRoot: () => '/plugin/tenon',
      fileExists: () => true,
      launch: async (serverBundle, env) => {
        calls.launches.push({ serverBundle, env })
        return 0
      },
      launchDetached: async (serverBundle, env) => {
        calls.detached.push({ serverBundle, env })
        return true
      },
      resolveStateScopeId: () => `sha256-v1-${'1'.repeat(64)}`,
      waitForHealthyServer: async (port, expectedReleaseId, expectedStateScopeId) => {
        calls.healthPorts.push(port)
        calls.expectedReleaseIds.push(expectedReleaseId)
        calls.expectedStateScopeIds.push(expectedStateScopeId)
        return true
      },
      openBrowser: async (url) => {
        calls.openedUrls.push(url)
        return true
      },
      ...overrides,
    },
    calls,
  }
}

describe('tenon dashboard', () => {
  test('starts the server and SPA bundled inside the installed plugin, with the default single port', async () => {
    const deps = makeDeps()
    const { runtime: dashboard, calls } = runtime()

    expect(await cmdDashboard(deps, {}, dashboard)).toBe(0)
    expect(calls.launches).toHaveLength(1)
    expect(calls.launches[0]?.serverBundle).toBe('/plugin/tenon/packages/server/dist/dashboard.mjs')
    expect(calls.launches[0]?.env.TENON_DASHBOARD_PORT).toBe('18765')
    expect(deps.outLines.join('\n')).toContain('http://127.0.0.1:18765/')
    expect(deps.outLines.join('\n')).toContain('/plugin/tenon/packages/dashboard-app/dist/index.html')
  })

  test('supports the former 8765 port as an explicit compatibility override', async () => {
    const deps = makeDeps()
    const { runtime: dashboard, calls } = runtime()

    expect(await cmdDashboard(deps, { port: '8765' }, dashboard)).toBe(0)
    expect(calls.launches[0]?.env.TENON_DASHBOARD_PORT).toBe('8765')
    expect(deps.outLines.join('\n')).toContain('http://127.0.0.1:8765/')
  })

  test('background mode waits for the managed dashboard health check before opening the browser', async () => {
    const deps = makeDeps()
    const { runtime: dashboard, calls } = runtime()

    expect(await cmdDashboard(deps, { background: true, open: true }, dashboard)).toBe(0)
    expect(calls.launches).toEqual([])
    expect(calls.detached).toHaveLength(1)
    expect(calls.detached[0]?.serverBundle).toBe('/plugin/tenon/packages/server/dist/dashboard.mjs')
    expect(calls.detached[0]?.env.TENON_DASHBOARD_PORT).toBe('18765')
    expect(calls.healthPorts).toEqual([18765])
    expect(calls.expectedReleaseIds).toEqual([undefined])
    expect(calls.expectedStateScopeIds).toEqual([`sha256-v1-${'1'.repeat(64)}`])
    expect(calls.openedUrls).toEqual(['http://127.0.0.1:18765/'])
    expect(deps.outLines.join('\n')).toContain('健康检查通过')
  })

  test('immutable release startup requires the exact content-addressed health identity', async () => {
    const deps = makeDeps()
    const { runtime: dashboard, calls } = runtime()
    const releaseId = `sha256-${'a'.repeat(64)}`

    expect(await startReleasedDashboard(
      deps,
      `/runtime/releases/${releaseId}/payload`,
      {},
      dashboard,
    )).toBe(0)
    expect(calls.expectedReleaseIds).toEqual([releaseId])
    expect(calls.expectedStateScopeIds).toEqual([`sha256-v1-${'1'.repeat(64)}`])
  })

  test('managed startup rejects a payload path without a release identity before spawning', async () => {
    const deps = makeDeps()
    const { runtime: dashboard, calls } = runtime()

    expect(await startReleasedDashboard(deps, '/mutable/plugin', {}, dashboard)).toBe(1)
    expect(calls.detached).toEqual([])
    expect(deps.errLines.join('\n')).toContain('release identity')
  })

  test('background mode fails closed when the spawned process never exposes a pipeline health endpoint', async () => {
    const deps = makeDeps()
    const { runtime: dashboard, calls } = runtime({ waitForHealthyServer: async () => false })

    expect(await cmdDashboard(deps, { background: true, open: true }, dashboard)).toBe(1)
    expect(calls.openedUrls).toEqual([])
    expect(deps.errLines.join('\n')).toContain('未通过健康检查')
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
    expect(deps.errLines.join('\n')).toContain('tenon update --codex')
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
