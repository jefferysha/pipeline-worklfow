/**
 * loop durable ledger 记录类型（GOAL H1 / BACKLOG #35 —— loops 治理的持久化账本存储面）。
 *
 * 契约来源：codex 拍板的 ledger 设计蓝图，字段名/联合成员照抄不改。磁盘格式为 JSONL
 * （一行一条记录），字段命名沿用 loops 域的 snake_case 惯例（对齐 loops.yaml / types.ts
 * 的 LoopEntry）。编解码与校验在 ledger-codec.ts，带锁 append/宽容读在 ledger-store.ts。
 *
 * 账本语义（判读这些记录的人须知）：
 *   · 账本是 append-only 事实流：绝不改写/删除既有行，纠错靠追加新记录
 *     （如 ChangeLoopBindingRecord.supersedes_record_id 指向被顶替的旧绑定）。
 *   · BudgetReservationRecord（预占）与 RunRecord（终局）构成 reservation 的开/关对：
 *     一个 reservation 自预占起视为「未关闭」，直到出现 reservation_id 引用它的 RunRecord。
 *   · SkillBundleSnapshotRecord（H10 §3/§8任务3）是 reservation 存续期内的中间事实，定位类似
 *     ReservationActivatedRecord：绑定 reservation_id/attempt_id，但**不参与** open-reservation
 *     判定与 terminal 判定——两者只看 budget-reservation 与 run 两种 kind（ledger-projection.ts::
 *     indexReservationTerminals、ledger-store.ts::readRunWindow 均不因本 kind 而改变判定结果）。
 *     该记录只在 prepareSkillBundle 成功物化 CAS 快照后追加，供进程崩溃（快照已产出但终态
 *     RunRecord 未及写下）时账本仍留有快照事实；RunRecord.skill_bundle_snapshot_sha256 是终态侧
 *     的快速关联引用。
 *   · 本模块只钉类型与契约；记录内容由写入方构造（store 不自产 ID、不自产记录）。
 */
import type { VerificationResult } from '../verification/index.js'

/** 预算超限动作闭集（ledger 侧新类型——注意 loops.yaml 的 LoopBudget.on_exceed 是历史自由
 *  字符串，两者不同域：账本快照必须落在闭集内才可判读）。 */
export type BudgetExceedAction = 'skip-run' | 'pause-loop' | 'halt-round'

/** 所有账本记录的公共头。record_id 由写入方生成（store 不自产 ID）；recorded_at 为写入方
 *  观测到的 ISO-8601 时间戳。 */
export interface LedgerRecordBase {
  schema_version: 1
  record_id: string
  recorded_at: string
}

/** change → loop 归属绑定事实。source 标注绑定依据：显式声明或 change_prefix 最长前缀匹配。
 *  重绑定 = 追加一条新记录并以 supersedes_record_id 指向被顶替的旧绑定（不改写旧行）。 */
export interface ChangeLoopBindingRecord extends LedgerRecordBase {
  kind: 'change-loop-binding'
  change: string
  loop_id: string
  source: 'explicit' | 'longest-prefix'
  supersedes_record_id?: string
}

/** 预算预占（reservation 的「开」侧）：admission 判定放行时先记账占位，防并发放行超卖。
 *  limits_snapshot 冻结判定当时的预算限额，让事后审计不依赖 loops.yaml 的当前值。
 *  expires_at 之后未被 RunRecord 关闭的预占视为过期（判读口径；账本本身不做时间裁决）。 */
export interface BudgetReservationRecord extends LedgerRecordBase {
  kind: 'budget-reservation'
  reservation_id: string
  attempt_id: string
  /** H9 governed iteration identity；旧 ledger 行可缺席。 */
  iteration_id?: string
  loop_id: string
  change: string
  /** UTC YYYY-MM-DD（预占计入哪个预算日）。 */
  budget_day: string
  /** 每条预占恒占 1 次运行名额（字面量钉死：多次运行 = 多条预占）。 */
  reserved_runs: 1
  reserved_tokens: number
  /** 预占 token 数的依据：登记表显式 budget.tokens_per_run，或按 risk 档位默认值。 */
  token_basis: 'budget.tokens_per_run' | 'risk-default'
  limits_snapshot: {
    max_runs_per_day: number
    max_in_flight: number
    max_tokens_per_day?: number
    on_exceed: BudgetExceedAction
  }
  /** H2：本次 runner 启动前消费的历史摘要；与 reservation 同条 append 固化，旧行缺席合法。 */
  attempt_context?: AttemptContextLedgerSnapshot
  expires_at: string
}

