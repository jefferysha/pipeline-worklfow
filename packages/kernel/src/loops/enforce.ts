/**
 * loops enforce —— 把登记的 budget/kill 判据变成每轮 R1-R11 只读裁决（BACKLOG #35 / GOAL B18 / D16）。
 *
 * 老仓真相源（严格移植，行号锚 workflow-plugin/skills/pipeline/scripts/loops_enforce.py）：
 *   · 阈值常量 51-60      FAIL_STREAK 3/2 · DRY 2/1 · BUDGET 80% 减速线 · STRIKE ×2 · KILL_RULES{R1,R2,R4,R6}
 *   · parse_progress 106-177  5 列表格解析：today 轮数 / 连败 / 干涸(干涸计数 token 优先) / last_run / 最新行可裁决
 *   · count_in_flight 184-224 openspec/changes/<prefix>* 的 automation∈{queued,running} 计数
 *   · audit_ship_barrier 259-293 R11：主账本 automation=failed × 沙箱达 ship 屏障 = 误记账
 *   · adjudicate 318-397  R1-R11 裁决，verdict 取最严(kill>warn>ok)，reasons 全列不吞
 *   · build_report 404-455 编排：orchestrator 裁决 / executor 跳过 / exit 0·1·2·3
 *
 * MIT attribution（同老仓）：阈值与判据语义适配自 cobusgreyling/loop-engineering（MIT）的 loop-budget.md /
 * anti-patterns / failure-modes(State Rot=R11) / operating-loops(80% 减速线)；未复制其代码，仅适配语义。
 *
 * 本仓改进：（1）纯函数 adjudicate 吃聚合的 RunFacts（老吃散参数），便于单测/注入；（2）fs 触面经
 * EnforceFs 注入（同 cli TaskFs/MemFs 模式，kernel 不锁死真 fs，integration 走真 node fs）；
 * （3）时间统一 UTC（老用 naive local）——去时区 flake，测试可控；（4）verdict 信封新增 autonomy_level/
 * enforcement/report_only（分级放权 enforce 认级别，执行面留 #38）。
 */
import type {
  AutonomyLevel,
  Enforcement,
  LoopEntry,
  LoopRegistry,
  LoopVerdict,
  RunFacts,
  Verdict,
  VerdictReason,
} from './types.js'

// ── 阈值常量（老 51-60；干涸阈值与 registry kill_criteria 散文一致）─────────────
export const FAIL_STREAK_KILL = 3
export const FAIL_STREAK_WARN = 2
export const DRY_ROUNDS_KILL = 2
export const DRY_ROUNDS_WARN = 1
export const BUDGET_WARN_RATIO = 0.8
export const STRIKE_MULTIPLIER = 2

const IN_FLIGHT_STATES = new Set(['queued', 'running'])
const KILL_RULES = new Set(['R1', 'R2', 'R4', 'R6'])

const RESULT_RE = /result=(ok|fail|dry|skip)/
const DRY_COUNT_RE = /干涸计数=(\d+)/
const TS_FULL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
const TS_SHORT_RE = /^(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
const CADENCE_RE = /^(\d+)([mhd])$/
const CADENCE_UNIT_MINUTES: Record<string, number> = { m: 1, h: 60, d: 1440 }

// ── §2.2 progress.md 解析契约 ─────────────────────────────────────────────────

export interface ParsedLoop {
  runsToday: number
  failStreak: number
  dryRounds: number
  lastRunAt: Date | null
  latestRowOk: boolean
}

function emptyParsed(): ParsedLoop {
  return { runsToday: 0, failStreak: 0, dryRounds: 0, lastRunAt: null, latestRowOk: true }
}

function mkUTC(y: number, mo: number, d: number, hh: number, mm: number): Date | null {
  const dt = new Date(Date.UTC(y, mo - 1, d, hh, mm))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d ||
      dt.getUTCHours() !== hh || dt.getUTCMinutes() !== mm) return null
  return dt
}

/** 接受 `YYYY-MM-DDTHH:MM` 与 `MM-DDTHH:MM`（年取 now 当年）；其余（含 `(init)`）不可解析 → null。 */
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

interface ProgressRow {
  ts: Date | null
  result: string | null
  dryCount: number | null
}

/**
 * 解析 progress.md，返回 `Map<loopId, ParsedLoop>`（每个传入 id 均有条目，缺历史即零值）。
 * 文件缺失（text=null）→ 零历史，非错误。5 列表格行按第 2 列精确匹配归属（`-`/`all`/未知 id 不归属）；
 * 列数不符跳过。历史无 result token 的行不计入连败/干涸（宁漏判不误杀）；最新行缺 token/时间戳 → latestRowOk=false（R10 源）。
 */
