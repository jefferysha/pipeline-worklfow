/**
 * loops drift + audit —— 漂移检测（loop-sync）+ loop-ready 就绪评分（loop-audit）
 * （BACKLOG #37 / GOAL B21 / D16 —— loop-engineering 内建，两竞品都无此面的护城河）。
 *
 * ── loop-engineering 语义盘点（对标 cobusgreyling/loop-engineering，MIT；仅适配语义，未复制代码）──
 *   · loop-sync（drift detection）：对账「声明意图」与「实际状态」——上游是 STATE.md（loop 当前实际
 *     状态）vs LOOP.md（loop 声明协议）的漂移检测。本仓把三方真相源对齐做对账：
 *       ① 声明意图 = registry（`.pipeline/loops.yaml`，机器真相源，#35 schema 校验过）；
 *       ② 人类镜像 = LOOP.md（人读协议镜像，应提及每个 registry id——老仓 TestLoopMdMirror
 *          `test_loop_md_mentions_every_registry_id` 只校验 id 提及，本项把它**推广**成通用 drift）；
 *       ③ 实际状态/流水 = run-log（`.superpowers/loops/progress.md`，逐轮 append 的执行事实）。
 *     七个漂移维度（声明 vs 实际不一致 = drift）：
 *       · mirror-missing   registry id 未在 LOOP.md 提及（老 TestLoopMdMirror 的正向断言）
 *       · mirror-orphan    LOOP.md 声明的 loop（### `id` 标题）已不在 registry（反向：文档落后于登记表）
 *       · runlog-orphan-id run-log 记了未登记的 loop id（流水引用了幽灵/已删 loop）
 *       · never-run        active + 有限 cadence 的 loop 流水零执行（声明要跑却从未跑）
 *       · cadence-idle     距上次执行 > 2× cadence（声明 1h 却 3h 没跑——节奏漂移，对应上游 State Rot）
 *       · change-prefix    run-log 记录的 `change=<name>` 与声明 change_prefix 不符（产出归属漂移）
 *       · status-drift     status=paused/retired 但今日仍有执行（声明已停却实际在跑）
 *   · loop-audit（loop-ready score 0-100）：给 loop **定义就绪度**打分——一个 schema 合法的 loop
 *     未必"就绪"，就绪要求治理要件齐全（明确 goal / kill 判据 / human gates / 预算 / 可调度 cadence /
 *     产出隔离 change_prefix / 可观测 design_doc）。七维加权求和到 100，缺项给具体改进建议：
 *       goal 20 · kill_criteria 20 · human_gates 20 · budget 15 · cadence 10 · change_prefix 5 · observability 10
 *     分档：≥90 ready / ≥70 mostly-ready / <70 not-ready（CI 门以 <70 视为未就绪 → exit 1）。
 *
 * ── 本仓工程约束 ──
 *   · kernel 零第三方依赖（CONTRACT §1）：run-log / LOOP.md 解析全手写，时间戳契约与 enforce/budget 对齐。
 *   · 纯逻辑（detectDrift / computeReadiness）+ 注入 fs 面（DriftFs：登记载入 + run-log 读 + LOOP.md 读）；
 *     mock 层快速回归，integration 走真 node fs。
 *   · 只扩展 #35/#36 loops，不改 registry/enforce/budget/types 核心：复用 enforce 导出的 cadenceMinutes
 *     （cadence→分钟，口径一致），漂移/评分是独立子命令，enforce/budget 零改动。
 */
import { cadenceMinutes } from './enforce.js'
import type { LoopEntry, LoopRegistry } from './types.js'

// ── 阈值常量 ───────────────────────────────────────────────────────────────────

/** 距上次执行 > N× cadence 视为节奏漂移（cadence-idle）；与 enforce STRIKE_MULTIPLIER 同口径。 */
export const DRIFT_CADENCE_MULTIPLIER = 2
/** loop-ready 分界：≥90 ready。 */
export const READY_STRONG = 90
/** loop-ready 分界：≥70 mostly-ready，<70 not-ready（CI 门）。 */
export const READY_THRESHOLD = 70

// ── run-log / LOOP.md 时间戳与解析（契约同 enforce parseProgress / budget sumRunLogTokens）─────

