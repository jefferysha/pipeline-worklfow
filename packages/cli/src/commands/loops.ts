/**
 * loops 子命令 —— loop 治理子系统 CLI 薄壳（BACKLOG #35 / GOAL B18 / D16 —— loop-engineering 内建）。
 * 老仓真相源：skills/pipeline/scripts/loops_registry.py（load_registry）+ loops_enforce.py（build_report / main CLI）。
 *   list [--json]              登记表（老 /api/loops 数据面回显；缺文件→提示 exit 0，校验错→定位错误 exit 1）
 *   enforce [--loop id][--json] 跑 R1-R11 裁决出 verdict（老 loops_enforce main；exit 0 ok / 1 warn / 2 kill / 3 错误）
 *   status                     概览：逐 loop status + verdict + 分级放权 enforcement
 *   budget [loop][--json]      #36 circuit breaker：run-log 今日累计 token 花费 vs max_tokens_per_day
 *                              （exit 0 ok / 1 warn 减速线 / 2 tripped 熔断 / 3 错误；GOAL B20/D16）
 *   cost [loop][--json]        #36 成本估算：cadence×pattern → 预估 token/日 vs 预算（超预算 exit 1）
 *   graduate [loop][--json]    #38 分级放权毕业制：消费 #37 audit/drift + #36 breaker 出升降档裁决
 *                              （exit 0 稳态 / 1 可升档待人工门 / 2 降档信号 / 3 错误；GOAL B19/D16）
 *   level <loop> [set <L>][--confirm]  #38 查看/建议档位；`set <L1|L2|L3> --confirm` 逐级毕业改档
 *                              （安全默认：无 --confirm = dry-run 不落盘；升档须准入；跨级/未过准入拒 exit 2）
 * stdout/exit 对齐老仓：数据/裁决走 stdout，error/定位错误走 stderr。--json 对齐老仓信封（+本轮 autonomy 字段）。
 *
 * 分级放权 L1→L3：schema 纳入 autonomy_level（缺省 L1 report-only），enforce 认级别并回显 enforcement/report_only；
 * #38 graduate/level 把 verdict×level 落成毕业制执行面（report → 人工门放行 → allowlist 自动合并）。
 * loops 读为主——list/enforce/status/budget/cost/drift/audit/graduate + level view 全只读；**唯一 mutation** =
 * `level set --confirm` 的 autonomy_level surgical 单行改写（不重排/不丢注释，且过准入门 + 显式确认）。
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import {
  addDraftMark,
  appendLoopToYamlText,
  applyLevelChange,
  buildAuditReport,
  buildBudgetReport,
  buildCostReport,
  buildDriftReport,
  buildGraduationReport,
  buildReport,
  createLoopsYamlText,
  draftMarksPath,
  enforcementFor,
  loadRegistry as kernelLoadRegistry,
  LOOP_RUNNERS,
  PHASES,
  type AuditReport,
  type BudgetFs,
  type BudgetReport,
  type CostReport,
  type DriftFs,
  type DriftReport,
  type EnforceFs,
  type EnforceReport,
  type GraduationFs,
  type GraduationReport,
  type GraduationVerdict,
  type LoopBudget,
  type LoopEntry,
  type LoopKind,
  type LoopRegistry,
  type LoopRisk,
  type NewLoopEntryInput,
} from '@pipeline-lite/kernel'
import { errMsg, type CliDeps } from '../deps.js'

// 供 mock/集成测试构造 fake fs / 类型断言
export type { LoopEntry, LoopRegistry, DriftFs, GraduationFs } from '@pipeline-lite/kernel'
/** cli 层的 loops fs 注入面（= kernel EnforceFs：登记载入 + progress/在途/沙箱读）。 */
export type LoopsFs = EnforceFs

// ── 真 node fs 实现（默认；integration 走此真路径）─────────────────────────────

/** 读 .pipeline.yaml 顶层标量 `key: value` → Record（缺文件 → null；只取顶层，无缩进）。 */
function readTopLevelScalars(absPath: string): Record<string, string> | null {
  let text: string
  try {
    text = readFileSync(absPath, 'utf8')
  } catch {
    return null
  }
  const out: Record<string, string> = {}
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '')
    if (line === '' || /^\s/.test(line) || line.trimStart().startsWith('#')) continue
    const m = line.match(/^([A-Za-z_][\w.-]*):\s*(.*)$/)
    if (!m) continue
    let v = m[2]!.trim()
    if (!(v.startsWith('"') || v.startsWith("'"))) {
      const cm = v.match(/^(.*?)\s+#.*$/)
      if (cm) v = cm[1]!.trimEnd()
    } else if (v.length >= 2 && (v[0] === v[v.length - 1])) {
      v = v.slice(1, -1)
    }
    out[m[1]!] = v
  }
  return out
}

/** 沙箱副本定位（老 _resolve_sandbox_pipeline_yaml 247-256）：automation_worktree 优先，否则命名约定。 */
function sandboxPipelineYaml(repoRoot: string, name: string, worktree: string | null): string {
  let base: string
  if (worktree && worktree.trim() !== '') {
    const w = worktree.trim()
    base = isAbsolute(w) ? w : join(repoRoot, w)
  } else {
    base = join(repoRoot, '.sandcastle', 'worktrees', `sandcastle-pipeline-${name}`)
  }
  return join(base, 'openspec', 'changes', name, '.pipeline.yaml')
}

