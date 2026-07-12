/**
 * loops budget —— token 预算追踪 + circuit breaker 熔断 + 成本估算纯逻辑（BACKLOG #36 / GOAL B20 / D16）。
 * 真相源语义：cobusgreyling/loop-engineering（MIT）loop-budget（token 分配/花费追踪）+ circuit breaker
 * （按累计 cost/token spend 紧急停）+ loop-cost（按 cadence×pattern 估 token/日）。仅适配语义，未复制代码。
 *
 * 本文件 = 快速回归（纯逻辑 + 注入 fs）；真实对位在 cli/src/loops-budget.integration.test.ts（真 fs + 真 run-log）。
 */
import { describe, expect, test } from 'vitest'
import {
  PATTERN_TOKENS_PER_RUN,
  buildBudgetReport,
  buildCostReport,
  computeBudgetStatus,
  estimateCost,
  sumRunLogTokens,
  type BudgetFs,
} from './budget.js'
import type { LoopBudget, LoopEntry, LoopRegistry } from './types.js'

const NOW = new Date(Date.UTC(2026, 6, 7, 12, 0)) // 2026-07-07T12:00Z

function loop(over: Partial<LoopEntry> = {}, budgetOver: Partial<LoopBudget> = {}): LoopEntry {
  return {
    id: 'loop-be', name: 'BE loop', kind: 'orchestrator', goal: 'x'.repeat(12), cadence: '1h',
    risk: 'medium', runner: 'cron', change_prefix: 'loop-be-', phases: ['a', 'b'], human_gates: ['g'],
    state: '.superpowers/loops/progress.md', design_doc: 'd', status: 'active',
    budget: { max_runs_per_day: 24, max_in_flight: 1, on_exceed: 'skip', ...budgetOver },
    kill_criteria: ['k'], autonomy_level: 'L1', allowlist: [], denylist: [], ...over,
  }
}

/** 一条 run-log 行（progress.md 5 列表格；note 内含 tokens=）。 */
function row(ts: string, id: string, tokens?: number, note = 'result=ok'): string {
  const n = tokens === undefined ? note : `${note} tokens=${tokens}`
  return `| ${ts} | ${id} | run | 0 | ${n} |`
}

function runlog(...rows: string[]): string {
  return ['| ts | loop | action | inflight | note |', '|----|------|--------|----------|------|', ...rows].join('\n')
}

// ── sumRunLogTokens：run-log 累计今日 token 花费 ──────────────────────────────

describe('sumRunLogTokens —— run-log 累计今日花费', () => {
  test('求和今日本 loop 的 tokens=；非今日/别 loop 不计', () => {
    const text = runlog(
      row('2026-07-07T09:00', 'loop-be', 1500),
      row('2026-07-07T10:00', 'loop-be', 2500),
      row('2026-07-06T09:00', 'loop-be', 9999), // 昨天，不计
      row('2026-07-07T09:00', 'loop-fe', 8888), // 别 loop，不计
    )
    const r = sumRunLogTokens(text, 'loop-be', NOW)
    expect(r.spentToday).toBe(4000)
    expect(r.runsToday).toBe(2)
  })

  test('无 tokens= 的今日行仍计 runsToday，spend 计 0', () => {
    const text = runlog(row('2026-07-07T09:00', 'loop-be'), row('2026-07-07T10:00', 'loop-be', 500))
    const r = sumRunLogTokens(text, 'loop-be', NOW)
    expect(r.spentToday).toBe(500)
    expect(r.runsToday).toBe(2)
  })

  test('缺 run-log（text=null）→ 零花费零轮次（非错误）', () => {
    const r = sumRunLogTokens(null, 'loop-be', NOW)
    expect(r.spentToday).toBe(0)
    expect(r.runsToday).toBe(0)
  })

  test('短时间戳 MM-DDTHH:MM 取当前年份判定今日', () => {
    const r = sumRunLogTokens(runlog(row('07-07T08:00', 'loop-be', 700)), 'loop-be', NOW)
    expect(r.spentToday).toBe(700)
  })
})

// ── computeBudgetStatus：circuit breaker（累计花费 vs max_tokens_per_day）──────

