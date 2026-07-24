/**
 * TransitionApplication —— 唯一转换用例（G1 支点，2026-07-17）。
 *
 * 此前 CLI（cli/commands/transition.ts）与 server（server/transition.ts）各自实现一遍完整的
 * "default/custom 双轨分流 → 前置校验 → flow.transition/planStepTransition → 副作用 →
 * commit → breadcrumb/history 收尾"编排，只在错误分类映射（exit code vs HTTP
 * code）与部署形态相关的少量绑定（TransitionContext 构造、breadcrumb/marker 的单/多项目端口
 * 形状）上有真实差异。这份重复正是 GOAL.md G1 的验收目标要消灭的对象。
 *
 * 这个模块拥有事务边界本身（内部调用 runRepository.transact()），不是一个接收 tx 的纯函数——
 * 如果调用方仍各自持有 runRepo.transact()，它们仍然可能各自遗漏 await、漏写某段收尾、或悄悄
 * 在 callback 里插入自己的逻辑，"唯一"就名不副实（2026-07-17 codex 架构评估明确建议）。
 *
 * 分层：
 *   - planDefaultTransition / planCustomTransition —— 锁内规划阶段：判定 + 状态变换，**无任何
 *     持久化写**，但不是严格意义的纯函数（第 1 轮 review 纠正过这个措辞）——default 轨的
 *     DefaultEventPolicy typed guard/action（G2 P3 起，与 custom 轨共用 guard-handlers/action-handlers
 *     引擎）经 TransitionContext 按 event 条件性读文件/git，custom 轨的 stepGuard 读 tasks.md，
 *     这些读取是既有 kernel 单一真相源的职责；
 *     把它们预物化到 planner 之外需要在编排层复制一份「哪个 event 需要哪些事实」的知识，恰是
 *     transition-table 单源要消灭的重复，且 review 明确警告不要为纯度把这些读取移出锁外。
 *     planner 的输入面从类型上收窄：只收 state 与（custom 轨）已加载并编译的 WorkflowIR，不接收
 *     带 commit 能力的 WorkflowRunTransaction——规划途中在结构上就不可能提交。
 *   - execute() —— 编排层：调 runRepository.transact() → 锁内物化 workflow 定义 → 选对应
 *     planner → 命中拒绝就直接返回（不 commit）→ 命中可提交结果就 tx.commit() →
 *     breadcrumb/history 收尾。
 *   - commit() 是唯一不可回退的成功点；收尾两项都是 commit 之后的 best-effort 兼容投影，写入
 *     失败只追加进返回结果的 warnings，绝不让已经成功的转换在返回值层面变成失败（2026-07-17
 *     codex 评估：不用回调式 emitWarning——回调本身若抛错，会把已提交成功的转换伪装成失败；
 *     结构化返回值没有这个风险）。
 *
 * 本模块的范围边界（2026-07-17 codex 架构评估划定，见 GOAL.md 清单 G）：只消灭 CLI/server 两处
 * 复制的转换编排，不改变 server 现有的外部可观测行为（build-sha-missing 这类 warning 目前只有
 * CLI adapter 转成 stderr 文案，server adapter 本轮忽略它，不扩大 HTTP 契约）；不统一 default 轨
 * （FlowEngine/eventEdge）与 custom 轨（WorkflowIR/planStepTransition）内部本就不同的两套
 * 模型；change 名合法性/server root 信任校验/canonical-or-legacy state 是否存在这些
 * "transition 域拒绝"之外的前置校验留在 adapter 层，不下沉进本模块；不改变项目根
 * review marker 是 `pipeline review request` 的根级短时投影；transition 本身只消费 canonical
 * exact-phase-and-event approval receipt。StateStore 已以 canonical current 为真相并把 `.pipeline.yaml`
 * 作为兼容投影，本用例只消费该抽象，不自行读任一格式。
 */
