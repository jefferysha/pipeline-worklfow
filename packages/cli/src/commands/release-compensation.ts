import type { CliDeps } from '../deps.js'
import type {
  ManagedReleaseJournalRecord,
  ManagedRuntimeTransaction,
} from '../runtime/installer.js'
import type { NativeRuntimeHost } from '../runtime/types.js'
import type {
  ReleasedDashboardSession,
  ReleasedDashboardStarter,
} from './dashboard.js'
import { restorePreviousReleasedDashboard } from './dashboard-restore.js'
import type { ManagedReleaseOutcome } from './release-coordinator-contract.js'
import { sameManagedDashboardIdentity } from './managed-dashboard-identity.js'

export function isCompensationPhase(
  phase: ManagedReleaseJournalRecord['phase'],
): phase is 'stopping-candidate' | 'reverting-activation' | 'restoring-previous' | 'previous-restored' {
  return phase === 'stopping-candidate'
    || phase === 'reverting-activation'
    || phase === 'restoring-previous'
    || phase === 'previous-restored'
}

export async function resumeManagedReleaseCompensation(
  deps: CliDeps,
  source: NativeRuntimeHost | 'adapter',
  transaction: ManagedRuntimeTransaction,
  initialJournal: ManagedReleaseJournalRecord,
  dashboardStarter: ReleasedDashboardStarter | undefined,
  liveCandidate?: ReleasedDashboardSession,
): Promise<ManagedReleaseOutcome> {
  let journal = initialJournal
  const activation = journal.activation
  const checkpoint = journal.activationCheckpoint
  const reason = journal.compensationReason
  const port = journal.dashboardPort
  if (activation === undefined || checkpoint === undefined || reason === undefined || port === undefined) {
    return {
      ok: false,
      state: 'indeterminate',
      detail: '补偿 journal 缺少 activation/checkpoint/reason/dashboardPort；保留 WAL',
    }
  }
  const activationChangedRelease =
    checkpoint.selection.activeRelease !== activation.selection.activeRelease
  const fail = (detail: string): ManagedReleaseOutcome => ({
    ok: false,
    state: 'indeterminate',
    detail: `${reason}；${detail}`,
  })
  try {
    if (journal.phase === 'stopping-candidate') {
      const owned = journal.dashboard?.owner === 'transaction' ? journal.dashboard : undefined
      if (owned !== undefined) {
        let session = liveCandidate
        if (session === undefined) {
          if (dashboardStarter === undefined) return fail('缺少 Dashboard starter，无法证明 candidate 已停止')
          const current = await dashboardStarter.inspect(deps, { openBrowser: false, port })
          if (current !== null && !sameManagedDashboardIdentity(current, owned)) {
            return fail('candidate 端口 identity 已漂移；未向未知进程发送信号')
          }
          if (current !== null) {
            session = await dashboardStarter.adopt(deps, owned) ?? undefined
            if (session === undefined || !sameManagedDashboardIdentity(session.ownership, owned)) {
              return fail('candidate 无法按 durable identity 精确收养；未发送信号')
            }
          }
        }
        if (session !== undefined) {
          if (!sameManagedDashboardIdentity(session.ownership, owned)) {
            return fail('live candidate session 与 durable identity 不一致；未发送信号')
          }
          const stopped = await session.stop()
          if (stopped.state !== 'stopped') {
            return fail(`candidate 终止状态无法确认：${stopped.detail}`)
          }
        }
      }
      journal = {
        ...journal,
        phase: activationChangedRelease ? 'reverting-activation' : 'previous-restored',
        updatedAt: deps.clock(),
      }
      await transaction.journal.write(journal)
    }

    if (journal.phase === 'reverting-activation') {
      await transaction.revertActivation(activation)
      journal = {
        ...journal,
        phase: 'restoring-previous',
        updatedAt: deps.clock(),
      }
      await transaction.journal.write(journal)
    }

    if (journal.phase === 'restoring-previous') {
      const previousRelease = checkpoint.selection.activeRelease
      if (previousRelease === null) {
        if (dashboardStarter !== undefined) {
          const current = await dashboardStarter.inspect(deps, { openBrowser: false, port })
          if (current !== null) return fail('activation 前为空的端口仍有 listener；未发送信号')
        }
        journal = {
          ...journal,
          phase: 'previous-restored',
          updatedAt: deps.clock(),
        }
        await transaction.journal.write(journal)
      } else {
        if (dashboardStarter === undefined) return fail('缺少 Dashboard starter，无法恢复 previous Dashboard')
        const restoreTransactionId = `${journal.transactionId}:restore`
        let restored = journal.dashboardRestored
        if (restored === undefined) {
          const current = await dashboardStarter.inspect(deps, { openBrowser: false, port })
          if (current !== null) {
            const currentValid = current.releaseId === previousRelease
              && current.port === port
              && current.transactionId === restoreTransactionId
              && Number.isSafeInteger(current.pid)
              && current.pid > 0
              && /^sha256-v1-[a-f0-9]{64}$/.test(current.stateScopeId)
            if (!currentValid) return fail('previous restore 端口存在不可信 listener；未发送信号')
            restored = current
          } else {
            const outcome = await restorePreviousReleasedDashboard(
              deps,
              activation,
              dashboardStarter,
              port,
              restoreTransactionId,
            )
            if (outcome.state !== 'ready') {
              return fail(outcome.state === 'not-required'
                ? 'checkpoint 要求 previous Dashboard，但 restore 报告 not-required'
                : `previous Dashboard 恢复状态为 ${outcome.state}：${outcome.detail}`)
            }
            restored = outcome.session.ownership
          }
        }
        journal = {
          ...journal,
          phase: 'previous-restored',
          dashboardRestored: restored,
          updatedAt: deps.clock(),
        }
        await transaction.journal.write(journal)
      }
    }

    if (journal.phase === 'previous-restored') {
      const previousRelease = checkpoint.selection.activeRelease
      if (dashboardStarter !== undefined) {
        const current = await dashboardStarter.inspect(deps, { openBrowser: false, port })
        if (!activationChangedRelease) {
          if (journal.dashboardBeforeAbsent === true) {
            if (current !== null) {
              return fail('same-release 补偿后事务前为空的端口仍有 listener；未清 WAL')
            }
          } else if (!sameManagedDashboardIdentity(current ?? undefined, journal.dashboardBefore)) {
            return fail('same-release 补偿后未恢复事务前 Dashboard identity；未清 WAL')
          }
          if (!await transaction.proveActivation(activation)) {
            return fail('same-release 补偿后原 activation 不再可证明；未清 WAL')
          }
        } else if (previousRelease === null) {
          if (current !== null) return fail('previous-restored 证明时端口不为空；未清 WAL')
        } else if (!sameManagedDashboardIdentity(current ?? undefined, journal.dashboardRestored)) {
          return fail('previous-restored identity 复核失败；未清 WAL')
        }
      } else if (activationChangedRelease && previousRelease !== null) {
        return fail('缺少 Dashboard starter，无法证明 previous-restored')
      }
      await transaction.journal.clear(journal.transactionId)
      return {
        ok: false,
        state: 'restored',
        detail: `${reason}；已恢复 managed transaction`
          + (!activationChangedRelease
            ? '；保持原 activation 并恢复事务前 Dashboard 状态'
            : previousRelease === null
              ? '；activation 前无 previous Dashboard'
              : ' 与 previous Dashboard'),
      }
    }
    return fail(`未知补偿 phase ${journal.phase}`)
  } catch (error) {
    return fail(`补偿 phase=${journal.phase} 未完成：${error instanceof Error ? error.message : String(error)}`)
  }
}