export const REAL_LOOPS_FS: LoopsFs = {
  loadRegistry: (repoRoot) => kernelLoadRegistry(repoRoot),
  readProgress: (repoRoot) => {
    try {
      return readFileSync(join(repoRoot, '.superpowers', 'loops', 'progress.md'), 'utf8')
    } catch {
      return null
    }
  },
  listChanges: (repoRoot, changePrefix) => {
    try {
      return readdirSync(join(repoRoot, 'openspec', 'changes'), { withFileTypes: true })
        .filter((e) => e.isDirectory() && e.name !== 'archive' && e.name.startsWith(changePrefix))
        .map((e) => e.name)
        .sort()
    } catch {
      return []
    }
  },
  readChangeFields: (repoRoot, name) => readTopLevelScalars(join(repoRoot, 'openspec', 'changes', name, '.pipeline.yaml')),
  readSandboxFields: (repoRoot, name, worktree) => readTopLevelScalars(sandboxPipelineYaml(repoRoot, name, worktree)),
}

// ── #37 drift/audit 真 node fs（登记 + run-log + LOOP.md 镜像）─────────────────
export const REAL_DRIFT_FS: DriftFs = {
  loadRegistry: (repoRoot) => kernelLoadRegistry(repoRoot),
  readRunLog: (repoRoot) => REAL_LOOPS_FS.readProgress(repoRoot),
  readLoopDoc: (repoRoot) => {
    try {
      return readFileSync(join(repoRoot, 'LOOP.md'), 'utf8')
    } catch {
      return null
    }
  },
}

// ── #38 graduation 真 node fs（登记 + run-log + LOOP.md 镜像 + loops.yaml 原文读写）──
export const REAL_GRADUATION_FS: GraduationFs = {
  loadRegistry: (repoRoot) => kernelLoadRegistry(repoRoot),
  readRunLog: (repoRoot) => REAL_LOOPS_FS.readProgress(repoRoot),
  readLoopDoc: (repoRoot) => REAL_DRIFT_FS.readLoopDoc(repoRoot),
  readRegistryText: (repoRoot) => {
    try {
      return readFileSync(join(repoRoot, '.pipeline', 'loops.yaml'), 'utf8')
    } catch {
      return null
    }
  },
  writeRegistryText: (repoRoot, text) => writeFileSync(join(repoRoot, '.pipeline', 'loops.yaml'), text, 'utf8'),
}

// ── arg 解析 ──────────────────────────────────────────────────────────────────

interface ParsedArgs {
  json: boolean
  loop: string | null
}

function parseArgs(args: string[]): ParsedArgs {
  let json = false
  let loop: string | null = null
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === '--json') json = true
    else if (a === '--loop') loop = args[++i] ?? null
  }
  return { json, loop }
}

// ── 渲染 ──────────────────────────────────────────────────────────────────────

const pad = (s: string, n: number): string => (s.length >= n ? s : s + ' '.repeat(n - s.length))

function loopSummaryLine(l: LoopEntry): string {
  const prefix = l.change_prefix === null ? '(none)' : l.change_prefix
  return `  ${pad(l.id, 16)} ${pad(l.kind, 13)} ${pad(l.cadence, 11)} status=${pad(l.status, 8)} ` +
    `${l.autonomy_level}/${enforcementFor(l.autonomy_level)}  budget=${l.budget.max_runs_per_day}/${l.budget.max_in_flight}  prefix=${prefix}`
}

function printRegistryTable(deps: CliDeps, reg: LoopRegistry): void {
  deps.io.out(`[LOOPS] ${reg.loops.length} registered`)
  for (const l of reg.loops) deps.io.out(loopSummaryLine(l))
}

function printReportTable(deps: CliDeps, report: EnforceReport): void {
  deps.io.out(`${pad('id', 20)} ${pad('verdict', 6)} ${pad('enforce', 13)} rules`)
  for (const v of report.verdicts) {
    const rules = v.reasons.map((r) => r.rule).join(',') || '-'
    deps.io.out(`${pad(v.id, 20)} ${pad(v.verdict, 6)} ${pad(v.enforcement, 13)} ${rules}`)
  }
  for (const s of report.skipped) deps.io.out(`${pad(s.id, 20)} ${pad('skip', 6)} ${pad('-', 13)} ${s.reason}`)
  if (report.notes.length > 0) {
    deps.io.out('notes:')
    for (const n of report.notes) deps.io.out(`  ${n}`)
  }
}

// ── 子命令 ────────────────────────────────────────────────────────────────────

function cmdList(deps: CliDeps, p: ParsedArgs, fs: LoopsFs): number {
  const { data, errors } = fs.loadRegistry(deps.cwd)
  if (errors.length > 0) {
    for (const e of errors) deps.io.err(`ERROR: ${e}`)
    return 1
  }
  if (data === null) {
    deps.io.out('(no loops registry) .pipeline/loops.yaml 未找到——本项目无登记 loop（常态，非错误）')
    return 0
  }
  if (p.json) {
    deps.io.out(JSON.stringify(data, null, 2))
    return 0
  }
  printRegistryTable(deps, data)
  return 0
}

function cmdEnforce(deps: CliDeps, p: ParsedArgs, fs: LoopsFs): number {
  const now = new Date(deps.clock())
  const { report, errors, exitCode } = buildReport(deps.cwd, { onlyLoop: p.loop, now }, fs)
  if (errors.length > 0 || report === null) {
    for (const e of errors) deps.io.err(`ERROR: ${e}`)
    return exitCode
  }
  if (p.json) {
    deps.io.out(JSON.stringify(report, null, 2))
    return exitCode
  }
  printReportTable(deps, report)
  return exitCode
}

