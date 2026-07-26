import { dirname, join } from 'node:path'
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
  type NativePipelineHost,
} from './plugin-host.js'

export interface HostPluginConvergenceReceipt {
  readonly version: 1
  readonly state: 'cleanup-pending' | 'completed'
  readonly host: NativePipelineHost
  readonly conflictPluginId: string
  readonly releaseId: string
  readonly candidateRoot: string
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
  if (
    receipt.version !== 1
    || (receipt.state !== 'cleanup-pending' && receipt.state !== 'completed')
    || receipt.host !== host
    || receipt.conflictPluginId !== LEGACY_PLUGIN_IDENTITY
    || !isReleaseId(receipt.releaseId)
    || typeof receipt.candidateRoot !== 'string'
    || receipt.candidateRoot === ''
    || typeof receipt.updatedAt !== 'string'
    || receipt.updatedAt === ''
  ) return null
  return receipt as HostPluginConvergenceReceipt
}

export function readHostPluginConvergenceReceipt(
  env: SetupEnv,
  host: NativePipelineHost,
): ConvergenceRead {
  const { receiptPath } = hostPluginConvergencePaths(env, host)
  const raw = env.readText(receiptPath)
  if (raw === undefined) return { state: 'none' }
  const receipt = parseReceipt(raw, host)
  return receipt === null
    ? { state: 'invalid', detail: `迁移 receipt 非法：${receiptPath}` }
    : { state: 'receipt', receipt }
}

function parseSessionProof(raw: string | undefined): {
  readonly host: string
  readonly releaseId: string
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
  if (fields.get('version') !== '2' || (host !== 'codex' && host !== 'claude')
    || !isReleaseId(releaseId)) return null
  return { host, releaseId }
}

function writeReceipt(
  deps: CliDeps,
  env: SetupEnv,
  receipt: HostPluginConvergenceReceipt,
): boolean {
  const { receiptPath } = hostPluginConvergencePaths(env, receipt.host)
  try {
    env.mkdirp(dirname(receiptPath))
    env.writeText(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`)
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
  conflictPluginIds: ReadonlySet<string>,
  activation: RuntimeActivation,
  candidateRoot: string,
): boolean {
  if (!conflictPluginIds.has(LEGACY_PLUGIN_IDENTITY)) return true
  const receipt: HostPluginConvergenceReceipt = {
    version: 1,
    state: 'cleanup-pending',
    host,
    conflictPluginId: LEGACY_PLUGIN_IDENTITY,
    releaseId: activation.release.releaseId,
    candidateRoot,
    updatedAt: deps.clock(),
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
  const inspection = await installer.inspect({
    homeDir: env.homeDir(),
    env: env.runtimeEnv(),
  })
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
  if (proof === null || proof.host !== host || proof.releaseId !== receipt.releaseId) {
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
  if (before.enabledIds.has(receipt.conflictPluginId)) {
    for (const item of nativePluginRemovalPlan(host, receipt.conflictPluginId)) {
      deps.io.out(`[setup] 新会话已证明 Tenon 可用；通过宿主插件管理器清理：$ ${commandText(item.cmd, item.args)}`)
      const result = env.runCommand(item.cmd, [...item.args])
      if (result.code !== 0) {
        return {
          state: 'failed',
          detail: result.stderr.trim() || result.stdout.trim() || `退出码 ${result.code}`,
        }
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
    updatedAt: deps.clock(),
  }
  if (!writeReceipt(deps, env, completed)) {
    return { state: 'failed', detail: '宿主已清理但 completed receipt 持久化失败' }
  }
  deps.io.out('[setup] 宿主插件 inventory 已收敛为唯一 Tenon 工作流身份。')
  return { state: 'completed' }
}