const TS_FULL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
const TS_SHORT_RE = /^(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
const ID_RE = /^[a-z][a-z0-9-]*$/
const CHANGE_RE = /change=([A-Za-z0-9._-]+)/g
const DOC_HEADING_RE = /^###\s+.*?`([a-z][a-z0-9-]*)`/

function mkUTC(y: number, mo: number, d: number, hh: number, mm: number): Date | null {
  const dt = new Date(Date.UTC(y, mo - 1, d, hh, mm))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d ||
      dt.getUTCHours() !== hh || dt.getUTCMinutes() !== mm) return null
  return dt
}

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
 * 从 LOOP.md 抽取声明的 loop id（`### `<id>`` 标题里第一个反引号 id）。
 * 老/新 LOOP.md 两仓都用此格式（`### `loop-lite` — …`），是稳定的文档侧 id 来源（避免裸文本误配）。
 */
export function extractDocLoopIds(docText: string | null): string[] {
  if (docText === null) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const rawLine of docText.split('\n')) {
    const m = rawLine.match(DOC_HEADING_RE)
    if (m && !seen.has(m[1]!)) {
      seen.add(m[1]!)
      out.push(m[1]!)
    }
  }
  return out
}

interface LoopRunFacts {
  runs: number
  runsToday: number
  lastRunAt: Date | null
  changeRefs: string[]
}

/**
 * 解析 run-log（5 列表格）为 `Map<loopId, LoopRunFacts>`（含每个出现过的 id，用于孤儿检测）。
 * 只计「时间戳可解析 + loop id 合法（^[a-z][a-z0-9-]*$）」的行——天然过滤表头/分隔行。
 * note 列内 `change=<name>` 全量抽出（change-prefix 漂移用）。
 */
function parseRunLog(text: string | null, now: Date): Map<string, LoopRunFacts> {
  const map = new Map<string, LoopRunFacts>()
  if (text === null) return map
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line.startsWith('|')) continue
    const cols = line.replace(/^\|+/, '').replace(/\|+$/, '').split('|').map((c) => c.trim())
    if (cols.length < 2) continue
    const ts = parseTimestamp(cols[0]!, now)
    if (ts === null) continue
    const id = cols[1]!
    if (!ID_RE.test(id)) continue
    let f = map.get(id)
    if (!f) {
      f = { runs: 0, runsToday: 0, lastRunAt: null, changeRefs: [] }
      map.set(id, f)
    }
    f.runs++
    if (sameUTCDate(ts, now)) f.runsToday++
    if (f.lastRunAt === null || ts.getTime() > f.lastRunAt.getTime()) f.lastRunAt = ts
    for (const cm of line.matchAll(CHANGE_RE)) f.changeRefs.push(cm[1]!)
  }
  return map
}

// ── 漂移检测 ───────────────────────────────────────────────────────────────────

export type DriftDimension =
  | 'mirror-missing'
  | 'mirror-orphan'
  | 'runlog-orphan-id'
  | 'never-run'
  | 'cadence-idle'
  | 'change-prefix'
  | 'status-drift'

export type DriftSeverity = 'warn' | 'info'

export interface DriftItem {
  /** 归属的 loop id（mirror-orphan/runlog-orphan-id 为文档/流水侧的幽灵 id）。 */
  loop: string
  dimension: DriftDimension
  severity: DriftSeverity
  detail: string
  suggestion: string
}

export interface DriftReport {
  version: 1
  generated_at: string
  clean: boolean
  /** 被检查的 registry loop id 集（--loop 过滤时为单元素）。 */
  checked: string[]
  items: DriftItem[]
}

/**
 * 纯函数：registry（声明）× LOOP.md（镜像）× run-log（实际）三方对账，返回全部漂移项。
 * 不做 --loop 过滤（过滤在 buildDriftReport 层，便于 orphan 类跨登记表维度先全量算）。
 */