function cmdStatus(deps: CliDeps, fs: LoopsFs): number {
  const { data, errors } = fs.loadRegistry(deps.cwd)
  if (errors.length > 0) {
    for (const e of errors) deps.io.err(`ERROR: ${e}`)
    return 1
  }
  if (data === null) {
    deps.io.out('(no loops registry) .pipeline/loops.yaml 未找到')
    return 0
  }
  const now = new Date(deps.clock())
  const { report } = buildReport(deps.cwd, { now }, fs)
  const verdictById = new Map((report?.verdicts ?? []).map((v) => [v.id, v.verdict]))
  deps.io.out('[LOOPS status]')
  for (const l of data.loops) {
    const verdict = verdictById.get(l.id) ?? '-(skip)'
    deps.io.out(`  ${pad(l.id, 16)} status=${pad(l.status, 8)} verdict=${pad(verdict, 8)} ${l.autonomy_level}/${enforcementFor(l.autonomy_level)}`)
  }
  return 0
}

// ── #36 budget / cost 子命令（token 预算 + circuit breaker + 成本估算）──────────────

/** budget/cost 的 loop id：--loop 优先，否则第一个位置参数（不改共享 parseArgs，enforce 不受影响）。 */
function positionalLoop(args: string[]): string | null {
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === '--loop') { i++; continue } // 跳过其值
    if (a.startsWith('--')) continue
    return a
  }
  return null
}

/** BudgetFs 由 LoopsFs（=EnforceFs）适配：登记载入复用，run-log 读取复用 readProgress（progress.md）。 */
function toBudgetFs(fs: LoopsFs): BudgetFs {
  return { loadRegistry: fs.loadRegistry, readRunLog: fs.readProgress }
}

function printBudgetTable(deps: CliDeps, report: BudgetReport): void {
  deps.io.out('[LOOPS budget · circuit breaker]')
  for (const s of report.statuses) {
    const max = s.maxTokensPerDay === null ? '(none)' : String(s.maxTokensPerDay)
    const remaining = s.remaining === null ? '-' : String(s.remaining)
    const enf = s.reportOnly ? 'report-only' : s.autonomyLevel === 'L2' ? 'assisted' : 'unattended'
    deps.io.out(
      `  ${pad(s.id, 16)} breaker=${pad(s.breaker, 8)} spent=${s.spentToday}/${max} ` +
      `remaining=${pad(remaining, 8)} ${s.autonomyLevel}/${enf}  on_exceed=${s.onExceed}`,
    )
    deps.io.out(`    ${s.reason}`)
  }
}

function printCostTable(deps: CliDeps, report: CostReport): void {
  deps.io.out('[LOOPS cost · estimate]')
  for (const e of report.estimates) {
    const runs = e.runsPerDay === null ? '(continuous)' : String(e.runsPerDay)
    const est = e.estimatedTokensPerDay === null ? '-' : `${e.estimatedTokensPerDay}/day`
    const max = e.maxTokensPerDay === null ? '(none)' : String(e.maxTokensPerDay)
    const within = e.withinBudget === null ? '-' : e.withinBudget ? 'yes' : 'NO'
    const headroom = e.headroom === null ? '-' : String(e.headroom)
    deps.io.out(
      `  ${pad(e.id, 16)} cadence=${pad(e.cadence, 11)} runs/day=${pad(runs, 12)} pattern=${pad(e.pattern, 12)} ` +
      `tokens/run=${e.tokensPerRun}  est=${pad(est, 12)} budget=${pad(max, 8)} within=${pad(within, 4)} headroom=${headroom}`,
    )
  }
}

function cmdBudget(deps: CliDeps, args: string[], fs: LoopsFs): number {
  const p = parseArgs(args)
  const onlyLoop = p.loop ?? positionalLoop(args)
  const now = new Date(deps.clock())
  const { report, errors, exitCode } = buildBudgetReport(deps.cwd, onlyLoop, now, toBudgetFs(fs))
  if (errors.length > 0 || report === null) {
    for (const e of errors) deps.io.err(`ERROR: ${e}`)
    return exitCode
  }
  if (p.json) {
    deps.io.out(JSON.stringify(report, null, 2))
    return exitCode
  }
  printBudgetTable(deps, report)
  return exitCode
}

function cmdCost(deps: CliDeps, args: string[], fs: LoopsFs): number {
  const p = parseArgs(args)
  const onlyLoop = p.loop ?? positionalLoop(args)
  const now = new Date(deps.clock())
  const { report, errors, exitCode } = buildCostReport(deps.cwd, onlyLoop, now, toBudgetFs(fs))
  if (errors.length > 0 || report === null) {
    for (const e of errors) deps.io.err(`ERROR: ${e}`)
    return exitCode
  }
  if (p.json) {
    deps.io.out(JSON.stringify(report, null, 2))
    return exitCode
  }
  printCostTable(deps, report)
  return exitCode
}

// ── #37 drift / audit 子命令（漂移检测 loop-sync + loop-ready 就绪评分 loop-audit）────

function printDriftTable(deps: CliDeps, report: DriftReport): void {
  deps.io.out('[LOOPS drift · loop-sync（声明 vs 实际对账）]')
  deps.io.out(`  checked=[${report.checked.join(', ')}]  ${report.clean ? 'CLEAN（无漂移）' : `${report.items.length} 漂移项`}`)
  for (const it of report.items) {
    deps.io.out(`  ${pad(it.severity, 4)} ${pad(it.dimension, 17)} ${pad(it.loop, 16)} ${it.detail}`)
    deps.io.out(`       → ${it.suggestion}`)
  }
}

