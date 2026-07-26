/**
 * Change/Run 审计投影：把 canonical WorkflowRun revision、TransitionRecord 因果链与仓级
 * loop ledger 中属于同一 change/attempt/reservation 的事实合成一个只读响应。
 *
 * 这不是第二份状态模型：revision/record/ledger 全部原样来自各自 canonical store；本模块只做
 * 关联和 JSON 投影。ledger 坏行永不丢弃，随响应返回并把 health 标成 degraded。
 */
import {
  readCurrentRunRevision,
  readImmutableRunRevision,
  validateCanonicalRevisionHistory,
  type LedgerRecord,
  type LoopLedgerStore,
  type RunRevision,
  type StateStore,
  type TransitionRecord,
  type TransitionRecordStore,
} from '@tenon/kernel'

export interface RunDetailDeps {
  readonly store: StateStore
  readonly recordStore: TransitionRecordStore
  readonly ledger: LoopLedgerStore
}

function scalar(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value.join(',') : value ?? ''
}

async function revisionChain(changeDir: string, current: RunRevision | undefined): Promise<RunRevision[]> {
  if (!current) return []
  await validateCanonicalRevisionHistory(changeDir)
  const result = [current]
  let cursor = current
  while (cursor.revision > 0) {
    const previousRevisionId = cursor.previousRevisionId
    if (previousRevisionId === undefined) {
      throw new Error(`canonical history revision ${cursor.revision} 缺 previousRevisionId`)
    }
    const previous = await readImmutableRunRevision(
      changeDir,
      cursor.revision - 1,
      previousRevisionId,
    )
    if (!previous) throw new Error(`canonical history revision ${cursor.revision - 1} 缺失`)
    result.unshift(previous)
    cursor = previous
  }
  return result
}

function stringProp(record: LedgerRecord, key: string): string | undefined {
  const value = Reflect.get(record, key) as unknown
  return typeof value === 'string' ? value : undefined
}

/**
 * 从“直接指向 change/run”的 ledger 行出发，沿 attempt/reservation/usage/merge-intent 关联闭包扩展。
 * 不按 loop_id 单独扩展——同一 loop 可服务多个 change，只凭 loop 会把别的 change 的事实混进来。
 */
function relatedLedgerRecords(
  records: readonly LedgerRecord[],
  change: string,
  workflowRunId: string | undefined,
): LedgerRecord[] {
  const selected = new Set<number>()
  const attempts = new Set<string>()
  const reservations = new Set<string>()
  const usageIds = new Set<string>()
  const recordIds = new Set<string>()
  const intentIds = new Set<string>()

  const absorb = (record: LedgerRecord, index: number): boolean => {
    if (selected.has(index)) return false
    selected.add(index)
    const attempt = stringProp(record, 'attempt_id')
    const reservation = stringProp(record, 'reservation_id')
    const usage = stringProp(record, 'usage_id')
    const recordId = stringProp(record, 'record_id')
    const intentId = stringProp(record, 'intent_record_id')
    if (attempt) attempts.add(attempt)
    if (reservation) reservations.add(reservation)
    if (usage) usageIds.add(usage)
    if (recordId) recordIds.add(recordId)
    if (intentId) intentIds.add(intentId)
    const referencedUsage = Reflect.get(record, 'usage_record_ids') as unknown
    if (Array.isArray(referencedUsage)) {
      for (const id of referencedUsage) if (typeof id === 'string') usageIds.add(id)
    }
    return true
  }

  records.forEach((record, index) => {
    if (stringProp(record, 'change') === change
      || (workflowRunId !== undefined && stringProp(record, 'workflow_run_id') === workflowRunId)) {
      absorb(record, index)
    }
  })

  let changed = true
  while (changed) {
    changed = false
    records.forEach((record, index) => {
      if (selected.has(index)) return
      const attemptId = stringProp(record, 'attempt_id')
      const reservationId = stringProp(record, 'reservation_id')
      const usageId = stringProp(record, 'usage_id')
      const recordId = stringProp(record, 'record_id')
      const intentId = stringProp(record, 'intent_record_id')
      const match =
        (attemptId !== undefined && attempts.has(attemptId))
        || (reservationId !== undefined && reservations.has(reservationId))
        || (usageId !== undefined && usageIds.has(usageId))
        || (recordId !== undefined && intentIds.has(recordId))
        || (intentId !== undefined && recordIds.has(intentId))
      if (match && absorb(record, index)) changed = true
    })
  }

  return records.filter((_, index) => selected.has(index))
}