import type { FieldName, FlowEngine, HistoryWriter, Phase, PipelineState } from '../types.js'
import { IllegalTransitionError } from '../types.js'
import { applyBreadcrumbTail, clearReviewGatePatch, reviewGateApprovedFor, transitionRecordToHistoryEntry } from '../state/index.js'
import { evaluateDocumentEvidence } from '../state/document-evidence.js'
import type { DocumentEvidenceReport } from '../state/document-evidence.js'
import type { BreadcrumbWriter } from '../state/index.js'
import { eventEdge } from '../flow/index.js'
import type { EventName, TransitionContext } from '../flow/index.js'
import { checkDefaultEventPreconditions, DEFAULT_EVENT_POLICY } from '../flow/default-event-policy.js'
import { applyStepTransition, planStepTransition, resolveStep } from './engine.js'
import { applyActions } from './action-handlers.js'
import { evaluateConstraintPolicy, type ConstraintDecision } from '../loops/automation-policy.js'
import type { AutomationPolicySnapshot } from '../loops/automation-policy.js'
import type { ActionConfig, CompiledGuardConfig, WorkflowIR } from './ir.js'
import type { TransitionRecord, WorkflowRunRepository } from './run-types.js'
import {
  isDocumentContractPhase, isOpenSpecDocumentContractRequired, shouldEnforceDocumentEvidenceOnTransition,
} from './document-contract.js'
import type { DocumentContractPhase } from './document-contract.js'
import { missingWorkflowStepSkills } from './skill-evidence.js'

export interface TransitionApplicationDeps {
  runRepository: WorkflowRunRepository
  flow: FlowEngine
  clock: () => string
  /** best-effort：缺省 = 不记账/不写（测试可不注入，同 cli/server 既有 deps 约定）。 */
  history?: HistoryWriter
  breadcrumb?: BreadcrumbWriter
  /**
   * Resolve host-proven Skill completions for the current visit to a custom workflow step.
   * Production CLI/server adapters must inject this; omission is reserved for lower-level tests.
   */
  completedStepSkills?: (input: {
    readonly changeDir: string
    readonly stepId: string
    readonly requiredSkillIds: readonly string[]
  }) => Promise<ReadonlySet<string>>
  /**
   * OpenSpec evidence ledger read port. Production leaves this unset so the use case always reads
   * the authoritative filesystem ledger; adapters may inject it only to isolate their own unit
   * tests from filesystem persistence.
   */
  documentEvidence?: (
    root: string,
    changeDir: string,
    phase: DocumentContractPhase,
  ) => Promise<DocumentEvidenceReport>
  /** Resolve current kill-switch and authenticated human-gate facts inside the transaction. */
  resolveConstraintContext?: (input: {
    readonly policy: AutomationPolicySnapshot
    readonly command: TransitionCommand
    readonly target: string
  }) => Promise<{ readonly active: boolean; readonly humanGateSatisfied: boolean }>
}

export interface TransitionCommand {
  /** 项目根（OpenSpec ledger 和 workflow 配置的锚点）。 */
  root: string
  /** change 目录绝对路径。 */
  changeDir: string
  /** 裸 change 名（不是路径）——breadcrumb 内容用。 */
  changeName: string
  event: string
  /** default 轨 DefaultEventPolicy typed guard/action 用；custom 轨 P2 起也复用它
   * 的 fileExists/gitHeadSha 注入 edge/step guard 的 file-exists/build-head-unchanged 能力面
   * （custom 轨的 tasks.md IO 仍走 changeDir 本身，见 planCustomTransition 组装的 StepGuardContext）。 */
  context: TransitionContext
  /** 已绑定根路径的 workflow 加载器，返回**编译产物** WorkflowIR（adapter 柯里化处
   * loadWorkflow→compileWorkflow，见 cli/server transition.ts）。编译错误 = 基础设施错误，沿
   * 既有 throw→exit 1/500 路径由 adapter 处理，不进本模块判别联合。 */
  loadWorkflow: (name: string) => WorkflowIR | null
  /**
   * 仅 dashboard 的显式“继续/放行”点击可传 true；CLI/agent 路径必须经过 canonical
   * `pipeline review acknowledge` receipt。它把 Web UI 的真人点击接到同一出口 gate，而不是
   * 让进入 review phase 时就出现的 marker 锁住 agent。
   */
  humanReviewApproved?: boolean
}

export type TransitionApplicationWarning =
  | { readonly kind: 'build-sha-missing' }
  | {
      readonly kind: 'projection-write-failed'
      readonly projection: 'state-yaml' | 'breadcrumb' | 'history'
      readonly cause: unknown
    }