function printAuditTable(deps: CliDeps, report: AuditReport): void {
  deps.io.out('[LOOPS audit · loop-ready score 0-100]')
  for (const s of report.scores) {
    deps.io.out(`  ${pad(s.id, 16)} score=${pad(String(s.score), 4)}/100 band=${pad(s.band, 12)}`)
    const dimline = s.dimensions.map((d) => `${d.name}=${d.score}/${d.max}`).join('  ')
    deps.io.out(`    ${dimline}`)
    for (const sug of s.suggestions) deps.io.out(`    · ${sug}`)
  }
}

function cmdDrift(deps: CliDeps, args: string[], fs: DriftFs): number {
  const p = parseArgs(args)
  const onlyLoop = p.loop ?? positionalLoop(args)
  const now = new Date(deps.clock())
  const { report, errors, exitCode } = buildDriftReport(deps.cwd, onlyLoop, now, fs)
  if (errors.length > 0 || report === null) {
    for (const e of errors) deps.io.err(`ERROR: ${e}`)
    return exitCode
  }
  if (p.json) {
    deps.io.out(JSON.stringify(report, null, 2))
    return exitCode
  }
  printDriftTable(deps, report)
  return exitCode
}

function cmdAudit(deps: CliDeps, args: string[], fs: DriftFs): number {
  const p = parseArgs(args)
  const onlyLoop = p.loop ?? positionalLoop(args)
  const now = new Date(deps.clock())
  const { report, errors, exitCode } = buildAuditReport(deps.cwd, onlyLoop, now, fs)
  if (errors.length > 0 || report === null) {
    for (const e of errors) deps.io.err(`ERROR: ${e}`)
    return exitCode
  }
  if (p.json) {
    deps.io.out(JSON.stringify(report, null, 2))
    return exitCode
  }
  printAuditTable(deps, report)
  return exitCode
}

// ── #38 graduate / level 子命令（分级放权 L1→L3 毕业制）──────────────────────────

/** args 中的全部位置参数（跳过 --flag 及 --loop 的值）。 */
function positionals(args: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === '--loop') { i++; continue }
    if (a.startsWith('--')) continue
    out.push(a)
  }
  return out
}

function printGraduationTable(deps: CliDeps, report: GraduationReport): void {
  deps.io.out('[LOOPS graduate · 分级放权毕业制 L1→L3]')
  for (const v of report.verdicts) {
    deps.io.out(
      `  ${pad(v.id, 16)} current=${v.current}/${enforcementFor(v.current)} → recommended=${v.recommended}/${enforcementFor(v.recommended)}  ` +
      `can-graduate=${v.canGraduate ? 'yes' : 'no'}`,
    )
    deps.io.out(`    loop-ready=${v.readinessScore}/${v.readinessBand}  drift=${v.driftCount}  breaker=${v.breaker}  fail_streak=${v.failStreak}  runs=${v.runs}`)
    if (v.demotionReason !== null) deps.io.out(`    ⚠ 降档信号：${v.demotionReason}`)
    for (const b of v.blockers) deps.io.out(`    · blocker: ${b}`)
    if (v.canGraduate) deps.io.out(`    → 可升 ${v.recommended}：pipeline loops level ${v.id} set ${v.recommended} --confirm`)
  }
}

function cmdGraduate(deps: CliDeps, args: string[], fs: GraduationFs): number {
  const p = parseArgs(args)
  const onlyLoop = p.loop ?? positionalLoop(args)
  const now = new Date(deps.clock())
  const { report, errors, exitCode } = buildGraduationReport(deps.cwd, onlyLoop, now, fs)
  if (errors.length > 0 || report === null) {
    for (const e of errors) deps.io.err(`ERROR: ${e}`)
    return exitCode
  }
  if (p.json) {
    deps.io.out(JSON.stringify(report, null, 2))
    return exitCode
  }
  printGraduationTable(deps, report)
  return exitCode
}

function printLevelView(deps: CliDeps, v: GraduationVerdict): void {
  deps.io.out(`[LOOPS level · ${v.id}]`)
  deps.io.out(
    `  current=${v.current}/${enforcementFor(v.current)}  recommended=${v.recommended}/${enforcementFor(v.recommended)}  ` +
    `can-graduate=${v.canGraduate ? 'yes' : 'no'}`,
  )
  deps.io.out(`  loop-ready=${v.readinessScore}/${v.readinessBand}  drift=${v.driftCount}  breaker=${v.breaker}  fail_streak=${v.failStreak}  runs=${v.runs}`)
  if (v.demotionReason !== null) deps.io.out(`  ⚠ 降档信号：${v.demotionReason} → 建议降 ${v.recommended}`)
  for (const b of v.blockers) deps.io.out(`  · blocker: ${b}`)
  if (v.canGraduate) deps.io.out(`  → 可升 ${v.recommended}：pipeline loops level ${v.id} set ${v.recommended} --confirm`)
}

