/**
 * loops budget/cost —— 真实端到端集成测试（BACKLOG #36，GOAL C9：无伪测试 / B20 token 预算+熔断 / D16）。
 *
 * 零 mock：mkdtemp 真临时项目 + 真写 .pipeline/loops.yaml（含 token 预算声明）+ 真写
 * .superpowers/loops/progress.md 运行流水（累计 token 花费）+ realDeps 真 clock + 真调 cmdLoops budget/cost
 * （默认 REAL_LOOPS_FS 走真 node fs：真 loadRegistry 窄解析+schema 校验 / 真 run-log 解析累计花费 / 真成本估算）。
 * 断言真实熔断：累计今日 token 超 max_tokens_per_day → breaker=tripped、exit 2（circuit breaker 真触发）；
 * 真成本估算：cadence×pattern → 预估 token/日、超预算 exit 1。
 *
 * 覆盖（C10）：budget happy(ok)/warn(减速线)/tripped(熔断)/无预算/--json/--loop 过滤/registry 错误；
 * cost within/over/continuous/--json；跨命令串联 list→budget→cost 同一真 registry。
 */
import { appendFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLoopLedgerStore, ledgerFilePath } from '@tenon/kernel'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { realDeps, rm } from './integration-harness.js'
import { cmdLoops, REAL_LOOPS_FS } from './commands/loops.js'

interface Run { code: number; out: string[]; err: string[] }

let cwd: string

async function loops(sub: string, ...args: string[]): Promise<Run> {
  const out: string[] = []
  const err: string[] = []
  const code = await cmdLoops(realDeps(cwd, out, err), sub, args, REAL_LOOPS_FS)
  return { code, out, err }
}

/** 写一条合法 loop 的 YAML 块（缩进 2）；含可选 token 预算字段。 */
function loopBlock(o: {
  id: string; kind?: string; cadence?: string; risk?: string; status?: string; autonomy?: string | null
  maxTokens?: number | null; tokensPerRun?: number | null
}): string {
  const budget = [
    `    budget:`,
    `      max_runs_per_day: 24`,
    `      max_in_flight: 1`,
    `      on_exceed: skip`,
    ...(o.maxTokens === undefined || o.maxTokens === null ? [] : [`      max_tokens_per_day: ${o.maxTokens}`]),
    ...(o.tokensPerRun === undefined || o.tokensPerRun === null ? [] : [`      tokens_per_run: ${o.tokensPerRun}`]),
  ]
  const lvl = o.autonomy === undefined ? 'L1' : o.autonomy
  return [
    `  - id: ${o.id}`,
    `    name: ${o.id} 编排 loop`,
    `    kind: ${o.kind ?? 'orchestrator'}`,
    `    goal: 每小时发现立项跑通收敛目标架构`,
    `    cadence: ${o.cadence ?? '1h'}`,
    `    risk: ${o.risk ?? 'medium'}`,
    `    runner: cron-session`,
    `    change_prefix: ${o.id}-`,
    `    phases:`,
    `      - decide`,
    `      - record`,
    `    human_gates:`,
    `      - P2 战略项只写提案`,
    `    state: .superpowers/loops/progress.md`,
    `    design_doc: docs/loops/${o.id}.md`,
    `    status: ${o.status ?? 'active'}`,
    ...budget,
    `    kill_criteria:`,
    `      - backlog 连续 2 轮空`,
    ...(lvl === null ? [] : [`    autonomy_level: ${lvl}`]),
  ].join('\n')
}

async function writeRegistry(...blocks: string[]): Promise<void> {
  await mkdir(join(cwd, '.pipeline'), { recursive: true })
  await writeFile(join(cwd, '.pipeline', 'loops.yaml'), `version: 1\nloops:\n${blocks.join('\n')}\n`, 'utf8')
}

/** 真写运行流水 progress.md：每行 5 列表格，note 内 tokens= 记该轮 token 花费。 */
async function writeRunLog(rows: Array<{ ts: string; id: string; tokens: number }>): Promise<void> {
  await mkdir(join(cwd, '.superpowers', 'loops'), { recursive: true })
  const lines = [
    '| ts | loop | action | inflight | note |',
    '|----|------|--------|----------|------|',
    ...rows.map((r) => `| ${r.ts} | ${r.id} | run | 0 | result=ok tokens=${r.tokens} |`),
  ]
  await writeFile(join(cwd, '.superpowers', 'loops', 'progress.md'), lines.join('\n') + '\n', 'utf8')
}

