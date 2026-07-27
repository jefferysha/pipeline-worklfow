/**
 * setup 命令 —— mock/真临时 fs 混合回归（full-install F3 骨架 + S2 技能安装段）。
 * 覆盖:①--dry-run 零写零发布(spy env 断言零 mutation);②managed runtime 发布只经注入边界、
 * 从不把启动器直连 marketplace checkout；③runtime 占位分派、skills 真实装派;
 * ④program 装配 flag 解析(--dry-run/--yes 透传);⑤技能安装段 S2 七钉(命令生成/官方第三方标注/幂等/
 * dry-run 零执行/失败容错/engine 附加/禁整装)。候选根仅经 managed-runtime 发布边界进入稳定启动器。
 */
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { makeDeps } from '../test-support.js'
import { buildProgram, CliExit } from '../program.js'
import { readSkillSources, type SkillSource, type SkillSourcesResult } from '../skillSources.js'
import {
  buildSkillsPlan,
  cmdSetup,
  cmdSetupHost,
  cmdSetupRuntime,
  cmdSetupSkills,
  scrubLegacyCodexAdapterHooks,
  type PlannedCommand,
  type RuntimeEnv,
  type SetupEnv,
} from './setup.js'
import type { ExecDockerFn } from '../afkReadiness.js'
import type { RuntimeInstaller } from '../runtime/installer.js'
import { resolveRuntimePaths } from '../runtime/paths.js'
import type { ReleasedDashboardStarter } from './dashboard.js'

// ── spy env:记录全部 fs mutation + exec 调用,断言「零副作用」/「未碰 PATH」/「零执行」──────
interface SpyCalls {
  mkdirp: string[]
  writeText: Array<[string, string]>
  exec: Array<[string, string[]]>
}
type ExecStub = (cmd: string, args: string[]) => { code: number; stdout: string; stderr: string }
function spyEnv(over: Partial<SetupEnv> = {}, exec?: ExecStub, confirmAns = true): { env: SetupEnv; calls: SpyCalls } {
  const calls: SpyCalls = { mkdirp: [], writeText: [], exec: [] }
  const mutationBaselines = new Map<string, number>()
  const env: SetupEnv = {
    homeDir: () => '/home/test',
    runtimeEnv: () => ({}),
    pluginRoot: () => '/plugin',
  selfPath: () => '/plugin/packages/cli/dist/tenon.mjs',
  mkdirp: (d) => { calls.mkdirp.push(d) },
  pathExists: () => false,
  readText: () => undefined,
  readTextState: (path) => {
    const read = over.readText?.(path)
    if (read !== undefined) return { state: 'ok', text: read }
    return over.pathExists?.(path) === true
      ? { state: 'error', detail: 'injected unreadable path' }
      : { state: 'missing' }
  },
  commandExists: () => false,
    listDir: () => [],
    writeText: (p, text) => { calls.writeText.push([p, text]) },
    writeTextAtomic: (p, text) => { calls.writeText.push([p, text]) },
    migrateProjectRegistry: async () => ({
      status: 'completed',
      discovered: 0,
      imported: 0,
      rejected: 0,
    }),
    runCommand: (cmd, args) => { calls.exec.push([cmd, args]); return exec ? exec(cmd, args) : { code: 0, stdout: '', stderr: '' } },
    managedHostReconciliation: (_host, stepId, command) => {
      const key = `${command.cmd}\u0000${command.args.join('\u0000')}`
      const baseline = calls.exec.filter(([cmd, args]) =>
        `${cmd}\u0000${args.join('\u0000')}` === key).length
      mutationBaselines.set(stepId, baseline)
      const desired = `test-desired:${stepId}`
      return {
        desired,
        observe: () => {
          const executions = calls.exec.filter(([cmd, args]) =>
            `${cmd}\u0000${args.join('\u0000')}` === key).length
          return executions > (mutationBaselines.get(stepId) ?? baseline)
            ? desired
            : `test-before:${stepId}:${baseline}`
        },
        isDesired: (observation) => observation === desired,
      }
    },
    confirm: () => confirmAns,
    ...over,
  }
  return { env, calls }
}

function setupPathExists(path: string): boolean {
  return !path.includes('/host-plugin-convergence/')
}

function setupReadText(path: string): string | undefined {
  if (path.endsWith('/.codex/hooks.json')) return '{}\n'
  return undefined
}