/** level <loop> [set <L1|L2|L3>] [--confirm|--yes] [--json]：查看/建议档位 or 显式确认改档。 */
function cmdLevel(deps: CliDeps, args: string[], fs: GraduationFs): number {
  const p = parseArgs(args)
  const confirm = args.includes('--confirm') || args.includes('--yes')
  const pos = positionals(args)
  const setPos = pos.indexOf('set')
  const isSet = setPos !== -1
  const target = isSet ? pos[setPos + 1] : undefined
  const loopId = p.loop ?? (pos[0] === 'set' ? null : pos[0] ?? null)
  const now = new Date(deps.clock())

  if (loopId === null) {
    deps.io.err('ERROR: 用法: loops level <loop> [set <L1|L2|L3>] [--confirm]')
    return 2
  }

  // 查看/建议档位（只读）
  if (!isSet) {
    const { report, errors, exitCode } = buildGraduationReport(deps.cwd, loopId, now, fs)
    if (errors.length > 0 || report === null) {
      for (const e of errors) deps.io.err(`ERROR: ${e}`)
      return exitCode
    }
    const v = report.verdicts[0]!
    if (p.json) {
      deps.io.out(JSON.stringify(v, null, 2))
      return 0
    }
    printLevelView(deps, v)
    return 0
  }

  // set <L>：改档（显式确认门）
  if (target === undefined) {
    deps.io.err('ERROR: set 需指定目标档（L1/L2/L3）')
    return 2
  }
  const res = applyLevelChange(deps.cwd, loopId, target, { now, confirm }, fs)
  if (res.exitCode === 3) {
    for (const e of res.errors) deps.io.err(`ERROR: ${e}`)
    return 3
  }
  const plan = res.plan!
  if (res.exitCode === 2) {
    for (const e of res.errors) deps.io.err(`ERROR: ${e}`)
    return 2
  }
  if (plan.kind === 'noop') {
    deps.io.out(`[LOOPS level set] ${plan.id} 已在 ${plan.from}，无需改档`)
    return 0
  }
  if (res.applied) {
    deps.io.out(`[LOOPS level set] ${plan.id} ${plan.from} → ${plan.to}（${plan.kind}）已落盘 .pipeline/loops.yaml`)
    return 0
  }
  // allowed 但未 --confirm = dry-run（默认不自动改档）
  deps.io.out(
    `[LOOPS level set] ${plan.id} ${plan.from} → ${plan.to}（${plan.kind}）准入通过 —— dry-run（未落盘）。` +
    `加 --confirm 落盘：pipeline loops level ${plan.id} set ${plan.to} --confirm`,
  )
  return 0
}

// ── loop-init：`pipeline loops init` 向导 + 非交互结构化通道（L3）─────────────────────
//
// 「agent 起草 → dashboard 审阅」协议的终端生产侧（计划拍板 P1/P3/P4/P5/P6）：
//   · 人在 TTY 下走三组交互问答（目标/边界/节奏），每问展示推导默认值，回车即收；
//   · agent/CI 走非交互 flags（缺 TTY 或 --yes → 全默认，必填 --id/--goal 缺失即报错）；
//   · 起草的 loop 强制 status:paused（硬 gate，无开关）——paused 在 kernel enforce 是 kill 判定，
//     scheduler 不跑；批准 = dashboard PATCH status:active，走既有 POST /api/loops/update。
//   · 登记进草稿标记 sidecar（best-effort：失败只 WARN，绝不回滚已落盘的 loop，对齐 init.ts 铁律）。
// fs + CAS 由本命令负责（kernel 文本原语是纯函数 text-in/text-out），对齐 server applyLoopsUpdate
// 读-判-写先例；kernel 原语：createLoopsYamlText / appendLoopToYamlText / draftMarksPath / addDraftMark。

/** 推导规则表常量（唯一口径——计划 L3 推导规则表逐字段照落，单测钉住）。 */
const RISK_CADENCE: Record<LoopRisk, string> = { low: '4h', medium: '2h', high: '1h' }
const RISK_MAX_RUNS: Record<LoopRisk, number> = { low: 48, medium: 24, high: 8 }
const DEFAULT_KILL_CRITERIA = ['no-change-3', 'budget-burn-2d'] as const
/** 复核门阶段默认——**镜像** dashboard `types.ts:50 REVIEW_PHASES`（explore/spec/verify）。
 * kernel 无此单源（PHASES 是全量七阶段，非复核门子集），故此处镜像并登记来源，对齐
 * server/loops.ts::listMatchedChanges 的镜像先例（不跨包 import dashboard，注释锚定真相源）。 */
const DEFAULT_HUMAN_GATES = ['explore', 'spec', 'verify'] as const
const DEFAULT_MAX_TOKENS_PER_DAY = 100000
/** state：约定路径死值（不问不给 flag——run-log 落点固定）。 */
const DEFAULT_STATE = '.superpowers/loops/progress.md'
/** id 正则（镜像 LOOPS_SCHEMA loops.items.id pattern；交互态就地重问、非交互态 exit 1）。 */
const INIT_ID_RE = /^[a-z][a-z0-9-]*$/
/** cadence 正则（镜像 LOOPS_SCHEMA cadence pattern）。 */
const INIT_CADENCE_RE = /^([0-9]+[mhd](-[0-9]+[mhd])?|continuous)$/
/** goal 最短长度（镜像 LOOPS_SCHEMA goal minLength）。 */
const GOAL_MIN_LEN = 10

/** change_prefix 推导：id 按 `-` 分段取每段首字母 + `-`（如 `restyle-loop`→`rl-`）。 */
export function derivePrefix(id: string): string {
  const initials = id.split('-').filter((s) => s.length > 0).map((s) => s[0]).join('')
  return `${initials}-`
}