export type TransitionApplicationResult =
  | {
      readonly kind: 'applied'
      readonly from: string
      readonly to: string
      readonly record: TransitionRecord
      readonly warnings: readonly TransitionApplicationWarning[]
    }
  | { readonly kind: 'unknown-event'; readonly event: string }
  | {
      readonly kind: 'event-source-mismatch'
      readonly event: string
      readonly current: string
      readonly expected: Phase
      readonly to: Phase
    }
  | { readonly kind: 'illegal-transition'; readonly from: Phase; readonly to: Phase }
  | { readonly kind: 'precondition-violated'; readonly lines: readonly string[] }
  | { readonly kind: 'workflow-not-found'; readonly workflowName: string }
  | { readonly kind: 'step-not-in-graph'; readonly workflowName: string; readonly stepId: string }
  | {
      readonly kind: 'event-unsupported'
      readonly workflowName: string
      readonly stepId: string
      readonly event: string
      readonly available: readonly string[]
    }
  | {
      readonly kind: 'step-guard-failed'
      readonly workflowName: string
      readonly stepId: string
      readonly failures: readonly string[]
    }
  | {
      readonly kind: 'step-skills-incomplete'
      readonly workflowName: string
      readonly stepId: string
      readonly missing: readonly string[]
    }
  | {
      readonly kind: 'document-evidence-failed'
      readonly phase: string
      readonly blockers: readonly string[]
    }
  | { readonly kind: 'review-approval-required'; readonly phase: string; readonly event: string }
  | { readonly kind: 'constraint-denied'; readonly reason: Exclude<ConstraintDecision, { allowed: true }>['reason'] }

export interface TransitionApplication {
  execute(command: TransitionCommand): Promise<TransitionApplicationResult>
}

/** execute() 内部用的"待提交"结果——不是 TransitionApplicationResult 的一部分（那个只在真正
 * commit 之后才产生），two variant 各自携带 default/custom 轨真实的 from/to 类型（default 轨
 * 的 to 是 Phase，供 breadcrumb 直接使用，不需要在调用点 cast）。 */
type PreparedTransition =
  | {
      readonly mode: 'default'
      readonly governedDocumentContract: boolean
      readonly requiresReviewApproval: boolean
      readonly from: Phase
      readonly to: Phase
      readonly nextFields: Record<FieldName, string | string[]>
      readonly warnings: TransitionApplicationWarning[]
    }
  | {
      readonly mode: 'custom'
      readonly governedDocumentContract: boolean
      readonly requiresReviewApproval: boolean
      readonly from: string
      readonly to: string
      readonly nextFields: Record<FieldName, string | string[]>
      readonly warnings: TransitionApplicationWarning[]
    }

type TransitionRejection = Exclude<TransitionApplicationResult, { kind: 'applied' }>

function isRejection(x: PreparedTransition | TransitionRejection): x is TransitionRejection {
  return 'kind' in x
}

function fieldStr(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v.join(',') : (v ?? '')
}

/**
 * A workflow that explicitly adopts the OpenSpec contract also adopts the canonical build/verify
 * lifecycle.  These rules live next to the default policy rather than being copied into each YAML:
 * a missing optional action must not downgrade a governed workflow into a non-verifiable one.
 */
function governedLifecyclePolicy(
  governed: boolean,
  from: string,
  to: string,
): { readonly guards: readonly CompiledGuardConfig[]; readonly actions: readonly ActionConfig[] } | undefined {
  if (!governed) return undefined
  if (from === 'build' && to === 'verify') return DEFAULT_EVENT_POLICY['build-complete']
  if (from === 'verify' && to === 'ship') return DEFAULT_EVENT_POLICY['verify-pass']
  if (from === 'verify' && to === 'build') return DEFAULT_EVENT_POLICY['verify-fail']
  return undefined
}

function mergeLifecycleActions(
  declared: readonly ActionConfig[],
  required: readonly ActionConfig[] | undefined,
): readonly ActionConfig[] {
  if (!required || required.length === 0) return declared
  return [...declared, ...required.filter((candidate) => !declared.some((action) => action.type === candidate.type))]
}

