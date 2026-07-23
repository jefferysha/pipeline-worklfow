/**
 * H14 shared AFK executor —— 只测编排接缝，不起真 Docker/Git。
 * 真 binary / image 对账由 automation runner/ports 集成测试覆盖；这里钉死 CLI 共享入口的
 * ordinary/targeted 分流、lazy Docker、host verifier 与 bundled CLI digest 透传。
 */
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createExecutionPreparation,
  GIT_REVISION_VERIFIER_ISSUER_IDENTITY,
  type Automation,
  type DockerRunChangeOptions,
  type ExecutionContext,
  type PreparedExecutionContext,
  type RoundReport,
  type RunChange,
  type TargetedRunCandidate,
  type VerifierPort,
} from '@pipeline-lite/automation'
import { createLoopLedgerStore } from '@pipeline-lite/kernel'
import { makeDeps } from '../test-support.js'
import {
  BundledCliDigestUnavailableError,
  resolveBundledCliDistSha256,
  runAfkRound,
  type AfkExecutorRuntime,
} from './afk-executor.js'

const DIGEST = 'd'.repeat(64)
const TARGETS = [{
  change: 'ready-a',
  expectedLoopId: 'loop-a',
  expectedAutonomyLevel: 'L1',
}] satisfies readonly TargetedRunCandidate[]

const report = (over: Partial<RoundReport> = {}): RoundReport => ({
  candidates: 1,
  admitted: 1,
  entries: [{ change: 'ready-a', loopId: 'loop-a', disposition: 'settled', result: 'paused' }],
  failures: [],
  ledgerFailures: [],
  halted: false,
  ledgerDegraded: false,
  ok: true,
  ...over,
})

const EXECUTION_CONTEXT = {
  attempt_id: 'attempt-a',
  reservation_id: 'reservation-a',
  loop_id: 'loop-a',
  change: 'ready-a',
  level: 'L1',
  runner: 'codex',
  admitted_at: '2026-07-19T00:00:00Z',
  policy_epoch: 'epoch-a',
  reservation: { runs: 1, tokens: 1, token_basis: 'risk-default' },
  skill_bundle_id: null,
} satisfies ExecutionContext

const preparation = createExecutionPreparation({
  repoRoot: '/repo',
  ledger: createLoopLedgerStore(),
  loadRegistry: () => ({ data: null, errors: [] }),
  clock: () => '2026-07-19T00:00:00Z',
  coordinates: {
    capture: async () => { throw new Error('non-loop fixture must not capture workflow coordinates') },
    readCurrentInputsDigest: async () => { throw new Error('non-loop fixture must not read workflow inputs') },
  },
  resolver: {
    resolveDefault: () => [],
    resolveCustom: () => [],
  },
  locator: {
    locate: async () => { throw new Error('non-loop fixture must not locate skills') },
  },
})

async function preparedContext(): Promise<PreparedExecutionContext> {
  const outcome = await preparation.prepare(EXECUTION_CONTEXT)
  if (!outcome.ok) throw new Error(`non-loop fixture preparation failed: ${outcome.detail}`)
  return outcome.context
}

function harness(opts: { invoke?: boolean; denied?: boolean } = {}) {
  const events: string[] = []
  const dockerOptions: DockerRunChangeOptions[] = []
  const verifier: VerifierPort = {
    verify: vi.fn<VerifierPort['verify']>(async () => {
      throw new Error('verifier is not invoked by this orchestration seam')
    }),
  }
  const runRound = vi.fn<Automation['runRound']>(async (runChange) => {
    events.push('runRound')
    if (opts.invoke !== false) await runChange(await preparedContext(), new AbortController().signal)
    return opts.denied
      ? report({ admitted: 0, entries: [{ change: 'ready-a', loopId: 'loop-a', disposition: 'denied', reason: 'budget-runs-exceeded' }] })
      : report()
  })
  const runTargeted = vi.fn<Automation['runTargeted']>(async (targets, runChange) => {
    events.push(`runTargeted:${targets.length}`)
    if (opts.invoke !== false) await runChange(await preparedContext(), new AbortController().signal)
    return report()
  })
  const scanReady = vi.fn<Automation['scanReady']>(async () => ['ready-a'])
  const auto: Automation = {
    config: { enabled: true, defaultOptIn: true, maxParallel: 1, maxRetries: 0, level: 'L1' },
    enqueue: vi.fn<Automation['enqueue']>(async () => true),
    scanReady,
    runRound,
    runTargeted,
  }
  const exec = vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 }))
  const runtime: AfkExecutorRuntime = {
    enforceLoopWiring: vi.fn(async () => ({ blocked: [] })),
    exec,
    currentBranch: vi.fn(async () => 'main'),
    dockerAvailable: vi.fn(async () => {
      events.push('dockerAvailable')
      return true
    }),
    resolveCliDistSha256: vi.fn(async () => DIGEST),
    createAutomation: vi.fn(() => auto),
    createGitRevisionVerifier: vi.fn(() => verifier),
    createDockerRunChange: vi.fn((options: DockerRunChangeOptions): RunChange => {
      events.push('createDockerRunChange')
      dockerOptions.push(options)
      return async () => ({ commits: [], verifyResult: 'pass', phaseEvent: 'verify-pass' })
    }),
  }
  return { runtime, events, dockerOptions, verifier, auto, scanReady, runRound, runTargeted }
}