export interface AttemptContextLedgerSnapshot {
  /** 参与构造摘要的全部历史 terminal RunRecord（ledger 顺序）。 */
  source_run_record_ids: string[]
  /** 因信号裁剪/字符预算省略的 attempt identity。 */
  omitted_attempt_ids: string[]
  /** 真注入 runner prompt 的完整文本；整行裁剪，绝不截断半条记录。 */
  rendered: string
  stagnation: {
    stagnant: boolean
    fingerprint?: string
    repeated_attempt_ids: string[]
  }
}

/**
 * skill bundle 内容快照事实（H10 §3/§8任务3，H10 r1 复审阻断2/D4 补全 provenance）：admission/
 * reservation 之后、reservation-activated 之前，prepareSkillBundle 把当次 workflow/step/track 解析出
 * 的 effective skill 完整内容物化成不可变 CAS 快照时追加本记录（H10 设计定稿 §3 精确顺序：
 * admission/reservation → claim → prepareSkillBundle → reservation-activated → running）。写下本记录时
 * 对应 reservation 必然已存在——两个绑定字段都不可选。
 *
 * 只存 digest / 结构摘要 / CAS 引用，**绝不存 skill 正文**：即便进程在此之后、终态 RunRecord
 * 出现之前崩溃，账本也留有「快照已产出」的事实（不依赖可能永不出现的终态）。**不参与**
 * open-reservation 判定与 terminal 判定——两者只认 budget-reservation / run 两种 kind。
 *
 * H10 r1 复审阻断2/D4 裁决原文：「只放 Prepared 不耐崩溃，只放 ledger 又不能让容器验证自包含
 * 快照」——本记录须携带启动与审计所需的**完整紧凑 provenance**（不含正文/文件级明细，那部分是
 * CAS 内被聚合 digest 覆盖的 canonical descriptor 的职责，见 automation/skills/snapshot-store.ts）。
 * 新增字段与 automation/admission/execution-context.ts::PreparedExecutionContext.skillBundle 是
 * 同一份 provenance 规范的两处表达（snake_case ↔ camelCase 惯例对应，值域须保持一致，写入方负责
 * 保证跨记录一致——本文件与 ledger-codec.ts 只钉各字段自身的类型/格式，不做跨记录比对）。
 * 本 kind 是本轮 H10 新增、无历史行，新增字段全部必填，无需向后兼容旧 snapshot 行（RunRecord 与
 * 其余既有 kind 的旧行兼容不受影响，见 ledger-codec.test.ts 的旧 JSONL fixture 回归测试）。
 */
