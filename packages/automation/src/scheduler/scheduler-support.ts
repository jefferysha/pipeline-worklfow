/**
 * 调度核心 —— 移植老仓 scheduler/scheduler.ts:1-374 的纯编排（over 注入 ports），GOAL H · Stage C
 * 起接上 loop admission 权威闸门。
 *
 * 一轮 = 处理一个候选列表，有界并发。handleOne 顺序（codex 第 3 节权威点，claim 之前先原子 preflight）：
 *   semaphore.acquire → admission.reserve()（仓级锁内重读 registry+ledger）→ claim queued→scheduled
 *   → reservation.activate() → status recheck → running → runChange(context) → pre-merge/terminal
 *   recheck → terminal CAS → append UsageRecord* + terminal RunRecord（commit marker，关闭 reservation）。
 * 先拿 semaphore 再 reserve：避免候选在等全局槽位时提前占用 loop reservation。
 *
 * kill-switch 四重查（第 3 节）：①reserve 内 status!==active 硬拒 ②claim 后 running 前重查
 * ③L3 merge 前重查（lifecycle.ts checkActive 接缝，停用则不 merge、killSwitched）④terminal settle
 * 前重查（防成功态被写成 merged）。
 *
 * H9 边界（第 4 节）：automation settle **不**塞进 WorkflowRunRepository.transact（不产伪 transition、
 * 不碰 G1/G2 并行区）。结算顺序：setAutomationOwnedWithFields 原子 CAS 得真实 terminal + subordinate
 * fields → 锁内 append RunRecord（commit marker）。ledger 写失败 → 记进 RoundReport.ledgerFailures，
 * CLI 据此返非零，绝不再打印「跑完一轮」；现有 Promise.allSettled 不再吞 ledger failure 让 CLI 报成功。
 *
 * 不变量（逐条对齐老仓）：② semaphore 限并发；③ 失败 classifyFailure → retry|conflict；
 * ④ inFlight Set + shutdown teardown 同步标 failed；⑤ 终态经 setAutomationOwned 双 cas；
 * ⑥ allSettled 收口——一个 reject 不连累其余写回。
 *
 * H7 verifier Phase 2（settlement verification gate，D3 消费点裁决）：writeBackSuccess 在选择
 * merged/paused/retry **之前**，先经 evaluateVerificationGate 判定 outcome.verification——trusted
 * passed 且 subject SHA 与本次 buildSha 相符才 authorized（继续按既有 killSwitched/noop/level 逻辑
 * 决定 merged/paused）；trusted failed → 并入既有 verify-fail 失败路（applyFailure）；
 * absent/untrusted/inconclusive/SHA 漂移 → fail-closed 强 paused + 诚实 reason（RunRecord.reason 的
 * verification-* 扩，见 kernel ledger-types.ts）。判定纯函数在 verifier.ts，本模块只消费、不重新
 * 定义判定表；settlementFor 只把已判定的 reason/verification 持久化，不在 ledger 锁里跑 verifier。
 *
 * H7-S2（r2 阻断1-4 收口，automation 半边）：evaluateVerificationGate 的入参扩了 expectedSubject
 * （workflow_run_id/attempt_id/change）与 requireWorkflowBinding——writeBackSuccess/settlementFor
 * 两个消费点都必须传，经 verificationGateFor 从各自持有的 ExecutionContext 派生（workflow_run_id
 * 以 `?? attempt_id` 兜底，镜像 lifecycle.ts 对同一 ExecutionContext 形状的兜底规则）+
 * outcome.requireWorkflowBinding（lifecycle 按 cfg.workflowKind 判定后透传）。两处消费点共用同一个
 * verificationGateFor 辅助函数构造 gate 输入，结构上不可能各写一份漂移。
 */