function validateId(s: string): string | null {
  return INIT_ID_RE.test(s) ? null : `id 非法「${s}」：须匹配 ${INIT_ID_RE.source}（小写字母开头，仅小写字母/数字/连字符）`
}
function validateGoal(s: string): string | null {
  return s.length >= GOAL_MIN_LEN ? null : `goal 过短（当前 ${s.length} 字符）：须 ≥${GOAL_MIN_LEN} 字符`
}
function validateCadence(s: string): string | null {
  return INIT_CADENCE_RE.test(s) ? null : `cadence 非法「${s}」：须匹配 ${INIT_CADENCE_RE.source}（如 4h / 30m / 1h-2h / continuous）`
}
function validateRisk(s: string): string | null {
  return (['low', 'medium', 'high'] as string[]).includes(s) ? null : `risk 非法「${s}」：须为 low|medium|high`
}
function validateKind(s: string): string | null {
  return (['orchestrator', 'executor'] as string[]).includes(s) ? null : `kind 非法「${s}」：须为 orchestrator|executor`
}

/** CSV → 去空白去空项的字符串数组。 */
function csv(v: string): string[] {
  return v.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
}

// ── flags 自解析（独立于既有 parseArgs——init 的 flags 面与 --json/--loop 不同）──────────
interface InitArgs {
  yes: boolean
  json: boolean
  id?: string
  name?: string
  goal?: string
  kind?: string
  prefix?: string
  risk?: string
  runner?: string
  cadence?: string
  phases?: string[]
  gates?: string[]
  kill?: string[]
  doc?: string
}

function parseInitArgs(args: string[]): InitArgs {
  const out: InitArgs = { yes: false, json: false }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    switch (a) {
      case '--yes': out.yes = true; break
      case '--json': out.json = true; break
      case '--id': out.id = args[++i]; break
      case '--name': out.name = args[++i]; break
      case '--goal': out.goal = args[++i]; break
      case '--kind': out.kind = args[++i]; break
      case '--prefix': out.prefix = args[++i]; break
      case '--risk': out.risk = args[++i]; break
      case '--runner': out.runner = args[++i]; break
      case '--cadence': out.cadence = args[++i]; break
      case '--phases': out.phases = csv(args[++i] ?? ''); break
      case '--gates': out.gates = csv(args[++i] ?? ''); break
      case '--kill': out.kill = csv(args[++i] ?? ''); break
      case '--doc': out.doc = args[++i]; break
      default: break // 未知 flag / 位置参数一律忽略（对齐既有自解析宽容度）
    }
  }
  return out
}

/** 全字段已解析的向导/非交互产物（默认值已就位）。 */
interface RawInputs {
  id: string
  name: string
  goal: string
  designDoc: string
  prefix: string | null // null = 显式 none / 无前缀
  kind: string
  runner: string
  gates: string[]
  kill: string[]
  risk: string
  cadence: string
  phases: string[]
}

/** 非交互：flags → RawInputs（应用推导规则表默认值）；缺必填 → missing 列表非空。 */
function resolveDefaults(flags: InitArgs): { raw: RawInputs | null; missing: string[] } {
  const missing: string[] = []
  if (flags.id === undefined) missing.push('--id')
  if (flags.goal === undefined) missing.push('--goal')
  if (missing.length > 0) return { raw: null, missing }
  const id = flags.id!
  const risk = flags.risk ?? 'low'
  const raw: RawInputs = {
    id,
    name: flags.name ?? id,
    goal: flags.goal!,
    designDoc: flags.doc ?? `docs/loops/${id}.md`,
    prefix: flags.prefix === undefined ? derivePrefix(id) : flags.prefix === 'none' ? null : flags.prefix,
    kind: flags.kind ?? 'orchestrator',
    runner: flags.runner ?? 'claude-code',
    gates: flags.gates ?? [...DEFAULT_HUMAN_GATES],
    kill: flags.kill ?? [...DEFAULT_KILL_CRITERIA],
    risk,
    cadence: flags.cadence ?? RISK_CADENCE[risk as LoopRisk] ?? RISK_CADENCE.low,
    phases: flags.phases ?? [...PHASES],
  }
  return { raw, missing: [] }
}

/** RawInputs → NewLoopEntryInput（budget 按 risk 推导；status 恒 paused）；字段校验不过 → error。 */
function assembleEntry(raw: RawInputs): { entry: NewLoopEntryInput | null; error: string | null } {
  for (const check of [validateId(raw.id), validateGoal(raw.goal), validateKind(raw.kind), validateRisk(raw.risk), validateCadence(raw.cadence)]) {
    if (check !== null) return { entry: null, error: check }
  }
  const risk = raw.risk as LoopRisk
  const budget: LoopBudget = {
    max_runs_per_day: RISK_MAX_RUNS[risk],
    max_in_flight: 1,
    on_exceed: 'skip',
    max_tokens_per_day: DEFAULT_MAX_TOKENS_PER_DAY,
  }
  const entry: NewLoopEntryInput = {
    id: raw.id,
    name: raw.name,
    kind: raw.kind as LoopKind,
    goal: raw.goal,
    cadence: raw.cadence,
    risk,
    runner: raw.runner,
    change_prefix: raw.prefix,
    phases: raw.phases,
    human_gates: raw.gates,
    state: DEFAULT_STATE,
    design_doc: raw.designDoc,
    status: 'paused', // 协议约定：硬 gate，无开关（拍板 P1）
    budget,
    kill_criteria: raw.kill,
  }
  return { entry, error: null }
}

// ── init 的 fs + 交互注入面（真实现见 REAL_INIT_ENV；测试注入 fake）─────────────────────

/** init 的原始文件面（CAS 编排逻辑在 cmdInit，此处只做裸读写——对齐 server 读-判-写分工）。 */
export interface InitFs {
  /** 读文本；文件不存在 → null（其它错误抛，让调用方感知）。 */
  readText(path: string): string | null
  /** 独占创建（wx）：文件已存在抛 EEXIST（并发创建保护）。 */
  createExclusive(path: string, text: string): void
  /** 覆写（追加路径 CAS 通过后落盘）。 */
  overwrite(path: string, text: string): void
}

