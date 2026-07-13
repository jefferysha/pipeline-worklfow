/**
 * loops graduation —— 分级放权 L1→L3 毕业制升降档裁决（BACKLOG #38 / GOAL B19 / D16 —— loop-engineering
 * 内建，两竞品都无此面的护城河：AFK 自动化必须从 L1 report-only 毕业制升级，不许直接上 L3）。
 *
 * ── Phased Rollout 语义盘点（对标 cobusgreyling/loop-engineering，MIT；仅适配语义，未复制代码；× 老仓 human_gates）──
 *   分级放权三档（enforcement = enforcementFor(level)）：
 *     · L1 report      —— report-only：人审所有输出，零自动 commit；即便 kill/熔断命中也只报告（#35/#36 已回显）。
 *     · L2 assisted    —— agent 提议、人工门（human_gates）放行 merge。
 *     · L3 unattended  —— allowlist 变更自动 merge，无人值守。
 *   **毕业制铁律**：只能逐级毕业（L1→L2→L3），绝不自动跨级（L1→L3 一步升被拒）；升档须过准入门；
 *   默认不自动改档（改 autonomy_level 需显式确认信号）。
 *
 * ── 升档准入判据（canGraduate；消费 #37 audit + #37 drift + #36 breaker + run-log 历史）──
 *   升 L2（自 L1）：loop-ready score ≥ READY_THRESHOLD(70，#37) ∧ 无活跃漂移(#37) ∧ 熔断 breaker=ok(#36) ∧ 无连败。
 *   升 L3（自 L2）：loop-ready score ≥ READY_STRONG(90，#37) ∧ 无活跃漂移 ∧ 熔断 ok ∧ 无连败 ∧
 *                  最小运行历史 runs ≥ MIN_L2_RUNS_FOR_L3（N 轮 L2 无失败——unattended 前须有跑量证据）。
 *   L3 是天花板（无更高档可升）。
 *
 * ── 降档信号（demotionReason；安全优先，逐级降 nextDown；L1 已是最安全档，信号只入 blockers 不降）──
 *   circuit breaker tripped（#36 今日 token 花费超预算）∨ fail_streak ≥ FAIL_STREAK_WARN（连败）∨
 *   活跃漂移（#37 声明 vs 实际不一致）→ 触发降档（或人工门）。降档优先于升档：有降档信号则绝不 canGraduate。
 *
 * ── 输出 verdict ──
 *   { current, recommended, canGraduate, blockers[], demotionReason?, + 消费信号回显（score/drift/breaker/…）}。
 *   recommended 恒在 current±1（绝不跨级）：有降档信号→current−1；否则 canGraduate→current+1；否则维持。
 *
 * ── 本仓工程约束 ──
 *   · kernel 零第三方依赖（CONTRACT §1）：run-log 历史解析手写；改档走 loops.yaml surgical 单行改写（不重排/不丢注释）。
 *   · 纯逻辑（decideGraduation / planLevelChange / setAutonomyLevelInYaml / parseRunHistory）+ 注入 fs 面
 *     （GraduationFs：登记载入 + run-log + LOOP.md 镜像 + loops.yaml 原文读写）；mock 层快速回归，integration 走真 node fs。
 *   · 只扩展 #35/#36/#37 loops，不改其核心：复用 computeReadiness/detectDrift(#37)、computeBudgetStatus(#36)、
 *     enforcementFor/FAIL_STREAK_WARN(#35)、READY_THRESHOLD/READY_STRONG(#37)。graduate/level 是独立子命令。
 */
import { computeBudgetStatus, type BreakerState, type BudgetStatus } from './budget.js'
import {
  computeReadiness, detectDrift, READY_STRONG, READY_THRESHOLD,
  type DriftItem, type ReadinessBand, type ReadinessScore,
} from './drift.js'
import { enforcementFor, FAIL_STREAK_WARN } from './enforce.js'
import type { AutonomyLevel, Enforcement, LoopEntry, LoopRegistry } from './types.js'
import { insertPointAtBlockEnd, locateLoop } from './yamlBlock.js'

// ── 阈值常量 ───────────────────────────────────────────────────────────────────

/** 升 L3 前的最小 L2 运行历史（N 轮无失败）——unattended 须有跑量证据。 */
export const MIN_L2_RUNS_FOR_L3 = 5

const ORDER: readonly AutonomyLevel[] = ['L1', 'L2', 'L3']

function nextUp(level: AutonomyLevel): AutonomyLevel {
  return ORDER[Math.min(ORDER.indexOf(level) + 1, ORDER.length - 1)]!
}
function nextDown(level: AutonomyLevel): AutonomyLevel {
  return ORDER[Math.max(ORDER.indexOf(level) - 1, 0)]!
}

