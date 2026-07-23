/**
 * automation 字段生命周期状态机（BACKLOG #29b）。
 *
 * 老仓真相源：state-fields.sh:110/154（8 态枚举校验）+ DESIGN.md §2（状态机图）+
 * scheduler/scheduler.ts:71-201（writeBackSuccess / applyFailure 的落态逻辑）。
 *
 * 本模块是**纯状态机**：合法转换表 + 分级落态判定，零副作用、零 fs、可穷举单测。
 * 与老仓差异（有意）：把 running 的成功出口按 L1→L3 分级拆成 merged(L3) / paused(L1/L2)，
 * 兑现 GOAL A5「默认 report-only、毕业制升档」——安全默认不自动 merge。
 */
import { type AutomationLevel, type AutomationState, type FailureKind } from '../types.js'

/**
 * 合法转换表（from → 允许的 to 集合）。DESIGN §2 状态机 + 运维态（paused/reconcile/重跑）。
 * paused（老仓 ROUND-13 单 change 运维暂停）：queued↔paused 互转；L2 人工放行 paused→merged。
 */
export const LEGAL_AUTOMATION_TRANSITIONS: Readonly<Record<AutomationState, readonly AutomationState[]>> = {
  // spec-complete + 双开关 ON → 入队
  off: ['queued'],
  // 调度器 claim → scheduled；运维 pause；人工取消入队（老仓 guard 提示 `set automation off`）
  queued: ['scheduled', 'paused', 'off'],
  // 起容器 → running；crash-reconcile 卡死重置回 queued；直接失败/冲突；运维暂停
  scheduled: ['running', 'queued', 'failed', 'conflict', 'paused'],
  // build→verify→ship 四出口 + L1/L2 report-only 停 paused
  running: ['merged', 'queued', 'failed', 'conflict', 'paused'],
  // 合并完回归正常（进 archive）
  merged: ['off'],
  // 人工重跑（attempts 清零）/ 取消
  failed: ['queued', 'off'],
  // 人工接管后重跑 / 取消
  conflict: ['queued', 'off'],
  // resume 回 queued；L2 人工在 dashboard 放行合并；取消
  paused: ['queued', 'merged', 'off'],
}

export class IllegalAutomationTransitionError extends Error {
  override readonly name = 'IllegalAutomationTransitionError'
  readonly _tag = 'IllegalAutomationTransitionError'
  constructor(
    readonly from: AutomationState,
    readonly to: AutomationState,
  ) {
    super(`illegal automation transition: ${from} -> ${to}`)
  }
}

/** from→to 是否合法（自环恒非法：终态复活 / 无变化都不该走 transition）。 */
export function isLegalAutomationTransition(from: AutomationState, to: AutomationState): boolean {
  return LEGAL_AUTOMATION_TRANSITIONS[from].includes(to)
}

/** 非法 → throw；合法 → no-op（调用面据此 fail-loud，绝不写脏态）。 */
export function assertAutomationTransition(from: AutomationState, to: AutomationState): void {
  if (!isLegalAutomationTransition(from, to)) {
    throw new IllegalAutomationTransitionError(from, to)
  }
}

/**
 * L1→L3 分级放权合体核心：一次成功 run 该落哪个终态。
 *   - L3（unattended）→ merged 候选；真实 merge 仍须先过 lifecycle 的 verifier + allowlist/denylist
 *   - L1（report-only, 默认）/ L2（人工门）→ paused（跑完停下，等人工复核 / 放行）
 * 这是「默认 report-only、不自动 merge、安全」的落点（GOAL A5）。
 */
export function settleSuccess(level: AutomationLevel): 'merged' | 'paused' {
  return level === 'L3' ? 'merged' : 'paused'
}

/**
 * 一次失败 run 该落哪个态（老仓 scheduler/scheduler.ts:156-201 applyFailure）。
 *   - conflict 类（merge 冲突 / barrier drift / abort）→ conflict，绝不重试、留现场。
 *   - retry 类（verify-fail / 瞬态 exec）→ attemptsAfterIncr > maxRetries 则 failed（预算耗尽），
 *     否则回 queued 重试。scheduler 通过 queue/claim.ts::commitFailureOwned 在真 fs 锁内把
 *     attempts、诊断字段与目标态一次提交。
 */
export function settleFailure(kind: FailureKind, attemptsAfterIncr: number, maxRetries: number): 'queued' | 'failed' | 'conflict' {
  if (kind === 'conflict') return 'conflict'
  return attemptsAfterIncr > maxRetries ? 'failed' : 'queued'
}