// realDeps 固定 clock = 2026-07-07T00:00:00Z → 今日 = 2026-07-07
const TODAY = '2026-07-07'

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'loops-budget-e2e-'))
})
afterEach(async () => {
  await rm(cwd, { recursive: true, force: true })
})

describe('真实 e2e —— budget circuit breaker（真 run-log 累计花费 → 真熔断）', () => {
  test('花费 < 80% → breaker=ok → exit 0；剩余真算', async () => {
    await writeRegistry(loopBlock({ id: 'loop-be', maxTokens: 100000 }))
    await writeRunLog([
      { ts: `${TODAY}T08:00`, id: 'loop-be', tokens: 20000 },
      { ts: `${TODAY}T09:00`, id: 'loop-be', tokens: 30000 },
    ])
    const r = await loops('budget', '--json')
    expect(r.code).toBe(0)
    const s = JSON.parse(r.out.join('\n')).statuses[0]
    expect(s.id).toBe('loop-be')
    expect(s.spentToday).toBe(50000)
    expect(s.remaining).toBe(50000)
    expect(s.breaker).toBe('ok')
  })

  test('花费 ≥ 80% 且 < 100% → breaker=warn（减速线）→ exit 1', async () => {
    await writeRegistry(loopBlock({ id: 'loop-be', maxTokens: 100000 }))
    await writeRunLog([{ ts: `${TODAY}T08:00`, id: 'loop-be', tokens: 85000 }])
    const r = await loops('budget', '--json')
    expect(r.code).toBe(1)
    expect(JSON.parse(r.out.join('\n')).statuses[0].breaker).toBe('warn')
  })

  test('累计今日花费超 max_tokens_per_day → breaker=tripped（真熔断）→ exit 2', async () => {
    await writeRegistry(loopBlock({ id: 'loop-be', maxTokens: 10000 }))
    // 三轮累计 12000 > 10000 → circuit breaker 触发
    await writeRunLog([
      { ts: `${TODAY}T08:00`, id: 'loop-be', tokens: 4000 },
      { ts: `${TODAY}T09:00`, id: 'loop-be', tokens: 4000 },
      { ts: `${TODAY}T10:00`, id: 'loop-be', tokens: 4000 },
    ])
    const r = await loops('budget', '--json')
    expect(r.code).toBe(2)
    const s = JSON.parse(r.out.join('\n')).statuses[0]
    expect(s.spentToday).toBe(12000)
    expect(s.breaker).toBe('tripped')
    expect(s.remaining).toBe(0)
    // 分级放权 L1：熔断也 report_only（自动停留 #38）
    expect(s.reportOnly).toBe(true)
  })

  test('昨日花费不计入今日预算（真日期过滤）→ 不熔断', async () => {
    await writeRegistry(loopBlock({ id: 'loop-be', maxTokens: 10000 }))
    await writeRunLog([
      { ts: '2026-07-06T23:00', id: 'loop-be', tokens: 50000 }, // 昨天，不计
      { ts: `${TODAY}T08:00`, id: 'loop-be', tokens: 3000 },
    ])
    const r = await loops('budget', '--json')
    expect(r.code).toBe(0)
    expect(JSON.parse(r.out.join('\n')).statuses[0].spentToday).toBe(3000)
  })

  test('L3 loop 熔断 → report_only=false（毕业制：熔断可自动停）', async () => {
    await writeRegistry(loopBlock({ id: 'loop-le', autonomy: 'L3', maxTokens: 1000 }))
    await writeRunLog([{ ts: `${TODAY}T08:00`, id: 'loop-le', tokens: 5000 }])
    const r = await loops('budget', '--json')
    expect(r.code).toBe(2)
    const s = JSON.parse(r.out.join('\n')).statuses[0]
    expect(s.breaker).toBe('tripped')
    expect(s.reportOnly).toBe(false)
  })

  test('未声明 token 预算 → hasBudget=false、breaker=ok（不熔断，花费仍追踪）', async () => {
    await writeRegistry(loopBlock({ id: 'loop-be', maxTokens: null }))
    await writeRunLog([{ ts: `${TODAY}T08:00`, id: 'loop-be', tokens: 999999 }])
    const r = await loops('budget', '--json')
    expect(r.code).toBe(0)
    const s = JSON.parse(r.out.join('\n')).statuses[0]
    expect(s.hasBudget).toBe(false)
    expect(s.breaker).toBe('ok')
    expect(s.spentToday).toBe(999999)
  })

  test('text 输出含 loop id + breaker 状态 + 花费/剩余', async () => {
    await writeRegistry(loopBlock({ id: 'loop-be', maxTokens: 100000 }))
    await writeRunLog([{ ts: `${TODAY}T08:00`, id: 'loop-be', tokens: 40000 }])
    const r = await loops('budget')
    expect(r.code).toBe(0)
    const out = r.out.join('\n')
    expect(out).toContain('loop-be')
    expect(out).toContain('40000')
  })

  test('--loop 过滤：未知 id → exit 3；已知 id → 只算该 loop', async () => {
    await writeRegistry(
      loopBlock({ id: 'loop-be', maxTokens: 100000 }),
      loopBlock({ id: 'loop-fe', maxTokens: 100000 }),
    )
    await writeRunLog([{ ts: `${TODAY}T08:00`, id: 'loop-fe', tokens: 10000 }])
    expect((await loops('budget', '--loop', 'ghost')).code).toBe(3)
    const r = await loops('budget', '--loop', 'loop-fe', '--json')
    expect(r.code).toBe(0)
    const statuses = JSON.parse(r.out.join('\n')).statuses
    expect(statuses.map((s: { id: string }) => s.id)).toEqual(['loop-fe'])
  })

  test('registry 校验失败 → report 抑制、错误到 stderr、exit 3', async () => {
    await mkdir(join(cwd, '.pipeline'), { recursive: true })
    await writeFile(join(cwd, '.pipeline', 'loops.yaml'), 'version: 1\nloops:\n  - id: BAD_ID\n', 'utf8')
    const r = await loops('budget')
    expect(r.code).toBe(3)
    expect(r.err.length).toBeGreaterThan(0)
  })

  test('registry 缺失 → exit 3 + 未找到提示（budget 需登记表）', async () => {
    const r = await loops('budget')
    expect(r.code).toBe(3)
    expect(r.err.join('\n')).toMatch(/loops\.yaml|未找到|no loops/i)
  })
})