import { isSettled, type FailureCommitInput, type FailureCommitResult } from '../queue/claim.js'
import { settleSuccess } from '../queue/state-machine.js'
import { type AutomationConfig, type AutomationState, type RunOutcome } from '../types.js'
import type {
  ExecutionContext, ExecutionPreparationPort, PrepareOutcome, PreparationFailureReason, PreparedExecutionContext,
} from '../admission/execution-context.js'
import { consumeIssuedPreparedContext } from '../admission/execution-context.js'
import type { ActivateResult, AdmissionDenial, ReserveResult, RunSettlement } from '../admission/loop-admission.js'
import { classifyFailure } from './classify.js'
import { createSemaphore } from './semaphore.js'
import { evaluateVerificationGate, isBoundaryVerifiedResult, type VerificationGateResult } from '../verifier/verifier.js'
import { validateVerificationResult } from '@tenon/kernel'
import { certifyLifecycleOutcome, isCertifiedLifecycleOutcome } from '../lifecycle/outcome.js'

/** ledger store 抛出的 typed 错误 _tag 集（Stage B 返工 #2：据此归 kind=ledger-io，绝不被 allSettled 吞成 ok=true）。 */
const LEDGER_ERROR_TAGS = new Set([
  'LedgerDegradedError', 'UnknownReservationError', 'ReservationCorruptionError',
  'ReservationMismatchError', 'ReservationAppendError',
])
/** registry 读 typed 错误 _tag（Stage B 返工 #2：admission reserve 的 loops.yaml 真实 I/O 故障 → kind=registry-io，
 *  绝不被吞成「无 registry」denial 让 round 假 ok=true）。 */
const REGISTRY_ERROR_TAGS = new Set(['RegistryReadError'])
/** H10 §1/§5：「必要协作方未装配」类错误的 _tag 集——语义上不是 ledger/registry/state I/O 故障，
 *  是当前调用方缺少必需校验器/端口，归 kind=config，与真实 I/O 故障区分
 *  开（诊断读出来才不会误导成「磁盘/网络坏了」）。其中包括 loop-admission 的 profile validator、
 *  SDK 的 bundle preparation，以及本模块在真实 loop context 上缺 execution-wiring validator 的错误。 */
const CONFIG_ERROR_TAGS = new Set([
  'SkillProfileValidatorUnconfiguredError',
  'SkillBundlePreparationUnconfiguredError',
  'ExecutionWiringValidatorUnconfiguredError',
  'PathPolicyResolverUnconfiguredError',
  'PathPolicyUnconfiguredError',
])

const safeFailureProperty = (error: unknown, key: string): unknown => {
  if (typeof error !== 'object' || error === null) return undefined
  try {
    return (error as Record<string, unknown>)[key]
  } catch {
    return undefined
  }
}

/**
 * G² 子问题1：base 被第三方推进（lifecycle BaseAdvancedError 携 baseAdvanced=true）——这不是普通 per-change
 * 冲突，是并发异常。除了照 classify 落 conflict 留现场外，另记一条 round failure 使 ok=false（fail-loud：
 * CLI 非零、不打印跑完一轮）。普通 content-conflict SyncError（无此标记）仍是正常 settle、round 保持 ok。 */
export const isBaseAdvancedFailure = (err: unknown): boolean => safeFailureProperty(err, 'baseAdvanced') === true

/** 写回 port（由 fs StateStore 适配，见 sdk.ts::storeWriter）。全部经 kernel 锁串行。 */
export interface StateWriter {
  claim(name: string): Promise<boolean>
  setAutomation(name: string, state: AutomationState): Promise<void>
  setField(name: string, field: string, value: string): Promise<void>
  getAutomation(name: string): Promise<string>
  setAutomationOwned(name: string, next: AutomationState): Promise<boolean>
  setAutomationOwnedWithFields(name: string, next: AutomationState, fields: Readonly<Record<string, string>>): Promise<boolean>
  commitFailureOwned(name: string, input: FailureCommitInput): Promise<FailureCommitResult>
  markFailedSync(name: string, reason: string): void
}

/**
 * loop admission 权威闸门 port（结构面；生产实现 = automation/admission/loop-admission.ts
 * createLoopAdmission）。scheduler 只依赖此结构，测试注入极小 fake。
 */
export interface AdmissionPort {
  reserve(change: string, opts?: {
    readonly expectedLoopId?: string
    readonly expectedAutonomyLevel?: AutomationConfig['level'] | null
  }): Promise<ReserveResult>
  activate(ctx: ExecutionContext): Promise<ActivateResult>
  settleWon(ctx: ExecutionContext, settlement: RunSettlement): Promise<void>
  settleLost(ctx: ExecutionContext): Promise<void>
  isActive(loopId: string): Promise<boolean>
}

