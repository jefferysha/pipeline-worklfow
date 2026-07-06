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
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import {
  applyLevelChange,
  buildAuditReport,
  buildBudgetReport,
  buildCostReport,
  buildDriftReport,
  buildGraduationReport,
  buildReport,
  enforcementFor,
  loadRegistry as kernelLoadRegistry,
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
  type LoopEntry,
  type LoopRegistry,
} from '@pipeline-lite/kernel'
import type { CliDeps } from '../deps.js'

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
    default:
      deps.io.err(`ERROR: 未知 loops 子命令: ${sub}（支持: list enforce status budget cost drift audit graduate level）`)
      return 1
  }
}