// ── run-log 运行历史（轮次 + 连败；契约同 enforce/budget 5 列表格）──────────────

const HIST_TS_RE = /^(?:\d{4}-)?\d{2}-\d{2}T\d{2}:\d{2}$/
const HIST_RESULT_RE = /result=(ok|fail|dry|skip)/

export interface GraduationHistory {
  /** run-log 中归属该 loop 的总轮次（全时段；升 L3 的历史证据）。 */
  runs: number
  /** 尾部连续 fail 轮次（降档信号）。 */
  failStreak: number
  /** 最后一轮 result（无历史 → null）。 */
  lastResult: string | null
}

/**
 * 纯函数：解析 run-log 求该 loop 的运行历史（总轮次 + 尾部连败）。
 * 5 列表格行按第 2 列精确归属；第 1 列须为时间戳（天然过滤表头/分隔行）；`result=` 抽结果。
 */
export function parseRunHistory(text: string | null, loopId: string): GraduationHistory {
  if (text === null) return { runs: 0, failStreak: 0, lastResult: null }
  const results: (string | null)[] = []
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line.startsWith('|')) continue
    const cols = line.replace(/^\|+/, '').replace(/\|+$/, '').split('|').map((c) => c.trim())
    if (cols.length < 2 || cols[1] !== loopId) continue
    if (!HIST_TS_RE.test(cols[0]!)) continue
    const rm = line.match(HIST_RESULT_RE)
    results.push(rm ? rm[1]! : null)
  }
  let failStreak = 0
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i] === 'fail') failStreak++
    else break
  }
  return {
    runs: results.length,
    failStreak,
    lastResult: results.length > 0 ? results[results.length - 1]! : null,
  }
}

// ── 升降档裁决（纯函数）────────────────────────────────────────────────────────

/** graduation 纯裁决的全部输入（已由 #36/#37 预算/漂移/审计 + run-log 历史算好）。 */
export interface GraduationInputs {
  loop: LoopEntry
  /** #37 loop-audit 就绪评分（升档准入的核心门）。 */
  readiness: ReadinessScore
  /** #37 loop-sync 漂移项（应为该 loop 的项；活跃 = severity==='warn'）。 */
  drift: readonly DriftItem[]
  /** #36 circuit breaker 状态（tripped/warn 阻断升档；tripped 触发降档）。 */
  budget: BudgetStatus
  /** run-log 运行历史（升 L3 的跑量 + 连败降档信号）。 */
  history: GraduationHistory
}

export interface GraduationVerdict {
  id: string
  current: AutonomyLevel
  /** 建议档（恒在 current±1，绝不跨级）：降档信号→−1；canGraduate→+1；否则维持。 */
  recommended: AutonomyLevel
  /** current 档对应执行模式（回显）。 */
  enforcement: Enforcement
  /** 是否可逐级升一档（准入全过 ∧ 无降档信号 ∧ 非 L3 天花板）。 */
  canGraduate: boolean
  /** 阻断升档的原因（canGraduate=true 时为空）。 */
  blockers: string[]
  /** 建议降档时的原因（无降档 → null）。 */
  demotionReason: string | null
  /** 触发的降档信号明细（透明回显；L1 也会列，但不实际降）。 */
  demotionSignals: string[]
  // ── 消费信号回显（#37/#36 + 历史）──
  readinessScore: number
  readinessBand: ReadinessBand
  /** 活跃（warn）漂移项数（#37）。 */
  driftCount: number
  breaker: BreakerState
  failStreak: number
  runs: number
}

/**
 * 纯函数：单个 loop 的升降档裁决。降档优先于升档（安全）；升档须过准入门；绝不跨级。
 */
