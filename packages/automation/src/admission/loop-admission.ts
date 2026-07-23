/**
 * loop admission —— 原子 preflight + reservation 生命周期 + kill-switch + 崩溃恢复（GOAL H · Stage C，
 * codex 第 3 节权威设计）。
 *
 * 判定位置（第 3 节）：**不**扩 gate.ts::optedIn（轻量 opt-in 纯函数，无 ledger/registry 锁，塞进去
 * 制造「看似已管控」的假安全）；**不**只放 CLI preflight（server/H14/SDK 都能绕过）。权威点 =
 * scheduler.handleOne 且**在 claim 之前**：semaphore.acquire → admission.reserve()（仓级锁内重读
 * registry+ledger）→ claim → activate → status recheck → running → runChange → pre-merge recheck →
 * terminal CAS → settle。
 *
 * 原子性核心（第 3 节 + C 验收「两并发 round 只一个 reserve 成功」）：reserve() 的「重读 registry+
 * ledger → 判定 → append reservation」全程在**一次 withLedgerLock 内顺序执行**（Stage A 契约：锁内
 * 可 read+append 多条，但不得锁内并发）。仓级锁串行两个并发 round，第二个必然读到第一个刚 append 的
 * reservation，不可能同时读到旧预算都通过。reservation 的 ledger 写入**严格早于** queued→scheduled
 * CAS（reserve 在 claim 之前）。
 */
import type { AutomationPolicySnapshot, EffectiveSkillResolver, LoopEntry, LoopLedgerStore, LoopRegistry, SkillBundleResolutionInput } from '@pipeline-lite/kernel'
import {
  admissionDecision, budgetDayOf, buildAttemptContext, compileAutomationPolicySnapshot, compileConstraintPolicy, evaluateConstraintPolicy,
  indexMergeFactsByAttempt, LedgerDegradedError, loopMaterialUnchanged,
  normalizeOnExceed, projectLoopLedger,
  registryContentEpoch, reservedTokensFor, resolveLoopBinding, resolveSkillBundle, withRegistryGovernanceLock,
  type AdmissionBlock, type AttemptContextLedgerSnapshot, type BudgetExceedAction, type BudgetReservationRecord,
  type ChangeLoopBindingRecord, type LedgerRecord, type MergeIntentRecord, type MergeLandedRecord,
  type ReservationActivatedRecord, type RunRecord, type SkillBundleSnapshotRecord, type UsageRecord, type VerificationResult,
} from '@pipeline-lite/kernel'
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

const errText = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const isPreparedContext = (ctx: ExecutionContext): ctx is PreparedExecutionContext =>
  'preparedKind' in ctx && (ctx.preparedKind === 'loop-bundle' || ctx.preparedKind === 'non-loop')

/** activation 的 durable authority：Prepared bundle 必须逐字段对应本 reservation 唯一 snapshot 事实。 */
const snapshotMatchesPrepared = (
  snapshot: SkillBundleSnapshotRecord,
  ctx: Extract<PreparedExecutionContext, { readonly preparedKind: 'loop-bundle' }>,
): boolean => {
  const bundle = ctx.skillBundle
  return snapshot.attempt_id === ctx.attempt_id
    && snapshot.reservation_id === ctx.reservation_id
    && snapshot.loop_id === ctx.loop_id
    && snapshot.skill_bundle_id === ctx.skill_bundle_id
    && snapshot.policy_epoch === ctx.policy_epoch
    && snapshot.workflow_run_id === (ctx.workflow_run_id ?? ctx.attempt_id)
    && snapshot.resolution_source === bundle.resolutionSource
    && snapshot.workflow === bundle.workflow
    && snapshot.step === bundle.step
    && snapshot.track === bundle.track
    && snapshot.coordinate_digest === bundle.coordinateDigest
    && snapshot.snapshot_sha256 === bundle.snapshotSha256
    && snapshot.cas_relative_path === bundle.casRelativePath
    && snapshot.slots.length === bundle.slots.length
    && snapshot.slots.every((slot, index) => {
      const prepared = bundle.slots[index]
      return prepared !== undefined
        && slot.token === prepared.token
        && slot.concrete_skill_id === prepared.concreteSkillId
        && slot.tree_sha256 === prepared.treeSha256
        && slot.alternatives.length === prepared.alternatives.length
        && slot.alternatives.every((alternative, i) => alternative === prepared.alternatives[i])
    })
}

/**
 * H10 §1/§5：loop 的 `skill_bundle_id` 是具名 profile（非 `_all`），但调用方未装配
 * `LoopAdmissionDeps.isSkillProfileKnown`——这不是「profile 不存在」（那是
 * `skill-bundle-profile-not-found` denial，需要真校验器给出 `false` 才能下这个结论），而是
 * 「校验能力尚未接线」（H10 生产装配见任务7）。两者必须区分：把「未装配」误判成「不存在」会让
 * 一个实际合法的具名 profile 在 task7 接线前被错误暂停，并在 loops.yaml 留下一条虚假的治理事实。
 * 故此处 fail-closed **throw**（不放行、不建 reservation）而非返回某个业务 denial reason——镜像
 * `RegistryReadError`/`LedgerDegradedError`等既有「基础设施/装配缺口 throw 成 round failure」的
 * 处置，绝不把配置缺口伪装成业务判定持久化。
 */
export class SkillProfileValidatorUnconfiguredError extends Error {
  readonly _tag = 'SkillProfileValidatorUnconfiguredError'
  constructor(message: string) { super(message); this.name = 'SkillProfileValidatorUnconfiguredError' }
}

/** reserve 拒绝的结构化原因（scheduler 据此决定 skip-run / pause-loop / halt-round + 记 RoundReport）。 */
export interface AdmissionDenial {
  readonly ok: false
  /** 归一后的处置动作：budget 超限用 loop.on_exceed；并发/歧义/坏行/status/binding 类一律 skip-run。 */
  readonly action: BudgetExceedAction | 'skip-run'
  /** 判别原因（binding-* / loop-inactive / registry-* / max-* / duplicate-change / ledger-degraded）。 */
  readonly reason: string
  readonly detail: string
  /** loop_id 已解析出时携带（status/额度类拒绝）；binding 失败时可能无。 */
  readonly loopId?: string
  readonly block?: AdmissionBlock
}

export type ReserveResult = { readonly ok: true; readonly context: ExecutionContext } | AdmissionDenial

/** reserveOnce 的内部结果：正常 ReserveResult 或「epoch 变、须整轮重试」哨兵（#4）。 */
type ReserveOutcome = ReserveResult | { readonly retry: true }

/**
 * activate 结构化结果（Stage B 返工 #1）：ledger 锁内验证 reservation 未关闭后 append reservation-activated。
 *   · activated —— 已 append（或已存在 activated，幂等）。
 *   · already-terminal —— reservation 已被 recovery/结算关闭，或 activate 锁内发现 TTL 已严格过期并
 *     原子关闭（reserve→activate 之间的竞态/慢 preparation），不追加晚到 activation。
 * ledger I/O 故障（read/append/fsync/lock）throw typed error（调用方 fail-loud，绝不进 running）。
 */
export type ActivateResult = { readonly status: 'activated' } | { readonly status: 'already-terminal' }

/** 结算入参（scheduler 在 terminal CAS 后调 settleWon 关闭 reservation）。 */
export interface RunSettlement {
  readonly result: RunRecord['result']
  readonly reason?: RunRecord['reason']
  readonly startedAt?: string
  readonly verify?: { readonly result: 'pass' | 'fail' }
  /**
   * H7 verifier Phase 2：host/human 签发的结构化 verdict（lifecycle 经 VerifierPort 产出、scheduler
   * 经 evaluateVerificationGate 判定后原样透传）。settleWon 只持久化——不在 ledger 锁里跑 verifier、
   * 不重新判定。缺席 = 未做结构化核验的旧调用点（run 仍只落自报 verify，向后兼容）。
   */
  readonly verification?: VerificationResult
  readonly artifacts?: { readonly buildSha?: string; readonly branch?: string; readonly commitShas: readonly string[] }
  /** 有真跑但无可信 provider usage → 'reserved-estimate'（按预占保守扣账）；skip/no-op/claim-lost → 'none'（扣 0）。 */
  readonly charge: 'reserved-estimate' | 'none'
  readonly error?: { readonly cause: string; readonly message: string }
  readonly workflowRunId?: string
  /**
   * H10 §3/§8任务3：本次 run 消费的 skill bundle 快照聚合 hash（= 对应
   * `SkillBundleSnapshotRecord.snapshot_sha256`）。settleWon 据此写入终态 `RunRecord.
   * skill_bundle_snapshot_sha256`，供查询快速关联而不必回查 skill-bundle-snapshot 记录本身。
   * 只有走过 `prepareSkillBundle` 成功路径（`ctx` 是 `PreparedExecutionContext`）的 settle 才应
   * 携带；claim-lost/kill-switch 等从未 prepare 的路径缺省不传，终态该字段保持缺席（语义等价旧行）。
   */
  readonly skillBundleSnapshotSha256?: string
}

