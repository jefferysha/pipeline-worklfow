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
import { readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import {
  ABSENT_REGISTRY_EPOCH,
  addDraftMark,
  appendLoopToYamlText,
  applyLevelChange,
  buildAuditReport,
  buildBudgetReport,
  buildCostReport,
  buildDriftReport,
  buildGraduationReport,
  buildReport,
  compileAutomationPolicyTemplate,
  createLoopsYamlText,
  draftMarksPath,
  enforcementFor,
  loadRegistry as kernelLoadRegistry,
  loopsYamlPath,
  LOOP_RUNNERS,
  parsePipeline,
  PHASES,
  readCurrentRunRevisionSync,
  readRegistrySnapshot as kernelReadRegistrySnapshot,
  remainingTokens,
  writeRegistryWithGovernance,
  type AuditReport,
  type AutomationPolicyTemplate,
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
} from '@tenon/kernel'
import { errMsg, type CliDeps } from '../deps.js'
import { createProductionSkillContentLocator } from '../skillBundleAssembly.js'
import { admissionProbe, buildAdmissionJson, ledgerProjections } from './loop-admission-view.js'
import { cmdLoopRun } from './loop-run.js'
import { cmdLoopSync } from './loop-sync.js'
import { cmdAudit, cmdBudget, cmdCost, cmdDrift, cmdGraduate, cmdLevel } from './loops-governance.js'
import {
  cmdInit, defaultStarterWiringDeps, REAL_INIT_ENV,
  type InitEnv, type Prompter,
} from './loops-init.js'
export { cmdInit, derivePrefix, REAL_INIT_ENV, type InitEnv, type Prompter } from './loops-init.js'
import {
  buildLoopStarterWiringReport,
  type LoopStarterWiringDeps,
  type LoopStarterWiringReport,
} from './loop-starter-wiring.js'

// 供 mock/集成测试构造 fake fs / 类型断言
export type { LoopEntry, LoopRegistry, DriftFs, GraduationFs } from '@tenon/kernel'
/** cli 层的 loops fs 注入面（= kernel EnforceFs：登记载入 + progress/在途/沙箱读）。 */
export type LoopsFs = EnforceFs

// ── 真 node fs 实现（默认；integration 走此真路径）─────────────────────────────

function scalarStateFields(fields: Readonly<Record<string, string | readonly string[]>>): Record<string, string> {
  return Object.fromEntries(Object.entries(fields).map(([field, value]) => [
    field,
    typeof value === 'string' ? value : value.join(','),
  ]))
}

/** canonical-first 状态读取；current 存在但损坏时返回 null，绝不回退 YAML projection。 */
function readStateFields(changeDir: string): Record<string, string> | null {
  try {
    const current = readCurrentRunRevisionSync(changeDir)
    if (current !== undefined) {
      return scalarStateFields(current.state.fields)
    }
    const legacy = readFileSync(join(changeDir, '.pipeline.yaml'), 'utf8')
    return scalarStateFields(parsePipeline(legacy).fields)
  } catch {
    return null
  }
}

/** 沙箱 change 目录定位（老 _resolve_sandbox_pipeline_yaml 247-256）：automation_worktree 优先，否则命名约定。 */
function sandboxChangeDir(repoRoot: string, name: string, worktree: string | null): string {
  let base: string
  if (worktree && worktree.trim() !== '') {
    const w = worktree.trim()
    base = isAbsolute(w) ? w : join(repoRoot, w)
  } else {
    base = join(repoRoot, '.sandcastle', 'worktrees', `sandcastle-pipeline-${name}`)
  }
  return join(base, 'openspec', 'changes', name)
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
  readChangeFields: (repoRoot, name) => readStateFields(join(repoRoot, 'openspec', 'changes', name)),
  readSandboxFields: (repoRoot, name, worktree) => readStateFields(sandboxChangeDir(repoRoot, name, worktree)),
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

// ── #38 graduation 真 node fs（登记 + run-log + LOOP.md 镜像 + loops.yaml governance 读写）──
// Stage B 返工 #3#4：level set --confirm 的写回走 governance 锁 + 字节 epoch-CAS + atomic writer
// （kernel readRegistrySnapshot/writeRegistryWithGovernance），与 admission 复验/init/server 写方同锁串行。
export const REAL_GRADUATION_FS: GraduationFs = {
  loadRegistry: (repoRoot) => kernelLoadRegistry(repoRoot),
  readRunLog: (repoRoot) => REAL_LOOPS_FS.readProgress(repoRoot),
  readLoopDoc: (repoRoot) => REAL_DRIFT_FS.readLoopDoc(repoRoot),
  readRegistrySnapshot: async (repoRoot) => {
    const snap = await kernelReadRegistrySnapshot(repoRoot)
    return snap.epoch === ABSENT_REGISTRY_EPOCH ? null : { text: snap.text, epoch: snap.epoch }
  },
  writeRegistryGoverned: async (repoRoot, expectedEpoch, produce) => {
    const r = await writeRegistryWithGovernance(repoRoot, expectedEpoch, (cur) => produce(cur))
    return { ok: r.ok, error: r.ok ? null : r.error }
  },
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
    const a = args[i]
    if (a === undefined) continue
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

// ledger 投影（durable ledger → typed 投影）+ admission 探针 + admission --json 视图移到共享模块
// loop-admission-view.ts（loops status/budget 与 loop run --dry-run 同源复用，判定与展示不漂移）：
// ledgerProjections / admissionProbe / buildAdmissionJson。此处 import 使用，行为逐字不变。

async function cmdStatus(
  deps: CliDeps,
  args: ParsedArgs,
  fs: LoopsFs,
  starterWiringDeps: LoopStarterWiringDeps,
): Promise<number> {
  const { data, errors } = fs.loadRegistry(deps.cwd)
  if (errors.length > 0) {
    for (const e of errors) deps.io.err(`ERROR: ${e}`)
    return 1
  }
  if (data === null) {
    deps.io.out(args.json ? JSON.stringify({ loops: [] }) : '(no loops registry) .pipeline/loops.yaml 未找到')
    return 0
  }
  const now = new Date(deps.clock())
  const { report } = buildReport(deps.cwd, { now }, fs)
  const verdictById = new Map((report?.verdicts ?? []).map((v) => [v.id, v.verdict]))
  const { byId, missing } = await ledgerProjections(deps.cwd, data.loops.map((l) => l.id), now)
  const starterReports = await Promise.all(data.loops.map((loop) =>
    loop.template_id === undefined
      ? Promise.resolve(null)
      : buildLoopStarterWiringReport(loop.template_id, data.loops, starterWiringDeps)))
  if (args.json) {
    deps.io.out(JSON.stringify({
      loops: data.loops.map((loop, index) => {
        const projection = byId.get(loop.id)!
        const starter = starterReports[index]
        return {
          id: loop.id,
          status: loop.status,
          verdict: verdictById.get(loop.id) ?? null,
          autonomy_level: loop.autonomy_level,
          enforcement: enforcementFor(loop.autonomy_level),
          ledger: {
            health: missing ? 'missing' : projection.health,
            admission: admissionProbe(loop, projection),
            in_flight: projection.inFlight,
            runs_today: projection.runsToday,
            last_result: projection.lastResult,
          },
          template: loop.template_id === undefined
            ? null
            : { id: loop.template_id, version: loop.template_version ?? null },
          binding: starter?.binding ?? null,
          wiring: starter?.wiring ?? null,
          runnable: starter?.runnable ?? null,
        }
      }),
    }, null, 2))
    return 0
  }
  deps.io.out('[LOOPS status]')
  for (const [index, l] of data.loops.entries()) {
    const verdict = verdictById.get(l.id) ?? '-(skip)'
    deps.io.out(`  ${pad(l.id, 16)} status=${pad(l.status, 8)} verdict=${pad(verdict, 8)} ${l.autonomy_level}/${enforcementFor(l.autonomy_level)}`)
    const p = byId.get(l.id)!
    const health = missing ? 'missing' : p.health
    // admission allowed/blocked + inflight + last result + ledger health（第 5 节：能说明为什么 blocked）。
    deps.io.out(`    ledger=${pad(health, 8)} admit=${pad(admissionProbe(l, p), 24)} inflight=${p.inFlight} runs_today=${p.runsToday} last=${p.lastResult ?? '-'}`)
    const starter = starterReports[index] ?? null
    if (starter === null) {
      deps.io.out('    template=(manual) binding=n/a wiring=n/a runnable=n/a')
    } else {
      deps.io.out(
        `    template=${l.template_id}@${l.template_version ?? '?'} binding=${starter.binding.status} ` +
        `wiring=${starter.wiring.status} runnable=${String(starter.runnable)}`,
      )
      if (starter.wiring.reason !== null) deps.io.out(`      reason=${starter.wiring.reason}`)
    }
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
  starterWiringDeps: LoopStarterWiringDeps = defaultStarterWiringDeps(deps),
): Promise<number> {
  const p = parseArgs(args)
  switch (sub || 'list') {
    case 'list':
      return cmdList(deps, p, fs)
    case 'enforce':
      return cmdEnforce(deps, p, fs)
    case 'status':
      return cmdStatus(deps, p, fs, starterWiringDeps)
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
      return cmdInit(deps, args, initEnv, starterWiringDeps)
    case 'run':
      return cmdLoopRun(deps, args, fs)
    case 'sync':
      return cmdLoopSync(deps, args)
    default:
      deps.io.err(`ERROR: 未知 loops 子命令: ${sub}（支持: init list enforce status budget cost drift audit graduate level run sync）`)
      return 1
  }
}
