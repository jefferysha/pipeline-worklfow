/**
 * loops budget —— token 预算追踪 + circuit breaker 熔断 + 成本估算（BACKLOG #36 / GOAL B20 / D16）。
 *
 * ── loop-engineering 语义盘点（对标 cobusgreyling/loop-engineering，MIT；仅适配语义，未复制代码）──
 *   · loop-budget（token 分配与花费追踪）：每个 loop 声明周期内的 token 额度（`max_tokens_per_day`），
 *     执行流水（run-log）逐轮记录 token 花费，本模块把「今日累计花费」从 run-log 求和 → 与额度对账；
 *     花费接近额度（≥80%）进「减速线」，达/超额度进「熔断」。（老 loops_enforce.py 只按 runs 计数，
 *     本轮把预算判据推进到 token 级——B20 的核心增量。）
 *   · circuit breaker（按 cost/token spend 紧急停）：累计 token 花费越过硬阈值即「熔断」（tripped），
 *     保护 loop 不因失控迭代烧穿预算。熔断是一个新的裁决维度（breaker: ok/warn/tripped），
 *     独立于 enforce 的 R1-R11 verdict（不改 enforce 既有逻辑）。分级放权：L1 熔断也只 report_only
 *     （观察不自动停，执行面留 #38）；L2/L3 熔断可自动停（毕业制升档）。
 *   · loop-cost（按 pattern/cadence 估 token 花费）：用 cadence（每日迭代次数）× pattern（每轮 token 足迹）
 *     预估「每日 token 花费」，在跑之前就能对照预算发现会超支。成本估算公式：
 *         estimated_tokens_per_day = runs_per_day(cadence) × tokens_per_run(pattern)
 *         runs_per_day = floor(1440 / cadence_minutes)   （continuous → 无界，不估算）
 *         tokens_per_run = 声明的 budget.tokens_per_run（pattern=declared）
 *                          ‖ 缺省按 risk 预设（pattern=risk:<low|medium|high>）
 *
 * ── 本仓工程约束 ──
 *   · kernel 零第三方依赖（CONTRACT §1）：run-log 解析手写，时间戳契约与 enforce parseProgress 对齐。
 *   · 纯逻辑 + 注入 fs 面（BudgetFs：登记载入 + run-log 读）：mock 层快速回归，integration 走真 node fs。
 *   · 复用 enforce 的 budgetWarnThreshold（ceil(0.8×N) 整数减速线）与 cadenceMinutes（cadence→分钟），
 *     不重复实现、与 R2/R3 减速线口径一致。
 *   · 只扩展 #35 loops：token 预算字段以「可选」加入 loops.schema.json 的 budget 块（向后兼容，
 *     旧登记表无需改）；enforce/list/status 既有逻辑不动，budget/cost 是独立子命令。
 */
import { budgetWarnThreshold, cadenceMinutes } from './enforce.js'
import type { LoopBudget, LoopEntry, LoopRegistry, LoopRisk } from './types.js'

// ── pattern 预设：每轮 token 足迹（loop-cost 的 pattern 面；risk 作为 loop「形状」代理）──────
export const PATTERN_TOKENS_PER_RUN: Record<LoopRisk, number> = {
  low: 2000,
  medium: 8000,
  high: 20000,
}

// ── run-log（progress.md）token 花费解析（时间戳契约同 enforce parseProgress）───────────────

const TS_FULL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
const TS_SHORT_RE = /^(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
const TOKENS_RE = /tokens=(\d+)/

function mkUTC(y: number, mo: number, d: number, hh: number, mm: number): Date | null {
  const dt = new Date(Date.UTC(y, mo - 1, d, hh, mm))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d ||
      dt.getUTCHours() !== hh || dt.getUTCMinutes() !== mm) return null
  return dt
}

/** `YYYY-MM-DDTHH:MM` 或 `MM-DDTHH:MM`（年取 now 当年）；其余不可解析 → null。 */
function parseTimestamp(raw: string, now: Date): Date | null {
  const s = raw.trim()
  const full = s.match(TS_FULL_RE)
  if (full) return mkUTC(+full[1]!, +full[2]!, +full[3]!, +full[4]!, +full[5]!)
  const short = s.match(TS_SHORT_RE)
  if (short) return mkUTC(now.getUTCFullYear(), +short[1]!, +short[2]!, +short[3]!, +short[4]!)
  return null
}

function sameUTCDate(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate()
}

/**
 * 从 run-log 求和「今日」该 loop 的累计 token 花费（circuit breaker 的输入）。
 * 5 列表格行：第 2 列按精确 loop id 归属，第 1 列时间戳判「今日」，行内 `tokens=<int>` 记该轮花费。
 * 文件缺失（text=null）→ 零花费零轮次（非错误）；无 tokens= 的今日行仍计 runsToday、花费计 0。
 */
