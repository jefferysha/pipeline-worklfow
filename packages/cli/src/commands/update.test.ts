import { describe, expect, test } from 'vitest'
import { join } from 'node:path'
import { makeDeps } from '../test-support.js'
import {
  enabledHostPluginIds,
  installedPipelineRoot,
  nativeInstallPlan,
  nativePluginRemovalPlan,
  parseHostPluginInventory,
} from './plugin-host.js'
import { type SetupEnv } from './setup.js'
import { cmdUpdate, nativeUpdatePlan } from './update.js'
import { resolveRuntimePaths } from '../runtime/paths.js'
import type { RuntimeInstaller } from '../runtime/installer.js'
import type { ReleasedDashboardStarter } from './dashboard.js'

interface Calls {
  readonly exec: Array<readonly [string, readonly string[]]>
  readonly writes: Array<readonly [string, string]>
}

interface RuntimeCalls {
  readonly activations: Array<readonly [string, string, string]>
  readonly failures: Array<readonly [string, string]>
  readonly reverts: Array<readonly [string, string]>
}

interface DashboardCalls {
  readonly starts: Array<readonly [string, { readonly openBrowser?: boolean }]>
}

function fakeRuntimeInstaller(
  fail = false,
  previousRelease: string | null = null,
  activeRelease: string | null = null,
): { installer: RuntimeInstaller; calls: RuntimeCalls } {
  const calls: RuntimeCalls = { activations: [], failures: [], reverts: [] }
  const releaseId = `sha256-${'b'.repeat(64)}`
  const installer: RuntimeInstaller = {
    withManagedTransaction: async (scope, operation) => operation({
      activate: async (candidateRoot, host) => {
        calls.activations.push([candidateRoot, host, scope.homeDir])
        if (fail) throw new Error('candidate rejected')
        return {
          release: { version: 1, releaseId, payloadDigest: 'b'.repeat(64), createdAt: '2026-07-24T00:00:00Z', source: { host, pluginVersion: '1.0.0' } },
          selection: { version: 1, revision: 2, activeRelease: releaseId, previousRelease, updatedAt: '2026-07-24T00:00:00Z' },
          releaseRoot: `/runtime/releases/${releaseId}`,
        }
      },
      revertActivation: async (activation) => {
        calls.reverts.push([scope.homeDir, activation.release.releaseId])
      },
    }),
    inspect: async () => ({
      selection: { version: 1, revision: 0, activeRelease, previousRelease: null, updatedAt: '1970-01-01T00:00:00Z' },
      active: activeRelease === null ? null : {
        version: 1,
        releaseId: activeRelease,
        payloadDigest: activeRelease.replace(/^sha256-/, ''),
        createdAt: '2026-07-24T00:00:00Z',
        source: { host: 'codex', pluginVersion: '1.0.1' },
      },
      previous: null,
      activeValid: activeRelease !== null,
      previousValid: false,
      lastAudit: null,
    }),
    rollback: async () => { throw new Error('not used') },
    recordUpdateFailure: async (scope, detail) => {
      calls.failures.push([scope.homeDir, detail])
    },
  }
  return { installer, calls }
}

function fakeDashboardStarter(failures: readonly boolean[] = []): { starter: ReleasedDashboardStarter; calls: DashboardCalls } {
  const calls: DashboardCalls = { starts: [] }
  return {
    starter: {
      start: async (_deps, payloadRoot, opts) => {
        calls.starts.push([payloadRoot, opts])
        return failures[calls.starts.length - 1] === true
          ? { state: 'failed', detail: 'injected readiness failure' }
          : { state: 'ready' }
      },
    },
    calls,
  }
}