describe('runAfkRound · H14 shared executor', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('普通 run 调 Automation.runRound；第一次真实 runChange 才探 Docker，并透传 L3 verifier + CLI digest', async () => {
    const h = harness()
    const result = await runAfkRound(makeDeps({ cwd: '/repo' }), { level: 'L3', image: 'sandcastle:test' }, h.runtime)

    expect(result.status).toBe('completed')
    expect(h.runRound).toHaveBeenCalledOnce()
    expect(h.runTargeted).not.toHaveBeenCalled()
    expect(h.events).toEqual(['runRound', 'dockerAvailable', 'createDockerRunChange'])
    expect(h.runtime.createGitRevisionVerifier).toHaveBeenCalledWith(h.runtime.exec)
    expect(h.dockerOptions).toHaveLength(1)
    expect(h.dockerOptions[0]).toMatchObject({
      level: 'L3',
      image: 'sandcastle:test',
      verifier: h.verifier,
      verifierExpectedIssuerIdentity: GIT_REVISION_VERIFIER_ISSUER_IDENTITY,
      imageExpectation: { cliDistSha256: DIGEST },
    })
    expect(typeof h.dockerOptions[0]?.usageJournal?.recordProviderUsage).toBe('function')
  })

  it('targets 存在时只调 Automation.runTargeted，并原样传递已解析归属', async () => {
    const h = harness()
    const result = await runAfkRound(makeDeps({ cwd: '/repo' }), { level: 'L1', targets: TARGETS }, h.runtime)

    expect(result.status).toBe('completed')
    expect(h.runRound).not.toHaveBeenCalled()
    expect(h.runTargeted).toHaveBeenCalledWith(TARGETS, expect.any(Function))
    expect(h.runtime.enforceLoopWiring).toHaveBeenCalledWith(
      expect.anything(),
      ['loop-a'],
    )
  })

  it('H11：active loop wiring invalid → AFK 在 scan/reservation/Docker 前阻断（无 ready 也必须检查）', async () => {
    const h = harness()
    h.runtime.enforceLoopWiring = vi.fn(async () => ({
      blocked: [{
        loopId: 'loop-a', status: 'invalid' as const, dimension: 'workflow' as const,
        reason: 'workflow missing',
      }],
    }))

    const result = await runAfkRound(makeDeps({ cwd: '/repo' }), { level: 'L1' }, h.runtime)

    expect(result).toMatchObject({
      status: 'configuration-error', ready: [], message: expect.stringMatching(/loop-a.*workflow.*missing/i),
    })
    expect(h.runtime.createAutomation).not.toHaveBeenCalled()
    expect(h.scanReady).not.toHaveBeenCalled()
    expect(h.runtime.dockerAvailable).not.toHaveBeenCalled()
  })

  it('H11：同一 guard 还真接进 reserve 后/claim 前 scheduler validator，返回已 CAS 暂停标记', async () => {
    const h = harness({ invoke: false })
    const enforce = h.runtime.enforceLoopWiring as ReturnType<typeof vi.fn>
    enforce
      .mockResolvedValueOnce({ blocked: [] })
      .mockResolvedValueOnce({
        blocked: [{
          loopId: 'loop-a', status: 'invalid', dimension: 'skill-bundle', reason: 'skill removed',
        }],
      })

    const result = await runAfkRound(makeDeps({ cwd: '/repo' }), { level: 'L1' }, h.runtime)
    expect(result.status).toBe('completed')
    const createCalls = (h.runtime.createAutomation as ReturnType<typeof vi.fn>).mock.calls
    const productionDeps = createCalls.at(-1)?.[0]
    expect(productionDeps.validateExecutionWiring).toBeTypeOf('function')

    await expect(productionDeps.validateExecutionWiring(EXECUTION_CONTEXT)).resolves.toEqual({
      ok: false,
      status: 'invalid',
      dimension: 'skill-bundle',
      reason: 'skill removed',
      governancePaused: true,
    })
    expect(enforce).toHaveBeenLastCalledWith(expect.anything(), ['loop-a'])
  })

  it('ordinary AFK 与 targeted loop 的预扫描失败都原样上抛，不伪装成空队列', async () => {
    const cases: Array<readonly TargetedRunCandidate[] | undefined> = [undefined, TARGETS]
    for (const targets of cases) {
      const h = harness({ invoke: false })
      const scanError = Object.assign(new Error('simulated scan EIO'), { code: 'EIO' })
      h.scanReady.mockRejectedValueOnce(scanError)

      const run = runAfkRound(
        makeDeps({ cwd: '/repo' }),
        targets === undefined ? { level: 'L1' } : { level: 'L1', targets },
        h.runtime,
      )
      await expect(run).rejects.toBe(scanError)
      expect(h.runRound).not.toHaveBeenCalled()
      expect(h.runTargeted).not.toHaveBeenCalled()
    }
  })

  it('admission/budget 全拒绝且 runChange 从未被调用 → Docker 探针、digest、Docker factory 均 0 次', async () => {
    const h = harness({ invoke: false, denied: true })
    const result = await runAfkRound(makeDeps({ cwd: '/repo' }), { level: 'L1' }, h.runtime)

    expect(result.status).toBe('completed')
    expect(result.report?.admitted).toBe(0)
    expect(h.runtime.dockerAvailable).not.toHaveBeenCalled()
    expect(h.runtime.resolveCliDistSha256).not.toHaveBeenCalled()
    expect(h.runtime.createDockerRunChange).not.toHaveBeenCalled()
  })

  it('首次实际执行发现 Docker 不可用 → 结构化 docker-unavailable，不伪装 completed', async () => {
    const h = harness()
    h.runtime.dockerAvailable = vi.fn(async () => false)

    const result = await runAfkRound(makeDeps({ cwd: '/repo' }), { level: 'L1' }, h.runtime)
    expect(result.status).toBe('docker-unavailable')
    expect(h.runtime.resolveCliDistSha256).not.toHaveBeenCalled()
    expect(h.runtime.createDockerRunChange).not.toHaveBeenCalled()
  })

  it('bundled CLI digest 无法确认时 fail-loud 为结构化 configuration-error，不宣称 completed', async () => {
    const h = harness()
    h.runtime.resolveCliDistSha256 = vi.fn(async () => {
      throw new BundledCliDigestUnavailableError('/tmp/source/afk-executor.ts')
    })

    const result = await runAfkRound(makeDeps({ cwd: '/repo' }), { level: 'L1' }, h.runtime)
    expect(result.status).toBe('configuration-error')
    expect(result.message).toMatch(/pipeline\.mjs|bundle|digest/i)
    expect(h.runtime.createDockerRunChange).not.toHaveBeenCalled()
  })

  it('Codex-first：process.env.CODEX_HOME 缺席但 ~/.codex/auth.json 可读 → hostEnv 注入该 ~/.codex', async () => {
    const home = await mkdtemp(join(tmpdir(), 'afk-codex-home-'))
    vi.stubEnv('CODEX_HOME', '')
    await mkdir(join(home, '.codex'), { recursive: true })
    await writeFile(join(home, '.codex', 'auth.json'), '{"token":"test-only"}\n')
    const h = harness()
    h.runtime.homeDir = () => home

    try {
      const result = await runAfkRound(makeDeps({ cwd: '/repo' }), { level: 'L1' }, h.runtime)
      expect(result.status).toBe('completed')
      expect(h.dockerOptions[0]?.hostEnv).toMatchObject({ CODEX_HOME: join(home, '.codex') })
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })
})

