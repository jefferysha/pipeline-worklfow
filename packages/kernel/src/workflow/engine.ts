/**
 * workflow 自定义引擎的编排层（Wave 2 下沉）——把 cli/commands/transition.ts 与
 * server/src/transition.ts 各持一份的「解析 step / 找边 / 评 guard / 算下相位」逐字克隆
 * 收敛成 kernel 单一真相源，cli/server 塌成 adapter：
 *   · kernel（本文件）：纯判定 + 纯变换。输入是已加载的 WorkflowDef（loadWorkflow 的 fs 读
 *     留在 adapter 调用侧）与 PipelineState，产出判别联合 StepTransitionPlan——各失败 kind
 *     携带 adapter 复原**逐字错误消息**所需的全部信息（stepId / available / failures）。
 *   · adapter：消息模板 + 错误分类学（cli：WorkflowError→exit 1 / StepGuardError→exit 2；
 *     server：ConflictError/PreconditionError→409）+ 写盘收尾。两侧同一失败面的文案措辞
 *     本就不同（cli 带 `ERROR: ` 前缀、guard 行尾带 `：`；server 裸消息），故模板不下沉。
 *   · workflow-not-found 同理留在 adapter（loadWorkflow 返回 null 的处理，两侧消息不同）。
 * default workflow 与此无关——它走 flow/transition-table 既有单源路径，本文件零涉足。
 */
import { buildStepGuardInput, evaluateCompiledGuards, type StepGuardContext } from './stepGuard.js'
import type { ActionConfig, StepIR, WorkflowIR } from './ir.js'
import type { FieldName, PipelineState } from '../types.js'
import { mergeLifecycleGuards } from './governed-lifecycle-policy.js'

/** 字段值 → 字符串（列表按逗号连接；undefined → 空串）——cli str / server fstr 同款强转。 */
function fieldStr(state: PipelineState, k: FieldName): string {
  const v = state.fields[k]
  return Array.isArray(v) ? v.join(',') : (v ?? '')
}

/**
 * state → workflow 名（`str(fields.workflow) || 'default'` 习语单源）。
 * 注意 `||` 兜空串（'' 是历史遗留非自定义名），不是 `??`——这条语义是双轨分岔的基石。
 */
export function resolveWorkflowName(state: PipelineState): string {
  return fieldStr(state, 'workflow') || 'default'
}

/** 按 id 定位 step；未命中 → null（不在图里的消息模板留 adapter）。泛型：同时服务定义层
 *  WorkflowDef→StepDef（cli check/init、internalSkillGate、advance）与运行层 WorkflowIR→StepIR
 *  （planStepTransition）——两者 steps 都是 `{id}` 数组，判定逻辑同一。 */
export function resolveStep<S extends { readonly id: string }>(wf: { readonly steps: readonly S[] }, stepId: string): S | null {
  return wf.steps.find((s) => s.id === stepId) ?? null
}

/**
 * 首个 step（init 种 phase 的 `wf.steps[0]` 习语单源）。空 steps → null，消息模板留 adapter。
 * 消费方：cli/commands/init.ts:164（种 phase）、server/src/server.ts:759。泛型同 resolveStep。
 */
export function firstStep<S>(wf: { readonly steps: readonly S[] }): S | null {
  return wf.steps[0] ?? null
}

/**
 * step 转换判定结果的判别联合。失败 kind 与 adapter 现行错误分类学一一对应：
 *   step-not-in-graph / event-unsupported → cli WorkflowError(exit 1) / server ConflictError(409)；
 *   guard-failed → cli StepGuardError(exit 2) / server PreconditionError(409)。
 * available 携带原始 event 数组（声明序），`join(', ') || '(无)'` 的渲染留 adapter。
 * ok plan 携带选中边的 actions（编译产物，深冻结）——执行侧（transition-application）直接消费，
 * 不二次按 from+event 查表，规划即选边的单一真相（消除「规划选一条边、执行另查一条」的语义漂移面）。
 */
export type StepTransitionPlan =
  | { readonly ok: true; readonly from: string; readonly to: string; readonly actions: readonly ActionConfig[] }
  | { readonly ok: false; readonly kind: 'step-not-in-graph'; readonly stepId: string }
  | { readonly ok: false; readonly kind: 'event-unsupported'; readonly stepId: string; readonly available: readonly string[] }
  | {
      readonly ok: false
      readonly kind: 'guard-failed'
      readonly stepId: string
      readonly failures: readonly string[]
      readonly blockers?: readonly import('./build-revision.js').BuildRevisionBlocker[]
    }

/**
 * 非 default workflow 的转换判定编排（G2 P2：输入收编译产物 WorkflowIR，不再是裸 WorkflowDef）：
 * 定位当前 step → 按 event 找出边 → 评「正在退出的」当前 step 的**公共出口 guard** + **该边的
 * edge guard**（次序钉死：找边先于评 guard，对齐 cli/server 现行行为与 default 的「先校验再改
 * 相位」精神）。纯判定零写盘。guard 经 GUARD_HANDLERS 求值（v1 两变体已由 compileWorkflow 下沉
 * 成基础 guard，与新变体走同一 handler 路径），collect-all + 失败文案渲染由 evaluateCompiledGuards
 * 单源产出（stepGuard.ts，check 预览共用同一口径）。变 async：handler 面统一异步。
 * step 公共 guard 与 edge guard 串接成一组按序 collect-all——旧 YAML 无 edge guard 时该组 =
 * 仅 step 公共 guard，行为逐字不变。
 */
export async function planStepTransition(
  ir: WorkflowIR,
  state: PipelineState,
  event: string,
  ctx: StepGuardContext,
  /** Governed lifecycle invariants supplied by TransitionApplication after it resolves a canonical phase edge. */
  additionalGuards: readonly import('./ir.js').CompiledGuardConfig[] = [],
): Promise<StepTransitionPlan> {
  const stepId = fieldStr(state, 'phase')
  const step: StepIR | null = resolveStep(ir, stepId)
  if (!step) return { ok: false, kind: 'step-not-in-graph', stepId }
  const edge = step.transitions.find((t) => t.event === event)
  if (!edge) {
    return { ok: false, kind: 'event-unsupported', stepId, available: step.transitions.map((t) => t.event) }
  }
  // A governed custom workflow may declare a canonical guard itself. Evaluate it only once:
  // duplicate build-head-unchanged could read a moving workspace twice in one transaction.
  const guards = mergeLifecycleGuards([...step.guards, ...edge.guards], additionalGuards)
  const guardResult = await evaluateCompiledGuards(guards, stepId, buildStepGuardInput(state, ctx))
  if (!guardResult.pass) {
    return {
      ok: false,
      kind: 'guard-failed',
      stepId,
      failures: guardResult.failures,
      ...(guardResult.blockers === undefined ? {} : { blockers: guardResult.blockers }),
    }
  }
  return { ok: true, from: stepId, to: edge.to, actions: edge.actions }
}

/**
 * 计划通过后的纯变换：phase=to + updated_at=clock()，其余字段与 opaqueTail 原样保留，
 * 不 mutate 输入（写盘由 adapter 在同一把锁内完成）。无 kernel flow 介入：自定义 phase 序
 * 不在硬编码相位图里（phase_status 等 default 专属面自定义轨不产出，维持现状）。
 */
export function applyStepTransition(state: PipelineState, to: string, clock: () => string): PipelineState {
  return { ...state, fields: { ...state.fields, phase: to, updated_at: clock() } }
}
