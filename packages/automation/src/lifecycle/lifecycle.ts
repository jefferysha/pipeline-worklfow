/**
 * change 沙箱生命周期纯编排（BACKLOG #29）—— 挂队→入沙箱→跑 pipeline→merge-back→teardown。
 *
 * 老仓真相源：scheduler/runChange.ts:721-1108（createRunChange 的 run() 编排）+ lifecycle/
 * SandboxLifecycle.ts（merge-back）+ WorktreeManager.ts（per-change 命名分支 worktree）。
 *
 * 本模块是**纯编排 + 注入面**：worktree / sandbox / runWork / collectCommits / mergeToBase / git
 * 全是注入 port（真 docker/git 走 IT + #29c，单测用 fake 驱动全链）。不阉割的守卫（DESIGN §7）以
 * 注入契约表达：
 *   - 沙箱注入 PIPELINE_AFK=1（headless 放行三门，老仓 runChange env）。
 *   - build_sha barrier 全链同源（deriveBarrierSha，命名分支 HEAD，不信沙箱自报）。
 *   - abort → **保留 worktree**（不 remove）+ AbortedRunError（DESIGN §7-item4：失败/abort 绝不清沙箱）。
 *   - 分级放权：autoMerge=false（L1/L2 report-only）→ 收集 commits + 派生 build_sha 供人工复核，
 *     但**不 mergeToBase**（不自动合并回主线，安全默认）；autoMerge=true（L3）→ 真 merge-back。
 *   - H7 verifier Phase 2：merge 判断块之前、barrier 派生权威 build_sha 之后调 VerifierPort.verify()，
 *     返回值立即经 enforceVerificationBoundary 窄校验（H7 复审阻断1 核心修复：绝不原样直信运行时
 *     输出——非法/伪造 result 被替换成安全 inconclusive/untrusted sentinel），合法结果才原样携带进
 *     RunOutcome.verification，供 scheduler settlement 的 pre-terminal 消费点
 *     （scheduler.ts::evaluateVerificationGate 调用点）判定结算 reason/cause。无 commit（no-op，
 *     barrier.buildSha 缺席）→ 没有可核验的构建，跳过调用（verification 留空）。
 *     本层**同时**用同一份 evaluateVerificationGate 纯函数判定是否物理执行 mergeToBase——trusted
 *     passed 且 SHA 相符才进入既有 merge 逻辑（mergeback 实现/kill-switch permit 原语本身零改动，
 *     只多一层前置 gate 条件）：绝不允许「git 已物理合并、但结算诚实地说未合并」这种状态分裂——
 *     两处判定共享同一输入（经边界消毒后的 verification/buildSha）与同一纯函数，结构上不可能分叉；
 *     且因入口已消毒，物理 merge 与之后的 ledger 写入不可能因同一个非法 verification 对象一个放行
 *     一个拒绝而分裂（H7 复审阻断4）。
 *   - H7 verifier Phase 2 · custom workflow 坐标（H7 复审阻断5 核验结论）：本包（packages/automation）
 *     没有任何生产来源能把「一个 change 归属哪个 custom workflow + 当前在哪个 step」从 G1/G2
 *     workflow-run state（kernel/state/workflow-run-repository.ts 一类）接进 automation runtime——
 *     ExecutionContext/RunChangeConfig 历来不携带 workflow 名/digest/step，真正接线是跨包设计问题
 *     （需 H14+）。本层唯一诚实的动作：调用方**如果**真持有稳定坐标，经 cfg.workflowCoordinate 注入
 *     即可换成 workflow-transition binding；没有人接线（本仓现状）就诚实落 default-transition——
 *     绝不伪造 workflow_digest/step 冒充精确坐标（fail-closed）。
 *   - H7-S2（H7 返工·修死 r2 阻断1-4 的 automation 半边）：executionContext/workflowRunId/
 *     requireWorkflowBinding 提到函数顶层计算（只依赖 cfg，与 barrier/commits 无关）——verifier
 *     产生点构造 VerifierInput 与本层自己的 mergeGate 判定共用同一份数据源，两处 expectedSubject
 *     结构上不可能对不齐。VerifierInput 携带 expectedIssuerIdentity（从 LifecyclePorts.
 *     verifierExpectedIssuerIdentity 注入，未设置则用 DEFAULT_VERIFIER_ISSUER_IDENTITY）——boundary
 *     按 issuer 分支核对全部身份字段，不再只看 kind。mergeGate 新增 expectedSubject（本层持有的归属数据）+
 *     requireWorkflowBinding（cfg.workflowKind==='custom' 时要求 canonical.binding.kind 必须是
 *     workflow-transition，未传/'default' 语义不受此限）——RunOutcome 新增同名字段随结果透传给
 *     scheduler，settlement 消费点用同一套判定，绝不出现"物理已 merge 但结算判 custom 坐标未解析"
 *     的分裂。
 */
import { PIPELINE_AFK_ENV } from '../queue/gate.js'
import { type RunOutcome } from '../types.js'
import { filterRunnerEnvironment, type SandboxReport } from '../runner/runner.js'
import { markNonLoopPrepared, type PreparedExecutionContext, type PreparedSkillBundle } from '../admission/execution-context.js'
import {
  assertLoopRunner, evaluateConstraintPolicy,
  type ConstraintDecision, type VerificationBinding, type VerificationIssuer,
} from '@pipeline-lite/kernel'
import {
  DEFAULT_VERIFIER_ISSUER_IDENTITY, enforceVerificationBoundary, evaluateVerificationGate, freezeVerifierInput,
  type VerificationIssuerIdentity, type VerifierPort,
} from '../verifier/verifier.js'
import { certifyLifecycleOutcome } from './outcome.js'
import { type GitFace, deriveBarrierSha } from './barrier.js'
import { MergeJournalError, type MergeBackReceipt, type MergeIntentDraft } from './mergeback.js'
import {
  AllowlistViolationError, DenylistViolationError, PathPolicyUnconfiguredError,
  matchAllowlist, matchDenylist, matchesPathGlob,
} from './denylist.js'
import { createPhaseWatch } from './transitionWatch.js'

/** per-change 命名分支前缀（老仓 sandcastle-pipeline/<name>）。 */
export const NAMED_BRANCH_PREFIX = 'sandcastle-pipeline/'

/**
 * H10 r5：skill bundle 在容器私有 writable layer 中的固定目录。ports.ts 先核验 host CAS，再起一个
 * 没有 CAS bind mount 的容器，用 docker cp 把快照复制到此处，最后以 root 递归去掉写位。入口脚本
 * 在 agent 启动前直接复核此目录，env 与 prompt 始终引用同一路径。固定目录不随 run 变化；其中字节
 * 属于每个容器自己的私有层，host 后续修改 CAS 无法影响运行中的 agent。
 */
export const SKILL_BUNDLE_CONTAINER_DIR = '/opt/pipeline-run/skill-bundle'
export const PIPELINE_AUTOMATION_POLICY_ENV = 'PIPELINE_AUTOMATION_POLICY_B64'
export const PIPELINE_ATTEMPT_CONTEXT_B64_ENV = 'PIPELINE_ATTEMPT_CONTEXT_B64'
export const PIPELINE_WORKFLOW_STEP_PROMPT_B64_ENV = 'PIPELINE_WORKFLOW_STEP_PROMPT_B64'

/** 沙箱句柄注入面（exec + env 可见 + close 杀容器 + containerName 供运行期写回 automation_sandbox）。 */
export interface SandboxHandle {
  readonly env: Record<string, string>
  /** 真容器名（container.ts::createDockerSandbox 生成的 sandcastle-<random>），供写回 automation_sandbox 字段。 */
  readonly containerName: string
  exec(cmd: string, options?: { onLine?: (line: string) => void }): Promise<{ stdout: string; stderr: string; exitCode: number }>
  close(): Promise<void>
}

