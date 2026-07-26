import { join } from 'node:path'
import type { CliDeps } from '../deps.js'
import type { RuntimeInstaller } from '../runtime/installer.js'
import type { NativeRuntimeHost, RuntimeActivation } from '../runtime/types.js'
import {
  restorePreviousReleasedDashboard,
  type ReleasedDashboardStarter,
} from './dashboard.js'

export type ManagedReleaseFailureState = 'unchanged' | 'restored' | 'indeterminate'

export type ManagedReleaseOutcome =
  | {
      readonly ok: true
      readonly state: 'ready'
      readonly activation: RuntimeActivation
    }
  | {
      readonly ok: false
      readonly state: ManagedReleaseFailureState
      readonly detail: string
    }

export interface ManagedReleaseRequest {
  readonly candidateRoot: string
  readonly source: NativeRuntimeHost | 'adapter'
  readonly homeDir: string
  readonly openBrowser: boolean
}

/**
 * The only coordinator allowed to couple runtime activation with Dashboard readiness.
 *
 * Host marketplace mutation happens before this boundary and is deliberately not compensated here.
 * This coordinator owns the Tenon-managed transaction only: immutable selection, stable launchers,
 * candidate Dashboard process, and restoration of the previous immutable Dashboard.
 */
export async function publishManagedRelease(
  deps: CliDeps,
  request: ManagedReleaseRequest,
  installer: RuntimeInstaller,
  dashboardStarter: ReleasedDashboardStarter | undefined,
): Promise<ManagedReleaseOutcome> {
  let activation: RuntimeActivation
  try {
    activation = await installer.activate(request.candidateRoot, request.source, request.homeDir)
  } catch (error) {
    return {
      ok: false,
      state: 'unchanged',
      detail: `managed runtime 校验/发布失败，当前已验证 runtime 保持不变：${error instanceof Error ? error.message : String(error)}`,
    }
  }

  if (dashboardStarter === undefined) {
    return { ok: true, state: 'ready', activation }
  }

  let dashboardFailure = '新 runtime 的 dashboard readiness 失败'
  let dashboardCode = 1
  try {
    dashboardCode = await dashboardStarter.start(
      deps,
      join(activation.releaseRoot, 'payload'),
      { openBrowser: request.openBrowser },
    )
  } catch (error) {
    dashboardFailure = `${dashboardFailure}：${error instanceof Error ? error.message : String(error)}`
  }
  if (dashboardCode === 0) {
    return { ok: true, state: 'ready', activation }
  }

  try {
    if (installer.revertActivation === undefined) {
      throw new Error('runtime installer 不支持精确 activation 补偿')
    }
    await installer.revertActivation(request.homeDir, activation)
    const dashboardRestored = await restorePreviousReleasedDashboard(deps, activation, dashboardStarter)
    if (!dashboardRestored) throw new Error('previous Dashboard 恢复后未通过 readiness')
    return {
      ok: false,
      state: 'restored',
      detail: `${dashboardFailure}；已恢复 managed transaction 与 previous Dashboard`,
    }
  } catch (rollbackError) {
    return {
      ok: false,
      state: 'indeterminate',
      detail: `${dashboardFailure}，且精确回滚失败：${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
    }
  }
}
