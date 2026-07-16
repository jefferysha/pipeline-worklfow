/**
 * loops enforce —— R1-R11 裁决纯逻辑 + progress.md 解析 + buildReport 编排（BACKLOG #35 / GOAL B18/D16）。
 * 真相源：老仓 skills/pipeline/scripts/loops_enforce.py（parse_progress 106-177 / adjudicate 318-397 /
 * count_in_flight 184-224 / audit_ship_barrier 259-293 / build_report 404-455）。
 * 分级放权：老仓无 autonomy_level，本轮新增——enforce 认级别（L1 report-only / L2 assisted / L3 unattended）。
 */
import { describe, expect, test } from 'vitest'
import {
  parseProgress,
  adjudicate,
  budgetWarnThreshold,
  cadenceMinutes,
  buildReport,
  enforcementFor,
  type EnforceFs,
} from './enforce.js'
import type { LoopEntry, RunFacts } from './types.js'

const NOW = new Date(Date.UTC(2026, 6, 7, 12, 0)) // 2026-07-07T12:00Z

function loop(over: Partial<LoopEntry> = {}): LoopEntry {
  return {
    id: 'loop-be',
    name: 'BE loop',
    kind: 'orchestrator',
    goal: 'x'.repeat(12),
    cadence: '1h',
    risk: 'medium',
    runner: 'cron',
    change_prefix: 'loop-be-',
    phases: ['a', 'b'],
    human_gates: ['g'],
    state: '.superpowers/loops/progress.md',
    design_doc: 'd',
    status: 'active',
    budget: { max_runs_per_day: 24, max_in_flight: 1, on_exceed: 'skip' },
    kill_criteria: ['k'],
    autonomy_level: 'L1',
    allowlist: [],
    denylist: [],
    ...over,
  }
}

function facts(over: Partial<RunFacts> = {}): RunFacts {
  return { runsToday: 0, failStreak: 0, dryRounds: 0, lastRunAt: null, latestRowOk: true, inFlight: 0, misaccounted: [], ...over }
}

describe('budgetWarnThreshold / cadenceMinutes （纯整数 + cadence 解析）', () => {
  test('80% 减速线 ceil（老 _budget_warn_threshold 312-315）', () => {
    expect(budgetWarnThreshold(24)).toBe(20) // ceil(0.8*24)=20
    expect(budgetWarnThreshold(10)).toBe(8)
    expect(budgetWarnThreshold(1)).toBe(1)
  })
  test('cadence：continuous→null，range 取上界（老 _cadence_minutes 300-309）', () => {
    expect(cadenceMinutes('continuous')).toBeNull()
    expect(cadenceMinutes('1h')).toBe(60)
    expect(cadenceMinutes('30m')).toBe(30)
    expect(cadenceMinutes('5m-10m')).toBe(10)
    expect(cadenceMinutes('2d')).toBe(2880)
  })
})

describe('parseProgress —— 5 列表格解析（老 parse_progress 106-177）', () => {
  const ids = ['loop-be', 'loop-fe']
  test('归属按第 2 列精确匹配；今日轮数 / 连败 / 干涸 / 最新行可裁决', () => {
    const md = `| ts | loop | action | inflight | note |
| 2026-07-07T09:00 | loop-be | run | 0 | result=ok |
| 2026-07-07T10:00 | loop-be | run | 0 | result=fail |
| 2026-07-07T11:00 | loop-be | run | 0 | result=fail |
| 2026-07-07T08:00 | loop-fe | run | 0 | result=dry 干涸计数=1 |
`
    const m = parseProgress(md, ids, NOW)
    const be = m.get('loop-be')!
    expect(be.runsToday).toBe(3)
    expect(be.failStreak).toBe(2) // 末两行连败
    expect(be.latestRowOk).toBe(true)
    const fe = m.get('loop-fe')!
    expect(fe.dryRounds).toBe(1) // 干涸计数 token 优先
    expect(fe.runsToday).toBe(1)
  })

  test('无 result token 的最新行 → latestRowOk=false（R10 触发源）', () => {
    const md = `| 2026-07-07T09:00 | loop-be | run | 0 | 没有 token |`
    expect(parseProgress(md, ids, NOW).get('loop-be')!.latestRowOk).toBe(false)
  })

  test('文件缺失（null）→ 全零历史，非错误', () => {
    const m = parseProgress(null, ids, NOW)
    expect(m.get('loop-be')!.runsToday).toBe(0)
    expect(m.get('loop-fe')!.failStreak).toBe(0)
  })

  test('未知 loop 列 / `-` / `all` 不归属任何 loop', () => {
    const md = `| 2026-07-07T09:00 | all | run | 0 | result=ok |
| 2026-07-07T09:00 | other-loop | run | 0 | result=ok |`
    expect(parseProgress(md, ids, NOW).get('loop-be')!.runsToday).toBe(0)
  })
})

