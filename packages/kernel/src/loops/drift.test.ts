/**
 * loops drift + audit —— 纯逻辑单测（快速回归；真实对位在 cli/loops-drift.integration.test.ts）。
 * 覆盖 7 个漂移维度 + 7 个就绪评分维度 + build 编排（fake fs 注入）。
 */
import { describe, expect, test } from 'vitest'
import {
  buildAuditReport,
  buildDriftReport,
  computeReadiness,
  detectDrift,
  extractDocLoopIds,
  READY_STRONG,
  READY_THRESHOLD,
  type DriftFs,
} from './drift.js'
import type { LoopEntry, LoopRegistry } from './types.js'

const NOW = new Date('2026-07-07T12:00:00Z')

function loop(over: Partial<LoopEntry> = {}): LoopEntry {
  return {
    id: 'loop-be', name: 'BE loop', kind: 'orchestrator', goal: 'x'.repeat(40), cadence: '1h',
    risk: 'medium', runner: 'cron', change_prefix: 'loop-be-', phases: ['a', 'b'],
    human_gates: ['g1', 'g2'], state: '.superpowers/loops/progress.md',
    design_doc: 'docs/loops/loop-be.md', status: 'active',
    budget: { max_runs_per_day: 24, max_in_flight: 1, on_exceed: 'skip', max_tokens_per_day: 100000 },
    kill_criteria: ['k1', 'k2'], autonomy_level: 'L1', ...over,
  }
}

function reg(...loops: LoopEntry[]): LoopRegistry {
  return { version: 1, loops }
}

/** 一条 run-log 行（5 列，note 可含 change=<name>）。 */
function row(ts: string, id: string, note = 'result=ok'): string {
  return `| ${ts} | ${id} | run | 0 | ${note} |`
}

const RUNLOG_HEADER = '| ts | loop | action | inflight | note |\n|----|------|--------|----------|------|'

// ── extractDocLoopIds ─────────────────────────────────────────────────────────

describe('extractDocLoopIds —— 从 LOOP.md ### 标题反引号 id', () => {
  test('提取 ### `id` 标题里的 loop id', () => {
    const doc = '# LOOP.md\n\n### `loop-be` — BE loop\n\n### `loop-fe` — FE loop\n'
    expect(extractDocLoopIds(doc)).toEqual(['loop-be', 'loop-fe'])
  })

  test('null / 无 ### 标题 → 空', () => {
    expect(extractDocLoopIds(null)).toEqual([])
    expect(extractDocLoopIds('# 无标题\n普通文本 loop-be 提及但非标题')).toEqual([])
  })

  test('去重', () => {
    expect(extractDocLoopIds('### `loop-be` a\n### `loop-be` b')).toEqual(['loop-be'])
  })
})

// ── detectDrift：7 维度 ────────────────────────────────────────────────────────