/** worktree 注入面（per-change 命名分支 worktree 的 create/remove/取消标记探测）。 */
export interface WorktreePort {
  create(repoDir: string, branch: string): Promise<{ path: string; branch: string }>
  remove(path: string): Promise<void>
  /**
   * worktree 根目录下是否有 dashboard 落的取消标记（afk-workbench Task 3；真实现 + 文件名常量见
   * worktree.ts::hasCancelMarker / CANCEL_MARKER_FILE）。runChangeInSandbox 结算时用它探测
   * "这次 runWork 的返回/非零退出是不是被 Task 4 的 docker kill 造成的"，从而抛 CancelledRunError
   * 而不是让普通 Error 落进 classify 的 retry 分支被自动重新排队。
   */
  hasCancelMarker(path: string): Promise<boolean>
}

/**
 * 沙箱内 pipeline 驱动（production 绑 ports.ts::createLifecyclePorts 的真实现，返回结构化握手）。
 *
 * 历史注记（afk-workbench Task 2 → teardown 现场缺口修复，见
 * `.superpowers/sdd/task-2-report.md` "Fix: log survives teardown"）：Task 2 曾在这里加过第 3 个
 * `worktreePath` 参数，为了让真实现（ports.ts）把结算日志落盘到 worktree 内
 * `.sandcastle-run.log`。Task 2 自己的实测（真 docker 跑通一个成功 run）随后发现：这个位置在
 * **成功**和**普通（非 tagged）失败**这两类最常见结算下，会在 `runWork` 返回后、
 * `runChangeInSandbox` 的 finally 块里被 `worktree.remove` 立即删掉——日志刚写完就随 worktree
 * 一起消失，只有 abort/conflict 保留现场那一类才读得到。真实现现已改写到 host 侧
 * `openspec/changes/<name>/.sandcastle-run.log`（由 hostRepoDir + name 派生，
 * createLifecyclePorts 的 hostRepoDir 闭包已有，每次调用都传 name，不需要额外状态），故不再
 * 需要 worktreePath，这个参数原样撤回——不留一个真实现不再使用的死参数。
 */
export type RunWork = (
  exec: SandboxHandle['exec'],
  name: string,
  signal: AbortSignal,
  /** v5 T20：loop 声明的 runner（'codex' → 真实现在命令构造点注入 PIPELINE_RUNNER=codex；
   * 缺省走 codex，'claude-code' 仅显式兼容，其余值 fail-loud）。可选参数保留 fake API 兼容。 */
  runner?: string,
) => Promise<SandboxReport>

/** 生命周期全部注入 port（真 docker/git/worktree 走 #29c 生产接线）。 */
export interface LifecyclePorts {
  readonly worktree: WorktreePort
  createSandbox(opts: {
    env: Record<string, string>
    worktreePath: string
    /** 真实 Docker 边界再次校验/过滤；缺席仅供旧直调兼容并按 Codex-first 解释。 */
    runner?: string
    /**
     * H10 §4/§8任务6：本次 run 绑定的 skill bundle 快照事实（= PreparedExecutionContext.
     * skillBundle，见 runChangeInSandbox 下方对 cfg.context 的读取）。缺席 = 无 bundle 绑定
     * （none-bundle 直通/非 loop AFK 直跑）——真实现（ports.ts）不做 hash 校验或复制，行为与
     * 本字段引入前完全一致。真持有值时，真实现先核验 host CAS，再起无 CAS mount 的容器，docker cp
     * 到 SKILL_BUNDLE_CONTAINER_DIR 并 root seal；复制/封存失败会关闭容器并 fail-closed。
     */
    skillBundle?: PreparedSkillBundle
  }): Promise<SandboxHandle>
  runWork: RunWork
  /** 收集命名分支相对 base 的 commits（FIFO；last = build HEAD）。 */
  collectCommits(input: { worktreePath: string; branch: string; base: string }): Promise<{ sha: string }[]>
  /**
   * 本次 run 触碰的文件清单（git diff --name-only <base>...<branch>，决议 #12 denylist 结算检查用）。
   * 仅 cfg.denylist 非空且有 commit 时才调；出错 → []（同 collectCommits 的容错口径，见 mergeback.ts）。
   */
  diffNames(input: { worktreePath: string; branch: string; base: string }): Promise<string[]>
  /**
   * 把命名分支 merge 回 host base（仅 autoMerge=L3 时调）。expectedBaseSha（G②）= 冻结时读到的 base ref
   * SHA：mergeBackToBase 持 host merge 锁内用它做 base-SHA CAS（不只 branch 名），base 被第三方推进 →
   * 拒 merge、fail-loud（SyncError 留现场），绝不静默把已验证过旧 base 的产物合进新 base。
   */
  mergeToBase(input: {
    worktreePath: string; branch: string; base: string; expectedBaseSha?: string; expectedBranchSha?: string
    onIntent?: (draft: MergeIntentDraft) => Promise<void>
    onLanded?: (receipt: MergeBackReceipt) => Promise<void>
  }): Promise<MergeBackReceipt | void>
  readonly git: GitFace
  /**
   * 运行期写回单个 automation_* 字段（name=change 名，非路径；同 scheduler.ts::StateWriter.setField
   * 同款签名/语义——沿用既有约定，非新发明。真实现由 ports.ts 生产装配层适配注入的写入依赖，
   * 未注入时 no-op）。容器/worktree 创建成功后写 automation_sandbox/automation_worktree（下游
   * 取消/详情要用这两个字段定位容器/worktree）。
   */
  setStateField(name: string, field: string, value: string): Promise<void>
  /**
   * H7 verifier Phase 2：host 侧核验产生面。runChangeInSandbox 在 merge 判断块之前、barrier 派生权威
   * build_sha 之后调用（真有构建时——no-op 跳过）。生产装配缺省 createDefaultVerifierPort()（诚实回
   * inconclusive，见 verifier.ts）；真实核验能力由调用方注入替换。
   */
  readonly verifier: VerifierPort
  /**
   * 完整 issuer identity 装配锚（可选）：host-verifier 登记 verifier/version，human-review 登记
   * actor_id，sandbox-report 登记 runner。缺席时只回退到 createDefaultVerifierPort() 的固定 identity；
   * 自定义 verifier 必须显式登记，否则同为 host kind 也会 fail-closed 成 sentinel。
   */
  readonly verifierExpectedIssuerIdentity?: VerificationIssuerIdentity
  /** @deprecated kind-only 不能判定 issuer 身份；仅保留接口兼容，不参与 boundary 授权。 */
  readonly verifierExpectedIssuerKind?: VerificationIssuer['kind']
}

