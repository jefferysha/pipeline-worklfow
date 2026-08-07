/**
 * ExecutionContext（GOAL H · Stage B 第 2 节精确形状）—— 一次自主执行的显式归属与预占快照。
 *
 * 从 admission.reserve() 产出这一刻起，runner / denylist / 结算都按 `context.loop_id` 查 loop，
 * **不再各自按 change 前缀猜**（前缀只用于 binding 首次发现，见 kernel loops/binding.ts）。三处一致
 * 的 loop_id（change-loop-binding + budget-reservation + RunRecord）才是权威归属；loop_id **不落**
 * .pipeline.yaml、不加 automation_* 字段（第 2 节裁决：碰 FIELD_ORDER/store 会撞内核主线未提交改动，
 * 且 automation_* 是队列生命周期、不该承载 policy identity）。
 *
 * H10 §3/§8任务5：新增 `policy_epoch` + `skill_bundle_id`（admission 治理锁内捕获，见
 * loop-admission.ts::reserveOnce）与 `PreparedExecutionContext`/`ExecutionPreparationPort`
 * （claim 之后、activate 之前的 prepareSkillBundle 编排契约，见 scheduler.ts::handleOne 与
 * loop-admission.ts::createExecutionPreparation）。
 *
 * H10 r1 复审阻断3/D5 返工（任务B1）：`PreparedExecutionContext` 由「`ExecutionContext` 加一个
 * 可选 `skillBundle?`」改造成判别联合 `LoopPreparedExecutionContext | NonLoopExecutionContext`
 * + 私有 brand（`PREPARED_EXECUTION_BRAND`）——裸 `ExecutionContext` 不再能按结构类型直接冒充
 * Prepared（原判据：额外字段全可选，天然结构兼容）；loop real-run 的 `skillBundle` 改为必填；非
 * loop 直跑改走类型上判别分明的 `NonLoopExecutionContext` 分支，不再是「省略了字段」的同一形状。
 * 详见下方 `PREPARED_EXECUTION_BRAND`/`markLoopPrepared`/`markNonLoopPrepared` 头注。
 */
import { randomBytes } from 'node:crypto'
import type {
  AttemptContextLedgerSnapshot,
  AutomationPolicySnapshot,
  StepIR,
  WorkflowActionAuthoritySnapshotV1,
} from '@tenon/kernel'
import type { AutomationLevel } from '../types.js'

export interface ExecutionContext {
  readonly attempt_id: string
  readonly reservation_id: string
  readonly loop_id: string
  readonly change: string

  /** 本次执行的分级放权档（= 调度器 config.level / afk --level；驱动 autoMerge 与 settleSuccess）。 */
  readonly level: AutomationLevel
  /** loop 声明的 runner（context.loop_id → loop.runner；codex 缺省，claude-code 仅显式兼容）。 */
  readonly runner: string
  /** 沙箱镜像（admission 装配点透传；缺省由 dockerRunChange 兜 sandcastle:local）。 */
  readonly image?: string

  readonly admitted_at: string
  readonly reservation: {
    readonly runs: 1
    readonly tokens: number
    readonly token_basis: 'budget.tokens_per_run' | 'risk-default'
  }

  /** 已有 runMetadata 时诚实携带；本增量不主动建立 WorkflowRun（第 2 节 / H9 边界）。 */
  readonly workflow_run_id?: string
  /** Exact per-action authority overlay frozen after initial admission and rechecked before claim. */
  readonly workflow_action_authority?: WorkflowActionAuthoritySnapshotV1
  /** H9：本次 loop iteration 的 durable identity；governed admission 路径恒存在。 */
  readonly iteration_id?: string

