/**
 * 看板拖拽换列 → 转换 event 的规划（纯函数，G17 泛化版）。
 * 规则来源不再写死 default 七相位常量，改为注入 WorkflowRules（default 走
 * workflowModel.DEFAULT_RULES，自定义 workflow 走 API 拉取的映射）——每张卡按
 * 它自己所属 workflow 的转换图判定合法性与 event 名。
 * 回退语义：目标 step 在 rules.steps 里的序号 < 当前 step 序号 = 回退边（UI 需二次确认）。
 */
import type { WorkflowRules } from '../model/workflowModel'

export interface PlannedTransition {
  event: string
  from: string
  to: string
  /** 回退边（如 default 的 verify→build verify-fail）——语义上是"打回重做"，UI 需二次确认。 */
  backward: boolean
}

export function plannedTransition(rules: WorkflowRules, fromStep: string, toStep: string): PlannedTransition | null {
  if (fromStep === toStep) return null
  const fromIdx = rules.steps.indexOf(fromStep)
  const toIdx = rules.steps.indexOf(toStep)
  if (fromIdx === -1 || toIdx === -1) return null
  const edge = (rules.transitions[fromStep] ?? []).find((t) => t.to === toStep)
  if (!edge) return null
  return { event: edge.event, from: fromStep, to: toStep, backward: toIdx < fromIdx }
}

/** 该 step 此刻声明的合法目标（供列高亮/快捷按钮渲染），顺序保持 workflow 定义里的出边序。 */
export function legalTargets(rules: WorkflowRules, step: string): readonly string[] {
  return (rules.transitions[step] ?? []).map((t) => t.to).filter((to) => to !== step)
}