describe('adjudicate —— R1-R11 裁决（老 adjudicate 318-397；verdict 取最严）', () => {
  test('R1 status=paused → kill', () => {
    const v = adjudicate(loop({ status: 'paused' }), facts(), NOW)
    expect(v.verdict).toBe('kill')
    expect(v.reasons.map((r) => r.rule)).toContain('R1')
  })
  test('R2 预算超限（runs>=max）→ kill', () => {
    const v = adjudicate(loop(), facts({ runsToday: 24 }), NOW)
    expect(v.verdict).toBe('kill')
    expect(v.reasons.map((r) => r.rule)).toContain('R2')
  })
  test('R3 预算 80% 减速线 → warn（未超限）', () => {
    const v = adjudicate(loop(), facts({ runsToday: 20 }), NOW)
    expect(v.verdict).toBe('warn')
    expect(v.reasons.map((r) => r.rule)).toEqual(['R3'])
  })
  test('R4 连败硬顶 3 → kill', () => {
    const v = adjudicate(loop(), facts({ failStreak: 3 }), NOW)
    expect(v.verdict).toBe('kill')
    expect(v.reasons.map((r) => r.rule)).toContain('R4')
  })
  test('R5 连败预警 2 → warn', () => {
    const v = adjudicate(loop(), facts({ failStreak: 2 }), NOW)
    expect(v.verdict).toBe('warn')
    expect(v.reasons.map((r) => r.rule)).toContain('R5')
  })
  test('R6 干涸收敛 2 → kill；R7 干涸预警 1 → warn', () => {
    expect(adjudicate(loop(), facts({ dryRounds: 2 }), NOW).verdict).toBe('kill')
    expect(adjudicate(loop(), facts({ dryRounds: 1 }), NOW).verdict).toBe('warn')
  })
  test('R8 在途已满 → warn（非 kill）', () => {
    const v = adjudicate(loop({ budget: { max_runs_per_day: 24, max_in_flight: 1, on_exceed: 'skip' } }), facts({ inFlight: 1 }), NOW)
    expect(v.verdict).toBe('warn')
    expect(v.reasons.map((r) => r.rule)).toContain('R8')
  })
  test('R9 罢工检测：距上次 > 2×cadence → warn', () => {
    const last = new Date(NOW.getTime() - 200 * 60000) // 200min > 2*60
    const v = adjudicate(loop({ cadence: '1h' }), facts({ lastRunAt: last }), NOW)
    expect(v.reasons.map((r) => r.rule)).toContain('R9')
    expect(v.metrics.minutes_since_last_run).toBe(200)
  })
  test('R9 不触发：continuous cadence 免疫', () => {
    const last = new Date(NOW.getTime() - 9999 * 60000)
    const v = adjudicate(loop({ cadence: 'continuous', kind: 'executor' }), facts({ lastRunAt: last }), NOW)
    expect(v.reasons.map((r) => r.rule)).not.toContain('R9')
  })
  test('R10 最新行不可裁决 → warn', () => {
    expect(adjudicate(loop(), facts({ latestRowOk: false }), NOW).verdict).toBe('warn')
  })
  test('R11 沙箱屏障误记账 → warn（不进 kill 集，全列不吞）', () => {
    const v = adjudicate(loop(), facts({ misaccounted: ['loop-be-x'] }), NOW)
    expect(v.verdict).toBe('warn')
    expect(v.reasons.map((r) => r.rule)).toContain('R11')
    expect(v.metrics.misaccounted).toBe(1)
  })
  test('全绿 → ok、reasons 空', () => {
    const v = adjudicate(loop(), facts(), NOW)
    expect(v.verdict).toBe('ok')
    expect(v.reasons).toEqual([])
  })
  test('多规则并发：kill 压倒 warn（取最严），reasons 全列不吞', () => {
    const v = adjudicate(loop({ status: 'paused' }), facts({ failStreak: 2, inFlight: 1 }), NOW)
    expect(v.verdict).toBe('kill')
    const rules = v.reasons.map((r) => r.rule)
    expect(rules).toContain('R1')
    expect(rules).toContain('R5')
    expect(rules).toContain('R8')
  })
})