export function parseProgress(text: string | null, loopIds: string[], now: Date): Map<string, ParsedLoop> {
  const result = new Map<string, ParsedLoop>()
  for (const id of loopIds) result.set(id, emptyParsed())
  if (text === null) return result

  const known = new Set(loopIds)
  const rowsByLoop = new Map<string, ProgressRow[]>()
  for (const id of loopIds) rowsByLoop.set(id, [])

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line.startsWith('|')) continue
    const cols = line.replace(/^\|+/, '').replace(/\|+$/, '').split('|').map((c) => c.trim())
    if (cols.length !== 5) continue
    const loopCol = cols[1]!
    if (!known.has(loopCol)) continue
    const rowText = cols.join('|')
    const rm = rowText.match(RESULT_RE)
    const dm = rowText.match(DRY_COUNT_RE)
    rowsByLoop.get(loopCol)!.push({
      ts: parseTimestamp(cols[0]!, now),
      result: rm ? rm[1]! : null,
      dryCount: dm ? Number(dm[1]) : null,
    })
  }

  for (const [id, rows] of rowsByLoop) {
    if (rows.length === 0) continue
    const pl = result.get(id)!

    const parseableTs = rows.map((r) => r.ts).filter((t): t is Date => t !== null)
    pl.runsToday = parseableTs.filter((t) => sameUTCDate(t, now)).length
    pl.lastRunAt = parseableTs.length > 0 ? new Date(Math.max(...parseableTs.map((t) => t.getTime()))) : null

    let failStreak = 0
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i]!.result !== 'fail') break
      failStreak++
    }
    pl.failStreak = failStreak

    let dryVal: number | null = null
    for (const r of rows) if (r.dryCount !== null) dryVal = r.dryCount
    if (dryVal !== null) {
      pl.dryRounds = dryVal
    } else {
      let dryStreak = 0
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i]!.result !== 'dry') break
        dryStreak++
      }
      pl.dryRounds = dryStreak
    }

    const last = rows[rows.length - 1]!
    pl.latestRowOk = last.ts !== null && last.result !== null
  }

  return result
}

// ── §2.1 裁决规则引擎 ─────────────────────────────────────────────────────────

/** `continuous` → null（R9 不适用）；range 型（如 `5m-10m`）取上界。 */
export function cadenceMinutes(cadence: string): number | null {
  if (cadence === 'continuous') return null
  const upper = cadence.split('-').pop() ?? cadence
  const m = upper.match(CADENCE_RE)
  if (!m) return null
  return Number(m[1]) * CADENCE_UNIT_MINUTES[m[2]!]!
}

/** ceil(0.8 × max_runs)（老 _budget_warn_threshold 312-315 的整数实现）。 */
export function budgetWarnThreshold(maxRuns: number): number {
  return Math.ceil((maxRuns * 4) / 5)
}

/** 分级放权级别 → 执行模式（本轮：enforce 认级别；verdict×level→动作面留 #38）。 */
export function enforcementFor(level: AutonomyLevel): Enforcement {
  return level === 'L1' ? 'report-only' : level === 'L2' ? 'assisted' : 'unattended'
}

/**
 * 纯函数：单个 loop 的 R1-R11 裁决。verdict 取最严（kill>warn>ok），reasons 全列不吞。
 * 分级放权：verdict 照常由判据计算；autonomy_level/enforcement/report_only 随信封回显（L1 即便 kill 也 report-only）。
 */