// planner 只收 flow+clock，不收完整 TransitionApplicationDeps——deps 里有 runRepository 与两个
// projection writer，收整包等于 planner 在类型上仍可间接提交/写盘（第 2 轮 review 抓到：从
// "直接持有 tx" 变成 "间接可达" 不算收窄）。
async function planDefaultTransition(
  state: PipelineState, command: TransitionCommand, flow: FlowEngine, clock: () => string,
): Promise<PreparedTransition | TransitionRejection> {
  const edge = eventEdge(command.event)
  if (!edge) return { kind: 'unknown-event', event: command.event }
  const current = fieldStr(state.fields.phase)
  if (current !== edge.from) {
    return { kind: 'event-source-mismatch', event: command.event, current, expected: edge.from, to: edge.to }
  }
  // eventEdge 命中 → command.event ∈ TRANSITION_EVENTS 键 = EventName（DEFAULT_EVENT_POLICY 同键
  // 空间，查表恒命中）。
  const event = command.event as EventName
  const policy = DEFAULT_EVENT_POLICY[event]

  // ① 前置 guard：typed guard handler 判定（首错优先）+ renderer 逐字 ERROR 文案——default 轨
  // 政策从老 checkTransitionPreconditions switch 迁到 DefaultEventPolicy + guard-handlers（G2 P3）。
  const violations = await checkDefaultEventPreconditions(event, state, command.context)
  if (violations) return { kind: 'precondition-violated', lines: violations }

  // ② FlowEngine 推进：合法边检查 + phase/phase_status/updated_at 变换（转换结构不迁——保守分叉，
  // 边选择与相位推进继续由 eventEdge + FlowEngine 承担）。
  let result: ReturnType<FlowEngine['transition']>
  try {
    result = flow.transition(state, edge.to, clock)
  } catch (e) {
    if (e instanceof IllegalTransitionError) return { kind: 'illegal-transition', from: e.from, to: e.to }
    throw e
  }

  // ③ 状态副作用：typed action handler → patch，commit 前一次合并进 nextFields——default 轨从老
  // applyTransitionEffects switch 迁到 DefaultEventPolicy.actions + applyActions（G2 P3），与
  // custom 轨（planCustomTransition）共用同一 applyActions 引擎、同一「推进后 action、commit 前
  // 合并」时序。单次 planner 路径只跑 typed action、绝不再调 legacy switch（防双执行：两条都跑
  // 会让 clock()/gitHeadSha 各调两次 = 真实行为差异）。freeze-build-sha 取不到 HEAD → build-sha-missing
  // 信号，逐字对齐老 buildShaMissing→WARN 映射。
  const warnings: TransitionApplicationWarning[] = []
  let nextFields = result.state.fields
  if (policy.actions.length > 0) {
    const outcome = await applyActions(policy.actions, {
      fields: result.state.fields,
      clock,
      gitHeadSha: command.context.gitHeadSha,
      workspaceFingerprint: command.context.workspaceFingerprint,
    })
    nextFields = { ...result.state.fields, ...outcome.patch }
    for (const signal of outcome.signals) warnings.push({ kind: signal.kind })
  }
  return {
    mode: 'default',
    governedDocumentContract: isOpenSpecDocumentContractRequired('default', fieldStr(state.fields.track)),
    requiresReviewApproval: flow.manifest.reviewPhases.includes(result.from),
    from: result.from, to: result.to, nextFields, warnings,
  }
}

