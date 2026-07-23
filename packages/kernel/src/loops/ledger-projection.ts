/**
 * loop ledger → typed 内存投影（GOAL H · Stage C 读面 + admission 判定的共用会计核心）。
 *
 * 「一份投影两处用」（第 5 节：本增量不能只写不读，否则硬 admission 与用户看到的 budget 互相矛盾）：
 *   · admission（automation loop-admission.ts）在仓级锁内用 projectLoopLedger + admissionDecision
 *     做「重读 → 判定 → append」的原子临界区；
 *   · CLI `loops budget/status` 与 server snapshot 用同一 projectLoopLedger 展示 settled actual/
 *     estimate / outstanding reserved / remaining / inflight / health——判定与展示同源，绝不漂移。
 *
 * 纯函数（无 fs / 无 IO）：records/rejected 由 store.read() 读入后传值。日额度按 UTC budget_day
 * 归属（reservation 自带 budget_day；RunRecord 经 reservation_id 回接其 reservation 的 budget_day，
 * 无 reservation 的 RunRecord 退回 finished_at 当日）。in-flight 是并发量（不分日，全 loop 计）。
 *
 * reservation 开/关口径复用 Stage A store 的全局事实：一个 reservation「未关闭」= 没有任何
 * RunRecord 引用其 reservation_id（RunRecord 是 terminal/commit marker）。
 */
import { budgetDayOf } from './binding.js'
import type {
  BudgetExceedAction, BudgetReservationRecord, LedgerRecord, MergeIntentRecord, MergeLandedRecord,
  ReservationActivatedRecord, RunRecord, RunResult, SkillBundleSnapshotRecord,
} from './ledger-types.js'

export interface LoopLedgerProjection {
  readonly loopId: string
  readonly budgetDay: string
  /** 今日预占总数（open + closed，= budget_day 命中的 budget-reservation 记录数）——「今日已启动/
   *  已结算 runs + 活跃 reservations」的原子量：每次 reserve append 一条，并发 reserve 被仓级锁串行
   *  后各自看见递增值，两个并发 round 不可能同时读到旧值都通过。 */
  readonly runsToday: number
  /** 并发在途（全 loop、不分日）：未关闭的 reservation 数——每条未关闭预占都是一次已承诺的在途意图
   *  （activated 或 reserve→claim 极窄窗口内待激活），据此原子封顶 max_in_flight。 */
  readonly inFlight: number
  /** 未关闭且已 append reservation-activated 的预占（真跑中；orphan/结算恢复判定用）。 */
  readonly activatedInFlight: number
  /** 今日未关闭预占的 reserved_tokens 之和（尚未结算、仍占额度的保守占位）。 */
  readonly reservedTokensOutstanding: number
  /** 今日已结算实扣 token（charge_source=provider-structured）。 */
  readonly settledTokensActual: number
  /** 今日已结算估扣 token（charge_source=reserved-estimate，无可信 usage 时的保守扣账）。 */
  readonly settledTokensEstimated: number
  /** 最近一条 terminal RunRecord 的结果 / 时间（展示：last result / last finished）。 */
  readonly lastResult?: RunResult
  readonly lastFinishedAt?: string
  /** 未关闭预占记录（admission 查「同 change 是否已有活跃 reservation」用）。 */
  readonly openReservations: readonly BudgetReservationRecord[]
  /** 坏行数（>0 → health=degraded，admission fail-closed）。 */
  readonly rejectedRecords: number
  /** 重复 terminal 数（同一 reservation 出现 >1 条 RunRecord——旧版本双写痕迹；>0 → health=degraded，
   *  但 token 不双加，只认首条 terminal）。 */
  readonly duplicateTerminals: number
  /** 同一 reservation_id 出现多条 reservation；只认首条，任一重复都使账本 degraded。 */
  readonly duplicateReservations: number
  /** 孤儿、owner identity 不匹配或重复的 activation 数；任一出现都使账本 degraded。 */
  readonly invalidActivations: number
  /** 孤儿或 owner identity 不匹配的 terminal 数；绝不关闭/计费，任一出现都使账本 degraded。 */
  readonly invalidTerminals: number
  readonly health: 'ok' | 'degraded'
}

/** H9 iteration state is a projection of the same immutable audit records, never a second mutable state file. */
export interface LoopIteration {
  readonly id: string
  readonly loopId: string
  readonly attemptId: string
  readonly reservationId: string
  readonly change: string
  readonly state: 'reserved' | 'running' | 'terminal'
  readonly result?: RunResult
  readonly auditRecordIds: readonly string[]
}

