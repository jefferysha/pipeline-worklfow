import type { AutomationPolicySnapshot, EffectiveSkillResolver, LoopEntry, LoopLedgerStore, LoopRegistry, SkillBundleResolutionInput } from '@tenon/kernel'
import {
  admissionDecision, budgetDayOf, buildAttemptContext, compileAutomationPolicySnapshot, compileConstraintPolicy, evaluateConstraintPolicy,
  indexMergeFactsByAttempt, LedgerDegradedError, loopMaterialUnchanged,
  normalizeOnExceed, projectLoopLedger,
  registryContentEpoch, reservedTokensFor, resolveLoopBinding, resolveSkillBundle, withRegistryGovernanceLock,
  type AdmissionBlock, type AttemptContextLedgerSnapshot, type BudgetExceedAction, type BudgetReservationRecord,
  type ChangeLoopBindingRecord, type LedgerRecord, type MergeIntentRecord, type MergeLandedRecord,
  type ReservationActivatedRecord, type RunRecord, type SkillBundleSnapshotRecord, type UsageRecord, type VerificationResult,
} from '@tenon/kernel'
import type { AutomationLevel } from '../types.js'
import type { ProviderStructuredUsage } from '../runner/runner.js'
import type { SkillContentLocator } from '../skills/content-locator.js'
import { buildCanonicalManifest, materializeSkillSnapshot, type MaterializeSkillSnapshotOptions } from '../skills/snapshot-store.js'
import type { SkillSnapshotInput, SkillSnapshotProvenance, SkillSnapshotPublishResult } from '../skills/types.js'
import {
  makeIdGen, markLoopPrepared, markNonLoopPrepared,
  type CapturedExecutionCoordinate, type ExecutionContext, type ExecutionCoordinatePort,
  type ExecutionPreparationPort, type PrepareOutcome, type PreparationFailureReason,
  type PreparedExecutionContext, type PreparedSkillSlot,
} from './execution-context.js'
import {
  DAEMON_OWNED,
  DEFAULT_TTL_MS,
  MAX_RESERVE_RETRIES,
  SkillProfileValidatorUnconfiguredError,
  attemptContextFor,
  errText,
  isPreparedContext,
  snapshotMatchesPrepared,
  terminalToResult,
  type ActivateResult,
  type ExecutionLiveness,
  type LoopAdmission,
  type LoopAdmissionDeps,
  type MergeIntentJournalInput,
  type MergeLandedJournalInput,
  type RecoveredMergeState,
  type ReserveOutcome,
  type ReserveResult,
  type RunSettlement,
} from './loop-admission-types.js'


export interface AdmissionJournalDeps {
  readonly repoRoot: string
  readonly ledger: LoopLedgerStore
  readonly clock: () => string
  readonly newId: NonNullable<LoopAdmissionDeps['newId']>
  readonly level: AutomationLevel
}