  /**
   * H10 §3 步骤1：admission 治理锁内重读 registry 时的物化内容 epoch（=
   * kernel governance.ts::registryContentEpoch(registry)，与 loopMaterialUnchanged 的判据同源）。
   * prepareSkillBundle 完成后在 governance→ledger 锁序下重读 registry，必须核对本 epoch 未变
   * （变化 → `skill-bundle-policy-changed`，retry-queued，不收费，不暂停 loop，见设计定稿 §5）。
   */
  readonly policy_epoch: string
  /**
   * H10 §3 步骤1：admission 时刻该 loop 的 skill_bundle_id（= SkillProfileId，只做引用，见 kernel
   * loops/types.ts 头注）。经 loop-admission reserve() 产出的 context：reserveOnce 已经把 loop 级
   * 字段缺失/null（unwired）与具名 profile 不在合法键空间（profile-not-found）两类都在 admission
   * 阶段拒绝、不产出 ExecutionContext——故这条路径上本字段恒为具体、经过校验的 profile 字符串。
   *
   * 二次任务（queued 卡死回归修复）：非经 loop-admission reserve() 产出的 context（非 loop 的 AFK
   * 直跑——如 lifecycle.ts 的合成兜底 context、测试手写的极小放行 fake）没有 loop 可归属，也就没有
   * loop.skill_bundle_id 可携带——本字段缺席/null 即诚实表达「本次执行无 bundle 绑定」，
   * ExecutionPreparationPort.prepare() 据此直通产出 `NonLoopExecutionContext`（H10 r1 阻断3/D5：
   * 判别联合的另一分支，类型上没有 `skillBundle` 概念，不是「PreparedExecutionContext 省略了该
   * 字段」——见 `NonLoopExecutionContext`/`markNonLoopPrepared` 头注），不物化 CAS、不写 ledger
   * 事件、不当业务拒绝处置。
   */
  readonly skill_bundle_id?: string | null
  /** Exact governed policy used by loop admission; absent only on explicit non-loop compatibility runs. */
  readonly automation_policy?: AutomationPolicySnapshot
  /** H2：与 budget reservation 同条 durable 固化、并真注入本次 runner prompt 的历史摘要。 */
  readonly attempt_context?: AttemptContextLedgerSnapshot
}

/**
 * H10 §5：prepareSkillBundle 编排失败的精确诊断闭集（设计定稿 §5 表的后 8 项——前 2 项
 * `skill-bundle-unwired`/`skill-bundle-profile-not-found` 发生在 reserve() 尚未创建 reservation
 * 时，走 `AdmissionDenial.reason` 自由 string，不经过本类型）。同构镜像
 * kernel ledger-types.ts::RunRecord.reason 内联的同一份字面量——两处故意不跨包共享类型引用（对齐
 * ledger-codec.ts::RESOLUTION_SOURCES 的既有「同构闭集、各自声明」惯例），值域必须保持一致。
 */
export type PreparationFailureReason =
  | 'skill-bundle-resolve-failed'
  | 'skill-bundle-skill-not-found'
  | 'skill-bundle-content-invalid'
  | 'skill-bundle-source-ambiguous'
  | 'skill-bundle-policy-changed'
  | 'skill-bundle-source-unstable'
  | 'skill-bundle-snapshot-io'
  | 'skill-bundle-snapshot-corrupt'

/**
 * 单个 effective slot 的已选定具体 skill 摘要（不含正文），镜像 kernel
 * ledger-types.ts::SkillBundleSnapshotRecord.slots 的同一形状（token 是声明记法，alternatives 是
 * 该 token 按声明顺序拆出的全部候选 skill id——原样透传自 kernel
 * workflow/effective-skill-resolver.ts::EffectiveSkillSlot.alternatives，不重排/不过滤，
 * concreteSkillId 是实际物化的那个 alternative，treeSha256 是该 skill 内容目录自身的聚合 hash）。
 */
export interface PreparedSkillSlot {
  readonly token: string
  readonly alternatives: readonly string[]
  readonly concreteSkillId: string
  readonly treeSha256: string
}

/**
 * prepareSkillBundle 成功产出的、已冻结的 skill bundle 内容快照事实（设计定稿 §3 写入面）。
 *
 * H10 r1 阻断2/4·D4 补全字段（任务B1 接线）：`workflow`/`step`/`track`/`coordinateDigest` 与 CAS
 * canonical descriptor（skills/types.ts::SkillSnapshotProvenance）、ledger
 * （kernel ledger-types.ts::SkillBundleSnapshotRecord）同名字段同一概念、同一来源值——三处必须一致
 * 是 D4 裁决的字面要求（见 SkillSnapshotProvenance 头注「三处必须共用同一套字段拼写」）。四个新字段
 * 标为可选：真实 `createExecutionPreparation` 成功路径恒填充；保持可选只是为了不强制本包/lifecycle
 * 各处历史测试 fixture（只关心 snapshotSha256/slots，不关心 workflow 坐标）逐个补齐无关字段。
 */
