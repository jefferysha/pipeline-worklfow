/**
 * H14 shared AFK executor.
 *
 * `afk run` 与 `loop run` 共用这一份生产装配：loop admission、skill-bundle preparation、
 * durable merge journal、host verifier 与 Docker RunChange。函数只返回结构化结果；终端渲染与
 * exit code 仍由命令层负责。
 */
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { access, readFile, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createAutomation,
  createDockerRunChange,
  createExecutionPreparation,
  createGitRevisionVerifier,
  createLoopAdmission,
  enforceActiveLoopExecutionWiring,
  pathPolicyForLoop,
  dockerAvailable,
  getAutomation,
  GIT_REVISION_VERIFIER_ISSUER_IDENTITY,
  nodeExec,
  readAutomationJson,
  sanitize,
  setAutomationOwned,
  type Automation,
  type AutomationLevel,
  type DockerRunChangeOptions,
  type ExecFn,
  type ExecutionLiveness,
  type ExecutionPreparationPort,
  type LoopExecutionGuardResult,
  type LoopAdmission,
  type RoundReport,
  type RunChange,
  type TargetedRunCandidate,
  type VerifierPort,
} from '@pipeline-lite/automation'
import {
  createLoopLedgerStore,
  loadRegistry,
  nodeLoopIoStrict,
  readRegistrySnapshot,
  updateLoopInYaml,
  withLoopMergePermit,
  withLoopStartPermit,
  writeRegistryWithGovernance,
} from '@pipeline-lite/kernel'
import type { CliDeps } from '../deps.js'
import { changeDir } from '../paths.js'
import { str } from '../render.js'
import { createExecutionCoordinatePort, createProductionSkillContentLocator } from '../skillBundleAssembly.js'

const DEFAULT_SANDCASTLE_IMAGE = 'sandcastle:local'
const SHA256_HEX = /^[0-9a-f]{64}$/
const BUNDLED_CLI_SUFFIX = '/packages/cli/dist/pipeline.mjs'

export class BundledCliDigestUnavailableError extends Error {
  override readonly name = 'BundledCliDigestUnavailableError'
  readonly _tag = 'BundledCliDigestUnavailableError'

  constructor(path: string, detail = '运行文件不是可确认的 packages/cli/dist/pipeline.mjs') {
    super(`无法取得可信 pipeline CLI bundle digest（${path}）：${detail}`)
  }
}

class DockerUnavailableError extends Error {
  override readonly name = 'DockerUnavailableError'
  readonly _tag = 'DockerUnavailableError'
}