export function sumRunLogTokens(text: string | null, loopId: string, now: Date): { spentToday: number; runsToday: number } {
  if (text === null) return { spentToday: 0, runsToday: 0 }
  let spentToday = 0
  let runsToday = 0
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line.startsWith('|')) continue
    const cols = line.replace(/^\|+/, '').replace(/\|+$/, '').split('|').map((c) => c.trim())
    if (cols.length < 2) continue
    if (cols[1] !== loopId) continue
    const ts = parseTimestamp(cols[0]!, now)
    if (ts === null || !sameUTCDate(ts, now)) continue
    runsToday++
    const tm = line.match(TOKENS_RE)
    if (tm) spentToday += Number(tm[1])
  }
  return { spentToday, runsToday }
}

// ── circuit breaker：累计花费 vs max_tokens_per_day ───────────────────────────────────────

export type BreakerState = 'ok' | 'warn' | 'tripped'

export interface BudgetStatus {
  id: string
  /** 是否声明了 token 预算（max_tokens_per_day）。false → 无熔断，仅追踪花费。 */
  hasBudget: boolean
  maxTokensPerDay: number | null
  /** 减速线阈值 ceil(0.8×max)（复用 enforce budgetWarnThreshold）；无预算 → null。 */
  warnThreshold: number | null
  /** run-log 今日累计 token 花费。 */
  spentToday: number
  /** 剩余额度 max(0, max−spent)；无预算 → null。 */
  remaining: number | null
  /** 花费占比 spent/max；无预算 → null。 */
  usedRatio: number | null
  /** 今日运行轮次（上下文）。 */
  runsToday: number
  /** ok（<80%）/ warn（≥80% 且 <100%）/ tripped（≥100% 熔断）。 */
  breaker: BreakerState
  /** 超支处置声明（budget.on_exceed；实际 halt 动作面留 #38）。 */
  onExceed: string
  autonomyLevel: LoopEntry['autonomy_level']
  /** L1 → true：熔断也只报告不自动停（分级放权，执行面留 #38）。 */
  reportOnly: boolean
  reason: string
}

/** 单个 loop 的 circuit breaker 状态（纯函数）。 */
export function computeBudgetStatus(loop: LoopEntry, runLogText: string | null, now: Date): BudgetStatus {
  const { spentToday, runsToday } = sumRunLogTokens(runLogText, loop.id, now)
  const budget = loop.budget as LoopBudget
  const max = budget.max_tokens_per_day ?? null
  const reportOnly = loop.autonomy_level === 'L1'

  if (max === null) {
    return {
      id: loop.id, hasBudget: false, maxTokensPerDay: null, warnThreshold: null,
      spentToday, remaining: null, usedRatio: null, runsToday, breaker: 'ok',
      onExceed: budget.on_exceed, autonomyLevel: loop.autonomy_level, reportOnly,
      reason: `未声明 max_tokens_per_day —— 无 token 预算/熔断（仅追踪今日花费 ${spentToday}）`,
    }
  }

  const warnThreshold = budgetWarnThreshold(max)
  let breaker: BreakerState
  let reason: string
  if (spentToday >= max) {
    breaker = 'tripped'
    reason = `今日花费 ${spentToday} ≥ 预算 ${max}（circuit breaker 熔断触发）`
  } else if (spentToday >= warnThreshold) {
    breaker = 'warn'
    reason = `今日花费 ${spentToday} ≥ 减速线 ${warnThreshold}（80% of ${max}）`
  } else {
    breaker = 'ok'
    reason = `今日花费 ${spentToday} < 减速线 ${warnThreshold}（预算 ${max}）`
  }

  return {
    id: loop.id, hasBudget: true, maxTokensPerDay: max, warnThreshold,
    spentToday, remaining: Math.max(0, max - spentToday), usedRatio: spentToday / max, runsToday,
    breaker, onExceed: budget.on_exceed, autonomyLevel: loop.autonomy_level, reportOnly, reason,
  }
}

// ── loop-cost：cadence × pattern → 预估 token/日 ──────────────────────────────────────────

export interface CostEstimate {
  id: string
  cadence: string
  /** floor(1440 / cadence_minutes)；continuous → null（无界）。 */
  runsPerDay: number | null
  /** 'declared'（budget.tokens_per_run）‖ 'risk:<low|medium|high>'（预设）。 */
  pattern: string
  tokensPerRun: number
  /** runsPerDay × tokensPerRun；runsPerDay=null → null。 */
  estimatedTokensPerDay: number | null
  maxTokensPerDay: number | null
  /** estimate ≤ budget；预算或估算缺失 → null。 */
  withinBudget: boolean | null
  /** budget − estimate；预算或估算缺失 → null。 */
  headroom: number | null
}