describe('resolveBundledCliDistSha256 · 只认运行中的 dist/pipeline.mjs', () => {
  const roots: string[] = []
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
  })

  it('确认 packages/cli/dist/pipeline.mjs 后按真实字节计算 sha256', async () => {
    const root = await mkdtemp(join(tmpdir(), 'afk-cli-digest-'))
    roots.push(root)
    const path = join(root, 'packages', 'cli', 'dist', 'pipeline.mjs')
    await mkdir(join(root, 'packages', 'cli', 'dist'), { recursive: true })
    await writeFile(path, 'bundled-cli-bytes\n')

    await expect(resolveBundledCliDistSha256(pathToFileURL(path).href)).resolves.toBe(
      createHash('sha256').update('bundled-cli-bytes\n').digest('hex'),
    )
  })

  it('源码 afk-executor.ts 即使可读也拒绝，绝不把源码/测试文件 sha 冒充镜像期望', async () => {
    const root = await mkdtemp(join(tmpdir(), 'afk-cli-source-'))
    roots.push(root)
    const path = join(root, 'packages', 'cli', 'src', 'commands', 'afk-executor.ts')
    await mkdir(join(root, 'packages', 'cli', 'src', 'commands'), { recursive: true })
    await writeFile(path, 'source-bytes\n')

    await expect(resolveBundledCliDistSha256(pathToFileURL(path).href))
      .rejects.toBeInstanceOf(BundledCliDigestUnavailableError)
  })
})