export function decideGraduation(inp: GraduationInputs): GraduationVerdict {
  const current = inp.loop.autonomy_level
  const activeDrift = inp.drift.filter((d) => d.severity === 'warn')
  const driftCount = activeDrift.length
  const breaker = inp.budget.breaker
  const failStreak = inp.history.failStreak
  const runs = inp.history.runs
  const score = inp.readiness.score

  // 降档信号（安全优先）：熔断 / 连败 / 活跃漂移
  const demotionSignals: string[] = []
  if (breaker === 'tripped') demotionSignals.push('circuit breaker tripped（今日 token 花费超预算，#36 熔断）')
  if (failStreak >= FAIL_STREAK_WARN) demotionSignals.push(`连败 fail_streak=${failStreak}（≥${FAIL_STREAK_WARN} 预警线）`)
  if (driftCount > 0) demotionSignals.push(`${driftCount} 项活跃漂移（声明 vs 实际不一致，#37）`)
  const canDemote = current !== 'L1' && demotionSignals.length > 0

  // 升档 blockers
  const blockers: string[] = []
  if (current === 'L3') {
    blockers.push('已在最高自治档 L3（unattended）——无更高档可升')
  } else {
    const target = nextUp(current)
    const minScore = current === 'L1' ? READY_THRESHOLD : READY_STRONG
    if (score < minScore) blockers.push(`loop-ready ${score} < ${minScore}（升 ${target} 需就绪度 ≥${minScore}，#37）`)
    if (driftCount > 0) blockers.push(`${driftCount} 项活跃漂移未清（升档前须无漂移，#37）`)
    if (breaker === 'tripped') blockers.push('circuit breaker tripped（熔断中不得升档，#36）')
    else if (breaker === 'warn') blockers.push('token 花费 ≥80% 减速线（接近预算不得升档，#36）')
    if (failStreak > 0) blockers.push(`连败中 fail_streak=${failStreak}（升档前须无失败）`)
    if (target === 'L3' && runs < MIN_L2_RUNS_FOR_L3) {
      blockers.push(`L2 运行历史不足（${runs}/${MIN_L2_RUNS_FOR_L3} 轮）——升 L3 需 ≥${MIN_L2_RUNS_FOR_L3} 轮无失败`)
    }
  }

  const canGraduate = !canDemote && current !== 'L3' && blockers.length === 0

  let recommended: AutonomyLevel = current
  let demotionReason: string | null = null
  if (canDemote) {
    recommended = nextDown(current)
    demotionReason = demotionSignals.join('；')
  } else if (canGraduate) {
    recommended = nextUp(current)
  }

  return {
    id: inp.loop.id,
    current,
    recommended,
    enforcement: enforcementFor(current),
    canGraduate,
    blockers,
    demotionReason,
    demotionSignals,
    readinessScore: score,
    readinessBand: inp.readiness.band,
    driftCount,
    breaker,
    failStreak,
    runs,
  }
}

// ── level set 改档裁决（纯函数）────────────────────────────────────────────────

export type LevelChangeKind =
  | 'promote' // 逐级升一档（准入通过）
  | 'demote' // 降档（安全，总允许）
  | 'noop' // 目标 = 当前
  | 'reject-cross-level' // 一步跨 ≥2 级升档（绝不跨级）
  | 'reject-blocked' // 逐级升档但准入未过
  | 'reject-unknown-level' // 目标档非 L1/L2/L3

export interface LevelChangePlan {
  id: string
  from: AutonomyLevel
  /** 目标档；reject-* → null。 */
  to: AutonomyLevel | null
  kind: LevelChangeKind
  /** 是否允许落盘（promote/demote 且非 noop）。 */
  allowed: boolean
  reason: string
  /** reject-blocked 时的准入 blockers。 */
  blockers: string[]
}

/**
 * 纯函数：给定当前档 + 目标 + 升降档裁决，判定 level set 是否允许。
 * 升档：仅允许逐级 +1 且 verdict.canGraduate；跨级(+≥2)一律拒（毕业制铁律）。
 * 降档：安全总允许（可降到任意更低档）——降低自治永远许可。
 */
export function planLevelChange(current: AutonomyLevel, target: string, verdict: GraduationVerdict): LevelChangePlan {
  const base = { id: verdict.id, from: current }
  if (!ORDER.includes(target as AutonomyLevel)) {
    return { ...base, to: null, kind: 'reject-unknown-level', allowed: false, reason: `未知目标档 '${target}'（支持 L1/L2/L3）`, blockers: [] }
  }
  const to = target as AutonomyLevel
  const ci = ORDER.indexOf(current)
  const ti = ORDER.indexOf(to)
  if (ti === ci) {
    return { ...base, to, kind: 'noop', allowed: false, reason: `已在 ${current}，无需改档`, blockers: [] }
  }
  if (ti < ci) {
    return { ...base, to, kind: 'demote', allowed: true, reason: `安全降档 ${current} → ${to}（降低自治总允许）`, blockers: [] }
  }
  // 升档
  if (ti - ci > 1) {
    return {
      ...base, to: null, kind: 'reject-cross-level', allowed: false,
      reason: `跨级升档被拒：${current} → ${to}（一步跨 ${ti - ci} 级）。分级放权须逐级毕业：先升 ${nextUp(current)}`,
      blockers: [],
    }
  }
  if (!verdict.canGraduate) {
    return { ...base, to: null, kind: 'reject-blocked', allowed: false, reason: `升 ${to} 准入未通过`, blockers: verdict.blockers }
  }
  return { ...base, to, kind: 'promote', allowed: true, reason: `逐级毕业 ${current} → ${to}`, blockers: [] }
}

