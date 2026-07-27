import { dirname, isAbsolute, join, normalize } from 'node:path'
import type { CliDeps } from '../deps.js'
import { LEGACY_PLUGIN_IDENTITY, TENON_PLUGIN_IDENTITY } from '../migration/legacy-tenon-migration.js'
import type { RuntimeInstaller } from '../runtime/installer.js'
import type { RuntimeActivation } from '../runtime/types.js'
import { resolveRuntimePaths } from '../runtime/paths.js'
import type { SetupEnv } from './setupEnvironment.js'
import {
  nativeInstallPlan,
  nativePluginRemovalPlan,
  parseHostPluginInventory,
  type HostPluginScope,
  type NativePipelineHost,
  type ParsedHostPluginInventory,
  type RemovableHostPluginScope,
} from './plugin-host.js'

export interface HostPluginConvergenceReceipt {
  readonly version: 3
  /** Managed release WAL owner; makes evidence replay a compare-and-return operation. */
  readonly transactionId: string
  readonly state: 'cleanup-pending' | 'completed'
  readonly host: NativePipelineHost
  readonly conflictPluginId: string
  readonly conflictScopes: readonly HostPluginScope[]
  readonly releaseId: string
  readonly releaseRoot: string
  readonly candidateRoot: string
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

export type ConvergenceFinalizeResult =
  | { readonly state: 'none' | 'completed' | 'waiting' }
  | { readonly state: 'failed'; readonly detail: string }

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
    (receiptVersion !== 2 && receiptVersion !== 3)
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
  if (receiptVersion === 3
    && (typeof transactionId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(transactionId))) return null
  return {
    ...(receipt as Omit<HostPluginConvergenceReceipt, 'version' | 'transactionId'>),
    version: 3,
    transactionId: receiptVersion === 3 ? transactionId as string : 'legacy-v2',
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

function parseSessionProof(raw: string | undefined): {
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

function writeReceipt(
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

export function recordPendingHostPluginConflict(
  deps: CliDeps,
  env: SetupEnv,
  host: NativePipelineHost,
  inventory: ParsedHostPluginInventory,
  activation: RuntimeActivation,
  candidateRoot: string,
  transactionId: string,
): boolean {
  if (!inventory.enabledIds.has(LEGACY_PLUGIN_IDENTITY)) return true
  if (!/^[a-zA-Z0-9_-]+$/.test(transactionId)) {
    deps.io.err('ERROR: managed release transaction id 非法；未创建收敛 receipt。')
    return false
  }
  const existing = readHostPluginConvergenceReceipt(env, host)
  if (existing.state === 'invalid') {
    deps.io.err(`ERROR: ${existing.detail}；拒绝覆盖不可审计的收敛 receipt。`)
    return false
  }
  if (existing.state === 'receipt') {
    const receipt = existing.receipt
    const sameRelease = receipt.releaseId === activation.release.releaseId
      && receipt.releaseRoot === join(activation.releaseRoot, 'payload')
      && receipt.candidateRoot === candidateRoot
    if (receipt.transactionId === transactionId) {
      if (!sameRelease) {
        deps.io.err('ERROR: 同一 transaction id 的收敛 receipt 与当前 activation 不一致。')
        return false
      }
      return true
    }
    if (receipt.state === 'cleanup-pending') {
      deps.io.err('ERROR: 冲突清理 receipt 归属于另一个 managed transaction；拒绝覆盖。')
      return false
    }
    if (sameRelease) return true
  }
  const conflictScopes = [...(inventory.enabledScopes.get(LEGACY_PLUGIN_IDENTITY) ?? [])]
  if (conflictScopes.length === 0) {
    deps.io.err('ERROR: 冲突插件登记缺少可验证 scope；未创建清理事务。')
    return false
  }
  const updatedAt = deps.clock()
  const createdAtEpoch = Math.floor(Date.parse(updatedAt) / 1000)
  if (!Number.isSafeInteger(createdAtEpoch) || createdAtEpoch < 0) {
    deps.io.err('ERROR: 当前时钟无法生成迁移 receipt；冲突登记保持不变。')
    return false
  }
  const receipt: HostPluginConvergenceReceipt = {
    version: 3,
    transactionId,
    state: 'cleanup-pending',
    host,
    conflictPluginId: LEGACY_PLUGIN_IDENTITY,
    conflictScopes,
    releaseId: activation.release.releaseId,
    releaseRoot: join(activation.releaseRoot, 'payload'),
    candidateRoot,
    createdAtEpoch,
    updatedAt,
  }
  if (!writeReceipt(deps, env, receipt)) return false
  deps.io.out(
    '[setup] Tenon 候选与 managed runtime 已验证；旧登记暂时保留。'
    + '请启动新宿主会话，让当前 release 的 SessionStart 写入证明后再次运行 setup/update 完成官方清理。',
  )
  return true
}

function inventoryCommand(host: NativePipelineHost) {
  return nativeInstallPlan(host).at(-1)
}

function commandText(cmd: string, args: readonly string[]): string {
  return [cmd, ...args].join(' ')
}

/**
 * Finalize before any new marketplace/runtime mutation.  A failed official remove therefore cannot
 * strand the user or publish another candidate; the already proven Tenon release remains selected.
 */
export async function finalizePendingHostPluginConflict(
  deps: CliDeps,
  env: SetupEnv,
  installer: RuntimeInstaller,
  host: NativePipelineHost,
  receipt: HostPluginConvergenceReceipt,
): Promise<ConvergenceFinalizeResult> {
  if (receipt.state === 'completed') return { state: 'none' }
  const runtime = { homeDir: env.homeDir(), env: env.runtimeEnv() }
  try {
    return await installer.withManagedTransaction(runtime, async () =>
      finalizePendingHostPluginConflictWithinTransaction(deps, env, installer, host, receipt))
  } catch (error) {
    return { state: 'failed', detail: `宿主收敛事务锁定失败：${error instanceof Error ? error.message : String(error)}` }
  }
}

async function finalizePendingHostPluginConflictWithinTransaction(
  deps: CliDeps,
  env: SetupEnv,
  installer: RuntimeInstaller,
  host: NativePipelineHost,
  receipt: HostPluginConvergenceReceipt,
): Promise<ConvergenceFinalizeResult> {
  const inspection = await installer.inspect({ homeDir: env.homeDir(), env: env.runtimeEnv() })
  if (
    !inspection.activeValid
    || inspection.selection.activeRelease !== receipt.releaseId
    || inspection.active?.releaseId !== receipt.releaseId
  ) {
    return {
      state: 'failed',
      detail: 'cleanup-pending receipt 与当前已验证 managed runtime 不一致；保留冲突登记',
    }
  }
  const { sessionProofPath } = hostPluginConvergencePaths(env, host)
  const proof = parseSessionProof(env.readText(sessionProofPath))
  if (
    proof === null
    || proof.host !== host
    || proof.releaseId !== receipt.releaseId
    || proof.releaseRoot !== receipt.releaseRoot
    || proof.loadedAtEpoch <= receipt.createdAtEpoch
  ) {
    deps.io.out('[setup] 等待新宿主会话加载当前 Tenon release；冲突登记尚未清理。')
    return { state: 'waiting' }
  }

  const list = inventoryCommand(host)
  if (list === undefined) return { state: 'failed', detail: '宿主安装计划缺少 inventory 命令' }
  const beforeResult = env.runCommand(list.cmd, [...list.args])
  const before = beforeResult.code === 0
    ? parseHostPluginInventory(host, beforeResult.stdout)
    : null
  if (before === null) {
    return { state: 'failed', detail: '宿主 plugin inventory 不可用或响应畸形；未执行清理' }
  }
  if (!before.enabledIds.has(TENON_PLUGIN_IDENTITY)) {
    return { state: 'failed', detail: '宿主 inventory 未证明 Tenon 登记仍启用；未执行清理' }
  }
  let current = before
  if (current.enabledIds.has(receipt.conflictPluginId)) {
    const liveScopes = current.enabledScopes.get(receipt.conflictPluginId) ?? new Set<HostPluginScope>()
    if ([...liveScopes].some((scope) => !receipt.conflictScopes.includes(scope))) {
      return { state: 'failed', detail: '冲突登记 scope 已变化；拒绝按陈旧 receipt 执行清理' }
    }
    let remaining = receipt.conflictScopes.filter((scope) => liveScopes.has(scope))
    for (const scope of [...remaining]) {
      if (scope === 'managed') {
        return { state: 'failed', detail: '检测到 managed scope 冲突登记；需要宿主管理员在同一 scope 完成清理' }
      }
      const tenonScopes = current.enabledScopes.get(TENON_PLUGIN_IDENTITY) ?? new Set<HostPluginScope>()
      if (!tenonScopes.has(scope)) {
        return {
          state: 'failed',
          detail: `Tenon 尚未在 ${scope} scope 启用；拒绝删除该 scope 的旧工作流插件`,
        }
      }
      for (const item of nativePluginRemovalPlan(host, receipt.conflictPluginId, scope)) {
        deps.io.out(`[setup] 新会话已证明 Tenon 可用；通过宿主插件管理器清理：$ ${commandText(item.cmd, item.args)}`)
        const result = env.runCommand(item.cmd, [...item.args])
        if (result.code !== 0) {
          return {
            state: 'failed',
            detail: result.stderr.trim() || result.stdout.trim() || `退出码 ${result.code}`,
          }
        }
      }
      const checkpointResult = env.runCommand(list.cmd, [...list.args])
      const checkpoint = checkpointResult.code === 0
        ? parseHostPluginInventory(host, checkpointResult.stdout)
        : null
      if (checkpoint === null
        || (checkpoint.enabledScopes.get(receipt.conflictPluginId) ?? new Set()).has(scope)
        || !(checkpoint.enabledScopes.get(TENON_PLUGIN_IDENTITY) ?? new Set()).has(scope)) {
        return { state: 'failed', detail: `清理 ${scope} scope 后的宿主 inventory 未收敛` }
      }
      current = checkpoint
      remaining = remaining.filter((candidate) => candidate !== scope)
      if (remaining.length > 0 && !writeReceipt(deps, env, {
        ...receipt,
        conflictScopes: remaining,
        updatedAt: deps.clock(),
      })) {
        return { state: 'failed', detail: `已清理 ${scope} scope，但剩余 scope checkpoint 持久化失败` }
      }
    }
  }

  const afterResult = env.runCommand(list.cmd, [...list.args])
  const after = afterResult.code === 0
    ? parseHostPluginInventory(host, afterResult.stdout)
    : null
  if (
    after === null
    || after.enabledIds.has(receipt.conflictPluginId)
    || !after.enabledIds.has(TENON_PLUGIN_IDENTITY)
  ) {
    return {
      state: 'failed',
      detail: '官方清理后的宿主 inventory 未收敛为唯一 Tenon 登记',
    }
  }
  const completed: HostPluginConvergenceReceipt = {
    ...receipt,
    state: 'completed',
    conflictScopes: [],
    updatedAt: deps.clock(),
  }
  if (!writeReceipt(deps, env, completed)) {
    return { state: 'failed', detail: '宿主已清理但 completed receipt 持久化失败' }
  }
  deps.io.out('[setup] 宿主插件 inventory 已收敛为唯一 Tenon 工作流身份。')
  return { state: 'completed' }
}