export interface RunChangeConfig {
  readonly hostRepoDir: string
  readonly name: string
  /** host 当前 base 分支（命名分支从它 fork、merge 回它）。 */
  readonly base: string
  /** 合成 non-loop context 的唯一时钟来源；生产由 scheduler/CLI 同一 clock 注入。 */
  readonly clock?: () => string
  readonly mergeJournal?: {
    recordMergeIntent(input: {
      draft: MergeIntentDraft; context: PreparedExecutionContext; verification?: RunOutcome['verification']
      verifyResult: RunOutcome['verifyResult']; buildSha?: string; branch: string; commits: readonly Readonly<{ sha: string }>[]
    }): Promise<string>
    recordMergeLanded(input: { intentRecordId: string; receipt: MergeBackReceipt; context: PreparedExecutionContext }): Promise<void>
  }
  /** H6：runWork 返回可信 provider usage 后立即落 durable ledger，先于后续核验/merge。 */
  readonly usageJournal?: {
    recordProviderUsage(input: {
      context: PreparedExecutionContext
      usage: NonNullable<SandboxReport['provider_usage']>
    }): Promise<void>
  }
  /** true 时缺少 mergeJournal 会在 update-ref 前 fail-closed；生产 Docker L3 恒 true。 */
  readonly requireMergeJournal?: boolean
  /**
   * H7 verifier Phase 2：调用方（dockerRunChange.ts）真实持有的 ExecutionContext，透传给
   * VerifierPort.verify() 的 subject 字段（attempt_id/change/workflow_run_id）。未传（大量既有单测
   * 直接构造 cfg，不关心 verifier subject 精确性）→ 由 cfg.name/cfg.runner/cfg.autoMerge 派生一个
   * 最小合成 context，只保证类型满足与调用不炸，不冒充真实 admission 归属——`policy_epoch`/
   * `skill_bundle_id` 同理诚实留空（''/null）：这条合成路径从未走 admission.reserve()，没有真实
   * 治理 epoch 或 loop 归属可言（见 execution-context.ts 头注「非 loop 的 AFK 直跑」）。
   *
   * H10：字段类型收窄为带 brand 的 `PreparedExecutionContext` 判别联合。本层只在
   * `preparedKind==='loop-bundle'` 分支取必填 skillBundle，并据此决定是否校验/复制/注入元数据 env。
   * 未传字段走显式 non-loop prepared 分支，不校验、不复制、不注入。
   */
  readonly context?: PreparedExecutionContext
  /**
   * H7 verifier Phase 2 · custom workflow 坐标（可选注入面；H7 复审阻断5 核验结论）：调用方若真持有
   * compiled custom workflow 的稳定坐标（workflow_digest + workflow 名 + 当前 step，来源应是 G1/G2
   * workflow-run state——kernel/state/workflow-run-repository.ts 一类），经本字段注入，
   * runChangeInSandbox 据此构造 workflow-transition binding（event 仍取沙箱握手 report.phase_event，
   * 同 default 轨）。未传（本包当前没有任何生产调用点持有这份坐标——见 verifier.ts 顶注核验记录）→
   * 落 default-transition（现状不变；fail-closed：绝不伪造 digest/step 冒充精确坐标）。
   */
  readonly workflowCoordinate?: { readonly workflow_digest: string; readonly workflow: string; readonly step: string }
  /**
   * H7-S2 custom fail-closed（可选；生产装配 H7-S3 恒显式传，本字段先行接线）：调用方声明这次 run
   * 归属 'default' workflow 还是 'custom' workflow。'custom' → mergeGate 要求 canonical.binding.kind
   * 必须是 workflow-transition（真实坐标已解析），否则 fail-closed 落 paused/verification-binding-
   * unresolved——即便其余核验都 trusted+passed+subject 相符，也不得让"坐标从未真正接线"的 custom
   * workflow 冒充"已核验通过"去物理 merge。未传（存量单测/未升级调用点）= 'default' 语义（不加此
   * 限制，行为不变）。
   */
  readonly workflowKind?: 'default' | 'custom'
  /** admission 冻结的当前 custom StepIR.prompt；仅以 base64url env 送入容器，由入口脚本作为数据解码。 */
  readonly workflowStepPrompt?: string
  /** L3 → true（自动 merge 回主线）；L1/L2 report-only → false（不自动合并，安全默认）。 */
  readonly autoMerge: boolean
  /**
   * 额外注入沙箱的 env。普通代理/业务键原样透传，同 runner 凭证允许透传；对侧 runner 的
   * 凭证在 lifecycle 与真实 Docker port 两层剔除。PIPELINE_AFK_ENV 放最后，不能被覆盖。
   */
  readonly extraEnv?: Readonly<Record<string, string>>
  /**
   * loop denylist 路径 glob（决议 #12，由调用方按 change_prefix 归属从 loops registry 派生——见
   * denylist.ts::denylistForChange / dockerRunChange.ts::resolveDenylist）。非空时 run 结算对
   * git diff --name-only 匹配：命中 = 违规 → DenylistViolationError（conflict、保留现场、不 merge）。
   * 空/未传 = 无 loop 语境 → 跳过检查（零 diff 开销）。
   */
  readonly denylist?: readonly string[]
  /**
   * L3 自动合并的路径白名单。生产装配恒显式传（空数组 = 零路径获准）；undefined 只保留给未经过
   * loop admission 的历史直调。L1/L2 不自动合并，故不以 allowlist 拒绝其报告产出。
   */
  readonly allowlist?: readonly string[]
  /**
   * v5 T20：loop 声明的 runner（GOAL H · Stage B 后由 ExecutionContext.runner 权威派生——见
   * dockerRunChange.ts 用 context.runner）。'codex' → runWork 真实现起 codex exec 无头会话；
   * 缺省/未传 → codex；'claude-code' 仅显式兼容；其余历史值（cron 等）在命令边界 fail-loud。
   */
  readonly runner?: string
  /**
   * GOAL H · Stage C kill-switch 接缝③（L3 merge 前重查）：merge 回主线**之前**调一次，返回
   * false（loop 已被停用）→ **跳过 merge**、置 RunOutcome.killSwitched（scheduler 据此强落 paused，
   * 不写 merged）。由调用方绑定 admission.isActive(context.loop_id)（见 dockerRunChange.ts::checkActive）。
   * 未传 / 非 L3（autoMerge=false）→ 不查（零开销，行为不变）。best-effort：checkActive 自身 throw
   * 视为「不确定 → 保守跳过 merge」（宁可不自动合并，也不在停用疑云下 merge 回主线）。
   */
  readonly checkActive?: () => Promise<boolean>
  /**
   * Stage B 返工 #3 docker 启动许可（可选，loop_id 已由 createDockerRunChange 绑定）：governance 锁内
   * 现读 active → 执行 docker create/start（fn）→ 释放锁（**容器运行期不持锁**）。loop 已 paused →
   * 抛 LoopNotActiveError（_tag），lifecycle 据此不启动容器、返回 killSwitched no-op（scheduler 落 paused）。
   * 未传 → 不加许可（行为不变）。
   */
  readonly withStartPermit?: <T>(fn: () => Promise<T>) => Promise<T>
  /**
   * Stage B 返工 #3 merge 许可（可选，loop_id 已绑定）：governance 锁内现读 active + base ref CAS →
   * 执行 mergeToBase（fn，持锁到 ref 更新完成）→ 释放锁。两类信号语义不同、处置不同（G② 子问题1，绝不
   * 共用成功退出路径）：
   *   · paused（LoopNotActiveError）→ 跳过 merge、置 killSwitched（正常落 paused，停给人工复核）。
   *   · base 被推进（BaseRefCasError）→ **fail-loud**：lifecycle 转 BaseAdvancedError（留现场 + scheduler 据
   *     baseAdvanced 记 round failure 使 ok=false），**绝不 killSwitched 吞成功**（对照下方 withMergePermit catch 分流实现）。
   * 未传 → 退回 checkActive 非原子预检。
   *
   * G②：verifyBase 由 lifecycle 按「冻结时 base ref SHA」构造，permit 持 governance 锁内、merge 前调——
   * expected-old-SHA CAS 校验 base 未被第三方推进（返 false → permit 抛 BaseRefCasError → 不 merge、fail-loud）。
   */
  readonly withMergePermit?: <T>(fn: () => Promise<T>, verifyBase: () => Promise<boolean>) => Promise<T>
}

/**
 * abort（kanban "停止" / 单 change SIGTERM）时抛（老仓 AbortedRunError）：与其它失败不同，
 * per-change worktree **不 remove**——保留供人工接管。reason 原样透传（不包裹）。
 */