export function projectLoopIterations(records: readonly LedgerRecord[]): LoopIteration[] {
  const indexed = indexReservationTerminals(records)
  if (indexed.duplicateReservations.length > 0 || indexed.duplicateTerminals.length > 0
    || indexed.invalidActivations.length > 0 || indexed.invalidTerminals.length > 0) {
    throw new Error('loop iteration audit stream is corrupt: identity mismatch or duplicate fact')
  }
  const activations = new Map<string, ReservationActivatedRecord>()
  for (const record of records) {
    if (record.kind === 'reservation-activated' && !activations.has(record.reservation_id)) {
      activations.set(record.reservation_id, record)
    }
  }
  const out: LoopIteration[] = []
  const ids = new Set<string>()
  for (const reservation of indexed.reservationById.values()) {
    if (reservation.iteration_id === undefined) continue
    if (ids.has(reservation.iteration_id)) {
      throw new Error(`duplicate loop iteration identity: ${reservation.iteration_id}`)
    }
    ids.add(reservation.iteration_id)
    const activation = activations.get(reservation.reservation_id)
    const terminal = indexed.terminalByReservationId.get(reservation.reservation_id)
    if ((activation?.iteration_id !== undefined && activation.iteration_id !== reservation.iteration_id)
      || (terminal?.iteration_id !== undefined && terminal.iteration_id !== reservation.iteration_id)) {
      throw new Error(`loop iteration identity mismatch: ${reservation.iteration_id}`)
    }
    out.push({
      id: reservation.iteration_id,
      loopId: reservation.loop_id,
      attemptId: reservation.attempt_id,
      reservationId: reservation.reservation_id,
      change: reservation.change,
      state: terminal === undefined ? (activation === undefined ? 'reserved' : 'running') : 'terminal',
      result: terminal?.result,
      auditRecordIds: [reservation.record_id, activation?.record_id, terminal?.record_id]
        .filter((id): id is string => id !== undefined),
    })
  }
  return out
}

/**
 * reservation → terminal 索引（Stage B 返工 #1）：把「一个 reservation 出现多条 terminal」当**损坏**
 * 而非正常输入，用于发现旧版本已双写的重复终局。token/lastResult/runsToday 只认 terminalByReservationId
 * 的**首条** terminal，重复项进 duplicateTerminals（使 health=degraded），绝不重复累加金额。
 */
export interface ReservationTerminalIndex {
  readonly reservationById: Map<string, BudgetReservationRecord>
  readonly terminalByReservationId: Map<string, RunRecord>
  readonly duplicateReservations: Array<{ reservationId: string; firstRecordId: string; duplicateRecordId: string }>
  readonly duplicateTerminals: Array<{ reservationId: string; firstRecordId: string; duplicateRecordId: string }>
  readonly activatedReservationIds: Set<string>
  readonly invalidActivations: Array<{
    reservationId: string
    recordId: string
    reason: 'orphan' | 'attempt-mismatch' | 'iteration-mismatch' | 'loop-mismatch' | 'change-mismatch' | 'duplicate'
  }>
  readonly invalidTerminals: Array<{
    reservationId: string
    recordId: string
    reason: 'orphan' | 'attempt-mismatch' | 'iteration-mismatch' | 'loop-mismatch' | 'change-mismatch'
  }>
}