export interface SkillBundleSnapshotRecord extends LedgerRecordBase {
  kind: 'skill-bundle-snapshot'
  attempt_id: string
  reservation_id: string
  /** H10 r1 阻断2/D4 补全字段：本记录归属的 loop id（语义上与对应 reservation 的
   *  BudgetReservationRecord.loop_id 是同一个 loop——写下本记录时对应 reservation 必然已存在，见
   *  本接口头注；写入方负责保证一致，本层不做跨记录比对）。供事后审计/崩溃恢复不经回查 reservation
   *  记录即知道本快照的 loop 归属。 */
  loop_id: string
  /** 快照当时的 LoopEntry.skill_bundle_id 值（= SkillProfileId，只做引用，见 types.ts 头注）。 */
  skill_bundle_id: string
  /** H10 r1 阻断2/D4 补全字段：快照当时刻 admission 治理锁内捕获的治理内容 epoch（=
   *  governance.ts::registryContentEpoch(registry) 的返回值：'absent' 字面量或 64 位小写十六进制
   *  sha256，两态皆合法，见该函数头注——故本字段按纯 string 校验，不用 checkSha256）。与
   *  automation/admission/execution-context.ts::ExecutionContext.policy_epoch 同一概念，供事后审计
   *  核对写下本记录时的治理内容是否与 reservation 预占时刻一致。 */
  policy_epoch: string
  /** 触发的 resolver 分支（镜像 workflow/skill-bundle-resolver.ts::SkillBundleResolutionSource 的
   *  值域；本层不跨包引入该类型，只钉同构字面量联合，两处值域保持一致）。 */
  resolution_source: 'default' | 'custom'
  /** H10 r1 阻断2/D4 补全字段：本次执行归属的 workflow run id，与
   *  automation/admission/execution-context.ts::ExecutionContext.workflow_run_id 同一概念。 */
  workflow_run_id: string
  /** H10 r1 阻断2/D4 补全字段：本次解析所在的 workflow 名字（default 轨为字面量 'default'；custom
   *  轨为该 workflow 文件的 WorkflowIR.name，见 workflow/ir.ts）。 */
  workflow: string
  /** H10 r1 阻断2/D4 补全字段：本次解析所在的 step id（default 轨即 phase 字段值；custom 轨为
   *  StepIR.id）。 */
  step: string
  /** H10 r1 阻断2/D4 补全字段：本次解析所在的 track（change 的 track 字段值，驱动 default 轨
   *  skillsFor 三级回退，见 workflow/effective-skill-resolver.ts）。 */
  track: string
  /** H10 r1 阻断2/D4 补全字段：捕获执行坐标（workflow/step/track 及 manifest/workflow 输入内容）
   *  的聚合摘要（64 位小写十六进制 sha256），与
   *  automation/admission/execution-context.ts::CapturedExecutionCoordinate.inputsDigest 同一概念；
   *  供 governance→ledger 锁序下复核坐标是否漂移，见该接口头注「步骤7」。 */
  coordinate_digest: string
  /** 聚合快照 hash（64 位小写十六进制 sha256；CAS 目录名即此值）。 */
  snapshot_sha256: string
  /** CAS 目录相对 repoRoot 的路径（形如 `.pipeline/loops/skill-snapshots/sha256/<snapshot_sha256>`）。 */
  cas_relative_path: string
  /**
   * 每个 effective slot → 最终选中的具体 skill 摘要（不含正文）：token 是声明记法（含 `a|b`
   * 备选原文），alternatives 是该 token 按声明顺序拆出的全部候选 skill id（H10 r1 阻断2/D4
   * 补全字段，与 workflow/effective-skill-resolver.ts::EffectiveSkillSlot.alternatives 同一概念——
   * 审计/复核需要知道「有哪些候选、以何种原序排列」而不只是「选中了哪个」），concrete_skill_id
   * 是实际物化的那个 alternative，tree_sha256 是该 skill 内容目录自身的聚合 hash（64 位小写十六
   * 进制 sha256）。profile 合法但本 step 解析结果为空 → [] 是合法的「空快照」，不是未接线（H10
   * 设计定稿 §3 裁决）。
   */
  slots: { token: string; alternatives: string[]; concrete_skill_id: string; tree_sha256: string }[]
}

/** 预占激活标记：attempt 真正开跑的时刻（介于预占与终局之间的中间态事实）。 */
export interface ReservationActivatedRecord extends LedgerRecordBase {
  kind: 'reservation-activated'
  reservation_id: string
  attempt_id: string
  iteration_id?: string
  /** 与被激活 reservation 的 owner identity 必须逐字段一致；投影层会再次做关系校验。 */
  loop_id: string
  /** 与被激活 reservation 的 owner identity 必须逐字段一致；不能只凭 reservation_id 激活。 */
  change: string
  started_at: string
}

/**
 * token 用量事实。**只允许来自 provider 结构化协议**（source 字面量类型钉死单值）：
 * 写入方纪律——拿不到可信结构化 usage 时**不得伪造 tokens=0 的 UsageRecord 充数**，
 * 该情形正确的表达是不写 UsageRecord、由 RunRecord.accounting.charge_source 取
 * 'reserved-estimate' 或 'none'。本模块只钉类型与校验契约，不产记录。
 */
export interface UsageRecord extends LedgerRecordBase {
  kind: 'usage'
  usage_id: string
  attempt_id: string
  iteration_id?: string
  loop_id: string
  provider: string
  model?: string
  request_id?: string
  tokens: { input: number; output: number; cached_input?: number; reasoning?: number; total: number }
  source: 'provider-structured'
  observed_at: string
}