export class AbortedRunError extends Error {
  override readonly name = 'AbortedRunError'
  readonly _tag = 'AbortedRunError'
  readonly reason: unknown
  readonly preservedPath: string
  constructor(reason: unknown, preservedPath: string) {
    // AbortSignal.reason 是外部边界值，可能是 getter/getPrototypeOf/toPrimitive 全部抛错的 Proxy。
    // 无论诊断值多敌意，取消语义都必须保留为本地可信 AbortedRunError，绝不能让格式化异常
    // 遮蔽 tag 后落入 scheduler retry。
    super(typeof reason === 'string' ? reason : safeErrorMessage(reason))
    this.reason = reason
    this.preservedPath = preservedPath
  }
}

/**
 * dashboard 取消（afk-workbench Task 3；Task 4：docker kill 容器前，dashboard 往 worktree 根落
 * CANCEL_MARKER_FILE）结算时抛：本进程里跑这次 run 的 AbortController 从未被 abort 过——触发 kill
 * 的是另一个常驻 dashboard server 进程，两者没有 IPC（研究已确认），`runWork` 结算后只能看到 exec
 * 非零退出这一个信号。若不主动识别，会被普通 Error 兜底，走 classify 的 retry 分支自动重新排队——
 * "用户点了取消，几秒后它自己又开始跑了"这种违反直觉的行为。
 *
 * 语义上与 AbortedRunError 同类（人为主动停止，绝不当瞬态失败重试），抄它的形状：preservedPath
 * 结构化直传（PRESERVE_ERROR_TAGS 必须同步收录这个 tag，否则下面 finally 块仍会清掉 worktree，
 * "保留现场"就是一句空话）。
 */
export class CancelledRunError extends Error {
  override readonly name = 'CancelledRunError'
  readonly _tag = 'CancelledRunError'
  readonly preservedPath: string
  constructor(reason: string, preservedPath: string) {
    super(reason)
    this.preservedPath = preservedPath
  }
}

/**
 * G² 子问题1：merge 前 governance verifyBase 的 base ref expected-old-SHA CAS 失败（base 被 human commit /
 * update-ref / 其它 git 客户端在 permit 外推进到别的 SHA）时，lifecycle 把 permit 抛的 BaseRefCasError 转成
 * 本错误。语义 = base 冲突故障（**不是** loop 被停用的 kill-switch），故与 LoopNotActiveError 分流处置：
 *   · _tag='SyncError' → classify 归 conflict + 留现场（复用既有 merge-back 冲突路由，classify 侧零改）。
 *   · baseAdvanced=true → scheduler 除 settle 为 conflict 外，另记一条 round failure 使 ok=false（fail-loud：
 *     CLI 非零、不打印跑完一轮）——区别于普通 content-conflict SyncError（那类是正常 settle、round 仍 ok）。
 *   · preservedWorktreePath → 命名分支 + worktree 现场不删，供人工复核/重试。
 * 绝不再当 killSwitched 成功吞掉（旧行为：worktree 被删、round 假 ok=true、CLI 打印跑完一轮返 0）。
 */
export class BaseAdvancedError extends Error {
  override readonly name = 'BaseAdvancedError'
  readonly _tag = 'SyncError'
  readonly baseAdvanced = true
  readonly preservedWorktreePath: string
  constructor(message: string, preservedWorktreePath: string) {
    super(message)
    this.preservedWorktreePath = preservedWorktreePath
  }
}

/**
 * 冲突/漂移类错误的 tag（BACKLOG #29c 现场保留补强）：merge-back 冲突（SyncError）/ merge 超时
 * （MergeToHostTimeoutError）/ build_sha 漂移（BarrierDriftError）/ worktree 失败（WorktreeError）/
 * dashboard 取消（CancelledRunError，afk-workbench Task 3）
 * → **保留 worktree 现场**（不 remove），供人工在 dashboard 接管（DESIGN §7-item4「失败/冲突绝不清沙箱」）。
 * #29 仅在 abort 时保留现场；真 merge-back 引入真冲突后，conflict 类错误也必须保留（否则 preserved_path
 * 指向已删目录）。retry 类错误（瞬态/verify-fail）仍照清 worktree（下轮重建，不误留现场）。
 */
const PRESERVE_ERROR_TAGS = new Set([
  'SyncError',
  'MergeToHostTimeoutError',
  'BarrierDriftError',
  'WorktreeError',
  'CancelledRunError',
  // 决议 #12：denylist 违规同 conflict 类——留现场供人工核对越界产出，绝不自动重试/merge。
  'DenylistViolationError',
  'AllowlistViolationError',
])
const isPreserveError = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && PRESERVE_ERROR_TAGS.has((err as { _tag?: string })._tag ?? '')

function safeErrorMessage(error: unknown): string {
  try {
    if (error instanceof Error && typeof error.message === 'string') return error.message
  } catch {
    // Proxy 可以在 instanceof/getPrototypeOf 或 message 读取时抛错；诊断格式化不能遮蔽清理故障。
  }
  try {
    return String(error)
  } catch {
    return 'unreadable error value'
  }
}

/** close() 违反契约抛普通值时也归一成可信、不可变的容器清理故障，并携带必须保留的 worktree。 */
class LifecycleContainerCleanupError extends Error {
  override readonly name = 'ContainerCleanupError'
  readonly _tag = 'ContainerCleanupError'
  readonly cleanupError: unknown
  readonly preservedWorktreePath: string
  constructor(readonly containerName: string, cleanupError: unknown, preservedWorktreePath: string) {
    super(`sandbox cleanup failed for ${containerName}: ${safeErrorMessage(cleanupError)}`)
    this.cleanupError = cleanupError
    this.preservedWorktreePath = preservedWorktreePath
    ;(this as Error & { cause?: unknown }).cause = cleanupError
    Object.freeze(this)
  }
}

/**
 * 主流程与容器清理同时失败时的唯一出口。任意业务错误都可能是 Proxy，不能依赖其 descriptor、
 * 可扩展性或普通属性读取来证明诊断已写入；因此永远创建本类并冻结，cause/primaryError 保留原值。
 */
class RunAndCleanupError extends Error {
  override readonly name = 'RunAndCleanupError'
  readonly _tag = 'RunAndCleanupError'
  readonly primaryError: unknown
  readonly cleanupError: LifecycleContainerCleanupError
  readonly preservedWorktreePath: string
  constructor(primaryError: unknown, cleanupError: LifecycleContainerCleanupError, preservedWorktreePath: string) {
    super(`${safeErrorMessage(primaryError)}; cleanup failed: ${cleanupError.message}`)
    this.primaryError = primaryError
    this.cleanupError = cleanupError
    this.preservedWorktreePath = preservedWorktreePath
    ;(this as Error & { cause?: unknown }).cause = primaryError
    Object.freeze(this)
  }
}

/**
 * governance permit 抛出的两类信号——语义不同、处置不同（G² 子问题1 分流，绝不再共用同一成功退出路径）：
 *   · LoopNotActiveError（loop 被停用 / kill-switch）→ killSwitched 跳过启动/merge、正常落 paused（停给人工）。
 *   · BaseRefCasError（merge 前 base ref 被第三方推进，expected-old-SHA CAS 失败）→ fail-loud：转
 *     BaseAdvancedError（留现场 + scheduler 据 baseAdvanced 记 round failure 使 ok=false），绝不当成功吞掉。
 * 两者都绝不落进 classify 的瞬态 retry 分支（人为停用 / base 冲突都不是「下一轮重试能自愈」的瞬态失败）。 */
const tagOf = (err: unknown): string =>
  (typeof err === 'object' && err !== null ? (err as { _tag?: string })._tag : undefined) ?? ''
const isLoopNotActive = (err: unknown): boolean => tagOf(err) === 'LoopNotActiveError'
const isBaseRefCas = (err: unknown): boolean => tagOf(err) === 'BaseRefCasError'