/** 单个 loop 的成本估算（纯函数）。 */
export function estimateCost(loop: LoopEntry): CostEstimate {
  const cadenceMin = cadenceMinutes(loop.cadence)
  const runsPerDay = cadenceMin === null ? null : Math.floor(1440 / cadenceMin)

  const budget = loop.budget as LoopBudget
  const declared = budget.tokens_per_run ?? null
  const risk = loop.risk as LoopRisk
  // 非法 risk（越过 schema/直接构造 LoopEntry）→ PATTERN_TOKENS_PER_RUN[risk] 为 undefined，
  // 会致 estimatedTokensPerDay=NaN、NaN<=max 恒 false 的「假超预算」。兜底 medium 足迹并在 pattern 标注。
  const preset = (PATTERN_TOKENS_PER_RUN as Record<string, number | undefined>)[risk]
  const tokensPerRun = declared !== null ? declared : preset ?? PATTERN_TOKENS_PER_RUN.medium
  const pattern = declared !== null ? 'declared' : preset !== undefined ? `risk:${risk}` : `risk:${risk}(未知,按 medium 估)`

  const estimatedTokensPerDay = runsPerDay === null ? null : runsPerDay * tokensPerRun
  const max = budget.max_tokens_per_day ?? null
  const withinBudget = max === null || estimatedTokensPerDay === null ? null : estimatedTokensPerDay <= max
  const headroom = max === null || estimatedTokensPerDay === null ? null : max - estimatedTokensPerDay

  return {
    id: loop.id, cadence: loop.cadence, runsPerDay, pattern, tokensPerRun,
    estimatedTokensPerDay, maxTokensPerDay: max, withinBudget, headroom,
  }
}

// ── 编排 + fs 注入面 ──────────────────────────────────────────────────────────────────────

/** budget/cost 的 fs 触面注入（默认真 node fs 由 cli 提供；kernel/test 注入 fake）。 */
export interface BudgetFs {
  loadRegistry: (repoRoot: string) => { data: LoopRegistry | null; errors: string[] }
  /** 读运行流水 run-log（progress.md）原文；缺失 → null。 */
  readRunLog: (repoRoot: string) => string | null
}

export interface BudgetReport {
  version: 1
  generated_at: string
  statuses: BudgetStatus[]
}

export interface CostReport {
  version: 1
  generated_at: string
  estimates: CostEstimate[]
}

/** 载入 registry + 选定 loop 集（共用于 budget/cost）；error → {loops:null, errors, exitCode:3}。 */
function resolveLoops(
  repoRoot: string,
  onlyLoop: string | null,
  fs: BudgetFs,
): { loops: LoopEntry[] | null; errors: string[]; exitCode: number } {
  const { data, errors } = fs.loadRegistry(repoRoot)
  if (errors.length > 0) return { loops: null, errors, exitCode: 3 }
  if (data === null) return { loops: null, errors: [`loops.yaml 未找到于 ${repoRoot}/.pipeline/loops.yaml`], exitCode: 3 }
  let loops = data.loops
  if (onlyLoop !== null) {
    if (!loops.some((l) => l.id === onlyLoop)) return { loops: null, errors: [`未知 --loop id: ${onlyLoop}`], exitCode: 3 }
    loops = loops.filter((l) => l.id === onlyLoop)
  }
  return { loops, errors: [], exitCode: 0 }
}

/**
 * 编排 budget circuit breaker 报告：registry 载入 → run-log 累计花费 → 逐 loop 熔断判定。
 * exitCode：任一 tripped→2 / 任一 warn→1 / 全 ok→0 / 载入或 --loop 错误→3。
 */
export function buildBudgetReport(
  repoRoot: string,
  onlyLoop: string | null,
  now: Date,
  fs: BudgetFs,
): { report: BudgetReport | null; errors: string[]; exitCode: number } {
  const { loops, errors, exitCode } = resolveLoops(repoRoot, onlyLoop, fs)
  if (loops === null) return { report: null, errors, exitCode }

  const runLog = fs.readRunLog(repoRoot)
  const statuses = loops.map((l) => computeBudgetStatus(l, runLog, now))
  const code = statuses.some((s) => s.breaker === 'tripped') ? 2 : statuses.some((s) => s.breaker === 'warn') ? 1 : 0
  return {
    report: { version: 1, generated_at: now.toISOString().slice(0, 16), statuses },
    errors: [],
    exitCode: code,
  }
}

/**
 * 编排成本估算报告：registry 载入 → 逐 loop cadence×pattern 估 token/日 → 对照预算。
 * exitCode：任一 withinBudget=false→1 / 其余→0 / 载入或 --loop 错误→3。
 */
export function buildCostReport(
  repoRoot: string,
  onlyLoop: string | null,
  now: Date,
  fs: BudgetFs,
): { report: CostReport | null; errors: string[]; exitCode: number } {
  const { loops, errors, exitCode } = resolveLoops(repoRoot, onlyLoop, fs)
  if (loops === null) return { report: null, errors, exitCode }

  const estimates = loops.map((l) => estimateCost(l))
  const code = estimates.some((e) => e.withinBudget === false) ? 1 : 0
  return {
    report: { version: 1, generated_at: now.toISOString().slice(0, 16), estimates },
    errors: [],
    exitCode: code,
  }
}