export interface PreparedSkillBundle {
  /** 聚合快照 hash（= 对应 SkillBundleSnapshotRecord.snapshot_sha256，CAS 目录名）。 */
  readonly snapshotSha256: string
  /** CAS 目录相对 repoRoot 的路径（= SkillBundleSnapshotRecord.cas_relative_path）。 */
  readonly casRelativePath: string
  /** 触发的 resolver 分支（= SkillBundleSnapshotRecord.resolution_source）。 */
  readonly resolutionSource: 'default' | 'custom'
  /** 每个 effective slot → 最终选中的具体 skill 摘要（不含正文）。 */
  readonly slots: readonly PreparedSkillSlot[]
  /** 本次解析所在的 workflow 名字（default 轨为字面量 'default'；custom 轨为该 workflow 文件的 WorkflowIR.name）。 */
  readonly workflow?: string
  /** 本次解析所在的 step id（default 轨即 phase 字段值；custom 轨为 StepIR.id）。 */
  readonly step?: string
  /** 本次解析所在的 track（change 的 track 字段值，驱动 default 轨 skillsFor 三级回退）。 */
  readonly track?: string
  /** = CapturedExecutionCoordinate.inputsDigest（workflow/manifest 输入摘要），供事后审计核对执行坐标。 */
  readonly coordinateDigest?: string
  /** custom workflow 当前 StepIR 冻结的 agent prompt；缺席表示只使用 runner 固定生产指令。 */
  readonly stepPrompt?: string
}

/**
 * H10 r1 复审阻断3（D5 返工，任务B1）：nominal brand——防止裸 `ExecutionContext` 按结构类型直接
 * 满足 `PreparedExecutionContext`（原判据：`skillBundle?` 可选、其余字段全部继承自
 * `ExecutionContext`，结构类型下裸 context 天然满足整个接口，H14 编译期接缝形同虚设——见 H10 r1
 * 复审第3节原文）。
 *
 * 符号必须导出——`declare const x: unique symbol` 若不导出，用作导出接口的属性键会在声明文件生成
 * 时报 TS4033「exported interface 使用 private name」；但本文件不导出任何**产出**该符号取值的公开
 * 工厂，唯一合法构造点是下方 `markLoopPrepared`/`markNonLoopPrepared`（createExecutionPreparation
 * 成功路径与 sdk.ts 的 none-bundle 缺省装配都只能调用它们，不手写字面量）。裸 `ExecutionContext`
 * 或手写字面量若想满足 `PreparedExecutionContext`，必须显式导入本符号并自己拼出
 * `[PREPARED_EXECUTION_BRAND]: true`——不再可能靠「字段恰好都兼容」悄悄通过编译（编译期钉子见
 * execution-context.test-d.ts）。
 */
export const PREPARED_EXECUTION_BRAND: unique symbol = Symbol('PreparedExecutionContext')

/** 包内运行时发行表；根出口不暴露工厂/brand，scheduler 还要求每张票据恰好消费一次。 */
const issuedPreparedContexts = new WeakSet<object>()

/**
 * H10 §3 写入面 + H10 r1 阻断3/D5 返工（任务B1）：prepareSkillBundle 编排的两条互斥出口，由判别
 * 字段 `preparedKind` 区分——D5 裁决原文：「"非 loop 直通"若需兼容，应走独立、显式区分的
 * legacy/non-loop 类型或路径；不能把 skillBundle? 做成可选并称为 Prepared」。
 *
 *   · loop real-run 且 bundle 已成功物化 → `LoopPreparedExecutionContext`（`skillBundle` 必填，
 *     不再可选——loop real-run 缺 bundle 接线恒被 admission 硬闸拒绝，见 loop-admission.ts
 *     ::reserveOnce 的 skill-bundle-unwired/profile-not-found 判定，从不会走到这里）。
 *   · 非 loop 直跑（AFK enqueue/runRound 无 loop 绑定；`ctx.skill_bundle_id` 缺席/null，见上方
 *     字段头注）→ `NonLoopExecutionContext`——没有 bundle 概念，不是「省略了 skillBundle 字段」的
 *     同一个形状，类型上判别分明。
 *
 * 两者联合成 `PreparedExecutionContext`——`RunChange`（scheduler.ts）与既有消费点
 * （dockerRunChange.ts 等）继续用这一个类型名，不需要感知内部是判别联合；只读取 `ExecutionContext`
 * 基类字段（change/loop_id/runner/policy_epoch/skill_bundle_id 等）的消费点不受影响，需要读
 * `skillBundle` 的消费点必须先判别 `preparedKind==='loop-bundle'`（编译期强制窄化，不能再靠 `?.`
 * 悄悄放过、把"从未 prepare 过 bundle"读成"bundle 恰好是 undefined"）。
 *
 * 两个变体都带 `[PREPARED_EXECUTION_BRAND]` 私有品牌（见上）——裸 `ExecutionContext` 不满足任一
 * 变体。本类型只应由 `ExecutionPreparationPort.prepare()` 的成功分支产出（经
 * markLoopPrepared/markNonLoopPrepared），调用方不应手写字面量伪造（scheduler 的编排顺序
 * reserve→claim→prepare→activate→runChange 是唯一可信来源，见 scheduler.ts::handleOne）。
 */
