/**
 * transition <name> <event> —— 状态机转换（CONTRACT §3，2026-07-06 oracle 实测回写）。
 * stdout：无（`[TRANSITION] name: old -> new` 走 stderr，对齐老内核 green() 落 stderr）；
 * exit：0 成功 / 1 非法转换、未知事件、事件前置校验不满足或其它错误（老内核实测口径）。
 *
 * 流程（锁内闭 TOCTOU，对齐老内核 .txn 事务锁语义）：
 *   withLock { read → 事件 from 相位前置校验 → 事件前置校验（case 块校验体）
 *              → flow.transition → 事件副作用 → write }。
 *
 * 事件表 / 前置校验 / 副作用是 **kernel 单一真相源**（BACKLOG #25b / GOAL B2）——
 * 上提到 @pipeline-lite/kernel（flow/transition-table.ts），cli 与 server 共消费、不再各持镜像。
 * 本文件是 kernel 单源的 cli 接线壳：把 CliDeps 的 fs/git 原语绑成 TransitionContext 注入 kernel
 * 纯逻辑，再把结果映射成 cli 的 stderr 行 + exit code + breadcrumb/历史/review-marker 写盘。
 *
 * ── BACKLOG #14 盘点表：老仓 state-transition.sh cmd_transition（case 块逐字对位）──
 * | 事件/面           | 老仓行号  | 副作用/校验                                        | lite 落点 |
 * |-------------------|----------|---------------------------------------------------|-----------|
 * | （全事件）        | L72      | .txn 事务锁串行化                                  | store.withLock ✓ |
 * | （全事件）        | L113     | require_phase：当前 phase == 事件 from             | 本文件 ✓ |
 * | （全事件）        | L225-226 | phase=to + phase_status（pending/in_progress/done）| kernel flow.transition ✓（相位序泛化）|
 * | （全事件）        | L227     | green [TRANSITION] from → to（stderr）             | 本文件 ✓（lite 用 ASCII "->"，stderr 面 oracle 不比）|
 * | （全事件）        | L239-264 | 进 review 相位落 .pipeline-pending-review 三行     | 本文件 ✓（manifest.reviewPhases 单一真相源）|
 * | （全事件）        | L267     | transitions_history {at,from,to,event}             | history JSONL ✓（event → raw，与 legacy.ts 导入映射同口径）|
 * | （全事件）        | L269-300 | lifecycle hooks（manifest pipeline_hooks，ship 受 auto_commit 闸）| 缺 —— 需 kernel/manifest 派生面（BACKLOG #18）+ M2 hooks 接线，本轮不越权 |
 * | explore-complete  | L120-126 | design_doc 非空/非 null/文件存在                   | kernel checkTransitionPreconditions ✓ |
 * | spec-complete     | L127-138 | track≠pm → plan 非空/非 null/文件存在              | kernel checkTransitionPreconditions ✓ |
 * | spec-complete     | L231-237 | automation 挂起入队（ac_enabled+opted_in）         | 缺 —— automation 子系统（BACKLOG #29b/M5），本轮不越权 |
 * | build-complete    | L144-147 | build_mode/isolation 必须已设                      | kernel checkTransitionPreconditions ✓ |
 * | build-complete    | L148     | validate_enum isolation ∈ {branch,worktree}        | kernel checkTransitionPreconditions ✓（set 闸外的纵深防线）|
 * | build-complete    | L150-153 | preset=full ∧ build_mode=direct → direct_override=true | kernel checkTransitionPreconditions ✓ |
 * | build-complete    | L156-161 | build_sha 冻结 = git HEAD stdout；取不到 → WARN 留原值（unborn 仓字面 "HEAD"，T6 怪癖）| kernel applyTransitionEffects ✓（WARN 由本文件据 buildShaMissing 发）|
 * | verify-pass       | L167-172 | verification_report 非空/非 null/文件存在          | kernel checkTransitionPreconditions ✓ |
 * | verify-pass       | L173-176 | branch_status == handled                           | kernel checkTransitionPreconditions ✓ |
 * | verify-pass       | L179-190 | track≠pm → agent/codex_review_result == pass       | kernel checkTransitionPreconditions ✓ |
 * | verify-pass       | L192-199 | barrier：build_sha 非空非 null ∧ HEAD 可取 ∧ 不等 → 双行 ERROR 拒 | kernel checkTransitionPreconditions ✓ |
 * | verify-pass       | L201-204 | verify_result=pass + verified_at=now               | kernel applyTransitionEffects ✓ |
 * | verify-fail       | L207-210 | verify_result=fail + build_sha=null + phase_status=in_progress | kernel applyTransitionEffects ✓（phase_status 在 flow）|
 * | archived          | L213-217 | archived=true + archived_at=now + phase_status=done | kernel applyTransitionEffects ✓（phase_status 在 flow）|
 * | 其它事件          | L219-221 | 无专属校验（open-complete/ship-complete/自定义相位事件）| kernel default 通行 ✓ |
 * 校验失败 = 任何写盘之前 exit 1（老仓 case 校验先于 cmd_set phase），ERROR 文案逐字对齐。
 * 文件存在性经 deps.guardCtx 注入（main.ts/harness 全量注入 = 真实校验；未注入 = lite
 * 降级跳过文件面、字段面仍全量——GUARD-RULES §7.2 同款降级口径）。
 */
