/**
 * loops 子命令 —— mock 层快速分支回归（TEST-REALITY.md：真实对位在 loops.integration.test.ts）。
 * 覆盖 dispatch / list / enforce / status 全分支 + --json + --loop + 错误路径（registry 缺失/坏）。
 * fs 经注入的 fake LoopsFs（避免真 fs——真 fs 面在 integration）。
 */
import { describe, expect, test } from 'vitest'
import { makeDeps } from '../test-support.js'
import { cmdLoops, type DriftFs, type GraduationFs, type LoopsFs } from './loops.js'
import type { LoopEntry } from './loops.js'

function loop(over: Partial<LoopEntry> = {}): LoopEntry {
  return {
    id: 'loop-be', name: 'BE loop', kind: 'orchestrator', goal: 'x'.repeat(12), cadence: '1h',
    risk: 'medium', runner: 'cron', change_prefix: 'loop-be-', phases: ['a', 'b'], human_gates: ['g'],
    state: '.superpowers/loops/progress.md', design_doc: 'd', status: 'active',
    budget: { max_runs_per_day: 24, max_in_flight: 1, on_exceed: 'skip' }, kill_criteria: ['k'],
    autonomy_level: 'L1', allowlist: [], denylist: [], ...over,
  }
}

function fakeFs(over: Partial<LoopsFs> = {}): LoopsFs {
  return {
    loadRegistry: () => ({ data: { version: 1, loops: [loop()] }, errors: [] }),
    readProgress: () => null,
    listChanges: () => [],
    readChangeFields: () => null,
    readSandboxFields: () => null,
    ...over,
  }
}

describe('dispatch', () => {
  test('未知子命令 → stderr + exit 1', async () => {
    const deps = makeDeps()
    expect(await cmdLoops(deps, 'bogus', [], fakeFs())).toBe(1)
    expect(deps.errLines.join('\n')).toContain('未知 loops 子命令')
  })
})

describe('list —— 登记表', () => {
  test('text：逐 loop 行含 id/kind/status/autonomy', async () => {
    const deps = makeDeps()
    expect(await cmdLoops(deps, 'list', [], fakeFs())).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('loop-be')
    expect(out).toContain('orchestrator')
    expect(out).toContain('L1')
  })

  test('--json：完整 registry 可 JSON.parse', async () => {
    const deps = makeDeps()
    expect(await cmdLoops(deps, 'list', ['--json'], fakeFs())).toBe(0)
    const parsed = JSON.parse(deps.outLines.join('\n'))
    expect(parsed.version).toBe(1)
    expect(parsed.loops[0].id).toBe('loop-be')
  })

  test('registry 缺失（data null, errors 空）→ 提示 + exit 0', async () => {
    const deps = makeDeps()
    expect(await cmdLoops(deps, 'list', [], fakeFs({ loadRegistry: () => ({ data: null, errors: [] }) }))).toBe(0)
    expect(deps.outLines.join('\n')).toMatch(/no|无|registry/i)
  })

  test('registry 校验错误 → stderr 定位错误 + exit 1', async () => {
    const deps = makeDeps()
    expect(await cmdLoops(deps, 'list', [], fakeFs({ loadRegistry: () => ({ data: null, errors: ['loops[0].name: missing'] }) }))).toBe(1)
    expect(deps.errLines.join('\n')).toContain('loops[0].name')
  })
})

