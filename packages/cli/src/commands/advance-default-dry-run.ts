import type { CliDeps } from '../deps.js'
import {
  approvedReviewReceipt,
  forwardStep,
  freshHardGate,
  guardQuietly,
  reviewReceiptStop,
} from './advance-support.js'

/** Preview the default workflow without mutating state. Only the current guard is evaluated live. */
export async function dryRunDefaultPlan(
  deps: CliDeps,
  name: string,
  start: string,
  through: boolean,
  maxSteps: number,
  reviewSteps: readonly string[],
): Promise<number> {
  deps.io.out(
    `[DRY-RUN] ${name}: 计划预览（不改盘）从 ${start} 起` +
      `（max-steps=${maxSteps}${through ? '，through-gates' : ''}）`,
  )
  const hard = await freshHardGate(deps)
  if (hard) {
    deps.io.out(
      `  预计停在 ${start}: 硬门 .pipeline-pending-${hard} 新鲜存在，绝不自动跨越（HITL 红线）`,
    )
    return 0
  }

  const startForward = forwardStep(deps, start)
  if (reviewSteps.includes(start) && startForward !== undefined) {
    if (!through) {
      deps.io.out(`  预计停在 ${start}: 复核相位（HITL 门，确认后可用 --through-gates 继续）`)
      return 0
    }
    const approved = await approvedReviewReceipt(deps, name, start, startForward.event)
    if (approved === null) return 1
    if (!approved) {
      reviewReceiptStop(deps, name, start, startForward.event, true)
      return 0
    }
  }
  if (!startForward) {
    deps.io.out(`  预计停在 ${start}: 已到终态`)
    return 0
  }

  const guard = await guardQuietly(deps, name)
  if (guard.code !== 0) {
    deps.io.out(`  guard@${start} 未通过 → 预计停在 ${start}（不推进）`)
    for (const line of guard.lines) {
      if (line.includes('[FAIL]')) deps.io.out(`  ${line.trim()}`)
    }
    return 0
  }
  deps.io.out(`  guard@${start}: 通过`)

  let current = start
  let steps = 0
  const visited = new Set<string>()
  while (steps < maxSteps) {
    const forward = forwardStep(deps, current)
    if (!forward) {
      deps.io.out(`  预计停在 ${current}: 已到终态`)
      return 0
    }
    deps.io.out(
      `  计划 ${steps + 1}: ${current} -> ${forward.to}（${forward.event}）` +
        `${steps === 0 ? '' : '  [live-guard]'}`,
    )
    visited.add(current)
    current = forward.to
    steps += 1
    if (reviewSteps.includes(current)) {
      if (!through) {
        deps.io.out(`  预计停在 ${current}: 复核相位（HITL 门，确认后可用 --through-gates 继续）`)
      } else {
        const next = forwardStep(deps, current)
        if (next) reviewReceiptStop(deps, name, current, next.event, true)
      }
      return 0
    }
    if (visited.has(current)) {
      deps.io.out(`  预计停在 ${current}: 检测到环，停`)
      return 0
    }
  }
  deps.io.out(`  预计在 ${current} 触及 --max-steps=${maxSteps} 上限`)
  return 0
}