export interface LoopPreparedExecutionContext extends ExecutionContext {
  readonly preparedKind: 'loop-bundle'
  readonly skillBundle: PreparedSkillBundle
  readonly [PREPARED_EXECUTION_BRAND]: true
}

/** 见 `LoopPreparedExecutionContext` 头注——非 loop 直跑分支，没有 bundle 概念可携带。 */
export interface NonLoopExecutionContext extends ExecutionContext {
  readonly preparedKind: 'non-loop'
  readonly [PREPARED_EXECUTION_BRAND]: true
}

export type PreparedExecutionContext = LoopPreparedExecutionContext | NonLoopExecutionContext

export function consumeIssuedPreparedContext(value: unknown): value is PreparedExecutionContext {
  if (typeof value !== 'object' || value === null || !issuedPreparedContexts.has(value)) return false
  issuedPreparedContexts.delete(value)
  return true
}

/**
 * 唯一合法构造点①（见 `PREPARED_EXECUTION_BRAND`头注）：loop real-run 的 prepareSkillBundle 成功
 * 路径——`createExecutionPreparation` 内部专用。测试构造"已 prepare 且带 bundle"的 fixture 时也应
 * 调用本函数，不手写字面量+unsafe cast，保持唯一入口。
 */
export function markLoopPrepared(ctx: ExecutionContext, skillBundle: PreparedSkillBundle): LoopPreparedExecutionContext {
  const frozenBundle = Object.freeze({
    ...skillBundle,
    slots: Object.freeze(skillBundle.slots.map((slot) => Object.freeze({ ...slot, alternatives: Object.freeze([...slot.alternatives]) }))),
  })
  const prepared = Object.freeze({
    ...ctx,
    reservation: Object.freeze({ ...ctx.reservation }),
    preparedKind: 'loop-bundle',
    skillBundle: frozenBundle,
    [PREPARED_EXECUTION_BRAND]: true as const,
  })
  issuedPreparedContexts.add(prepared)
  return prepared
}

/**
 * 唯一合法构造点②（见 `PREPARED_EXECUTION_BRAND` 头注）：非 loop 直跑（无 bundle 可携带）——
 * `createExecutionPreparation` 的 none-bundle 分支与 `sdk.ts::createDefaultExecutionPreparation`
 * 的缺省装配共用本函数，不各自手写字面量。
 */
export function markNonLoopPrepared(ctx: ExecutionContext): NonLoopExecutionContext {
  const prepared = Object.freeze({
    ...ctx,
    reservation: Object.freeze({ ...ctx.reservation }),
    preparedKind: 'non-loop',
    [PREPARED_EXECUTION_BRAND]: true as const,
  })
  issuedPreparedContexts.add(prepared)
  return prepared
}

/**
 * prepareSkillBundle 一次调用的结构化结果。失败分支只报「发生了什么事实」（reason/detail/
 * workflowKind），不携带处置策略（是否暂停 loop/change、charge 多少）——那是 scheduler.ts 的职责
 * （唯一维护 reason→result/charge/pause 表的地方，与既有 verification gate/on_exceed 处置表同一
 * 惯例，不让处置逻辑散落进 port 实现）。`workflowKind` 只在 `skill-bundle-resolve-failed` 时有意义
 * （区分「default 轨共享 profile 解析失败，牵连该 profile 下所有 loop」与「custom 轨仅本 change
 * 的 step.skills 解析失败」——设计定稿 §5：前者暂停 loop，后者只暂停本 change）；其余 reason 的
 * 处置与 workflowKind 无关，可以省略。
 */