describe('computeBudgetStatus —— circuit breaker 熔断判定', () => {
  test('未声明 token 预算 → hasBudget=false、breaker=ok、remaining/ratio=null', () => {
    const s = computeBudgetStatus(loop(), runlog(row('2026-07-07T09:00', 'loop-be', 99999)), NOW)
    expect(s.hasBudget).toBe(false)
    expect(s.maxTokensPerDay).toBeNull()
    expect(s.breaker).toBe('ok')
    expect(s.remaining).toBeNull()
    expect(s.usedRatio).toBeNull()
    expect(s.spentToday).toBe(99999) // 花费仍如实追踪
  })

  test('花费 < 80% → breaker=ok；remaining/ratio 真算', () => {
    const s = computeBudgetStatus(loop({}, { max_tokens_per_day: 100000 }), runlog(row('2026-07-07T09:00', 'loop-be', 50000)), NOW)
    expect(s.hasBudget).toBe(true)
    expect(s.maxTokensPerDay).toBe(100000)
    expect(s.warnThreshold).toBe(80000) // ceil(0.8×100000)
    expect(s.spentToday).toBe(50000)
    expect(s.remaining).toBe(50000)
    expect(s.usedRatio).toBeCloseTo(0.5)
    expect(s.breaker).toBe('ok')
  })

  test('花费 ≥ 80% 且 < 100% → breaker=warn（减速线）', () => {
    const s = computeBudgetStatus(loop({}, { max_tokens_per_day: 100000 }), runlog(row('2026-07-07T09:00', 'loop-be', 85000)), NOW)
    expect(s.breaker).toBe('warn')
    expect(s.remaining).toBe(15000)
  })

  test('花费 ≥ 100% → breaker=tripped（熔断），remaining clamp 到 0', () => {
    const s = computeBudgetStatus(loop({}, { max_tokens_per_day: 100000 }), runlog(row('2026-07-07T09:00', 'loop-be', 100000)), NOW)
    expect(s.breaker).toBe('tripped')
    expect(s.remaining).toBe(0)
  })

  test('花费超阈值仍熔断，remaining 不为负', () => {
    const s = computeBudgetStatus(loop({}, { max_tokens_per_day: 100000 }), runlog(row('2026-07-07T09:00', 'loop-be', 130000)), NOW)
    expect(s.breaker).toBe('tripped')
    expect(s.remaining).toBe(0)
    expect(s.usedRatio).toBeCloseTo(1.3)
  })

  test('累计跨多行今日花费触发熔断（真累计语义）', () => {
    const s = computeBudgetStatus(
      loop({}, { max_tokens_per_day: 10000 }),
      runlog(
        row('2026-07-07T08:00', 'loop-be', 4000),
        row('2026-07-07T09:00', 'loop-be', 4000),
        row('2026-07-07T10:00', 'loop-be', 4000),
      ),
      NOW,
    )
    expect(s.spentToday).toBe(12000)
    expect(s.breaker).toBe('tripped')
  })

  test('L1 熔断也 report_only=true（执行面留 #38）；on_exceed 回显', () => {
    const s = computeBudgetStatus(loop({ autonomy_level: 'L1' }, { max_tokens_per_day: 1000, on_exceed: 'skip' }), runlog(row('2026-07-07T09:00', 'loop-be', 5000)), NOW)
    expect(s.breaker).toBe('tripped')
    expect(s.reportOnly).toBe(true)
    expect(s.autonomyLevel).toBe('L1')
    expect(s.onExceed).toBe('skip')
  })

  test('L3 熔断 report_only=false（毕业制升档：熔断可自动停）', () => {
    const s = computeBudgetStatus(loop({ autonomy_level: 'L3' }, { max_tokens_per_day: 1000 }), runlog(row('2026-07-07T09:00', 'loop-be', 5000)), NOW)
    expect(s.breaker).toBe('tripped')
    expect(s.reportOnly).toBe(false)
  })
})

// ── estimateCost：cadence × pattern → 预估 token/日 ──────────────────────────

describe('estimateCost —— 成本估算（cadence×pattern）', () => {
  test('1h × risk:medium → 24 runs × 8000 = 192000 tokens/日', () => {
    const e = estimateCost(loop({ cadence: '1h', risk: 'medium' }))
    expect(e.runsPerDay).toBe(24)
    expect(e.tokensPerRun).toBe(PATTERN_TOKENS_PER_RUN.medium)
    expect(e.pattern).toBe('risk:medium')
    expect(e.estimatedTokensPerDay).toBe(24 * 8000)
  })

  test('30m × risk:low → 48 runs × 2000 = 96000 tokens/日', () => {
    const e = estimateCost(loop({ cadence: '30m', risk: 'low' }))
    expect(e.runsPerDay).toBe(48)
    expect(e.estimatedTokensPerDay).toBe(48 * 2000)
  })

  test('声明 tokens_per_run 覆盖 risk 预设（pattern=declared）', () => {
    const e = estimateCost(loop({ cadence: '1d', risk: 'high' }, { tokens_per_run: 5000 }))
    expect(e.runsPerDay).toBe(1)
    expect(e.pattern).toBe('declared')
    expect(e.tokensPerRun).toBe(5000)
    expect(e.estimatedTokensPerDay).toBe(5000)
  })

  test('continuous → runsPerDay/estimate=null（无界，不估算）', () => {
    const e = estimateCost(loop({ cadence: 'continuous' }))
    expect(e.runsPerDay).toBeNull()
    expect(e.estimatedTokensPerDay).toBeNull()
    expect(e.withinBudget).toBeNull()
  })

  test('预算充足 → withinBudget=true、headroom>0', () => {
    const e = estimateCost(loop({ cadence: '1h', risk: 'medium' }, { max_tokens_per_day: 200000 }))
    expect(e.withinBudget).toBe(true)
    expect(e.headroom).toBe(200000 - 192000)
  })

  test('估算超预算 → withinBudget=false、headroom<0（应缩 cadence 或提预算）', () => {
    const e = estimateCost(loop({ cadence: '1h', risk: 'medium' }, { max_tokens_per_day: 100000 }))
    expect(e.withinBudget).toBe(false)
    expect(e.headroom).toBe(100000 - 192000)
  })

  test('未声明预算 → withinBudget=null（无对照）', () => {
    const e = estimateCost(loop({ cadence: '1h' }))
    expect(e.maxTokensPerDay).toBeNull()
    expect(e.withinBudget).toBeNull()
  })

  test('B9：非法 risk（越过 schema 直接调用 estimateCost）→ 不产生 NaN 假超预算，tokensPerRun 兜底为数字', () => {
    const e = estimateCost(loop({ cadence: '1h', risk: 'bogus' as LoopEntry['risk'] }, { max_tokens_per_day: 1_000_000 }))
    expect(typeof e.tokensPerRun).toBe('number')
    expect(Number.isNaN(e.tokensPerRun)).toBe(false)
    expect(e.estimatedTokensPerDay).not.toBeNull()
    expect(Number.isNaN(e.estimatedTokensPerDay as number)).toBe(false)
    // 兜底后估算是有限数，与预算的对照是真判定（非 NaN<=max 恒 false 的假超预算）
    expect(e.withinBudget).toBe(true)
  })
})

