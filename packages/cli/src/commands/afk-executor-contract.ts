import { createHash } from 'node:crypto'
import { readFile, realpath } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  createAutomation,
  createDockerRunChange,
  createGitRevisionVerifier,
  dockerAvailable,
  nodeExec,
  type AutomationLevel,
  type ExecFn,
  type LoopExecutionGuardResult,
  type RoundReport,
  type TargetedRunCandidate,
} from '@tenon/automation'
import type { CliDeps } from '../deps.js'

const SHA256_HEX = /^[0-9a-f]{64}$/
const BUNDLED_CLI_SUFFIX = '/packages/cli/dist/tenon.mjs'

export class BundledCliDigestUnavailableError extends Error {
  override readonly name = 'BundledCliDigestUnavailableError'
  readonly _tag = 'BundledCliDigestUnavailableError'

  constructor(path: string, detail = '运行文件不是可确认的 packages/cli/dist/tenon.mjs') {
    super(`无法取得可信 Tenon CLI bundle digest（${path}）：${detail}`)
  }
}

export class DockerUnavailableError extends Error {
  override readonly name = 'DockerUnavailableError'
  readonly _tag = 'DockerUnavailableError'
}

export class AfkConfigurationError extends Error {
  override readonly name = 'AfkConfigurationError'
  readonly _tag = 'AfkConfigurationError'
}

export function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  try {
    return String(error)
  } catch {
    return 'unknown error'
  }
}

export async function resolveBundledCliDistSha256(
  moduleUrl: string = import.meta.url,
): Promise<string> {
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
    throw new BundledCliDigestUnavailableError(
      candidate,
      `realpath/read 失败：${messageOf(error)}`,
    )
  }
  if (!resolved.replaceAll('\\', '/').endsWith(BUNDLED_CLI_SUFFIX)) {
    throw new BundledCliDigestUnavailableError(resolved)
  }
  try {
    return createHash('sha256').update(await readFile(resolved)).digest('hex')
  } catch (error) {
    throw new BundledCliDigestUnavailableError(resolved, `读取 bundle 失败：${messageOf(error)}`)
  }
}

export function assertBundledCliDigest(value: string): void {
  if (!SHA256_HEX.test(value)) {
    throw new BundledCliDigestUnavailableError(
      'injected/runtime digest',
      '必须是 64 位小写 sha256',
    )
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
      readonly status: 'docker-unavailable' | 'configuration-error'
      readonly level: AutomationLevel
      readonly image: string
      readonly ready: readonly string[]
      readonly report?: RoundReport
      readonly message: string
    }

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
  enforceLoopWiring?: (
    deps: CliDeps,
    loopIds: readonly string[] | undefined,
  ) => Promise<LoopExecutionGuardResult>
}

export async function branchWith(cwd: string, exec: ExecFn): Promise<string> {
  const result = await exec('git', ['branch', '--show-current'], { cwd })
  return result.exitCode === 0 ? result.stdout.trim() : ''
}

export async function probeGitCommitAncestry(
  cwd: string,
  ancestorCommit: string,
  descendantCommit: string,
  exec: ExecFn = nodeExec,
): Promise<boolean> {
  const result = await exec(
    'git',
    ['merge-base', '--is-ancestor', ancestorCommit, descendantCommit],
    { cwd },
  )
  if (result.exitCode === 0) return true
  if (result.exitCode === 1) return false
  throw new Error(
    `git merge-base --is-ancestor failed (exit ${result.exitCode}): ` +
      result.stderr.slice(0, 160),
  )
}

export function selectedReady(
  ready: readonly string[],
  targets: readonly TargetedRunCandidate[] | undefined,
): readonly string[] {
  if (targets === undefined) return ready
  const selected = new Set(targets.map((target) => target.change))
  return ready.filter((change) => selected.has(change))
}