function updateEnv(
  run: (cmd: string, args: string[]) => { code: number; stdout: string; stderr: string },
): { env: SetupEnv; calls: Calls } {
  const calls: Calls = { exec: [], writes: [] }
  const env: SetupEnv = {
    homeDir: () => '/home/update-test',
    runtimeEnv: () => ({}),
    pluginRoot: () => '/old/tenon',
    selfPath: () => '/old/tenon/packages/cli/dist/tenon.mjs',
    mkdirp: () => undefined,
    pathExists: () => false,
    readText: () => undefined,
    readTextState: (path) => {
      const text = env.readText(path)
      return text === undefined ? { state: 'missing' } : { state: 'ok', text }
    },
    commandExists: () => false,
    listDir: () => [],
    writeText: (path, text) => { calls.writes.push([path, text]) },
    writeTextAtomic: (path, text) => { calls.writes.push([path, text]) },
    runCommand: (cmd, args) => {
      calls.exec.push([cmd, args])
      return run(cmd, args)
    },
    confirm: () => true,
  }
  return { env, calls }
}

const CODEX_INVENTORY = JSON.stringify({
  installed: [{ name: 'tenon', marketplaceName: 'tenon', source: { path: '/new/tenon' } }],
})

describe('native plugin update plans', () => {
  test('Codex and Claude plans use each host marketplace and finish with a host-owned inventory', () => {
    expect(nativeUpdatePlan('codex')).toEqual([
      { cmd: 'codex', args: ['plugin', 'marketplace', 'upgrade', 'tenon', '--json'] },
      { cmd: 'codex', args: ['plugin', 'add', 'tenon@tenon', '--json'] },
      { cmd: 'codex', args: ['plugin', 'list', '--json'] },
    ])
    expect(nativeUpdatePlan('claude')).toEqual([
      { cmd: 'claude', args: ['plugin', 'marketplace', 'update', 'tenon'] },
      { cmd: 'claude', args: ['plugin', 'update', 'tenon@tenon'] },
      { cmd: 'claude', args: ['plugin', 'list', '--json'] },
    ])
    expect(nativeInstallPlan('codex').at(-1)).toEqual({ cmd: 'codex', args: ['plugin', 'list', '--json'] })
  })

  test('parses only the matching host inventory entry; no cache layout is inferred', () => {
    expect(installedPipelineRoot('codex', CODEX_INVENTORY)).toBe('/new/tenon')
    expect(installedPipelineRoot('claude', JSON.stringify([
      { id: 'tenon@tenon', installPath: '/new/claude-tenon' },
    ]))).toBe('/new/claude-tenon')
    expect(installedPipelineRoot('codex', JSON.stringify({ installed: [] }))).toBeNull()
    expect(installedPipelineRoot('claude', 'not json')).toBeNull()
  })

  test('parses only enabled plugin ids from host inventory', () => {
    const ids = enabledHostPluginIds('codex', JSON.stringify({
      installed: [
        { pluginId: 'tenon@tenon', enabled: true },
        { pluginId: 'disabled@source', enabled: false },
      ],
    }))
    expect(ids === null ? null : [...ids]).toEqual(['tenon@tenon'])
    expect(enabledHostPluginIds('codex', 'not json')).toBeNull()
    expect(enabledHostPluginIds('codex', JSON.stringify({ installed: 'not-an-array' }))).toBeNull()
    expect(enabledHostPluginIds('codex', JSON.stringify({ installed: [] }))).toEqual(new Set())
  })

  test('inventory decoder 对禁用根、畸形 enabled、重复登记和非绝对路径全部失败关闭', () => {
    expect(parseHostPluginInventory('codex', JSON.stringify({
      installed: [{
        pluginId: 'tenon@tenon',
        name: 'tenon',
        marketplaceName: 'tenon',
        enabled: false,
        source: { path: '/disabled/tenon' },
      }],
    }))).toMatchObject({ enabledIds: new Set(), tenonRoot: null })
    expect(parseHostPluginInventory('codex', JSON.stringify({
      installed: [{ pluginId: 'tenon@tenon', enabled: 'false' }],
    }))).toBeNull()
    expect(parseHostPluginInventory('codex', JSON.stringify({
      installed: [
        { pluginId: 'tenon@tenon', enabled: true },
        { pluginId: 'tenon@tenon', enabled: true },
      ],
    }))).toBeNull()
    expect(parseHostPluginInventory('codex', JSON.stringify({
      installed: [{
        pluginId: 'tenon@tenon',
        name: 'tenon',
        marketplaceName: 'tenon',
        enabled: true,
        source: { path: 'relative/tenon' },
      }],
    }))).toBeNull()
  })

  test('Claude 清理计划保留 inventory 报告的精确 scope', () => {
    expect(nativePluginRemovalPlan('claude', 'conflict@source', 'project')).toEqual([{
      cmd: 'claude',
      args: ['plugin', 'uninstall', 'conflict@source', '--scope', 'project'],
    }])
    const inventory = parseHostPluginInventory('claude', JSON.stringify([
      { id: 'conflict@source', enabled: true, scope: 'project' },
      { id: 'conflict@source', enabled: true, scope: 'local' },
      { id: 'tenon@tenon', enabled: true, scope: 'user', installPath: '/installed/tenon' },
    ]))
    expect([...(inventory?.enabledScopes.get('conflict@source') ?? [])]).toEqual(['project', 'local'])
  })
})