/**
 * reservation 上的 H2 context 是 runner 启动前冻结的精确输入。RunDetail 把它提升为显式审计面，
 * 但保留 reservation/attempt/iteration/record 身份，避免前端从任意一条 raw ledger 行猜“哪次运行”。
 */
function attemptContexts(records: readonly LedgerRecord[]): Array<Record<string, unknown>> {
  return records.flatMap((record) => {
    if (record.kind !== 'budget-reservation' || record.attempt_context === undefined) return []
    return [{
      record_id: record.record_id,
      recorded_at: record.recorded_at,
      reservation_id: record.reservation_id,
      attempt_id: record.attempt_id,
      ...(record.iteration_id ? { iteration_id: record.iteration_id } : {}),
      loop_id: record.loop_id,
      source_run_record_ids: record.attempt_context.source_run_record_ids,
      omitted_attempt_ids: record.attempt_context.omitted_attempt_ids,
      rendered: record.attempt_context.rendered,
      stagnation: record.attempt_context.stagnation,
    }]
  })
}

export async function buildRunDetail(
  repoRoot: string,
  changeDir: string,
  changeName: string,
  deps: RunDetailDeps,
): Promise<Record<string, unknown>> {
  const current = await readCurrentRunRevision(changeDir)
  const revisions = await revisionChain(changeDir, current)
  const state = current?.state ?? await deps.store.read(changeDir)
  const metadata = state.runMetadata

  let transitions: TransitionRecord[] = []
  if (metadata?.transitionHead) {
    transitions = await deps.recordStore.readChain(
      changeDir,
      metadata.transitionSequence,
      metadata.transitionHead,
      metadata.runId,
    )
    if (current) await validateCanonicalRevisionHistory(changeDir)
  }

  const ledgerRead = await deps.ledger.read(repoRoot)
  const projection = await deps.store.inspectProjection(changeDir)
  const related = relatedLedgerRecords(ledgerRead.records, changeName, metadata?.runId)
  const fields = state.fields
  const automationPolicy = metadata?.automationPolicy

  return {
    ok: true,
    root: repoRoot,
    change: changeName,
    source: current ? 'canonical' : 'legacy',
    projection,
    workflow_run: metadata
      ? {
          id: metadata.runId,
          workflow_id: scalar(fields.workflow) || 'default',
          current_step: scalar(fields.phase),
          lifecycle: scalar(fields.archived) === 'true' ? 'archived' : 'active',
          transition_sequence: metadata.transitionSequence,
          ...(metadata.transitionHead ? { transition_head: metadata.transitionHead } : {}),
          created_at: scalar(fields.created_at),
          updated_at: scalar(fields.updated_at),
          ...(automationPolicy ? {
            policy_id: automationPolicy.policy_id,
            policy_version: automationPolicy.policy_version,
            automation_policy: automationPolicy,
          } : {}),
          ...(metadata.loopId ? { loop_id: metadata.loopId, iteration_id: metadata.iterationId } : {}),
        }
      : null,
    current_revision: current ?? null,
    revisions,
    transitions,
    attempt_contexts: attemptContexts(related),
    ledger: {
      health: ledgerRead.rejected.length > 0
        ? 'degraded'
        : ledgerRead.records.length > 0 ? 'ok' : 'missing',
      rejected: ledgerRead.rejected,
      records: related,
    },
  }
}