/** lifecycle 在 commit-tree 后、ref CAS 前交给 admission ledger 的完整 intent 输入。 */
export interface MergeIntentJournalInput {
  readonly context: PreparedExecutionContext
  readonly baseRef: string
  readonly baseBefore: string
  readonly branchRef: string
  readonly branchTip: string
  readonly mergedCommit: string
  readonly verification?: VerificationResult
  readonly verifyResult: 'pass' | 'fail'
  readonly buildSha?: string
  readonly branch: string
  readonly commitShas: readonly string[]
}

/** ref CAS 后的 landed receipt；同 intent 可追加更新的 host sync 状态，projection 取最新。 */
export interface MergeLandedJournalInput {
  readonly context: PreparedExecutionContext
  readonly intentRecordId: string
  readonly baseRef: string
  readonly baseBefore: string
  readonly branchTip: string
  readonly mergedCommit: string
  readonly hostSynced: boolean
  readonly hostSyncError?: string
}

export interface RecoveredMergeState {
  readonly cause: 'host-sync-pending' | 'merge-journal-pending' | 'completed'
  readonly message: string
}

export interface LoopAdmission {
  /**
   * 原子 preflight（governance 锁 + ledger 锁内重读 registry+ledger → epoch 复验 → 判定 → append reservation + fsync）。
   * `expectedLoopId` 只是 selector 已观察到的自然归属：锁内必须重新按最新 durable binding/前缀解析，
   * 仅在仍相等时放行；它绝不是能覆盖 durable binding 的显式归属指令。
   */
  reserve(change: string, opts?: {
    expectedLoopId?: string
    /** null=调用方显式覆盖 level；L1/L2/L3=selector 观察到的 loop 默认值，锁内必须仍相等。 */
    expectedAutonomyLevel?: AutomationLevel | null
  }): Promise<ReserveResult>
  /** claim 成功后 ledger 锁内验证 reservation 未关闭且未过 expires_at → append reservation-activated。
   *  已关闭或 TTL 已过期并在锁内幂等关闭 → already-terminal（不追加晚到 activation）；ledger I/O
   *  故障 → throw（调用方 fail-loud，不进 running）。 */
  activate(ctx: ExecutionContext): Promise<ActivateResult>
  /** Codex provider JSONL 用量事实；同 attempt 同值重放幂等，冲突值 fail-closed。 */
  recordProviderUsage(ctx: ExecutionContext, usage: ProviderStructuredUsage): Promise<string>
  /** 结算：closeReservationIfOpen 幂等关闭（commit marker）；already-closed 是成功幂等结果、不双扣；I/O 故障 → throw。 */
  settleWon(ctx: ExecutionContext, settlement: RunSettlement): Promise<void>
  /** claim 输掉：幂等关闭 reservation，扣账 0（result=skipped/reason=claim-lost）。 */
  settleLost(ctx: ExecutionContext): Promise<void>
  /** commit-tree 后、ref CAS 前 fsync intent；返回 landed 关联所需 record_id。 */
  recordMergeIntent(input: MergeIntentJournalInput): Promise<string>
  /** ref CAS 后 fsync receipt；同 intent 可先记 landed、再记最终 host sync 结果。 */
  recordMergeLanded(input: MergeLandedJournalInput): Promise<void>
  /** kill-switch 重查：loop 此刻是否仍 active（claim 后 running 前 / terminal settle 前调）。仅展示/保守终态修正，不用于「检查后行动」。 */
  isActive(loopId: string): Promise<boolean>
}

export interface LoopAdmissionDeps {
  readonly repoRoot: string
  readonly ledger: LoopLedgerStore
  /**
   * 载入 loops registry（真跑注入 `loadRegistry(root, nodeLoopIoStrict)`；测试注入 fake）。契约（Stage B 返工 #2）：
   * 文件不存在 → {data:null, errors:[]}（合法「无 registry」denial）；解析/schema 失败 → {data:null, errors:[…]}；
   * **真实 I/O 故障（EACCES/EIO/EISDIR…）→ throw**（RegistryReadError）——reserve 让其上抛成 round failure
   * （ok=false），绝不吞成「文件不存在」denial（round 假 ok=true）。isActive 则 catch 成 fail-closed。
   */
  readonly loadRegistry: (repoRoot: string) => { data: LoopRegistry | null; errors: string[] }
  readonly clock: () => string
  /** 本次 round 的分级放权档（写进 ExecutionContext.level / RunRecord.level）。 */
  readonly level: AutomationLevel
  /** 沙箱镜像（写进 ExecutionContext.image）。 */
  readonly image?: string
  /** reserve→activate 窗口（未 activate 的预占超此可在 ledger 锁外先修复 change state、再关闭扣 0）。缺省 10 分钟。 */
  readonly reservationTtlMs?: number
  /** 读某 change 当前 automation 态（recover 判 activated 预占对应 automation 是否 terminal）。 */
  readonly getAutomation: (change: string) => Promise<string>
  /** 运行存活探针（#5 orphan reconcile）：CLI 真跑注入 docker 实现（container 明确不存在 → 'dead'）、
   *  测试注入 fake、server/SDK 无实现 → 'unknown'。缺省 'unknown'（保守不擅自关闭 orphan）。 */
  readonly getExecutionLiveness?: (change: string) => Promise<ExecutionLiveness>
  /** owner CAS scheduled→queued（#5 orphan 明确 dead 时复位；#6 activation 补偿也复用）：成功返 true。
   *  缺省 no-op 返 false（无 store 写面 → 保守不恢复）。 */
  readonly resetScheduledToQueued?: (change: string) => Promise<boolean>
  /** running→failed/queued CAS（#5 orphan 明确 dead 时按 retry policy 落终态）：成功返 true。缺省 no-op 返 false。 */
  readonly failRunningToTerminal?: (change: string) => Promise<boolean>
  /** crash recovery 读取 ref 的真实值；缺席时只信 durable merge-landed，不猜 ref。 */
  readonly readGitRef?: (ref: string) => Promise<string>
  /**
   * crash recovery 的明确 commit ancestry probe：两个入参均为已解析的 commit SHA，
   * `true` 表示 ancestorCommit 已被证明为 descendantCommit 的祖先，`false` 表示不是。
   * 命令/I/O 无法得出布尔结论时必须 throw，调用方会保守保留 reservation。
   */
  readonly isCommitAncestor?: (ancestorCommit: string, descendantCommit: string) => Promise<boolean>
  /** 物理 merge 已确认后，把任何旧 automation 态原子修复为 merged；成功 resolve，失败 throw。 */
  readonly commitRecoveredMerge?: (change: string, state: RecoveredMergeState) => Promise<void>
  /** 唯一 id 生成器（缺省 makeIdGen()；测试可注入确定性序列）。 */
  readonly newId?: (prefix: string) => string
  /**
   * H10 §1/§5：skill bundle profile 存在性校验（词法已由 registry 的 `SKILL_BUNDLE_ID_RE` 保证；
   * 这里判定该具名 profile 是否真的在当前 manifest/track 声明域内）。`'_all'` 无需调用本函数——
   * 设计定稿 §1 明确其属于合法键空间，是内建的全量退路，不依赖任何具体 track 声明。
   *
   * 三态处置（不是二元 fail-closed 兜底）：
   *   · 具名 profile + 本函数返回 `false` → 真正的 `skill-bundle-profile-not-found`（admission
   *     denial，action=pause-loop——持久 wiring 错误）。
   *   · 具名 profile + 未注入本函数 → **不是** "profile 不存在"，是「校验能力尚未装配」（H10
   *     生产装配见任务7）——throw `SkillProfileValidatorUnconfiguredError`（fail-closed 拒绝放行/
   *     建 reservation，但绝不把"未装配"污染成一条虚假的 profile-not-found 治理事实，也绝不暂停
   *     loop——loop 本身的 bundle 配置可能完全合法，只是当前运行时缺一个校验器）。
   *   · `'_all'` → 恒真，不调用本函数（即便未注入也放行）。
   */
  readonly isSkillProfileKnown?: (profileId: string) => boolean
  /** Production bridge to the canonical WorkflowRun; invoked after reservation locks are released. */
  readonly bindAutomationPolicy?: (
    change: string,
    policy: AutomationPolicySnapshot,
    binding: { readonly loopId: string; readonly iterationId: string },
  ) => Promise<{
    readonly id: string; readonly automationPolicy?: AutomationPolicySnapshot
    readonly loopId?: string; readonly iterationId?: string
  }>
}