// ── loops.yaml surgical 改档（纯函数；只动目标 loop 的 autonomy_level 行，保留其余格式/注释）──

/**
 * 纯函数：在 loops.yaml 原文中把 `loopId` 的 `autonomy_level` 设为 `level`。
 * 已有该字段 → 就地替换（保留缩进）；无 → 在该 loop 块尾插入（缩进对齐同级字段）。未找到 loop → {text:null,error}。
 */
export function setAutonomyLevelInYaml(text: string, loopId: string, level: AutonomyLevel): { text: string | null; error: string | null } {
  const lines = text.split('\n')
  // 块定位收编 yamlBlock.ts（与 update.ts 共享单份；手术责任分离不变：本函数只动 autonomy_level）
  const block = locateLoop(lines, loopId)
  if (block === null) return { text: null, error: `loop '${loopId}' 未在 loops.yaml 找到（无法改档）` }

  const levelRe = /^(\s*)autonomy_level:\s*.*$/
  for (let i = block.start; i < block.end; i++) {
    const m = lines[i]!.match(levelRe)
    if (m) {
      lines[i] = `${m[1]!}autonomy_level: ${level}`
      return { text: lines.join('\n'), error: null }
    }
  }
  // 未声明 → 在块内最后一个非空行后插入（缩进 = dashIndent + 2，与 id 键对齐——本手术历史口径，
  // 刻意不换 fieldIndent：登记表 dash 后恒一空格时两者等值，行为保持）
  lines.splice(insertPointAtBlockEnd(lines, block.start, block.end), 0, `${' '.repeat(block.dashIndent + 2)}autonomy_level: ${level}`)
  return { text: lines.join('\n'), error: null }
}

// ── 编排 + fs 注入面 ───────────────────────────────────────────────────────────

/** graduate/level 的 fs 触面注入（默认真 node fs 由 cli 提供；kernel/test 注入 fake）。 */
export interface GraduationFs {
  loadRegistry: (repoRoot: string) => { data: LoopRegistry | null; errors: string[] }
  /** 读运行流水 run-log（progress.md）原文；缺失 → null。 */
  readRunLog: (repoRoot: string) => string | null
  /** 读仓根 LOOP.md 人类镜像原文（漂移对账用）；缺失 → null。 */
  readLoopDoc: (repoRoot: string) => string | null
  /** 读 .pipeline/loops.yaml 原文（level set surgical 改档的初读 + 写回前 CAS 重读）；缺失 → null。 */
  readRegistryText: (repoRoot: string) => string | null
  /** 写回 .pipeline/loops.yaml 原文（level set --confirm 的唯一 mutation）。 */
  writeRegistryText: (repoRoot: string, text: string) => void
}

export interface GraduationReport {
  version: 1
  generated_at: string
  verdicts: GraduationVerdict[]
}

export interface GraduationReportEnvelope {
  report: GraduationReport | null
  errors: string[]
  exitCode: number
}

/** 汇聚单个 loop 的裁决输入（消费 #37 readiness/drift + #36 breaker + run-log 历史）。 */
function gatherInputs(loop: LoopEntry, registry: LoopRegistry, runLog: string | null, doc: string | null, now: Date): GraduationInputs {
  const driftAll = detectDrift(registry, doc, runLog, now)
  return {
    loop,
    readiness: computeReadiness(loop),
    drift: driftAll.items.filter((i) => i.loop === loop.id),
    budget: computeBudgetStatus(loop, runLog, now),
    history: parseRunHistory(runLog, loop.id),
  }
}

/**
 * 编排升降档评估：registry 载入 → 逐 loop 汇聚 #36/#37 信号 → decideGraduation。
 * exitCode：任一降档信号→2 / 任一可升档（待人工门放行）→1 / 稳态→0 / 载入或 --loop 错误→3。
 */