/**
 * 一轮内一个候选的结构化故障（Stage B 返工 #2）——区分「治理常态拒绝」（denial，不进此表、不改 ok）
 * 与「基础设施故障」（ledger/registry/state I/O throw、执行异常、意外）。allSettled 逐项检查 + handleOne
 * 顶层 catch 双层防线：任何异常都归此表，绝不再被吞成 ok=true。
 */
export interface RoundFailure {
  readonly change: string
  /** H10 §3/§8任务5：新增 'preparation'（claim 之后、activate 之前的 prepareSkillBundle 阶段）。 */
  readonly phase: 'admission' | 'claim' | 'preparation' | 'activation' | 'state-transition' | 'execution' | 'settlement' | 'internal'
  /** H10 §1/§5：新增 'config'（必要协作方/校验器尚未生产装配，见 CONFIG_ERROR_TAGS 头注）。 */
  readonly kind: 'ledger-io' | 'registry-io' | 'state-io' | 'execution' | 'config' | 'unexpected'
  readonly message: string
}

/** activation append 失败后的补偿结果（Stage B 返工 #6）：绝不空吞，全进 RoundReport。 */
export type ActivationCompensation =
  | { readonly status: 'reset-queued' }
  | { readonly status: 'ownership-lost'; readonly observedState?: string }
  | { readonly status: 'failed'; readonly error: string }

/** handleOne 结构化结果（Stage B 返工 #2）：ok 不再靠共享数组表达——rejected/!ok 均由收口逐项归 failures。 */
export type HandleResult =
  | { readonly ok: true; readonly change: string }
  | { readonly ok: false; readonly change: string; readonly failure: RoundFailure }

/**
 * 跑一个 change 端到端（runner + lifecycle）。签名改为吃 ExecutionContext（第 2 节）：runner/
 * denylist/结算都按 context.loop_id 查 loop，不再各自按前缀猜。
 *
 * H10 §3/§8任务5：签名改为只收 `PreparedExecutionContext`（`ExecutionContext` 的子类型）——编译期
 * 钉死 reserve→claim→prepareSkillBundle→activate→runChange 的顺序，任何未来 runner 接线
 * （H14）都不可能拿着裸 admitted context 直接跑，必须先经 prepareSkillBundle。既有实现（如
 * dockerRunChange.ts 的 `async (context: ExecutionContext, signal) => …`）参数类型更宽，按 TS
 * 函数参数逆变规则仍可赋给本类型（宽参数函数可以顶替窄参数函数类型），不构成回归。
 */
export type RunChange = (context: PreparedExecutionContext, signal: AbortSignal) => Promise<RunOutcome>

/** 注册同步 shutdown teardown；返回反注册 fn。 */
export type RegisterShutdown = (teardown: () => void) => () => void

/** 旁路 kanban observer（fire-and-forget，绝不 throw 出去）。 */
export interface AfkObserver {
  onState(name: string, state: AutomationState, extra?: Record<string, string>): void
}

export type SchedulerConfig = Pick<AutomationConfig, 'maxParallel' | 'maxRetries' | 'level'>

export type ExecutionWiringValidationResult =
  | { readonly ok: true }
  | {
      readonly ok: false
      readonly status: 'unwired' | 'invalid'
      readonly dimension: 'runner' | 'template' | 'workflow' | 'skill-bundle'
      readonly reason: string
      /** validator 已用同一 invalid 结论完成竞态安全 governance pause；scheduler 不得重放旧暂停。 */
      readonly governancePaused?: boolean
    }

/**
 * admission 是可注入边界，context 自报的 bundle/runner/loop 字段不能证明它属于可信 non-loop 路径。
 * 因此没有显式 execution wiring validator 时一律在 claim 前 fail-closed；需要运行 non-loop context
 * 的装配方也必须显式提供 validator，不能靠 `skill_bundle_id == null` 这种可伪造字段取得默认放行。
 */
