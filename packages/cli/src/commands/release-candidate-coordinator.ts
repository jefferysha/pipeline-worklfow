import type { CliDeps } from '../deps.js'
import {
  ManagedRuntimeIndeterminateError,
  type ManagedReleaseJournalRecord,
  type ManagedRuntimeTransaction,
} from '../runtime/installer.js'
import { createManagedHostStepRunner } from '../runtime/managed-host-reconciliation.js'
import type { ReleasedDashboardStarter } from './dashboard.js'
import { resolveManagedReleaseJournal } from './managed-release-journal-coordinator.js'
import {
  isCompensationPhase,
  resumeManagedReleaseCompensation,
} from './release-compensation.js'
import type {
  ManagedHostPreparationContext,
  ManagedReleaseOutcome,
  ManagedReleaseRequest,
} from './release-coordinator-contract.js'

export interface PreparedManagedReleaseCandidate {
  readonly journal: ManagedReleaseJournalRecord
  readonly candidate: {
    readonly candidateRoot: string
    readonly evidence?: string
    readonly openBrowser?: boolean
  }
}

export async function prepareManagedReleaseCandidate(
  deps: CliDeps,
  request: ManagedReleaseRequest,
  transaction: ManagedRuntimeTransaction,
  dashboardStarter: ReleasedDashboardStarter | undefined,
): Promise<PreparedManagedReleaseCandidate | { readonly outcome: ManagedReleaseOutcome }> {
  let journal = await resolveManagedReleaseJournal(deps, request, transaction)
  if (request.requiresStableTarget === true
    && journal.stableTarget === undefined
    && (journal.phase !== 'preparing-host' || (journal.hostSteps?.length ?? 0) > 0)) {
    throw new ManagedRuntimeIndeterminateError(
      `update journal 已进入 ${journal.phase}，但缺少 mutation 前冻结的 stable target`,
    )
  }
  if (journal.stableTarget !== undefined && request.proveFrozenTarget !== undefined) {
    try {
      await request.proveFrozenTarget(journal.stableTarget)
    } catch (error) {
      throw new ManagedRuntimeIndeterminateError(
        `journal stable target 已漂移或无法重新证明：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
  if (isCompensationPhase(journal.phase)) {
    return {
      outcome: await resumeManagedReleaseCompensation(
        deps,
        request.source,
        transaction,
        journal,
        dashboardStarter,
      ),
    }
  }
  if (
    dashboardStarter !== undefined
    && (journal.phase === 'activating-runtime'
      || journal.phase === 'runtime-activated'
      || journal.phase === 'starting-dashboard'
      || journal.phase === 'dashboard-ready'
      || journal.phase === 'evidence-committed')
    && journal.dashboardBefore === undefined
    && journal.dashboardBeforeAbsent !== true
  ) {
    throw new ManagedRuntimeIndeterminateError(
      `旧 journal 已进入 ${journal.phase}，但缺少 pre-activation Dashboard identity/empty proof；`
      + '拒绝从 activation 后的 retry 环境补证',
    )
  }

  let candidate: PreparedManagedReleaseCandidate['candidate']
  if (
    journal.phase === 'candidate-resolved'
    || journal.phase === 'activating-runtime'
    || journal.phase === 'runtime-activated'
    || journal.phase === 'starting-dashboard'
    || journal.phase === 'dashboard-ready'
    || journal.phase === 'evidence-committed'
  ) {
    if (journal.candidateRoot === undefined) {
      throw new ManagedRuntimeIndeterminateError('write-ahead journal 缺少 candidateRoot')
    }
    candidate = {
      candidateRoot: journal.candidateRoot,
      ...(journal.evidence === undefined ? {} : { evidence: journal.evidence }),
      ...(journal.candidateOpenBrowser === undefined
        ? {}
        : { openBrowser: journal.candidateOpenBrowser }),
    }
  } else {
    try {
      const runStep: ManagedHostPreparationContext['runStep'] = createManagedHostStepRunner({
        journal: () => journal,
        commit: async (record) => {
          await transaction.journal.write(record)
          journal = record
        },
        now: deps.clock,
      })
      const resolveStableTarget: ManagedHostPreparationContext['resolveStableTarget'] = async (
        resolveLatest,
        proveFrozen,
      ) => {
        if (journal.stableTarget !== undefined) {
          await proveFrozen(journal.stableTarget)
          return journal.stableTarget
        }
        const stableTarget = await resolveLatest()
        journal = { ...journal, stableTarget, updatedAt: deps.clock() }
        await transaction.journal.write(journal)
        return stableTarget
      }
      const prepared = await request.prepareCandidate({
        transactionId: journal.transactionId,
        resolveStableTarget,
        runStep,
      })
      if ('alreadyCurrent' in prepared) {
        try {
          await transaction.journal.clear(journal.transactionId)
        } catch (error) {
          throw new ManagedRuntimeIndeterminateError(
            `同版 identity 已证明，但 managed journal 清理失败：${String(error)}`,
          )
        }
        return {
          outcome: {
            ok: true,
            state: 'current',
            ...(journal.stableTarget === undefined ? {} : { stableTarget: journal.stableTarget }),
          },
        }
      }
      candidate = prepared
      journal = {
        ...journal,
        phase: 'candidate-resolved',
        candidateRoot: candidate.candidateRoot,
        ...(candidate.openBrowser === undefined
          ? {}
          : { candidateOpenBrowser: candidate.openBrowser }),
        ...(candidate.evidence === undefined ? {} : { evidence: candidate.evidence }),
        updatedAt: deps.clock(),
      }
      await transaction.journal.write(journal)
    } catch (error) {
      const freshPreparation = journal.phase === 'preparing-host'
        && journal.stableTarget === undefined
        && (journal.hostSteps?.length ?? 0) === 0
      if (freshPreparation) {
        try {
          await transaction.journal.clear(journal.transactionId)
        } catch (journalError) {
          return {
            outcome: {
              ok: false,
              state: 'indeterminate',
              detail: `宿主候选准备在任何 mutation 前失败，但空 journal 清理失败：`
                + `${journalError instanceof Error ? journalError.message : String(journalError)}`,
            },
          }
        }
      }
      return {
        outcome: {
          ok: false,
          state: error instanceof ManagedRuntimeIndeterminateError ? 'indeterminate' : 'unchanged',
          detail: `宿主候选准备失败；managed runtime 保持不变，`
            + `${freshPreparation ? '空 journal 已清理' : 'journal 已保留供幂等恢复'}：`
            + `${error instanceof Error ? error.message : String(error)}`,
        },
      }
    }
  }
  return { journal, candidate }
}