import {
  applyStepTransition,
  applyTransitionEffects,
  checkTransitionPreconditions,
  eventEdge,
  IllegalTransitionError,
  loadWorkflow,
  planStepTransition,
  resolveWorkflowName,
} from '@pipeline-lite/kernel'
import type { Phase, TransitionContext, TransitionResult } from '@pipeline-lite/kernel'
import { errMsg, type CliDeps } from '../deps.js'
import { changeDir, isValidChangeName } from '../paths.js'
import { str } from '../render.js'

/** review 相位的 marker 指引文案（prose 保留本地，对齐老内核 state-transition.sh） */
function reviewHint(phase: Phase): string {
  switch (phase) {
    case 'explore': return 'design_doc（深度设计 / 调研 + 关键决策）'
    case 'spec': return 'plan / 用户旅程 / delta spec（实施计划）'
    case 'verify': return 'verification_report（验证结论）'
    default: return '（待复核）'
  }
}

/** 事件前置校验不满足：lines 逐行走 stderr（老内核 red() 逐行），exit 1、零写盘 */
class EventPreconditionError extends Error {
  constructor(public readonly lines: string[]) {
    super(lines[0] ?? 'transition 前置校验不满足')
  }
}

/**
 * 未知 event（default workflow 专属，非固定 8 事件表成员）：exit 1，stderr 文案对齐老内核。
 * Task 8 前此判定在锁外、读 state 前就早退；Task 8 后必须先读 state 判定 workflow（'' / 'default'
 * → 走这条固定 8 事件表校验），故此判定内移进锁、改为 throw 由现有 catch 统一落 stderr——default
 * workflow 未知 event 的可观测行为（exit 1 + 同一句 "ERROR: 未知 event: X" + 零写盘）逐字不变。
 */
class UnknownEventError extends Error {
  constructor(public readonly event: string) {
    super(`未知 event: ${event}`)
  }
}

/**
 * 非 default workflow 的配置/查找类错误（workflow 未找到 / 当前 step 不在图里 / event 不在当前 step
 * 的出边里）：exit 1。message 已是完整 stderr 行（含 `ERROR:` 前缀）。
 */
class WorkflowError extends Error {}

/** 非 default workflow 的 step guard 未通过：exit 2，lines 逐行走 stderr（phase 不变、零写盘）。 */
class StepGuardError extends Error {
  constructor(public readonly lines: string[]) {
    super(lines[0] ?? 'step guard 未通过')
  }
}

/**
 * 锁内转换结果的判别联合：default 携带 kernel flow 的 TransitionResult（供收尾复用原有整条链路），
 * 自定义 workflow 只携带 from/to step id（收尾只写 history + [TRANSITION]，无 breadcrumb/review-marker）。
 */
type TxnOutcome =
  | { readonly workflow: 'default'; readonly result: TransitionResult }
  | { readonly workflow: 'custom'; readonly from: string; readonly to: string }

