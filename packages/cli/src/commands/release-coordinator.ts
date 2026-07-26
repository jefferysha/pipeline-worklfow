import { join } from 'node:path'
import type { CliDeps } from '../deps.js'
import {
  ManagedRuntimeIndeterminateError,
  type ManagedRuntimeTransaction,
  type RuntimeInstaller,
  type RuntimeInstallerScope,
} from '../runtime/installer.js'
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
  readonly runtime: RuntimeInstallerScope
  readonly openBrowser: boolean
  /** 在同一 managed transaction 锁内持久化与 activation 绑定的外部证据。抛错会精确回滚。 */
  readonly afterActivate?: (activation: RuntimeActivation) => void | Promise<void>
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
  try {
    return await installer.withManagedTransaction(
      request.runtime,
      (transaction) => publishWithinManagedTransaction(
        deps,
        request,
        transaction,
        dashboardStarter,
      ),
    )
  } catch (error) {
    const indeterminate = error instanceof ManagedRuntimeIndeterminateError
    return {
      ok: false,
      state: indeterminate ? 'indeterminate' : 'unchanged',
      detail: indeterminate
        ? `managed runtime 事务状态无法证明：${error.message}`
        : `managed runtime 事务未开始或锁定失败，当前已验证 runtime 保持不变：${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

async function publishWithinManagedTransaction(
  deps: CliDeps,
  request: ManagedReleaseRequest,
  transaction: ManagedRuntimeTransaction,
  dashboardStarter: ReleasedDashboardStarter | undefined,
): Promise<ManagedReleaseOutcome> {
  let activation: RuntimeActivation
  try {
    activation = await transaction.activate(request.candidateRoot, request.source)
  } catch (error) {
    const indeterminate = error instanceof ManagedRuntimeIndeterminateError
    return {
      ok: false,
      state: indeterminate ? 'indeterminate' : 'unchanged',
      detail: indeterminate
        ? `managed runtime 发布后的补偿状态无法证明：${error.message}`
        : `managed runtime 校验/发布失败，当前已验证 runtime 保持不变：${error instanceof Error ? error.message : String(error)}`,
    }
  }

  if (request.afterActivate !== undefined) {
    try {
      await request.afterActivate(activation)
    } catch (error) {
      try {
        await transaction.revertActivation(activation)
        return {
          ok: false,
          state: 'restored',
          detail: `managed runtime 激活后证据提交失败，已精确回滚：${error instanceof Error ? error.message : String(error)}`,
        }
      } catch (rollbackError) {
        return {
          ok: false,
          state: 'indeterminate',
          detail: `managed runtime 激活后证据提交失败，且精确回滚失败：`
            + `${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
        }
      }
    }
  }

  if (dashboardStarter === undefined) {
    return { ok: true, state: 'ready', activation }
  }

  let dashboardFailure = '新 runtime 的 dashboard readiness 失败'
  try {
    const dashboardOutcome = await dashboardStarter.start(
      deps,
      join(activation.releaseRoot, 'payload'),
      { openBrowser: request.openBrowser },
    )
    if (dashboardOutcome.state === 'ready') {
      return { ok: true, state: 'ready', activation }
    }
    if (dashboardOutcome.state === 'indeterminate') {
      return {
        ok: false,
        state: 'indeterminate',
        detail: `新 runtime 的 Dashboard 未就绪，且候选进程终止未被确认；`
          + `为避免与仍可能占用端口的进程并发，未补偿 selection 或启动 previous Dashboard：${dashboardOutcome.detail}`,
      }
    }
    dashboardFailure = `${dashboardFailure}：${dashboardOutcome.detail}`
  } catch (error) {
    return {
      ok: false,
      state: 'indeterminate',
      detail: `Dashboard starter 未返回可证明状态；未补偿 selection 或启动 previous Dashboard：`
        + `${error instanceof Error ? error.message : String(error)}`,
    }
  }

  try {
    await transaction.revertActivation(activation)
    const dashboardRestored = await restorePreviousReleasedDashboard(deps, activation, dashboardStarter)
    if (dashboardRestored.state !== 'ready') {
      throw new Error(`previous Dashboard 恢复状态为 ${dashboardRestored.state}：${dashboardRestored.detail}`)
    }
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
