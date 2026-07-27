import type { CliDeps } from '../deps.js'
import {
  ManagedRuntimeIndeterminateError,
  type ManagedReleaseJournalRecord,
  type ManagedReleaseOperation,
  type ManagedRuntimeTransaction,
  type RuntimeInstaller,
  type RuntimeInstallerScope,
} from '../runtime/installer.js'
import {
  createManagedHostStepRunner,
  type ManagedHostStepExecution,
} from '../runtime/managed-host-reconciliation.js'
import type { NativeRuntimeHost, RuntimeActivation } from '../runtime/types.js'
import {
  type ReleasedDashboardStarter,
} from './dashboard.js'
import { restorePreviousReleasedDashboard } from './dashboard-restore.js'
import { coordinateReleaseDashboard } from './release-dashboard-coordinator.js'

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

export interface ManagedHostPreparationContext {
  readonly transactionId: string
  /**
   * Executes one retry-safe host command under a durable before/after checkpoint. A completed
   * step returns its persisted result on recovery instead of replaying earlier host mutations.
   */
  runStep(
    id: string,
    step: ManagedHostStepExecution,
  ): Promise<string>
}

export interface ManagedReleaseRequest {
  readonly operation: ManagedReleaseOperation
  readonly source: NativeRuntimeHost | 'adapter'
  readonly runtime: RuntimeInstallerScope
  readonly openBrowser: boolean
  /**
   * Runs under the same cross-process lock as activation and Dashboard commit.
   * Native hosts perform marketplace mutation and authoritative inventory resolution here.
   */
  readonly prepareCandidate: (host: ManagedHostPreparationContext) => {
    readonly candidateRoot: string
    readonly evidence?: string
  } | Promise<{
    readonly candidateRoot: string
    readonly evidence?: string
  }>
  /** Dashboard ready 后才提交与 activation 绑定的外部证据。抛错会回滚 runtime 与 Dashboard。 */
  readonly commitReadyEvidence?: (
    activation: RuntimeActivation,
    candidate: { readonly candidateRoot: string; readonly evidence?: string },
    transactionId: string,
  ) => void | Promise<void>
}

