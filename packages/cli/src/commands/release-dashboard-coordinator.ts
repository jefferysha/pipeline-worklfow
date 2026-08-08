import { join } from 'node:path'
import type { CliDeps } from '../deps.js'
import {
  ManagedRuntimeIndeterminateError,
  type ManagedReleaseJournalRecord,
  type ManagedRuntimeTransaction,
} from '../runtime/installer.js'
import type { RuntimeActivation } from '../runtime/types.js'
import type {
  ReleasedDashboardOptions,
  ReleasedDashboardSession,
  ReleasedDashboardStarter,
} from './dashboard.js'
import {
  sameManagedDashboardCoordinates,
  sameManagedDashboardIdentity,
} from './managed-dashboard-identity.js'

type DashboardFailure = {
  readonly ok: false
  readonly state: 'indeterminate'
  readonly detail: string
}

type DashboardCoordination = DashboardFailure | {
  readonly ok: true
  readonly journal: ManagedReleaseJournalRecord
  readonly dashboardFailure: string
  readonly candidateDashboard?: ReleasedDashboardSession
  readonly dashboardOwner?: 'transaction' | 'preexisting'
}

/**
 * Moves the Dashboard side of a managed release from runtime-activated to a durable, adoptable
 * ready identity. The caller still owns evidence commit and compensation ordering.
 */
