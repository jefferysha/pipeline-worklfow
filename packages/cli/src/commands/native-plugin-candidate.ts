import type { CliDeps } from '../deps.js'
import {
  hostFlag,
  nativeInstallPlan,
  nativeUpdatePlan,
  parseHostPluginInventory,
  TENON_RELEASE_VERSION,
  type NativePipelineHost,
  type ParsedHostPluginInventory,
} from './plugin-host.js'
import { runManagedHostCommand } from './managed-host-command.js'
import type { ManagedHostPreparationContext } from './release-coordinator.js'
import type { SetupEnv } from './setupEnvironment.js'
import { nativeHostMatchesStableTarget } from './managed-host-observation.js'
import { resolveStableTagTarget, type StableReleaseTarget } from './stable-release.js'
import { verifyPackagedAssets } from './packaged-assets.js'

function commandText(cmd: string, args: readonly string[]): string {
  return [cmd, ...args].join(' ')
}

/** Marketplace add is idempotent on some host versions but reports a non-zero duplicate on others. */
function isDuplicateMarketplaceResult(result: { stdout: string; stderr: string }): boolean {
  return /already|exists|registered|duplicate/i.test(`${result.stdout}\n${result.stderr}`)
}

export interface NativePluginCandidate {
  readonly root: string
  /** Existing host inventory was fully verified before reuse. */
  readonly verified: boolean
  /** Authoritative enabled ids from the same inventory snapshot that resolved `root`. */
  readonly inventory: ParsedHostPluginInventory
  readonly inventoryRaw: string
}

class NativePluginInventoryError extends Error {
  override readonly name = 'NativePluginInventoryError'
}

function proveFrozenTarget(env: SetupEnv, frozen: StableReleaseTarget): void {
  const proven = resolveStableTagTarget(env, frozen.version)
  if (proven.tag !== frozen.tag || proven.commit !== frozen.commit) {
    throw new Error(
      `稳定标签 ${frozen.tag} 当前证明 ${proven.commit} 与冻结 commit ${frozen.commit} 不一致`,
    )
  }
}

async function verifiedInstalledNativePlugin(
  deps: CliDeps,
  env: SetupEnv,
  host: NativePipelineHost,
  transaction: ManagedHostPreparationContext,
  target: StableReleaseTarget,
): Promise<NativePluginCandidate | null> {
  const inventoryCommand = nativeInstallPlan(host).at(-1)
  if (inventoryCommand === undefined) return null
  deps.io.out(`[setup] $ ${commandText(inventoryCommand.cmd, inventoryCommand.args)}`)
  const inventory = await runManagedHostCommand(
    transaction,
    'inventory-before',
    env,
    inventoryCommand,
  )
  if (inventory.code !== 0) {
    throw new NativePluginInventoryError(
      `宿主 plugin inventory 读取失败：${inventory.stderr.trim() || inventory.stdout.trim() || `退出码 ${inventory.code}`}`,
    )
  }
  const parsed = parseHostPluginInventory(host, inventory.stdout)
  if (parsed === null) throw new NativePluginInventoryError('宿主 plugin inventory 响应畸形')
  const root = parsed.tenonRoot
  if (root === null) return null
  let exactStableTarget = false
  if (parsed.tenonVersion === target.version) {
    try {
      exactStableTarget = nativeHostMatchesStableTarget(env, host, target)
    } catch {
      exactStableTarget = false
    }
  }
  if (!exactStableTarget) {
    deps.io.out(
      `[setup] ${hostFlag(host)} 已登记的 tenon 未绑定 ${target.tag}；将通过宿主 CLI 重绑正式 release。`,
    )
    return null
  }
  if (verifyPackagedAssets(deps, env, root, false, true) !== 0) {
    deps.io.out(`[setup] ${hostFlag(host)} 已登记的 tenon 不完整或未通过校验；将重新安装正式 release。`)
    return null
  }
  deps.io.out(`[setup] ${hostFlag(host)} 已有完整且已验证的 tenon；复用宿主登记的安装。`)
  return { root, verified: true, inventory: parsed, inventoryRaw: inventory.stdout }
}

/**
 * Resolve and freeze the release target before the first host mutation, then install the single
 * release plugin into the selected native host and resolve its root from host-owned inventory.
 */