export function createAdmissionJournal(deps: AdmissionJournalDeps) {
  const { repoRoot, ledger, clock, newId, level } = deps
  const base = (): { schema_version: 1; record_id: string; recorded_at: string } => ({
    schema_version: 1, record_id: newId('rec'), recorded_at: clock(),
  })

  const assertProviderUsage = (usage: ProviderStructuredUsage): void => {
    if (usage.provider !== 'openai-codex') throw new LedgerDegradedError('provider usage source is not openai-codex')
    const counts = [usage.tokens.input, usage.tokens.cached_input, usage.tokens.output, usage.tokens.reasoning, usage.tokens.total]
    if (counts.some((count) => !Number.isSafeInteger(count) || count < 0)) {
      throw new LedgerDegradedError('provider usage contains an invalid token count')
    }
    if (usage.tokens.cached_input > usage.tokens.input) {
      throw new LedgerDegradedError('provider usage cached input exceeds input')
    }
    if (usage.tokens.reasoning > usage.tokens.output) {
      throw new LedgerDegradedError('provider usage reasoning exceeds output')
    }
    if (usage.tokens.total !== usage.tokens.input + usage.tokens.output) {
      throw new LedgerDegradedError('provider usage total conflicts with input + output')
    }
  }

  type UsageAccounting = { readonly ids: string[]; readonly chargedTokens: number } | undefined
  const usageAccountingFor = (
    records: readonly LedgerRecord[],
    reservation: BudgetReservationRecord,
  ): UsageAccounting => {
    const facts = records.filter(
      (record): record is UsageRecord => record.kind === 'usage' && record.attempt_id === reservation.attempt_id,
    )
    if (facts.length === 0) return undefined
    if (facts.length !== 1) {
      throw new LedgerDegradedError(`attempt「${reservation.attempt_id}」有 ${facts.length} 条 provider usage，拒绝猜测`)
    }
    const fact = facts[0]!
    if (fact.loop_id !== reservation.loop_id
      || (reservation.iteration_id !== undefined && fact.iteration_id !== reservation.iteration_id)
      || fact.source !== 'provider-structured') {
      throw new LedgerDegradedError(`attempt「${reservation.attempt_id}」的 provider usage owner/source 不一致`)
    }
    return { ids: [fact.usage_id], chargedTokens: fact.tokens.total }
  }

  const recordProviderUsage = async (
    ctx: ExecutionContext,
    usage: ProviderStructuredUsage,
  ): Promise<string> => {
    assertProviderUsage(usage)
    return ledger.withLedgerLock(repoRoot, async () => {
      const read = await ledger.read(repoRoot)
      if (read.rejected.length > 0) {
        throw new LedgerDegradedError(`recordProviderUsage: 账本有 ${read.rejected.length} 条坏行`)
      }
      const reservations = read.records.filter(
        (record): record is BudgetReservationRecord => record.kind === 'budget-reservation'
          && record.reservation_id === ctx.reservation_id,
      )
      if (reservations.length !== 1) {
        throw new LedgerDegradedError(`recordProviderUsage: reservation「${ctx.reservation_id}」数量=${reservations.length}`)
      }
      const reservation = reservations[0]
      if (reservation === undefined) {
        throw new LedgerDegradedError(
          `activate: reservation「${ctx.reservation_id}」不存在`,
        )
      }
      if (reservation.attempt_id !== ctx.attempt_id
        || (reservation.iteration_id !== undefined && ctx.iteration_id !== reservation.iteration_id)
        || reservation.loop_id !== ctx.loop_id
        || reservation.change !== ctx.change) {
        throw new LedgerDegradedError('recordProviderUsage: context 与 reservation 不一致')
      }
      const activations = read.records.filter(
        (record): record is ReservationActivatedRecord => record.kind === 'reservation-activated'
          && record.reservation_id === ctx.reservation_id,
      )
      if (activations.length !== 1) {
        throw new LedgerDegradedError(
          `recordProviderUsage: reservation「${ctx.reservation_id}」is not uniquely activated（activation 数量=${activations.length}）`,
        )
      }
      const activation = activations[0]!
      if (activation.attempt_id !== ctx.attempt_id
        || (reservation.iteration_id !== undefined && activation.iteration_id !== reservation.iteration_id)
        || activation.iteration_id !== ctx.iteration_id
        || activation.loop_id !== ctx.loop_id
        || activation.change !== ctx.change) {
        throw new LedgerDegradedError('recordProviderUsage: activation owner 与 context 不一致')
      }
      const existing = read.records.filter(
        (record): record is UsageRecord => record.kind === 'usage' && record.attempt_id === ctx.attempt_id,
      )
      if (existing.length > 1) {
        throw new LedgerDegradedError(`recordProviderUsage: attempt「${ctx.attempt_id}」已有重复 usage`)
      }
      if (existing.length === 1) {
        const fact = existing[0]!
        const same = fact.loop_id === ctx.loop_id && fact.iteration_id === ctx.iteration_id
          && fact.provider === usage.provider
          && fact.request_id === usage.request_id
          && fact.tokens.input === usage.tokens.input
          && fact.tokens.cached_input === usage.tokens.cached_input
          && fact.tokens.output === usage.tokens.output
          && fact.tokens.reasoning === usage.tokens.reasoning
          && fact.tokens.total === usage.tokens.total
        if (!same) throw new LedgerDegradedError(`recordProviderUsage: attempt「${ctx.attempt_id}」usage conflict`)
        return fact.usage_id
      }
      if (read.records.some((record) => record.kind === 'run' && record.reservation_id === ctx.reservation_id)) {
        throw new LedgerDegradedError(`recordProviderUsage: reservation「${ctx.reservation_id}」已 terminal`)
      }
      const now = clock()
      const usageId = `usage-${ctx.attempt_id}`
      await ledger.append(repoRoot, {
        ...base(), recorded_at: now, kind: 'usage', usage_id: usageId,
        attempt_id: ctx.attempt_id, iteration_id: ctx.iteration_id, loop_id: ctx.loop_id, provider: usage.provider,
        request_id: usage.request_id,
        tokens: { ...usage.tokens }, source: 'provider-structured', observed_at: now,
      })
      return usageId
    })
  }

  /** 该 change 最新 change-loop-binding 的 loop_id（文件序末次 = 最新；无 → undefined）。 */
  const latestBinding = (records: readonly LedgerRecord[], change: string): string | undefined => {
    let out: string | undefined
    for (const r of records) if (r.kind === 'change-loop-binding' && r.change === change) out = r.loop_id
    return out
  }

  /** 统一幂等关闭（Stage B 返工 #1，所有 close 唯一入口）：走 store 原子 closeReservationIfOpen——
   *  recovery 与 scheduler settle 并发关同一 reservation，一个 committed、一个 already-closed，token 只扣一次。
   *  already-closed 是成功幂等结果（scheduler 不记 ledgerFailures）。可重入直通：reserve 的 recovery 在
   *  既有 withLedgerLock 内调用不再抢锁。 */
  const close = async (
    reservationId: string,
    build: (reservation: BudgetReservationRecord) => RunRecord,
  ): Promise<'committed' | 'already-closed'> => {
    const res = await ledger.closeReservationIfOpen(repoRoot, reservationId, build)
    return res.status
  }

  const recordMergeIntent = async (input: MergeIntentJournalInput): Promise<string> =>
    ledger.withLedgerLock(repoRoot, async () => {
      const read = await ledger.read(repoRoot)
      if (read.rejected.length > 0) {
        throw new LedgerDegradedError(`recordMergeIntent: 账本有 ${read.rejected.length} 条坏行，拒绝在损坏账本上写 merge intent`)
      }
      const reservations = read.records.filter(
        (record): record is BudgetReservationRecord =>
          record.kind === 'budget-reservation' && record.reservation_id === input.context.reservation_id,
      )
      if (reservations.length !== 1) {
        throw new LedgerDegradedError(`recordMergeIntent: reservation「${input.context.reservation_id}」数量=${reservations.length}，拒绝写 intent`)
      }
      const reservation = reservations[0]!
      if (reservation.attempt_id !== input.context.attempt_id
        || (reservation.iteration_id !== undefined && input.context.iteration_id !== reservation.iteration_id)
        || reservation.loop_id !== input.context.loop_id
        || reservation.change !== input.context.change) {
        throw new LedgerDegradedError('recordMergeIntent: context 与 reservation 的 attempt/iteration/loop/change 不一致')
      }
      if (read.records.some((record) => record.kind === 'run' && record.reservation_id === reservation.reservation_id)) {
        throw new LedgerDegradedError(`recordMergeIntent: reservation「${reservation.reservation_id}」已 terminal`)
      }
      const activation = [...read.records].reverse().find(
        (record) => record.kind === 'reservation-activated' && record.reservation_id === reservation.reservation_id,
      )
      if (activation === undefined || activation.kind !== 'reservation-activated') {
        throw new LedgerDegradedError(`recordMergeIntent: reservation「${reservation.reservation_id}」尚未 activated`)
      }
      if (activation.attempt_id !== reservation.attempt_id
        || activation.iteration_id !== reservation.iteration_id
        || activation.loop_id !== reservation.loop_id
        || activation.change !== reservation.change) {
        throw new LedgerDegradedError('recordMergeIntent: activation owner 与 reservation 不一致')
      }
      if (input.buildSha !== undefined && input.buildSha !== input.branchTip) {
        throw new LedgerDegradedError('recordMergeIntent: buildSha 与 branchTip 不一致')
      }
      const workflowRunId = input.context.workflow_run_id ?? input.context.attempt_id
      if (input.verification !== undefined) {
        const subject = input.verification.subject
        if (subject.workflow_run_id !== workflowRunId || subject.attempt_id !== input.context.attempt_id
          || subject.change !== input.context.change || subject.revision.sha !== input.branchTip) {
          throw new LedgerDegradedError('recordMergeIntent: verification subject 与本次 attempt/revision 不一致')
        }
      }
      const existing = [...read.records].reverse().find(
        (record): record is MergeIntentRecord => record.kind === 'merge-intent'
          && record.attempt_id === input.context.attempt_id
          && record.merged_commit_sha === input.mergedCommit
          && record.expected_base_sha === input.baseBefore
          && record.expected_branch_sha === input.branchTip,
      )
      if (existing !== undefined) return existing.record_id

      const now = clock()
      const usageAccounting = usageAccountingFor(read.records, reservation)
      const record: MergeIntentRecord = {
        ...base(), recorded_at: now, kind: 'merge-intent',
        attempt_id: reservation.attempt_id, reservation_id: reservation.reservation_id,
        iteration_id: input.context.iteration_id,
        loop_id: reservation.loop_id, change: reservation.change, workflow_run_id: workflowRunId,
        base_ref: input.baseRef, expected_base_sha: input.baseBefore,
        branch_ref: input.branchRef, expected_branch_sha: input.branchTip,
        merged_commit_sha: input.mergedCommit,
        level: input.context.level, runner: input.context.runner, image: input.context.image,
        admitted_at: input.context.admitted_at, started_at: activation.started_at, created_at: now,
        verify: { result: input.verifyResult, source: 'sandbox-output', trusted: false },
        verification: input.verification,
        artifacts: {
          build_sha: input.buildSha,
          build_sha_source: input.buildSha === undefined ? undefined : 'named-branch-head',
          branch: input.branch,
          commit_shas: [...input.commitShas],
        },
        skill_bundle_snapshot_sha256: input.context.preparedKind === 'loop-bundle'
          ? input.context.skillBundle.snapshotSha256
          : undefined,
        usage_record_ids: usageAccounting?.ids ?? [],
        accounting: usageAccounting === undefined
          ? {
              reserved_tokens: reservation.reserved_tokens,
              charged_tokens: reservation.reserved_tokens,
              charge_source: 'reserved-estimate',
            }
          : {
              reserved_tokens: reservation.reserved_tokens,
              charged_tokens: usageAccounting.chargedTokens,
              charge_source: 'provider-structured',
            },
      }
      await ledger.append(repoRoot, record)
      return record.record_id
    })

  const recordMergeLanded = async (input: MergeLandedJournalInput): Promise<void> => {
    await ledger.withLedgerLock(repoRoot, async () => {
      const read = await ledger.read(repoRoot)
      if (read.rejected.length > 0) {
        throw new LedgerDegradedError(`recordMergeLanded: 账本有 ${read.rejected.length} 条坏行，拒绝写 landed receipt`)
      }
      const intent = read.records.find(
        (record): record is MergeIntentRecord => record.kind === 'merge-intent' && record.record_id === input.intentRecordId,
      )
      if (intent === undefined) throw new LedgerDegradedError(`recordMergeLanded: intent「${input.intentRecordId}」不存在`)
      if (intent.attempt_id !== input.context.attempt_id
        || intent.iteration_id !== input.context.iteration_id
        || intent.reservation_id !== input.context.reservation_id
        || intent.loop_id !== input.context.loop_id || intent.change !== input.context.change
        || intent.base_ref !== input.baseRef || intent.expected_base_sha !== input.baseBefore
        || intent.expected_branch_sha !== input.branchTip || intent.merged_commit_sha !== input.mergedCommit) {
        throw new LedgerDegradedError(`recordMergeLanded: receipt 与 intent「${input.intentRecordId}」关键事实不一致`)
      }
      if (input.hostSynced && input.hostSyncError !== undefined) {
        throw new LedgerDegradedError('recordMergeLanded: hostSynced=true 不得同时携带 hostSyncError')
      }
      const last = [...read.records].reverse().find(
        (record): record is MergeLandedRecord => record.kind === 'merge-landed' && record.intent_record_id === intent.record_id,
      )
      const expectedError = input.hostSyncError === undefined
        ? undefined
        : { cause: 'host-sync-failed', message: input.hostSyncError }
      if (last !== undefined && last.host_synced === input.hostSynced
        && JSON.stringify(last.host_sync_error) === JSON.stringify(expectedError)) return
      const now = clock()
      await ledger.append(repoRoot, {
        ...base(), recorded_at: now, kind: 'merge-landed', intent_record_id: intent.record_id,
        attempt_id: intent.attempt_id, reservation_id: intent.reservation_id,
        loop_id: intent.loop_id, change: intent.change, base_ref: intent.base_ref,
        base_before_sha: intent.expected_base_sha, branch_sha: intent.expected_branch_sha,
        merged_commit_sha: intent.merged_commit_sha, host_synced: input.hostSynced,
        host_sync_error: expectedError, landed_at: now,
      })
    })
  }

  const mergeFactsForReservation = (
    records: readonly LedgerRecord[],
    reservation: BudgetReservationRecord,
  ): { intent?: MergeIntentRecord; landed?: MergeLandedRecord } => {
    const facts = indexMergeFactsByAttempt(records).get(reservation.attempt_id)
    const intent = facts?.latestIntent
    if (intent === undefined) return {}
    if (intent.reservation_id !== reservation.reservation_id
      || (reservation.iteration_id !== undefined && intent.iteration_id !== reservation.iteration_id)
      || intent.loop_id !== reservation.loop_id
      || intent.change !== reservation.change) {
      throw new LedgerDegradedError(`merge recovery: attempt「${reservation.attempt_id}」的 intent 与 reservation 不一致`)
    }
    const candidate = facts?.latestLanded
    if (candidate === undefined || candidate.intent_record_id !== intent.record_id) return { intent }
    if (candidate.reservation_id !== intent.reservation_id || candidate.loop_id !== intent.loop_id
      || candidate.change !== intent.change || candidate.base_ref !== intent.base_ref
      || candidate.base_before_sha !== intent.expected_base_sha || candidate.branch_sha !== intent.expected_branch_sha
      || candidate.merged_commit_sha !== intent.merged_commit_sha) {
      throw new LedgerDegradedError(`merge recovery: landed「${candidate.record_id}」与 intent「${intent.record_id}」不一致`)
    }
    return { intent, landed: candidate }
  }

  const recoveredMergeState = (landed: MergeLandedRecord | undefined): RecoveredMergeState => {
    if (landed === undefined) {
      return {
        cause: 'merge-journal-pending',
        message: 'base ref 已落地，但 merge-landed receipt 缺失；已由 intent + ref CAS 事实恢复',
      }
    }
    if (!landed.host_synced) {
      return {
        cause: 'host-sync-pending',
        message: landed.host_sync_error?.message ?? 'base ref 已落地，但 host 工作树同步状态待处理',
      }
    }
    return { cause: 'completed', message: 'durable merge receipt 已确认 base 与 host 同步完成' }
  }

  const buildRecoveredMergeTerminal = (
    reservation: BudgetReservationRecord,
    intent: MergeIntentRecord,
    landed: MergeLandedRecord | undefined,
    now: string,
  ): RunRecord => {
    if (intent.accounting.reserved_tokens !== reservation.reserved_tokens) {
      throw new LedgerDegradedError(`merge recovery: intent「${intent.record_id}」会计预占与 reservation 不一致`)
    }
    const state = recoveredMergeState(landed)
    return {
      ...base(), recorded_at: now, kind: 'run', run_record_id: newId('run'),
      attempt_id: reservation.attempt_id, reservation_id: reservation.reservation_id,
      iteration_id: intent.iteration_id,
      loop_id: reservation.loop_id, change: reservation.change, workflow_run_id: intent.workflow_run_id,
      level: intent.level, runner: intent.runner, image: intent.image,
      admitted_at: intent.admitted_at, started_at: intent.started_at,
      finished_at: landed?.landed_at ?? now, result: 'merged', reason: state.cause,
      verify: intent.verify === undefined ? undefined : { ...intent.verify },
      verification: intent.verification,
      artifacts: intent.artifacts === undefined ? undefined : {
        ...intent.artifacts, commit_shas: [...intent.artifacts.commit_shas],
      },
      skill_bundle_snapshot_sha256: intent.skill_bundle_snapshot_sha256,
      usage_record_ids: [...intent.usage_record_ids],
      accounting: { ...intent.accounting },
      error: landed?.host_sync_error === undefined ? undefined : { ...landed.host_sync_error },
    }
  }

  /** 崩溃恢复（第 3 节，reserve 的 ledger 锁内先行——**只做 ledger-only 关闭**，绝不在 ledger 锁内取
   *  change 锁 CAS，硬守锁序 `governance→ledger` 内禁 change lock）：扫本 loop 未关闭预占——
   *   · 未 activate（无论是否过期）→ 本锁内不处置；交 reconcileOrphans 在锁外先修复 scheduled。
   *   · 已 activate 且没有 merge intent，automation 已 terminal（非 scheduled/running）→ close recovered，
   *     按 reserved estimate 扣账（H9：CAS 成功但 ledger 写失败的对账口径；亦承接 #5
   *     orphan CAS 后崩溃的兜底）。一旦有 merge intent/landed，本锁内绝不落 generic recovered，
   *     保留给 reconcileOrphans 按物理 merge 事实收口。
   *   · 已 activate 且 automation 仍 scheduled/running → orphan，本锁内不处置（保留占 in-flight）；由
   *     reconcileOrphans 在 ledger 锁**之外**用 liveness 探针 + change CAS 处理（#5）。 */
  const closeRecord = (
    r: BudgetReservationRecord,
    o: {
      result: RunRecord['result']; reason: RunRecord['reason']; charge: 'reserved-estimate' | 'none'
      now: string; runner?: string; usageAccounting?: UsageAccounting
    },
  ): RunRecord => ({
    ...base(), recorded_at: o.now, kind: 'run', run_record_id: newId('run'),
    attempt_id: r.attempt_id, reservation_id: r.reservation_id, loop_id: r.loop_id, change: r.change,
    iteration_id: r.iteration_id,
    level, runner: o.runner ?? 'unknown', admitted_at: o.now, finished_at: o.now, result: o.result, reason: o.reason,
    usage_record_ids: o.usageAccounting?.ids ?? [],
    accounting: o.usageAccounting === undefined
      ? { reserved_tokens: r.reserved_tokens, charged_tokens: o.charge === 'reserved-estimate' ? r.reserved_tokens : 0, charge_source: o.charge === 'reserved-estimate' ? 'reserved-estimate' : 'none' }
      : { reserved_tokens: r.reserved_tokens, charged_tokens: o.usageAccounting.chargedTokens, charge_source: 'provider-structured' },
  })

  const buildTerminal = (
    ctx: ExecutionContext,
    reservation: BudgetReservationRecord,
    s: RunSettlement,
    usageAccounting?: UsageAccounting,
  ): RunRecord => {
    const now = clock()
    return {
      ...base(), recorded_at: now, kind: 'run', run_record_id: newId('run'),
      attempt_id: reservation.attempt_id, reservation_id: reservation.reservation_id, loop_id: reservation.loop_id, change: reservation.change,
      workflow_run_id: s.workflowRunId ?? ctx.workflow_run_id,
      iteration_id: ctx.iteration_id,
      level: ctx.level, runner: ctx.runner, image: ctx.image,
      admitted_at: ctx.admitted_at, started_at: s.startedAt, finished_at: now, result: s.result, reason: s.reason,
      verify: s.verify ? { result: s.verify.result, source: 'sandbox-output', trusted: false } : undefined,
      verification: s.verification,
      artifacts: s.artifacts ? { build_sha: s.artifacts.buildSha, build_sha_source: s.artifacts.buildSha ? 'named-branch-head' : undefined, branch: s.artifacts.branch, commit_shas: [...s.artifacts.commitShas] } : undefined,
      // H10 §3/§8任务3：终态关联的 skill bundle 快照 hash——只有走过 prepareSkillBundle 的 settle
      // 才会传 s.skillBundleSnapshotSha256；claim-lost 等从未 prepare 的路径 s 不带该字段，此处
      // 保持 undefined（旧行同构，可选字段缺席合法）。
      skill_bundle_snapshot_sha256: s.skillBundleSnapshotSha256,
      usage_record_ids: usageAccounting?.ids ?? [],
      accounting: usageAccounting === undefined
        ? { reserved_tokens: reservation.reserved_tokens, charged_tokens: s.charge === 'reserved-estimate' ? reservation.reserved_tokens : 0, charge_source: s.charge === 'reserved-estimate' ? 'reserved-estimate' : 'none' }
        : { reserved_tokens: reservation.reserved_tokens, charged_tokens: usageAccounting.chargedTokens, charge_source: 'provider-structured' },
      error: s.error ? { cause: s.error.cause, message: s.error.message } : undefined,
    }
  }

  /**
   * activate：ledger 锁内先把 context 绑定回唯一 reservation；scheduler 传入 Prepared context 时，
   * loop-bundle 还必须逐字段匹配本 reservation 唯一 durable skill-bundle-snapshot。WeakSet/工厂
   * 发行只证明对象形状，ledger 才是“这次 reservation 真物化过哪份快照”的 authority。
   */
  return {
    base,
    buildRecoveredMergeTerminal,
    buildTerminal,
    close,
    closeRecord,
    latestBinding,
    mergeFactsForReservation,
    recordMergeIntent,
    recordMergeLanded,
    recordProviderUsage,
    recoveredMergeState,
    usageAccountingFor,
  }
}