export async function coordinateReleaseDashboard(
  deps: CliDeps,
  transaction: ManagedRuntimeTransaction,
  initialJournal: ManagedReleaseJournalRecord,
  activation: RuntimeActivation,
  openBrowser: boolean,
  dashboardPort: number,
  starter: ReleasedDashboardStarter | undefined,
): Promise<DashboardCoordination> {
  let journal = initialJournal
  if (journal.dashboardPort !== undefined && journal.dashboardPort !== dashboardPort) {
    return {
      ok: false,
      state: 'indeterminate',
      detail: `Dashboard frozen port 与 coordinator port 不一致：`
        + `${journal.dashboardPort} != ${dashboardPort}`,
    }
  }
  if (starter === undefined) {
    if (journal.phase !== 'dashboard-ready' && journal.phase !== 'evidence-committed') {
      try {
        journal = {
          ...journal,
          phase: 'dashboard-ready',
          activation,
          updatedAt: deps.clock(),
        }
        await transaction.journal.write(journal)
      } catch (error) {
        return {
          ok: false,
          state: 'indeterminate',
          detail: `runtime 已激活，但 Dashboard phase journal 提交失败；未猜测回滚安全性：`
            + `${error instanceof Error ? error.message : String(error)}`,
        }
      }
    }
    return { ok: true, journal, dashboardFailure: '' }
  }

  try {
    const inspectOptions: ReleasedDashboardOptions = {
      openBrowser: false,
      port: dashboardPort,
      expectedServerVersion: activation.release.source.pluginVersion,
    }
    if (journal.phase === 'dashboard-ready' || journal.phase === 'evidence-committed') {
      if (journal.dashboard === undefined) {
        throw new ManagedRuntimeIndeterminateError('Dashboard journal 缺少 durable ownership')
      }
      let durableDashboard = journal.dashboard
      if (durableDashboard.serverVersion === '') {
        const current = await starter.inspect(deps, inspectOptions)
        if (current === null
          || current.serverVersion !== activation.release.source.pluginVersion
          || !sameManagedDashboardCoordinates(current, durableDashboard)) {
          throw new ManagedRuntimeIndeterminateError(
            'legacy durable Dashboard identity 无法从目标 release health 精确补证',
          )
        }
        const upgradedBefore = journal.dashboardBefore?.serverVersion === ''
          && sameManagedDashboardCoordinates(current, journal.dashboardBefore)
          ? { ...journal.dashboardBefore, serverVersion: current.serverVersion }
          : journal.dashboardBefore
        durableDashboard = { ...durableDashboard, serverVersion: current.serverVersion }
        journal = {
          ...journal,
          dashboard: durableDashboard,
          ...(upgradedBefore === undefined ? {} : { dashboardBefore: upgradedBefore }),
          updatedAt: deps.clock(),
        }
        await transaction.journal.write(journal)
      }
      assertDashboardPort(durableDashboard, dashboardPort, 'durable Dashboard')
      if (journal.dashboardBefore !== undefined) {
        assertDashboardPort(journal.dashboardBefore, dashboardPort, 'preexisting Dashboard')
      }
      if (durableDashboard.owner === 'preexisting') {
        const current = await starter.inspect(deps, {
          openBrowser: false,
          port: dashboardPort,
        })
        if (current === null || !sameManagedDashboardIdentity(current, durableDashboard)) {
          throw new ManagedRuntimeIndeterminateError(
            `journal 中的 preexisting Dashboard pid=${durableDashboard.pid} 已消失或身份变化`,
          )
        }
        return {
          ok: true,
          journal,
          dashboardFailure: '',
          dashboardOwner: 'preexisting',
        }
      }
      if (durableDashboard.transactionId !== journal.transactionId) {
        throw new ManagedRuntimeIndeterminateError(
          'Dashboard journal 不是当前 release transaction 的精确 ownership',
        )
      }
      const adopted = await starter.adopt(deps, durableDashboard)
      if (adopted === null) {
        throw new ManagedRuntimeIndeterminateError(
          `无法收养 journal 中的 Dashboard pid=${durableDashboard.pid}`,
        )
      }
      if (!sameManagedDashboardIdentity(adopted.ownership, durableDashboard)) {
        throw new ManagedRuntimeIndeterminateError(
          `收养结果与 journal Dashboard pid=${durableDashboard.pid} 身份不一致`,
        )
      }
      return {
        ok: true,
        journal,
        dashboardFailure: '',
        candidateDashboard: adopted,
        dashboardOwner: durableDashboard.owner,
      }
    }

    if (journal.phase !== 'starting-dashboard') {
      const before = journal.dashboardBefore
        ?? (journal.dashboardBeforeAbsent === true
          ? null
          : await starter.inspect(deps, inspectOptions))
      if (before !== null) assertDashboardPort(before, dashboardPort, 'initial Dashboard probe')
      journal = {
        ...journal,
        phase: 'starting-dashboard',
        activation,
        ...(before === null ? {} : { dashboardBefore: before }),
        updatedAt: deps.clock(),
      }
      await transaction.journal.write(journal)
    }
    let current = await starter.inspect(deps, inspectOptions)
    const previousRelease = journal.activationCheckpoint?.selection.activeRelease
    const latePreviousFromRetiredLegacy = current !== null
      && journal.dashboardBeforeAbsent === true
      && current.transactionId === journal.transactionId
      && current.releaseId === previousRelease
      && current.serverVersion !== ''
    if (current !== null
      && previousRelease !== null
      && previousRelease !== undefined
      && previousRelease !== activation.release.releaseId
      && current.releaseId === previousRelease
      && ((journal.dashboardBefore !== undefined
        && sameManagedDashboardIdentity(current, journal.dashboardBefore))
        || latePreviousFromRetiredLegacy)) {
      const previousIdentity = current
      const previousSession = await starter.adopt(deps, previousIdentity)
      if (
        previousSession === null
        || !sameManagedDashboardIdentity(previousSession.ownership, previousIdentity)
      ) {
        throw new ManagedRuntimeIndeterminateError(
          `activation 前冻结的 previous Dashboard pid=${previousIdentity.pid} 无法精确收养`,
        )
      }
      const stopped = await previousSession.stop()
      if (stopped.state === 'indeterminate') {
        return {
          ok: false,
          state: 'indeterminate',
          detail: `previous Dashboard pid=${previousIdentity.pid} 终止状态无法确认；`
            + `保留 journal 且未启动候选 Dashboard：${stopped.detail}`,
        }
      }
      const afterStop = await starter.inspect(deps, inspectOptions)
      if (afterStop !== null) {
        throw new ManagedRuntimeIndeterminateError(
          `previous Dashboard pid=${previousIdentity.pid} 报告 stopped 后端口仍被占用`,
        )
      }
      current = null
    }
    const currentOwned = current !== null
      && current.transactionId === journal.transactionId
      && current.releaseId === activation.release.releaseId
      && current.serverVersion === activation.release.source.pluginVersion
      && current.port === dashboardPort
    if (current !== null
      && current.port === dashboardPort
      && current.transactionId !== undefined
      && current.transactionId !== journal.transactionId
      && current.releaseId === activation.release.releaseId
      && current.serverVersion === activation.release.source.pluginVersion
      && journal.dashboardBefore !== undefined
      && sameManagedDashboardIdentity(current, journal.dashboardBefore)) {
      journal = {
        ...journal,
        phase: 'dashboard-ready',
        activation,
        dashboard: { ...current, owner: 'preexisting' },
        updatedAt: deps.clock(),
      }
      await transaction.journal.write(journal)
      return {
        ok: true,
        journal,
        dashboardFailure: '',
        dashboardOwner: 'preexisting',
      }
    }
    if (current !== null && !currentOwned) {
      throw new ManagedRuntimeIndeterminateError(
        `端口上存在非当前 transaction 的 Dashboard pid=${current.pid}；拒绝 adopt、stop 或覆盖`,
      )
    }
    let dashboardOutcome
    let startedNewDashboard = false
    if (current !== null && currentOwned) {
      const adopted = await starter.adopt(deps, current)
      dashboardOutcome = adopted === null
        || !sameManagedDashboardIdentity(adopted.ownership, current)
        ? {
            state: 'indeterminate' as const,
            detail: '候选 Dashboard identity 存在但无法精确收养',
          }
        : { state: 'ready' as const, session: adopted }
    } else {
      startedNewDashboard = true
      dashboardOutcome = await starter.start(
        deps,
        join(activation.releaseRoot, 'payload'),
        {
          openBrowser,
          port: dashboardPort,
          transactionId: journal.transactionId,
          expectedServerVersion: activation.release.source.pluginVersion,
        },
      )
    }
    if (dashboardOutcome.state === 'indeterminate') {
      return {
        ok: false,
        state: 'indeterminate',
        detail: `新 runtime 的 Dashboard 未就绪，且候选进程终止未被确认；`
          + `为避免与仍可能占用端口的进程并发，保留 journal 且未补偿 selection：${dashboardOutcome.detail}`,
      }
    }
    if (dashboardOutcome.state === 'failed') {
      return {
        ok: true,
        journal,
        dashboardFailure: `新 runtime 的 dashboard readiness 失败：${dashboardOutcome.detail}`,
      }
    }
    const readyIdentity = dashboardOutcome.session.ownership
    const readyIdentityValid = readyIdentity.version === 1
      && readyIdentity.releaseId === activation.release.releaseId
      && readyIdentity.serverVersion === activation.release.source.pluginVersion
      && readyIdentity.port === dashboardPort
      && readyIdentity.transactionId === journal.transactionId
      && Number.isSafeInteger(readyIdentity.pid)
      && readyIdentity.pid > 0
      && /^sha256-v1-[a-f0-9]{64}$/.test(readyIdentity.stateScopeId)
    if (!readyIdentityValid) {
      throw new ManagedRuntimeIndeterminateError(
        startedNewDashboard
          ? 'starter 返回错误 ownership；该 session 不构成信号权限，保留 journal'
          : '收养的 Dashboard session 未回显精确 inspected identity',
      )
    }
    const dashboardOwner = 'transaction' as const
    journal = {
      ...journal,
      phase: 'dashboard-ready',
      activation,
      dashboard: { ...readyIdentity, owner: dashboardOwner },
      updatedAt: deps.clock(),
    }
    await transaction.journal.write(journal)
    return {
      ok: true,
      journal,
      dashboardFailure: '',
      candidateDashboard: dashboardOutcome.session,
      dashboardOwner,
    }
  } catch (error) {
    return {
      ok: false,
      state: 'indeterminate',
      detail: `Dashboard starter、ownership adoption 或 journal 提交未返回可证明状态；`
        + `保留 journal 且未补偿 selection：${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

function assertDashboardPort(
  identity: NonNullable<ManagedReleaseJournalRecord['dashboardBefore']>,
  expectedPort: number,
  label: string,
): void {
  if (identity.port !== expectedPort) {
    throw new ManagedRuntimeIndeterminateError(
      `${label} port=${identity.port} 与 frozen dashboardPort=${expectedPort} 不一致`,
    )
  }
}
