/**
 * loops 子命令 —— mock 层快速分支回归（TEST-REALITY.md：真实对位在 loops.integration.test.ts）。
 * 覆盖 dispatch / list / enforce / status 全分支 + --json + --loop + 错误路径（registry 缺失/坏）。
 * fs 经注入的 fake LoopsFs（避免真 fs——真 fs 面在 integration）。
 */
import { describe, expect, test } from 'vitest'
import { makeDeps } from '../test-support.js'
import { cmdLoops, type LoopsFs } from './loops.js'
import type { LoopEntry } from './loops.js'

function loop(over: Partial<LoopEntry> = {}): LoopEntry {
  return {
    id: 'loop-be', name: 'BE loop', kind: 'orchestrator', goal: 'x'.repeat(12), cadence: '1h',
    risk: 'medium', runner: 'cron', change_prefix: 'loop-be-', phases: ['a', 'b'], human_gates: ['g'],
    state: '.superpowers/loops/progress.md', design_doc: 'd', status: 'active',
    budget: { max_runs_per_day: 24, max_in_flight: 1, on_exceed: 'skip' }, kill_criteria: ['k'],
    autonomy_level: 'L1', ...over,
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