export async function installNativePluginCandidate(
  deps: CliDeps,
  env: SetupEnv,
  host: NativePipelineHost,
  transaction: ManagedHostPreparationContext,
): Promise<NativePluginCandidate | null> {
  const target = await transaction.resolveStableTarget(
    async () => resolveStableTagTarget(env, TENON_RELEASE_VERSION),
    (frozen) => proveFrozenTarget(env, frozen),
  )
  let existing: NativePluginCandidate | null
  try {
    existing = await verifiedInstalledNativePlugin(deps, env, host, transaction, target)
  } catch (error) {
    if (error instanceof NativePluginInventoryError) {
      deps.io.err(`ERROR: ${error.message}；未执行安装或清理。`)
      return null
    }
    throw error
  }
  if (existing !== null) return existing
  const plan = nativeUpdatePlan(host, target)
  let inventory = ''
  for (let index = 0; index < plan.length; index += 1) {
    const item = plan[index]
    if (!item) continue
    deps.io.out(`[setup] $ ${commandText(item.cmd, item.args)}`)
    const stepId = [
      'plugin-remove',
      'marketplace-remove',
      'marketplace-register',
      'plugin-install',
      'inventory-after',
    ][index]!
    const result = await runManagedHostCommand(transaction, stepId, env, item, target)
    if (result.stdout.trim() !== '') deps.io.out(result.stdout.trimEnd())
    if (result.code === 0) {
      if (index === plan.length - 1) inventory = result.stdout
      continue
    }

    if (stepId === 'marketplace-register' && isDuplicateMarketplaceResult(result)) {
      deps.io.out(`[setup] ${hostFlag(host)} marketplace 已存在，继续验证插件。`)
      continue
    }

    if (stepId === 'plugin-install') {
      const inventoryCommand = plan.at(-1)
      if (!inventoryCommand) {
        deps.io.err(`[setup] ${hostFlag(host)} 安装计划缺少 inventory 命令。`)
        return null
      }
      const inventoryResult = await runManagedHostCommand(
        transaction,
        'inventory-after',
        env,
        inventoryCommand,
      )
      const parsed = inventoryResult.code === 0
        ? parseHostPluginInventory(host, inventoryResult.stdout)
        : null
      if (parsed?.tenonRoot !== null && parsed?.tenonRoot !== undefined) {
        deps.io.out(`[setup] ${hostFlag(host)} 已报告 tenon；继续验证版本、tag 与 payload identity。`)
        inventory = inventoryResult.stdout
        break
      }
    }

    deps.io.err(
      `ERROR: ${commandText(item.cmd, item.args)} 失败：${result.stderr.trim() || result.stdout.trim() || `退出码 ${result.code}`}`,
    )
    return null
  }
  const parsed = parseHostPluginInventory(host, inventory)
  if (parsed === null) {
    deps.io.err(`ERROR: ${hostFlag(host)} 插件清单响应畸形；未切换 launcher。`)
    return null
  }
  if (parsed.tenonRoot === null) {
    deps.io.err(`ERROR: ${hostFlag(host)} 插件清单中没有 tenon；未切换 launcher。`)
    return null
  }
  if (parsed.tenonVersion !== target.version) {
    deps.io.err(
      `ERROR: ${hostFlag(host)} 插件版本 ${parsed.tenonVersion ?? 'unknown'} `
        + `不等于正式 release ${target.version}；未切换 launcher。`,
    )
    return null
  }
  let exactStableTarget = false
  try {
    exactStableTarget = nativeHostMatchesStableTarget(env, host, target)
  } catch (error) {
    deps.io.err(
      `ERROR: ${hostFlag(host)} 安装后无法证明 marketplace/tag identity：`
        + `${error instanceof Error ? error.message : String(error)}`,
    )
    return null
  }
  if (!exactStableTarget) {
    deps.io.err(
      `ERROR: ${hostFlag(host)} 安装后未精确绑定 ${target.tag} @ ${target.commit}；未切换 launcher。`,
    )
    return null
  }
  return {
    root: parsed.tenonRoot,
    verified: false,
    inventory: parsed,
    inventoryRaw: inventory,
  }
}