export function adjudicate(loop: LoopEntry, facts: RunFacts, now: Date): LoopVerdict {
  const reasons: VerdictReason[] = []
  const { max_runs_per_day: maxRuns, max_in_flight: maxInFlight } = loop.budget

  // R1 · status kill switch
  if (loop.status === 'paused' || loop.status === 'retired') {
    reasons.push({ rule: 'R1', detail: `status=${loop.status}（kill switch 已触发）` })
  }

  // R2/R3 · 预算超限 / 接近
  if (facts.runsToday >= maxRuns) {
    reasons.push({ rule: 'R2', detail: `runs_today=${facts.runsToday}（阈值 ${maxRuns}）` })
  } else if (facts.runsToday >= budgetWarnThreshold(maxRuns)) {
    reasons.push({ rule: 'R3', detail: `runs_today=${facts.runsToday}（≥${Math.round(BUDGET_WARN_RATIO * 100)}% of ${maxRuns}）` })
  }

  // R4/R5 · 连败硬顶 / 预警
  if (facts.failStreak >= FAIL_STREAK_KILL) {
    reasons.push({ rule: 'R4', detail: `fail_streak=${facts.failStreak}（阈值 ${FAIL_STREAK_KILL}）` })
  } else if (facts.failStreak === FAIL_STREAK_WARN) {
    reasons.push({ rule: 'R5', detail: `fail_streak=${FAIL_STREAK_WARN}（预警，阈值 ${FAIL_STREAK_KILL}）` })
  }

  // R6/R7 · 干涸收敛 / 预警
  if (facts.dryRounds >= DRY_ROUNDS_KILL) {
    reasons.push({ rule: 'R6', detail: `dry_rounds=${facts.dryRounds}（阈值 ${DRY_ROUNDS_KILL}）` })
  } else if (facts.dryRounds === DRY_ROUNDS_WARN) {
    reasons.push({ rule: 'R7', detail: `dry_rounds=${DRY_ROUNDS_WARN}（预警，阈值 ${DRY_ROUNDS_KILL}）` })
  }

  // R8 · 在途已满
  if (facts.inFlight >= maxInFlight) {
    reasons.push({ rule: 'R8', detail: `in_flight=${facts.inFlight}（阈值 ${maxInFlight}）` })
  }

  // R9 · 罢工检测
  let minutesSince: number | null = null
  if (facts.lastRunAt !== null) {
    minutesSince = (now.getTime() - facts.lastRunAt.getTime()) / 60000
    const cadence = cadenceMinutes(loop.cadence)
    if (cadence !== null && minutesSince > STRIKE_MULTIPLIER * cadence) {
      reasons.push({ rule: 'R9', detail: `距上次运行 ${Math.trunc(minutesSince)} 分钟（阈值 ${Math.trunc(STRIKE_MULTIPLIER * cadence)}）` })
    }
  }

  // R10 · 留痕不可裁决
  if (!facts.latestRowOk) {
    reasons.push({ rule: 'R10', detail: '最新行缺 result= token 或时间戳不可解析' })
  }

  // R11 · 沙箱屏障误记账（不进 kill 集，全列不吞）
  for (const name of facts.misaccounted) {
    reasons.push({ rule: 'R11', detail: `misaccounted: ${name} sandbox at ship barrier, manual merge-back needed` })
  }

  let verdict: Verdict
  if (reasons.some((r) => KILL_RULES.has(r.rule))) verdict = 'kill'
  else if (reasons.length > 0) verdict = 'warn'
  else verdict = 'ok'

  return {
    id: loop.id,
    verdict,
    autonomy_level: loop.autonomy_level,
    enforcement: enforcementFor(loop.autonomy_level),
    report_only: loop.autonomy_level === 'L1',
    reasons,
    metrics: {
      runs_today: facts.runsToday,
      fail_streak: facts.failStreak,
      dry_rounds: facts.dryRounds,
      in_flight: facts.inFlight,
      minutes_since_last_run: minutesSince !== null ? Math.trunc(minutesSince) : null,
      latest_row_ok: facts.latestRowOk,
      misaccounted: facts.misaccounted.length,
    },
  }
}

// ── §2.3 编排（build_report）+ fs 注入面 ──────────────────────────────────────

/** enforce 的 fs 触面注入（默认真 node fs 由 cli 提供；kernel/test 注入 fake）。 */
export interface EnforceFs {
  loadRegistry: (repoRoot: string) => { data: LoopRegistry | null; errors: string[] }
  readProgress: (repoRoot: string) => string | null
  /** openspec/changes 下匹配 change_prefix 的 change 目录名（排除 archive）。 */
  listChanges: (repoRoot: string, changePrefix: string) => string[]
  /** 读 change 主账本 .pipeline.yaml 顶层标量（automation/phase/verify_result/branch_status/automation_worktree）。 */
  readChangeFields: (repoRoot: string, name: string) => Record<string, string> | null
  /** 读该 change 的调度器沙箱副本 .pipeline.yaml 顶层标量。 */
  readSandboxFields: (repoRoot: string, name: string, worktree: string | null) => Record<string, string> | null
}

export interface EnforceReport {
  version: 1
  generated_at: string
  verdicts: LoopVerdict[]
  skipped: { id: string; reason: string }[]
  notes: string[]
}

const SANDBOX_BARRIER: Record<string, string> = { phase: 'ship', verify_result: 'pass', branch_status: 'handled' }