describe('enforce —— 裁决出 verdict + exit code（对齐老仓 0/1/2/3）', () => {
  test('全绿 → exit 0、verdict=ok', async () => {
    const deps = makeDeps()
    expect(await cmdLoops(deps, 'enforce', [], fakeFs())).toBe(0)
    expect(deps.outLines.join('\n')).toContain('ok')
  })

  test('在途满 → R8 warn → exit 1', async () => {
    const deps = makeDeps()
    const code = await cmdLoops(deps, 'enforce', [], fakeFs({
      listChanges: (_r, p) => (p === 'loop-be-' ? ['loop-be-1'] : []),
      readChangeFields: () => ({ automation: 'running' }),
    }))
    expect(code).toBe(1)
    expect(deps.outLines.join('\n')).toContain('warn')
  })

  test('kill 判据命中（status=paused）→ exit 2', async () => {
    const deps = makeDeps()
    const code = await cmdLoops(deps, 'enforce', [], fakeFs({
      loadRegistry: () => ({ data: { version: 1, loops: [loop({ status: 'paused' })] }, errors: [] }),
    }))
    expect(code).toBe(2)
    expect(deps.outLines.join('\n')).toContain('kill')
  })

  test('--json：报告含 verdicts + autonomy/enforcement 字段', async () => {
    const deps = makeDeps()
    await cmdLoops(deps, 'enforce', ['--json'], fakeFs())
    const rep = JSON.parse(deps.outLines.join('\n'))
    expect(rep.verdicts[0].id).toBe('loop-be')
    expect(rep.verdicts[0].enforcement).toBe('report-only')
    expect(rep.verdicts[0].report_only).toBe(true)
  })

  test('--loop 过滤未知 id → exit 3 错误', async () => {
    const deps = makeDeps()
    expect(await cmdLoops(deps, 'enforce', ['--loop', 'ghost'], fakeFs())).toBe(3)
  })

  test('registry 错误 → stderr + exit 3', async () => {
    const deps = makeDeps()
    expect(await cmdLoops(deps, 'enforce', [], fakeFs({ loadRegistry: () => ({ data: null, errors: ['boom'] }) }))).toBe(3)
    expect(deps.errLines.join('\n')).toContain('boom')
  })
})

describe('status —— 概览', () => {
  test('逐 loop 汇总 status + verdict + enforcement', async () => {
    const deps = makeDeps()
    expect(await cmdLoops(deps, 'status', [], fakeFs())).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('loop-be')
    expect(out).toMatch(/ok|warn|kill/)
    expect(out).toContain('report-only')
  })
})

// ── #36 budget/cost 子命令（token 预算 + circuit breaker + 成本估算）─────────────

/** 一条 run-log 行（progress.md 5 列；note 内含 tokens=）。 */
function tokenRow(ts: string, id: string, tokens: number): string {
  return `| ${ts} | ${id} | run | 0 | result=ok tokens=${tokens} |`
}

/** 带 token 预算的 loop（LoopEntry.budget 追加可选 max_tokens_per_day/tokens_per_run）。 */
function budgetLoop(maxTokens?: number, over: Partial<LoopEntry> = {}): LoopEntry {
  return loop({ budget: { max_runs_per_day: 24, max_in_flight: 1, on_exceed: 'skip', max_tokens_per_day: maxTokens }, ...over })
}

describe('budget —— circuit breaker 状态（预算/花费/剩余）', () => {
  test('未熔断（花费 < 80%）→ exit 0、输出含 breaker/ok + 花费数', async () => {
    const deps = makeDeps()
    const code = await cmdLoops(deps, 'budget', ['loop-be'], fakeFs({
      loadRegistry: () => ({ data: { version: 1, loops: [budgetLoop(100000)] }, errors: [] }),
      readProgress: () => [tokenRow('2026-07-06T09:00', 'loop-be', 50000)].join('\n'),
    }))
    expect(code).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('loop-be')
    expect(out).toMatch(/ok/)
    expect(out).toContain('50000')
  })

  test('花费超阈值 → 熔断 tripped → exit 2', async () => {
    const deps = makeDeps()
    const code = await cmdLoops(deps, 'budget', ['loop-be'], fakeFs({
      loadRegistry: () => ({ data: { version: 1, loops: [budgetLoop(10000)] }, errors: [] }),
      readProgress: () => [tokenRow('2026-07-06T09:00', 'loop-be', 12000)].join('\n'),
    }))
    expect(code).toBe(2)
    expect(deps.outLines.join('\n')).toMatch(/tripped|熔断/)
  })

  test('--json：报告含 statuses + breaker + remaining', async () => {
    const deps = makeDeps()
    await cmdLoops(deps, 'budget', ['--json'], fakeFs({
      loadRegistry: () => ({ data: { version: 1, loops: [budgetLoop(100000)] }, errors: [] }),
      readProgress: () => [tokenRow('2026-07-06T09:00', 'loop-be', 50000)].join('\n'),
    }))
    const rep = JSON.parse(deps.outLines.join('\n'))
    expect(rep.statuses[0].id).toBe('loop-be')
    expect(rep.statuses[0].breaker).toBe('ok')
    expect(rep.statuses[0].remaining).toBe(50000)
  })

  test('未知 --loop id → exit 3', async () => {
    const deps = makeDeps()
    expect(await cmdLoops(deps, 'budget', ['ghost'], fakeFs())).toBe(3)
  })

  test('registry 错误 → stderr + exit 3', async () => {
    const deps = makeDeps()
    expect(await cmdLoops(deps, 'budget', [], fakeFs({ loadRegistry: () => ({ data: null, errors: ['boom'] }) }))).toBe(3)
    expect(deps.errLines.join('\n')).toContain('boom')
  })
})