export class ExecutionWiringValidatorUnconfiguredError extends Error {
  override readonly name = 'ExecutionWiringValidatorUnconfiguredError'
  readonly _tag = 'ExecutionWiringValidatorUnconfiguredError'
  constructor(readonly loopId: string) {
    super(`context 声明 loop「${loopId}」，但 execution wiring validator 未装配；无法证明其为可信 loop 或 non-loop 执行`)
  }
}

export interface SchedulerDeps {
  readonly state: StateWriter
  readonly runChange: RunChange
  readonly registerShutdown: RegisterShutdown
  readonly config: SchedulerConfig
  readonly admission: AdmissionPort
  readonly observer?: AfkObserver
  /** on_exceed=pause-loop 时把 loop status 改 paused（缺省无 → 降级为 skip-run + 记 report）。 */
  readonly pauseLoop?: (loopId: string) => Promise<void>
  /**
   * H11：reservation 取得真实 loop identity 后、claim 之前的 fresh execution wiring 闸。
   * CLI 生产装配使用共享 evaluator；失败会扣 0 关闭 reservation、排队 governance pause、整轮非零。
   * 类型上可选以保留构造 API；运行时缺席时默认 validator 对所有 context 抛
   * `ExecutionWiringValidatorUnconfiguredError`。可信 non-loop 装配也必须显式提供 validator。
   */
  readonly validateExecutionWiring?: (
    context: ExecutionContext,
  ) => Promise<ExecutionWiringValidationResult>
  /**
   * H10 §3/§8任务5：prepareSkillBundle 编排口（claim 成功之后、activate 之前调用；生产实现见
   * loop-admission.ts::createExecutionPreparation，createAutomation 已支持显式注入并透传）。
   *
   * 类型上可选以兼容直接 createScheduler 的构造面；createAutomation 总会提供显式 preparation 或
   * 安全缺省。直接构造却缺席时，`runRoundOnce` 在处理候选前短路成 config failure（零
   * admission/claim/runChange），绝不把裸 ExecutionContext 冒充 PreparedExecutionContext。
   */
  readonly preparation?: ExecutionPreparationPort
}

/** 一个候选的处置（RoundReport 明细）。 */
export interface RoundOutcomeEntry {
  readonly change: string
  readonly loopId?: string
  /** H10 §3/§8任务5：新增 'preparation-failed'（prepareSkillBundle 结构化失败，镜像
   *  'activation-failed' 对「claim 已成功、后续阶段未能推进到 running」的既有命名惯例）。
   *  H7 r6：'recovery-pending' 表示不可逆 merge 已落地、但 automation state 尚未提交；此时
   *  reservation/merge facts 保持 open，不能谎报 settled，必须交下一轮 durable recovery 收口。 */
  readonly disposition: 'settled' | 'denied' | 'claim-lost' | 'activation-failed' | 'preparation-failed' | 'recovery-pending'
  readonly result?: string
  readonly reason?: string
}

/**
 * 一轮结构化报告（第 4 节）：CLI 据 ledgerFailures/degraded 返非零，不再靠 allSettled 吞错后打印
 * 「跑完一轮」。denial（超预算/暂停/歧义）是治理常态、不算 round 失败（ok 不受其影响），但坏账本
 * （ledger-degraded）与 settle 时的 ledger 写失败使 ok=false。
 */
export interface RoundReport {
  readonly candidates: number
  readonly admitted: number
  readonly entries: RoundOutcomeEntry[]
  /** Stage B 返工 #2：结构化故障表（phase/kind/message）——CLI 据此打印诊断并返非零。 */
  readonly failures: RoundFailure[]
  /** 兼容既有调用/测试（settle/activation 的 ledger 写失败短期同时填充；后续废弃）。 */
  readonly ledgerFailures: { change: string; message: string }[]
  readonly halted: boolean
  readonly ledgerDegraded: boolean
  readonly ok: boolean
}

/** Internal mutable accumulator projected into an immutable RoundReport at the boundary. */
export interface MutableReport {
  candidates: number
  admitted: number
  entries: RoundOutcomeEntry[]
  failures: RoundFailure[]
  ledgerFailures: { change: string; message: string }[]
  halted: boolean
  ledgerDegraded: boolean
  pausePending: string[]
}