/** 运行存活（#5）：'dead' 才可 reconcile 关闭 orphan；'alive'/'unknown' 一律保守保留占 in-flight。 */
export type ExecutionLiveness = 'alive' | 'dead' | 'unknown'

/** daemon 仍持有（非 terminal）的 automation 态——recover 见这两态视 activated 预占为「真在途/orphan」，不恢复。 */
const DAEMON_OWNED = new Set(['scheduled', 'running'])
const DEFAULT_TTL_MS = 10 * 60 * 1000
/** reserve 遇 epoch 变化的最大整轮重试次数（避免活锁；连续变化 → registry-concurrent-update denial）。 */
const MAX_RESERVE_RETRIES = 3

/** automation terminal 态 → RunRecord.result（recover 无 usage，按 reserved-estimate 扣账，reason=recovered）。 */
function terminalToResult(automation: string): RunRecord['result'] {
  switch (automation) {
    case 'merged': return 'merged'
    case 'paused': return 'paused'
    case 'conflict': return 'conflict'
    case 'failed': return 'failed'
    case 'queued': return 'retry-queued'
    default: return 'skipped' // off / 未知
  }
}

/** H2：只从同一 loop/change 的 durable terminal RunRecord 构造下一次 runner context。 */
function attemptContextFor(
  records: readonly LedgerRecord[],
  loopId: string,
  change: string,
): AttemptContextLedgerSnapshot {
  const runs = records.filter(
    (record): record is RunRecord => record.kind === 'run' && record.loop_id === loopId && record.change === change,
  )
  const built = buildAttemptContext(runs.map((run) => ({
    attempt_id: run.attempt_id,
    loop_id: run.loop_id,
    change: run.change,
    result: run.result,
    recorded_at: run.finished_at,
    ...((run.error?.message ?? (run.reason === undefined || run.reason === 'completed' ? undefined : run.reason)) === undefined
      ? {}
      : { detail: run.error?.message ?? run.reason }),
  })), { tail: 3, maxChars: 6_000, stagnationThreshold: 3 })
  return {
    source_run_record_ids: runs.map((run) => run.run_record_id),
    omitted_attempt_ids: [...built.omittedAttemptIds],
    rendered: built.rendered,
    stagnation: {
      stagnant: built.stagnation.stagnant,
      ...(built.stagnation.fingerprint === undefined ? {} : { fingerprint: built.stagnation.fingerprint }),
      repeated_attempt_ids: [...built.stagnation.repeatedAttempts],
    },
  }
}