describe('cost —— 成本估算（cadence×pattern）', () => {
  test('估算在预算内 → exit 0、输出含预估 token/日', async () => {
    const deps = makeDeps()
    const code = await cmdLoops(deps, 'cost', ['loop-be'], fakeFs({
      loadRegistry: () => ({ data: { version: 1, loops: [budgetLoop(300000, { cadence: '1h', risk: 'medium' })] }, errors: [] }),
    }))
    expect(code).toBe(0)
    expect(deps.outLines.join('\n')).toContain('192000') // 24×8000
  })

  test('估算超预算 → exit 1', async () => {
    const deps = makeDeps()
    const code = await cmdLoops(deps, 'cost', [], fakeFs({
      loadRegistry: () => ({ data: { version: 1, loops: [budgetLoop(100000, { cadence: '1h', risk: 'high' })] }, errors: [] }),
    }))
    expect(code).toBe(1)
  })

  test('--json：报告含 estimates + estimatedTokensPerDay', async () => {
    const deps = makeDeps()
    await cmdLoops(deps, 'cost', ['--json'], fakeFs({
      loadRegistry: () => ({ data: { version: 1, loops: [budgetLoop(300000, { cadence: '1h', risk: 'medium' })] }, errors: [] }),
    }))
    const rep = JSON.parse(deps.outLines.join('\n'))
    expect(rep.estimates[0].estimatedTokensPerDay).toBe(192000)
    expect(rep.estimates[0].runsPerDay).toBe(24)
  })
})

// ── #37 drift/audit 子命令（漂移检测 + loop-ready 就绪评分）──────────────────────

const DRIFT_HEADER = '| ts | loop | action | inflight | note |\n|----|------|--------|----------|------|'

/** 满配 loop（loop-ready 100）：goal≥30 / kill≥2 / gates≥2 / token 预算 / 有限 cadence / prefix / 全 doc。 */
function richLoop(over: Partial<LoopEntry> = {}): LoopEntry {
  return loop({
    goal: 'x'.repeat(40), kill_criteria: ['k1', 'k2'], human_gates: ['g1', 'g2'],
    budget: { max_runs_per_day: 24, max_in_flight: 1, on_exceed: 'skip', max_tokens_per_day: 100000 },
    cadence: '1h', change_prefix: 'loop-be-', design_doc: 'docs/loops/loop-be.md',
    state: '.superpowers/loops/progress.md', ...over,
  })
}

/** fake DriftFs（第 5 参注入）：registry + run-log + LOOP.md 镜像。makeDeps clock=2026-07-06T00:00Z。 */
function fakeDriftFs(over: Partial<DriftFs> = {}): DriftFs {
  return {
    loadRegistry: () => ({ data: { version: 1, loops: [richLoop()] }, errors: [] }),
    readRunLog: () => `${DRIFT_HEADER}\n| 2026-07-05T23:30 | loop-be | run | 0 | result=ok |`,
    readLoopDoc: () => '### `loop-be` — BE loop',
    ...over,
  }
}