async function planCustomTransition(
  state: PipelineState,
  ir: WorkflowIR,
  workflowName: string,
  command: TransitionCommand,
  clock: () => string,
  completedStepSkills: TransitionApplicationDeps['completedStepSkills'],
): Promise<PreparedTransition | TransitionRejection> {
  const currentBeforePlan = resolveStep(ir, fieldStr(state.fields.phase))
  // `archive` is the governed terminal used by the bundled archive skill. Custom workflow files
  // correctly model terminal nodes with `transitions: []`, but they still need one canonical
  // completion operation after the terminal step's skills/guards/documents have run. Treat the
  // reserved `archived` event as an implicit archive self-edge only for that exact terminal id;
  // ordinary terminal nodes and arbitrary unsupported events remain closed.
  const terminalArchive = currentBeforePlan?.id === 'archive'
    && currentBeforePlan.transitions.length === 0
    && command.event === 'archived'
  const planningIr: WorkflowIR = terminalArchive
    ? {
        ...ir,
        steps: ir.steps.map((step) => step.id === 'archive'
          ? {
              ...step,
              transitions: [{
                event: 'archived',
                to: 'archive',
                guards: [],
                actions: [{ type: 'archive-run' }],
              }],
            }
          : step),
      }
    : ir
  const edgeBeforePlan = terminalArchive
    ? planningIr.steps.find((step) => step.id === 'archive')?.transitions[0]
    : currentBeforePlan?.transitions.find((candidate) => candidate.event === command.event)
  const governed = isOpenSpecDocumentContractRequired(workflowName, fieldStr(state.fields.track), ir)
  const lifecycle = currentBeforePlan && edgeBeforePlan
    ? governedLifecyclePolicy(governed, currentBeforePlan.id, edgeBeforePlan.to)
    : undefined
  if (currentBeforePlan && currentBeforePlan.skills.length > 0 && completedStepSkills !== undefined) {
    const completed = await completedStepSkills({
      changeDir: command.changeDir,
      stepId: currentBeforePlan.id,
      requiredSkillIds: currentBeforePlan.skills.map((skill) => skill.id),
    })
    const missing = missingWorkflowStepSkills(currentBeforePlan.skills, completed)
    if (missing.length > 0) {
      return {
        kind: 'step-skills-incomplete',
        workflowName,
        stepId: currentBeforePlan.id,
        missing,
      }
    }
  }
  const plan = await planStepTransition(planningIr, state, command.event, {
    changeDirAbs: command.changeDir,
    fileExists: command.context.fileExists,
    gitHeadSha: command.context.gitHeadSha,
    workspaceFingerprint: command.context.workspaceFingerprint,
  }, lifecycle?.guards)
  if (!plan.ok) {
    if (plan.kind === 'step-not-in-graph') return { kind: 'step-not-in-graph', workflowName, stepId: plan.stepId }
    if (plan.kind === 'event-unsupported') {
      return {
        kind: 'event-unsupported', workflowName, stepId: plan.stepId, event: command.event, available: plan.available,
      }
    }
    return { kind: 'step-guard-failed', workflowName, stepId: plan.stepId, failures: plan.failures }
  }
  const currentStep = resolveStep(planningIr, plan.from)
  if (!currentStep) throw new Error(`workflow '${workflowName}' 在已规划 step '${plan.from}' 后无法重取当前 step`)
  // 计划通过：先算 phase 推进（applyStepTransition），再跑该边 edge actions——patch 合并进
  // nextFields **在 commit 之前**（对照 default 轨 typed action（applyActions）在 commit 前改 fields
  // 的同一时序）。actions 是 async，其真异常（如 freeze-build-sha 的 gitHeadSha 抛错）原样上抛 → 出
  // transact 回调 → 事务中止不 commit（state 不推进）。旧 YAML 无 edge action → 零 patch 零 signal，
  // 行为逐字不变。actions 直接取自 plan（planStepTransition 选边时携带该边的 actions），不二次按
  // from+event 查表——规划即选边的单一真相，无「选一条边、执行另查一条」的语义漂移面。
  const nextState = applyStepTransition(state, plan.to, clock)
  const actions = mergeLifecycleActions(plan.actions, lifecycle?.actions)
  const warnings: TransitionApplicationWarning[] = []
  let nextFields = terminalArchive
    ? { ...nextState.fields, phase_status: 'done' as const }
    : nextState.fields
  if (actions.length > 0) {
    const outcome = await applyActions(actions, {
      fields: nextState.fields,
      clock,
      gitHeadSha: command.context.gitHeadSha,
      workspaceFingerprint: command.context.workspaceFingerprint,
    })
    nextFields = { ...nextFields, ...outcome.patch }
    for (const signal of outcome.signals) warnings.push({ kind: signal.kind })
  }
  return {
    mode: 'custom',
    governedDocumentContract: governed,
    requiresReviewApproval: currentStep.gate === 'review',
    from: plan.from, to: plan.to, nextFields, warnings,
  }
}