/** 给 RunOutcome 打诚实化标志：buildSha 缺失（零 commit / 跑空）→ noop:true，即便 verify pass。
 *  killSwitched：L3 merge 前重查到 loop 停用 → 跳过 merge（scheduler 据此强落 paused）。 */
const finalizeRunOutcome = (o: Omit<RunOutcome, 'noop' | 'killSwitched'>, killSwitched = false): RunOutcome => {
  const outcome: RunOutcome = Object.freeze({
    ...o,
    commits: Object.freeze(o.commits.map((commit) => Object.freeze({ ...commit }))),
    noop: !o.buildSha,
    killSwitched,
  })
  return certifyLifecycleOutcome(outcome)
}

/**
 * [AGENT_EXIT] 标记行格式（观察项③/决议 #14②）：沙箱脚本（tools/sandcastle/pipeline-afk-run.sh）
 * codex 分支在 agent 非零退出（认证失效 / codex 自身报错）时向 stdout 回放
 * `[AGENT_EXIT] codex <exit>`——此前该失败只写进 worktree 内 agent 日志，脚本继续确定性兜底
 * commit 且 0 退出，host 侧完全不可见。行尾容忍空白/\r（同 TRANSITION_LINE_RE 口径）。
 */
const AGENT_EXIT_LINE_RE = /^\[AGENT_EXIT\] (\S+) (\d+)\s*$/

/**
 * agent 非零退出观察器（装配风格对齐 createPhaseWatch：独立 create 函数 + 注入 write 面；无需
 * settle/限流链且属 lifecycle 编排私有检出点，直接内联本文件而非新起模块）。检出标记行且
 * exit≠0 → 写一条**固定模板**消息（模板 + exit 码，不含任何日志正文/凭证值——凭证红线；长度
 * 远小于 scheduler::sanitize 的 200 字符截断口径）。幂等只写一次（防日志重复回放行）；
 * best-effort（.catch 吞错，同 setStateField 既有风格），写失败绝不拖垮 run。
 *
 * run 成败判定不变（脚本兜底 commit + 0 退出原样）：scheduler 成功路 writeBackSuccess **不清**
 * automation_last_error → 成功 settle 后该消息仍可见——正是「run 仍成功、错误可见」的目标语义。
 */
const createAgentExitWatch = (write: (value: string) => Promise<void>): { onLine(line: string): void; settle(): Promise<void> } => {
  let wrote = false
  let pending: Promise<void> = Promise.resolve()
  return {
    onLine(line) {
      if (wrote) return
      const m = AGENT_EXIT_LINE_RE.exec(line)
      if (!m || Number(m[2]) === 0) return
      wrote = true
      const runner = m[1]!
      pending = write(`${runner} agent 非零退出（exit ${m[2]!}）：可能凭证失效或 ${runner} 自身报错，详见 agent 日志`).catch(() => {
        // best-effort：字段写失败吞掉（同 lifecycle 其它 setStateField 的 .catch(() => {}) 风格）
      })
    },
    /** 排空在途写（codex P2）：run 结算(finally)时 await——观察写严格先于 scheduler 终态分类落地，
     *  防延迟的 agent-exit 双字段写倒序覆盖 applyFailure 已落的权威成因(verify-fail/conflict)。 */
    async settle() {
      await pending
    },
  }
}

/**
 * 跑一个 change 端到端（沙箱生命周期编排）。返回 RunOutcome 或抛 tagged error（scheduler 据 tag 分类）。
 */