export function detectDrift(
  registry: LoopRegistry,
  docText: string | null,
  runLogText: string | null,
  now: Date,
): DriftReport {
  const items: DriftItem[] = []
  const regIds = new Set(registry.loops.map((l) => l.id))
  const runFacts = parseRunLog(runLogText, now)

  // ── 镜像对账（LOOP.md ↔ registry）──
  if (docText === null) {
    items.push({
      loop: '*', dimension: 'mirror-missing', severity: 'warn',
      detail: 'LOOP.md 缺失——无人类可读镜像',
      suggestion: '创建仓根 LOOP.md，并为每个 registry loop 写一节（### `id`）',
    })
  } else {
    // 两侧对称用 extractDocLoopIds（`### `id`` 标题精确抽取）判定「已提及」：
    // 裸 docText.includes(l.id) 会把 id `lite` 误判进 `elite` 子串（漏报 mirror-missing）。
    const docIds = new Set(extractDocLoopIds(docText))
    for (const l of registry.loops) {
      if (!docIds.has(l.id)) {
        items.push({
          loop: l.id, dimension: 'mirror-missing', severity: 'warn',
          detail: `registry loop ${l.id} 未在 LOOP.md 提及`,
          suggestion: `在 LOOP.md 补一节 ### \`${l.id}\`，同步声明协议（TestLoopMdMirror 口径）`,
        })
      }
    }
    for (const docId of docIds) {
      if (!regIds.has(docId)) {
        items.push({
          loop: docId, dimension: 'mirror-orphan', severity: 'warn',
          detail: `LOOP.md 声明的 loop ${docId} 不在 registry`,
          suggestion: `删除 LOOP.md 中 ${docId} 一节，或补回 .pipeline/loops.yaml 登记`,
        })
      }
    }
  }

  // ── 流水孤儿：run-log 记了未登记的 loop id ──
  for (const [runId] of runFacts) {
    if (!regIds.has(runId)) {
      items.push({
        loop: runId, dimension: 'runlog-orphan-id', severity: 'warn',
        detail: `run-log 记录了未登记的 loop ${runId}`,
        suggestion: `登记 ${runId} 进 .pipeline/loops.yaml，或核对流水归属列是否写错`,
      })
    }
  }

  // ── 逐 registry loop：调度 / 归属 / 状态漂移 ──
  for (const l of registry.loops) {
    const facts = runFacts.get(l.id) ?? null
    const cadenceMin = cadenceMinutes(l.cadence)

    // never-run / cadence-idle 仅对 active + 有限 cadence 判定
    if (l.status === 'active' && cadenceMin !== null) {
      if (facts === null || facts.runs === 0) {
        items.push({
          loop: l.id, dimension: 'never-run', severity: 'warn',
          detail: `声明 active 每 ${l.cadence} 但 run-log 无任何执行记录`,
          suggestion: `确认 loop 是否已启动；若已停用应改 status=paused/retired`,
        })
      } else if (facts.lastRunAt !== null) {
        const gap = (now.getTime() - facts.lastRunAt.getTime()) / 60000
        const threshold = DRIFT_CADENCE_MULTIPLIER * cadenceMin
        if (gap > threshold) {
          const missed = Math.floor(gap / cadenceMin)
          items.push({
            loop: l.id, dimension: 'cadence-idle', severity: 'warn',
            detail: `声明 cadence ${l.cadence}（${cadenceMin}m）但距上次执行 ${Math.trunc(gap)}m（>${Math.trunc(threshold)}m，约漏 ${missed} 轮）`,
            suggestion: `loop 落后于声明节奏，检查调度器/编排会话是否停摆`,
          })
        }
      }
    }

    // change-prefix：run-log change=<name> 与声明 prefix 不符
    if (l.change_prefix !== null && l.change_prefix !== '' && facts !== null) {
      const mismatched = [...new Set(facts.changeRefs.filter((c) => !c.startsWith(l.change_prefix!)))]
      if (mismatched.length > 0) {
        items.push({
          loop: l.id, dimension: 'change-prefix', severity: 'warn',
          detail: `run-log change 名 [${mismatched.join(', ')}] 不匹配声明 change_prefix=${l.change_prefix}`,
          suggestion: `核对这些 change 的归属，或更正 loop 的 change_prefix`,
        })
      }
    }

    // status-drift：已停用但今日仍在跑
    if ((l.status === 'paused' || l.status === 'retired') && facts !== null && facts.runsToday > 0) {
      items.push({
        loop: l.id, dimension: 'status-drift', severity: 'warn',
        detail: `status=${l.status} 但今日仍有 ${facts.runsToday} 次执行记录`,
        suggestion: `停用的 loop 不应继续执行；检查调度器是否忽略了 kill switch`,
      })
    }
  }

  return {
    version: 1,
    generated_at: now.toISOString().slice(0, 16),
    clean: items.every((i) => i.severity !== 'warn'),
    checked: registry.loops.map((l) => l.id),
    items,
  }
}