describe('detectDrift —— 漂移维度', () => {
  test('全对齐 → clean、无 items', () => {
    const doc = '### `loop-be` — BE'
    const runlog = `${RUNLOG_HEADER}\n${row('2026-07-07T11:30', 'loop-be')}`
    const r = detectDrift(reg(loop()), doc, runlog, NOW)
    expect(r.clean).toBe(true)
    expect(r.items).toEqual([])
  })

  test('mirror-missing：registry id 不在 LOOP.md → warn', () => {
    const runlog = `${RUNLOG_HEADER}\n${row('2026-07-07T11:30', 'loop-be')}`
    const r = detectDrift(reg(loop()), '### `loop-fe` 别的 loop', runlog, NOW)
    const it = r.items.find((i) => i.dimension === 'mirror-missing')
    expect(it).toBeDefined()
    expect(it!.loop).toBe('loop-be')
    expect(it!.severity).toBe('warn')
  })

  test('LOOP.md 缺失（null）→ mirror-missing 一条汇总 warn', () => {
    const r = detectDrift(reg(loop()), null, null, NOW)
    expect(r.items.some((i) => i.dimension === 'mirror-missing')).toBe(true)
  })

  test('mirror-orphan：LOOP.md 声明的 id 不在 registry → warn', () => {
    const doc = '### `loop-be` — BE\n### `ghost-loop` — 已删除但文档还在'
    const runlog = `${RUNLOG_HEADER}\n${row('2026-07-07T11:30', 'loop-be')}`
    const r = detectDrift(reg(loop()), doc, runlog, NOW)
    const it = r.items.find((i) => i.dimension === 'mirror-orphan')
    expect(it).toBeDefined()
    expect(it!.loop).toBe('ghost-loop')
  })

  test('runlog-orphan-id：run-log 记了未登记的 loop id → warn', () => {
    const doc = '### `loop-be` — BE'
    const runlog = `${RUNLOG_HEADER}\n${row('2026-07-07T11:30', 'loop-be')}\n${row('2026-07-07T11:40', 'loop-zombie')}`
    const r = detectDrift(reg(loop()), doc, runlog, NOW)
    const it = r.items.find((i) => i.dimension === 'runlog-orphan-id')
    expect(it).toBeDefined()
    expect(it!.loop).toBe('loop-zombie')
  })

  test('never-run：active + 有限 cadence 但流水零执行 → warn', () => {
    const doc = '### `loop-be` — BE'
    const r = detectDrift(reg(loop()), doc, `${RUNLOG_HEADER}`, NOW)
    const it = r.items.find((i) => i.dimension === 'never-run')
    expect(it).toBeDefined()
    expect(it!.loop).toBe('loop-be')
  })

  test('cadence-idle：声明 1h 但距上次执行 3h（>2×）→ warn', () => {
    const doc = '### `loop-be` — BE'
    // NOW = 12:00，上次 09:00 → 180 分钟 > 2×60
    const runlog = `${RUNLOG_HEADER}\n${row('2026-07-07T09:00', 'loop-be')}`
    const r = detectDrift(reg(loop()), doc, runlog, NOW)
    const it = r.items.find((i) => i.dimension === 'cadence-idle')
    expect(it).toBeDefined()
    expect(it!.detail).toMatch(/180|3/)
  })

  test('cadence-idle 不误报：距上次 90 分钟（<2×60）→ 无', () => {
    const doc = '### `loop-be` — BE'
    const runlog = `${RUNLOG_HEADER}\n${row('2026-07-07T10:30', 'loop-be')}`
    const r = detectDrift(reg(loop()), doc, runlog, NOW)
    expect(r.items.some((i) => i.dimension === 'cadence-idle')).toBe(false)
  })

  test('continuous cadence → 不做 idle/never-run 判定', () => {
    const doc = '### `loop-x` — X'
    const l = loop({ id: 'loop-x', cadence: 'continuous', change_prefix: null })
    const r = detectDrift(reg(l), doc, `${RUNLOG_HEADER}`, NOW)
    expect(r.items.some((i) => i.dimension === 'never-run')).toBe(false)
    expect(r.items.some((i) => i.dimension === 'cadence-idle')).toBe(false)
  })

  test('change-prefix：run-log change=<name> 与声明 prefix 不符 → warn', () => {
    const doc = '### `loop-be` — BE'
    const runlog = `${RUNLOG_HEADER}\n${row('2026-07-07T11:30', 'loop-be', 'result=ok change=loop-fe-3')}`
    const r = detectDrift(reg(loop()), doc, runlog, NOW)
    const it = r.items.find((i) => i.dimension === 'change-prefix')
    expect(it).toBeDefined()
    expect(it!.detail).toContain('loop-fe-3')
  })

  test('change-prefix 不误报：change=<prefix>* 匹配 → 无', () => {
    const doc = '### `loop-be` — BE'
    const runlog = `${RUNLOG_HEADER}\n${row('2026-07-07T11:30', 'loop-be', 'result=ok change=loop-be-7')}`
    const r = detectDrift(reg(loop()), doc, runlog, NOW)
    expect(r.items.some((i) => i.dimension === 'change-prefix')).toBe(false)
  })

  test('status-drift：paused 但今日仍有执行 → warn', () => {
    const doc = '### `loop-be` — BE'
    const runlog = `${RUNLOG_HEADER}\n${row('2026-07-07T11:30', 'loop-be')}`
    const r = detectDrift(reg(loop({ status: 'paused' })), doc, runlog, NOW)
    const it = r.items.find((i) => i.dimension === 'status-drift')
    expect(it).toBeDefined()
    expect(it!.loop).toBe('loop-be')
  })

  test('每个 drift item 都带非空 suggestion', () => {
    const runlog = `${RUNLOG_HEADER}\n${row('2026-07-07T09:00', 'loop-be', 'change=loop-fe-1')}\n${row('2026-07-07T09:10', 'ghost')}`
    const r = detectDrift(reg(loop()), '### `phantom` x', runlog, NOW)
    expect(r.items.length).toBeGreaterThan(0)
    for (const it of r.items) expect(it.suggestion.length).toBeGreaterThan(0)
  })
})