describe('drift —— 漂移检测（loop-sync）', () => {
  test('对齐 → CLEAN、exit 0', async () => {
    const deps = makeDeps()
    const code = await cmdLoops(deps, 'drift', [], fakeFs(), fakeDriftFs())
    expect(code).toBe(0)
    expect(deps.outLines.join('\n')).toMatch(/CLEAN|无漂移/)
  })

  test('mirror-missing：LOOP.md 未提及 → warn、exit 1', async () => {
    const deps = makeDeps()
    const code = await cmdLoops(deps, 'drift', [], fakeFs(), fakeDriftFs({ readLoopDoc: () => '(无提及)' }))
    expect(code).toBe(1)
    expect(deps.outLines.join('\n')).toContain('mirror-missing')
  })

  test('--json：报告含 items + dimension', async () => {
    const deps = makeDeps()
    await cmdLoops(deps, 'drift', ['--json'], fakeFs(), fakeDriftFs({ readLoopDoc: () => '(无提及)' }))
    const rep = JSON.parse(deps.outLines.join('\n'))
    expect(rep.items[0].dimension).toBe('mirror-missing')
    expect(rep.checked).toContain('loop-be')
  })

  test('未知 --loop → exit 3', async () => {
    const deps = makeDeps()
    expect(await cmdLoops(deps, 'drift', ['ghost'], fakeFs(), fakeDriftFs())).toBe(3)
  })

  test('registry 错误 → stderr + exit 3', async () => {
    const deps = makeDeps()
    expect(await cmdLoops(deps, 'drift', [], fakeFs(), fakeDriftFs({ loadRegistry: () => ({ data: null, errors: ['boom'] }) }))).toBe(3)
    expect(deps.errLines.join('\n')).toContain('boom')
  })
})

describe('audit —— loop-ready 就绪评分（loop-audit）', () => {
  test('满配 loop → ready、exit 0', async () => {
    const deps = makeDeps()
    const code = await cmdLoops(deps, 'audit', [], fakeFs(), fakeDriftFs())
    expect(code).toBe(0)
    const out = deps.outLines.join('\n')
    expect(out).toContain('loop-be')
    expect(out).toMatch(/score=/)
  })

  test('极简 loop（not-ready）→ exit 1 + 建议', async () => {
    const deps = makeDeps()
    const weak = loop({
      goal: 'x'.repeat(10), human_gates: ['g'], kill_criteria: ['k'], change_prefix: null,
      budget: { max_runs_per_day: 24, max_in_flight: 1, on_exceed: 'skip' },
    })
    const code = await cmdLoops(deps, 'audit', [], fakeFs(), fakeDriftFs({ loadRegistry: () => ({ data: { version: 1, loops: [weak] }, errors: [] }) }))
    expect(code).toBe(1)
    expect(deps.outLines.join('\n')).toMatch(/not-ready/)
  })

  test('--json：报告含 scores + band + dimensions', async () => {
    const deps = makeDeps()
    await cmdLoops(deps, 'audit', ['--json'], fakeFs(), fakeDriftFs())
    const rep = JSON.parse(deps.outLines.join('\n'))
    expect(rep.scores[0].id).toBe('loop-be')
    expect(rep.scores[0].score).toBe(100)
    expect(rep.scores[0].band).toBe('ready')
  })

  test('未知 --loop → exit 3', async () => {
    const deps = makeDeps()
    expect(await cmdLoops(deps, 'audit', ['ghost'], fakeFs(), fakeDriftFs())).toBe(3)
  })
})

// ── #38 graduate / level 子命令（分级放权 L1→L3 毕业制）──────────────────────────
// makeDeps clock = 2026-07-06T00:00Z；richLoop 满配（score 100），run-log 近期（不 idle），LOOP.md 同步。

/** fake GraduationFs（第 6 参注入）：registry + run-log + LOOP.md + loops.yaml 原文读写。 */
function fakeGradFs(over: Partial<GraduationFs> = {}): GraduationFs {
  return {
    loadRegistry: () => ({ data: { version: 1, loops: [richLoop()] }, errors: [] }),
    readRunLog: () => `${DRIFT_HEADER}\n| 2026-07-05T23:00 | loop-be | run | 0 | result=ok |`,
    readLoopDoc: () => '### `loop-be` — BE loop',
    readRegistryText: () => 'version: 1\nloops:\n  - id: loop-be\n    name: BE loop\n    autonomy_level: L1\n',
    writeRegistryText: () => {},
    ...over,
  }
}