/**
 * yaml_set 四闸清洗的唯一实现（不许分叉）。截断纪律：**不截断**（真机 P1，见文件历史）——
 * automation_worktree/automation_preserved_path 是 server cancelAfkRun / 现场恢复按原样使用的真路径。
 */
export const sanitizePath = (s: string): string =>
  s
    .replace(/[\r\n]+/g, ' ')
    .replace(/:\s/g, '; ')
    .replace(/\s#/g, ' ')
    .replace(/^["']+/, '')
    .trim() || 'error'

/** 错误 message 专用：同一份四闸清洗 + 压到 200 字符（automation_last_error 类字段用）。 */
export const sanitize = (s: string): string => sanitizePath(s).slice(0, 200).trim() || 'error'

export const errText = (error: unknown): string => {
  const message = safeFailureProperty(error, 'message')
  if (typeof message === 'string') return message
  try {
    return String(error)
  } catch {
    return 'unreadable error value'
  }
}

/**
 * 归类一次候选处理中抛出的异常（Stage B 返工 #2）：ledger store 的 typed error（据 _tag）→ ledger-io；
 * 否则按抛出所在 phase 推断 kind（admission/activation/settlement 的异常几乎必来自 ledger read/append/
 * fsync/lock；claim/state-transition → state-io；execution → execution；其余 → unexpected）。
 */
export const classifyRoundFailure = (change: string, phase: RoundFailure['phase'], error: unknown): RoundFailure => {
  const rawTag = safeFailureProperty(error, '_tag')
  const tag = typeof rawTag === 'string' ? rawTag : undefined
  let kind: RoundFailure['kind']
  if (tag !== undefined && REGISTRY_ERROR_TAGS.has(tag)) {
    kind = 'registry-io' // loops.yaml I/O 故障（EACCES/EIO/EISDIR…）——不当 ledger-io 也不当 denial
  } else if (tag !== undefined && LEDGER_ERROR_TAGS.has(tag)) {
    kind = 'ledger-io'
  } else if (tag !== undefined && CONFIG_ERROR_TAGS.has(tag)) {
    kind = 'config' // H10 §1：必要协作方/校验器未装配（如 SkillProfileValidatorUnconfiguredError）
  } else {
    switch (phase) {
      case 'admission':
      case 'preparation':
      case 'activation':
      case 'settlement':
        kind = 'ledger-io'; break
      case 'claim':
      case 'state-transition':
        kind = 'state-io'; break
      case 'execution':
        kind = 'execution'; break
      default:
        kind = 'unexpected'
    }
  }
  return { change, phase, kind, message: sanitize(errText(error)) }
}

/** 已 settle 的终态；"skipped" = 写回发现 change 已被他人 settle，啥都没动。 */
export type Terminal = AutomationState | 'skipped'

const EXPLICIT_TERMINALS = new Set<AutomationState>(['off', 'merged', 'failed', 'conflict', 'paused'])

export const explicitTerminal = (automation: string): AutomationState | undefined =>
  EXPLICIT_TERMINALS.has(automation as AutomationState) ? automation as AutomationState : undefined

export type TerminalCommit =
  | { readonly status: 'committed' | 'external-terminal'; readonly terminal: AutomationState }
  | { readonly status: 'recovery-pending'; readonly observed?: string; readonly error?: unknown }

/** automation terminal → RunRecord.result（settle 关闭 reservation 时的结果映射）。 */
export const terminalToRunResult = (t: Terminal): RunSettlement['result'] => {
  switch (t) {
    case 'merged': return 'merged'
    case 'paused': return 'paused'
    case 'conflict': return 'conflict'
    case 'failed': return 'failed'
    case 'queued': return 'retry-queued'
    default: return 'skipped' // skipped / off / 非预期终态
  }
}

/**
 * H10 §5：`PreparationFailureReason` → 处置策略——本表是唯一维护 reason→result/charge/是否暂停 loop
 * 的地方（`ExecutionPreparationPort` 只报「发生了什么事实」，不携带处置策略，见 execution-context.ts
 * ::PrepareOutcome 头注）。设计定稿 §5 表逐行对应：
 *
 *   resolve-failed（default/未指明 workflowKind）→ 暂停 loop（共享 profile，牵连该 profile 下所有 loop）；
 *   resolve-failed（custom）→ 只暂停本 change，不动 loop；
 *   skill-not-found / content-invalid / snapshot-io / snapshot-corrupt → 只暂停本 change；
 *   source-ambiguous → 暂停 loop（同一 ID 有不同内容来源，是接线层面的数据完整性问题）；
 *   policy-changed / source-unstable → retry-queued，不暂停 loop、不收费，交下一轮重新 admission。
 *
 * 准备失败从未创建 sandbox——本表恒 `charge:'none'`（设计 §5 否决「准备失败仍按 reserved estimate
 * 收费」），调用方（handlePreparationFailure）不应再自行决定 charge。
 */
/** 每个 reason 的缺省处置（`Record` 强制覆盖 `PreparationFailureReason` 全部 8 个字面量，编译期
 *  杜绝漏项）；`skill-bundle-resolve-failed` 的 `pauseLoopByDefault` 只是 custom 分支未指明时的
 *  保守缺省，真正是否暂停 loop 由 `preparationPolicyFor` 结合 `workflowKind` 决定。 */
const PREPARATION_POLICY: Record<PreparationFailureReason, { readonly result: 'paused' | 'retry-queued'; readonly pauseLoopByDefault: boolean }> = {
  'skill-bundle-resolve-failed': { result: 'paused', pauseLoopByDefault: true },
  'skill-bundle-source-ambiguous': { result: 'paused', pauseLoopByDefault: true },
  'skill-bundle-skill-not-found': { result: 'paused', pauseLoopByDefault: false },
  'skill-bundle-content-invalid': { result: 'paused', pauseLoopByDefault: false },
  'skill-bundle-snapshot-io': { result: 'paused', pauseLoopByDefault: false },
  'skill-bundle-snapshot-corrupt': { result: 'paused', pauseLoopByDefault: false },
  'skill-bundle-policy-changed': { result: 'retry-queued', pauseLoopByDefault: false },
  'skill-bundle-source-unstable': { result: 'retry-queued', pauseLoopByDefault: false },
}

export const preparationPolicyFor = (
  reason: PreparationFailureReason, workflowKind: 'default' | 'custom' | undefined,
): { readonly result: 'paused' | 'retry-queued'; readonly pauseLoop: boolean } => {
  const policy = PREPARATION_POLICY[reason]
  // resolve-failed 是唯一 pauseLoop 取决于 workflowKind 的 reason（design §5：default/未指明=共享
  // profile→暂停 loop；custom=只影响本 change→不暂停 loop）；其余 reason 的 pauseLoop 与
  // workflowKind 无关，直接用表里的缺省值。
  const pauseLoop = reason === 'skill-bundle-resolve-failed' ? workflowKind !== 'custom' : policy.pauseLoopByDefault
  return { result: policy.result, pauseLoop }
}

/** H7-S2：evaluateVerificationGate 的 expectedSubject 派生规则——两个消费点（writeBackSuccess/
 *  settlementFor）与 lifecycle.ts 的 workflowRunId 派生共用同一条 `?? attempt_id` 兜底（ExecutionContext
 *  形状相同、来源相同：ctx 与 lifecycle 内部合成的 executionContext 本就是同一份归属数据的两次独立
 *  持有），保证两处判定的期望值不因兜底逻辑各写一份而漂移。 */
export const expectedSubjectFor = (ctx: ExecutionContext): { workflow_run_id: string; attempt_id: string; change: string } => ({
  workflow_run_id: ctx.workflow_run_id ?? ctx.attempt_id,
  attempt_id: ctx.attempt_id,
  change: ctx.change,
})

/** H7-S2：两个 settlement 消费点（writeBackSuccess/settlementFor）共用同一份 gate 输入构造，杜绝
 *  两处各写一份 expectedSubject/requireWorkflowBinding 推导逻辑、结构上不可能对不齐。 */
export const verificationGateFor = (ctx: ExecutionContext, o: RunOutcome): VerificationGateResult =>
  evaluateVerificationGate({
    verification: o.verification,
    buildSha: o.buildSha,
    expectedSubject: expectedSubjectFor(ctx),
    requireWorkflowBinding: o.requireWorkflowBinding ?? false,
    expectedAutomationPolicy: ctx.automation_policy,
  })

/**
 * RunChange 是可注入边界：先逐字段各读一次，再构造冻结普通对象。绝不 spread 原对象，也不在
 * provenance 判定之后重新读取 verification。只有真实 lifecycle WeakSet 签发的 outcome 才能携带
 * mergeLanded/requireWorkflowBinding 权威事实；普通 RunChange 的同名自报字段一律不采信。
 */
export const canonicalizeRunOutcome = (raw: RunOutcome, ctx: PreparedExecutionContext): RunOutcome => {
  const certified = isCertifiedLifecycleOutcome(raw)
  const commitsRaw = raw.commits
  const verifyResult = raw.verifyResult
  const buildSha = raw.buildSha
  const branch = raw.branch
  const phaseEvent = raw.phaseEvent
  const noop = raw.noop
  const killSwitched = raw.killSwitched
  const verificationRaw = raw.verification
  const requireWorkflowBindingRaw = raw.requireWorkflowBinding
  const mergeLandedRaw = raw.mergeLanded
  const hostSyncPendingRaw = raw.hostSyncPending
  const mergeJournalPendingRaw = raw.mergeJournalPending

  if (!Array.isArray(commitsRaw)) throw new Error('RunOutcome.commits 必须是数组')
  const commits = Object.freeze(commitsRaw.map((commit) => {
    const sha = commit.sha
    if (typeof sha !== 'string') throw new Error('RunOutcome.commits[].sha 必须是字符串')
    return Object.freeze({ sha })
  }))

  let verification: RunOutcome['verification']
  if (verificationRaw !== undefined) {
    const checked = isBoundaryVerifiedResult(verificationRaw)
      ? validateVerificationResult(verificationRaw)
      : { ok: false as const, errors: ['verification 未经 lifecycle boundary 签发'] }
    if (checked.ok) {
      verification = checked.value
    } else {
      const rejected = validateVerificationResult({
        schema_version: 1,
        verification_id: `scheduler-boundary-rejected-${ctx.attempt_id}`,
        subject: {
          workflow_run_id: ctx.workflow_run_id ?? ctx.attempt_id,
          attempt_id: ctx.attempt_id,
          change: ctx.change,
          revision: { kind: 'named-branch-head', sha: buildSha ?? '0'.repeat(40) },
        },
        binding: { kind: 'default-transition', event: phaseEvent },
        verdict: 'inconclusive',
        evidence: [],
        issuer: { kind: 'sandbox-report', runner: 'scheduler-boundary-rejected', trusted: false },
        evaluated_at: new Date().toISOString(),
      })
      verification = rejected.ok ? rejected.value : undefined
    }
  }

  const coordinateRequiresWorkflowBinding =
    ctx.preparedKind === 'loop-bundle' && ctx.skillBundle.resolutionSource === 'custom'
  const outcome: RunOutcome = Object.freeze({
    commits,
    verifyResult,
    buildSha,
    branch,
    phaseEvent,
    noop,
    killSwitched,
    verification,
    requireWorkflowBinding: coordinateRequiresWorkflowBinding || (certified && requireWorkflowBindingRaw === true),
    mergeLanded: certified && mergeLandedRaw === true,
    hostSyncPending: certified && hostSyncPendingRaw === true,
    mergeJournalPending: certified && mergeJournalPendingRaw === true,
  })
  return certified ? certifyLifecycleOutcome(outcome) : outcome
}

export interface Scheduler {
  /** 处理一个显式候选列表到收口（allSettled），返回结构化 RoundReport。 */
  runRoundOnce(candidates: readonly string[], options?: RunRoundOptions): Promise<RoundReport>
}

/** H14 targeted run：携带 selector 观察到的自然 owner，供 admission 锁内复核；绝不覆盖最新 owner。 */
export interface RunRoundOptions {
  readonly expectedLoopIdByChange?: ReadonlyMap<string, string>
  readonly expectedAutonomyLevelByChange?: ReadonlyMap<string, AutomationConfig['level'] | null>
}