export function createLoopAdmission(deps: LoopAdmissionDeps): LoopAdmission {
  const { repoRoot, ledger, loadRegistry, clock, level, image, getAutomation, isSkillProfileKnown, bindAutomationPolicy } = deps
  const ttlMs = deps.reservationTtlMs ?? DEFAULT_TTL_MS
  const newId = deps.newId ?? makeIdGen()
  // #5 orphan reconcile 注入面（缺省保守：liveness unknown、CAS no-op → orphan 保持 open 不误关）。
  const getExecutionLiveness = deps.getExecutionLiveness ?? (async (): Promise<ExecutionLiveness> => 'unknown')
  const resetScheduledToQueued = deps.resetScheduledToQueued ?? (async (): Promise<boolean> => false)
  const failRunningToTerminal = deps.failRunningToTerminal ?? (async (): Promise<boolean> => false)
  const readGitRef = deps.readGitRef
  const isCommitAncestor = deps.isCommitAncestor
  const commitRecoveredMerge = deps.commitRecoveredMerge

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
      const reservation = reservations[0]!
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
  const recoverLoopInLock = async (records: readonly LedgerRecord[], loopId: string): Promise<void> => {
    const closed = new Set<string>()
    for (const r of records) if (r.kind === 'run' && r.reservation_id !== undefined) closed.add(r.reservation_id)
    const activatedIds = new Set<string>()
    for (const r of records) if (r.kind === 'reservation-activated') activatedIds.add(r.reservation_id)
    const now = clock()
    for (const r of records) {
      if (r.kind !== 'budget-reservation' || r.loop_id !== loopId) continue
      if (closed.has(r.reservation_id)) continue // 已关闭
      const isActivated = activatedIds.has(r.reservation_id)
      if (!isActivated) continue
      // merge intent 表明 ref CAS 可能已经发生；不论 automation 当前看起来是什么 terminal，
      // 都不能在 ledger 锁内用 generic recovered 吞掉 canonical verification/artifacts。
      if (mergeFactsForReservation(records, r).intent !== undefined) continue
      const automation = await getAutomation(r.change).catch(() => '')
      if (automation !== '' && !DAEMON_OWNED.has(automation)) {
        await close(r.reservation_id, (reservation) => closeRecord(reservation, {
          result: terminalToResult(automation), reason: 'recovered', charge: 'reserved-estimate', now,
          usageAccounting: usageAccountingFor(records, reservation),
        }))
      }
      // scheduled/running（daemon-owned 或读不到）→ orphan：本锁内不动，交 reconcileOrphans。
    }
  }

  /**
   * orphan 最小 reconcile（Stage B 返工 #5，不加 heartbeat/lease/CLI）——**在任何 ledger 锁
   * 之外调用**（reserve 主临界区前的 pre-phase）：锁序铁律 `governance→ledger` 内禁 change lock，故
   * change CAS 与 ledger close 各自独立临界区、绝不同持。未 activate 且 TTL 已过时：queued 可直接
   * close；scheduled 必须先 owner CAS→queued，成功后才 close。CAS false/throw 保留 open；若 CAS 已
   * 落盘但进程在 close 前崩溃，下轮看到 queued 再直接 close。activated orphan 仅当存活证据明确
   * 「dead」才恢复；alive/unknown 保守保留占 in-flight（不猜关闭，宁堵不误杀真长任务）。
   */
  const reconcileOrphans = async (): Promise<void> => {
    const read = await ledger.read(repoRoot).catch(() => null)
    if (read === null || read.rejected.length > 0) return // 读失败/坏行 → 本轮不 reconcile（不猜）
    const closedIds = new Set<string>()
    for (const r of read.records) if (r.kind === 'run' && r.reservation_id !== undefined) closedIds.add(r.reservation_id)
    const activatedIds = new Set<string>()
    for (const r of read.records) if (r.kind === 'reservation-activated') activatedIds.add(r.reservation_id)
    const now = clock()
    for (const r of read.records) {
      if (r.kind !== 'budget-reservation') continue
      if (closedIds.has(r.reservation_id)) continue
      const isActivated = activatedIds.has(r.reservation_id)
      if (!isActivated) {
        if (!(now > r.expires_at)) continue
        const automation = await getAutomation(r.change).catch(() => '')
        if (automation === 'queued') {
          await close(r.reservation_id, (reservation) => closeRecord(reservation, {
            result: 'skipped', reason: 'reservation-expired', charge: 'none', now,
          }))
        } else if (automation === 'scheduled') {
          const won = await resetScheduledToQueued(r.change).catch(() => false)
          if (won) {
            await close(r.reservation_id, (reservation) => closeRecord(reservation, {
              result: 'skipped', reason: 'reservation-expired', charge: 'none', now,
            }))
          }
        }
        continue
      }
      const mergeFacts = mergeFactsForReservation(read.records, r)
      const intent = mergeFacts.intent
      if (intent !== undefined) {
        // landed receipt 是最强证据，无需再读 ref。intent-only 则先信精确 tip==M，
        // tip 已前进时再用明确的 commit ancestry probe 证明 M 在当时 base 历史中。
        let mergeConfirmed = mergeFacts.landed !== undefined
        if (!mergeConfirmed && readGitRef !== undefined) {
          const observed = await readGitRef(intent.base_ref).catch(() => '')
          mergeConfirmed = observed === intent.merged_commit_sha
          if (!mergeConfirmed && observed !== '' && isCommitAncestor !== undefined) {
            mergeConfirmed = await isCommitAncestor(intent.merged_commit_sha, observed).catch(() => false)
          }
        }
        // intent 记录了「可能已进行不可逆 ref CAS」。无论 probe 返回 false、缺席
        // 还是命令错误，都只能表示本轮无法证明 merged；不得继续落普通 orphan failed。
        if (!mergeConfirmed) continue
        // change state 写与 ledger close 分属独立锁：先把不可逆物理事实修复为
        // merged，再幂等关 reservation。两步之间 crash 时下轮重做，不双扣账。
        if (commitRecoveredMerge === undefined) continue
        const recoveredState = recoveredMergeState(mergeFacts.landed)
        await commitRecoveredMerge(r.change, recoveredState)
        await close(r.reservation_id, (reservation) =>
          buildRecoveredMergeTerminal(reservation, intent, mergeFacts.landed, clock()))
        continue
      }
      const automation = await getAutomation(r.change).catch(() => '')
      if (!DAEMON_OWNED.has(automation)) continue // 只处理 daemon-owned（scheduled/running）orphan
      const liveness = await getExecutionLiveness(r.change).catch((): ExecutionLiveness => 'unknown')
      if (liveness !== 'dead') continue // alive / unknown → 保留占 in-flight（不猜）
      if (automation === 'scheduled') {
        const won = await resetScheduledToQueued(r.change).catch(() => false) // change 锁（独立临界区）
        if (won) await close(r.reservation_id, (reservation) => closeRecord(reservation, { result: 'skipped', reason: 'infrastructure-error', charge: 'none', now }))
      } else if (automation === 'running') {
        const settled = await failRunningToTerminal(r.change).catch(() => false) // change 锁（独立临界区）
        if (settled) await close(r.reservation_id, (reservation) => closeRecord(reservation, {
          result: 'failed', reason: 'infrastructure-error', charge: 'reserved-estimate', now,
          usageAccounting: usageAccountingFor(read.records, reservation),
        }))
      }
    }
  }

  /** 由未结算预占派生一条关闭 RunRecord（recover / claim-lost / expired / orphan 共用）。 */
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

  const reserve = async (change: string, opts?: {
    expectedLoopId?: string
    expectedAutonomyLevel?: AutomationLevel | null
  }): Promise<ReserveResult> => {
    // #5 pre-phase：activated orphan reconcile（ledger 锁之外——change CAS 不得在 ledger 锁内取）。
    await reconcileOrphans()
    // #3#4 主临界区：外层 governance 锁串行化所有 registry 写/物化预占；内层 ledger 锁做「重读→判定→append」
    // 原子（锁序 governance→ledger，内层绝不取 change 锁）。epoch 变（人工编辑/未迁移写方）→ 重试 ≤3 次。
    for (let attempt = 1; attempt <= MAX_RESERVE_RETRIES; attempt++) {
      const outcome = await withRegistryGovernanceLock(repoRoot, () => reserveOnce(change, opts))
      if ('retry' in outcome) continue
      if (!outcome.ok || bindAutomationPolicy === undefined) return outcome
      try {
        const policy = outcome.context.automation_policy
        if (policy === undefined) throw new Error('loop admission produced no AutomationPolicy snapshot')
        const iterationId = outcome.context.iteration_id
        if (iterationId === undefined) throw new Error('loop admission produced no iteration identity')
        const run = await bindAutomationPolicy(change, policy, { loopId: outcome.context.loop_id, iterationId })
        if (run.automationPolicy?.policy_version !== policy.policy_version) {
          throw new Error('WorkflowRun did not persist the admitted AutomationPolicy snapshot')
        }
        if (run.loopId !== outcome.context.loop_id || run.iterationId !== iterationId) {
          throw new Error('WorkflowRun did not persist the admitted loop/iteration identity')
        }
        return { ok: true, context: Object.freeze({ ...outcome.context, workflow_run_id: run.id }) }
      } catch (bindingError) {
        // reservation 已在 reserveOnce 的 ledger 临界区 durable 落盘；WorkflowRun 绑定位于锁外，
        // 因此同步失败必须以零扣费 terminal 补偿关闭，不能把 in-flight 额度泄漏到 TTL recovery。
        // 原绑定错误仍原样上抛；若补偿本身也失败，则把两项事实都带给上层，且保留 open reservation
        // 供既有 recovery 处理（绝不谎报已关闭）。
        try {
          await close(outcome.context.reservation_id, (reservation) => ({
            ...closeRecord(reservation, {
              result: 'failed', reason: 'automation-policy-bind-failed', charge: 'none',
              now: clock(), runner: outcome.context.runner,
            }),
            admitted_at: outcome.context.admitted_at,
            error: { cause: 'automation-policy-bind-failed', message: errText(bindingError) },
          }))
        } catch (settlementError) {
          throw new Error(
            `AutomationPolicy binding failed (${errText(bindingError)}) and reservation compensation failed (${errText(settlementError)})`,
            { cause: bindingError },
          )
        }
        throw bindingError
      }
    }
    return { ok: false, action: 'skip-run', reason: 'registry-concurrent-update', detail: `registry 连续 ${MAX_RESERVE_RETRIES} 次在 admission 临界区内变化，放弃本轮（避免活锁）` }
  }

  /** 单次 reserve 临界区（已持 governance 锁）：内层 ledger 锁重读→判定→epoch 复验→append。epoch 变 → { retry }。 */
  const reserveOnce = async (change: string, opts?: {
    expectedLoopId?: string
    expectedAutonomyLevel?: AutomationLevel | null
  }): Promise<ReserveOutcome> => {
    // Stage B 返工 #2：loadRegistry 真实 I/O 故障（EACCES/EIO/EISDIR…）**throw**（不 catch）→ 经
    // withRegistryGovernanceLock 上抛到 scheduler.handleOne 顶层 catch，归 RoundReport.failures（registry-io）
    // 使 ok=false。只有 ENOENT→data:null 才是合法「无 registry」denial（下方 fail-closed skip-run）。
    const reg1 = loadRegistry(repoRoot)
    if (reg1.errors.length > 0) {
      return { ok: false, action: 'skip-run', reason: 'registry-unparseable', detail: `loops.yaml 载入失败：${reg1.errors[0]}` }
    }
    if (reg1.data === null) {
      return { ok: false, action: 'skip-run', reason: 'no-registry', detail: 'loops.yaml 不存在（无 loop 语境，fail-closed）' }
    }
    const registry1 = reg1.data
    const epoch1 = registryContentEpoch(registry1)
    return ledger.withLedgerLock(repoRoot, async (): Promise<ReserveOutcome> => {
      const read1 = await ledger.read(repoRoot)
      if (read1.rejected.length > 0) {
        return { ok: false, action: 'skip-run', reason: 'ledger-degraded', detail: `账本有 ${read1.rejected.length} 条坏行，admission fail-closed` }
      }
      // 归属（snapshot1）只信锁内最新 durable binding，其次最长前缀。targeted run 的 expectedLoopId
      // 是 selector 先前观察值，只做乐观并发复核，绝不能喂给 resolveLoopBinding 的 explicit override。
      const binding = resolveLoopBinding({
        change, latestBindingLoopId: latestBinding(read1.records, change), loops: registry1.loops,
      })
      if (!binding.ok) {
        if (opts?.expectedLoopId !== undefined) {
          return {
            ok: false,
            action: 'skip-run',
            reason: 'binding-changed',
            detail: `selector 预期 change「${change}」归属 loop「${opts.expectedLoopId}」，但锁内最新自然归属无法解析：${binding.detail}`,
          }
        }
        return { ok: false, action: 'skip-run', reason: `binding-${binding.reason}`, detail: binding.detail }
      }
      if (opts?.expectedLoopId !== undefined && binding.loopId !== opts.expectedLoopId) {
        return {
          ok: false,
          action: 'skip-run',
          reason: 'binding-changed',
          detail: `selector 预期 change「${change}」归属 loop「${opts.expectedLoopId}」，锁内最新 durable 自然归属已变为「${binding.loopId}」`,
          loopId: binding.loopId,
        }
      }
      const loop1: LoopEntry = registry1.loops.find((l) => l.id === binding.loopId)!
      if (opts?.expectedAutonomyLevel !== undefined && opts.expectedAutonomyLevel !== null
        && loop1.autonomy_level !== opts.expectedAutonomyLevel) {
        return {
          ok: false,
          action: 'skip-run',
          reason: 'policy-changed',
          detail: `selector 观察到 loop「${loop1.id}」autonomy=${opts.expectedAutonomyLevel}，` +
            `admission 锁内最新值为 ${loop1.autonomy_level}；拒绝沿用过期放权级别`,
          loopId: loop1.id,
        }
      }
      const admissionConstraint = evaluateConstraintPolicy(compileConstraintPolicy(loop1), {
        operation: 'admission', active: loop1.status === 'active', matches: () => false,
      })
      if (!admissionConstraint.allowed) {
        return { ok: false, action: 'skip-run', reason: 'loop-inactive', detail: `loop「${loop1.id}」status=${loop1.status}（非 active，硬拒）`, loopId: loop1.id }
      }
      // H10 §1/§5：skill bundle wiring 硬闸——字段缺失/null（unwired）或具名 profile 经真校验器判定
      // 不存在都是持久 wiring 错误：admission 拒绝、绝不创建 reservation，治理入口暂停 loop（否则
      // 一个从未接线/接错线的 loop 会被无人确认地放行 real-run）。只需在 loop1 上判定一次——
      // loop2 若 skill_bundle_id 有变化，下方 loopMaterialUnchanged(loop1, loop2)（已纳入
      // skill_bundle_id 比较，见 governance.ts）会使整轮 { retry: true } 重新走一遍本判定，
      // 不会绕过。校验能力尚未装配（未注入 isSkillProfileKnown 且非 '_all'）不是「不存在」，
      // throw 而非返回业务 denial（见 SkillProfileValidatorUnconfiguredError 头注）。
      const bundleId1 = loop1.skill_bundle_id
      if (bundleId1 === null || bundleId1 === undefined) {
        return { ok: false, action: 'pause-loop', reason: 'skill-bundle-unwired', detail: `loop「${loop1.id}」skill_bundle_id 未接线（缺省/null）——fail-closed 拒绝 real-run`, loopId: loop1.id }
      }
      if (bundleId1 !== '_all') {
        if (isSkillProfileKnown === undefined) {
          throw new SkillProfileValidatorUnconfiguredError(
            `loop「${loop1.id}」skill_bundle_id="${bundleId1}" 需要具名 profile 存在性校验，但 LoopAdmissionDeps.isSkillProfileKnown 未装配（H10 生产装配见任务7）——fail-closed，不放行、不创建 reservation`,
          )
        }
        if (!isSkillProfileKnown(bundleId1)) {
          return { ok: false, action: 'pause-loop', reason: 'skill-bundle-profile-not-found', detail: `loop「${loop1.id}」skill_bundle_id="${bundleId1}" 不在当前合法 profile 键空间`, loopId: loop1.id }
        }
      }
      const now = clock()
      const automationPolicy = compileAutomationPolicySnapshot(loop1, { capturedAt: now })
      // 崩溃恢复（锁内先行；只 ledger-only 关闭——见 recoverLoopInLock 注释，绝不取 change 锁）。
      await recoverLoopInLock(read1.records, loop1.id)
      // ── epoch reverify（#4；append binding/reservation 之前）：重读 registry 验 epoch 未变。所有受支持
      //    写方都持 governance 锁，正常 epoch 不可能变；此复验捕获人工编辑/未迁移旧写方 → 变则 { retry }。
      const reg2 = loadRegistry(repoRoot)
      if (reg2.data === null || registryContentEpoch(reg2.data) !== epoch1) return { retry: true }
      const registry2 = reg2.data
      const read2 = await ledger.read(repoRoot) // recover 后重读（binding 尚未 append，不影响预算投影）
      // re-resolve binding against snapshot2，验 loop 仍存在/active/物化字段未变（epoch 相等已蕴含，防御复核）。
      const binding2 = resolveLoopBinding({
        change, latestBindingLoopId: latestBinding(read2.records, change), loops: registry2.loops,
      })
      if (opts?.expectedLoopId !== undefined && (!binding2.ok || binding2.loopId !== opts.expectedLoopId)) {
        return {
          ok: false,
          action: 'skip-run',
          reason: 'binding-changed',
          detail: binding2.ok
            ? `selector 预期 change「${change}」归属 loop「${opts.expectedLoopId}」，admission 复验时最新自然归属为「${binding2.loopId}」`
            : `selector 预期 change「${change}」归属 loop「${opts.expectedLoopId}」，admission 复验时自然归属无法解析：${binding2.detail}`,
          loopId: binding2.ok ? binding2.loopId : undefined,
        }
      }
      if (!binding2.ok || binding2.loopId !== binding.loopId) return { retry: true }
      const loop2 = registry2.loops.find((l) => l.id === binding2.loopId)
      if (loop2 === undefined || loop2.status !== 'active' || !loopMaterialUnchanged(loop1, loop2)) return { retry: true }
      // ── epoch 复验通过 → 物化 binding + append reservation ──
      if (binding.materialize) {
        const bindingRecord: ChangeLoopBindingRecord = { ...base(), kind: 'change-loop-binding', change, loop_id: loop2.id, source: 'longest-prefix' }
        await ledger.append(repoRoot, bindingRecord)
      }
      const { tokens, basis } = reservedTokensFor(loop2)
      const onExceed = normalizeOnExceed(loop2.budget.on_exceed)
      const budgetDay = budgetDayOf(now)
      const projection = projectLoopLedger(read2.records, read2.rejected.length, loop2.id, budgetDay)
      const decision = admissionDecision(
        projection,
        { maxRunsPerDay: loop2.budget.max_runs_per_day, maxInFlight: loop2.budget.max_in_flight, maxTokensPerDay: loop2.budget.max_tokens_per_day, onExceed },
        { change, reservedTokens: tokens },
      )
      if (!decision.allowed) {
        return { ok: false, action: decision.block.action, reason: decision.block.limit, detail: decision.detail, loopId: loop2.id, block: decision.block }
      }
      // 判定通过 → append reservation（+ fsync）。这一条 ledger 写严格早于 claim 的 queued→scheduled CAS。
      const reservationId = newId('res')
      const attemptId = newId('att')
      const iterationId = `iteration-${attemptId}`
      const attemptContext = attemptContextFor(read2.records, loop2.id, change)
      await ledger.append(repoRoot, {
        ...base(), kind: 'budget-reservation', reservation_id: reservationId, attempt_id: attemptId,
        iteration_id: iterationId,
        loop_id: loop2.id, change, budget_day: budgetDay, reserved_runs: 1, reserved_tokens: tokens, token_basis: basis,
        limits_snapshot: { max_runs_per_day: loop2.budget.max_runs_per_day, max_in_flight: loop2.budget.max_in_flight, max_tokens_per_day: loop2.budget.max_tokens_per_day, on_exceed: onExceed },
        attempt_context: attemptContext,
        expires_at: new Date(Date.parse(now) + ttlMs).toISOString(),
      })
      const context: ExecutionContext = {
        attempt_id: attemptId, reservation_id: reservationId, loop_id: loop2.id, change,
        iteration_id: iterationId,
        level, runner: loop2.runner, image, admitted_at: now,
        reservation: { runs: 1, tokens, token_basis: basis },
        // H10 §3 步骤1：epoch1 通过了上面 reg2 的 registryContentEpoch(reg2.data) !== epoch1 复验
        // （不等则已 { retry: true }），此刻即 loop2 所在快照的物化 epoch；bundleId1 是 loop1 上
        // 已校验过（非空、_all 或已知具名 profile）的 skill_bundle_id，loopMaterialUnchanged 保证
        // loop2 的值与其相同（见上方判定注释）。
        policy_epoch: epoch1,
        skill_bundle_id: bundleId1,
        automation_policy: automationPolicy,
        attempt_context: attemptContext,
      }
      return { ok: true, context }
    })
  }

  /** ctx + reservation + settlement → terminal RunRecord builder（纯函数，关键字段取自 reservation：
   *  closeReservationIfOpen 会校验一致；reserved_tokens 以 ledger reservation 为权威）。 */
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
  const activate = async (ctx: ExecutionContext): Promise<ActivateResult> =>
    ledger.withLedgerLock(repoRoot, async (): Promise<ActivateResult> => {
      const read = await ledger.read(repoRoot)
      if (read.rejected.length > 0) {
        throw new LedgerDegradedError(`activate: 账本有 ${read.rejected.length} 条坏行，拒绝在损坏账本上激活 reservation「${ctx.reservation_id}」`)
      }
      const reservations = read.records.filter(
        (record): record is BudgetReservationRecord =>
          record.kind === 'budget-reservation' && record.reservation_id === ctx.reservation_id,
      )
      if (reservations.length !== 1) {
        throw new LedgerDegradedError(`activate: reservation「${ctx.reservation_id}」数量=${reservations.length}，拒绝激活`)
      }
      const reservation = reservations[0]!
      if (reservation.attempt_id !== ctx.attempt_id
        || (reservation.iteration_id !== undefined && ctx.iteration_id !== reservation.iteration_id)
        || reservation.loop_id !== ctx.loop_id || reservation.change !== ctx.change) {
        throw new LedgerDegradedError('activate: context 与 reservation 的 attempt/iteration/loop/change 不一致')
      }
      if (isPreparedContext(ctx)) {
        if (ctx.preparedKind !== 'loop-bundle' || ctx.skill_bundle_id == null) {
          throw new LedgerDegradedError('activate: loop admission 不接受 non-loop PreparedExecutionContext')
        }
        const snapshots = read.records.filter(
          (record): record is SkillBundleSnapshotRecord =>
            record.kind === 'skill-bundle-snapshot' && record.reservation_id === ctx.reservation_id,
        )
        if (snapshots.length !== 1 || !snapshotMatchesPrepared(snapshots[0]!, ctx)) {
          throw new LedgerDegradedError(
            `activate: reservation「${ctx.reservation_id}」的 skill-bundle-snapshot 缺失、重复或与 PreparedExecutionContext 不一致`,
          )
        }
      }
      const closed = read.records.some((r) => r.kind === 'run' && r.reservation_id === ctx.reservation_id)
      if (closed) return { status: 'already-terminal' } // recovery/结算已关闭，不追加晚到 activation
      const alreadyActivated = read.records.some((r) => r.kind === 'reservation-activated' && r.reservation_id === ctx.reservation_id)
      if (alreadyActivated) return { status: 'activated' } // TTL 只约束首次 reserve→activate 窗口；幂等重放不倒退

      const activatedAt = clock()
      const activatedAtMs = Date.parse(activatedAt)
      const expiresAtMs = Date.parse(reservation.expires_at)
      if (!Number.isFinite(activatedAtMs) || !Number.isFinite(expiresAtMs)) {
        throw new LedgerDegradedError(`activate: reservation「${ctx.reservation_id}」的 clock/expires_at 不是合法时间戳`)
      }
      if (activatedAtMs > expiresAtMs) {
        await close(ctx.reservation_id, (authoritative) => buildTerminal(ctx, authoritative, {
          result: 'skipped', reason: 'reservation-expired', charge: 'none',
          skillBundleSnapshotSha256:
            isPreparedContext(ctx) && ctx.preparedKind === 'loop-bundle'
              ? ctx.skillBundle.snapshotSha256
              : undefined,
        }))
        return { status: 'already-terminal' }
      }
      await ledger.append(repoRoot, {
        ...base(), kind: 'reservation-activated', reservation_id: ctx.reservation_id, attempt_id: ctx.attempt_id,
        iteration_id: ctx.iteration_id,
        loop_id: ctx.loop_id, change: ctx.change, started_at: activatedAt,
      })
      return { status: 'activated' }
    })

  /** settleWon：幂等关闭 reservation（Stage B 返工 #1，不再直接 ledger.append）。already-closed = 成功幂等。 */
  const settleWon = async (ctx: ExecutionContext, s: RunSettlement): Promise<void> => {
    await ledger.withLedgerLock(repoRoot, async () => {
      const read = await ledger.read(repoRoot)
      if (read.rejected.length > 0) {
        throw new LedgerDegradedError(`settleWon: 账本有 ${read.rejected.length} 条坏行`)
      }
      await close(ctx.reservation_id, (reservation) =>
        buildTerminal(ctx, reservation, s, usageAccountingFor(read.records, reservation)))
    })
  }

  const settleLost = async (ctx: ExecutionContext): Promise<void> => {
    await settleWon(ctx, { result: 'skipped', reason: 'claim-lost', charge: 'none' })
  }

  const isActive = async (loopId: string): Promise<boolean> => {
    // kill-switch 重查是「保守终态修正」用途：registry 消失/坏/I/O 故障一律 fail-closed（视为不 active），
    // 绝不因读故障放行。故此处 catch loadRegistry 的 I/O throw（与 reserve 的 fail-loud 相反：reserve 要
    // round 整体失败，isActive 只要保守判不 active）。
    let reg: { data: LoopRegistry | null; errors: string[] }
    try {
      reg = loadRegistry(repoRoot)
    } catch {
      return false
    }
    if (reg.data === null) return false // registry 消失/坏 → fail-closed（视为不 active）
    const loop = reg.data.loops.find((l) => l.id === loopId)
    return loop !== undefined && loop.status === 'active'
  }

  return { reserve, activate, recordProviderUsage, settleWon, settleLost, recordMergeIntent, recordMergeLanded, isActive }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// H10 §3/§8任务5：prepareSkillBundle 编排——claim 成功（queued→scheduled）之后、activate
// （reservation-activated）之前调用（设计定稿精确顺序）。实现「解析 effective slots → 按声明顺序
// 定位内容 → 物化 CAS 快照 → governance→ledger 锁序复核 → 追加 skill-bundle-snapshot 事件」全部
// 步骤（设计 §3 步骤2-7）；「资源根目录」「workflow 坐标获取」等物理装配细节经 deps 注入，本函数
// 不硬编码任何具体 skill 根目录或 workflow 持久化形状（那是 H10 任务7 CLI 生产装配的职责）。
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * `createExecutionPreparation` 的依赖面。刻意不直接注入 `WorkflowRunRepository`（那会让本模块
 * 理解 change 目录/workflow run 持久化形状，越界进 admission 从未涉足的领域）——只注入更高层的
 * `ExecutionCoordinatePort`，由生产装配（任务7）绑定真实 repository/workflow loader；本函数只消费
 * 其产出的 `CapturedExecutionCoordinate`。
 */
export interface ExecutionPreparationDeps {
  readonly repoRoot: string
  readonly ledger: LoopLedgerStore
  /** 契约同 `LoopAdmissionDeps.loadRegistry`（真实 I/O 故障 throw，ENOENT/解析失败→data:null）。 */
  readonly loadRegistry: (repoRoot: string) => { data: LoopRegistry | null; errors: string[] }
  readonly clock: () => string
  /** 唯一 id 生成器（缺省 makeIdGen()；测试可注入确定性序列）。 */
  readonly newId?: (prefix: string) => string
  /** workflow 坐标捕获口（设计 §3 步骤2/步骤7；生产实现见任务7）。 */
  readonly coordinates: ExecutionCoordinatePort
  /** G2 有效 skill 解析器（喂给 kernel `resolveSkillBundle`；生产装配注入真实 manifest/registry 绑定）。 */
  readonly resolver: EffectiveSkillResolver
  /** skill id → 当前内容目录的物理定位口（生产装配决定具体走哪些根、按什么顺序）。 */
  readonly locator: SkillContentLocator
  /** runner-aware 定位口；给定时每次 prepare 按 ctx.runner 选择，Codex 不得读取 Claude roots。 */
  readonly locatorForRunner?: (runner: string) => SkillContentLocator
  /**
   * CAS 物化原语（缺省真 `materializeSkillSnapshot`）。可选注入点只为测试——需要确定性模拟「复制期间
   * 源内容变化」时，测试可传入包一层 `onAfterBeforeDigest` 钩子的同签名函数；生产装配从不覆盖。
   */
  readonly materialize?: (inputs: readonly SkillSnapshotInput[], options: MaterializeSkillSnapshotOptions) => Promise<SkillSnapshotPublishResult>
}

/**
 * task4 的 locate()/materializeSkillSnapshot() 错误 `_tag` → H10 §5 `PreparationFailureReason`
 * 归类（不 import 具体错误类，只读 `_tag` 字符串——两个模块各自头注已写明对应哪个 reason，本函数
 * 只是把那份映射落成代码）。`undefined` = 未识别的错误类型，调用方须 fail-loud 重新抛出，不得
 * 伪装成某个业务 reason。
 */
function skillErrorReason(e: unknown): PreparationFailureReason | undefined {
  const tag = (e as { _tag?: string } | null | undefined)?._tag
  switch (tag) {
    case 'SkillContentInvalidError': return 'skill-bundle-content-invalid'
    case 'SkillContentAccessError': return 'skill-bundle-content-invalid'
    case 'SkillContentSourceAmbiguousError': return 'skill-bundle-source-ambiguous'
    case 'SkillSnapshotSourceUnstableError': return 'skill-bundle-source-unstable'
    case 'SkillSnapshotIoError': return 'skill-bundle-snapshot-io'
    case 'SkillSnapshotCorruptError': return 'skill-bundle-snapshot-corrupt'
    default: return undefined
  }
}

type LocateOutcome =
  | { readonly ok: true; readonly concreteSkillId: string; readonly contentDir: string }
  | { readonly ok: false; readonly reason: PreparationFailureReason; readonly detail: string }

/**
 * 设计定稿 §2/§3 步骤3：`a|b` alternative slot 按声明顺序选第一个可严格物化的 concrete skill——
 * 候选缺失（`SkillContentNotFoundError`）可尝试下一个；候选存在但内容损坏或来源冲突，立即失败，
 * 不能悄悄降级到下一个候选（那会把一个真实存在但损坏的 skill 悄悄换成另一个，掩盖真实故障）。
 * 全部候选都缺失 → `skill-bundle-skill-not-found`。
 */
async function selectFirstLocatable(locator: SkillContentLocator, alternatives: readonly string[]): Promise<LocateOutcome> {
  const notFoundDetails: string[] = []
  for (const candidateId of alternatives) {
    try {
      const located = await locator.locate(candidateId)
      return { ok: true, concreteSkillId: located.skillId, contentDir: located.contentDir }
    } catch (e) {
      const tag = (e as { _tag?: string } | null | undefined)?._tag
      if (tag === 'SkillContentNotFoundError') { notFoundDetails.push(errText(e)); continue }
      const reason = skillErrorReason(e)
      if (reason === undefined) throw e // 未识别错误类型：fail-loud，不伪装成某个 reason
      return { ok: false, reason, detail: errText(e) }
    }
  }
  return {
    ok: false, reason: 'skill-bundle-skill-not-found',
    detail: `全部候选 alternatives（${alternatives.join('|')}）均未定位到内容：${notFoundDetails.join('; ')}`,
  }
}

/** CAS 目录相对 repoRoot 的路径（设计 §3 步骤6：`.pipeline/loops/skill-snapshots/sha256/<digest>/`）。 */
function skillSnapshotCasRelativePath(digest: string): string {
  return `.pipeline/loops/skill-snapshots/sha256/${digest}`
}

export function createExecutionPreparation(deps: ExecutionPreparationDeps): ExecutionPreparationPort {
  const { repoRoot, ledger, loadRegistry, clock, coordinates, resolver, locator } = deps
  const newId = deps.newId ?? makeIdGen()
  const materialize = deps.materialize ?? materializeSkillSnapshot

  const prepare = async (ctx: ExecutionContext): Promise<PrepareOutcome> => {
    // 二次任务（queued 卡死回归修复）+ H10 r1 阻断3/D5 返工（任务B1）：ctx.skill_bundle_id 缺席/
    // null＝「本次执行无 bundle 绑定」（非 loop 的 AFK 直跑，见 execution-context.ts 头注）——直通
    // 产出判别联合的 NonLoopExecutionContext 分支（markNonLoopPrepared，不是「省略了 skillBundle
    // 字段」的同一形状），不捕获 workflow 坐标、不解析、不物化 CAS、不写 ledger 事件、绝不 pause。
    // 真正的 loop-bundle 绑定（skill_bundle_id 有值）才走下面的完整解析/物化/复核编排，产出
    // LoopPreparedExecutionContext（markLoopPrepared，skillBundle 必填）。
    if (ctx.skill_bundle_id === null || ctx.skill_bundle_id === undefined) {
      return { ok: true, context: markNonLoopPrepared(ctx) }
    }
    // 窄化后固定成 const（narrowing 在下方跨异步闭包引用时不持续对非 const 绑定生效——见
    // ledger.append 调用点内的 `skill_bundle_id: skillBundleId`），供全函数余下部分复用同一个
    // 已确定非空的 profile 字符串。
    const skillBundleId: string = ctx.skill_bundle_id
    const effectiveLocator = deps.locatorForRunner?.(ctx.runner) ?? locator
    // 设计 §3 步骤2：change lock 下捕获并固定 workflow 坐标，capture() 内部自行释放 change lock——
    // 本函数往后（解析/定位/物化）全程无锁（设计 §3：「无锁解析 effective slots」）。
    //
    // H10 r1 阻断6（任务B1）：capture() 此前在结构化异常捕获之外——workflow parse/compile/step 失败
    // 会穿透 prepare() 整体外抛，被 scheduler.ts::handlePreparationThrow 当成未分类基础设施异常
    // 处置，不落 skill-bundle-resolve-failed 语义。此刻尚未拿到 coordinate，无法判定 default/
    // custom，workflowKind 诚实留空——preparationPolicyFor 对 undefined workflowKind 的缺省是「视同
    // default，暂停 loop」（scheduler.ts 头注「resolve-failed（default/未指明 workflowKind）→
    // 暂停 loop」），保守正确：宁可牵连同 profile 下其余 loop 暂停，也不能放行一个坐标都没解析出来
    // 的执行。
    let coordinate: CapturedExecutionCoordinate
    try {
      coordinate = await coordinates.capture(ctx)
    } catch (e) {
      return { ok: false, reason: 'skill-bundle-resolve-failed', detail: errText(e) }
    }
    const resolutionInput: SkillBundleResolutionInput = coordinate.resolution.kind === 'default'
      ? { kind: 'default', stepId: coordinate.resolution.stepId, profileId: skillBundleId }
      : { kind: 'custom', step: coordinate.resolution.step, profileId: skillBundleId }
    // H10 r1 阻断6（任务B1）：resolver 调用（resolveDefault/resolveCustom，可能触及 manifest/
    // step.skills 解析失败）同样此前在结构化捕获之外。此刻 coordinate 已知，workflowKind 精确传
    // coordinate.resolution.kind（default/custom 处置分叉，见设计 §5）。
    let resolved: ReturnType<typeof resolveSkillBundle>
    try {
      resolved = resolveSkillBundle(resolver, resolutionInput)
    } catch (e) {
      return { ok: false, reason: 'skill-bundle-resolve-failed', detail: errText(e), workflowKind: coordinate.resolution.kind }
    }
    const { source, slots } = resolved
    // H10 r1 阻断2/4·D4（任务B1）：本次解析所在 step id——default 轨即 phase 字段值，custom 轨为
    // StepIR.id；下方 provenance/ledger 事件复用同一个值（不各自重复派生）。
    const step = coordinate.resolution.kind === 'default' ? coordinate.resolution.stepId : coordinate.resolution.step.id
    // 镜像 scheduler.ts::expectedSubjectFor 既有的 `ctx.workflow_run_id ?? ctx.attempt_id` 兜底
    // 惯例（ExecutionContext.workflow_run_id 对非 WorkflowRun 归属的旧路径可选缺席，attempt_id
    // 恒存在，可安全顶替）。
    const workflowRunId = coordinate.workflowRunId ?? ctx.workflow_run_id ?? ctx.attempt_id

    // 设计 §2：所有 effective slots 都进入快照——不因标为 recommended 就在缺失时忽略；合法空
    // slots（profile 合法但本 step 解析结果为空）产出确定性空快照，不视为未接线（本函数不做这个
    // 判断，只是 slots=[] 时下面的循环天然不执行，selected 天然是 []）。
    const selected: { token: string; concreteSkillId: string; contentDir: string; alternatives: readonly string[] }[] = []
    for (const slot of slots) {
      const picked = await selectFirstLocatable(effectiveLocator, slot.alternatives)
      if (!picked.ok) return { ok: false, reason: picked.reason, detail: picked.detail, workflowKind: coordinate.resolution.kind }
      selected.push({
        token: slot.token, concreteSkillId: picked.concreteSkillId, contentDir: picked.contentDir,
        alternatives: slot.alternatives,
      })
    }

    // H10 r1 阻断2/4·D4（任务B1）：provenance 的 slots[].tree_sha256 必须在调用 materialize() 之前
    // 就确定——CAS 聚合 digest 覆盖完整 provenance（含 tree_sha256，见
    // snapshot-store.ts::computePublishDigest 头注「digest 必须完整覆盖 provenance」），但
    // tree_sha256 恰恰是 materialize() 内部才计算的产物。这里用同一个只读原语
    // buildCanonicalManifest 对每个已定位的 skill 内容根预先算一遍（与 materialize() 内部「双遍
    // source digest」稳定性检查的首遍是同一算法/同一读取动作），取得的值随 provenance 一起传给
    // materialize()；随后（见下方）用 materialize() 真正物化后得到的 publish.manifests[i].
    // treeSha256 复核与预读值一致——不一致视为「provenance 预读之后、物化开始之前」这段额外窗口的
    // 源内容漂移，归 skill-bundle-source-unstable（复用既有 reason，不新增字面量）：不能让一份
    // 「预读时算出、但物化实际使用的却是不同内容」的 tree_sha256 悄悄写进 CAS digest 覆盖的
    // provenance——那会让 CAS 描述符关于"这份快照对应哪份 provenance"的绑定本身失真。
    //
    // buildCanonicalManifest 与 materialize() 内部同源，会做同一套内容合法性判定（目录逃逸
    // symlink/设备文件/SKILL.md 缺失等）——预读阶段就可能先于 materialize() 撞上这些错误，必须走
    // 同一份 skillErrorReason 映射，不能让它未经归类直接穿透 prepare() 外抛（selectFirstLocatable
    // 已对同类错误做过归类，这里的预读调用不能是漏网的例外）。
    const uniqueSelected = [...new Map(selected.map((s) => [s.concreteSkillId, s])).values()]
    let preManifests: Awaited<ReturnType<typeof buildCanonicalManifest>>[]
    try {
      preManifests = await Promise.all(uniqueSelected.map((s) => buildCanonicalManifest(s.concreteSkillId, s.contentDir)))
    } catch (e) {
      const reason = skillErrorReason(e)
      if (reason === undefined) throw e
      return { ok: false, reason, detail: errText(e), workflowKind: coordinate.resolution.kind }
    }

    // H10 r1 阻断2/4·D4（任务B1）：三处（CAS canonical descriptor / ledger SkillBundleSnapshotRecord
    // / PreparedExecutionContext.skillBundle）必须一致的 provenance 统一对象——一次构造、三处消费，
    // 不给三份拼写各自漂移的机会（字段规范见 skills/types.ts::SkillSnapshotProvenance 头注）。
    const preById = new Map(preManifests.map((m) => [m.skillId, m]))
    const provenance: SkillSnapshotProvenance = {
      loop_id: ctx.loop_id, policy_epoch: ctx.policy_epoch, skill_bundle_id: skillBundleId,
      attempt_id: ctx.attempt_id, reservation_id: ctx.reservation_id, workflow_run_id: workflowRunId,
      workflow: coordinate.workflow, step, track: coordinate.track, coordinate_digest: coordinate.inputsDigest,
      resolution_source: source,
      slots: selected.map((s) => ({
        alternatives: s.alternatives, concrete_skill_id: s.concreteSkillId, tree_sha256: preById.get(s.concreteSkillId)!.treeSha256,
      })),
    }

    let publish: SkillSnapshotPublishResult
    try {
      publish = await materialize(
        uniqueSelected.map((s): SkillSnapshotInput => ({ skillId: s.concreteSkillId, contentDir: s.contentDir })),
        { projectRoot: repoRoot, provenance },
      )
    } catch (e) {
      const reason = skillErrorReason(e)
      if (reason === undefined) throw e
      return { ok: false, reason, detail: errText(e), workflowKind: coordinate.resolution.kind }
    }

    // 预读 treeSha256（provenance 已携带、已纳入 CAS digest 覆盖）与 materialize() 真正物化后的值
    // 必须一致，否则本次快照的 provenance 记录已经与实际发布的内容不符（见上方大段头注）。
    const publishedById = new Map(publish.manifests.map((m) => [m.skillId, m]))
    for (let i = 0; i < selected.length; i++) {
      const actual = publishedById.get(selected[i]!.concreteSkillId)!
      if (actual.treeSha256 !== provenance.slots[i]!.tree_sha256) {
        return {
          ok: false, reason: 'skill-bundle-source-unstable',
          detail: `skill '${selected[i]!.concreteSkillId}' 的 provenance 预读 treeSha256（${provenance.slots[i]!.tree_sha256}）` +
            `与物化后实际值（${actual.treeSha256}）不一致——预读与物化之间源内容发生了变化`,
          workflowKind: coordinate.resolution.kind,
        }
      }
    }

    const casRelativePath = skillSnapshotCasRelativePath(publish.digest)
    const preparedSlots: PreparedSkillSlot[] = selected.map((s, i) => ({
      token: s.token, alternatives: s.alternatives, concreteSkillId: s.concreteSkillId,
      treeSha256: publishedById.get(s.concreteSkillId)!.treeSha256,
    }))

    // 设计 §3 步骤7：governance→ledger 固定锁序（铁律，见 governance.ts 头注）下重新严格读取
    // registry，要求 policy_epoch、loop 状态和 skill_bundle_id 未变，同时重新核对 workflow 输入
    // digest；通过后追加 skill-bundle-snapshot 事件。任一不符 → skill-bundle-policy-changed
    // （TOCTOU，retry-queued，不收费，不暂停 loop，重新走整个 admission——不是本函数内部重试）。
    // ledger I/O 故障（append/fsync/lock）在此 throw，不吞成某个业务 reason（镜像 activate() 对
    // ledger I/O 的既有处置：调用方 fail-loud）。
    return withRegistryGovernanceLock(repoRoot, () => ledger.withLedgerLock(repoRoot, async (): Promise<PrepareOutcome> => {
      const reg = loadRegistry(repoRoot)
      const loop = reg.data?.loops.find((l) => l.id === ctx.loop_id)
      const registryStable = reg.data !== null && loop !== undefined && loop.status === 'active'
        && (loop.skill_bundle_id ?? null) === skillBundleId && registryContentEpoch(reg.data) === ctx.policy_epoch
      if (!registryStable) {
        return {
          ok: false, reason: 'skill-bundle-policy-changed',
          detail: `loop「${ctx.loop_id}」的 governance epoch/status/skill_bundle_id 在准备期间已变化（TOCTOU）——需重新 admission`,
          workflowKind: coordinate.resolution.kind,
        }
      }
      let currentInputsDigest: string
      try {
        currentInputsDigest = await coordinates.readCurrentInputsDigest(ctx)
      } catch (e) {
        return {
          ok: false, reason: 'skill-bundle-resolve-failed',
          detail: `change「${ctx.change}」的 workflow/manifest 输入复核失败：${e instanceof Error ? e.message : String(e)}`,
          workflowKind: coordinate.resolution.kind,
        }
      }
      if (currentInputsDigest !== coordinate.inputsDigest) {
        return {
          ok: false, reason: 'skill-bundle-policy-changed',
          detail: `change「${ctx.change}」的 workflow/manifest 输入在准备期间已变化（TOCTOU）——需重新 admission`,
          workflowKind: coordinate.resolution.kind,
        }
      }
      // H10 r1 阻断2/4·D4（任务B1）：全部字段直接取自上方已构造的 provenance（与 CAS descriptor
      // 传给 materialize() 的是同一个对象）——不重复派生，杜绝三处拼写漂移。ledger 的 slots 比
      // provenance.slots 多一个 token（= alternatives 原始声明记法，provenance 本身不携带，见
      // skills/types.ts::SkillSnapshotProvenanceSlot 头注「原始 token 文本可由 alternatives.
      // join('|') 还原」）；workflow_run_id 显式用上方已算好的 workflowRunId（非
      // provenance.workflow_run_id——该字段类型可选，直接透传在个别 TS 配置下不必然被判定为
      // "确定存在"，此处用保证非 undefined 的本地值，语义上是同一个值）。
      await ledger.append(repoRoot, {
        schema_version: 1, record_id: newId('rec'), recorded_at: clock(),
        kind: 'skill-bundle-snapshot',
        attempt_id: provenance.attempt_id, reservation_id: provenance.reservation_id, loop_id: provenance.loop_id,
        skill_bundle_id: provenance.skill_bundle_id, policy_epoch: provenance.policy_epoch,
        resolution_source: provenance.resolution_source, workflow_run_id: workflowRunId,
        workflow: provenance.workflow, step: provenance.step, track: provenance.track,
        coordinate_digest: provenance.coordinate_digest,
        snapshot_sha256: publish.digest, cas_relative_path: casRelativePath,
        slots: provenance.slots.map((s, i) => ({
          token: selected[i]!.token, alternatives: [...s.alternatives], concrete_skill_id: s.concrete_skill_id, tree_sha256: s.tree_sha256,
        })),
      })
      const prepared = markLoopPrepared({ ...ctx, workflow_run_id: workflowRunId }, {
        snapshotSha256: publish.digest, casRelativePath, resolutionSource: source, slots: preparedSlots,
        workflow: coordinate.workflow, step, track: coordinate.track, coordinateDigest: coordinate.inputsDigest,
        ...(coordinate.resolution.kind === 'custom' && coordinate.resolution.step.prompt !== undefined
          ? { stepPrompt: coordinate.resolution.step.prompt }
          : {}),
      })
      return { ok: true, context: prepared }
    }))
  }

  return { prepare }
}
