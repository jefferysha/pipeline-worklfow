/**
 * 看板拖拽换列 → 转换 event 的规划（纯函数）。
 * 拖一张卡从其当前 phase 列到目标 phase 列 → 计算合法 event；非法边 → null（视觉回弹）。
 * 边表逐字镜像 server/src/transition.ts；合法性以 types.ts TRANSITIONS 为准（manifest 单源镜像）。
 */
import type { ChangeSnapshot, Phase } from '../types'
import { EVENT_BY_EDGE, TRANSITIONS, isPhase } from '../types'

export interface PlannedTransition {
  event: string
  from: Phase
  to: Phase
  /** 回退边（verify→build 的 verify-fail）—— 语义上是"打回重做"，UI 需二次确认。 */
  backward: boolean
}

/** 目标序号 < 当前序号 = 回退边。 */
const ORDER: Record<Phase, number> = {
  open: 0, explore: 1, spec: 2, build: 3, verify: 4, ship: 5, archive: 6,
}

export function plannedTransition(fromPhase: string, toPhase: string): PlannedTransition | null {
  if (!isPhase(fromPhase) || !isPhase(toPhase)) return null
  if (fromPhase === toPhase) return null
  const legal = TRANSITIONS[fromPhase]
  if (!legal.includes(toPhase)) return null
  const event = EVENT_BY_EDGE[`${fromPhase}->${toPhase}`]
  if (!event) return null
  return { event, from: fromPhase, to: toPhase, backward: ORDER[toPhase] < ORDER[fromPhase] }
}

/** 该 change 从当前相位可拖去的合法目标相位（供列高亮/可落判定）。 */
export function legalTargets(c: ChangeSnapshot): readonly Phase[] {
  if (!isPhase(c.phase)) return []
  return TRANSITIONS[c.phase].filter((p) => p !== c.phase)
}
