import type { CliDeps } from '../deps.js'
import {
  ManagedRuntimeIndeterminateError,
  type ManagedReleaseJournalRecord,
  type ManagedReleaseOperation,
  type ManagedRuntimeTransaction,
} from '../runtime/installer.js'
import type { NativeRuntimeHost } from '../runtime/types.js'
import { DEFAULT_DASHBOARD_PORT } from './dashboard.js'

interface JournalRequest {
  readonly operation: ManagedReleaseOperation
  readonly source: NativeRuntimeHost | 'adapter'
  readonly dashboardPort?: number
}

/**
 * Resolve the one durable transaction journal and freeze its concrete Dashboard port. Existing
 * transactions always win over a changed retry environment; legacy journals are migrated only
 * while their exact port can still be inferred safely.
 */
export async function resolveManagedReleaseJournal(
  deps: CliDeps,
  request: JournalRequest,
  transaction: ManagedRuntimeTransaction,
): Promise<ManagedReleaseJournalRecord> {
  try {
    const pending = await transaction.journal.read()
    if (pending === null) {
      const created = {
        ...transaction.journal.create(request.operation, request.source, deps.clock()),
        dashboardPort: request.dashboardPort ?? DEFAULT_DASHBOARD_PORT,
      }
      await transaction.journal.write(created)
      return created
    }
    if (pending.operation !== request.operation || pending.source !== request.source) {
      throw new ManagedRuntimeIndeterminateError(
        `存在未完成的 ${pending.operation}/${pending.source} 事务 ${pending.transactionId}，`
        + `拒绝启动 ${request.operation}/${request.source}`,
      )
    }
    if (pending.dashboardPort !== undefined) return pending

    const inferredPort = pending.dashboard?.port ?? pending.dashboardBefore?.port
    const canAdoptRequestedPort = pending.phase === 'preparing-host'
      || pending.phase === 'candidate-resolved'
    if (inferredPort === undefined && !canAdoptRequestedPort) {
      throw new ManagedRuntimeIndeterminateError(
        `未完成事务 ${pending.transactionId} 已进入 ${pending.phase}，但旧 journal 缺少 `
        + 'pre-activation Dashboard port；拒绝从 retry 环境补证',
      )
    }
    const migrated = {
      ...pending,
      dashboardPort: inferredPort ?? request.dashboardPort ?? DEFAULT_DASHBOARD_PORT,
      updatedAt: deps.clock(),
    }
    await transaction.journal.write(migrated)
    return migrated
  } catch (error) {
    throw error instanceof ManagedRuntimeIndeterminateError
      ? error
      : new ManagedRuntimeIndeterminateError(
        `无法读取或创建 write-ahead journal：${String(error)}`,
        { cause: error },
      )
  }
}