describe('graduate —— 升档准入裁决', () => {
  test('L1 满配 + 镜像同步 + 熔断 ok → canGraduate=true 荐升 L2、exit 1', async () => {
    const deps = makeDeps()
    const code = await cmdLoops(deps, 'graduate', ['--json'], fakeFs(), fakeDriftFs(), fakeGradFs())
    expect(code).toBe(1)
    const v = JSON.parse(deps.outLines.join('\n')).verdicts[0]
    expect(v.current).toBe('L1')
    expect(v.canGraduate).toBe(true)
    expect(v.recommended).toBe('L2')
  })

  test('text 输出含 current/recommended', async () => {
    const deps = makeDeps()
    await cmdLoops(deps, 'graduate', [], fakeFs(), fakeDriftFs(), fakeGradFs())
    expect(deps.outLines.join('\n')).toContain('loop-be')
  })

  test('未知 --loop → exit 3', async () => {
    const deps = makeDeps()
    expect(await cmdLoops(deps, 'graduate', ['ghost'], fakeFs(), fakeDriftFs(), fakeGradFs())).toBe(3)
  })

  test('registry 错误 → stderr + exit 3', async () => {
    const deps = makeDeps()
    const code = await cmdLoops(deps, 'graduate', [], fakeFs(), fakeDriftFs(),
      fakeGradFs({ loadRegistry: () => ({ data: null, errors: ['boom'] }) }))
    expect(code).toBe(3)
    expect(deps.errLines.join('\n')).toContain('boom')
  })
})

describe('level —— 查看 + set 逐级毕业写回', () => {
  test('view：打印 current + recommended', async () => {
    const deps = makeDeps()
    const code = await cmdLoops(deps, 'level', ['loop-be'], fakeFs(), fakeDriftFs(), fakeGradFs())
    expect(code).toBe(0)
    expect(deps.outLines.join('\n')).toMatch(/current=L1/)
  })

  test('set L2 --confirm（准入通过）→ writeRegistryText 落盘含 L2、exit 0', async () => {
    const deps = makeDeps()
    const writes: string[] = []
    const code = await cmdLoops(deps, 'level', ['loop-be', 'set', 'L2', '--confirm'], fakeFs(), fakeDriftFs(),
      fakeGradFs({ writeRegistryText: (_r, t) => { writes.push(t) } }))
    expect(code).toBe(0)
    expect(writes).toHaveLength(1)
    expect(writes[0]).toContain('autonomy_level: L2')
  })

  test('set L2 无 --confirm → dry-run 不写', async () => {
    const deps = makeDeps()
    const writes: string[] = []
    const code = await cmdLoops(deps, 'level', ['loop-be', 'set', 'L2'], fakeFs(), fakeDriftFs(),
      fakeGradFs({ writeRegistryText: (_r, t) => { writes.push(t) } }))
    expect(code).toBe(0)
    expect(writes).toHaveLength(0)
  })

  test('L1 set L3（跨级）→ 拒绝、exit≠0、不写', async () => {
    const deps = makeDeps()
    const writes: string[] = []
    const code = await cmdLoops(deps, 'level', ['loop-be', 'set', 'L3', '--confirm'], fakeFs(), fakeDriftFs(),
      fakeGradFs({ writeRegistryText: (_r, t) => { writes.push(t) } }))
    expect(code).not.toBe(0)
    expect(writes).toHaveLength(0)
    expect(deps.errLines.join('\n')).toMatch(/跨级|逐级/)
  })

  test('未知 loop → exit 3', async () => {
    const deps = makeDeps()
    expect(await cmdLoops(deps, 'level', ['ghost'], fakeFs(), fakeDriftFs(), fakeGradFs())).toBe(3)
  })
})
