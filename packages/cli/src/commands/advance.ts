/**
 * advance <name> —— auto-transition 中间档（BACKLOG #31 / GOAL B14·D12：对标 Comet AUTO-TRANSITION）。
 *
 * 立场：老仓只有「纯 HITL」（guard 只校验，推进权全在人手，pipeline-guard.sh:635 明写"永不
 * auto-transition"）与「重型 AFK」（automation 子系统）两极，缺中间档。本命令补上：
 * **guard 全绿 → 自动推进到下一相位，反复直到撞上三门／终态／guard 不过就停**——比手动逐条
 * 敲 transition 省事，又比 Comet「一路推到底」更严：**绝不跨越三门自动跑完**（HITL 红线）。
 *
 * 编排（复用现有命令函数，不重造）：循环
 *   读当前相位 → forwardStep（manifest.transitions 单一真相源求前向事件）
 *   → 终态？停 · 硬门（confirm/interaction marker 新鲜）？停 · 复核相位（reviewPhases，默认）？停
 *   → cmdCheck（guard）不过？停 → cmdTransition 单步推进 → 循环。
 *
 * 停点规则（优先级自上而下，每轮重判）：
 *   1. 终态：当前相位无前向事件（archive）→ 停（推进完成）。
 *   2. 硬门：项目根 `.pipeline-pending-confirm` / `-interaction` 新鲜（age ≤ 分级 TTL）→ 停。
 *      **三门是硬门，--through-gates 也绝不放行**（HITL 红线；review 门经 reviewPhases 判定）。
 *   3. 复核相位（manifest.reviewPhases 单一真相源）：默认停（不自动离开 explore/spec/verify）；
 *      `--through-gates` 显式放行才继续（但仍受 2 的硬门约束）。
 *   4. guard 不过（cmdCheck exit≠0）→ 停（exit 2 沿用 check 口径）。
 *   5. --max-steps 封顶：防失控保险丝（默认 12，足够 open→archive 六步）。
 * `--dry-run`：只报计划、只读不写盘（当前相位 guard 真判，后续步运行时 live-guard）。
 *
 * exit：0（推进完成/停在门/终态/dry-run）；2（停因 guard 不过）；1（名非法/读失败/transition 出错）。
 * 未接入 program（收编接线由主会话统一做）——本文件只 export cmdAdvance。
 *
 * 双轨（对齐 transition/check 先例）：读完 state 按 workflow 字段分流（习语单源 kernel
 * resolveWorkflowName）。default → 上述 manifest 前向边链路逐字不变；非 default → 按该 workflow
 * 的 step-transitions 图推进（cmdAdvanceCustom，停点规则见该函数头）——此前 advance 只认 default
 * manifest，自定义 workflow 的 change 会被 forwardStep 误判成"终态"而永远无法 auto-advance。
 */
import { GATE_TTL_MS, loadWorkflow, resolveStep, resolveWorkflowName } from '@pipeline-lite/kernel'
import type { GateKind, Phase, WorkflowDef } from '@pipeline-lite/kernel'
import { errMsg, type CliDeps } from '../deps.js'
import { EVENTS } from '../events.js'
import { changeDir, isValidChangeName } from '../paths.js'
import { str } from '../render.js'
import { cmdCheck } from './check.js'
import { cmdTransition } from './transition.js'

export interface AdvanceOpts {
  /** 防失控保险丝：最多自动推进的步数（默认 12） */
  maxSteps?: number
  /** 只报计划、不改盘 */
  dryRun?: boolean
  /** 显式放行复核相位（默认在复核相位停；但 confirm/interaction 硬门仍绝不跨越） */
  throughGates?: boolean
}

const DEFAULT_MAX_STEPS = 12
/** 三门里的两类「硬人门」（review 门另经 reviewPhases 判定）；这两类 --through-gates 也不放行 */
const HARD_GATES: readonly GateKind[] = ['confirm', 'interaction']

interface ForwardStep {
  event: string
  to: Phase
}

/**
 * 从当前相位求「前向」事件：manifest.transitions（单一真相源）里目标相位序号 > 当前序号者
 * （排除 verify-fail 回退边与 archive 自环）；事件名取自 events.ts 边表。终态/未知相位 → undefined。
 */