interface RuntimeCalls {
  readonly activations: Array<readonly [string, string, string]>
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
  const calls: RuntimeCalls = { activations: [], reverts: [] }
  const releaseId = `sha256-${'a'.repeat(64)}`
  let journal: import('../runtime/installer.js').ManagedReleaseJournalRecord | null = null
  const installer: RuntimeInstaller = {
    withManagedTransaction: async (scope, operation) => operation({
      checkpointActivation: async () => ({
        selection: {
          version: 1,
          revision: 0,
          activeRelease: null,
          previousRelease: null,
          updatedAt: '2026-07-23T00:00:00Z',
        },
        launchers: {
          tenon: { path: '/home/test/.local/bin/tenon', state: { kind: 'missing' } },
          hook: { path: '/home/test/.local/bin/tenon-hook', state: { kind: 'missing' } },
        },
      }),
      activate: async (candidateRoot, host) => {
        calls.activations.push([candidateRoot, host, scope.homeDir])
        if (fail) throw new Error('candidate rejected')
        return {
          release: {
            version: 1,
            releaseId,
            payloadDigest: 'a'.repeat(64),
            createdAt: '2026-07-24T00:00:00Z',
            source: { host, pluginVersion: '1.0.0' },
          },
          selection: {
            version: 1,
            revision: 1,
            activeRelease: releaseId,
            previousRelease,
            updatedAt: '2026-07-24T00:00:00Z',
          },
          releaseRoot: `/runtime/releases/${releaseId}`,
        }
      },
      recoverActivation: async () => ({ state: 'not-started' as const }),
      revertActivation: async (activation) => {
        calls.reverts.push([scope.homeDir, activation.release.releaseId])
      },
      proveActivation: async (activation) =>
        activation.selection.activeRelease === activation.release.releaseId,
      journal: {
        create: (operationName, source, now) => ({
          version: 1,
          transactionId: 'setup-test-transaction',
          operation: operationName,
          source,
          phase: 'preparing-host',
          startedAt: now,
          updatedAt: now,
        }),
        read: async () => journal,
        write: async (record) => { journal = record },
        clear: async () => { journal = null },
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
  }
  return { installer, calls }
}

function fakeDashboardStarter(fail = false): { starter: ReleasedDashboardStarter; calls: DashboardCalls } {
  const calls: DashboardCalls = { starts: [] }
  return {
    starter: {
      inspect: async () => null,
      adopt: async () => null,
      start: async (_deps, payloadRoot, opts) => {
        calls.starts.push([payloadRoot, opts])
        const releaseId = payloadRoot.split('/').at(-2) ?? ''
        return fail
          ? { state: 'failed', detail: 'injected readiness failure' }
          : {
              state: 'ready',
              session: {
                ownership: {
                  version: 1,
                  port: 18765,
                  pid: 321,
                  releaseId,
                  stateScopeId: `sha256-v1-${'1'.repeat(64)}`,
                  ...(opts.transactionId === undefined ? {} : { transactionId: opts.transactionId }),
                },
                stop: async () => ({ state: 'stopped' as const }),
              },
            }
      },
    },
    calls,
  }
}

// ── 运行时段 fake RuntimeEnv（注入 docker exec + hostEnv + image;零真 docker 子进程）──────────
/** 缺省:docker 可用 + 镜像在位;over 覆写 exec/hostEnv/resolveImage 造 docker 缺 / 镜像缺 / 凭证态。 */
function fakeRt(over: Partial<RuntimeEnv> = {}): RuntimeEnv {
  const okExec: ExecDockerFn = async (args) => {
    if (args[0] === 'info') return { stdout: 'ok', stderr: '', exitCode: 0 }
    if (args[0] === 'image' && args[1] === 'inspect') return { stdout: '[]', stderr: '', exitCode: 0 }
    return { stdout: '', stderr: '', exitCode: 0 }
  }
  return { exec: okExec, hostEnv: {}, resolveImage: () => 'sandcastle:local', ...over }
}
/** docker daemon 不可用（info 非零）——镜像 inspect 不应再被调（短路）。 */
const dockerDownExec: ExecDockerFn = async () => ({ stdout: '', stderr: 'daemon down', exitCode: 1 })

// ── S2 registry fixtures（inline SkillSource[] 子集,不碰真 yaml）──────────────────────
const ECC_NAMES = [
  'browser-qa', 'e2e-testing', 'search-first', 'deep-research', 'market-research', 'code-tour', 'github-ops',
  'react-patterns', 'python-patterns', 'python-testing', 'nestjs-patterns', 'postgres-patterns', 'docker-patterns',
  'deployment-patterns', 'frontend-patterns',
] as const
const eccSources: SkillSource[] = ECC_NAMES.map((n) => ({
  token: n, tool: 'skills-cli', source: 'affaan-m/ECC', skill: n,
  tier: n === 'browser-qa' || n === 'e2e-testing' ? 'mandatory' : 'optional', official: false,
  ...(n === 'browser-qa' ? { engine: 'playwright@claude-plugins-official' } : {}),
}))
const cmdText = (c: PlannedCommand): string => [c.cmd, ...c.args].join(' ')

/** Native setup must resolve the real plugin root from the host-owned inventory, not cache guesses. */
const codexInstallExec: ExecStub = (cmd, args) => {
  if (cmd === 'codex' && args.join(' ') === 'plugin list --json') {
    return {
      code: 0,
      stdout: JSON.stringify({
        installed: [{ name: 'tenon', marketplaceName: 'tenon', source: { path: '/installed/tenon' } }],
      }),
      stderr: '',
    }
  }
  return { code: 0, stdout: '', stderr: '' }
}

describe('①--dry-run —— 按宿主打印计划且零写、零发布', () => {
  test('setup --codex --dry-run:骨架含三段 + Phase 锚点,且零 mutation', () => {
    const deps = makeDeps()
    const { env, calls } = spyEnv()
    expect(cmdSetup(deps, undefined, { codex: true, dryRun: true }, env)).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('计划骨架')
    expect(out).toContain('唯一 tenon 插件')
    expect(out).toContain('内置技能')
    expect(out).toContain('技能安装计划')
    expect(out).toContain('运行时就绪检查')
    expect(out).toContain('--dry-run')
    // 零副作用铁律（含技能段:dry-run 零执行）
    expect(calls.mkdirp).toHaveLength(0)
    expect(calls.writeText).toHaveLength(0)
    expect(calls.exec).toHaveLength(0)
  })

  test('未选择宿主 → fail-loud，不会悄悄同时安装 Codex 与 Claude', () => {
    const deps = makeDeps()
    expect(cmdSetup(deps, undefined, { dryRun: true }, spyEnv().env)).toBe(1)
    expect(deps.errLines.join('\n')).toContain('必须指定一个宿主')
  })
})

describe('①a 自动更新偏好 —— 只允许原生宿主，且在插件校验后写入用户配置', () => {
  test('Codex 已有完整已验证插件时复用宿主清单根，--auto-update 写入精确每日更新偏好', async () => {
    const deps = makeDeps()
    const { env, calls } = spyEnv({ pathExists: setupPathExists, readText: setupReadText }, codexInstallExec)
    const runtime = fakeRuntimeInstaller()
    const dashboard = fakeDashboardStarter()

    expect(await cmdSetupHost(deps, 'codex', { codex: true, autoUpdate: true }, env, runtime.installer, dashboard.starter)).toBe(0)
    expect(calls.writeText).toEqual([[
      join(resolveRuntimePaths({ homeDir: '/home/test', env: {} }).configRoot, 'auto-update.conf'),
      'host=codex\nenabled=true\n',
    ]])
    expect(calls.mkdirp).toContain(resolveRuntimePaths({ homeDir: '/home/test', env: {} }).configRoot)
    expect(calls.exec.map(([cmd, args]) => [cmd, args.join(' ')])).toEqual([
      ['codex', 'plugin list --json'],
      ['bash', '/installed/tenon/tools/verify-skills.sh --quiet --root /installed/tenon'],
    ])
    expect(deps.outLines.join('\n')).toContain('已启用 --codex 自动更新')
    expect(deps.outLines.join('\n')).toContain('输入 /hooks')
    expect(runtime.calls.activations).toEqual([['/installed/tenon', 'codex', '/home/test']])
    expect(dashboard.calls.starts).toEqual([[
      `/runtime/releases/sha256-${'a'.repeat(64)}/payload`,
      { openBrowser: true, transactionId: 'setup-test-transaction' },
    ]])
  })

  test('Codex 没有已验证插件时才执行正式 marketplace 安装计划', async () => {
    const deps = makeDeps()
    let inventoryReads = 0
    const exec: ExecStub = (cmd, args) => {
      if (cmd === 'codex' && args.join(' ') === 'plugin list --json') {
        inventoryReads += 1
        return {
          code: 0,
          stdout: JSON.stringify({
            installed: inventoryReads === 1
              ? []
              : [{ name: 'tenon', marketplaceName: 'tenon', source: { path: '/installed/tenon' } }],
          }),
          stderr: '',
        }
      }
      return { code: 0, stdout: '', stderr: '' }
    }
    const { env, calls } = spyEnv({ pathExists: setupPathExists, readText: setupReadText }, exec)
    const runtime = fakeRuntimeInstaller()

    expect(await cmdSetupHost(deps, 'codex', { codex: true }, env, runtime.installer)).toBe(0)
    expect(calls.exec.map(([cmd, args]) => [cmd, args.join(' ')])).toEqual([
      ['codex', 'plugin list --json'],
      ['codex', 'plugin marketplace add jefferysha/tenon --ref main'],
      ['codex', 'plugin add tenon@tenon --json'],
      ['codex', 'plugin list --json'],
      ['bash', '/installed/tenon/tools/verify-skills.sh --quiet --root /installed/tenon'],
    ])
    expect(runtime.calls.activations).toEqual([['/installed/tenon', 'codex', '/home/test']])
  })

  test('初始宿主 inventory 命令失败时 fail closed，不继续 marketplace 或 runtime mutation', async () => {
    const deps = makeDeps()
    const { env, calls } = spyEnv(
      { pathExists: setupPathExists, readText: setupReadText },
      (cmd, args) => cmd === 'codex' && args.join(' ') === 'plugin list --json'
        ? { code: 9, stdout: '', stderr: 'inventory unavailable' }
        : { code: 0, stdout: '', stderr: '' },
    )
    const runtime = fakeRuntimeInstaller()

    expect(await cmdSetupHost(deps, 'codex', { codex: true }, env, runtime.installer)).toBe(1)
    expect(calls.exec).toEqual([['codex', ['plugin', 'list', '--json']]])
    expect(runtime.calls.activations).toEqual([])
    expect(deps.errLines.join('\n')).toContain('inventory')
  })

  test('receipt 路径存在但不可读时 fail closed，不继续宿主或 runtime mutation', async () => {
    const deps = makeDeps()
    const paths = resolveRuntimePaths({ homeDir: '/home/test', env: {} })
    const receiptPath = join(paths.migrationsRoot, 'host-plugin-convergence', 'codex.json')
    const { env, calls } = spyEnv({
      pathExists: (path) => path === receiptPath || setupPathExists(path),
      readText: (path) => path === receiptPath ? undefined : setupReadText(path),
    })
    const runtime = fakeRuntimeInstaller()

    expect(await cmdSetupHost(deps, 'codex', { codex: true }, env, runtime.installer)).toBe(1)
    expect(calls.exec).toEqual([])
    expect(runtime.calls.activations).toEqual([])
    expect(deps.errLines.join('\n')).toContain('receipt')
  })

  test('Codex 冲突登记先发布并验证 Tenon，再写 cleanup-pending；同一会话绝不提前删除旧入口', async () => {
    const deps = makeDeps()
    const exec: ExecStub = (cmd, args) => {
      if (cmd === 'codex' && args.join(' ') === 'plugin list --json') {
        return {
          code: 0,
          stdout: JSON.stringify({
            installed: [
              {
                pluginId: 'pipeline-lite@pipeline-lite',
                name: 'pipeline-lite',
                marketplaceName: 'pipeline-lite',
                enabled: true,
                source: { path: '/old/workflow' },
              },
              {
                pluginId: 'tenon@tenon',
                name: 'tenon',
                marketplaceName: 'tenon',
                enabled: true,
                source: { path: '/installed/tenon' },
              },
            ],
          }),
          stderr: '',
        }
      }
      return { code: 0, stdout: '', stderr: '' }
    }
    const { env, calls } = spyEnv({
      pathExists: setupPathExists,
      readText: setupReadText,
    }, exec)
    const runtime = fakeRuntimeInstaller()

    expect(await cmdSetupHost(deps, 'codex', { codex: true }, env, runtime.installer)).toBe(0)
    expect(calls.exec.map(([cmd, args]) => [cmd, args.join(' ')])).toEqual([
      ['codex', 'plugin list --json'],
      ['bash', '/installed/tenon/tools/verify-skills.sh --quiet --root /installed/tenon'],
    ])
    expect(runtime.calls.activations).toEqual([['/installed/tenon', 'codex', '/home/test']])
    const receiptPath = join(
      resolveRuntimePaths({ homeDir: '/home/test', env: {} }).migrationsRoot,
      'host-plugin-convergence',
      'codex.json',
    )
    const receiptWrite = calls.writeText.find(([path]) => path === receiptPath)
    expect(receiptWrite).toBeDefined()
    expect(JSON.parse(receiptWrite?.[1] ?? '{}')).toMatchObject({
      version: 3,
      transactionId: 'setup-test-transaction',
      state: 'cleanup-pending',
      host: 'codex',
      releaseId: `sha256-${'a'.repeat(64)}`,
    })
    expect(deps.outLines.join('\n')).toContain('新宿主会话')
  })

  test('cleanup-pending 的官方 remove 失败时先失败关闭，不安装候选也不发布新 runtime', async () => {
    const deps = makeDeps()
    const releaseId = `sha256-${'a'.repeat(64)}`
    const paths = resolveRuntimePaths({ homeDir: '/home/test', env: {} })
    const receiptPath = join(paths.migrationsRoot, 'host-plugin-convergence', 'codex.json')
    const proofPath = join(paths.stateRoot, 'migration', 'tenon-session-loaded')
    const receipt = JSON.stringify({
      version: 2,
      state: 'cleanup-pending',
      host: 'codex',
      conflictPluginId: 'pipeline-lite@pipeline-lite',
      conflictScopes: ['user'],
      releaseId,
      releaseRoot: `/runtime/releases/${releaseId}/payload`,
      candidateRoot: '/installed/tenon',
      createdAtEpoch: 1_700_000_000,
      updatedAt: '2026-07-26T00:00:00Z',
    })
    const inventory = JSON.stringify({
      installed: [
        { pluginId: 'pipeline-lite@pipeline-lite', enabled: true, source: { path: '/old/workflow' } },
        { pluginId: 'tenon@tenon', enabled: true, source: { path: '/installed/tenon' } },
      ],
    })
    const { env, calls } = spyEnv({
      pathExists: () => true,
      readText: (path) => {
        if (path === receiptPath) return receipt
        if (path === proofPath) {
          return `version=2\nloaded_at_epoch=1800000000\nhost=codex\nrelease_id=${releaseId}\nrelease_root=/runtime/releases/${releaseId}/payload\n`
        }
        return undefined
      },
    }, (cmd, args) => {
      if (cmd === 'codex' && args.join(' ') === 'plugin list --json') {
        return { code: 0, stdout: inventory, stderr: '' }
      }
      if (cmd === 'codex' && args.join(' ') === 'plugin remove pipeline-lite@pipeline-lite --json') {
        return { code: 9, stdout: '', stderr: 'permission denied' }
      }
      return { code: 0, stdout: '', stderr: '' }
    })
    const runtime = fakeRuntimeInstaller(false, null, releaseId)

    expect(await cmdSetupHost(deps, 'codex', { codex: true }, env, runtime.installer)).toBe(1)
    expect(runtime.calls.activations).toEqual([])
    expect(calls.exec.map(([cmd, args]) => [cmd, args.join(' ')])).toEqual([
      ['codex', 'plugin list --json'],
      ['codex', 'plugin remove pipeline-lite@pipeline-lite --json'],
    ])
    expect(deps.errLines.join('\n')).toContain('permission denied')
  })

  test('同 release 的旧 session proof 不得冒用为本次 receipt 之后的新会话', async () => {
    const deps = makeDeps()
    const releaseId = `sha256-${'a'.repeat(64)}`
    const paths = resolveRuntimePaths({ homeDir: '/home/test', env: {} })
    const receiptPath = join(paths.migrationsRoot, 'host-plugin-convergence', 'codex.json')
    const proofPath = join(paths.stateRoot, 'migration', 'tenon-session-loaded')
    const receipt = JSON.stringify({
      version: 2,
      state: 'cleanup-pending',
      host: 'codex',
      conflictPluginId: 'pipeline-lite@pipeline-lite',
      conflictScopes: ['user'],
      releaseId,
      releaseRoot: `/runtime/releases/${releaseId}/payload`,
      candidateRoot: '/installed/tenon',
      createdAtEpoch: 1_800_000_000,
      updatedAt: '2027-01-15T08:00:00Z',
    })
    const { env, calls } = spyEnv({
      pathExists: () => true,
      readText: (path) => {
        if (path === receiptPath) return receipt
        if (path === proofPath) {
          return `version=2\nloaded_at_epoch=1800000000\nhost=codex\nrelease_id=${releaseId}\nrelease_root=/runtime/releases/${releaseId}/payload\n`
        }
        return undefined
      },
    })
    const runtime = fakeRuntimeInstaller(false, null, releaseId)

    expect(await cmdSetupHost(deps, 'codex', { codex: true }, env, runtime.installer)).toBe(0)
    expect(calls.exec).toEqual([])
    expect(runtime.calls.activations).toEqual([])
    expect(deps.outLines.join('\n')).toContain('等待新宿主会话')
  })

  test('Claude 仅 user scope Tenon 时拒绝清理 project/local 旧登记', async () => {
    const deps = makeDeps()
    const releaseId = `sha256-${'a'.repeat(64)}`
    const legacyId = String.fromCharCode(
      112, 105, 112, 101, 108, 105, 110, 101, 45, 108, 105, 116, 101,
      64,
      112, 105, 112, 101, 108, 105, 110, 101, 45, 108, 105, 116, 101,
    )
    const paths = resolveRuntimePaths({ homeDir: '/home/test', env: {} })
    const receiptPath = join(paths.migrationsRoot, 'host-plugin-convergence', 'claude.json')
    const proofPath = join(paths.stateRoot, 'migration', 'tenon-session-loaded')
    const receipt = JSON.stringify({
      version: 2,
      state: 'cleanup-pending',
      host: 'claude',
      conflictPluginId: legacyId,
      conflictScopes: ['project', 'local'],
      releaseId,
      releaseRoot: `/runtime/releases/${releaseId}/payload`,
      candidateRoot: '/installed/tenon',
      createdAtEpoch: 1_700_000_000,
      updatedAt: '2026-07-26T00:00:00Z',
    })
    let removedScopes = 0
    const { env, calls } = spyEnv({
      pathExists: () => true,
      readText: (path) => {
        if (path === receiptPath) return receipt
        if (path === proofPath) {
          return `version=2\nloaded_at_epoch=1800000000\nhost=claude\nrelease_id=${releaseId}\nrelease_root=/runtime/releases/${releaseId}/payload\n`
        }
        return undefined
      },
    }, (cmd, args) => {
      if (cmd === 'claude' && args.join(' ') === 'plugin list --json') {
        return {
          code: 0,
          stdout: JSON.stringify([
            ...(removedScopes < 2
              ? [
                  { id: legacyId, enabled: true, scope: 'project' },
                  { id: legacyId, enabled: true, scope: 'local' },
                ]
              : []),
            { id: 'tenon@tenon', enabled: true, scope: 'user', installPath: '/installed/tenon' },
          ]),
          stderr: '',
        }
      }
      if (cmd === 'claude' && args[0] === 'plugin' && args[1] === 'uninstall') {
        removedScopes += 1
        return { code: 0, stdout: '', stderr: '' }
      }
      return { code: 0, stdout: '', stderr: '' }
    })
    const runtime = fakeRuntimeInstaller(false, null, releaseId)

    expect(await cmdSetupHost(deps, 'claude', { claude: true }, env, runtime.installer)).toBe(1)
    expect(calls.exec.map(([cmd, args]) => [cmd, args.join(' ')])).toEqual([
      ['claude', 'plugin list --json'],
    ])
    expect(deps.errLines.join('\n')).toContain('project scope')
  })

  test('activation 后 receipt 原子写失败会在同一 managed transaction 精确回滚', async () => {
    const deps = makeDeps()
    const legacyId = String.fromCharCode(
      112, 105, 112, 101, 108, 105, 110, 101, 45, 108, 105, 116, 101,
      64,
      112, 105, 112, 101, 108, 105, 110, 101, 45, 108, 105, 116, 101,
    )
    const { env } = spyEnv({
      pathExists: setupPathExists,
      readText: setupReadText,
      writeTextAtomic: () => { throw new Error('disk full') },
    }, (cmd, args) => {
      if (cmd === 'codex' && args.join(' ') === 'plugin list --json') {
        return {
          code: 0,
          stdout: JSON.stringify({
            installed: [
              { pluginId: legacyId, enabled: true, source: { path: '/old/workflow' } },
              {
                pluginId: 'tenon@tenon',
                name: 'tenon',
                marketplaceName: 'tenon',
                enabled: true,
                source: { path: '/installed/tenon' },
              },
            ],
          }),
          stderr: '',
        }
      }
      return { code: 0, stdout: '', stderr: '' }
    })
    const runtime = fakeRuntimeInstaller()

    expect(await cmdSetupHost(deps, 'codex', { codex: true }, env, runtime.installer)).toBe(1)
    expect(runtime.calls.reverts).toEqual([['/home/test', `sha256-${'a'.repeat(64)}`]])
    expect(deps.errLines.join('\n')).toContain('disk full')
  })

  test('Codex 已登记但缺 runtime bootstrap 时拒绝复用，并回到正式安装计划', async () => {
    const deps = makeDeps()
    let inventoryReads = 0
    const exec: ExecStub = (cmd, args) => {
      if (cmd === 'codex' && args.join(' ') === 'plugin list --json') {
        inventoryReads += 1
        return {
          code: 0,
          stdout: JSON.stringify({
            installed: [{
              name: 'tenon', marketplaceName: 'tenon',
              source: { path: inventoryReads === 1 ? '/stale/tenon' : '/installed/tenon' },
            }],
          }),
          stderr: '',
        }
      }
      return { code: 0, stdout: '', stderr: '' }
    }
    const { env, calls } = spyEnv({
      pathExists: (path) =>
        setupPathExists(path) && path !== '/stale/tenon/runtime/tenon-bootstrap.mjs',
      readText: setupReadText,
    }, exec)
    const runtime = fakeRuntimeInstaller()

    expect(await cmdSetupHost(deps, 'codex', { codex: true }, env, runtime.installer)).toBe(0)
    expect(calls.exec.map(([cmd, args]) => [cmd, args.join(' ')])).toEqual([
      ['codex', 'plugin list --json'],
      ['codex', 'plugin marketplace add jefferysha/tenon --ref main'],
      ['codex', 'plugin add tenon@tenon --json'],
      ['codex', 'plugin list --json'],
      ['bash', '/installed/tenon/tools/verify-skills.sh --quiet --root /installed/tenon'],
    ])
    expect(deps.outLines.join('\n')).toContain('不完整或未通过校验')
  })

  test('adapter 不能借 --auto-update 伪装成有自己的发布通道', () => {
    const deps = makeDeps()
    const { env, calls } = spyEnv()

    expect(cmdSetupHost(deps, 'cursor', { cursor: true, autoUpdate: true }, env)).toBe(1)
    expect(calls.exec).toEqual([])
    expect(calls.writeText).toEqual([])
    expect(deps.errLines.join('\n')).toContain('由承载它的 Codex 或 Claude 插件负责')
  })
})

describe('①b Codex 旧 hook 迁移 —— 插件是唯一 hook 所有者', () => {
  test('只剥离旧 adapter 的四个精确脚本，保留同组和其他事件中的用户 hooks', () => {
    const legacy = JSON.stringify({
      retained_setting: 'keep',
      hooks: {
        SessionStart: [{
          matcher: '*',
          hooks: [
            { type: 'command', command: 'bash "/old/pipeline/adapters/codex/hooks/inject.sh" SessionStart' },
            { type: 'command', command: 'bash "/user/hooks/session-context.sh"' },
          ],
        }],
        UserPromptSubmit: [{
          hooks: [{ type: 'command', command: 'bash "/old/pipeline/adapters/codex/hooks/prompt.sh" UserPromptSubmit' }],
        }],
        PostToolUse: [{
          hooks: [{ type: 'command', command: 'bash "/user/hooks/audit.sh"' }],
        }],
      },
    })

    const migrated = scrubLegacyCodexAdapterHooks(legacy)
    expect(migrated.removed).toBe(2)
    const parsed = JSON.parse(migrated.content) as {
      retained_setting: string
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>
    }
    expect(parsed.retained_setting).toBe('keep')
    expect(parsed.hooks.SessionStart?.[0]?.hooks.map((hook) => hook.command)).toEqual([
      'bash "/user/hooks/session-context.sh"',
    ])
    expect(parsed.hooks.UserPromptSubmit).toBeUndefined()
    expect(parsed.hooks.PostToolUse?.[0]?.hooks.map((hook) => hook.command)).toEqual([
      'bash "/user/hooks/audit.sh"',
    ])
  })

  test('malformed or unrelated global config is not reformatted or overwritten', () => {
    expect(scrubLegacyCodexAdapterHooks('{not json')).toEqual({ content: '{not json', removed: 0 })
    const unrelated = '{\n  "hooks": {"SessionStart": [{"hooks": [{"command": "bash /user/adapter.sh"}]}]}\n}\n'
    expect(scrubLegacyCodexAdapterHooks(unrelated)).toEqual({ content: unrelated, removed: 0 })
  })

  test('setup migrates old global registration before publishing the native runtime', async () => {
    const codexHooks = '/home/test/.codex/hooks.json'
    const legacy = JSON.stringify({
      hooks: {
        SessionStart: [{ hooks: [{ type: 'command', command: 'bash "/old/pipeline/adapters/codex/hooks/inject.sh" SessionStart' }] }],
        PreToolUse: [{ hooks: [{ type: 'command', command: 'bash "/user/hooks/preflight.sh"' }] }],
      },
    })
    const deps = makeDeps()
    const { env, calls } = spyEnv({
      pathExists: (path) => setupPathExists(path),
      readText: (path) => path === codexHooks ? legacy : undefined,
    }, codexInstallExec)
    const runtime = fakeRuntimeInstaller()

    expect(await cmdSetupHost(deps, 'codex', { codex: true }, env, runtime.installer)).toBe(0)
    expect(calls.writeText).toHaveLength(1)
    expect(calls.writeText[0]?.[0]).toBe(codexHooks)
    const migrated = JSON.parse(calls.writeText[0]?.[1] ?? '{}') as { hooks?: Record<string, unknown> }
    expect(migrated.hooks?.SessionStart).toBeUndefined()
    expect(migrated.hooks?.PreToolUse).toBeDefined()
    expect(runtime.calls.activations).toEqual([['/installed/tenon', 'codex', '/home/test']])
    expect(deps.outLines.join('\n')).toContain('已迁移 1 个旧版 Codex hook')
  })
})

describe('②managed runtime 发布边界', () => {
  test('候选 release 校验/发布失败时，不把宿主 checkout 伪装为可运行入口', async () => {
    const deps = makeDeps()
    const { env } = spyEnv({ pathExists: setupPathExists, readText: setupReadText }, codexInstallExec)
    const runtime = fakeRuntimeInstaller(true)

    expect(await cmdSetupHost(deps, 'codex', { codex: true }, env, runtime.installer)).toBe(1)
    expect(runtime.calls.activations).toEqual([['/installed/tenon', 'codex', '/home/test']])
    expect(deps.errLines.join('\n')).toContain('当前已验证 runtime 保持不变')
    expect(deps.errLines.join('\n')).toContain('宿主插件登记由宿主 CLI 独立管理')
    expect(deps.errLines.join('\n')).toContain('仅补偿自己的 managed transaction')
    expect(deps.outLines.join('\n')).not.toContain('已把 pipeline 软链')
  })

  test('Dashboard starter 抛错时仍补偿精确 activation 并恢复 previous 服务', async () => {
    const deps = makeDeps()
    const { env } = spyEnv({ pathExists: setupPathExists, readText: setupReadText }, codexInstallExec)
    const previousRelease = `sha256-${'c'.repeat(64)}`
    const runtime = fakeRuntimeInstaller(false, previousRelease)
    const starts: string[] = []
    const dashboard: ReleasedDashboardStarter = {
      inspect: async () => null,
      adopt: async () => null,
      start: async (_deps, payloadRoot) => {
        starts.push(payloadRoot)
        if (starts.length === 1) return { state: 'failed', detail: 'spawn failed' }
        return {
          state: 'ready',
          session: {
            ownership: {
              version: 1,
              port: 18765,
              pid: 654,
              releaseId: previousRelease,
              stateScopeId: `sha256-v1-${'1'.repeat(64)}`,
            },
            stop: async () => ({ state: 'stopped' as const }),
          },
        }
      },
    }

    expect(await cmdSetupHost(deps, 'codex', { codex: true }, env, runtime.installer, dashboard)).toBe(1)
    expect(runtime.calls.reverts).toEqual([[
      '/home/test',
      `sha256-${'a'.repeat(64)}`,
    ]])
    expect(starts).toEqual([
      `/runtime/releases/sha256-${'a'.repeat(64)}/payload`,
      `/runtime/releases/${previousRelease}/payload`,
    ])
    expect(deps.errLines.join('\n')).toContain('宿主插件登记由宿主 CLI 独立管理')
    expect(deps.errLines.join('\n')).toContain('仅补偿自己的 managed transaction')
    expect(deps.errLines.join('\n')).toContain('previous Dashboard')
  })
})

describe('③skills/runtime 分派 —— skills 真实装派(dry-run 安全) / runtime 占位 / 未知 sub', () => {
  test('setup skills --dry-run → 打印技能计划 + exit 0 + 零 exec 零 mutation', () => {
    const deps = makeDeps()
    const { env, calls } = spyEnv() // 默认真 registry;dry-run 只出计划,不 exec
    expect(cmdSetup(deps, 'skills', { dryRun: true }, env)).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('技能安装计划')
    expect(out).toContain('--dry-run')
    expect(calls.exec).toHaveLength(0)
    expect(calls.mkdirp).toHaveLength(0)
  })

  test('setup runtime 分派（注入 fake docker）→ 到达 cmdSetupRuntime，出就绪清单 + exit 0，零 runtime 发布', async () => {
    const deps = makeDeps()
    const { env, calls } = spyEnv()
    const code = await cmdSetup(deps, 'runtime', {}, env, fakeRt())
    expect(code).toBe(0)
    expect(deps.outLines.join('\n')).toContain('就绪清单')
    expect(calls.exec).toHaveLength(0) // runtime 段不走宿主 marketplace/候选发布
  })

  test('未知 sub → stderr + exit 1', () => {
    const deps = makeDeps()
    expect(cmdSetup(deps, 'frobnicate', {}, spyEnv().env)).toBe(1)
    expect(deps.errLines.join('\n')).toContain('未知 setup 子命令')
  })
})

describe('⑨空 sub 全流程 —— 技能段后接运行时就绪清单（dry-run 只提示不真探测,R1 concern#1）', () => {
  test('非 dry-run:技能段之后真跑运行时就绪清单（注入 fakeRt,零真 docker）→ 出清单 + exit 0', async () => {
    const deps = makeDeps()
    // 全部已装 → 技能段几乎空跑；fake installer 只记录已校验候选发布，聚焦「运行时段确实被接上」。
    const { env } = spyEnv({ pathExists: setupPathExists, readText: setupReadText }, codexInstallExec)
    const runtime = fakeRuntimeInstaller()
    const rt = fakeRt({ hostEnv: { CLAUDE_CODE_OAUTH_TOKEN: 'a', OPENAI_API_KEY: 'b' } })
    const dashboard = fakeDashboardStarter()
    const code = await cmdSetup(deps, undefined, { codex: true, yes: true }, env, rt, runtime.installer, dashboard.starter)
    expect(code).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('技能安装计划') // 技能段跑了
    expect(out).toContain('就绪清单') // 运行时段也跑了（一屏）
    expect(out).toContain('docker daemon 可用')
    expect(runtime.calls.activations).toEqual([['/installed/tenon', 'codex', '/home/test']])
    expect(dashboard.calls.starts).toEqual([[
      `/runtime/releases/sha256-${'a'.repeat(64)}/payload`,
      { openBrowser: true, transactionId: 'setup-test-transaction' },
    ]])
  })

  test('--dry-run:运行时段只提示见 tenon setup runtime,绝不真探测 docker（同步返 number,不碰 rt）', () => {
    const deps = makeDeps()
    const { env, calls } = spyEnv()
    // 关键:不传 rt（用真实 REAL_RUNTIME_ENV 缺省）——dry-run 仍绝不起真 docker;同步返 number 即证未 await 探测。
    const code = cmdSetup(deps, undefined, { codex: true, dryRun: true }, env)
    expect(code).toBe(0) // 同步 number（非 Promise）——dry-run 不进异步运行时探测
    const out = deps.outLines.join('\n')
    expect(out).toContain('运行时就绪检查')
    expect(out).toContain('tenon setup runtime') // 指引去独立子命令看真清单
    expect(out).toContain('--dry-run')
    expect(calls.exec).toHaveLength(0) // 零 exec（技能段 dry-run 零执行 + 运行时段未探测）
  })

  test('宿主 marketplace 安装失败时立即退出，不会把未验证的插件伪装成可运行环境', async () => {
    const deps = makeDeps()
    // 无已装 + 全 exec 失败 → 真 registry 的 mandatory 命令全败 → 技能段 exit 1。
    const exec: ExecStub = () => ({ code: 1, stdout: '', stderr: 'boom' })
    const { env } = spyEnv({}, exec)
    const code = await cmdSetup(deps, undefined, { codex: true, yes: true }, env, fakeRt())
    expect(code).toBe(1)
    expect(deps.errLines.join('\n')).toContain('失败')
    expect(deps.outLines.join('\n')).not.toContain('就绪清单')
  })
})

describe('⑧运行时检查段 R1 —— AFK 就绪清单（docker/镜像/两 runner 凭证对称;缺镜像 build_hint;缺凭证去配 X）', () => {
  test('全就绪:docker 可用 + 镜像在位 + 两 runner 凭证已配（宿主 env）→ 清单全就绪 + exit 0', async () => {
    const deps = makeDeps()
    const rt = fakeRt({ hostEnv: { CLAUDE_CODE_OAUTH_TOKEN: 'a', OPENAI_API_KEY: 'b', CODEX_HOME: '/c' } })
    expect(await cmdSetupRuntime(deps, {}, rt)).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('就绪清单')
    expect(out).toContain('docker daemon 可用')
    expect(out).toContain('sandcastle:local 在位')
    expect(out).toContain('CLAUDE_CODE_OAUTH_TOKEN 已配（宿主 env）')
    expect(out).toContain('OPENAI_API_KEY 已配（宿主 env）')
    expect(out).not.toContain('[缺失]')
  })

  test('docker 不可用 → 降级标缺失（不抛不阻断,exit 0）;镜像未能核给 build_hint;附「怎么拿」docker 安装引导', async () => {
    const deps = makeDeps()
    expect(await cmdSetupRuntime(deps, {}, fakeRt({ exec: dockerDownExec }))).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('docker 不可用')
    expect(out).toContain('bash tools/sandcastle/build.sh') // build_hint 单一真相源
    // FI·G1:不光报缺,还引导怎么获取——装 OrbStack / Docker Desktop,且明示不自动装
    expect(out).toContain('OrbStack')
    expect(out).toContain('Docker Desktop')
    expect(out).toContain('不自动装')
  })

  test('docker 在但镜像缺（inspect 非零）→ [缺失] + 构建:build_hint 一键', async () => {
    const deps = makeDeps()
    const exec: ExecDockerFn = async (args) =>
      args[0] === 'info' ? { stdout: 'ok', stderr: '', exitCode: 0 } : { stdout: '', stderr: 'no image', exitCode: 1 }
    expect(await cmdSetupRuntime(deps, {}, fakeRt({ exec }))).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('docker daemon 可用')
    expect(out).toContain('构建:bash tools/sandcastle/build.sh')
  })

  test('凭证缺 → 去配 X;凭证值永不回显（secrets 明文不进输出）;codex 缺附「怎么拿」两条路,claude 已配则无 claude 引导', async () => {
    const deps = makeDeps()
    // secrets 供 claude-code token（明文），codex OPENAI_API_KEY 两源皆缺
    deps.readSecretsEnv = async () => ({ CLAUDE_CODE_OAUTH_TOKEN: 'super-secret-xyz' })
    const out0 = await cmdSetupRuntime(deps, {}, fakeRt({ hostEnv: {} }))
    expect(out0).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).not.toContain('super-secret-xyz') // 值永不回显
    expect(out).toContain('CLAUDE_CODE_OAUTH_TOKEN 已配（secrets 文件）') // 只报 set+source
    expect(out).toContain('去配 OPENAI_API_KEY') // 缺 → 去配硬指引
    // FI·G1:codex 缺 → 引导两条路（codex login / openai api-keys）;claude 已配 → 不出 claude 引导（只对缺项引导）
    expect(out).toContain('codex login')
    expect(out).toContain('platform.openai.com/api-keys')
    expect(out).not.toContain('claude setup-token')
  })

  test('Codex-first：默认 ~/.codex/auth.json 可读 → 不再要求 OPENAI_API_KEY', async () => {
    const deps = makeDeps()
    const rt = Object.assign(fakeRt({ hostEnv: {} }), {
      defaultCodexHome: '/users/codex-owner/.codex',
      canReadFile: (path: string) => path === '/users/codex-owner/.codex/auth.json',
    })
    expect(await cmdSetupRuntime(deps, {}, rt)).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('默认 ~/.codex 登录')
    expect(out).not.toContain('去配 OPENAI_API_KEY')
  })

  test('claude-code 凭证缺 → 附「怎么拿」claude setup-token 引导（值永不回显）', async () => {
    const deps = makeDeps()
    // 两 runner 凭证两源皆缺（hostEnv 空 + 无 secrets）
    deps.readSecretsEnv = async () => ({})
    expect(await cmdSetupRuntime(deps, {}, fakeRt({ hostEnv: {} }))).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('去配 CLAUDE_CODE_OAUTH_TOKEN')
    expect(out).toContain('claude setup-token') // claude-code 缺 → 生成长期 OAuth token
    expect(out).toContain('codex login') // codex 也缺 → 两条路引导
  })

  test('两 runner 凭证对称:claude-code 已配、codex 全缺时,codex 的 OPENAI_API_KEY 与 CODEX_HOME 仍双双在清单（不缺席）', async () => {
    const deps = makeDeps()
    const rt = fakeRt({ hostEnv: { CLAUDE_CODE_OAUTH_TOKEN: 'only-claude' } })
    expect(await cmdSetupRuntime(deps, {}, rt)).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('codex 凭证 OPENAI_API_KEY')
    expect(out).toContain('codex CODEX_HOME') // codex 对等:两键都呈现
    expect(out).not.toContain('only-claude') // 值永不回显
  })

  test('--dry-run:出清单 + dry-run 说明,且零写（store.write 零调用）', async () => {
    const deps = makeDeps()
    expect(await cmdSetupRuntime(deps, { dryRun: true }, fakeRt({ exec: dockerDownExec }))).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('就绪清单')
    expect(out).toContain('--dry-run')
    expect(deps.store.write.calls).toHaveLength(0) // 运行时段只探测只打印,零写
  })
})

describe('④program 装配 —— flag 解析 --dry-run/--yes 透传', () => {
  async function runProgram(deps: ReturnType<typeof makeDeps>, args: string[]): Promise<number> {
    try {
      await buildProgram(deps).parseAsync(args, { from: 'user' })
      return 0
    } catch (e) {
      if (e instanceof CliExit) return e.code
      throw e
    }
  }

  test('setup --codex --dry-run:commander 解析为 host + dry-run（打印骨架、零副作用安全）', async () => {
    const deps = makeDeps()
    expect(await runProgram(deps, ['setup', '--codex', '--dry-run'])).toBe(0)
    expect(deps.outLines.join('\n')).toContain('--dry-run')
  })

  test('setup --dry-run 未指定宿主 → exit 1', async () => {
    const deps = makeDeps()
    expect(await runProgram(deps, ['setup', '--dry-run'])).toBe(1)
    expect(deps.errLines.join('\n')).toContain('必须指定一个宿主')
  })

  test('setup skills --dry-run:commander 解析,出技能计划零全局写（真装留最终门,不入 CI）', async () => {
    const deps = makeDeps()
    expect(await runProgram(deps, ['setup', 'skills', '--dry-run'])).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('技能安装计划')
    expect(out).toContain('--dry-run')
  })
})

describe('⑤技能安装段 S2 —— 命令生成 / 标注 / 幂等 / dry-run 零执行 / 失败容错 / engine / 禁整装', () => {
  test('① ECC 15 token 聚合成一条 --skill×15,无裸 npx skills add affaan-m/ECC', () => {
    const plan = buildSkillsPlan(eccSources, spyEnv().env)
    const ecc = plan.commands.find((c) => c.source === 'affaan-m/ECC' && c.group === 'skills-cli')
    expect(ecc).toBeDefined()
    expect(ecc!.names).toHaveLength(15)
    expect(ecc!.args.filter((a) => a === '--skill')).toHaveLength(15)
    expect(ecc!.args).toEqual(expect.arrayContaining(['-g', '-y']))
    expect(ecc!.bareAdd).toBe(false)
    expect(cmdText(ecc!)).toContain('npx skills add affaan-m/ECC --skill browser-qa')
    // 禁整装:绝无 args 恰为 skills add affaan-m/ECC（缺 --skill）的整仓命令
    expect(plan.commands.some((c) => c.cmd === 'npx' && c.args.join(' ') === 'skills add affaan-m/ECC')).toBe(false)
  })

  test('真实 registry：default workflow 全部 bundled，不生成第三方 skills-cli/npm/marketplace 安装命令', () => {
    const plan = buildSkillsPlan(readSkillSources(), spyEnv().env)
    expect(plan.commands).toEqual([])
    expect(plan.noInstall.length).toBeGreaterThan(30)
    expect(plan.noInstall).toContainEqual({ token: 'brainstorming', tool: 'bundled' })
    expect(plan.noInstall).toContainEqual({ token: 'openspec-propose', tool: 'bundled' })
    expect(plan.noInstall).toContainEqual({ token: 'deployment-patterns', tool: 'bundled' })
  })

  test('① agents-inc marketplace-add 在逐 id install 之前，Codex 优先且保留 Claude 兼容；npm 一条；builtin/bundled 无命令', () => {
    const src: SkillSource[] = [
      { token: 'shadcn-ui', tool: 'claude-plugin', source: 'agents-inc', skill: 'web-ui-shadcn-ui', tier: 'recommended', official: false },
      { token: 'tailwind-css-patterns', tool: 'claude-plugin', source: 'agents-inc', skill: 'web-styling-tailwind', tier: 'recommended', official: false },
      { token: 'opsx', tool: 'npm', source: '@fission-ai/openspec', tier: 'mandatory', official: false },
      { token: 'verify', tool: 'builtin', source: 'claude-code', tier: 'mandatory', official: true },
      { token: 'openspec-propose', tool: 'bundled', source: 'tenon', tier: 'mandatory', official: false },
    ]
    const plan = buildSkillsPlan(src, spyEnv().env)
    const texts = plan.commands.map(cmdText)
    const codexAddIdx = texts.indexOf('codex plugin marketplace add agents-inc/skills')
    const claudeAddIdx = texts.indexOf('claude plugin marketplace add agents-inc/skills')
    const codexShadcnIdx = texts.indexOf('codex plugin add web-ui-shadcn-ui@agents-inc')
    const codexTailwindIdx = texts.indexOf('codex plugin add web-styling-tailwind@agents-inc')
    const claudeShadcnIdx = texts.indexOf('claude plugin install web-ui-shadcn-ui@agents-inc')
    expect(codexAddIdx).toBeGreaterThanOrEqual(0)
    expect(claudeAddIdx).toBeGreaterThanOrEqual(0)
    expect(codexAddIdx).toBeLessThan(codexShadcnIdx)
    expect(codexAddIdx).toBeLessThan(codexTailwindIdx)
    expect(claudeAddIdx).toBeLessThan(claudeShadcnIdx)
    expect(texts).toContain('npm install -g @fission-ai/openspec')
    expect(texts.some((s) => s.includes('verify') || s.includes('openspec-propose'))).toBe(false)
    expect(plan.noInstall.map((n) => n.token).sort()).toEqual(['openspec-propose', 'verify'])
  })

  test('② 官方/第三方标注:anthropics/claude-plugins-official=官方,ECC/agents-inc=第三方', () => {
    const src: SkillSource[] = [
      { token: 'web-artifacts-builder', tool: 'skills-cli', source: 'anthropics/skills', skill: 'web-artifacts-builder', tier: 'optional', official: true },
      { token: 'e2e-testing', tool: 'skills-cli', source: 'affaan-m/ECC', skill: 'e2e-testing', tier: 'mandatory', official: false },
      { token: 'shadcn-ui', tool: 'claude-plugin', source: 'agents-inc', skill: 'web-ui-shadcn-ui', tier: 'recommended', official: false },
      { token: 'frontend-design', tool: 'claude-plugin', source: 'claude-plugins-official', skill: 'frontend-design', tier: 'mandatory', official: true },
    ]
    const plan = buildSkillsPlan(src, spyEnv().env)
    const byToken = (t: string): PlannedCommand => plan.commands.find((c) => c.tokens.includes(t))!
    expect(byToken('web-artifacts-builder').official).toBe(true)
    expect(byToken('e2e-testing').official).toBe(false)
    expect(byToken('shadcn-ui').official).toBe(false)
    expect(byToken('frontend-design').official).toBe(true)
  })

  test('③ 幂等:注入 ~/.agents/skills/e2e-testing 已装 → 从 ECC --skill 剔除并标跳过', () => {
    const three = eccSources.slice(0, 3) // browser-qa, e2e-testing, search-first
    const installed = join('/home/test', '.agents', 'skills', 'e2e-testing')
    const { env } = spyEnv({ pathExists: (p) => p === installed })
    const plan = buildSkillsPlan(three, env)
    const ecc = plan.commands.find((c) => c.source === 'affaan-m/ECC')!
    expect(ecc.names).not.toContain('e2e-testing')
    expect(ecc.names).toEqual(expect.arrayContaining(['browser-qa', 'search-first']))
    expect(plan.alreadyInstalled.map((a) => a.token)).toContain('e2e-testing')
  })

  test('③ 幂等:整组已装 → 整条命令剔除', () => {
    const { env } = spyEnv({ pathExists: () => true })
    const plan = buildSkillsPlan(eccSources, env)
    expect(plan.commands.filter((c) => c.source === 'affaan-m/ECC')).toHaveLength(0)
  })

  test('③ 幂等:npm registry 声明的全局 binary 已在 PATH → npm install 整条剔除', () => {
    const src = [{
      token: 'opsx', tool: 'npm', source: '@fission-ai/openspec', bin: 'openspec',
      tier: 'mandatory', official: false,
    }] as SkillSource[]
    const { env } = spyEnv({ commandExists: (name) => name === 'openspec' })
    const plan = buildSkillsPlan(src, env)
    expect(plan.commands.filter((c) => c.group === 'npm')).toHaveLength(0)
    expect(plan.alreadyInstalled).toContainEqual({ token: 'opsx', where: 'PATH:openspec' })
  })

  test('③ 幂等:registry 明示上游 unavailable → 不执行、不反复 WARN 安装失败', () => {
    const src = [{
      token: 'zoom-out', tool: 'skills-cli', source: 'mattpocock/skills', skill: 'zoom-out',
      unavailable: true, tier: 'optional', official: false,
    }] as SkillSource[]
    const plan = buildSkillsPlan(src, spyEnv().env)
    expect(plan.commands).toHaveLength(0)
    expect(plan.noInstall).toContainEqual({ token: 'zoom-out', tool: 'unavailable-upstream' })
  })

  test('③ 幂等：Codex 与 Claude 双 cache 都命中才算 plugin 全就绪，不每次重装', () => {
    const src: SkillSource[] = [
      { token: 'frontend-design', tool: 'claude-plugin', source: 'claude-plugins-official', skill: 'frontend-design', tier: 'mandatory', official: true },
    ]
    const claudeCache = join('/home/test', '.claude', 'plugins', 'cache')
    const codexCache = join('/home/test', '.codex', 'plugins', 'cache')
    const { env } = spyEnv({
      listDir: () => [],
      pathExists: (p) => p === join(claudeCache, 'claude-plugins-official', 'frontend-design')
        || p === join(codexCache, 'claude-plugins-official', 'frontend-design'),
    })
    const plan = buildSkillsPlan(src, env)
    expect(plan.commands.filter((c) => c.group === 'claude-plugin' || c.group === 'codex-plugin')).toHaveLength(0)
    expect(plan.alreadyInstalled.map((a) => a.token)).toContain('frontend-design')
  })

  test('Codex-first：Claude plugin 已装但 Codex cache 缺失，仍计划 codex plugin add，绝不误判全就绪', () => {
    const src: SkillSource[] = [
      { token: 'tailwind-css-patterns', tool: 'claude-plugin', source: 'agents-inc', skill: 'web-styling-tailwind', tier: 'recommended', official: false },
    ]
    const claudePlugin = join('/home/test', '.claude', 'plugins', 'cache', 'agents-inc', 'web-styling-tailwind')
    const codexMarketplace = join('/home/test', '.codex', '.tmp', 'marketplaces', 'agents-inc')
    const { env } = spyEnv({ pathExists: (p) => p === claudePlugin || p === codexMarketplace })

    const plan = buildSkillsPlan(src, env)

    expect(plan.commands.map(cmdText)).toContain('codex plugin add web-styling-tailwind@agents-inc')
    expect(plan.commands.map(cmdText)).not.toContain('claude plugin install web-styling-tailwind@agents-inc')
    expect(plan.alreadyInstalled.map((row) => row.token)).not.toContain('tailwind-css-patterns')
  })

  test('④ cmdSetupSkills --dry-run:spy exec/mutation 调用数 0,计划仍列 ECC 15 个', () => {
    const deps = makeDeps()
    const { env, calls } = spyEnv()
    expect(cmdSetupSkills(deps, { dryRun: true }, env, eccSources)).toBe(0)
    expect(calls.exec).toHaveLength(0)
    expect(calls.mkdirp).toHaveLength(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('--dry-run')
    expect(out).toContain('技能(15)')
  })

  test('⑤ 失败容错:mattpocock 装失败 → 其余仍跑,汇总红字,强制失败 exit 1', () => {
    const src: SkillSource[] = [
      { token: 'grill-with-docs', tool: 'skills-cli', source: 'mattpocock/skills', skill: 'grill-with-docs', tier: 'mandatory', official: false },
      { token: 'hallmark', tool: 'skills-cli', source: 'nutlope/hallmark', tier: 'recommended', official: false },
      { token: 'opsx', tool: 'npm', source: '@fission-ai/openspec', tier: 'mandatory', official: false },
    ]
    const execCalls: Array<[string, string[]]> = []
    const exec: ExecStub = (cmd, args) => {
      execCalls.push([cmd, args])
      if (args.includes('--list')) return { code: 0, stdout: 'grill-with-docs', stderr: '' } // --list 回显名,不制造漂移
      if (args.includes('mattpocock/skills')) return { code: 1, stdout: '', stderr: 'network unreachable' }
      return { code: 0, stdout: '', stderr: '' }
    }
    const deps = makeDeps()
    const { env } = spyEnv({}, exec)
    expect(cmdSetupSkills(deps, { yes: true }, env, src)).toBe(1) // 强制级失败 → 非零
    // 其余仍跑:hallmark + openspec 都被 exec（不 abort）
    expect(execCalls.some(([, a]) => a.includes('nutlope/hallmark'))).toBe(true)
    expect(execCalls.some(([, a]) => a.join(' ').includes('@fission-ai/openspec'))).toBe(true)
    const err = deps.errLines.join('\n')
    expect(err).toContain('mattpocock/skills')
    expect(err).toContain('强制')
  })

  test('⑤ 非强制失败不改退出码:hallmark 失败 → exit 0', () => {
    const src: SkillSource[] = [
      { token: 'hallmark', tool: 'skills-cli', source: 'nutlope/hallmark', tier: 'recommended', official: false },
    ]
    const exec: ExecStub = () => ({ code: 1, stdout: '', stderr: 'boom' })
    const deps = makeDeps()
    const { env } = spyEnv({}, exec)
    expect(cmdSetupSkills(deps, { yes: true }, env, src)).toBe(0)
    expect(deps.errLines.join('\n')).toContain('nutlope/hallmark')
  })

  test('安装命令 exit 0 但请求技能未真正出现在用户级目录 → 不计成功并按真实 tier 失败', () => {
    const src: SkillSource[] = [
      { token: 'browser-qa', tool: 'skills-cli', source: 'affaan-m/ECC', skill: 'browser-qa', tier: 'mandatory', official: false },
    ]
    const exec: ExecStub = (_cmd, args) => args.includes('--list')
      ? { code: 0, stdout: 'browser-qa\n', stderr: '' }
      : { code: 0, stdout: 'installer claimed success', stderr: '' }
    const deps = makeDeps()
    const { env } = spyEnv({}, exec)
    expect(cmdSetupSkills(deps, { yes: true }, env, src)).toBe(1)
    expect(deps.outLines.join('\n')).toContain('成功 0')
    expect(deps.errLines.join('\n')).toContain('命令 exit 0')
    expect(deps.errLines.join('\n')).toContain('browser-qa')
  })

  test('⑥ browser-qa 的 engine → Codex 优先并附加 Claude 兼容的 playwright plugin（官方）', () => {
    const src: SkillSource[] = [
      { token: 'browser-qa', tool: 'skills-cli', source: 'affaan-m/ECC', skill: 'browser-qa', tier: 'mandatory', official: false, engine: 'playwright@claude-plugins-official' },
    ]
    const plan = buildSkillsPlan(src, spyEnv().env)
    expect(plan.commands.map(cmdText)).toContain('claude plugin install playwright@claude-plugins-official')
    expect(plan.commands.map(cmdText)).toContain('codex plugin add playwright@claude-plugins-official')
    const pw = plan.commands.find((c) => c.group === 'claude-plugin' && c.args.includes('playwright@claude-plugins-official'))!
    expect(pw.group).toBe('claude-plugin')
    expect(pw.official).toBe(true)
  })

  test('⑦ 真 registry 全量：不再有任何外部安装命令，所有 token 都由随包 skill 提供', () => {
    const all = readSkillSources()
    expect(all.length).toBeGreaterThan(0) // registry 加载成功
    const plan = buildSkillsPlan(all, spyEnv().env)
    expect(plan.commands).toEqual([])
    expect(plan.noInstall).toHaveLength(all.length)
    expect(plan.noInstall.every((entry) => entry.tool === 'bundled')).toBe(true)
  })
})

describe('⑩ registry 就绪门 —— 坏/缺 registry fail-loud（不空计划假成功），真空 registry 才走无待装', () => {
  const failLoader = (): SkillSourcesResult => ({ ok: false, error: '解析失败: token x tool 非法' })
  const emptyLoader = (): SkillSourcesResult => ({ ok: true, sources: [] })

  test('坏 registry（loader 报失败）→ 非零退出 + 明示 registry 未就绪，不打印「无待装」假成功', () => {
    const deps = makeDeps()
    const { env, calls } = spyEnv()
    const code = cmdSetupSkills(deps, { yes: true }, env, undefined, failLoader)
    expect(code).not.toBe(0) // 非零退出（不假成功）
    const err = deps.errLines.join('\n')
    expect(err).toContain('registry 未就绪')
    expect(err).toContain('解析失败') // 携具体原因
    expect(deps.outLines.join('\n')).not.toContain('无待装') // 绝不当空计划走假成功
    expect(calls.exec).toHaveLength(0) // 未执行任何安装命令
  })

  test('坏 registry + --dry-run 也 fail-loud（零执行，仍非零，不假成功）', () => {
    const deps = makeDeps()
    const { env, calls } = spyEnv()
    const code = cmdSetupSkills(deps, { dryRun: true }, env, undefined, failLoader)
    expect(code).not.toBe(0)
    expect(deps.errLines.join('\n')).toContain('registry 未就绪')
    expect(calls.exec).toHaveLength(0)
  })

  test('真空 registry（合法但无条目）→ 走「无待装」+ exit 0（与坏 registry 区分）', () => {
    const deps = makeDeps()
    const { env } = spyEnv()
    const code = cmdSetupSkills(deps, { yes: true }, env, undefined, emptyLoader)
    expect(code).toBe(0)
    expect(deps.outLines.join('\n')).toContain('无待装')
    expect(deps.errLines.join('\n')).not.toContain('registry 未就绪')
  })
})
