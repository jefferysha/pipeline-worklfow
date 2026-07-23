import { describe, expect, test } from 'vitest'
import { makeDeps } from '../test-support.js'
import { installedPipelineRoot, nativeInstallPlan } from './plugin-host.js'
import { type SetupEnv } from './setup.js'
import { cmdUpdate, nativeUpdatePlan } from './update.js'

interface Calls {
  readonly exec: Array<readonly [string, readonly string[]]>
  readonly links: Array<readonly [string, string]>
  readonly writes: Array<readonly [string, string]>
}

function updateEnv(
  run: (cmd: string, args: string[]) => { code: number; stdout: string; stderr: string },
): { env: SetupEnv; calls: Calls } {
  const calls: Calls = { exec: [], links: [], writes: [] }
  const env: SetupEnv = {
    homeDir: () => '/home/update-test',
    pluginRoot: () => '/old/pipeline-lite',
    selfPath: () => '/old/pipeline-lite/packages/cli/dist/pipeline.mjs',
    mkdirp: () => undefined,
    readSymlink: () => null,
    pathExists: () => false,
    commandExists: () => false,
    listDir: () => [],
    makeSymlink: (target, path) => { calls.links.push([target, path]) },
    removePath: () => undefined,
    chmodExec: () => undefined,
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
  installed: [{ name: 'pipeline-lite', marketplaceName: 'pipeline-lite', source: { path: '/new/pipeline-lite' } }],
})

describe('native plugin update plans', () => {
  test('Codex and Claude plans use each host marketplace and finish with a host-owned inventory', () => {
    expect(nativeUpdatePlan('codex')).toEqual([
      { cmd: 'codex', args: ['plugin', 'marketplace', 'upgrade', 'pipeline-lite', '--json'] },
      { cmd: 'codex', args: ['plugin', 'add', 'pipeline-lite@pipeline-lite', '--json'] },
      { cmd: 'codex', args: ['plugin', 'list', '--json'] },
    ])
    expect(nativeUpdatePlan('claude')).toEqual([
      { cmd: 'claude', args: ['plugin', 'marketplace', 'update', 'pipeline-lite'] },
      { cmd: 'claude', args: ['plugin', 'update', 'pipeline-lite@pipeline-lite'] },
      { cmd: 'claude', args: ['plugin', 'list', '--json'] },
    ])
    expect(nativeInstallPlan('codex').at(-1)).toEqual({ cmd: 'codex', args: ['plugin', 'list', '--json'] })
  })

  test('parses only the matching host inventory entry; no cache layout is inferred', () => {
    expect(installedPipelineRoot('codex', CODEX_INVENTORY)).toBe('/new/pipeline-lite')
    expect(installedPipelineRoot('claude', JSON.stringify([
      { id: 'pipeline-lite@pipeline-lite', installPath: '/new/claude-pipeline-lite' },
    ]))).toBe('/new/claude-pipeline-lite')
    expect(installedPipelineRoot('codex', JSON.stringify({ installed: [] }))).toBeNull()
    expect(installedPipelineRoot('claude', 'not json')).toBeNull()
  })
})

describe('pipeline update', () => {
  test('requires exactly one host selector', () => {
    const deps = makeDeps()
    const { env } = updateEnv(() => ({ code: 0, stdout: '', stderr: '' }))
    expect(cmdUpdate(deps, {}, env)).toBe(1)
    expect(deps.errLines.join('\n')).toContain('必须指定一个宿主')

    const both = makeDeps()
    expect(cmdUpdate(both, { codex: true, claude: true }, env)).toBe(1)
    expect(both.errLines.join('\n')).toContain('一次只能指定一个宿主')
  })

  test('--dry-run is read-only: it prints the exact refresh plan without marketplace calls or launcher changes', () => {
    const deps = makeDeps()
    const { env, calls } = updateEnv(() => ({ code: 0, stdout: '', stderr: '' }))
    expect(cmdUpdate(deps, { codex: true, dryRun: true }, env)).toBe(0)
    expect(deps.outLines.join('\n')).toContain('codex plugin marketplace upgrade pipeline-lite --json')
    expect(calls.exec).toEqual([])
    expect(calls.links).toEqual([])
    expect(calls.writes).toEqual([])
  })

  test('a verified Codex update refreshes only the selected host and atomically switches the launcher source', () => {
    const deps = makeDeps()
    const { env, calls } = updateEnv((cmd, args) => {
      if (cmd === 'codex' && args.join(' ') === 'plugin list --json') return { code: 0, stdout: CODEX_INVENTORY, stderr: '' }
      if (cmd === 'bash') return { code: 0, stdout: '', stderr: '' }
      return { code: 0, stdout: '', stderr: '' }
    })

    expect(cmdUpdate(deps, { codex: true }, env)).toBe(0)
    expect(calls.exec.map(([cmd, args]) => [cmd, args.join(' ')])).toEqual([
      ['codex', 'plugin marketplace upgrade pipeline-lite --json'],
      ['codex', 'plugin add pipeline-lite@pipeline-lite --json'],
      ['codex', 'plugin list --json'],
      ['bash', '/new/pipeline-lite/tools/verify-skills.sh --quiet --root /new/pipeline-lite'],
    ])
    expect(calls.links).toEqual([[
      '/new/pipeline-lite/packages/cli/dist/pipeline.mjs',
      '/home/update-test/.local/bin/pipeline',
    ]])
    expect(deps.outLines.join('\n')).toContain('请新开会话')
    expect(deps.outLines.join('\n')).toContain('输入 /hooks')
  })

  test('a failed package verification never points the launcher at the unverified release', () => {
    const deps = makeDeps()
    const { env, calls } = updateEnv((cmd, args) => {
      if (cmd === 'codex' && args.join(' ') === 'plugin list --json') return { code: 0, stdout: CODEX_INVENTORY, stderr: '' }
      if (cmd === 'bash') return { code: 1, stdout: '', stderr: 'missing packaged skill' }
      return { code: 0, stdout: '', stderr: '' }
    })

    expect(cmdUpdate(deps, { codex: true }, env)).toBe(1)
    expect(calls.links).toEqual([])
    expect(deps.errLines.join('\n')).toContain('保持原 launcher')
  })

  test('an idempotent already-installed response still verifies the host inventory before refreshing the launcher', () => {
    const deps = makeDeps()
    const { env, calls } = updateEnv((cmd, args) => {
      if (cmd === 'codex' && args.join(' ') === 'plugin add pipeline-lite@pipeline-lite --json') {
        return { code: 1, stdout: '', stderr: 'plugin already installed' }
      }
      if (cmd === 'codex' && args.join(' ') === 'plugin list --json') return { code: 0, stdout: CODEX_INVENTORY, stderr: '' }
      if (cmd === 'bash') return { code: 0, stdout: '', stderr: '' }
      return { code: 0, stdout: '', stderr: '' }
    })

    expect(cmdUpdate(deps, { codex: true }, env)).toBe(0)
    expect(calls.exec.map(([cmd, args]) => [cmd, args.join(' ')])).toEqual([
      ['codex', 'plugin marketplace upgrade pipeline-lite --json'],
      ['codex', 'plugin add pipeline-lite@pipeline-lite --json'],
      ['codex', 'plugin list --json'],
      ['bash', '/new/pipeline-lite/tools/verify-skills.sh --quiet --root /new/pipeline-lite'],
    ])
    expect(calls.links).toHaveLength(1)
  })
})
