import { describe, expect, test } from 'vitest'
import { makeDeps } from '../test-support.js'
import { installedPipelineRoot, nativeInstallPlan } from './plugin-host.js'
import { type SetupEnv } from './setup.js'
import { cmdUpdate, nativeUpdatePlan } from './update.js'
import type { RuntimeInstaller } from '../runtime/installer.js'
import type { ReleasedDashboardStarter } from './dashboard.js'

interface Calls {
  readonly exec: Array<readonly [string, readonly string[]]>
  readonly writes: Array<readonly [string, string]>
}

interface RuntimeCalls {
  readonly activations: Array<readonly [string, string, string]>
  readonly failures: Array<readonly [string, string]>
}

interface DashboardCalls {
  readonly starts: Array<readonly [string, { readonly openBrowser?: boolean }]>
}

function fakeRuntimeInstaller(fail = false): { installer: RuntimeInstaller; calls: RuntimeCalls } {
  const calls: RuntimeCalls = { activations: [], failures: [] }
  const releaseId = `sha256-${'b'.repeat(64)}`
  const installer: RuntimeInstaller = {
    activate: async (candidateRoot, host, homeDir) => {
      calls.activations.push([candidateRoot, host, homeDir])
      if (fail) throw new Error('candidate rejected')
      return {
        release: { version: 1, releaseId, payloadDigest: 'b'.repeat(64), createdAt: '2026-07-24T00:00:00Z', source: { host, pluginVersion: '1.0.0' } },
        selection: { version: 1, revision: 2, activeRelease: releaseId, previousRelease: null, updatedAt: '2026-07-24T00:00:00Z' },
        releaseRoot: `/runtime/releases/${releaseId}`,
      }
    },
    inspect: async () => ({
      selection: { version: 1, revision: 0, activeRelease: null, previousRelease: null, updatedAt: '1970-01-01T00:00:00Z' },
      active: null,
      previous: null,
      activeValid: false,
      previousValid: false,
      lastAudit: null,
    }),
    rollback: async () => { throw new Error('not used') },
    recordUpdateFailure: async (homeDir, detail) => {
      calls.failures.push([homeDir, detail])
    },
  }
  return { installer, calls }
}

function fakeDashboardStarter(fail = false): { starter: ReleasedDashboardStarter; calls: DashboardCalls } {
  const calls: DashboardCalls = { starts: [] }
  return {
    starter: {
      start: async (_deps, payloadRoot, opts) => {
        calls.starts.push([payloadRoot, opts])
        return fail ? 1 : 0
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
    pluginRoot: () => '/old/tenon',
    selfPath: () => '/old/tenon/packages/cli/dist/tenon.mjs',
    mkdirp: () => undefined,
    pathExists: () => false,
    readText: () => undefined,
    commandExists: () => false,
    listDir: () => [],
    writeText: (path, text) => { calls.writes.push([path, text]) },
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
      '宿主刷新后的 tenon 候选未通过打包资产校验',
    ]])
    expect(deps.errLines.join('\n')).toContain('保持原 launcher')
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