export type PrepareOutcome =
  | { readonly ok: true; readonly context: PreparedExecutionContext }
  | {
      readonly ok: false
      readonly reason: PreparationFailureReason
      readonly detail: string
      readonly workflowKind?: 'default' | 'custom'
    }

export interface ExecutionPreparationPort {
  /**
   * claim 成功（queued→scheduled）之后、activate（reservation-activated）之前调用（设计定稿 §3
   * 精确顺序）：解析 effective skill slots → 按声明顺序定位内容 → 物化 CAS 快照 →
   * governance→ledger 锁序下复核 policy epoch/loop 状态/bundle/workflow 输入未变 → 追加
   * `skill-bundle-snapshot` ledger 事件。从未创建 sandbox——调用方（scheduler）对失败分支恒
   * `charge:'none'` 结算（设计 §5 否决「准备失败仍按 reserved estimate 收费」）。
   */
  prepare(ctx: ExecutionContext): Promise<PrepareOutcome>
}

/**
 * H10 §3 步骤2：claim 后、在 change lock 下读取并固定的「当前 workflow 坐标」（`SkillBundleResolutionInput`
 * 判别联合本身已含 `profileId`，由 preparation 从 `ctx.skill_bundle_id` 派生并入，不重复放在
 * 本类型里）。`inputsDigest` 是 manifest/workflow 输入的摘要，供设计 §3 步骤7「governance→ledger
 * 锁序下重新核对 manifest/workflow 输入 digest」比对——变化视为与治理 epoch 改变同一类
 * TOCTOU（`skill-bundle-policy-changed`，retry-queued，见设计 §5）。
 *
 * H10 r1 复审阻断2/D4 补全字段：`workflow`/`track` 原本被判定为 preparation 无需的字段（不在
 * 「最小子集」内），但 kernel ledger-types.ts::SkillBundleSnapshotRecord 补全 provenance 后需要
 * 两者落记录（供事后审计核对执行坐标），故补进本类型——`workflow` 是本次解析所在的 workflow 名字
 * （default 轨为字面量 `'default'`；custom 轨为该 workflow 文件的 `WorkflowIR.name`，`StepIR` 本身
 * 不携带父 workflow 名，故不能从 `resolution.step` 派生，必须单独捕获），`track` 是本次解析所在的
 * track（change 的 track 字段值，驱动 default 轨 skillsFor 三级回退）。两者与
 * kernel ledger-types.ts::SkillBundleSnapshotRecord.workflow/track 同一概念。
 */
export interface CapturedExecutionCoordinate {
  readonly resolution:
    | { readonly kind: 'default'; readonly stepId: string }
    | { readonly kind: 'custom'; readonly step: StepIR }
  readonly workflow: string
  readonly track: string
  readonly inputsDigest: string
  /** change 持久化 runMetadata.runId；缺席仅限无 WorkflowRun 的旧路径。 */
  readonly workflowRunId?: string
}

/**
 * workflow 坐标捕获口（注入面，生产实现属 H10 任务7「CLI 生产装配」——绑定真实
 * WorkflowRunRepository/workflow loader，本包不理解 change 目录或 workflow run 持久化形状）。
 * `capture()` 内部自行持有并释放 change lock（设计 §3 步骤2：「随后释放 change lock」，preparation
 * 编排本身不持任何 change 锁）；`readCurrentInputsDigest()` 供步骤7 复核单独调用，不重新持锁读取
 * 整份坐标（避免锁临界区不必要地扩大）。
 */
export interface ExecutionCoordinatePort {
  capture(ctx: ExecutionContext): Promise<CapturedExecutionCoordinate>
  readCurrentInputsDigest(ctx: ExecutionContext): Promise<string>
}

/** 唯一 id 生成器（record_id / reservation_id / attempt_id / run_record_id / usage_id 共用）：
 *  `<prefix>-<base36 时间戳>-<hex 随机>`——定长安全字符集 [0-9a-z-]，不撞 ledger JSON 编解码。 */
export function makeIdGen(): (prefix: string) => string {
  return (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${randomBytes(6).toString('hex')}`
}