/** openspec/changes/<prefix>* 中 automation∈{queued,running} 的目录数（缺/坏 .pipeline.yaml 计 0 + note）。 */
function countInFlight(fs: EnforceFs, repoRoot: string, changePrefix: string | null): { count: number; notes: string[] } {
  const notes: string[] = []
  if (!changePrefix) return { count: 0, notes }
  let count = 0
  for (const name of fs.listChanges(repoRoot, changePrefix)) {
    const fields = fs.readChangeFields(repoRoot, name)
    if (fields === null) {
      notes.push(`${name}: 缺/坏 .pipeline.yaml，计入 in_flight=0`)
      continue
    }
    const automation = fields.automation
    if (automation === undefined) {
      notes.push(`${name}: automation 字段缺失，计入 in_flight=0`)
      continue
    }
    if (IN_FLIGHT_STATES.has(automation)) count++
  }
  return { count, notes }
}

/** R11：主账本 automation=failed 而沙箱达 merge-back 屏障 → 误记账 change 名（稳定排序）。 */
function auditShipBarrier(fs: EnforceFs, repoRoot: string, changePrefix: string | null): string[] {
  if (!changePrefix) return []
  const misaccounted: string[] = []
  for (const name of fs.listChanges(repoRoot, changePrefix)) {
    const ledger = fs.readChangeFields(repoRoot, name)
    if (ledger === null || ledger.automation !== 'failed') continue
    const sandbox = fs.readSandboxFields(repoRoot, name, ledger.automation_worktree ?? null)
    if (sandbox === null) continue
    if (Object.entries(SANDBOX_BARRIER).every(([k, v]) => sandbox[k] === v)) misaccounted.push(name)
  }
  return misaccounted.sort()
}

/**
 * 编排（老 build_report 404-455）：registry 载入 → orchestrator 逐 loop 裁决（progress/在途/barrier 同项目配对读）
 * → executor 跳过。返回 {report, errors, exitCode}；errors 非空时 report=null（exitCode 3）。
 * exitCode：任一 kill→2 / 任一 warn→1 / 全 ok→0 / 载入或 --loop 错误→3。
 */
export function buildReport(
  repoRoot: string,
  opts: { onlyLoop?: string | null; now: Date },
  fs: EnforceFs,
): { report: EnforceReport | null; errors: string[]; exitCode: number } {
  const { data, errors } = fs.loadRegistry(repoRoot)
  if (errors.length > 0) return { report: null, errors, exitCode: 3 }
  if (data === null) return { report: null, errors: [`loops.yaml 未找到于 ${repoRoot}/.pipeline/loops.yaml`], exitCode: 3 }

  let loops = data.loops
  const onlyLoop = opts.onlyLoop ?? null
  if (onlyLoop !== null) {
    if (!loops.some((l) => l.id === onlyLoop)) return { report: null, errors: [`未知 --loop id: ${onlyLoop}`], exitCode: 3 }
    loops = loops.filter((l) => l.id === onlyLoop)
  }

  const orchestrators = loops.filter((l) => l.kind === 'orchestrator')
  const executors = loops.filter((l) => l.kind !== 'orchestrator')

  const loopIds = orchestrators.map((l) => l.id)
  const parsed = parseProgress(fs.readProgress(repoRoot), loopIds, opts.now)

  const verdicts: LoopVerdict[] = []
  const notes: string[] = []
  for (const loop of orchestrators) {
    const { count, notes: ifNotes } = countInFlight(fs, repoRoot, loop.change_prefix)
    for (const n of ifNotes) notes.push(`${loop.id}: ${n}`)
    const misaccounted = auditShipBarrier(fs, repoRoot, loop.change_prefix)
    const p = parsed.get(loop.id)!
    const facts: RunFacts = {
      runsToday: p.runsToday,
      failStreak: p.failStreak,
      dryRounds: p.dryRounds,
      lastRunAt: p.lastRunAt,
      latestRowOk: p.latestRowOk,
      inFlight: count,
      misaccounted,
    }
    verdicts.push(adjudicate(loop, facts, opts.now))
  }

  const skipped = executors.map((l) => ({
    id: l.id,
    reason: `kind=${l.kind} 不在裁决范围（state 为调度器日志，由 service-doctor/坑单 playbook 治理）`,
  }))

  const report: EnforceReport = {
    version: 1,
    generated_at: opts.now.toISOString().slice(0, 16),
    verdicts,
    skipped,
    notes,
  }

  const exitCode = verdicts.some((v) => v.verdict === 'kill') ? 2 : verdicts.some((v) => v.verdict === 'warn') ? 1 : 0
  return { report, errors: [], exitCode }
}