/**
 * The only coordinator allowed to couple host candidate preparation, runtime activation,
 * Dashboard readiness, and final evidence. Every phase is serialized by the installer-owned
 * cross-process lock and write-ahead journal.
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
  let journal: ManagedReleaseJournalRecord
  try {
    const pending = await transaction.journal.read()
    if (pending !== null) {
      if (pending.operation !== request.operation || pending.source !== request.source) {
        throw new ManagedRuntimeIndeterminateError(
          `存在未完成的 ${pending.operation}/${pending.source} 事务 ${pending.transactionId}，`
          + `拒绝启动 ${request.operation}/${request.source}`,
        )
      }
      journal = pending
    } else {
      journal = transaction.journal.create(request.operation, request.source, deps.clock())
      await transaction.journal.write(journal)
    }
  } catch (error) {
    throw error instanceof ManagedRuntimeIndeterminateError
      ? error
      : new ManagedRuntimeIndeterminateError(`无法读取或创建 write-ahead journal：${String(error)}`)
  }

  let candidate: { readonly candidateRoot: string; readonly evidence?: string }
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
      candidate = await request.prepareCandidate({
        transactionId: journal.transactionId,
        runStep,
      })
      journal = {
        ...journal,
        phase: 'candidate-resolved',
        candidateRoot: candidate.candidateRoot,
        ...(candidate.evidence === undefined ? {} : { evidence: candidate.evidence }),
        updatedAt: deps.clock(),
      }
      await transaction.journal.write(journal)
    } catch (error) {
      return {
        ok: false,
        state: error instanceof ManagedRuntimeIndeterminateError ? 'indeterminate' : 'unchanged',
        detail: `宿主候选准备失败；managed runtime 保持不变，journal 已保留供幂等恢复：`
          + `${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  let activation: RuntimeActivation
  if (
    journal.phase === 'runtime-activated'
    || journal.phase === 'starting-dashboard'
    || journal.phase === 'dashboard-ready'
    || journal.phase === 'evidence-committed'
  ) {
    if (journal.activation === undefined) {
      throw new ManagedRuntimeIndeterminateError('write-ahead journal 缺少 activation')
    }
    activation = journal.activation
    let proven = false
    try {
      proven = await transaction.proveActivation(activation)
    } catch (error) {
      throw new ManagedRuntimeIndeterminateError(`无法验证 journal activation：${String(error)}`)
    }
    if (!proven) {
      throw new ManagedRuntimeIndeterminateError(
        `journal 中的 activation ${activation.release.releaseId} 与当前 selection/launcher 不一致`,
      )
    }
  } else {
    let recovered: Awaited<ReturnType<ManagedRuntimeTransaction['recoverActivation']>> = {
      state: 'not-started',
    }
    if (journal.phase === 'activating-runtime') {
      if (journal.activationCheckpoint === undefined) {
        throw new ManagedRuntimeIndeterminateError('write-ahead journal 缺少 activation checkpoint')
      }
      try {
        recovered = await transaction.recoverActivation(journal.activationCheckpoint, request.source)
      } catch (error) {
        throw error instanceof ManagedRuntimeIndeterminateError
          ? error
          : new ManagedRuntimeIndeterminateError(`无法从 activation checkpoint 恢复：${String(error)}`)
      }
    } else {
      try {
        const activationCheckpoint = await transaction.checkpointActivation()
        journal = {
          ...journal,
          phase: 'activating-runtime',
          activationCheckpoint,
          updatedAt: deps.clock(),
        }
        await transaction.journal.write(journal)
      } catch (error) {
        return {
          ok: false,
          state: 'indeterminate',
          detail: `无法在 activation 前持久化 checkpoint；未开始 runtime 激活：${String(error)}`,
        }
      }
    }
    if (recovered.state === 'activated') {
      activation = recovered.activation
    } else {
      try {
        activation = await transaction.activate(candidate.candidateRoot, request.source)
      } catch (error) {
        const indeterminate = error instanceof ManagedRuntimeIndeterminateError
        if (!indeterminate) {
          try {
            const retryable: ManagedReleaseJournalRecord = {
              version: 1,
              transactionId: journal.transactionId,
              operation: journal.operation,
              source: journal.source,
              phase: 'preparing-host',
              startedAt: journal.startedAt,
              updatedAt: deps.clock(),
              ...(journal.hostSteps === undefined ? {} : { hostSteps: journal.hostSteps }),
            }
            await transaction.journal.write(retryable)
          } catch (journalError) {
            return {
              ok: false,
              state: 'indeterminate',
              detail: `runtime 激活已精确补偿，但 journal 无法重置为可重试状态：${String(journalError)}`,
            }
          }
        }
        return {
          ok: false,
          state: indeterminate ? 'indeterminate' : 'unchanged',
          detail: indeterminate
            ? `managed runtime 发布后的补偿状态无法证明：${error.message}`
            : `managed runtime 校验/发布失败，当前已验证 runtime 保持不变：${error instanceof Error ? error.message : String(error)}`,
        }
      }
    }
    try {
      journal = {
        ...journal,
        phase: 'runtime-activated',
        activation,
        updatedAt: deps.clock(),
      }
      await transaction.journal.write(journal)
    } catch (error) {
      return {
        ok: false,
        state: 'indeterminate',
        detail: `runtime 已激活，但 write-ahead journal 提交失败；未猜测回滚安全性：`
          + `${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  const dashboard = await coordinateReleaseDashboard(
    deps,
    transaction,
    journal,
    activation,
    request.openBrowser,
    dashboardStarter,
  )
  if (!dashboard.ok) return dashboard
  journal = dashboard.journal
  let dashboardFailure = dashboard.dashboardFailure
  const candidateDashboard = dashboard.candidateDashboard
  const dashboardOwner = dashboard.dashboardOwner

  if (dashboardFailure === '') {
    if (journal.phase === 'evidence-committed') {
      try {
        await transaction.journal.clear(journal.transactionId)
        return { ok: true, state: 'ready', activation }
      } catch (error) {
        return {
          ok: false,
          state: 'indeterminate',
          detail: `ready evidence 已提交，但 journal 清理失败：${String(error)}`,
        }
      }
    }
    try {
      await request.commitReadyEvidence?.(activation, candidate, journal.transactionId)
    } catch (error) {
      dashboardFailure = `ready evidence 提交失败：${error instanceof Error ? error.message : String(error)}`
    }
    if (dashboardFailure === '') {
      try {
        journal = {
          ...journal,
          phase: 'evidence-committed',
          activation,
          updatedAt: deps.clock(),
        }
        await transaction.journal.write(journal)
        await transaction.journal.clear(journal.transactionId)
        return { ok: true, state: 'ready', activation }
      } catch (error) {
        return {
          ok: false,
          state: 'indeterminate',
          detail: `ready evidence 已提交，但最终 journal commit/clear 失败；未回滚已公开状态：${String(error)}`,
        }
      }
    }
  }

  try {
    if (candidateDashboard !== undefined && dashboardOwner === 'transaction') {
      const stopped = await candidateDashboard.stop()
      if (stopped.state === 'indeterminate') {
        return {
          ok: false,
          state: 'indeterminate',
          detail: `${dashboardFailure}；候选 Dashboard 终止状态无法确认，未回滚 selection 或启动 previous Dashboard：${stopped.detail}`,
        }
      }
    }
    await transaction.revertActivation(activation)
    await transaction.journal.clear(journal.transactionId)
    let dashboardDetail = ''
    if (dashboardStarter !== undefined && dashboardOwner !== 'preexisting') {
      const dashboardRestored = await restorePreviousReleasedDashboard(deps, activation, dashboardStarter)
      if (dashboardRestored.state === 'not-required') {
        dashboardDetail = '；激活前不存在 Dashboard，无需恢复进程'
      } else if (dashboardRestored.state !== 'ready') {
        throw new Error(`previous Dashboard 恢复状态为 ${dashboardRestored.state}：${dashboardRestored.detail}`)
      } else {
        dashboardDetail = ' 与 previous Dashboard'
      }
    }
    return {
      ok: false,
      state: 'restored',
      detail: `${dashboardFailure}；已恢复 managed transaction${dashboardDetail}`,
    }
  } catch (rollbackError) {
    return {
      ok: false,
      state: 'indeterminate',
      detail: `${dashboardFailure}，且精确回滚失败：${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
    }
  }
}
