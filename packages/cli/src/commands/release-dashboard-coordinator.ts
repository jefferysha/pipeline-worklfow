import { join } from 'node:path'
import type { CliDeps } from '../deps.js'
import {
  ManagedRuntimeIndeterminateError,
  type ManagedReleaseJournalRecord,
  type ManagedRuntimeTransaction,
} from '../runtime/installer.js'
import type { RuntimeActivation } from '../runtime/types.js'
import type {
  ReleasedDashboardSession,
  ReleasedDashboardStarter,
} from './dashboard.js'

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
  starter: ReleasedDashboardStarter | undefined,
): Promise<DashboardCoordination> {
  let journal = initialJournal
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
    if (journal.phase === 'dashboard-ready' || journal.phase === 'evidence-committed') {
      if (journal.dashboard === undefined) {
        throw new ManagedRuntimeIndeterminateError('Dashboard journal 缺少 durable ownership')
      }
      if (journal.dashboard.owner !== 'transaction'
        || journal.dashboard.transactionId !== journal.transactionId) {
        throw new ManagedRuntimeIndeterminateError(
          'Dashboard journal 不是当前 release transaction 的精确 ownership',
        )
      }
      const adopted = await starter.adopt(deps, journal.dashboard)
      if (adopted === null) {
        throw new ManagedRuntimeIndeterminateError(
          `无法收养 journal 中的 Dashboard pid=${journal.dashboard.pid}`,
        )
      }
      return {
        ok: true,
        journal,
        dashboardFailure: '',
        candidateDashboard: adopted,
        dashboardOwner: journal.dashboard.owner,
      }
    }

    if (journal.phase !== 'starting-dashboard') {
      const before = await starter.inspect(deps, { openBrowser: false })
      journal = {
        ...journal,
        phase: 'starting-dashboard',
        activation,
        ...(before === null ? {} : { dashboardBefore: before }),
        updatedAt: deps.clock(),
      }
      await transaction.journal.write(journal)
    }
    const current = await starter.inspect(deps, { openBrowser: false })
    const currentOwned = current?.transactionId === journal.transactionId
      && current.releaseId === activation.release.releaseId
    if (current !== null && !currentOwned) {
      throw new ManagedRuntimeIndeterminateError(
        `端口上存在非当前 transaction 的 Dashboard pid=${current.pid}；拒绝 adopt、stop 或覆盖`,
      )
    }
    const dashboardOutcome = currentOwned
      ? await starter.adopt(deps, current).then((adopted) =>
          adopted === null
            ? { state: 'indeterminate' as const, detail: '候选 Dashboard identity 存在但无法收养' }
            : { state: 'ready' as const, session: adopted })
      : await starter.start(
          deps,
          join(activation.releaseRoot, 'payload'),
          { openBrowser, transactionId: journal.transactionId },
        )
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
    if (dashboardOutcome.session.ownership.releaseId !== activation.release.releaseId) {
      throw new ManagedRuntimeIndeterminateError('Dashboard session 与 activation release 不一致')
    }
    if (dashboardOutcome.session.ownership.transactionId !== journal.transactionId) {
      throw new ManagedRuntimeIndeterminateError(
        'Dashboard session 未回显当前 release transaction identity',
      )
    }
    const dashboardOwner = 'transaction' as const
    journal = {
      ...journal,
      phase: 'dashboard-ready',
      activation,
      dashboard: { ...dashboardOutcome.session.ownership, owner: dashboardOwner },
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