export function buildGraduationReport(
  repoRoot: string,
  onlyLoop: string | null,
  now: Date,
  fs: GraduationFs,
): GraduationReportEnvelope {
  const { data, errors } = fs.loadRegistry(repoRoot)
  if (errors.length > 0) return { report: null, errors, exitCode: 3 }
  if (data === null) return { report: null, errors: [`loops.yaml 未找到于 ${repoRoot}/.pipeline/loops.yaml`], exitCode: 3 }
  if (onlyLoop !== null && !data.loops.some((l) => l.id === onlyLoop)) {
    return { report: null, errors: [`未知 --loop id: ${onlyLoop}`], exitCode: 3 }
  }

  const runLog = fs.readRunLog(repoRoot)
  const doc = fs.readLoopDoc(repoRoot)
  const loops = onlyLoop === null ? data.loops : data.loops.filter((l) => l.id === onlyLoop)
  const verdicts = loops.map((l) => decideGraduation(gatherInputs(l, data, runLog, doc, now)))
  const code = verdicts.some((v) => v.demotionReason !== null) ? 2 : verdicts.some((v) => v.canGraduate) ? 1 : 0
  return { report: { version: 1, generated_at: now.toISOString().slice(0, 16), verdicts }, errors: [], exitCode: code }
}

export interface ApplyLevelResult {
  plan: LevelChangePlan | null
  verdict: GraduationVerdict | null
  applied: boolean
  errors: string[]
  /** 0 = noop/dry-run/applied；2 = 拒绝（跨级/准入未过/未知档）；3 = 载入/未知 loop/写回错误（含写回 CAS 并发拒绝）。 */
  exitCode: number
}

/**
 * 编排 level set：载入 → 裁决 → planLevelChange → （confirm 且 allowed）surgical 改档写回 loops.yaml。
 * 安全默认：无 confirm = dry-run（不落盘）；升档须准入；跨级拒；降档总允许。
 * 写回带读-判-写 CAS：初读→手术→重读比对，间隙被并发修改/删除 → 如实拒绝（errors + exit 3，未落盘）。
 */
export function applyLevelChange(
  repoRoot: string,
  loopId: string,
  target: string,
  opts: { now: Date; confirm: boolean },
  fs: GraduationFs,
): ApplyLevelResult {
  const { data, errors } = fs.loadRegistry(repoRoot)
  if (errors.length > 0) return { plan: null, verdict: null, applied: false, errors, exitCode: 3 }
  if (data === null) return { plan: null, verdict: null, applied: false, errors: [`loops.yaml 未找到于 ${repoRoot}/.pipeline/loops.yaml`], exitCode: 3 }
  const loop = data.loops.find((l) => l.id === loopId)
  if (!loop) return { plan: null, verdict: null, applied: false, errors: [`未知 loop id: ${loopId}`], exitCode: 3 }

  const verdict = decideGraduation(gatherInputs(loop, data, fs.readRunLog(repoRoot), fs.readLoopDoc(repoRoot), opts.now))
  const plan = planLevelChange(loop.autonomy_level, target, verdict)

  if (plan.kind === 'noop') return { plan, verdict, applied: false, errors: [], exitCode: 0 }
  if (!plan.allowed) return { plan, verdict, applied: false, errors: [plan.reason, ...plan.blockers], exitCode: 2 }
  if (!opts.confirm) return { plan, verdict, applied: false, errors: [], exitCode: 0 } // dry-run（默认不改档）

  const text = fs.readRegistryText(repoRoot)
  if (text === null) return { plan, verdict, applied: false, errors: ['无法读取 .pipeline/loops.yaml 原文以写回'], exitCode: 3 }
  const { text: next, error } = setAutonomyLevelInYaml(text, loopId, plan.to!)
  if (error !== null || next === null) return { plan, verdict, applied: false, errors: [error ?? '改档写回失败'], exitCode: 3 }
  // 读-判-写 CAS（对齐 server applyLoopsUpdate / cli loops init 先例）：写回前重读比对初读原文，
  // 不一致说明间隙有并发写者（另一进程改档 / /api/loops/update / 人工编辑），如实拒绝不盲写覆盖。
  // 全程同步无 await；重读→写的残留窗口仅跨进程纳秒级（同锁面已接受的 TOCTOU 残留口径）。
  const recheck = fs.readRegistryText(repoRoot)
  if (recheck !== text) {
    const yamlPath = `${repoRoot}/.pipeline/loops.yaml`
    return {
      plan, verdict, applied: false,
      errors: [recheck === null
        ? `CAS 失败：loops.yaml 在改档写回期间被删除，已如实拒绝（未落盘，${yamlPath}）`
        : `CAS 失败：loops.yaml 在改档写回期间被并发修改，已如实拒绝（未落盘，${yamlPath}）`],
      exitCode: 3,
    }
  }
  fs.writeRegistryText(repoRoot, next)
  return { plan, verdict, applied: true, errors: [], exitCode: 0 }
}