export const runChangeInSandbox = async (ports: LifecyclePorts, cfg: RunChangeConfig, signal: AbortSignal): Promise<RunOutcome> => {
  const branch = `${NAMED_BRANCH_PREFIX}${cfg.name}`
  // H7-S2：executionContext/workflowRunId 只依赖 cfg，与 barrier/commits 无关——提到函数顶层，供
  // verifier 产生点（barrier 派生后，见下方）与本层自己的 mergeGate 判定（同样在 barrier 派生后，
  // 但在另一个不共享块作用域的位置）共用同一份数据源，两处 expectedSubject 结构上不可能对不齐。
  // H10 r1 阻断3/D5 返工（任务B1）：合成兜底 context 从未走 admission.reserve()/prepareSkillBundle，
  // 没有真实治理 epoch/loop 归属，也没有 bundle 可携带——经 markNonLoopPrepared() 产出判别联合的
  // NonLoopExecutionContext 分支（唯一合法构造点，见 execution-context.ts 头注），不再手写字面量
  // 冒充满足 PreparedExecutionContext（H10 r1 复审阻断3：裸字面量按结构类型曾经天然满足接口）。
  const executionContext: PreparedExecutionContext = cfg.context ?? markNonLoopPrepared({
    attempt_id: cfg.name, reservation_id: cfg.name, loop_id: cfg.name, change: cfg.name,
    level: cfg.autoMerge ? 'L3' : 'L1', runner: cfg.runner ?? 'codex',
    admitted_at: (cfg.clock ?? (() => new Date().toISOString()))(),
    reservation: { runs: 1, tokens: 0, token_basis: 'risk-default' },
    // policy_epoch 留该字段类型（string）允许的诚实空值，skill_bundle_id 留 null（诚实表达「本次
    // 执行无 bundle 绑定」，见 execution-context.ts 头注），绝不瞎编冒充真实值。
    policy_epoch: '',
    skill_bundle_id: null,
  })
  // H5 policy snapshot is authoritative when present. Legacy/non-loop L3 still requires an explicitly
  // resolved allowlist; undefined must never silently mean allow-all.
  if (cfg.autoMerge && executionContext.automation_policy === undefined && cfg.allowlist === undefined) {
    throw new PathPolicyUnconfiguredError()
  }
  // 必须早于 worktree.create / createSandbox：未知 runner 不能先产生宿主或 Docker 副作用再在命令层报错。
  // context 是权威来源；合成 non-loop context 已把缺省归一为 codex。
  const runner = assertLoopRunner(executionContext.runner ?? 'codex')
  const workflowRunId = executionContext.workflow_run_id ?? executionContext.attempt_id
  // H7-S2 custom fail-closed：custom workflow（cfg.workflowKind==='custom'）要求 merge 授权必须落在
  // 真实 workflow-transition binding 上；未传 cfg.workflowKind（存量单测/未升级调用点）视为 'default'
  // 语义（不加限制，行为不变）——生产装配（H7-S3）恒显式传，不依赖本兜底。
  const requireWorkflowBinding = cfg.workflowKind === 'custom'
  const wt = await ports.worktree.create(cfg.hostRepoDir, branch)
  const worktreePath = wt.path

  let handle: SandboxHandle | undefined
  // #29c：conflict 类错误保留现场（不清 worktree）；见 PRESERVE_ERROR_TAGS。
  let preserve = false
  // H14 r3：finally 里的 close 失败若与主错误并发，必须把清理诊断挂在主错误上而不是覆盖/吞掉。
  let hasPrimaryError = false
  let primaryError: unknown
  // T4（决策 G）：沙箱日志 [TRANSITION] 行 → automation_current_phase 运行期回写（值变才写，限流
  // 防 SSE 指纹风暴）；run 结算（成功/失败/取消一切路径的 finally）清空。写回 best-effort（.catch
  // 同 setStateField 既有风格），字段写失败绝不拖垮 run。
  const phaseWatch = createPhaseWatch(cfg.name, (value) =>
    ports.setStateField(cfg.name, 'automation_current_phase', value),
  )
  // 观察项③：[AGENT_EXIT] 标记行 → automation_last_error 同步落（幂等一次、best-effort，见
  // createAgentExitWatch）。settle 只**排空在途写**不清字段——错误消息本就要在 run 结算后留存可见。
  // F-b：cause=agent-exit 与 last_error 同写（诚实 tag：它只知道 agent 非零退出，不猜凭证失效）；
  // 若 run 随后真失败，scheduler applyFailure 会按最终失败 tag 整体覆盖两字段。排空保证观察写严格
  // 先于结算落地（codex P2）——否则延迟写会倒序覆盖 applyFailure 的权威终态成因,dashboard 显陈旧诊断。
  const agentExitWatch = createAgentExitWatch(async (value) => {
    await ports.setStateField(cfg.name, 'automation_last_error', value)
    await ports.setStateField(cfg.name, 'automation_cause', 'agent-exit')
  })
  try {
    // H10 §4/§8任务6：skillBundle 缺席（none-bundle 直通/非 loop AFK 直跑）→ 不追加任何元数据键，
    // env 与本字段引入前逐字节相同；有值时只注入三条小型元数据（容器内固定目录/聚合 hash/profile
    // id），绝不把 skill 正文放进 env（正文由 ports.createSandbox 经 docker cp 放进容器私有目录，
    // 设计定稿 §4「否决把全文放进 environment」）。
    //
    // H10 r1 阻断3/D5 返工（任务B1）：`executionContext` 现是判别联合，`skillBundle` 只存在于
    // `preparedKind==='loop-bundle'` 分支——显式判别窄化（不能再靠 `?.` 悄悄放过 non-loop 分支）。
    const skillBundle = executionContext.preparedKind === 'loop-bundle' ? executionContext.skillBundle : undefined
    const skillBundleEnv: Record<string, string> = skillBundle
      ? {
          PIPELINE_SKILL_BUNDLE_DIR: SKILL_BUNDLE_CONTAINER_DIR,
          PIPELINE_SKILL_BUNDLE_SHA256: skillBundle.snapshotSha256,
          // skillBundle 存在时 skill_bundle_id 理应恒为非空 profile 字符串（prepareSkillBundle 只在
          // ctx.skill_bundle_id 有值时才产出 skillBundle，见 execution-context.ts/loop-admission.ts
          // 头注）；`?? ''` 只是防御性兜底，不掩盖上游不变量被打破时的诊断（诚实空串而非编造值）。
          PIPELINE_SKILL_BUNDLE_ID: executionContext.skill_bundle_id ?? '',
        }
      : {}
    const automationPolicyEnv: Record<string, string> = executionContext.automation_policy === undefined
      ? {}
      : {
          [PIPELINE_AUTOMATION_POLICY_ENV]: Buffer.from(
            JSON.stringify(executionContext.automation_policy), 'utf8',
          ).toString('base64url'),
        }
    const attemptContextEnv: Record<string, string> = executionContext.attempt_context === undefined
      ? {}
      : {
          [PIPELINE_ATTEMPT_CONTEXT_B64_ENV]: Buffer.from(
            JSON.stringify(executionContext.attempt_context), 'utf8',
          ).toString('base64url'),
        }
    const workflowStepPromptEnv: Record<string, string> = cfg.workflowStepPrompt === undefined
      ? {}
      : {
          [PIPELINE_WORKFLOW_STEP_PROMPT_B64_ENV]: Buffer.from(cfg.workflowStepPrompt, 'utf8').toString('base64url'),
        }
    // 沙箱 env 注入 PIPELINE_AFK=1 + runner-scoped extraEnv + skill bundle 元数据。硬护栏与冻结事实
    // 放后，调用方不能覆盖；真实 Docker port 会用同一纯函数再过滤一次，封住公共 port 直调旁路。
    const env: Record<string, string> = {
      ...filterRunnerEnvironment(runner, cfg.extraEnv),
      ...skillBundleEnv,
      ...automationPolicyEnv,
      ...attemptContextEnv,
      ...workflowStepPromptEnv,
      [PIPELINE_AFK_ENV]: '1',
    }
    // Stage B 返工 #3：docker create/start 置于 start permit（governance 锁内现读 active → 启动）。loop 在
    // 这一刻已 paused → LoopNotActiveError → 不启动容器，返回 killSwitched no-op（finally 清 worktree）。
    // 许可只覆盖 createSandbox（docker create/start），返回即释放锁——容器运行期不持锁。
    const runStartPermit = cfg.withStartPermit ?? (<T>(fn: () => Promise<T>): Promise<T> => fn())
    let sandbox: SandboxHandle
    try {
      sandbox = await runStartPermit(() => ports.createSandbox({ env, worktreePath, skillBundle, runner }))
    } catch (permitErr) {
      // start permit 只在 loop 此刻已 paused 时抛 LoopNotActiveError（base-SHA CAS 是 merge 期专属，启动期
      // 不涉及）→ 不启动容器、返回 killSwitched no-op（scheduler 落 paused）。其余异常 fail-loud 原样抛。
      if (isLoopNotActive(permitErr)) {
        return finalizeRunOutcome({ commits: [], verifyResult: 'pass', phaseEvent: 'build-complete', requireWorkflowBinding }, true)
      }
      throw permitErr
    }
    handle = sandbox

    // 容器/worktree 都真创建成功 → 真写回 automation_sandbox/automation_worktree（runWork 前，
    // 抄 scheduler.ts 写 automation_last_error/automation_preserved_path 的既有模式）。
    // B9 best-effort（.catch 同 phaseWatch/agentExitWatch/handle.close/worktree.remove 既有风格）：
    // 这两个字段只是给 dashboard 定位容器/worktree，store 瞬态抖动写失败绝不能把本可继续的成功 run
    // 拖进 catch 判死重来。
    await ports.setStateField(cfg.name, 'automation_sandbox', sandbox.containerName).catch(() => {})
    await ports.setStateField(cfg.name, 'automation_worktree', worktreePath).catch(() => {})

    // exec 包装层 tee 日志行给 phaseWatch（[TRANSITION] 检出点）+ agentExitWatch（[AGENT_EXIT]
    // 检出点，观察项③）——runWork 自己的 onLine（race idle 检测）原样续传，互不挤占。
    const report = await ports.runWork(
      (cmd, options) =>
        sandbox.exec(cmd, {
          ...options,
          onLine: (line) => {
            phaseWatch.onLine(line)
            agentExitWatch.onLine(line)
            options?.onLine?.(line)
          },
        }),
      cfg.name,
      signal,
      runner, // 已在任何 worktree/Docker 副作用前闭集校验；合成入口 Codex-first。
    )
    if (report.provider_usage !== undefined) {
      if (cfg.usageJournal === undefined) {
        throw new Error('provider usage journal is not configured; refusing to lose trusted usage')
      }
      await cfg.usageJournal.recordProviderUsage({ context: executionContext, usage: report.provider_usage })
    }

    // dashboard 取消（afk-workbench Task 3）：本进程的 signal 从没被 abort 过（触发 kill 的是另一个
    // 常驻进程），只能靠标记文件判断——必须先于下面的 signal.aborted 检查（这条路径上 signal.aborted
    // 永远是 false，顺序反了就永远走不到这里）。
    if (await ports.worktree.hasCancelMarker(worktreePath)) {
      throw new CancelledRunError('cancel requested via dashboard', worktreePath)
    }

    // abort 检查（老仓在每轮前后查 signal.aborted）：转 catch 走 preserve 现场。
    if (signal.aborted) throw new AbortedRunError(signal.reason, worktreePath)

    // G②：冻结「当时 base ref SHA」作 expected——commits/diff/barrier 都相对此 base 收集。merge permit
    // 持锁内 CAS 校验 base 未被第三方推进（变了则拒 merge、fail-loud）；mergeBackToBase 亦据此二次校验。
    // 与 barrier 派生同为 ports.git.revParse（git 不健康时此处与 barrier 一并 throw，行为一致，不新增故障面）。
    const expectedBaseSha = await ports.git.revParse(cfg.base)
    const commits = await ports.collectCommits({ worktreePath, branch: wt.branch, base: cfg.base })

    // 决议 #12：run 结算 denylist 检查——loop 语境（denylist 非空）且真有产出（commits 非空）时，
    // git diff --name-only 对 denylist glob 匹配；命中 = 违规 → conflict 保留现场，且必须先于
    // mergeToBase（违规产出绝不允许 L3 自动 merge 回主线）。无 loop 语境跳过（零 diff 开销）。
    const denylist = cfg.denylist ?? []
    const enforceAllowlist = cfg.autoMerge
    const constraints = executionContext.automation_policy?.constraints
    if ((constraints !== undefined || enforceAllowlist || denylist.length > 0) && commits.length > 0) {
      const files = await ports.diffNames({ worktreePath, branch: wt.branch, base: cfg.base })
      if (constraints !== undefined) {
        const enforceDecision = (decision: ConstraintDecision, operation: 'write' | 'merge'): void => {
          if (decision.allowed) return
          const operationPolicy = operation === 'write' ? constraints.write : constraints.merge
          if (decision.reason === 'path-outside-allowlist') {
            throw new AllowlistViolationError(decision.paths ?? [], operationPolicy.allowlist, worktreePath)
          }
          if (decision.reason === 'path-denied') {
            throw new DenylistViolationError(matchDenylist(decision.paths ?? [], operationPolicy.denylist), worktreePath)
          }
          throw new Error(`constraint ${operation} rejected: ${decision.reason}`)
        }
        enforceDecision(evaluateConstraintPolicy(constraints, {
          operation: 'write', active: true, paths: files, matches: matchesPathGlob,
        }), 'write')
        if (cfg.autoMerge) {
          enforceDecision(evaluateConstraintPolicy(constraints, {
            operation: 'merge', active: true, paths: files, matches: matchesPathGlob,
          }), 'merge')
        }
      } else {
        if (enforceAllowlist) {
          const outside = matchAllowlist(files, cfg.allowlist ?? [])
          if (outside.length > 0) throw new AllowlistViolationError(outside, cfg.allowlist ?? [], worktreePath)
        }
        const violations = matchDenylist(files, denylist)
        if (violations.length > 0) throw new DenylistViolationError(violations, worktreePath)
      }
    }

    // barrier 全链同源：命名分支 HEAD == landed；不信沙箱自报（report.build_sha）。
    const barrier = await deriveBarrierSha({
      git: ports.git,
      branch: wt.branch,
      commits,
      sandboxReportedSha: report.build_sha,
    })

    // H7 verifier Phase 2：merge 判断块之前、取得权威 build_sha（barrier，非沙箱自报）后调
    // VerifierPort——产出结构化 VerificationResult，原样携带进 RunOutcome，供 scheduler settlement
    // 消费点（scheduler.ts evaluateVerificationGate 调用点）判定结算 merged/paused/retry。无 commit
    // （no-op，barrier.buildSha 缺席）→ 没有可核验的构建，跳过调用。全档（L1/L2/L3）都调——诚实记录
    // 不是只服务 L3 自动合并判断。
    let verification: RunOutcome['verification']
    if (barrier.buildSha !== undefined) {
      // custom workflow 坐标：cfg.workflowCoordinate 真持有时才构造 workflow-transition（见上方
      // 顶注 + RunChangeConfig.workflowCoordinate 文档——本包当前无生产来源填充它，恒走 default 轨）。
      const workflowBinding: VerificationBinding = cfg.workflowCoordinate
        ? {
            kind: 'workflow-transition',
            workflow_digest: cfg.workflowCoordinate.workflow_digest,
            workflow: cfg.workflowCoordinate.workflow,
            step: cfg.workflowCoordinate.step,
            event: report.phase_event,
          }
        : { kind: 'default-transition', event: report.phase_event }
      const verifierInput = freezeVerifierInput({
        context: executionContext,
        workflowRunId,
        workflowBinding,
        revisionSha: barrier.buildSha,
        worktreePath,
        // 完整 issuer identity 锚从装配面取；缺席时只兼容默认端口的固定 name/version。
        // 遗留 kind-only 字段刻意不参与：同 kind 的 B/999 不能冒充锚定的 A/version。
        expectedIssuerIdentity: ports.verifierExpectedIssuerIdentity ?? DEFAULT_VERIFIER_ISSUER_IDENTITY,
      })
      const rawVerification = await ports.verifier.verify(verifierInput)
      // H7 复审阻断1 核心修复：绝不把 VerifierPort 的运行时输出原样直信——先经 enforceVerificationBoundary
      // 窄校验（sandbox 冒充 trusted:true / passed 却零 evidence / verdict 垃圾字面量等一律被拦），
      // 非法结果替换成安全 sentinel（verdict=inconclusive + issuer 降级 untrusted），never authorized。
      verification = enforceVerificationBoundary(rawVerification, verifierInput)
    }
    // 本层同样用 evaluateVerificationGate 判定是否**物理** merge——绝不能让 git 历史真的 merge 了、
    // 而 ledger/automation 状态却诚实地说"未合并、停给人工复核"（那会是真正的谎报，本仓注释诚实性
    // 门禁的姊妹问题就发生在状态字段上）。scheduler 用同一份判定表对 outcome.verification 重算一次
    // 只为落盘 reason/cause，两处判定必须是同一个纯函数、同一个输入，绝不允许出现"物理已合并但
    // 结算判未授权"的分裂。
    const mergeGate = evaluateVerificationGate({
      verification,
      buildSha: barrier.buildSha,
      // H7-S2：本层自己持有的归属数据——与上方 verifierInput 构造用的是同一份 executionContext/
      // workflowRunId（函数顶层计算，见上方注释），物理 merge 判定与产生点校验的"这是谁的核验结果"
      // 结构上不可能对不齐。
      expectedSubject: { workflow_run_id: workflowRunId, attempt_id: executionContext.attempt_id, change: executionContext.change },
      requireWorkflowBinding,
      expectedAutomationPolicy: executionContext.automation_policy,
    })

    // 分级放权：仅 L3（autoMerge）且有 commit 且 verification gate 授权才真 merge 回主线；L1/L2
    // report-only 只报告；gate 未授权（absent/untrusted/inconclusive/SHA 漂移）→ fail-closed 跳过
    // merge（同 kill-switch 跳过模式，但语义不同——不置 killSwitched，scheduler 会据 outcome.verification
    // 重算同一 gate 落 paused + 诚实 reason，见 scheduler.ts writeBackSuccess/settlementFor）。
    // kill-switch 接缝③：merge 前重查 loop 是否仍 active，停用则跳过 merge、置 killSwitched
    // （checkActive throw = 不确定 → 保守跳过 merge，宁可不自动合并也不在停用疑云下 merge 回主线）。
    let killSwitched = false
    let mergeLanded = false
    let hostSyncPending = false
    let mergeJournalPending = false
    if (cfg.autoMerge && commits.length > 0 && mergeGate.kind === 'authorized') {
      if (cfg.requireMergeJournal === true && cfg.mergeJournal === undefined) {
        throw new MergeJournalError('L3 auto-merge 缺少 durable merge journal 装配，base ref 未推进')
      }
      // G②：merge 前 CAS——重读 base ref SHA 与冻结值比对；读不到（git 故障）→ 保守视为「已变」不 merge。
      const verifyBase = async (): Promise<boolean> => {
        try {
          return (await ports.git.revParse(cfg.base)) === expectedBaseSha
        } catch {
          return false
        }
      }
      let mergeIntentRecordId: string | undefined
      const mergeInput = {
        worktreePath, branch: wt.branch, base: cfg.base, expectedBaseSha, expectedBranchSha: barrier.buildSha,
        onIntent: cfg.mergeJournal
          ? async (draft: MergeIntentDraft): Promise<void> => {
              mergeIntentRecordId = await cfg.mergeJournal!.recordMergeIntent({
                draft, context: executionContext, verification, verifyResult: report.verify_result,
                buildSha: barrier.buildSha, branch: wt.branch, commits,
              })
            }
          : undefined,
        onLanded: cfg.mergeJournal
          ? (receipt: MergeBackReceipt) => {
              if (mergeIntentRecordId === undefined) throw new MergeJournalError('merge-landed 缺少已 fsync 的 intent record id')
              return cfg.mergeJournal!.recordMergeLanded({ intentRecordId: mergeIntentRecordId, receipt, context: executionContext })
            }
          : undefined,
      }
      if (cfg.withMergePermit) {
        // Stage B 返工 #3 + G②：merge active 检查 + base-SHA CAS + 动作 + ref 更新在同一 merge permit
        // （governance 锁内现读 active + verifyBase CAS → mergeToBase，持锁到 ref 更新完成）。
        try {
          const receipt = await cfg.withMergePermit(() => ports.mergeToBase(mergeInput), verifyBase)
          mergeLanded = receipt?.landed ?? true
          hostSyncPending = receipt?.hostSynced === false
          mergeJournalPending = receipt?.landedJournalError !== undefined
        } catch (mergeErr) {
          // G² 子问题1 分流——三类语义不同，绝不共用成功退出路径：
          //   · LoopNotActiveError（loop 停用，permit 预检抛）→ killSwitched 跳过 merge、正常落 paused（停给人工复核）。
          //   · BaseRefCasError（base 在 freeze→merge 前窗口被推进，permit verifyBase 预检抛）→ fail-loud：转
          //     BaseAdvancedError（留现场 + round ok=false），绝不当 killSwitched 成功吞掉（旧行为会删 worktree、
          //     round 假 ok=true、CLI 打印跑完一轮返 0）。
          //   · else（含 mergeBackToBase 自身 update-ref CAS 失败——base 在 merge 已开始之后被推进——抛的
          //     SyncError{baseAdvanced:true}）→ **原样透传**：baseAdvanced 标记随对象保留，scheduler 据此记 round
          //     failure 使 ok=false（fail-loud）；普通 content-conflict SyncError（baseAdvanced=false）透传后 round 仍 ok。
          //     绝不在此把 update-ref CAS 失败吞成无 baseAdvanced 的普通 conflict。
          if (isLoopNotActive(mergeErr)) killSwitched = true
          else if (isBaseRefCas(mergeErr)) {
            throw new BaseAdvancedError(
              `${mergeErr instanceof Error ? mergeErr.message : String(mergeErr)}——命名分支与 worktree 现场保留于 ${worktreePath}（供人工复核/重试）`,
              worktreePath,
            )
          } else throw mergeErr
        }
      } else {
        // 无 permit（未接线）：退回 checkActive 非原子预检 + mergeBackToBase 自身 base-SHA 校验（行为不变外仍拦错 base）。
        const active = cfg.checkActive ? await cfg.checkActive().catch(() => false) : true
        if (active) {
          const receipt = await ports.mergeToBase(mergeInput)
          mergeLanded = receipt?.landed ?? true
          hostSyncPending = receipt?.hostSynced === false
          mergeJournalPending = receipt?.landedJournalError !== undefined
        }
        else killSwitched = true
      }
    }

    return finalizeRunOutcome({
      commits,
      verifyResult: report.verify_result,
      buildSha: barrier.buildSha,
      branch: wt.branch,
      phaseEvent: report.phase_event,
      verification,
      requireWorkflowBinding,
      mergeLanded,
      hostSyncPending,
      mergeJournalPending,
    }, killSwitched)
  } catch (err) {
    if (signal.aborted) {
      // abort：finally 统一且仅一次 close；若 close 也失败，仍保留 AbortedRunError 主错误并附诊断。
      preserve = true
      primaryError = new AbortedRunError(signal.reason, worktreePath)
      hasPrimaryError = true
      throw primaryError
    }

    // err 是任意外部边界值，可能是会在 instanceof/get/_tag/toString 时抛错的 Proxy。必须先登记，
    // 保证 finally 中 cleanup 再失败时无条件保留原 primary/cause 并生成 RunAndCleanupError。
    primaryError = err
    hasPrimaryError = true

    // dashboard 取消（afk-workbench Task 3）：docker kill 容器后，runWork 的真实现（ports.ts）对
    // exec 非零退出直接 throw 一个普通 Error——从不把"非零退出"当一个正常返回值交回这里（见
    // ports.ts `if (res.exitCode !== 0) throw new Error(...)`）。这才是 kill 后的真实主路径；
    // try 块里 runWork resolve 之后那一次取消检测只覆盖"run 碰巧抢在 kill 生效前正常跑完"的窄
    // 竞态，覆盖不到这里——取消检测必须在 catch 里也做一次。err 若已经是那次检测抛出的
    // CancelledRunError 则跳过重复探测，直接按它走下面统一的 isPreserveError 归类。
    let settled = err
    try {
      if (!(err instanceof CancelledRunError) && (await ports.worktree.hasCancelMarker(worktreePath))) {
        settled = new CancelledRunError('cancel requested via dashboard', worktreePath)
      }
    } catch {
      // 无法安全判定是否为 dashboard 取消时，不覆盖原错误，也不删除可能需要接管的现场。
      preserve = true
    }

    // conflict 类（merge 冲突 / barrier drift / worktree 失败 / dashboard 取消）→ 保留现场，不清 worktree。
    try {
      if (isPreserveError(settled)) preserve = true
    } catch {
      // 敌意 Proxy 的 _tag getter 失败时分类未知；fail-closed 保留现场，原错误继续传播。
      preserve = true
    }
    primaryError = settled
    throw settled
  } finally {
    // T4 结算清理：完成/失败/取消一切路径都清 automation_current_phase（写过才清；排空在途写）。
    await phaseWatch.settle().catch(() => {})
    // codex P2:排空 agent-exit 观察器在途写(不清字段)——run promise 结算前落定,scheduler 终态分类严格后写。
    await agentExitWatch.settle().catch(() => {})
    let cleanupError: LifecycleContainerCleanupError | undefined
    if (handle) {
      try {
        // 不在保护区外读取 handle 的任何属性：handle 可由外部 port 返回，getter/Proxy 可能抛错。
        await handle.close()
      } catch (error) {
        let containerName = '<unavailable-owned-container>'
        try {
          const candidate = handle.containerName
          if (typeof candidate === 'string' && candidate.length > 0) containerName = candidate
        } catch {
          // 名称只用于诊断；读取失败不能阻断 close 故障进入可信 cleanup wrapper。
        }
        // 即便 close() 已抛带同名 tag 的对象，也一律包进本模块创建并冻结的可信错误；外来值可能是 Proxy。
        cleanupError = new LifecycleContainerCleanupError(containerName, error, worktreePath)
        // 容器是否仍占用 bind-mounted worktree 未知；绝不删除现场，也绝不自动伪装成成功。
        preserve = true
      }
    }
    if (cleanupError !== undefined) {
      if (!hasPrimaryError) throw cleanupError
      throw new RunAndCleanupError(primaryError, cleanupError, worktreePath)
    }
    // 非 abort、非 conflict 路径才 teardown worktree（错误吞掉）；abort/conflict 保留现场。
    if (!signal.aborted && !preserve) {
      await ports.worktree.remove(worktreePath).catch(() => {})
    }
  }
}