// ── loop-ready 就绪评分（loop-audit）──────────────────────────────────────────

export type ReadinessBand = 'ready' | 'mostly-ready' | 'not-ready'

export interface ReadinessDimension {
  name: string
  score: number
  max: number
  /** 未满分时的具体改进建议；满分为 null。 */
  suggestion: string | null
}

export interface ReadinessScore {
  id: string
  score: number
  band: ReadinessBand
  dimensions: ReadinessDimension[]
  /** 各维度非空 suggestion 的汇总（band=ready 时为空）。 */
  suggestions: string[]
}

function dim(name: string, score: number, max: number, suggestion: string | null): ReadinessDimension {
  return { name, score, max, suggestion: score >= max ? null : suggestion }
}

/** 纯函数：单个 loop 的 loop-ready 评分（0-100，防御式读缺失/空字段计 0）。 */
export function computeReadiness(loop: LoopEntry): ReadinessScore {
  const dims: ReadinessDimension[] = []

  // goal 20：≥30 满 / 10-29 部分 / >0 少 / 0 无
  const goalLen = (loop.goal ?? '').trim().length
  const goalScore = goalLen >= 30 ? 20 : goalLen >= 10 ? 12 : goalLen > 0 ? 6 : 0
  dims.push(dim('goal', goalScore, 20, `goal 应写明可收敛的明确目标（当前 ${goalLen} 字符，建议 ≥30）`))

  // kill_criteria 20：≥2 满 / 1 部分 / 0 无
  const killN = (loop.kill_criteria ?? []).length
  dims.push(dim('kill_criteria', killN >= 2 ? 20 : killN === 1 ? 12 : 0, 20,
    `补充 kill/终止判据（当前 ${killN} 条，建议 ≥2：如空轮收敛 + 连败熔断）`))

  // human_gates 20：≥2 满 / 1 部分 / 0 无
  const gateN = (loop.human_gates ?? []).length
  dims.push(dim('human_gates', gateN >= 2 ? 20 : gateN === 1 ? 12 : 0, 20,
    `补充 human gate 人工门（当前 ${gateN} 条，建议 ≥2：如破坏性变更 + push/合并）`))

  // budget 15：max_runs+max_in_flight 基线 10 + token 预算 5
  const b = loop.budget
  const hasBase = !!b && typeof b.max_runs_per_day === 'number' && b.max_runs_per_day >= 1 && typeof b.max_in_flight === 'number'
  const hasToken = !!b && typeof b.max_tokens_per_day === 'number'
  const budgetScore = (hasBase ? 10 : 0) + (hasToken ? 5 : 0)
  dims.push(dim('budget', budgetScore, 15,
    hasBase ? '声明 budget.max_tokens_per_day 以启用 token circuit breaker 熔断（#36）'
      : '补 budget.max_runs_per_day / max_in_flight 资源上限'))

  // cadence 10：有限 满 / continuous 部分 / 缺失 无
  const cadenceMin = cadenceMinutes(loop.cadence ?? '')
  const isContinuous = loop.cadence === 'continuous'
  const cadenceScore = cadenceMin !== null ? 10 : isContinuous ? 6 : 0
  dims.push(dim('cadence', cadenceScore, 10,
    isContinuous ? 'continuous cadence 无法估算每日成本——若非常驻执行器，考虑设有限 cadence'
      : '声明可调度的有限 cadence（如 1h / 30m）'))

  // change_prefix 5：非空 满
  const hasPrefix = typeof loop.change_prefix === 'string' && loop.change_prefix.trim() !== ''
  dims.push(dim('change_prefix', hasPrefix ? 5 : 0, 5,
    '声明 change_prefix 以隔离本 loop 产出的 change（便于在途计数/归属对账）'))

  // observability 10：design_doc 是治理文档；iteration runtime state 由 ledger 投影，不以旧路径字段计分。
  const hasDoc = (loop.design_doc ?? '').trim().length >= 2
  dims.push(dim('observability', hasDoc ? 10 : 0, 10,
    '补 design_doc（设计文档）；iteration runtime state 由 ledger audit facts 投影'))

  const score = dims.reduce((a, d) => a + d.score, 0)
  const band: ReadinessBand = score >= READY_STRONG ? 'ready' : score >= READY_THRESHOLD ? 'mostly-ready' : 'not-ready'
  const suggestions = dims.filter((d) => d.suggestion !== null).map((d) => `[${d.name}] ${d.suggestion!}`)
  return { id: loop.id, score, band, dimensions: dims, suggestions }
}