function forwardStep(deps: CliDeps, current: string): ForwardStep | undefined {
  const phases = deps.flow.manifest.phases
  const idx = phases.indexOf(current as Phase)
  if (idx < 0) return undefined
  const targets = deps.flow.manifest.transitions[current as Phase] ?? []
  const to = targets.find((t) => phases.indexOf(t) > idx)
  if (to === undefined) return undefined
  const entry = Object.entries(EVENTS).find(([, e]) => e.from === current && e.to === to)
  return entry ? { event: entry[0], to } : undefined
}

/** 新鲜的 confirm/interaction 硬门（同 inbox/gate.sh 分级 TTL 判定）；绝不自动跨越 */
async function freshHardGate(deps: CliDeps): Promise<GateKind | undefined> {
  const markers = (await deps.readGateMarkers?.()) ?? []
  for (const m of markers) {
    if (HARD_GATES.includes(m.kind) && m.ageMs <= GATE_TTL_MS[m.kind]) return m.kind
  }
  return undefined
}

/** 复用 cmdCheck 跑 guard，人读输出收进缓冲（停点报告时才回显 [FAIL] 明细） */
async function guardQuietly(deps: CliDeps, name: string): Promise<{ code: number; lines: string[] }> {
  const lines: string[] = []
  const sub: CliDeps = { ...deps, io: { out: (l) => lines.push(l), err: (l) => lines.push(l) } }
  const code = await cmdCheck(sub, name)
  return { code, lines }
}

/** 复用 cmdTransition 单步转换，输出收进缓冲（出错才回显） */
async function transitionQuietly(deps: CliDeps, name: string, event: string): Promise<{ code: number; lines: string[] }> {
  const lines: string[] = []
  const sub: CliDeps = { ...deps, io: { out: (l) => lines.push(l), err: (l) => lines.push(l) } }
  const code = await cmdTransition(sub, name, event)
  return { code, lines }
}

function isReviewPhase(deps: CliDeps, phase: string): boolean {
  return (deps.flow.manifest.reviewPhases as readonly string[]).includes(phase)
}

export async function cmdAdvance(deps: CliDeps, name: string, opts: AdvanceOpts = {}): Promise<number> {
  if (!isValidChangeName(name)) {
    deps.io.err(`ERROR: change-name 非法: '${name}' (仅允许 a-z A-Z 0-9 - _)`)
    return 1
  }
  const maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS
  const through = opts.throughGates ?? false

  let startPhase: string
  let workflowName: string
  try {
    const state = await deps.store.read(changeDir(deps.cwd, name))
    startPhase = str(state.fields.phase)
    workflowName = resolveWorkflowName(state)
  } catch (e) {
    deps.io.err(`ERROR: ${errMsg(e)}`)
    return 1
  }

  // 双轨分岔（对齐 transition/check：读完 state 立刻按 workflow 字段分流，习语单源在 kernel
  // resolveWorkflowName）：default 走下方原有 manifest 前向边链路一行不改；非 default 走
  // step-transitions 图的自定义推进链路（此前 advance 只认 default manifest——自定义 workflow
  // 的 change 会被 forwardStep 误判成"终态"，功能缺口在此补上）。
  if (workflowName !== 'default') {
    return cmdAdvanceCustom(deps, name, workflowName, startPhase, through, maxSteps, opts.dryRun ?? false)
  }

  if (opts.dryRun) return dryRunPlan(deps, name, startPhase, through, maxSteps)

  deps.io.out(`[ADVANCE] ${name}: 从 ${startPhase} 起步（max-steps=${maxSteps}${through ? '，through-gates' : ''}）`)
  let current = startPhase
  let steps = 0
  for (;;) {
    const fwd = forwardStep(deps, current)
    if (!fwd) {
      deps.io.out(`[STOP] ${name} @ ${current}: 已到终态，无后继事件（推进完成）`)
      return 0
    }
    // 硬门：三门里的 confirm/interaction 绝不自动跨越（--through-gates 也不行）——HITL 红线
    const hard = await freshHardGate(deps)
    if (hard) {
      deps.io.out(`[STOP] ${name} @ ${current}: 硬门 .pipeline-pending-${hard} 新鲜存在——三门绝不自动跨越（HITL 红线）`)
      return 0
    }
    // 复核相位：默认停给人复核，不自动离开 explore/spec/verify（reviewPhases 单一真相源）
    if (!through && isReviewPhase(deps, current)) {
      deps.io.out(`[STOP] ${name} @ ${current}: 复核相位（HITL 门），停给人复核——--through-gates 可显式放行`)
      return 0
    }
    if (steps >= maxSteps) {
      deps.io.out(`[STOP] ${name} @ ${current}: 达到 --max-steps=${maxSteps} 上限，停（防失控保险丝）`)
      return 0
    }
    // guard 必须全绿才推进（复用 cmdCheck）
    const g = await guardQuietly(deps, name)
    if (g.code !== 0) {
      deps.io.out(`[STOP] ${name} @ ${current}: guard 未通过，停（修复后重试）`)
      for (const l of g.lines) if (l.includes('[FAIL]')) deps.io.out(`  ${l.trim()}`)
      return g.code === 2 ? 2 : 1
    }
    // 单步推进（复用 cmdTransition，含事件前置校验 + 副作用 + review marker 落盘）
    const t = await transitionQuietly(deps, name, fwd.event)
    if (t.code !== 0) {
      deps.io.out(`[STOP] ${name} @ ${current}: transition ${fwd.event} 失败，停`)
      for (const l of t.lines) deps.io.out(`  ${l.trim()}`)
      return 1
    }
    deps.io.out(`[ADVANCE] ${name}: ${current} -> ${fwd.to}（${fwd.event}）`)
    current = fwd.to
    steps += 1
  }
}