describe('tenon update', () => {
  test('requires exactly one host selector', () => {
    const deps = makeDeps()
    const { env } = updateEnv(() => ({ code: 0, stdout: '', stderr: '' }))
    expect(cmdUpdate(deps, {}, env)).toBe(1)
    expect(deps.errLines.join('\n')).toContain('必须指定一个宿主')

    const both = makeDeps()
    expect(cmdUpdate(both, { codex: true, claude: true }, env)).toBe(1)
    expect(both.errLines.join('\n')).toContain('一次只能指定一个宿主')
  })

  test('--dry-run is read-only: it prints the exact refresh plan without marketplace calls or runtime publication', () => {
    const deps = makeDeps()
    const { env, calls } = updateEnv(() => ({ code: 0, stdout: '', stderr: '' }))
    expect(cmdUpdate(deps, { codex: true, dryRun: true }, env)).toBe(0)
    expect(deps.outLines.join('\n')).toContain('codex plugin marketplace upgrade tenon --json')
    expect(calls.exec).toEqual([])
    expect(calls.writes).toEqual([])
  })

  test('a verified Codex update refreshes only the selected host and atomically publishes the managed runtime', async () => {
    const deps = makeDeps()
    const { env, calls } = updateEnv((cmd, args) => {
      if (cmd === 'codex' && args.join(' ') === 'plugin list --json') return { code: 0, stdout: CODEX_INVENTORY, stderr: '' }
      if (cmd === 'bash') return { code: 0, stdout: '', stderr: '' }
      return { code: 0, stdout: '', stderr: '' }
    })

    const runtime = fakeRuntimeInstaller()
    const dashboard = fakeDashboardStarter()
    expect(await cmdUpdate(deps, { codex: true }, env, runtime.installer, dashboard.starter)).toBe(0)
    expect(calls.exec.map(([cmd, args]) => [cmd, args.join(' ')])).toEqual([
      ['codex', 'plugin marketplace upgrade tenon --json'],
      ['codex', 'plugin add tenon@tenon --json'],
      ['codex', 'plugin list --json'],
      ['bash', '/new/tenon/tools/verify-skills.sh --quiet --root /new/tenon'],
    ])
    expect(runtime.calls.activations).toEqual([['/new/tenon', 'codex', '/home/update-test']])
    expect(dashboard.calls.starts).toEqual([[
      `/runtime/releases/sha256-${'b'.repeat(64)}/payload`,
      { openBrowser: true },
    ]])
    expect(deps.outLines.join('\n')).toContain('稳定 tenon launcher 已保持不变')
    expect(deps.outLines.join('\n')).toContain('输入 /hooks')
  })

  test('update 发现冲突登记时只记录 cleanup-pending，当前会话不提前删除旧入口', async () => {
    const deps = makeDeps()
    const inventory = JSON.stringify({
      installed: [
        { pluginId: 'pipeline-lite@pipeline-lite', enabled: true, source: { path: '/old/workflow' } },
        { pluginId: 'tenon@tenon', name: 'tenon', marketplaceName: 'tenon', enabled: true, source: { path: '/new/tenon' } },
      ],
    })
    const { env, calls } = updateEnv((cmd, args) => {
      if (cmd === 'codex' && args.join(' ') === 'plugin list --json') {
        return { code: 0, stdout: inventory, stderr: '' }
      }
      if (cmd === 'bash') return { code: 0, stdout: '', stderr: '' }
      return { code: 0, stdout: '', stderr: '' }
    })
    const runtime = fakeRuntimeInstaller()

    expect(await cmdUpdate(deps, { codex: true }, env, runtime.installer, fakeDashboardStarter().starter)).toBe(0)
    expect(calls.exec.some(([cmd, args]) =>
      cmd === 'codex' && args.join(' ') === 'plugin remove pipeline-lite@pipeline-lite --json')).toBe(false)
    const receiptPath = join(
      resolveRuntimePaths({ homeDir: '/home/update-test', env: {} }).migrationsRoot,
      'host-plugin-convergence',
      'codex.json',
    )
    const receiptWrite = calls.writes.find(([path]) => path === receiptPath)
    expect(JSON.parse(receiptWrite?.[1] ?? '{}')).toMatchObject({
      state: 'cleanup-pending',
      releaseId: `sha256-${'b'.repeat(64)}`,
    })
    expect(deps.outLines.join('\n')).toContain('新宿主会话')
  })

  test('update 在 cleanup finalize 的官方 remove 失败时不刷新 marketplace、不发布 runtime', async () => {
    const deps = makeDeps()
    const releaseId = `sha256-${'b'.repeat(64)}`
    const paths = resolveRuntimePaths({ homeDir: '/home/update-test', env: {} })
    const receiptPath = join(paths.migrationsRoot, 'host-plugin-convergence', 'codex.json')
    const proofPath = join(paths.stateRoot, 'migration', 'tenon-session-loaded')
    const inventory = JSON.stringify({
      installed: [
        { pluginId: 'pipeline-lite@pipeline-lite', enabled: true, source: { path: '/old/workflow' } },
        { pluginId: 'tenon@tenon', enabled: true, source: { path: '/new/tenon' } },
      ],
    })
    const { env, calls } = updateEnv((cmd, args) => {
      if (cmd === 'codex' && args.join(' ') === 'plugin list --json') {
        return { code: 0, stdout: inventory, stderr: '' }
      }
      if (cmd === 'codex' && args.join(' ') === 'plugin remove pipeline-lite@pipeline-lite --json') {
        return { code: 7, stdout: '', stderr: 'remove blocked' }
      }
      return { code: 0, stdout: '', stderr: '' }
    })
    env.readText = (path) => {
      if (path === receiptPath) {
        return JSON.stringify({
          version: 2,
          state: 'cleanup-pending',
          host: 'codex',
          conflictPluginId: 'pipeline-lite@pipeline-lite',
          conflictScopes: ['user'],
          releaseId,
          releaseRoot: `/runtime/releases/${releaseId}/payload`,
          candidateRoot: '/new/tenon',
          createdAtEpoch: 1_700_000_000,
          updatedAt: '2026-07-26T00:00:00Z',
        })
      }
      if (path === proofPath) {
        return `version=2\nloaded_at_epoch=1800000000\nhost=codex\nrelease_id=${releaseId}\nrelease_root=/runtime/releases/${releaseId}/payload\n`
      }
      return undefined
    }
    const runtime = fakeRuntimeInstaller(false, null, releaseId)

    expect(await cmdUpdate(deps, { codex: true }, env, runtime.installer, fakeDashboardStarter().starter)).toBe(1)
    expect(runtime.calls.activations).toEqual([])
    expect(calls.exec.map(([cmd, args]) => [cmd, args.join(' ')])).toEqual([
      ['codex', 'plugin list --json'],
      ['codex', 'plugin remove pipeline-lite@pipeline-lite --json'],
    ])
  })

  test('dashboard readiness failure compensates the exact published activation', async () => {
    const deps = makeDeps()
    const { env } = updateEnv((cmd, args) => {
      if (cmd === 'codex' && args.join(' ') === 'plugin list --json') {
        return { code: 0, stdout: CODEX_INVENTORY, stderr: '' }
      }
      return { code: 0, stdout: '', stderr: '' }
    })
    const previousRelease = `sha256-${'a'.repeat(64)}`
    const runtime = fakeRuntimeInstaller(false, previousRelease)
    const dashboard = fakeDashboardStarter([true, false])

    expect(await cmdUpdate(deps, { codex: true }, env, runtime.installer, dashboard.starter)).toBe(1)
    expect(runtime.calls.reverts).toEqual([[
      '/home/update-test',
      `sha256-${'b'.repeat(64)}`,
    ]])
    expect(dashboard.calls.starts.map(([payload]) => payload)).toEqual([
      `/runtime/releases/sha256-${'b'.repeat(64)}/payload`,
      `/runtime/releases/${previousRelease}/payload`,
    ])
    expect(runtime.calls.failures[0]?.[1]).toContain('已恢复 managed transaction 与 previous Dashboard')
  })

  test('successful update reports registered projects that need an explicit sync without writing them', async () => {
    const deps = makeDeps()
    const { env, calls } = updateEnv((cmd, args) => {
      if (cmd === 'codex' && args.join(' ') === 'plugin list --json') {
        return { code: 0, stdout: CODEX_INVENTORY, stderr: '' }
      }
      return { code: 0, stdout: '', stderr: '' }
    })
    env.readText = (path) => {
      if (path === resolveRuntimePaths({ homeDir: '/home/update-test', env: {} }).registryPath) {
        return JSON.stringify(['/repo/current', "/repo/it's $HOME", "/repo/it's $HOME", 'relative/project'])
      }
      if (path === '/repo/current/.pipeline-version') return '1.0.0\n'
      if (path === "/repo/it's $HOME/.pipeline-version") return '0.2.0\n'
      return undefined
    }

    expect(await cmdUpdate(deps, { codex: true }, env, fakeRuntimeInstaller().installer, fakeDashboardStarter().starter)).toBe(0)
    expect(deps.outLines.join('\n')).toContain(`cd '/repo/it'"'"'s $HOME' && tenon sync`)
    expect(deps.outLines.filter((line) => line.includes('tenon sync'))).toHaveLength(1)
    expect(deps.outLines.join('\n')).not.toContain('relative/project')
    expect(deps.outLines.join('\n')).not.toContain('/repo/current')
    expect(calls.writes).toEqual([])
  })

  test('a local Codex marketplace skips the unsupported Git fetch but still reinstalls the plugin cache', async () => {
    const deps = makeDeps()
    const { env, calls } = updateEnv((cmd, args) => {
      if (cmd === 'codex' && args.join(' ') === 'plugin marketplace upgrade tenon --json') {
        return { code: 1, stdout: '', stderr: 'Error: marketplace `tenon` is not configured as a Git marketplace' }
      }
      if (cmd === 'codex' && args.join(' ') === 'plugin list --json') return { code: 0, stdout: CODEX_INVENTORY, stderr: '' }
      if (cmd === 'bash') return { code: 0, stdout: '', stderr: '' }
      return { code: 0, stdout: '', stderr: '' }
    })

    const runtime = fakeRuntimeInstaller()
    const dashboard = fakeDashboardStarter()
    expect(await cmdUpdate(deps, { codex: true, auto: true }, env, runtime.installer, dashboard.starter)).toBe(0)
    expect(calls.exec.map(([cmd, args]) => [cmd, args.join(' ')])).toEqual([
      ['codex', 'plugin marketplace upgrade tenon --json'],
      ['codex', 'plugin add tenon@tenon --json'],
      ['codex', 'plugin list --json'],
      ['bash', '/new/tenon/tools/verify-skills.sh --quiet --root /new/tenon'],
    ])
    expect(runtime.calls.activations).toEqual([['/new/tenon', 'codex', '/home/update-test']])
    expect(deps.outLines.join('\n')).toContain('本地 marketplace 不需要 Git fetch')
    expect(dashboard.calls.starts).toEqual([[
      `/runtime/releases/sha256-${'b'.repeat(64)}/payload`,
      { openBrowser: false },
    ]])
  })

  test('a failed package verification never publishes the unverified release and is runtime-audited', async () => {
    const deps = makeDeps()
    const { env, calls } = updateEnv((cmd, args) => {
      if (cmd === 'codex' && args.join(' ') === 'plugin list --json') return { code: 0, stdout: CODEX_INVENTORY, stderr: '' }
      if (cmd === 'bash') return { code: 1, stdout: '', stderr: 'missing packaged skill' }
      return { code: 0, stdout: '', stderr: '' }
    })

    const runtime = fakeRuntimeInstaller()
    expect(await cmdUpdate(deps, { codex: true }, env, runtime.installer)).toBe(1)
    expect(runtime.calls.activations).toEqual([])
    expect(runtime.calls.failures).toEqual([[
      '/home/update-test',
      'host=committed; managed=unchanged; 宿主刷新后的 tenon 候选未通过打包资产校验',
    ]])
    expect(deps.errLines.join('\n')).toContain('宿主插件缓存已由 Codex 更新')
    expect(deps.errLines.join('\n')).toContain('Tenon 未回滚宿主私有缓存')
  })

  test('managed activation failure is audited without pretending to roll back the host cache', async () => {
    const deps = makeDeps()
    const { env } = updateEnv((cmd, args) => {
      if (cmd === 'codex' && args.join(' ') === 'plugin list --json') return { code: 0, stdout: CODEX_INVENTORY, stderr: '' }
      if (cmd === 'bash') return { code: 0, stdout: '', stderr: '' }
      return { code: 0, stdout: '', stderr: '' }
    })
    const runtime = fakeRuntimeInstaller(true)

    expect(await cmdUpdate(deps, { codex: true }, env, runtime.installer, fakeDashboardStarter().starter)).toBe(1)
    expect(runtime.calls.failures).toEqual([[
      '/home/update-test',
      expect.stringContaining('host=committed; managed=unchanged'),
    ]])
    expect(deps.errLines.join('\n')).toContain('宿主插件缓存已由 Codex 更新')
    expect(deps.errLines.join('\n')).toContain('当前已验证 runtime 保持不变')
  })

  test('an idempotent already-installed response still verifies the host inventory before publishing the managed runtime', async () => {
    const deps = makeDeps()
    const { env, calls } = updateEnv((cmd, args) => {
      if (cmd === 'codex' && args.join(' ') === 'plugin add tenon@tenon --json') {
        return { code: 1, stdout: '', stderr: 'plugin already installed' }
      }
      if (cmd === 'codex' && args.join(' ') === 'plugin list --json') return { code: 0, stdout: CODEX_INVENTORY, stderr: '' }
      if (cmd === 'bash') return { code: 0, stdout: '', stderr: '' }
      return { code: 0, stdout: '', stderr: '' }
    })

    const runtime = fakeRuntimeInstaller()
    const dashboard = fakeDashboardStarter()
    expect(await cmdUpdate(deps, { codex: true }, env, runtime.installer, dashboard.starter)).toBe(0)
    expect(calls.exec.map(([cmd, args]) => [cmd, args.join(' ')])).toEqual([
      ['codex', 'plugin marketplace upgrade tenon --json'],
      ['codex', 'plugin add tenon@tenon --json'],
      ['codex', 'plugin list --json'],
      ['bash', '/new/tenon/tools/verify-skills.sh --quiet --root /new/tenon'],
    ])
    expect(runtime.calls.activations).toEqual([['/new/tenon', 'codex', '/home/update-test']])
  })
})