/**
 * 分级放权 L1-L3 —— enforce 认级别：adjudicate 把 autonomy_level 折成 enforcement/report_only
 * 写进裁决信封。#38 的毕业制本身已实现且已接线（graduation.ts::applyLevelChange ← CLI
 * `loops graduate|level`（commands/loops.ts:907/909）+ server.ts:814），它改的是 autonomy_level 本身。
 *
 * ★当前限制（这些断言的射程）：verdict×level 不驱动任何自动 gate/halt。裁决信封的唯一消费方是
 * enforce.ts:362 buildReport（→ `loops report` 展示），没有执行面据此停 loop——automation 的
 * scheduler/scheduler.ts 零引用裁决与预算。故下面 L1 report_only=true / L3 unattended 的差别只体现
 * 在信封字段与报告文本上，不改变 loop 实际被调度执行的行为。详见 loops/types.ts:13。
 */
describe('分级放权 L1-L3 —— enforce 认级别（级别只进裁决信封，不驱动 gate/halt）', () => {
  test('enforcementFor 映射：L1 report-only / L2 assisted / L3 unattended', () => {
    expect(enforcementFor('L1')).toBe('report-only')
    expect(enforcementFor('L2')).toBe('assisted')
    expect(enforcementFor('L3')).toBe('unattended')
  })
  test('L1 默认 → report_only=true：即便 kill 判据命中，裁决为 report-only（不自动停）', () => {
    const v = adjudicate(loop({ autonomy_level: 'L1', status: 'paused' }), facts(), NOW)
    expect(v.verdict).toBe('kill') // 判据照常计算
    expect(v.report_only).toBe(true)
    expect(v.enforcement).toBe('report-only')
    expect(v.autonomy_level).toBe('L1')
  })
  test('L3 → report_only=false、enforcement=unattended', () => {
    const v = adjudicate(loop({ autonomy_level: 'L3' }), facts({ runsToday: 24 }), NOW)
    expect(v.report_only).toBe(false)
    expect(v.enforcement).toBe('unattended')
  })
})

describe('buildReport —— 编排（老 build_report 404-455；orchestrator 裁决 / executor 跳过 / exit code）', () => {
  function fakeFs(over: Partial<EnforceFs> = {}): EnforceFs {
    return {
      loadRegistry: () => ({
        data: {
          version: 1,
          loops: [loop(), loop({ id: 'afk-scheduler', kind: 'executor', cadence: 'continuous', change_prefix: null })],
        },
        errors: [],
      }),
      readProgress: () => null,
      listChanges: () => [],
      readChangeFields: () => null,
      readSandboxFields: () => null,
      ...over,
    }
  }

  test('orchestrator 裁决 + executor 跳过 + exit 0（全绿）', () => {
    const { report, errors, exitCode } = buildReport('/repo', { now: NOW }, fakeFs())
    expect(errors).toEqual([])
    expect(exitCode).toBe(0)
    expect(report!.verdicts.map((v) => v.id)).toEqual(['loop-be'])
    expect(report!.skipped.map((s) => s.id)).toEqual(['afk-scheduler'])
  })

  test('真在途计数：queued/running 的 change 计入 → R8 warn → exit 1', () => {
    const fs = fakeFs({
      listChanges: (_r, prefix) => (prefix === 'loop-be-' ? ['loop-be-1'] : []),
      readChangeFields: () => ({ automation: 'running' }),
    })
    const { report, exitCode } = buildReport('/repo', { now: NOW }, fs)
    expect(report!.verdicts[0]!.metrics.in_flight).toBe(1)
    expect(report!.verdicts[0]!.reasons.map((r) => r.rule)).toContain('R8')
    expect(exitCode).toBe(1)
  })

  test('预算超限（progress 今日 24 轮）→ kill → exit 2', () => {
    const rows = Array.from({ length: 24 }, () => '| 2026-07-07T09:00 | loop-be | run | 0 | result=ok |').join('\n')
    const { report, exitCode } = buildReport('/repo', { now: NOW }, fakeFs({ readProgress: () => rows }))
    expect(report!.verdicts[0]!.verdict).toBe('kill')
    expect(exitCode).toBe(2)
  })

  test('registry 载入错误 → report null、errors 非空、exit 3', () => {
    const { report, errors, exitCode } = buildReport('/repo', { now: NOW }, fakeFs({ loadRegistry: () => ({ data: null, errors: ['boom'] }) }))
    expect(report).toBeNull()
    expect(errors).toEqual(['boom'])
    expect(exitCode).toBe(3)
  })

  test('registry 缺失（data null, errors 空）→ report null、exit 3', () => {
    const { report, exitCode } = buildReport('/repo', { now: NOW }, fakeFs({ loadRegistry: () => ({ data: null, errors: [] }) }))
    expect(report).toBeNull()
    expect(exitCode).toBe(3)
  })
})
