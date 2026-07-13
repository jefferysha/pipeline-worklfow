/**
 * loops graduation —— 分级放权 L1→L3 毕业制升降档裁决（mock 层快速回归）。
 * 真实对位在 cli/src/loops-graduation.integration.test.ts（真 fs 全链）。
 * 覆盖：decideGraduation（升档准入 / 降档信号 / 绝不跨级 / L3 天花板）、planLevelChange（逐级毕业 +
 * 安全降档 + 跨级拒绝）、parseRunHistory（run-log 轮次/连败）、setAutonomyLevelInYaml（surgical 改档）、
 * applyLevelChange 写回 CAS（读-判-写并发拒绝；fake fs 注入模拟读写间隙的并发写者）。
 */
import { describe, expect, test } from 'vitest'
import {
  applyLevelChange,
  decideGraduation,
  planLevelChange,
  parseRunHistory,
  setAutonomyLevelInYaml,
  MIN_L2_RUNS_FOR_L3,
  type GraduationFs,
  type GraduationInputs,
  type GraduationHistory,
} from './graduation.js'
import { READY_STRONG, READY_THRESHOLD, type DriftItem, type ReadinessScore } from './drift.js'
import type { BreakerState, BudgetStatus } from './budget.js'
import type { AutonomyLevel, LoopEntry, LoopRegistry } from './types.js'

function loop(over: Partial<LoopEntry> = {}): LoopEntry {
  return {
    id: 'loop-be', name: 'BE loop', kind: 'orchestrator', goal: 'x'.repeat(40), cadence: '1h',
    risk: 'medium', runner: 'cron', change_prefix: 'loop-be-', phases: ['a', 'b'], human_gates: ['g1', 'g2'],
    state: '.superpowers/loops/progress.md', design_doc: 'd', status: 'active',
    budget: { max_runs_per_day: 24, max_in_flight: 1, on_exceed: 'skip', max_tokens_per_day: 100000 },
    kill_criteria: ['k1', 'k2'], autonomy_level: 'L1', allowlist: [], denylist: [], ...over,
  }
}

function readiness(score: number): ReadinessScore {
  return {
    id: 'loop-be', score,
    band: score >= READY_STRONG ? 'ready' : score >= READY_THRESHOLD ? 'mostly-ready' : 'not-ready',
    dimensions: [], suggestions: [],
  }
}

function budget(breaker: BreakerState): BudgetStatus {
  return {
    id: 'loop-be', hasBudget: true, maxTokensPerDay: 100000, warnThreshold: 80000,
    spentToday: breaker === 'tripped' ? 100000 : breaker === 'warn' ? 85000 : 1000,
    remaining: 0, usedRatio: 0, runsToday: 1, breaker, onExceed: 'skip',
    autonomyLevel: 'L1', reportOnly: true, reason: '',
  }
}

function driftItem(dimension: DriftItem['dimension'] = 'cadence-idle'): DriftItem {
  return { loop: 'loop-be', dimension, severity: 'warn', detail: 'drift', suggestion: 'fix' }
}

function history(runs: number, failStreak = 0): GraduationHistory {
  return { runs, failStreak, lastResult: failStreak > 0 ? 'fail' : 'ok' }
}

function inputs(over: Partial<GraduationInputs> = {}): GraduationInputs {
  return {
    loop: loop(),
    readiness: readiness(95),
    drift: [],
    budget: budget('ok'),
    history: history(3),
    ...over,
  }
}