/** run 终局结果闭集。 */
export type RunResult = 'merged' | 'paused' | 'conflict' | 'failed' | 'retry-queued' | 'skipped'

/**
 * ref CAS 前的 durable merge intent。merged_commit_sha 已由 commit-tree 产生，但 base ref 尚未
 * update；因此本记录必须先于物理 ref 更新落盘。除 ref CAS 输入外，还携带重建 terminal RunRecord
 * 所需的执行、核验、产物与会计事实。它是恢复线索而不是 terminal，不关闭 reservation。
 */
export interface MergeIntentRecord extends LedgerRecordBase {
  kind: 'merge-intent'
  attempt_id: string
  iteration_id?: string
  reservation_id: string
  loop_id: string
  change: string
  workflow_run_id: string
  base_ref: string
  /** git object id；沿用本仓既有 git SHA 的 string 口径，兼容 SHA-1/SHA-256 与测试短占位。 */
  expected_base_sha: string
  branch_ref: string
  expected_branch_sha: string
  merged_commit_sha: string
  level: 'L1' | 'L2' | 'L3'
  runner: string
  image?: string
  admitted_at: string
  started_at?: string
  created_at: string
  verify?: { result: 'pass' | 'fail'; source: 'sandbox-output'; trusted: false }
  verification?: VerificationResult
  artifacts?: { build_sha?: string; build_sha_source?: 'named-branch-head'; branch?: string; commit_shas: string[] }
  skill_bundle_snapshot_sha256?: string
  usage_record_ids: string[]
  accounting: {
    reserved_tokens: number
    charged_tokens: number
    charge_source: 'provider-structured' | 'reserved-estimate' | 'none'
  }
}

/**
 * base ref CAS 成功后的 durable receipt。host 工作树同步是 ref 更新之后的次级动作，故同步失败仍
 * 必须记录 landed=true 的事实，并以 host_synced/host_sync_error 表达待修复状态。它同样不是
 * terminal；只有后续 RunRecord 才关闭 reservation。
 */
export interface MergeLandedRecord extends LedgerRecordBase {
  kind: 'merge-landed'
  intent_record_id: string
  attempt_id: string
  reservation_id: string
  loop_id: string
  change: string
  base_ref: string
  base_before_sha: string
  branch_sha: string
  merged_commit_sha: string
  host_synced: boolean
  host_sync_error?: { cause: string; message: string }
  landed_at: string
}

/**
 * run 终局记录 = attempt 的 **terminal/commit marker**：一条 RunRecord 宣告对应 attempt
 * 已终局；若带 reservation_id 则同时**关闭**该 reservation（readRunWindow 的
 * openReservations 判定正是「没有任何 RunRecord 引用其 reservation_id」）。
 * verify.trusted 恒为 false（字面量钉死）：verify 结果来自 sandbox 输出，属未验证自报，
 * 不得当受信结论消费。accounting 记录预占与实扣的对账口径。
 *
 * verify（自报二元）与 verification（H7 结构化 verdict）**并存于同一条 terminal RunRecord**：前者是
 * sandbox `<output>` 的 untrusted 观测（保留原义不动），后者是 host 签发的 typed 结论（trusted 由
 * issuer 类型派生，见 verification/types.ts）。两字段均可选：缺 verification 的旧行照常 decode（缺字段
 * → undefined），codec 只在字段存在时对其窄校验。
 */
