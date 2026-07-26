import {
  applyLevelChange, buildAuditReport, buildBudgetReport, buildCostReport, buildDriftReport,
  buildGraduationReport, enforcementFor, remainingTokens, type AuditReport, type BudgetFs,
  type BudgetReport, type CostReport, type DriftFs, type DriftReport, type EnforceFs,
  type GraduationFs, type GraduationReport, type GraduationVerdict,
} from '@tenon/kernel'
import type { CliDeps } from '../deps.js'
import { buildAdmissionJson, ledgerProjections } from './loop-admission-view.js'

type LoopsFs = EnforceFs
interface ParsedArgs { json: boolean; loop: string | null }
function parseArgs(args: string[]): ParsedArgs {
  let json = false
  let loop: string | null = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json') json = true
    else if (args[i] === '--loop') loop = args[++i] ?? null
  }
  return { json, loop }
}
const pad = (value: string, width: number): string => value.length >= width ? value : value + ' '.repeat(width - value.length)

// ── #36 budget / cost 子命令（token 预算 + circuit breaker + 成本估算）──────────────

/** budget/cost 的 loop id：--loop 优先，否则第一个位置参数（不改共享 parseArgs，enforce 不受影响）。 */
function positionalLoop(args: string[]): string | null {
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === undefined) continue
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

export async function cmdBudget(deps: CliDeps, args: string[], fs: LoopsFs): Promise<number> {
  const p = parseArgs(args)
  const onlyLoop = p.loop ?? positionalLoop(args)
  const now = new Date(deps.clock())
  const { report, errors, exitCode } = buildBudgetReport(deps.cwd, onlyLoop, now, toBudgetFs(fs))
  if (errors.length > 0 || report === null) {
    for (const e of errors) deps.io.err(`ERROR: ${e}`)
    return exitCode
  }
  // GOAL H · Stage C 读面：durable ledger 投影（settled/reserved/remaining/inflight/health）——与硬 admission 同源。
  const { byId, missing } = await ledgerProjections(deps.cwd, report.statuses.map((s) => s.id), now)
  if (p.json) {
    // Stage B 返工 #7：只**新增** admission（ledger 投影 + admissionDecision，与 scheduler 硬判定同源）
    // 与 breaker_source（标明 legacy breaker 非 admission authority）；legacy 顶层字段一字不改（向后兼容）。
    const loopById = new Map((fs.loadRegistry(deps.cwd).data?.loops ?? []).map((l) => [l.id, l]))
    const statuses = report.statuses.map((s) => {
      const projection = byId.get(s.id)
      if (projection === undefined) throw new Error(`ledger projection missing for loop '${s.id}'`)
      return {
        ...s,
        breaker_source: 'legacy-progress' as const,
        admission: buildAdmissionJson(loopById.get(s.id), projection, missing),
      }
    })
    deps.io.out(JSON.stringify({ ...report, statuses }, null, 2))
    return exitCode
  }
  printBudgetTable(deps, report)
  // 上面的 breaker 是 progress.md 派生的 legacy 软指标，与下面 ledger 硬指标并列（enforce/graduation 仍读 progress.md）。
  deps.io.out('[LOOPS budget · ledger（durable，硬 admission 真相源）]')
  for (const s of report.statuses) {
    const pr = byId.get(s.id)!
    const health = missing ? 'missing' : pr.health
    const rem = remainingTokens(pr, s.maxTokensPerDay ?? undefined)
    deps.io.out(
      `  ${pad(s.id, 16)} settled=${pr.settledTokensActual}(+${pr.settledTokensEstimated} est) ` +
      `reserved=${pr.reservedTokensOutstanding} remaining=${rem === null ? '-' : rem} inflight=${pr.inFlight} health=${health}`,
    )
  }
  return exitCode
}

export function cmdCost(deps: CliDeps, args: string[], fs: LoopsFs): number {
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

export function cmdDrift(deps: CliDeps, args: string[], fs: DriftFs): number {
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

export function cmdAudit(deps: CliDeps, args: string[], fs: DriftFs): number {
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
    const a = args[i]
    if (a === undefined) continue
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
    if (v.canGraduate) deps.io.out(`    → 可升 ${v.recommended}：tenon loops level ${v.id} set ${v.recommended} --confirm`)
  }
}

export function cmdGraduate(deps: CliDeps, args: string[], fs: GraduationFs): number {
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
  if (v.canGraduate) deps.io.out(`  → 可升 ${v.recommended}：tenon loops level ${v.id} set ${v.recommended} --confirm`)
}

/** level <loop> [set <L1|L2|L3>] [--confirm|--yes] [--json]：查看/建议档位 or 显式确认改档。 */
export async function cmdLevel(deps: CliDeps, args: string[], fs: GraduationFs): Promise<number> {
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
    const v = report.verdicts[0]
    if (v === undefined) {
      deps.io.err(`ERROR: loop '${loopId}' 没有毕业制裁决`)
      return 3
    }
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
  const res = await applyLevelChange(deps.cwd, loopId, target, { now, confirm }, fs)
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
    `加 --confirm 落盘：tenon loops level ${plan.id} set ${plan.to} --confirm`,
  )
  return 0
}