describe('decideGraduation —— 升档准入', () => {
  test('L1 就绪高（≥70）+ 无漂移 + 熔断 ok + 无连败 → canGraduate、recommended=L2', () => {
    const v = decideGraduation(inputs({ loop: loop({ autonomy_level: 'L1' }), readiness: readiness(80) }))
    expect(v.current).toBe('L1')
    expect(v.canGraduate).toBe(true)
    expect(v.recommended).toBe('L2')
    expect(v.blockers).toEqual([])
    expect(v.demotionReason).toBeNull()
  })

  test('L1 就绪不足（<70）→ blocked、recommended 保持 L1', () => {
    const v = decideGraduation(inputs({ loop: loop({ autonomy_level: 'L1' }), readiness: readiness(55) }))
    expect(v.canGraduate).toBe(false)
    expect(v.recommended).toBe('L1')
    expect(v.blockers.join(' ')).toMatch(/55/)
    expect(v.blockers.some((b) => b.includes('70'))).toBe(true)
  })

  test('L1 就绪高但有活跃漂移 → blocked（漂移未清不许升）', () => {
    const v = decideGraduation(inputs({ loop: loop({ autonomy_level: 'L1' }), drift: [driftItem()] }))
    expect(v.canGraduate).toBe(false)
    expect(v.blockers.some((b) => /漂移/.test(b))).toBe(true)
    // L1 无更低档可降 → demotionReason null（即便有漂移）
    expect(v.demotionReason).toBeNull()
    expect(v.recommended).toBe('L1')
  })

  test('L2→L3 需就绪 ≥90 且满足最小 L2 运行历史', () => {
    const ok = decideGraduation(inputs({
      loop: loop({ autonomy_level: 'L2' }), readiness: readiness(90), history: history(MIN_L2_RUNS_FOR_L3),
    }))
    expect(ok.canGraduate).toBe(true)
    expect(ok.recommended).toBe('L3')

    const lowScore = decideGraduation(inputs({
      loop: loop({ autonomy_level: 'L2' }), readiness: readiness(89), history: history(MIN_L2_RUNS_FOR_L3),
    }))
    expect(lowScore.canGraduate).toBe(false)
    expect(lowScore.blockers.some((b) => b.includes('90'))).toBe(true)
  })

  test('L2→L3 运行历史不足 → blocked（含历史 blocker）', () => {
    const v = decideGraduation(inputs({
      loop: loop({ autonomy_level: 'L2' }), readiness: readiness(100), history: history(MIN_L2_RUNS_FOR_L3 - 1),
    }))
    expect(v.canGraduate).toBe(false)
    expect(v.blockers.some((b) => /历史|轮/.test(b))).toBe(true)
    expect(v.recommended).toBe('L2')
  })

  test('L3 天花板 → canGraduate=false、blockers 含最高档说明', () => {
    const v = decideGraduation(inputs({ loop: loop({ autonomy_level: 'L3' }), readiness: readiness(100), history: history(10) }))
    expect(v.canGraduate).toBe(false)
    expect(v.recommended).toBe('L3')
    expect(v.blockers.some((b) => /L3|最高/.test(b))).toBe(true)
  })
})

describe('decideGraduation —— 降档信号（drift / budget tripped / fail_streak）', () => {
  test('L2 熔断 tripped → 降档信号、recommended=L1（逐级）', () => {
    const v = decideGraduation(inputs({ loop: loop({ autonomy_level: 'L2' }), budget: budget('tripped') }))
    expect(v.demotionReason).not.toBeNull()
    expect(v.demotionReason).toMatch(/breaker|熔断/)
    expect(v.recommended).toBe('L1')
    expect(v.canGraduate).toBe(false)
  })

  test('L2 连败（fail_streak≥WARN）→ 降档信号', () => {
    const v = decideGraduation(inputs({ loop: loop({ autonomy_level: 'L2' }), history: history(5, 2) }))
    expect(v.demotionReason).toMatch(/连败|fail/)
    expect(v.recommended).toBe('L1')
  })

  test('L3 活跃漂移 → 降档信号、recommended=L2（逐级降）', () => {
    const v = decideGraduation(inputs({
      loop: loop({ autonomy_level: 'L3' }), readiness: readiness(100), history: history(10), drift: [driftItem('status-drift')],
    }))
    expect(v.demotionReason).toMatch(/漂移/)
    expect(v.recommended).toBe('L2')
  })

  test('降档优先于升档：即便就绪高，有降档信号也不 canGraduate', () => {
    const v = decideGraduation(inputs({
      loop: loop({ autonomy_level: 'L2' }), readiness: readiness(100), history: history(10), budget: budget('tripped'),
    }))
    expect(v.canGraduate).toBe(false)
    expect(v.recommended).toBe('L1')
  })
})