/** 全量记录 → reservation terminal 索引（纯函数；文件序即时间序，首条 terminal = 最早终局）。 */
export function indexReservationTerminals(records: readonly LedgerRecord[]): ReservationTerminalIndex {
  const reservationById = new Map<string, BudgetReservationRecord>()
  const terminalByReservationId = new Map<string, RunRecord>()
  const duplicateReservations: ReservationTerminalIndex['duplicateReservations'] = []
  const duplicateTerminals: ReservationTerminalIndex['duplicateTerminals'] = []
  const activatedReservationIds = new Set<string>()
  const invalidActivations: ReservationTerminalIndex['invalidActivations'] = []
  const invalidTerminals: ReservationTerminalIndex['invalidTerminals'] = []
  for (const r of records) {
    if (r.kind === 'budget-reservation') {
      const first = reservationById.get(r.reservation_id)
      if (first === undefined) reservationById.set(r.reservation_id, r)
      else duplicateReservations.push({
        reservationId: r.reservation_id,
        firstRecordId: first.record_id,
        duplicateRecordId: r.record_id,
      })
    }
    else if (r.kind === 'reservation-activated') {
      const reservation = reservationById.get(r.reservation_id)
      const reason = reservation === undefined
        ? 'orphan'
        : reservation.attempt_id !== r.attempt_id
          ? 'attempt-mismatch'
          : reservation.iteration_id !== undefined && r.iteration_id !== reservation.iteration_id
            ? 'iteration-mismatch'
          : reservation.loop_id !== r.loop_id
            ? 'loop-mismatch'
            : reservation.change !== r.change
              ? 'change-mismatch'
              : activatedReservationIds.has(r.reservation_id)
                ? 'duplicate'
                : null
      if (reason === null) activatedReservationIds.add(r.reservation_id)
      else invalidActivations.push({ reservationId: r.reservation_id, recordId: r.record_id, reason })
    }
    else if (r.kind === 'run' && r.reservation_id !== undefined) {
      const reservation = reservationById.get(r.reservation_id)
      const reason = reservation === undefined
        ? 'orphan'
        : reservation.attempt_id !== r.attempt_id
          ? 'attempt-mismatch'
          : reservation.iteration_id !== undefined && r.iteration_id !== reservation.iteration_id
            ? 'iteration-mismatch'
          : reservation.loop_id !== r.loop_id
            ? 'loop-mismatch'
            : reservation.change !== r.change
              ? 'change-mismatch'
              : null
      if (reason !== null) {
        invalidTerminals.push({ reservationId: r.reservation_id, recordId: r.run_record_id, reason })
        continue
      }
      const first = terminalByReservationId.get(r.reservation_id)
      if (first === undefined) terminalByReservationId.set(r.reservation_id, r)
      else duplicateTerminals.push({ reservationId: r.reservation_id, firstRecordId: first.run_record_id, duplicateRecordId: r.run_record_id })
    }
  }
  return {
    reservationById, terminalByReservationId, duplicateReservations, duplicateTerminals,
    activatedReservationIds, invalidActivations, invalidTerminals,
  }
}

/**
 * reservation_id → 其 skill-bundle-snapshot 记录（H10 §3/§8任务3——store 的「reservation 关联
 * 查询」共用此纯投影）：prepareSkillBundle 成功后精确 append 一条本记录，正常不会重复；若账本
 * 因异常出现同 reservation 多条，只认文件序首条（与 indexReservationTerminals 对 terminal 的
 * 首条口径一致）。**不参与** open-reservation/terminal 判定——那两个判定只看 budget-reservation
 * 与 run 两种 kind，本函数只是额外的关联查询面，纯增量、零改变既有判定。
 */
export function indexSkillBundleSnapshots(
  records: readonly LedgerRecord[],
): Map<string, SkillBundleSnapshotRecord> {
  const out = new Map<string, SkillBundleSnapshotRecord>()
  for (const r of records) {
    if (r.kind === 'skill-bundle-snapshot' && !out.has(r.reservation_id)) out.set(r.reservation_id, r)
  }
  return out
}

/** 单个 attempt 的最新 durable merge facts；两类各按账本文件序末次覆盖。 */
export interface AttemptMergeFacts {
  readonly latestIntent?: MergeIntentRecord
  readonly latestLanded?: MergeLandedRecord
}

/**
 * attempt_id → 最新 merge intent/landed 的纯索引，供 crash recovery 直接消费。intent/landed 只在
 * 本附加索引出现，不进入 reservation terminal 索引，也不改变 projectLoopLedger 的会计语义。
 * landed 若找不到对应 intent 仍保留，让上层能 fail-closed 报告账本残片而不是静默丢弃证据。
 */
export function indexMergeFactsByAttempt(
  records: readonly LedgerRecord[],
): Map<string, AttemptMergeFacts> {
  const out = new Map<string, AttemptMergeFacts>()
  for (const record of records) {
    if (record.kind === 'merge-intent') {
      out.set(record.attempt_id, {
        latestIntent: record,
        latestLanded: out.get(record.attempt_id)?.latestLanded,
      })
    } else if (record.kind === 'merge-landed') {
      out.set(record.attempt_id, {
        latestIntent: out.get(record.attempt_id)?.latestIntent,
        latestLanded: record,
      })
    }
  }
  return out
}