class AfkConfigurationError extends Error {
  override readonly name = 'AfkConfigurationError'
  readonly _tag = 'AfkConfigurationError'
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : (() => {
    try { return String(error) } catch { return 'unknown error' }
  })()

/**
 * 只对当前运行文件确认为 `packages/cli/dist/pipeline.mjs` 的 bundle 取摘要。源码、测试文件、
 * 任意同名字节都不接受，避免把 host 源码 SHA 当成镜像内 CLI 的期望值。
 */
export async function resolveBundledCliDistSha256(moduleUrl: string = import.meta.url): Promise<string> {
  let candidate: string
  try {
    candidate = fileURLToPath(moduleUrl)
  } catch (error) {
    throw new BundledCliDigestUnavailableError(moduleUrl, messageOf(error))
  }

  let resolved: string
  try {
    resolved = await realpath(candidate)
  } catch (error) {
    throw new BundledCliDigestUnavailableError(candidate, `realpath/read 失败：${messageOf(error)}`)
  }
  const normalized = resolved.replaceAll('\\', '/')
  if (!normalized.endsWith(BUNDLED_CLI_SUFFIX)) {
    throw new BundledCliDigestUnavailableError(resolved)
  }
  try {
    return createHash('sha256').update(await readFile(resolved)).digest('hex')
  } catch (error) {
    throw new BundledCliDigestUnavailableError(resolved, `读取 bundle 失败：${messageOf(error)}`)
  }
}

export interface RunAfkRoundOptions {
  readonly level: AutomationLevel
  readonly image?: string
  readonly targets?: readonly TargetedRunCandidate[]
}

export type AfkRoundExecutionResult =
  | {
      readonly status: 'empty'
      readonly level: AutomationLevel
      readonly image: string
      readonly ready: readonly string[]
      readonly report?: RoundReport
    }
  | {
      readonly status: 'completed'
      readonly level: AutomationLevel
      readonly image: string
      readonly ready: readonly string[]
      readonly report: RoundReport
    }
  | {
      readonly status: 'docker-unavailable'
      readonly level: AutomationLevel
      readonly image: string
      readonly ready: readonly string[]
      readonly report?: RoundReport
      readonly message: string
    }
  | {
      readonly status: 'configuration-error'
      readonly level: AutomationLevel
      readonly image: string
      readonly ready: readonly string[]
      readonly report?: RoundReport
      readonly message: string
    }

/**
 * 明确的生产依赖面。所有字段都只供 hermetic 测试显式替换；缺省值严格是生产实现。
 * `resolveCliDistSha256` 是测试注入可信 digest 的唯一通道，生产永远走 import.meta.url 自证。
 */
export interface AfkExecutorRuntime {
  exec?: ExecFn
  currentBranch?: (cwd: string) => Promise<string>
  dockerAvailable?: typeof dockerAvailable
  resolveCliDistSha256?: () => Promise<string>
  createAutomation?: typeof createAutomation
  createDockerRunChange?: typeof createDockerRunChange
  createGitRevisionVerifier?: typeof createGitRevisionVerifier
  homeDir?: () => string
  canReadFile?: (path: string) => Promise<void>
  /** H11 hermetic seam；缺省走下面的真实 registry/evaluator/governance-CAS guard。 */
  enforceLoopWiring?: (
    deps: CliDeps,
    loopIds: readonly string[] | undefined,
  ) => Promise<LoopExecutionGuardResult>
}

const branchWith = async (cwd: string, exec: ExecFn): Promise<string> => {
  const result = await exec('git', ['branch', '--show-current'], { cwd })
  return result.exitCode === 0 ? result.stdout.trim() : ''
}

/** 真 Git ancestry probe；只信 `git merge-base --is-ancestor` 的 exit code。 */
export async function probeGitCommitAncestry(
  cwd: string,
  ancestorCommit: string,
  descendantCommit: string,
  exec: ExecFn = nodeExec,
): Promise<boolean> {
  const result = await exec('git', ['merge-base', '--is-ancestor', ancestorCommit, descendantCommit], { cwd })
  if (result.exitCode === 0) return true
  if (result.exitCode === 1) return false
  throw new Error(
    `git merge-base --is-ancestor failed (exit ${result.exitCode}): ${result.stderr.slice(0, 160)}`,
  )
}

const selectedReady = (
  ready: readonly string[],
  targets: readonly TargetedRunCandidate[] | undefined,
): readonly string[] => {
  if (targets === undefined) return ready
  const selected = new Set(targets.map((target) => target.change))
  return ready.filter((change) => selected.has(change))
}

/**
 * 普通 AFK 未指定 loop 时检查当前 registry 的全部 active loops；targeted run 只检查 selector 已冻结的
 * expected loop。缺 registry 代表非 loop AFK，合法放行；坏 registry 则 fail-loud。
 */
export async function enforceProductionLoopWiring(
  deps: CliDeps,
  loopIds: readonly string[] | undefined,
  home = homedir(),
): Promise<LoopExecutionGuardResult> {
  let selected = loopIds
  if (selected === undefined) {
    const snapshot = await readRegistrySnapshot(deps.cwd)
    if (snapshot.registry === null) {
      if (snapshot.errors.length === 0) return { blocked: [] }
      throw new Error(`loops registry 无法校验：${snapshot.errors.join('；')}`)
    }
    selected = snapshot.registry.loops
      .filter((loop) => loop.status === 'active')
      .map((loop) => loop.id)
  }
  if (selected.length === 0) return { blocked: [] }

  const wiringForRunner = (runner: string) => ({
    resolver: deps.resolver,
    locator: createProductionSkillContentLocator({
      pluginRoot: deps.doctor?.pluginRoot,
      home,
      runner,
    }),
    isSkillProfileKnown: deps.isSkillProfileKnown,
  })
  return enforceActiveLoopExecutionWiring(selected, {
    repoRoot: deps.cwd,
    wiring: {
      repoRoot: deps.cwd,
      skillBundleWiring: wiringForRunner('codex'),
      skillBundleWiringForLoop: (loop) => wiringForRunner(loop.runner),
    },
  })
}

/**
 * 跑一轮 AFK。Docker 探针、base 分支与 bundle digest 都在第一次 `RunChange` 调用时才初始化；
 * 因此 admission/budget 全拒绝时不会触碰 Docker，也不会把源码测试环境误当生产 bundle。
 */
export async function runAfkRound(
  deps: CliDeps,
  options: RunAfkRoundOptions,
  runtime: AfkExecutorRuntime = {},
): Promise<AfkRoundExecutionResult> {
  const exec = runtime.exec ?? nodeExec
  const createAutomationFn = runtime.createAutomation ?? createAutomation
  const createDockerRunChangeFn = runtime.createDockerRunChange ?? createDockerRunChange
  const createGitRevisionVerifierFn = runtime.createGitRevisionVerifier ?? createGitRevisionVerifier
  const dockerAvailableFn = runtime.dockerAvailable ?? dockerAvailable
  const currentBranchFn = runtime.currentBranch ?? ((cwd: string) => branchWith(cwd, exec))
  const resolveCliDistSha256 = runtime.resolveCliDistSha256 ?? (() => resolveBundledCliDistSha256())
  const homeDir = runtime.homeDir ?? homedir
  const canReadFile = runtime.canReadFile ?? ((path: string) => access(path, constants.R_OK))
  const { level } = options
  const image = options.image ?? readAutomationJson(deps.cwd).image ?? DEFAULT_SANDCASTLE_IMAGE

  // H11：必须早于 scanReady/admission/reservation/Docker。即使队列为空，调用真实 run 也会 fresh
  // 检查 active loop，并把 invalid/unwired 经治理 CAS 暂停；任何 guard I/O/CAS 错均非成功。
  const targetedLoopIds = options.targets === undefined
    ? undefined
    : [...new Set(options.targets.map((target) => target.expectedLoopId))]
  const enforceLoopWiring = (loopIds: readonly string[] | undefined) =>
    runtime.enforceLoopWiring === undefined
      ? enforceProductionLoopWiring(deps, loopIds, homeDir())
      : runtime.enforceLoopWiring(deps, loopIds)
  let wiringGuard: LoopExecutionGuardResult
  try {
    wiringGuard = await enforceLoopWiring(targetedLoopIds)
  } catch (error) {
    return {
      status: 'configuration-error', level, image, ready: [],
      message: `loop execution wiring guard 失败：${messageOf(error)}`,
    }
  }
  if (wiringGuard.blocked.length > 0) {
    const detail = wiringGuard.blocked
      .map((block) => `${block.loopId}[${block.dimension}/${block.status}]: ${block.reason}`)
      .join('；')
    return {
      status: 'configuration-error', level, image, ready: [],
      message: `active loop wiring 无法执行，已治理暂停：${detail}`,
    }
  }

  // 预扫描只用于结构化渲染；执行 API 自己会 fresh scan，不能拿这份快照直接 claim。
  const scanAuto = createAutomationFn({
    repoRoot: deps.cwd,
    store: deps.store,
    clock: deps.clock,
    config: { level },
  })
  const ready = await scanAuto.scanReady()
  const visibleReady = selectedReady(ready, options.targets)
  if (options.targets === undefined && visibleReady.length === 0) {
    return { status: 'empty', level, image, ready: visibleReady }
  }

  const ledger = createLoopLedgerStore()
  const getExecutionLiveness = async (change: string): Promise<ExecutionLiveness> => {
    try {
      const sandbox = str(await deps.store.get(changeDir(deps.cwd, change), 'automation_sandbox'))
      if (!sandbox) return 'unknown'
      const result = await exec('docker', ['inspect', '-f', '{{.State.Running}}', sandbox])
      if (result.exitCode !== 0) return 'dead'
      return result.stdout.trim() === 'true' ? 'alive' : 'dead'
    } catch {
      return 'unknown'
    }
  }

  const admission: LoopAdmission = createLoopAdmission({
    repoRoot: deps.cwd,
    ledger,
    loadRegistry: (root) => loadRegistry(root, nodeLoopIoStrict),
    clock: deps.clock,
    level,
    image,
    getAutomation: (change) => getAutomation(deps.store, changeDir(deps.cwd, change)),
    getExecutionLiveness,
    resetScheduledToQueued: (change) => setAutomationOwned(deps.store, changeDir(deps.cwd, change), 'queued'),
    failRunningToTerminal: (change) => setAutomationOwned(deps.store, changeDir(deps.cwd, change), 'failed'),
    readGitRef: async (ref) => {
      const result = await exec('git', ['rev-parse', ref], { cwd: deps.cwd })
      if (result.exitCode !== 0) throw new Error(`git rev-parse ${ref} failed: ${result.stderr.slice(0, 160)}`)
      return result.stdout.trim()
    },
    isCommitAncestor: (ancestorCommit, descendantCommit) =>
      probeGitCommitAncestry(deps.cwd, ancestorCommit, descendantCommit, exec),
    commitRecoveredMerge: async (change, recovered) => {
      const dir = changeDir(deps.cwd, change)
      for (let attempt = 0; attempt < 3; attempt++) {
        const observed = await getAutomation(deps.store, dir)
        if (observed === '') throw new Error(`merge recovery: automation 状态缺失（${change}）`)
        const won = await deps.store.casMany(dir, 'automation', [observed], {
          automation: 'merged',
          automation_cause: recovered.cause === 'completed' ? '' : recovered.cause,
          automation_last_error: recovered.cause === 'completed' ? '' : sanitize(recovered.message),
          automation_attempts: '0',
        })
        if (won) return
      }
      throw new Error(`merge recovery: 连续 CAS 失败（${change}）`)
    },
    isSkillProfileKnown: deps.isSkillProfileKnown,
    bindAutomationPolicy: (change, policy, binding) =>
      deps.runRepo.bindAutomationPolicy(changeDir(deps.cwd, change), policy, binding),
  })

  const preparation: ExecutionPreparationPort = createExecutionPreparation({
    repoRoot: deps.cwd,
    ledger,
    loadRegistry: (root) => loadRegistry(root, nodeLoopIoStrict),
    clock: deps.clock,
    coordinates: createExecutionCoordinatePort({ store: deps.store, repoRoot: deps.cwd }),
    resolver: deps.resolver,
    locator: createProductionSkillContentLocator({
      pluginRoot: deps.doctor?.pluginRoot, home: homeDir(), runner: 'claude-code',
    }),
    locatorForRunner: (runner) => createProductionSkillContentLocator({
      pluginRoot: deps.doctor?.pluginRoot, home: homeDir(), runner,
    }),
  })

  const pauseLoop = async (loopId: string): Promise<void> => {
    const snapshot = await readRegistrySnapshot(deps.cwd)
    if (snapshot.registry === null) throw new Error(`pause loop「${loopId}」失败：loops.yaml 缺失或不可解析`)
    const result = await writeRegistryWithGovernance(
      deps.cwd,
      snapshot.epoch,
      (current) => updateLoopInYaml(current, loopId, { status: 'paused' }),
    )
    if (!result.ok) throw new Error(`pause loop「${loopId}」失败：${result.error}`)
  }

  const resolvePathPolicy = async (loopId: string) => {
    const registry = loadRegistry(deps.cwd)
    if (registry.data === null) throw new Error(`loop path policy registry unavailable for '${loopId}'`)
    return pathPolicyForLoop(registry.data.loops, loopId)
  }

  const secretsEnv: Record<string, string> = deps.readSecretsEnv
    ? await deps.readSecretsEnv().catch(() => ({}))
    : {}
  const hostEnv: Record<string, string | undefined> = { ...secretsEnv }
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && value !== '') hostEnv[key] = value
  }
  // Codex Desktop/CLI 登录的常态是 ~/.codex/auth.json 存在但 shell 未显式 export CODEX_HOME。
  // 只在任何上游都没有非空 CODEX_HOME 时探测默认目录；凭证内容不读取、不回显，只把目录交给
  // dockerRunChange 的 Codex runner 白名单与 ports 挂载逻辑。
  if (hostEnv.CODEX_HOME === undefined || hostEnv.CODEX_HOME === '') {
    const defaultCodexHome = join(homeDir(), '.codex')
    try {
      await canReadFile(join(defaultCodexHome, 'auth.json'))
      hostEnv.CODEX_HOME = defaultCodexHome
    } catch {
      // 没有可读的默认登录凭证不是 executor 配置错误；Codex 真运行会按现有认证路径 fail-loud。
    }
  }

  let dockerUnavailable = false
  let bootstrapError: unknown
  let runChangePromise: Promise<RunChange> | undefined
  const buildRunChange = (): Promise<RunChange> => {
    runChangePromise ??= (async () => {
      const hasDocker = await dockerAvailableFn((file, args) => exec(file, args))
      if (!hasDocker) {
        dockerUnavailable = true
        throw new DockerUnavailableError('docker daemon 不可用')
      }

      const base = await currentBranchFn(deps.cwd)
      if (!base) {
        throw new AfkConfigurationError(
          'run 需在 git 仓库命名分支内（取不到当前分支，merge-back 无锚点）',
        )
      }
      const cliDistSha256 = await resolveCliDistSha256()
      if (!SHA256_HEX.test(cliDistSha256)) {
        throw new BundledCliDigestUnavailableError('injected/runtime digest', '必须是 64 位小写 sha256')
      }

      const verifier: VerifierPort | undefined = level === 'L3'
        ? createGitRevisionVerifierFn(exec)
        : undefined
      const dockerOptions: DockerRunChangeOptions = {
        hostRepoDir: deps.cwd,
        base,
        level,
        image,
        store: deps.store,
        clock: deps.clock,
        resolvePathPolicy,
        checkActive: (loopId) => admission.isActive(loopId),
        hostEnv,
        imageExpectation: { cliDistSha256 },
        usageJournal: {
          recordProviderUsage: async (input) => {
            await admission.recordProviderUsage(input.context, input.usage)
          },
        },
        mergeJournal: {
          recordMergeIntent: (input) => admission.recordMergeIntent({
            context: input.context,
            baseRef: input.draft.baseRef,
            baseBefore: input.draft.baseBefore,
            branchRef: input.draft.branchRef,
            branchTip: input.draft.branchTip,
            mergedCommit: input.draft.mergedCommit,
            verification: input.verification,
            verifyResult: input.verifyResult,
            buildSha: input.buildSha,
            branch: input.branch,
            commitShas: input.commits.map((commit) => commit.sha),
          }),
          recordMergeLanded: (input) => admission.recordMergeLanded({
            context: input.context,
            intentRecordId: input.intentRecordId,
            baseRef: `refs/heads/${base.replace(/^refs\/heads\//, '')}`,
            baseBefore: input.receipt.baseBefore,
            branchTip: input.receipt.branchTip,
            mergedCommit: input.receipt.mergedCommit,
            hostSynced: input.receipt.hostSynced,
            hostSyncError: input.receipt.hostSyncError,
          }),
        },
        startPermit: (loopId, prepared, fn) => withLoopStartPermit(deps.cwd, loopId, prepared, fn),
        mergePermit: (loopId, prepared, fn, verifyBase) =>
          withLoopMergePermit(deps.cwd, loopId, prepared, fn, verifyBase),
        ...(verifier === undefined
          ? {}
          : {
              verifier,
              verifierExpectedIssuerIdentity: GIT_REVISION_VERIFIER_ISSUER_IDENTITY,
            }),
      }
      return createDockerRunChangeFn(dockerOptions)
    })().catch((error: unknown) => {
      bootstrapError = error
      throw error
    })
    return runChangePromise
  }

  const lazyRunChange: RunChange = async (context, signal) =>
    (await buildRunChange())(context, signal)

  const automation: Automation = createAutomationFn({
    repoRoot: deps.cwd,
    store: deps.store,
    clock: deps.clock,
    config: { level },
    admission,
    pauseLoop,
    image,
    preparation,
    validateExecutionWiring: async (context) => {
      const guarded = await enforceLoopWiring([context.loop_id])
      const block = guarded.blocked.find((item) => item.loopId === context.loop_id)
      return block === undefined
        ? { ok: true }
        : {
            ok: false,
            status: block.status,
            dimension: block.dimension,
            reason: block.reason,
            governancePaused: true,
          }
    },
  })

  let report: RoundReport | undefined
  try {
    report = options.targets === undefined
      ? await automation.runRound(lazyRunChange)
      : await automation.runTargeted(options.targets, lazyRunChange)
  } catch (error) {
    if (dockerUnavailable) {
      return {
        status: 'docker-unavailable', level, image, ready: visibleReady,
        message: 'docker daemon 不可用',
      }
    }
    return {
      status: 'configuration-error', level, image, ready: visibleReady,
      message: messageOf(bootstrapError ?? error),
    }
  }

  if (dockerUnavailable) {
    return {
      status: 'docker-unavailable', level, image, ready: visibleReady, report,
      message: 'docker daemon 不可用',
    }
  }
  if (bootstrapError !== undefined) {
    return {
      status: 'configuration-error', level, image, ready: visibleReady, report,
      message: messageOf(bootstrapError),
    }
  }
  if (report.candidates === 0) {
    return { status: 'empty', level, image, ready: visibleReady, report }
  }
  return { status: 'completed', level, image, ready: visibleReady, report }
}