describe('planLevelChange —— 逐级毕业 + 安全降档 + 跨级拒绝', () => {
  const readyVerdict = (current: AutonomyLevel, can: boolean) =>
    decideGraduation(inputs({
      loop: loop({ autonomy_level: current }),
      readiness: readiness(can ? 100 : 40),
      history: history(can ? 10 : 0),
    }))

  test('L1 set L2 且准入通过 → promote allowed', () => {
    const p = planLevelChange('L1', 'L2', readyVerdict('L1', true))
    expect(p.kind).toBe('promote')
    expect(p.allowed).toBe(true)
    expect(p.to).toBe('L2')
  })

  test('L1 set L2 但准入未过 → reject-blocked', () => {
    const p = planLevelChange('L1', 'L2', readyVerdict('L1', false))
    expect(p.kind).toBe('reject-blocked')
    expect(p.allowed).toBe(false)
    expect(p.blockers.length).toBeGreaterThan(0)
  })

  test('L1 set L3（一步跨 2 级）→ reject-cross-level（绝不跨级）', () => {
    const p = planLevelChange('L1', 'L3', readyVerdict('L1', true))
    expect(p.kind).toBe('reject-cross-level')
    expect(p.allowed).toBe(false)
    expect(p.to).toBeNull()
  })

  test('L3 set L1（安全降档）→ demote allowed（降档总允许）', () => {
    const p = planLevelChange('L3', 'L1', readyVerdict('L3', false))
    expect(p.kind).toBe('demote')
    expect(p.allowed).toBe(true)
    expect(p.to).toBe('L1')
  })

  test('L1 set L1 → noop', () => {
    const p = planLevelChange('L1', 'L1', readyVerdict('L1', true))
    expect(p.kind).toBe('noop')
  })

  test('未知目标档 → reject-unknown-level', () => {
    const p = planLevelChange('L1', 'L9', readyVerdict('L1', true))
    expect(p.kind).toBe('reject-unknown-level')
    expect(p.allowed).toBe(false)
  })
})

describe('parseRunHistory —— run-log 轮次 + 连败', () => {
  const H = '| ts | loop | action | inflight | note |\n|----|------|--------|----------|------|'
  const row = (id: string, res: string) => `| 2026-07-06T09:00 | ${id} | run | 0 | result=${res} |`

  test('三轮全 ok → runs=3、failStreak=0', () => {
    const text = [H, row('loop-be', 'ok'), row('loop-be', 'ok'), row('loop-be', 'ok')].join('\n')
    expect(parseRunHistory(text, 'loop-be')).toMatchObject({ runs: 3, failStreak: 0 })
  })

  test('尾部两连败 → failStreak=2', () => {
    const text = [H, row('loop-be', 'ok'), row('loop-be', 'fail'), row('loop-be', 'fail')].join('\n')
    const h = parseRunHistory(text, 'loop-be')
    expect(h.runs).toBe(3)
    expect(h.failStreak).toBe(2)
    expect(h.lastResult).toBe('fail')
  })

  test('只计该 loop 的行；表头/分隔行不计', () => {
    const text = [H, row('loop-be', 'ok'), row('loop-fe', 'ok')].join('\n')
    expect(parseRunHistory(text, 'loop-be').runs).toBe(1)
  })

  test('null → runs=0', () => {
    expect(parseRunHistory(null, 'loop-be')).toMatchObject({ runs: 0, failStreak: 0 })
  })
})

describe('setAutonomyLevelInYaml —— surgical 改档（保留其余格式）', () => {
  const yaml = [
    'version: 1',
    'loops:',
    '  - id: loop-be',
    '    name: BE loop',
    '    autonomy_level: L1',
    '    kill_criteria:',
    '      - k1',
    '  - id: loop-fe',
    '    name: FE loop',
  ].join('\n')

  test('已有 autonomy_level → 就地替换', () => {
    const r = setAutonomyLevelInYaml(yaml, 'loop-be', 'L2')
    expect(r.error).toBeNull()
    expect(r.text).toContain('    autonomy_level: L2')
    expect(r.text).not.toContain('autonomy_level: L1')
    // 不动 loop-fe / 其它字段
    expect(r.text).toContain('  - id: loop-fe')
    expect(r.text).toContain('      - k1')
  })

  test('无 autonomy_level → 在该 loop 块内插入（缩进对齐字段）', () => {
    const noLevel = [
      'version: 1', 'loops:', '  - id: loop-be', '    name: BE loop', '  - id: loop-fe', '    name: FE loop',
    ].join('\n')
    const r = setAutonomyLevelInYaml(noLevel, 'loop-be', 'L2')
    expect(r.error).toBeNull()
    expect(r.text).toMatch(/  - id: loop-be[\s\S]*    autonomy_level: L2[\s\S]*  - id: loop-fe/)
  })

  test('未知 loop id → error、text=null', () => {
    const r = setAutonomyLevelInYaml(yaml, 'ghost', 'L2')
    expect(r.text).toBeNull()
    expect(r.error).not.toBeNull()
  })
})

