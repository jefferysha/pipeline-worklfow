import { dirname, isAbsolute, join, normalize } from 'node:path'
import type { CliDeps } from '../deps.js'
import { LEGACY_PLUGIN_IDENTITY } from '../migration/legacy-tenon-migration.js'
import { resolveRuntimePaths } from '../runtime/paths.js'
import type { SetupEnv } from './setupEnvironment.js'
import type {
  HostPluginScope,
  NativePipelineHost,
} from './plugin-host.js'
import type { StableReleaseTarget } from './stable-release.js'

export interface HostPluginConvergenceReceipt {
  readonly version: 4
  /** Managed release WAL owner; makes evidence replay a compare-and-return operation. */
  readonly transactionId: string
  readonly state: 'cleanup-pending' | 'completed'
  readonly host: NativePipelineHost
  readonly conflictPluginId: string
  readonly conflictScopes: readonly HostPluginScope[]
  readonly releaseId: string
  readonly releaseRoot: string
  readonly candidateRoot: string
  /** Absent only on decoded v2/v3 receipts; recovery re-derives and proves their release tag. */
  readonly stableTarget?: StableReleaseTarget
  readonly createdAtEpoch: number
  readonly updatedAt: string
}

export interface HostPluginConvergencePaths {
  readonly receiptPath: string
  readonly sessionProofPath: string
}

export type ConvergenceRead =
  | { readonly state: 'none' }
  | { readonly state: 'invalid'; readonly detail: string }
  | { readonly state: 'receipt'; readonly receipt: HostPluginConvergenceReceipt }

export function hostPluginConvergencePaths(
  env: SetupEnv,
  host: NativePipelineHost,
): HostPluginConvergencePaths {
  const paths = resolveRuntimePaths({ homeDir: env.homeDir(), env: env.runtimeEnv() })
  return {
    receiptPath: join(paths.migrationsRoot, 'host-plugin-convergence', `${host}.json`),
    sessionProofPath: join(paths.stateRoot, 'migration', 'tenon-session-loaded'),
  }
}

function isReleaseId(value: unknown): value is string {
  return typeof value === 'string' && /^sha256-[a-f0-9]{64}$/.test(value)
}

function parseStableTarget(value: unknown): StableReleaseTarget | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const target = value as Partial<StableReleaseTarget>
  return typeof target.version === 'string'
    && /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(target.version)
    && target.tag === `v${target.version}`
    && typeof target.commit === 'string'
    && /^[a-f0-9]{40}$/.test(target.commit)
    ? { version: target.version, tag: target.tag, commit: target.commit }
    : null
}

function parseReceipt(raw: string, host: NativePipelineHost): HostPluginConvergenceReceipt | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const receipt = value as Partial<HostPluginConvergenceReceipt>
  const receiptVersion = Reflect.get(value, 'version')
  if (
    (receiptVersion !== 2 && receiptVersion !== 3 && receiptVersion !== 4)
    || (receipt.state !== 'cleanup-pending' && receipt.state !== 'completed')
    || receipt.host !== host
    || receipt.conflictPluginId !== LEGACY_PLUGIN_IDENTITY
    || !Array.isArray(receipt.conflictScopes)
    || (receipt.state === 'cleanup-pending' && receipt.conflictScopes.length === 0)
    || receipt.conflictScopes.some(
      (scope) => scope !== 'user' && scope !== 'project' && scope !== 'local' && scope !== 'managed',
    )
    || new Set(receipt.conflictScopes).size !== receipt.conflictScopes.length
    || !isReleaseId(receipt.releaseId)
    || typeof receipt.releaseRoot !== 'string'
    || !isAbsolute(receipt.releaseRoot)
    || normalize(receipt.releaseRoot) !== receipt.releaseRoot
    || typeof receipt.candidateRoot !== 'string'
    || !isAbsolute(receipt.candidateRoot)
    || normalize(receipt.candidateRoot) !== receipt.candidateRoot
    || typeof receipt.createdAtEpoch !== 'number'
    || !Number.isSafeInteger(receipt.createdAtEpoch)
    || receipt.createdAtEpoch < 0
    || typeof receipt.updatedAt !== 'string'
    || receipt.updatedAt === ''
  ) return null
  const transactionId = Reflect.get(value, 'transactionId')
  const stableTarget = parseStableTarget(Reflect.get(value, 'stableTarget'))
  if ((receiptVersion === 3 || receiptVersion === 4)
    && (typeof transactionId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(transactionId))) return null
  if (receiptVersion === 4 && stableTarget === null) return null
  return {
    ...(receipt as Omit<HostPluginConvergenceReceipt, 'version' | 'transactionId' | 'stableTarget'>),
    version: 4,
    transactionId: receiptVersion === 3 || receiptVersion === 4
      ? transactionId as string
      : 'legacy-v2',
    ...(stableTarget === null ? {} : { stableTarget }),
  }
}

export function readHostPluginConvergenceReceipt(
  env: SetupEnv,
  host: NativePipelineHost,
): ConvergenceRead {
  const { receiptPath } = hostPluginConvergencePaths(env, host)
  const read = env.readTextState(receiptPath)
  if (read.state === 'missing') return { state: 'none' }
  if (read.state === 'error') {
    return { state: 'invalid', detail: `迁移 receipt 读取失败：${receiptPath}（${read.detail}）` }
  }
  const receipt = parseReceipt(read.text, host)
  return receipt === null
    ? { state: 'invalid', detail: `迁移 receipt 非法：${receiptPath}` }
    : { state: 'receipt', receipt }
}

export function parseSessionProof(raw: string | undefined): {
  readonly host: string
  readonly releaseId: string
  readonly releaseRoot: string
  readonly loadedAtEpoch: number
} | null {
  if (raw === undefined) return null
  const fields = new Map<string, string>()
  for (const line of raw.split('\n')) {
    if (line === '') continue
    const separator = line.indexOf('=')
    if (separator <= 0 || fields.has(line.slice(0, separator))) return null
    fields.set(line.slice(0, separator), line.slice(separator + 1))
  }
  const host = fields.get('host')
  const releaseId = fields.get('release_id')
  const releaseRoot = fields.get('release_root')
  const loadedAtEpoch = Number(fields.get('loaded_at_epoch'))
  if (fields.get('version') !== '2' || (host !== 'codex' && host !== 'claude')
    || !isReleaseId(releaseId)
    || typeof releaseRoot !== 'string'
    || releaseRoot === ''
    || !Number.isSafeInteger(loadedAtEpoch)
    || loadedAtEpoch < 0) return null
  return { host, releaseId, releaseRoot, loadedAtEpoch }
}

export function writeHostPluginConvergenceReceipt(
  deps: CliDeps,
  env: SetupEnv,
  receipt: HostPluginConvergenceReceipt,
): boolean {
  const { receiptPath } = hostPluginConvergencePaths(env, receipt.host)
  try {
    env.mkdirp(dirname(receiptPath))
    env.writeTextAtomic(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`)
    return true
  } catch (error) {
    deps.io.err(
      `ERROR: 无法持久化宿主插件收敛 receipt；为避免无证据清理，冲突登记保持不变：`
      + `${error instanceof Error ? error.message : String(error)}`,
    )
    return false
  }
}