// ── computeReadiness：loop-ready 0-100 ─────────────────────────────────────────

describe('computeReadiness —— loop-ready 就绪评分', () => {
  test('满配 loop → 100、band=ready、零 suggestion', () => {
    const s = computeReadiness(loop())
    expect(s.score).toBe(100)
    expect(s.band).toBe('ready')
    expect(s.suggestions).toEqual([])
  })

  test('维度求和 = score，且各维度 score ≤ max', () => {
    const s = computeReadiness(loop())
    const sum = s.dimensions.reduce((a, d) => a + d.score, 0)
    expect(sum).toBe(s.score)
    for (const d of s.dimensions) expect(d.score).toBeLessThanOrEqual(d.max)
  })

  test('极简合法 loop（goal=10/gates=1/kill=1/无 token 预算/无 prefix）→ not-ready(<70)', () => {
    const s = computeReadiness(loop({
      goal: 'x'.repeat(10), human_gates: ['g'], kill_criteria: ['k'],
      change_prefix: null, budget: { max_runs_per_day: 24, max_in_flight: 1, on_exceed: 'skip' },
    }))
    expect(s.score).toBeLessThan(READY_THRESHOLD)
    expect(s.band).toBe('not-ready')
    expect(s.suggestions.length).toBeGreaterThan(0)
  })

  test('goal 空 → goal 维度 0 分 + 有 suggestion', () => {
    const s = computeReadiness(loop({ goal: '' }))
    const d = s.dimensions.find((x) => x.name === 'goal')!
    expect(d.score).toBe(0)
    expect(d.suggestion).not.toBeNull()
  })

  test('无 kill_criteria → kill 维度 0 分', () => {
    const s = computeReadiness(loop({ kill_criteria: [] }))
    expect(s.dimensions.find((x) => x.name === 'kill_criteria')!.score).toBe(0)
  })

  test('无 human_gates → gates 维度 0 分', () => {
    const s = computeReadiness(loop({ human_gates: [] }))
    expect(s.dimensions.find((x) => x.name === 'human_gates')!.score).toBe(0)
  })

  test('无 token 预算 → budget 维度不满分 + suggestion 提 max_tokens_per_day', () => {
    const s = computeReadiness(loop({ budget: { max_runs_per_day: 24, max_in_flight: 1, on_exceed: 'skip' } }))
    const d = s.dimensions.find((x) => x.name === 'budget')!
    expect(d.score).toBeLessThan(d.max)
    expect(d.suggestion).toMatch(/token|max_tokens_per_day/)
  })

  test('continuous cadence → cadence 维度不满分', () => {
    const d = computeReadiness(loop({ cadence: 'continuous' })).dimensions.find((x) => x.name === 'cadence')!
    expect(d.score).toBeLessThan(d.max)
  })

  test('band 分界：≥90 ready / ≥70 mostly-ready / <70 not-ready', () => {
    expect(READY_STRONG).toBe(90)
    expect(READY_THRESHOLD).toBe(70)
  })
})