/** --dry-run：只读推演出计划，绝不写盘（当前相位 guard 真判，后续步运行时 live-guard）。 */
async function dryRunPlan(
  deps: CliDeps,
  name: string,
  start: string,
  through: boolean,
  maxSteps: number,
): Promise<number> {
  deps.io.out(`[DRY-RUN] ${name}: 计划预览（不改盘）从 ${start} 起（max-steps=${maxSteps}${through ? '，through-gates' : ''}）`)
  const hard = await freshHardGate(deps)
  if (hard) {
    deps.io.out(`  预计停在 ${start}: 硬门 .pipeline-pending-${hard} 新鲜存在，绝不自动跨越（HITL 红线）`)
    return 0
  }
  if (!through && isReviewPhase(deps, start)) {
    deps.io.out(`  预计停在 ${start}: 复核相位（HITL 门，--through-gates 放行）`)
    return 0
  }
  if (!forwardStep(deps, start)) {
    deps.io.out(`  预计停在 ${start}: 已到终态`)
    return 0
  }
  // 当前相位 guard 真判（只读）
  const g = await guardQuietly(deps, name)
  if (g.code !== 0) {
    deps.io.out(`  guard@${start} 未通过 → 预计停在 ${start}（不推进）`)
    for (const l of g.lines) if (l.includes('[FAIL]')) deps.io.out(`  ${l.trim()}`)
    return 0
  }
  deps.io.out(`  guard@${start}: 通过`)

  let current = start
  let steps = 0
  const visited = new Set<string>()
  while (steps < maxSteps) {
    const fwd = forwardStep(deps, current)
    if (!fwd) {
      deps.io.out(`  预计停在 ${current}: 已到终态`)
      return 0
    }
    deps.io.out(`  计划 ${steps + 1}: ${current} -> ${fwd.to}（${fwd.event}）${steps === 0 ? '' : '  [live-guard]'}`)
    visited.add(current)
    current = fwd.to
    steps += 1
    if (!through && isReviewPhase(deps, current)) {
      deps.io.out(`  预计停在 ${current}: 复核相位（HITL 门，--through-gates 放行）`)
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

// ════ 非 default workflow：按 step-transitions 图自动推进（功能缺口补完）════

/**
 * 自定义 workflow 的停点规则（优先级自上而下，每轮重判；与 default 档同构）：
 *   1. 终态：当前 step 零出边 → 停（推进完成）。
 *   2. 硬门 marker：.pipeline-pending-confirm/-interaction 新鲜 → 停——HITL 红线跨轨统一，
 *      --through-gates 也绝不放行（marker 是 hooks 落的"人正被询问"项目级信号，与 workflow 无关）。
 *   3. step.gate 人门（推进前检查，管的是"自动离开"）：gate=confirm 绝不放行（对位 default 轨的
 *      confirm 硬门语义）；gate=review 默认停给人复核、--through-gates 显式放行（对位 default 轨的
 *      reviewPhases）。取舍说明：transition/check 对 gate 不做任何拦截（人手动敲 transition 本身
 *      就是过门动作）——这与 default 轨 reviewPhases 的关系完全一致（manual transition 照走复核
 *      相位，只有 advance 这类自动推进在门前停），gate 是 automation 面约束、不是 transition 面约束。
 *   4. 多条出边：走向分岔，事件选择权在人（HITL）——自动推进只吃"恰 1 条出边"的确定形，停并列出
 *      可选 events。
 *   5. --max-steps 封顶（防失控保险丝，自定义图允许环，这条保险丝更要紧）。
 *   6. guard 不过（复用 cmdCheck 自定义分支 → kernel evaluateStepGuards 单源）→ 停（exit 2 沿用
 *      check 口径）。
 * 推进复用 cmdTransition 自定义分支（withLock 内读-判-写 + applyStepTransition + history 落账），
 * 与 default 档复用 cmdCheck/cmdTransition 的编排姿势逐字同构；输出同款 [ADVANCE]/[STOP] 前缀。
 */
async function cmdAdvanceCustom(
  deps: CliDeps,
  name: string,
  workflowName: string,
  startPhase: string,
  through: boolean,
  maxSteps: number,
  dryRun: boolean,
): Promise<number> {
  // workflow 加载/校验先于任何输出与写盘（fail-loud，措辞逐字对齐 transition/check 自定义分支）
  let wf: WorkflowDef | null
  try {
    wf = loadWorkflow(deps.cwd, workflowName)
  } catch (e) {
    deps.io.err(`ERROR: ${errMsg(e)}`)
    return 1
  }
  if (!wf) {
    deps.io.err(`ERROR: workflow '${workflowName}' 未找到（期望 .pipeline/workflows/${workflowName}.yaml）`)
    return 1
  }
  if (!resolveStep(wf, startPhase)) {
    deps.io.err(`ERROR: step '${startPhase}' 不在 workflow '${workflowName}' 里`)
    return 1
  }

  if (dryRun) return dryRunCustomPlan(deps, name, wf, workflowName, startPhase, through, maxSteps)

  deps.io.out(`[ADVANCE] ${name}: 从 ${startPhase} 起步（max-steps=${maxSteps}${through ? '，through-gates' : ''}）`)
  let current = startPhase
  let steps = 0
  for (;;) {
    const step = resolveStep(wf, current)
    if (!step) {
      deps.io.err(`ERROR: step '${current}' 不在 workflow '${workflowName}' 里`)
      return 1
    }
    if (step.transitions.length === 0) {
      deps.io.out(`[STOP] ${name} @ ${current}: 已到终态，无后继事件（推进完成）`)
      return 0
    }
    // 硬门 marker：confirm/interaction 新鲜绝不自动跨越（--through-gates 也不行）——同 default 档
    const hard = await freshHardGate(deps)
    if (hard) {
      deps.io.out(`[STOP] ${name} @ ${current}: 硬门 .pipeline-pending-${hard} 新鲜存在——三门绝不自动跨越（HITL 红线）`)
      return 0
    }
    // step 自带人门：confirm 绝不自动跨越；review 默认停给人复核（--through-gates 显式放行）
    if (step.gate === 'confirm') {
      deps.io.out(`[STOP] ${name} @ ${current}: step gate 'confirm'（human gate）——绝不自动跨越（HITL 红线）`)
      return 0
    }
    if (step.gate === 'review' && !through) {
      deps.io.out(`[STOP] ${name} @ ${current}: step gate 'review'（HITL 门），停给人复核——--through-gates 可显式放行`)
      return 0
    }
    // 多条出边 = 走向分岔，事件选择权在人（HITL）
    if (step.transitions.length > 1) {
      const events = step.transitions.map((t) => t.event).join(', ')
      deps.io.out(`[STOP] ${name} @ ${current}: 多条出边需人选 event（HITL），手动 transition 其一：${events}`)
      return 0
    }
    if (steps >= maxSteps) {
      deps.io.out(`[STOP] ${name} @ ${current}: 达到 --max-steps=${maxSteps} 上限，停（防失控保险丝）`)
      return 0
    }
    // guard 必须全绿才推进（复用 cmdCheck：自定义分支走 kernel evaluateStepGuards 单源）
    const g = await guardQuietly(deps, name)
    if (g.code !== 0) {
      deps.io.out(`[STOP] ${name} @ ${current}: guard 未通过，停（修复后重试）`)
      for (const l of g.lines) if (l.includes('[FAIL]')) deps.io.out(`  ${l.trim()}`)
      return g.code === 2 ? 2 : 1
    }
    // 单步推进（复用 cmdTransition 自定义分支：withLock 内读-判-写 + history 落账）
    const edge = step.transitions[0]!
    const t = await transitionQuietly(deps, name, edge.event)
    if (t.code !== 0) {
      deps.io.out(`[STOP] ${name} @ ${current}: transition ${edge.event} 失败，停`)
      for (const l of t.lines) deps.io.out(`  ${l.trim()}`)
      return 1
    }
    deps.io.out(`[ADVANCE] ${name}: ${current} -> ${edge.to}（${edge.event}）`)
    current = edge.to
    steps += 1
  }
}

/** --dry-run（自定义轨）：只读推演计划，绝不写盘（当前 step guard 真判，后续步运行时 live-guard）。 */
async function dryRunCustomPlan(
  deps: CliDeps,
  name: string,
  wf: WorkflowDef,
  workflowName: string,
  start: string,
  through: boolean,
  maxSteps: number,
): Promise<number> {
  deps.io.out(`[DRY-RUN] ${name}: 计划预览（不改盘）从 ${start} 起（max-steps=${maxSteps}${through ? '，through-gates' : ''}）`)
  const hard = await freshHardGate(deps)
  if (hard) {
    deps.io.out(`  预计停在 ${start}: 硬门 .pipeline-pending-${hard} 新鲜存在，绝不自动跨越（HITL 红线）`)
    return 0
  }
  const startStep = resolveStep(wf, start)
  if (!startStep) {
    // 防御：调用侧已校验；措辞同 transition/check
    deps.io.err(`ERROR: step '${start}' 不在 workflow '${workflowName}' 里`)
    return 1
  }
  if (startStep.gate === 'confirm') {
    deps.io.out(`  预计停在 ${start}: step gate 'confirm'（human gate，绝不自动跨越）`)
    return 0
  }
  if (startStep.gate === 'review' && !through) {
    deps.io.out(`  预计停在 ${start}: step gate 'review'（HITL 门，--through-gates 放行）`)
    return 0
  }
  if (startStep.transitions.length === 0) {
    deps.io.out(`  预计停在 ${start}: 已到终态`)
    return 0
  }
  if (startStep.transitions.length > 1) {
    deps.io.out(`  预计停在 ${start}: 多条出边需人选 event（可选: ${startStep.transitions.map((t) => t.event).join(', ')}）`)
    return 0
  }
  // 当前 step guard 真判（只读，cmdCheck 自定义分支）
  const g = await guardQuietly(deps, name)
  if (g.code !== 0) {
    deps.io.out(`  guard@${start} 未通过 → 预计停在 ${start}（不推进）`)
    for (const l of g.lines) if (l.includes('[FAIL]')) deps.io.out(`  ${l.trim()}`)
    return 0
  }
  deps.io.out(`  guard@${start}: 通过`)

  let current = start
  let steps = 0
  const visited = new Set<string>()
  while (steps < maxSteps) {
    const step = resolveStep(wf, current)
    if (!step) {
      deps.io.err(`ERROR: step '${current}' 不在 workflow '${workflowName}' 里`)
      return 1
    }
    if (step.transitions.length === 0) {
      deps.io.out(`  预计停在 ${current}: 已到终态`)
      return 0
    }
    if (step.transitions.length > 1) {
      deps.io.out(`  预计停在 ${current}: 多条出边需人选 event（可选: ${step.transitions.map((t) => t.event).join(', ')}）`)
      return 0
    }
    const edge = step.transitions[0]!
    deps.io.out(`  计划 ${steps + 1}: ${current} -> ${edge.to}（${edge.event}）${steps === 0 ? '' : '  [live-guard]'}`)
    visited.add(current)
    current = edge.to
    steps += 1
    const entered = resolveStep(wf, current)
    if (entered?.gate === 'confirm') {
      deps.io.out(`  预计停在 ${current}: step gate 'confirm'（human gate，绝不自动跨越）`)
      return 0
    }
    if (entered?.gate === 'review' && !through) {
      deps.io.out(`  预计停在 ${current}: step gate 'review'（HITL 门，--through-gates 放行）`)
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