/**
 * 一条 reservation 是否计入「预算意义上的运行次数」（Stage B 返工 #8——max_runs_per_day 口径）。
 * 纯竞争/过期失败不占运行名额（否则误拒可重试的 change）；真启动 + 当前可能启动的有效预占才计：
 *   · terminal 未出现（open reservation）→ 计（仍可能启动）
 *   · 已 activated（真跑过）→ 计（即便 token charge 因特殊原因是 none）
 *   · terminal=claim-lost → 不计（纯竞争，没真跑）
 *   · terminal=reservation-expired → 不计（预占过期，没真跑）
 *   · 其余 → charge_source !== 'none' 才计（有实扣/估扣 = 真消耗过）
 */
export function countsAsRun(
  reservation: BudgetReservationRecord,
  terminal: RunRecord | undefined,
  activated: boolean,
): boolean {
  void reservation // 保留结构化入参（契约面；判定只需 terminal + activated）
  if (terminal === undefined) return true
  if (activated) return true
  if (terminal.reason === 'claim-lost') return false
  if (terminal.reason === 'reservation-expired') return false
  return terminal.accounting.charge_source !== 'none'
}

/** 单 loop 的账本投影（纯函数；rejectedCount 由 store.read().rejected.length 传入）。 */
export function projectLoopLedger(
  records: readonly LedgerRecord[],
  rejectedCount: number,
  loopId: string,
  budgetDay: string,
): LoopLedgerProjection {
  // terminal 去重索引（关闭是 reservation 的全局事实，不随 loop 过滤）：closed = 有首条 terminal。
  const index = indexReservationTerminals(records)
  const { reservationById, terminalByReservationId, activatedReservationIds } = index

  const openReservations: BudgetReservationRecord[] = []
  let inFlight = 0
  let activatedInFlight = 0
  let reservedTokensOutstanding = 0
  for (const r of records) {
    if (r.kind !== 'budget-reservation' || r.loop_id !== loopId) continue
    // 重复 reservation_id 只认文件序首条；否则第二条会在 degraded 的同时仍污染 inFlight/open 数。
    if (reservationById.get(r.reservation_id) !== r) continue
    const isOpen = !terminalByReservationId.has(r.reservation_id)
    if (isOpen) {
      inFlight++
      openReservations.push(r)
      if (activatedReservationIds.has(r.reservation_id)) activatedInFlight++
      if (r.budget_day === budgetDay) reservedTokensOutstanding += r.reserved_tokens
    }
  }

  // runsToday（#8）：今日 reservation 中「计入运行名额」者之和——排除纯竞争(claim-lost)/过期(reservation-expired)。
  let runsToday = 0
  for (const [rid, reservation] of reservationById) {
    if (reservation.loop_id !== loopId || reservation.budget_day !== budgetDay) continue
    if (countsAsRun(reservation, terminalByReservationId.get(rid), activatedReservationIds.has(rid))) runsToday++
  }

  let settledTokensActual = 0
  let settledTokensEstimated = 0
  let lastResult: RunResult | undefined
  let lastFinishedAt: string | undefined
  for (const r of records) {
    if (r.kind !== 'run' || r.loop_id !== loopId) continue
    // 去重（#1）：带 reservation_id 的 RunRecord 只认首条 terminal，重复终局不双加、不覆盖 lastResult。
    if (r.reservation_id !== undefined && terminalByReservationId.get(r.reservation_id) !== r) continue
    lastResult = r.result // 文件序即时间序，末次覆盖 = 最近
    lastFinishedAt = r.finished_at
    const day = r.reservation_id !== undefined ? reservationById.get(r.reservation_id)?.budget_day ?? budgetDayOf(r.finished_at) : budgetDayOf(r.finished_at)
    if (day !== budgetDay) continue
    if (r.accounting.charge_source === 'provider-structured') settledTokensActual += r.accounting.charged_tokens
    else if (r.accounting.charge_source === 'reserved-estimate') settledTokensEstimated += r.accounting.charged_tokens
  }

  // 关系损坏与坏行同属账本损坏 → health=degraded（admission fail-closed），是全账本事实。
  const duplicateReservations = index.duplicateReservations.length
  const duplicateTerminals = index.duplicateTerminals.length
  const invalidActivations = index.invalidActivations.length
  const invalidTerminals = index.invalidTerminals.length
  return {
    loopId,
    budgetDay,
    runsToday,
    inFlight,
    activatedInFlight,
    reservedTokensOutstanding,
    settledTokensActual,
    settledTokensEstimated,
    lastResult,
    lastFinishedAt,
    openReservations,
    rejectedRecords: rejectedCount,
    duplicateReservations,
    duplicateTerminals,
    invalidActivations,
    invalidTerminals,
    health: rejectedCount > 0 || duplicateReservations > 0 || duplicateTerminals > 0
      || invalidActivations > 0 || invalidTerminals > 0 ? 'degraded' : 'ok',
  }
}