export function createTransitionApplication(deps: TransitionApplicationDeps): TransitionApplication {
  return {
    async execute(command: TransitionCommand): Promise<TransitionApplicationResult> {
      return deps.runRepository.transact(command.changeDir, async (tx): Promise<TransitionApplicationResult> => {
        // 事实物化在这里、锁内完成（workflow 定义加载），planner 只收规划所需的输入——state 与
        // 已加载并编译的 WorkflowIR，不把带 commit 能力的整个 tx 交给 planner（第 1 轮 review：
        // planner 拿到 tx 就有能力在规划途中提交，类型上就不该给这个权力）。
        const workflowName = tx.run.workflowId
        let prepared: PreparedTransition | TransitionRejection
        if (workflowName === 'default') {
          prepared = await planDefaultTransition(tx.state, command, deps.flow, deps.clock)
        } else {
          const wf = command.loadWorkflow(workflowName)
          if (!wf) return { kind: 'workflow-not-found', workflowName }
          prepared = await planCustomTransition(
            tx.state,
            wf,
            workflowName,
            command,
            deps.clock,
            deps.completedStepSkills,
          )
        }
        if (isRejection(prepared)) return prepared

        const policy = tx.run.automationPolicy
        if (policy !== undefined) {
          const facts = deps.resolveConstraintContext === undefined
            ? { active: false, humanGateSatisfied: false }
            : await deps.resolveConstraintContext({ policy, command, target: prepared.to })
          const decision = evaluateConstraintPolicy(policy.constraints, {
            operation: 'transition', active: facts.active, humanGateSatisfied: facts.humanGateSatisfied,
            transitionTarget: prepared.to, matches: () => false,
          })
          if (!decision.allowed) return { kind: 'constraint-denied', reason: decision.reason }
        }

        if (prepared.governedDocumentContract && shouldEnforceDocumentEvidenceOnTransition(prepared.from, prepared.to)) {
          if (!isDocumentContractPhase(prepared.from)) {
            return {
              kind: 'document-evidence-failed',
              phase: prepared.from,
              blockers: [`受 OpenSpec 文档契约治理的 workflow 使用了非法 phase '${prepared.from}'`],
            }
          }
          const evidence = await (deps.documentEvidence ?? evaluateDocumentEvidence)(
            command.root,
            command.changeDir,
            prepared.from,
          )
          if (!evidence.pass) {
            return { kind: 'document-evidence-failed', phase: prepared.from, blockers: evidence.blockers }
          }
        }

        // Review 的判定点是“离开当前 review phase”，不是“刚进入就锁住”。所有自动 guards
        // / 文档证据先通过，才允许 request/ack receipt 成为下一步的人类复核证据。CLI/agent
        // 只能消费 `pipeline review acknowledge` 写入的 exact-phase-and-event receipt；dashboard
        // 则把真实的、已选中 event 的显式放行点击作为同一语义的 host-bound acknowledgement。
        if (
          prepared.requiresReviewApproval
          && command.humanReviewApproved !== true
          && !reviewGateApprovedFor(tx.state, prepared.from, command.event)
        ) {
          return { kind: 'review-approval-required', phase: prepared.from, event: command.event }
        }

        // Receipt 在任一成功 transition 后立即消费，避免一次旧批准在回退/重入同一 phase 后被复用。
        const { record, projection } = await tx.commit({ ...prepared.nextFields, ...clearReviewGatePatch() }, {
          event: command.event, from: prepared.from, to: prepared.to,
        })
        const warnings = [...prepared.warnings]
        if (projection.status === 'pending') {
          warnings.push({
            kind: 'projection-write-failed', projection: 'state-yaml', cause: projection.error,
          })
        }

        // 收尾顺序 breadcrumb → history：breadcrumb 是 hook 热路径的当前相位缓存，history 是
        // durable transition audit。review marker 已移到 `pipeline review request`，不能在进入
        // review phase 时写，否则会把该 phase 的实现/验证工作本身锁死。
        // （history 延迟/中断时先落 breadcrumb，缩短 hook 热路径读到的相位缓存过期窗口——此前
        // 一次 REFACTOR 曾把这个顺序悄悄改乱，顺序本身是可观测行为，不是实现细节）。custom 轨
        // 普通 custom 保留原有 history-only 行为；显式 governed custom 复用 default 的 breadcrumb。
        const canonicalTarget = isDocumentContractPhase(prepared.to) ? prepared.to : undefined
        const shouldWriteGovernedTails = prepared.mode === 'default' || prepared.governedDocumentContract
        if (shouldWriteGovernedTails && canonicalTarget !== undefined) {
          const breadcrumbTail = await applyBreadcrumbTail(
            deps.breadcrumb, { changeDir: command.changeDir, name: command.changeName, to: canonicalTarget },
          )
          if (!breadcrumbTail.ok) {
            warnings.push({ kind: 'projection-write-failed', projection: 'breadcrumb', cause: breadcrumbTail.error })
          }
        }
        if (deps.history) {
          try {
            await deps.history.append(command.changeDir, transitionRecordToHistoryEntry(record))
          } catch (e) {
            warnings.push({ kind: 'projection-write-failed', projection: 'history', cause: e })
          }
        }
        return { kind: 'applied', from: prepared.from, to: prepared.to, record, warnings }
      })
    },
  }
}