export async function cmdTransition(deps: CliDeps, name: string, event: string): Promise<number> {
  if (!isValidChangeName(name)) {
    deps.io.err(`ERROR: change-name 非法: '${name}' (仅允许 a-z A-Z 0-9 - _)`)
    return 1
  }

  const dir = changeDir(deps.cwd, name)
  // kernel 单源注入面：文件存在性经 guardCtx（缺省降级跳过文件面），git HEAD 经 deps.gitHeadSha
  const txnCtx: TransitionContext = {
    fileExists: deps.guardCtx?.(name)?.fileExists,
    gitHeadSha: deps.gitHeadSha,
  }
  let outcome: TxnOutcome
  try {
    outcome = await deps.store.withLock(dir, async (): Promise<TxnOutcome> => {
      const state = await deps.store.read(dir)
      // 双轨分岔（读完 state 立刻按 workflow 字段分流；'' 历史遗留兜 'default'——习语单源在
      // kernel resolveWorkflowName）：default 走原有整条固定 8 事件表链路一行不改；非 default 走全新、
      // 更简单的 step-transitions 链路，两条链路除共用「读 state」「写 history」外不共享任何中间步骤。
      const workflowName = resolveWorkflowName(state)
      if (workflowName === 'default') {
        const edge = eventEdge(event)
        if (!edge) throw new UnknownEventError(event)
        const current = str(state.fields.phase)
        if (current !== edge.from) {
          throw new IllegalTransitionError(current as Phase, edge.to)
        }
        const violations = await checkTransitionPreconditions(event, state, txnCtx)
        if (violations) throw new EventPreconditionError(violations)
        const r = deps.flow.transition(state, edge.to, deps.clock)
        const eff = await applyTransitionEffects(event, r.state, deps.clock, txnCtx)
        if (eff.buildShaMissing) {
          deps.io.err('WARN: build-complete 未取到 git HEAD（非 git 仓？）build_sha 留空，verify 不做 SHA 校验')
        }
        await deps.store.write(dir, r.state)
        return { workflow: 'default', result: r }
      }

      // ── 非 default workflow：接受任意 event 名，按当前 step 自己声明的 transitions 查目标 step ──
      const wf = loadWorkflow(deps.cwd, workflowName)
      if (!wf) {
        throw new WorkflowError(`ERROR: workflow '${workflowName}' 未找到（期望 .pipeline/workflows/${workflowName}.yaml）`)
      }
      // 解析 step/找边/评 guard 编排在 kernel planStepTransition 单源（guard 求值针对「正在
      // 退出的」当前 step、找边先于评 guard 的次序都钉在 kernel）；本文件只做 kind→异常/exit
      // 映射，错误消息模板逐字保持在 adapter。
      const plan = planStepTransition(wf, state, event, { changeDirAbs: dir })
      if (!plan.ok) {
        if (plan.kind === 'step-not-in-graph') {
          throw new WorkflowError(`ERROR: step '${plan.stepId}' 不在 workflow '${workflowName}' 里`)
        }
        if (plan.kind === 'event-unsupported') {
          const available = plan.available.join(', ') || '(无)'
          throw new WorkflowError(
            `ERROR: step '${plan.stepId}' 不支持 event '${event}'；该 step 支持：${available}`,
          )
        }
        throw new StepGuardError([`ERROR: step '${plan.stepId}' guard 未通过：`, ...plan.failures])
      }
      // 同一把锁内改写 phase 到目标 step id 并落盘（kernel applyStepTransition 纯变换
      // phase+updated_at；无 kernel flow：自定义 phase 序不在硬编码相位图里）
      await deps.store.write(dir, applyStepTransition(state, plan.to, deps.clock))
      return { workflow: 'custom', from: plan.from, to: plan.to }
    })
  } catch (e) {
    if (e instanceof EventPreconditionError) {
      for (const line of e.lines) deps.io.err(line)
      return 1
    }
    if (e instanceof IllegalTransitionError) {
      deps.io.err(`ERROR: ${e.message}`)
      return 1
    }
    if (e instanceof UnknownEventError) {
      deps.io.err(`ERROR: 未知 event: ${event}`)
      return 1
    }
    if (e instanceof WorkflowError) {
      deps.io.err(e.message)
      return 1
    }
    if (e instanceof StepGuardError) {
      for (const line of e.lines) deps.io.err(line)
      return 2
    }
    deps.io.err(`ERROR: ${errMsg(e)}`)
    return 1
  }

  // ── 非 default workflow 收尾：只写 history（raw=event，保持「transition-kind 的 raw = 触发它的
  //    event 名」这条不变式）+ 一行 [TRANSITION] stderr 成功信号。breadcrumb / review-marker 是
  //    default workflow 专属收尾，自定义 workflow 本轮不做（诚实登记的 scope cut，见 task-8 brief）。──
  if (outcome.workflow === 'custom') {
    if (deps.history) {
      try {
        await deps.history.append(dir, {
          ts: deps.clock(),
          kind: 'transition',
          from: outcome.from,
          to: outcome.to,
          raw: event,
        })
      } catch (e) {
        deps.io.err(`WARN: history 写入失败: ${errMsg(e)}`)
      }
    }
    deps.io.err(`[TRANSITION] ${name}: ${outcome.from} -> ${outcome.to}`)
    return 0
  }

  // ── default workflow 收尾：与改动前逐字一致（breadcrumb → history → review-marker → [TRANSITION]）──
  const result = outcome.result
  if (deps.writeBreadcrumb) {
    try {
      await deps.writeBreadcrumb(dir, `pipeline:${name} phase=${result.to}\n`)
    } catch (e) {
      deps.io.err(`WARN: breadcrumb 写入失败: ${errMsg(e)}`)
    }
  }
  if (deps.history) {
    try {
      await deps.history.append(dir, {
        ts: deps.clock(),
        kind: 'transition',
        from: result.from,
        to: result.to,
        raw: event, // 老仓 transitions_history.event 对位（与 legacy.ts 导入映射同口径）
      })
    } catch (e) {
      deps.io.err(`WARN: history 写入失败: ${errMsg(e)}`)
    }
  }
  // 阶段复核硬闸 marker：进入 review 相位 → 落 .pipeline-pending-review（单一真相源 =
  // manifest.reviewPhases；老内核 state-transition.sh 同款三行格式：相位\n指引\nchange 名）。
  if (deps.writeReviewMarker && deps.flow.manifest.reviewPhases.includes(result.to)) {
    try {
      await deps.writeReviewMarker(`${result.to}\n${reviewHint(result.to)}\n${name}\n`)
    } catch (e) {
      deps.io.err(`WARN: review marker 写入失败: ${errMsg(e)}`)
    }
  }

  deps.io.err(`[TRANSITION] ${name}: ${result.from} -> ${result.to}`)
  return 0
}