/** admission 硬额度（reservation 时冻结进 limits_snapshot；on_exceed 已归一成闭集）。 */
export interface AdmissionLimits {
  readonly maxRunsPerDay: number
  readonly maxInFlight: number
  readonly maxTokensPerDay?: number
  readonly onExceed: BudgetExceedAction
}

/** admission 判定被挡的维度 + 对应处置动作（budget 类超限用 on_exceed；并发/歧义/坏行用 skip-run）。 */
export type AdmissionBlock =
  | { readonly limit: 'max-runs-per-day'; readonly action: BudgetExceedAction }
  | { readonly limit: 'max-tokens-per-day'; readonly action: BudgetExceedAction }
  | { readonly limit: 'max-in-flight'; readonly action: 'skip-run' }
  | { readonly limit: 'duplicate-change'; readonly action: 'skip-run' }
  | { readonly limit: 'ledger-degraded'; readonly action: 'skip-run' }

export type AdmissionDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly block: AdmissionBlock; readonly detail: string }

/**
 * 纯额度判定（第 3 节原子 preflight 的会计部分——registry 可解析/loop 存在/status active/binding 无
 * 歧义等由 loop-admission.ts 在锁内先行判；本函数只吃已投影的账本事实 + 本次预占）。
 * 顺序：坏行 fail-closed → 同 change 重复活跃预占 → max_runs_per_day → max_in_flight → max_tokens_per_day。
 */
export function admissionDecision(
  projection: LoopLedgerProjection,
  limits: AdmissionLimits,
  input: { readonly change: string; readonly reservedTokens: number },
): AdmissionDecision {
  // 坏行 fail-closed（跳过坏行会少算预算 → 超卖，绝不放行）。
  if (projection.health === 'degraded') {
    const issues = projection.rejectedRecords + projection.duplicateReservations + projection.duplicateTerminals
      + projection.invalidActivations + projection.invalidTerminals
    return { allowed: false, block: { limit: 'ledger-degraded', action: 'skip-run' }, detail: `账本有 ${issues} 条坏行/关系损坏，admission fail-closed` }
  }
  // 同 change 已有未关闭预占 → 拒（防同一 change 双预占双跑）。
  if (projection.openReservations.some((r) => r.change === input.change)) {
    return { allowed: false, block: { limit: 'duplicate-change', action: 'skip-run' }, detail: `change「${input.change}」已有未关闭 reservation` }
  }
  // 今日 runs（已结算 + 活跃预占）+ 本次 ≤ max_runs_per_day。
  if (projection.runsToday + 1 > limits.maxRunsPerDay) {
    return { allowed: false, block: { limit: 'max-runs-per-day', action: limits.onExceed }, detail: `今日 runs ${projection.runsToday} + 1 > max_runs_per_day ${limits.maxRunsPerDay}` }
  }
  // 在途（未关闭预占）+ 本次 ≤ max_in_flight。
  if (projection.inFlight + 1 > limits.maxInFlight) {
    return { allowed: false, block: { limit: 'max-in-flight', action: 'skip-run' }, detail: `在途 ${projection.inFlight} + 1 > max_in_flight ${limits.maxInFlight}` }
  }
  // 今日 token：已结算实扣 + 估扣 + 未关闭预占占位 + 本次预占 ≤ max_tokens_per_day（未声明预算 → 跳过）。
  if (limits.maxTokensPerDay !== undefined) {
    const used = projection.settledTokensActual + projection.settledTokensEstimated + projection.reservedTokensOutstanding
    if (used + input.reservedTokens > limits.maxTokensPerDay) {
      return { allowed: false, block: { limit: 'max-tokens-per-day', action: limits.onExceed }, detail: `今日 token ${used} + 本次 ${input.reservedTokens} > max_tokens_per_day ${limits.maxTokensPerDay}` }
    }
  }
  return { allowed: true }
}

/** 展示用剩余额度（max − 已结算 − 未关闭预占；无 token 预算 → null）。CLI/snapshot 复用，判定与展示同源。 */
export function remainingTokens(projection: LoopLedgerProjection, maxTokensPerDay?: number): number | null {
  if (maxTokensPerDay === undefined) return null
  const used = projection.settledTokensActual + projection.settledTokensEstimated + projection.reservedTokensOutstanding
  return Math.max(0, maxTokensPerDay - used)
}