export interface RunRecord extends LedgerRecordBase {
  kind: 'run'
  run_record_id: string
  attempt_id: string
  iteration_id?: string
  reservation_id?: string
  loop_id: string
  change: string
  workflow_run_id?: string
  level: 'L1' | 'L2' | 'L3'
  runner: string
  image?: string
  admitted_at: string
  started_at?: string
  finished_at: string
  result: RunResult
  reason?: 'completed' | 'host-sync-pending' | 'merge-journal-pending' | 'no-op' | 'verify-fail' | 'claim-lost' | 'admission-denied'
    | 'kill-switch' | 'cancelled' | 'infrastructure-error' | 'recovered'
    | 'reservation-expired'
    // H7 verifier Phase 2（settlement verification gate，fail-closed 诊断成因）：
    | 'verification-missing' | 'verification-untrusted' | 'verification-inconclusive'
    | 'verification-subject-mismatch'
    // H7-S2（返工 r2 阻断4 custom fail-closed）：custom workflow 的核验结果未真正落在
    // workflow-transition binding（坐标缺席/未解析）时的诊断成因，见 automation/verifier.ts
    // ::evaluateVerificationGate 的 requireWorkflowBinding 判定。
    | 'verification-binding-unresolved'
    | 'verification-policy-mismatch'
    // H4：reservation 已 durable 写入、但 WorkflowRun policy snapshot 绑定失败时的零扣费补偿终态。
    // 该终态只关闭预算预占；原绑定错误仍向 scheduler fail-loud 传播。
    | 'automation-policy-bind-failed'
    // H10 §5/§8任务5（admission/prepareSkillBundle 的精确 fail-closed 诊断闭集，同构镜像
    // automation/admission/execution-context.ts::PreparationFailureReason 的字面量值域——本文件
    // 不跨包引入该类型，只钉同一份闭集字符串，两处保持一致，对齐既有 verification-* 系列的同款
    // 「kernel 类型内联字面量 + automation 侧同构命名类型」惯例）。前两值（unwired/profile-not-found）
    // 只在 admission.reserve() 尚未创建 reservation 时发生，走 AdmissionDenial 的自由 string，从不
    // 出现在 RunRecord——仍纳入本闭集是为了与设计定稿 §5 的十项闭集保持同一份可读字面量列表，供
    // H11 evaluateSkillBundleWiring() 等未来消费方与本闭集对照，不代表 codec/写入方对它们放宽。
    // 其余八值绑定 prepareSkillBundle 成功前必须关闭的已开 reservation（loop-admission.ts
    // ::createExecutionPreparation 的失败分支、scheduler.ts::handlePreparationFailure 落 terminal
    // RunRecord 时写入）。
    | 'skill-bundle-unwired' | 'skill-bundle-profile-not-found' | 'skill-bundle-resolve-failed'
    | 'skill-bundle-skill-not-found' | 'skill-bundle-content-invalid' | 'skill-bundle-source-ambiguous'
    | 'skill-bundle-policy-changed' | 'skill-bundle-source-unstable' | 'skill-bundle-snapshot-io'
    | 'skill-bundle-snapshot-corrupt'
  verify?: { result: 'pass' | 'fail'; source: 'sandbox-output'; trusted: false }
  /** H7 结构化 verification 结果（host/human 签发的 typed verdict + 可核 evidence）。与自报 verify 并存；
   *  缺席 = 旧行 / 未做结构化验证。窄校验由 verification/validate.ts 的 collectVerificationResultErrors 承担。 */
  verification?: VerificationResult
  artifacts?: { build_sha?: string; build_sha_source?: 'named-branch-head'; branch?: string; commit_shas: string[] }
  /** H10 §3/§8任务3：终态关联的 skill bundle 快照聚合 hash（= 对应 SkillBundleSnapshotRecord.
   *  snapshot_sha256），供查询快速关联而不必回查 skill-bundle-snapshot 记录本身。可选：H10 之前的
   *  旧行缺席合法；H10 新运行写入时应带上——该约束由写入方（settlement 侧调用 closeReservationIfOpen
   *  的一侧）负责，本类型与 codec 只钉「缺席合法 / 存在则必须是合法 sha256」两态，不区分调用方
   *  是否为 H10 新运行。 */
  skill_bundle_snapshot_sha256?: string
  usage_record_ids: string[]
  accounting: {
    reserved_tokens: number
    charged_tokens: number
    charge_source: 'provider-structured' | 'reserved-estimate' | 'none'
  }
  error?: { cause: string; message: string }
}

/** 账本记录判别联合（kind 为判别子；闭集，ledger-codec.ts 的窄校验与此一一对应）。 */
export type LedgerRecord = ChangeLoopBindingRecord | BudgetReservationRecord
  | SkillBundleSnapshotRecord | ReservationActivatedRecord | UsageRecord
  | MergeIntentRecord | MergeLandedRecord | RunRecord