// ── 编排 + fs 注入面 ───────────────────────────────────────────────────────────

/** drift/audit 的 fs 触面注入（默认真 node fs 由 cli 提供；kernel/test 注入 fake）。 */
export interface DriftFs {
  loadRegistry: (repoRoot: string) => { data: LoopRegistry | null; errors: string[] }
  /** 读运行流水 run-log（progress.md）原文；缺失 → null。 */
  readRunLog: (repoRoot: string) => string | null
  /** 读仓根 LOOP.md 人类镜像原文；缺失 → null。 */
  readLoopDoc: (repoRoot: string) => string | null
}

export interface DriftReportEnvelope {
  report: DriftReport | null
  errors: string[]
  exitCode: number
}

export interface AuditReport {
  version: 1
  generated_at: string
  scores: ReadinessScore[]
}

export interface AuditReportEnvelope {
  report: AuditReport | null
  errors: string[]
  exitCode: number
}

/** 载入 registry + 校验 --loop（共用 drift/audit）；error → {registry:null, errors, exitCode:3}。 */
function resolveRegistry(
  repoRoot: string,
  onlyLoop: string | null,
  fs: Pick<DriftFs, 'loadRegistry'>,
): { registry: LoopRegistry | null; errors: string[]; exitCode: number } {
  const { data, errors } = fs.loadRegistry(repoRoot)
  if (errors.length > 0) return { registry: null, errors, exitCode: 3 }
  if (data === null) return { registry: null, errors: [`loops.yaml 未找到于 ${repoRoot}/.pipeline/loops.yaml`], exitCode: 3 }
  if (onlyLoop !== null && !data.loops.some((l) => l.id === onlyLoop)) {
    return { registry: null, errors: [`未知 --loop id: ${onlyLoop}`], exitCode: 3 }
  }
  return { registry: data, errors: [], exitCode: 0 }
}

/**
 * 编排漂移检测：registry 载入 → 三方对账 → --loop 过滤（只留该 loop 的漂移项）。
 * exitCode：任一 warn 漂移 → 1 / clean → 0 / 载入或 --loop 错误 → 3。
 */
export function buildDriftReport(
  repoRoot: string,
  onlyLoop: string | null,
  now: Date,
  fs: DriftFs,
): DriftReportEnvelope {
  const { registry, errors, exitCode } = resolveRegistry(repoRoot, onlyLoop, fs)
  if (registry === null) return { report: null, errors, exitCode }

  const full = detectDrift(registry, fs.readLoopDoc(repoRoot), fs.readRunLog(repoRoot), now)
  const items = onlyLoop === null ? full.items : full.items.filter((i) => i.loop === onlyLoop)
  const checked = onlyLoop === null ? full.checked : [onlyLoop]
  const report: DriftReport = {
    version: 1, generated_at: full.generated_at,
    clean: items.every((i) => i.severity !== 'warn'), checked, items,
  }
  return { report, errors: [], exitCode: report.clean ? 0 : 1 }
}

/**
 * 编排 loop-ready 审计：registry 载入 → 逐 loop 就绪评分。
 * exitCode：任一 not-ready（<70）→ 1 / 其余 → 0 / 载入或 --loop 错误 → 3。
 */
export function buildAuditReport(
  repoRoot: string,
  onlyLoop: string | null,
  now: Date,
  fs: Pick<DriftFs, 'loadRegistry'>,
): AuditReportEnvelope {
  const { registry, errors, exitCode } = resolveRegistry(repoRoot, onlyLoop, fs)
  if (registry === null) return { report: null, errors, exitCode }

  const loops = onlyLoop === null ? registry.loops : registry.loops.filter((l) => l.id === onlyLoop)
  const scores = loops.map(computeReadiness)
  const code = scores.some((s) => s.band === 'not-ready') ? 1 : 0
  return {
    report: { version: 1, generated_at: now.toISOString().slice(0, 16), scores },
    errors: [], exitCode: code,
  }
}