describe('真实 e2e —— cost 成本估算（cadence×pattern → 预估 token/日）', () => {
  test('1h × risk:medium → 24×8000=192000 tokens/日；预算内 exit 0', async () => {
    await writeRegistry(loopBlock({ id: 'loop-be', cadence: '1h', risk: 'medium', maxTokens: 300000 }))
    const r = await loops('cost', '--json')
    expect(r.code).toBe(0)
    const e = JSON.parse(r.out.join('\n')).estimates[0]
    expect(e.runsPerDay).toBe(24)
    expect(e.tokensPerRun).toBe(8000)
    expect(e.estimatedTokensPerDay).toBe(192000)
    expect(e.withinBudget).toBe(true)
  })

  test('估算超预算 → withinBudget=false → exit 1（应缩 cadence 或提预算）', async () => {
    await writeRegistry(loopBlock({ id: 'loop-be', cadence: '1h', risk: 'high', maxTokens: 100000 }))
    const r = await loops('cost', '--json')
    expect(r.code).toBe(1)
    const e = JSON.parse(r.out.join('\n')).estimates[0]
    expect(e.estimatedTokensPerDay).toBe(24 * 20000)
    expect(e.withinBudget).toBe(false)
    expect(e.headroom).toBeLessThan(0)
  })

  test('声明 tokens_per_run 覆盖 risk 预设（pattern=declared）', async () => {
    await writeRegistry(loopBlock({ id: 'loop-be', cadence: '1d', risk: 'high', maxTokens: 100000, tokensPerRun: 5000 }))
    const r = await loops('cost', '--json')
    expect(r.code).toBe(0)
    const e = JSON.parse(r.out.join('\n')).estimates[0]
    expect(e.pattern).toBe('declared')
    expect(e.tokensPerRun).toBe(5000)
    expect(e.estimatedTokensPerDay).toBe(5000)
  })

  test('continuous → runsPerDay/estimate=null（无界，不估算）', async () => {
    await writeRegistry(loopBlock({ id: 'afk', kind: 'executor', cadence: 'continuous', maxTokens: 100000 }))
    const r = await loops('cost', '--json')
    expect(r.code).toBe(0)
    const e = JSON.parse(r.out.join('\n')).estimates[0]
    expect(e.runsPerDay).toBeNull()
    expect(e.estimatedTokensPerDay).toBeNull()
  })

  test('text 输出含预估 token/日', async () => {
    await writeRegistry(loopBlock({ id: 'loop-be', cadence: '1h', risk: 'medium', maxTokens: 300000 }))
    const r = await loops('cost')
    expect(r.code).toBe(0)
    expect(r.out.join('\n')).toContain('192000')
  })
})