/** 交互向导的一问一答面（真实现 = readline/promises；测试注入脚本化应答）。 */
export interface Prompter {
  ask(prompt: string): Promise<string>
  close(): void
}

/** init 命令的注入环境（fs + 草稿标记 + 交互探测/向导）。 */
export interface InitEnv {
  fs: InitFs
  /** best-effort 登记草稿标记（失败抛 → 调用方 WARN，不回滚、不改 exit）。 */
  addDraftMark(path: string, id: string): Promise<void>
  /** 是否交互终端（真实现 = process.stdin.isTTY && process.stdout.isTTY）。 */
  isInteractive(): boolean
  /** 造一个 Prompter（仅在决定走交互向导时调用）。 */
  makePrompter(): Prompter
}

export const REAL_INIT_ENV: InitEnv = {
  fs: {
    readText: (path) => {
      try {
        return readFileSync(path, 'utf8')
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw e
      }
    },
    createExclusive: (path, text) => {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, text, { flag: 'wx' })
    },
    overwrite: (path, text) => writeFileSync(path, text, 'utf8'),
  },
  addDraftMark: (path, id) => addDraftMark(path, id),
  isInteractive: () => Boolean(process.stdin.isTTY && process.stdout.isTTY),
  makePrompter: () => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    return { ask: (prompt) => rl.question(prompt), close: () => rl.close() }
  },
}

// ── 交互向导（三组问答，每问展示推导默认值，回车即收；校验失败就地重问）────────────────

/** 问一个带校验的必填/可选项：空输入收默认；校验不过就地重问（交互态语义）。 */
async function askValidated(
  p: Prompter, deps: CliDeps, label: string,
  dflt: string | undefined, validate: (s: string) => string | null, required: boolean,
): Promise<string> {
  for (;;) {
    const hasDflt = dflt !== undefined && dflt !== ''
    const ans = (await p.ask(hasDflt ? `${label} [${dflt}]: ` : `${label}${required ? '（必填）' : ''}: `)).trim()
    const val = ans === '' ? (dflt ?? '') : ans
    if (val === '' && required) { deps.io.err('该项必填，请输入一个值。'); continue }
    const err = validate(val)
    if (err !== null) { deps.io.err(err); continue }
    return val
  }
}

/** 问一个无校验项：空输入收默认。 */
async function askPlain(p: Prompter, label: string, dflt: string): Promise<string> {
  const ans = (await p.ask(`${label} [${dflt}]: `)).trim()
  return ans === '' ? dflt : ans
}

/** 问一个 CSV 项：空输入收默认数组。 */
async function askCsv(p: Prompter, label: string, dflt: readonly string[]): Promise<string[]> {
  const ans = (await p.ask(`${label} [${dflt.join(',')}]: `)).trim()
  return ans === '' ? [...dflt] : csv(ans)
}

/** 交互向导：三组问答收齐 RawInputs（问题顺序固定——目标/边界/节奏；默认值 flag 优先，否则推导）。 */
async function runWizard(deps: CliDeps, flags: InitArgs, env: InitEnv): Promise<RawInputs> {
  const p = env.makePrompter()
  try {
    deps.io.out('[loops init] 交互向导 —— 每问展示推导默认值，直接回车即收默认。')
    // 目标组
    const id = await askValidated(p, deps, '目标 loop id', flags.id, validateId, true)
    const goal = await askValidated(p, deps, '一句话目标（≥10 字符）', flags.goal, validateGoal, true)
    const designDoc = await askPlain(p, '设计文档路径', flags.doc ?? `docs/loops/${id}.md`)
    // 边界组
    const prefixRaw = await askPlain(p, 'change 前缀（none = 不设前缀）', flags.prefix ?? derivePrefix(id))
    const prefix = prefixRaw === 'none' ? null : prefixRaw
    const kind = await askValidated(p, deps, '类型（orchestrator|executor）', flags.kind ?? 'orchestrator', validateKind, false)
    const runner = await askPlain(p, '执行 agent（runner）', flags.runner ?? 'claude-code')
    const gates = await askCsv(p, '复核门阶段（CSV）', flags.gates ?? DEFAULT_HUMAN_GATES)
    const kill = await askCsv(p, '终止判据（CSV）', flags.kill ?? DEFAULT_KILL_CRITERIA)
    // 节奏组
    const risk = await askValidated(p, deps, '风险档（low|medium|high）', flags.risk ?? 'low', validateRisk, false)
    const cadence = await askValidated(p, deps, '节奏 cadence', flags.cadence ?? RISK_CADENCE[risk as LoopRisk], validateCadence, false)
    const phases = await askCsv(p, '阶段（CSV）', flags.phases ?? PHASES)
    return { id, name: flags.name ?? id, goal, designDoc, prefix, kind, runner, gates, kill, risk, cadence, phases }
  } finally {
    p.close()
  }
}

/** 错误信封：--json 走 stdout `{ok:false,error}`，否则 stderr `ERROR:`；恒 exit 1。 */
function initFail(deps: CliDeps, json: boolean, msg: string): number {
  if (json) deps.io.out(JSON.stringify({ ok: false, error: msg }))
  else deps.io.err(`ERROR: ${msg}`)
  return 1
}

/**
 * `pipeline loops init`：起草一个 status:paused 的草稿 loop（向导 or 非交互结构化通道）。
 * 写盘：缺文件 → createLoopsYamlText + wx 独占创建；已存在 → appendLoopToYamlText + 读-判-写 CAS。
 * 成功后 best-effort 登记草稿标记；输出登记结果 + 「去 dashboard 审阅批准」指引（--json 走信封）。
 */