// ── build 编排（fake fs）───────────────────────────────────────────────────────

function fakeFs(over: Partial<DriftFs> = {}): DriftFs {
  return {
    loadRegistry: () => ({ data: reg(loop()), errors: [] }),
    readRunLog: () => `${RUNLOG_HEADER}\n${row('2026-07-07T11:30', 'loop-be')}`,
    readLoopDoc: () => '### `loop-be` — BE',
    ...over,
  }
}

describe('buildDriftReport —— fs 注入编排', () => {
  test('全对齐 → clean、exit 0', () => {
    const { report, exitCode } = buildDriftReport('/repo', null, NOW, fakeFs())
    expect(exitCode).toBe(0)
    expect(report!.clean).toBe(true)
  })

  test('有 warn 漂移 → exit 1', () => {
    const { report, exitCode } = buildDriftReport('/repo', null, NOW, fakeFs({ readLoopDoc: () => '(无提及)' }))
    expect(exitCode).toBe(1)
    expect(report!.items.length).toBeGreaterThan(0)
  })

  test('registry 错误 → exit 3、report null', () => {
    const { report, exitCode, errors } = buildDriftReport('/repo', null, NOW, fakeFs({ loadRegistry: () => ({ data: null, errors: ['boom'] }) }))
    expect(exitCode).toBe(3)
    expect(report).toBeNull()
    expect(errors).toContain('boom')
  })

  test('registry 缺失 → exit 3', () => {
    const { exitCode } = buildDriftReport('/repo', null, NOW, fakeFs({ loadRegistry: () => ({ data: null, errors: [] }) }))
    expect(exitCode).toBe(3)
  })

  test('--loop 未知 id → exit 3', () => {
    const { exitCode } = buildDriftReport('/repo', 'ghost', NOW, fakeFs())
    expect(exitCode).toBe(3)
  })

  test('--loop 过滤：只报该 loop 的 item + checked 单元素', () => {
    const two = reg(loop(), loop({ id: 'loop-fe', change_prefix: 'loop-fe-' }))
    const { report } = buildDriftReport('/repo', 'loop-be', NOW, fakeFs({
      loadRegistry: () => ({ data: two, errors: [] }),
      readLoopDoc: () => '(空)',   // 两个都 mirror-missing
    }))
    expect(report!.checked).toEqual(['loop-be'])
    expect(report!.items.every((i) => i.loop === 'loop-be')).toBe(true)
  })
})

describe('buildAuditReport —— fs 注入编排', () => {
  test('满配 loop → 全 ready、exit 0', () => {
    const { report, exitCode } = buildAuditReport('/repo', null, NOW, fakeFs())
    expect(exitCode).toBe(0)
    expect(report!.scores[0]!.band).toBe('ready')
  })

  test('极简 loop（not-ready）→ exit 1', () => {
    const weak = loop({ goal: 'x'.repeat(10), human_gates: ['g'], kill_criteria: ['k'], change_prefix: null, budget: { max_runs_per_day: 24, max_in_flight: 1, on_exceed: 'skip' } })
    const { exitCode } = buildAuditReport('/repo', null, NOW, fakeFs({ loadRegistry: () => ({ data: reg(weak), errors: [] }) }))
    expect(exitCode).toBe(1)
  })

  test('registry 错误 → exit 3', () => {
    const { exitCode } = buildAuditReport('/repo', null, NOW, fakeFs({ loadRegistry: () => ({ data: null, errors: ['boom'] }) }))
    expect(exitCode).toBe(3)
  })

  test('--loop 未知 → exit 3', () => {
    const { exitCode } = buildAuditReport('/repo', 'ghost', NOW, fakeFs())
    expect(exitCode).toBe(3)
  })
})