describe('applyLevelChange —— 写回 CAS（读-判-写；对齐 server applyLoopsUpdate / cli loops init 先例）', () => {
  const YAML = [
    'version: 1',
    'loops:',
    '  - id: loop-be',
    '    name: BE loop',
    '    autonomy_level: L2',
  ].join('\n')

  /**
   * fake GraduationFs：state.file 模拟盘上 loops.yaml 原文；afterRead(第几次读) 钩子在每次
   * readRegistryText 之后触发——用它在「初读」与「写回」的间隙注入并发写者（另一进程改档/
   * 人工编辑/删除）。writes 记录全部落盘，断言「拒绝 = 未写盘」。
   */
  function fakeGradFs(registry: LoopRegistry, initialText: string) {
    const state = {
      file: initialText as string | null,
      reads: 0,
      writes: [] as string[],
      afterRead: (_nth: number) => {},
    }
    const fs: GraduationFs = {
      loadRegistry: () => ({ data: registry, errors: [] }),
      readRunLog: () => null,
      readLoopDoc: () => null,
      readRegistryText: () => {
        const t = state.file
        state.reads += 1
        state.afterRead(state.reads)
        return t
      },
      writeRegistryText: (_root, text) => {
        state.writes.push(text)
        state.file = text
      },
    }
    return { fs, state }
  }

  // 走 demote（L2→L1 安全降档总允许）——准入门与 CAS 正交，测试不依赖 readiness/历史凑数。
  const registry = (): LoopRegistry => ({ version: 1, loops: [loop({ autonomy_level: 'L2' })] })
  const OPTS = { now: new Date('2026-07-06T00:00:00Z'), confirm: true }

  test('无并发改动 → 照常落盘（读到什么写回什么，非并发路径行为零变）', () => {
    const { fs, state } = fakeGradFs(registry(), YAML)
    const res = applyLevelChange('/repo', 'loop-be', 'L1', OPTS, fs)
    expect(res.applied).toBe(true)
    expect(res.exitCode).toBe(0)
    expect(res.errors).toEqual([])
    expect(state.writes).toHaveLength(1)
    expect(state.writes[0]).toContain('autonomy_level: L1')
    // 评审 nit:钉住成功路径也确实执行了 CAS 重读(初读 + 写前复检 = 恰 2 次)
    expect(state.reads).toBe(2)
  })

  test('初读与写回之间被并发修改 → CAS 拒绝：不写盘、errors 含 CAS 文案、exit 3', () => {
    const { fs, state } = fakeGradFs(registry(), YAML)
    state.afterRead = (nth) => {
      if (nth === 1) state.file = `${YAML}\n  - id: loop-new\n    name: 并发写者刚登记的` // 模拟另一进程追加
    }
    const res = applyLevelChange('/repo', 'loop-be', 'L1', OPTS, fs)
    expect(res.applied).toBe(false)
    expect(res.exitCode).toBe(3)
    expect(res.errors.join(' ')).toMatch(/CAS 失败/)
    expect(res.errors.join(' ')).toMatch(/并发修改/)
    expect(res.errors.join(' ')).toMatch(/未落盘/)
    expect(state.writes).toHaveLength(0) // 绝不盲写覆盖并发写者的改动
    expect(res.plan?.allowed).toBe(true) // 裁决本身通过——拒绝只因写回瞬间的并发
  })

  test('初读与写回之间文件被删除 → CAS 拒绝：不写盘、exit 3', () => {
    const { fs, state } = fakeGradFs(registry(), YAML)
    state.afterRead = (nth) => {
      if (nth === 1) state.file = null
    }
    const res = applyLevelChange('/repo', 'loop-be', 'L1', OPTS, fs)
    expect(res.applied).toBe(false)
    expect(res.exitCode).toBe(3)
    expect(res.errors.join(' ')).toMatch(/CAS 失败/)
    expect(res.errors.join(' ')).toMatch(/删除/)
    expect(state.writes).toHaveLength(0)
  })
})