export async function cmdInit(deps: CliDeps, args: string[], env: InitEnv = REAL_INIT_ENV): Promise<number> {
  const flags = parseInitArgs(args)
  const interactive = !flags.yes && env.isInteractive()

  let raw: RawInputs
  if (interactive) {
    raw = await runWizard(deps, flags, env)
  } else {
    const { raw: resolved, missing } = resolveDefaults(flags)
    if (resolved === null) {
      return initFail(deps, flags.json,
        `非交互模式缺少必填项：${missing.join(' ')}（agent/CI 需显式提供；或在 TTY 下去掉 --yes 走交互向导）`)
    }
    raw = resolved
  }

  const { entry, error: assembleErr } = assembleEntry(raw)
  if (assembleErr !== null || entry === null) {
    return initFail(deps, flags.json, assembleErr ?? '组装 loop 条目失败')
  }

  const loopsPath = join(deps.cwd, '.pipeline', 'loops.yaml')
  const before = env.fs.readText(loopsPath)
  if (before === null) {
    // 缺文件：整份新建 + wx 独占（防两个终端同时首建）
    const { text, error } = createLoopsYamlText(entry)
    if (error !== null || text === null) return initFail(deps, flags.json, error ?? '生成 loops.yaml 失败')
    try {
      env.fs.createExclusive(loopsPath, text)
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code === 'EEXIST') {
        return initFail(deps, flags.json, `loops.yaml 在创建瞬间被并发创建（EEXIST，${loopsPath}）——请重跑 init（将走追加路径）`)
      }
      return initFail(deps, flags.json, `写 loops.yaml 失败：${errMsg(e)}`)
    }
  } else {
    // 已存在：追加 + 读-判-写 CAS（对齐 server applyLoopsUpdate 先例，不盲写覆盖他人改动）
    const { text, error } = appendLoopToYamlText(before, entry)
    if (error !== null || text === null) return initFail(deps, flags.json, error ?? '追加 loops.yaml 失败')
    const current = env.fs.readText(loopsPath)
    if (current !== before) {
      return initFail(deps, flags.json, `CAS 失败：loops.yaml 在登记期间被并发修改，已如实拒绝（未落盘，${loopsPath}）`)
    }
    env.fs.overwrite(loopsPath, text)
  }

  // 草稿标记 best-effort：失败只 WARN，不回滚、不改 exit 0（对齐 init.ts「注册表任何故障只 WARN」铁律）
  try {
    await env.addDraftMark(draftMarksPath(deps.cwd), entry.id)
  } catch (e) {
    deps.io.err(`WARN: 草稿标记登记失败（loop 已落盘，不影响 dashboard 审阅，仅少一枚待审徽章）：${errMsg(e)}`)
  }

  // runner 软警告（口径同 dashboard 观察项②：非 codex 值一律走 claude-code 缺省路径）
  if (!(LOOP_RUNNERS as readonly string[]).includes(entry.runner)) {
    deps.io.err(`WARN: "${entry.runner}" 不是标准 runner（仅 claude-code / codex），仍会执行——非 codex 值一律走 claude-code（缺省）路径。`)
  }

  if (flags.json) {
    deps.io.out(JSON.stringify({ ok: true, id: entry.id, path: loopsPath, draft: true }))
  } else {
    deps.io.out(`[loops init] 已登记草稿 loop「${entry.id}」→ ${loopsPath}`)
    deps.io.out('已作为草稿（已暂停）登记；打开 dashboard 工作台审阅，批准后启用；预算与自主级别在审阅面调整（升档走毕业制）。')
  }
  return 0
}

/**
 * loops 子命令分派（纯函数 + deps 注入 + fs 注入面）。
 * fs 缺省真 node fs（REAL_LOOPS_FS，读真 .pipeline/loops.yaml + progress + 在途 + 沙箱）；
 * driftFs 缺省 REAL_DRIFT_FS（#37 drift/audit）；graduationFs 缺省 REAL_GRADUATION_FS（#38：+ loops.yaml 读写）。
 * mock 层注入 fake fs 快速回归，integration 走真 fs。
 */
export async function cmdLoops(
  deps: CliDeps,
  sub: string,
  args: string[],
  fs: LoopsFs = REAL_LOOPS_FS,
  driftFs: DriftFs = REAL_DRIFT_FS,
  graduationFs: GraduationFs = REAL_GRADUATION_FS,
  initEnv: InitEnv = REAL_INIT_ENV,
): Promise<number> {
  const p = parseArgs(args)
  switch (sub || 'list') {
    case 'list':
      return cmdList(deps, p, fs)
    case 'enforce':
      return cmdEnforce(deps, p, fs)
    case 'status':
      return cmdStatus(deps, fs)
    case 'budget':
      return cmdBudget(deps, args, fs)
    case 'cost':
      return cmdCost(deps, args, fs)
    case 'drift':
      return cmdDrift(deps, args, driftFs)
    case 'audit':
      return cmdAudit(deps, args, driftFs)
    case 'graduate':
      return cmdGraduate(deps, args, graduationFs)
    case 'level':
      return cmdLevel(deps, args, graduationFs)
    case 'init':
      return cmdInit(deps, args, initEnv)
    default:
      deps.io.err(`ERROR: 未知 loops 子命令: ${sub}（支持: init list enforce status budget cost drift audit graduate level）`)
      return 1
  }
}