// ── buildBudgetReport / buildCostReport：编排 + exit code + 注入 fs ───────────

function fakeFs(over: Partial<BudgetFs> = {}): BudgetFs {
  return {
    loadRegistry: (): { data: LoopRegistry | null; errors: string[] } => ({ data: { version: 1, loops: [loop({}, { max_tokens_per_day: 100000 })] }, errors: [] }),
    readRunLog: () => runlog(row('2026-07-07T09:00', 'loop-be', 50000)),
    ...over,
  }
}

describe('buildBudgetReport —— 编排 + exit code（tripped=2 / warn=1 / ok=0 / error=3）', () => {
  test('ok → exit 0，statuses 含该 loop', () => {
    const { report, errors, exitCode } = buildBudgetReport('/repo', null, NOW, fakeFs())
    expect(errors).toEqual([])
    expect(exitCode).toBe(0)
    expect(report!.statuses[0]!.id).toBe('loop-be')
    expect(report!.statuses[0]!.breaker).toBe('ok')
  })

  test('warn → exit 1', () => {
    const { exitCode } = buildBudgetReport('/repo', null, NOW, fakeFs({ readRunLog: () => runlog(row('2026-07-07T09:00', 'loop-be', 85000)) }))
    expect(exitCode).toBe(1)
  })

  test('tripped → exit 2（熔断）', () => {
    const { report, exitCode } = buildBudgetReport('/repo', null, NOW, fakeFs({ readRunLog: () => runlog(row('2026-07-07T09:00', 'loop-be', 120000)) }))
    expect(exitCode).toBe(2)
    expect(report!.statuses[0]!.breaker).toBe('tripped')
  })

  test('--loop 过滤未知 id → exit 3 + error', () => {
    const { report, errors, exitCode } = buildBudgetReport('/repo', 'ghost', NOW, fakeFs())
    expect(exitCode).toBe(3)
    expect(report).toBeNull()
    expect(errors.length).toBeGreaterThan(0)
  })

  test('registry 载入错误 → exit 3 + error 透传', () => {
    const { errors, exitCode } = buildBudgetReport('/repo', null, NOW, fakeFs({ loadRegistry: () => ({ data: null, errors: ['boom'] }) }))
    expect(exitCode).toBe(3)
    expect(errors).toContain('boom')
  })

  test('registry 缺失（data null, errors 空）→ exit 3 + 未找到提示', () => {
    const { errors, exitCode } = buildBudgetReport('/repo', null, NOW, fakeFs({ loadRegistry: () => ({ data: null, errors: [] }) }))
    expect(exitCode).toBe(3)
    expect(errors.join('\n')).toMatch(/loops\.yaml/)
  })
})

describe('buildCostReport —— 编排 + exit code（超预算=1 / ok=0 / error=3）', () => {
  test('估算在预算内 → exit 0', () => {
    const { report, exitCode } = buildCostReport('/repo', null, NOW, fakeFs({
      loadRegistry: () => ({ data: { version: 1, loops: [loop({ cadence: '1d' }, { max_tokens_per_day: 100000 })] }, errors: [] }),
    }))
    expect(exitCode).toBe(0)
    expect(report!.estimates[0]!.withinBudget).toBe(true)
  })

  test('估算超预算 → exit 1', () => {
    const { exitCode } = buildCostReport('/repo', null, NOW, fakeFs({
      loadRegistry: () => ({ data: { version: 1, loops: [loop({ cadence: '1h', risk: 'high' }, { max_tokens_per_day: 100000 })] }, errors: [] }),
    }))
    expect(exitCode).toBe(1)
  })

  test('未知 --loop → exit 3', () => {
    const { exitCode } = buildCostReport('/repo', 'ghost', NOW, fakeFs())
    expect(exitCode).toBe(3)
  })
})