describe('真实 e2e —— 跨命令串联（同一真 registry）', () => {
  test('list（登记）→ budget（熔断裁决）→ cost（估算）跑通', async () => {
    await writeRegistry(loopBlock({ id: 'loop-be', cadence: '1h', risk: 'medium', maxTokens: 10000 }))
    await writeRunLog([{ ts: `${TODAY}T08:00`, id: 'loop-be', tokens: 20000 }])
    expect((await loops('list')).code).toBe(0)
    // budget：今日 20000 > 10000 → 熔断 exit 2
    expect((await loops('budget')).code).toBe(2)
    // cost：24×8000=192000 >> 10000 → 超预算 exit 1（估算即预警会超支）
    expect((await loops('cost')).code).toBe(1)
  })
})

// ── Stage B 返工 #7：budget --json 的 admission 字段（ledger 投影，与硬 admission 同源）──────────
describe('真实 e2e —— budget --json 的 admission 面（#7 统一读面）', () => {
  const seedOpenReservation = async (loopId: string): Promise<void> => {
    await createLoopLedgerStore().append(cwd, {
      schema_version: 1, record_id: 'rec-1', recorded_at: `${TODAY}T00:00:00Z`, kind: 'budget-reservation',
      reservation_id: 'res-1', attempt_id: 'att-1', loop_id: loopId, change: `${loopId}-a`, budget_day: TODAY,
      reserved_runs: 1, reserved_tokens: 5000, token_basis: 'risk-default',
      limits_snapshot: { max_runs_per_day: 24, max_in_flight: 1, on_exceed: 'skip-run' }, expires_at: `${TODAY}T01:00:00Z`,
    })
  }

  test('legacy breaker=ok 但 ledger 在途占满 → admission.allowed=false blocked_by=max-in-flight（解决读面矛盾）', async () => {
    await writeRegistry(loopBlock({ id: 'lp', maxTokens: 100000 })) // max_in_flight=1（loopBlock 固定）
    await seedOpenReservation('lp') // 一条未关闭预占 → inFlight=1，占满 max_in_flight
    const r = await loops('budget', '--json')
    const s = JSON.parse(r.out.join('\n')).statuses[0]
    expect(s.breaker).toBe('ok') // legacy 软指标：无 progress.md 花费 → ok
    expect(s.breaker_source).toBe('legacy-progress') // 明标非 admission authority
    expect(s.admission.source).toBe('ledger')
    expect(s.admission.allowed).toBe(false) // 硬 admission：在途占满
    expect(s.admission.blocked_by).toBe('max-in-flight')
    expect(s.admission.in_flight).toBe(1)
    expect(s.admission.health).toBe('ok')
  })

  test('legacy 顶层字段一字不改（向后兼容）+ 新增 admission 并存', async () => {
    await writeRegistry(loopBlock({ id: 'lp', maxTokens: 100000 }))
    await writeRunLog([{ ts: `${TODAY}T08:00`, id: 'lp', tokens: 20000 }])
    const s = JSON.parse((await loops('budget', '--json')).out.join('\n')).statuses[0]
    expect(s.spentToday).toBe(20000) // legacy 值不变
    expect(s.remaining).toBe(80000)
    expect(s.breaker).toBe('ok')
    expect(s.admission).toBeDefined() // 新增字段并存
    expect(s.admission.allowed).toBe(true)
  })

  test('ledger 坏行 → admission.health=degraded、allowed=false blocked_by=ledger-degraded', async () => {
    await writeRegistry(loopBlock({ id: 'lp', maxTokens: 100000 }))
    await mkdir(join(cwd, '.pipeline', 'loops'), { recursive: true })
    await appendFile(ledgerFilePath(cwd), '{bad json line\n', 'utf8')
    const s = JSON.parse((await loops('budget', '--json')).out.join('\n')).statuses[0]
    expect(s.admission.health).toBe('degraded')
    expect(s.admission.allowed).toBe(false)
    expect(s.admission.blocked_by).toBe('ledger-degraded')
  })

  test('ledger 文件缺失 → admission.health=missing、allowed=true', async () => {
    await writeRegistry(loopBlock({ id: 'lp', maxTokens: 100000 }))
    const s = JSON.parse((await loops('budget', '--json')).out.join('\n')).statuses[0]
    expect(s.admission.health).toBe('missing')
    expect(s.admission.allowed).toBe(true)
  })
})
