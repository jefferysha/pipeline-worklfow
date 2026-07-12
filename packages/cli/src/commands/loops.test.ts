/**
 * loops 子命令 —— mock 层快速分支回归（TEST-REALITY.md：真实对位在 loops.integration.test.ts）。
 * 覆盖 dispatch / list / enforce / status 全分支 + --json + --loop + 错误路径（registry 缺失/坏）。
 * fs 经注入的 fake LoopsFs（避免真 fs——真 fs 面在 integration）。
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createLoopsYamlText, loadRegistry } from '@pipeline-lite/kernel'
import { makeDeps } from '../test-support.js'
import {
  cmdInit, cmdLoops, derivePrefix, REAL_INIT_ENV,
  type DriftFs, type GraduationFs, type InitEnv, type LoopsFs, type Prompter,
} from './loops.js'
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

// ── loop-init：`pipeline loops init` 向导 + 非交互结构化通道（L3，真 fs 临时目录）──────────
// 本区块用真 fs 临时目录（区别于上方 mock 层分支回归）——init 的核心契约是「落真盘 + loadRegistry
// 读回」，唯有真 fs 能钉住写盘/CAS/草稿标记；CAS 并发与坏路径注入两例用内存 fake env（无法真并发）。

const GOAL_OK = '把 restyle 前缀的 change 编排跑通' // ≥10 字符

/** 内存 fake InitEnv：非交互，fs 用 Map，草稿标记记进数组。 */
function memInitEnv(seed: Record<string, string> = {}): {
  env: InitEnv; store: Map<string, string>; drafts: string[]
} {
  const store = new Map<string, string>(Object.entries(seed))
  const drafts: string[] = []
  const env: InitEnv = {
    fs: {
      readText: (path) => (store.has(path) ? store.get(path)! : null),
      createExclusive: (path, text) => {
        if (store.has(path)) { const e = new Error('EEXIST') as NodeJS.ErrnoException; e.code = 'EEXIST'; throw e }
        store.set(path, text)
      },
      overwrite: (path, text) => { store.set(path, text) },
    },
    addDraftMark: async (_path, id) => { drafts.push(id) },
    isInteractive: () => false,
    makePrompter: () => ({ ask: async () => '', close: () => {} }),
  }
  return { env, store, drafts }
}

/** 脚本化 Prompter：按注入顺序弹出应答（'' = 回车收默认）。 */
function scriptedPrompter(answers: string[]): Prompter {
  let i = 0
  return { ask: async () => answers[i++] ?? '', close: () => {} }
}

describe('loops init —— 非交互结构化通道（真 fs 临时目录）', () => {
  let root: string
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'lite-loopinit-')) })
  afterEach(async () => { await rm(root, { recursive: true, force: true }) })

  test('① 全默认：loops.yaml 生成、loadRegistry 读回绿、status=paused、逐字段等于推导规则表', async () => {
    const deps = makeDeps({ cwd: root })
    const code = await cmdInit(deps, ['--yes', '--id', 'x-loop', '--goal', GOAL_OK])
    expect(code).toBe(0)
    const { data, errors } = loadRegistry(root)
    expect(errors).toEqual([])
    expect(data).not.toBeNull()
    const l = data!.loops[0]!
    expect(l.id).toBe('x-loop')
    expect(l.name).toBe('x-loop')
    expect(l.kind).toBe('orchestrator')
    expect(l.goal).toBe(GOAL_OK)
    expect(l.change_prefix).toBe('xl-') // derivePrefix('x-loop')
    expect(l.risk).toBe('low')
    expect(l.runner).toBe('claude-code')
    expect(l.cadence).toBe('4h') // low → 4h
    expect(l.phases).toEqual(['open', 'explore', 'spec', 'build', 'verify', 'ship', 'archive'])
    expect(l.human_gates).toEqual(['explore', 'spec', 'verify'])
    expect(l.kill_criteria).toEqual(['no-change-3', 'budget-burn-2d'])
    expect(l.state).toBe('.superpowers/loops/progress.md')
    expect(l.design_doc).toBe('docs/loops/x-loop.md')
    expect(l.status).toBe('paused') // 硬 gate
    expect(l.budget).toEqual({ max_runs_per_day: 48, max_in_flight: 1, on_exceed: 'skip', max_tokens_per_day: 100000 })
    expect(l.autonomy_level).toBe('L1') // loadRegistry 派生
  })

  test('① risk=high 映射：cadence=1h / max_runs=8（推导规则表 risk 映射钉死）', async () => {
    const deps = makeDeps({ cwd: root })
    await cmdInit(deps, ['--yes', '--id', 'h-loop', '--goal', GOAL_OK, '--risk', 'high'])
    const l = loadRegistry(root).data!.loops[0]!
    expect(l.cadence).toBe('1h')
    expect(l.budget.max_runs_per_day).toBe(8)
  })

  test('② 重复 id → exit 非零 + stderr 定位（append 路径查重）', async () => {
    const deps1 = makeDeps({ cwd: root })
    expect(await cmdInit(deps1, ['--yes', '--id', 'dup-loop', '--goal', GOAL_OK])).toBe(0)
    const deps2 = makeDeps({ cwd: root })
    const code = await cmdInit(deps2, ['--yes', '--id', 'dup-loop', '--goal', GOAL_OK])
    expect(code).not.toBe(0)
    expect(deps2.errLines.join('\n')).toContain('dup-loop')
  })

  test('③ 已存在文件（含注释 fixture）→ 追加后原区间逐字节不变、两 loop 都读回', async () => {
    const existing = '# 手写登记表——勿被 init 重排/丢注释\n'
      + createLoopsYamlText({
        id: 'first-loop', name: 'first-loop', kind: 'orchestrator', goal: GOAL_OK, cadence: '4h',
        risk: 'low', runner: 'claude-code', change_prefix: 'fl-', phases: ['open', 'explore'],
        human_gates: ['explore'], state: '.superpowers/loops/progress.md', design_doc: 'docs/loops/first-loop.md',
        status: 'paused', budget: { max_runs_per_day: 48, max_in_flight: 1, on_exceed: 'skip' }, kill_criteria: ['no-change-3'],
      }).text!
    await mkdir(join(root, '.pipeline'), { recursive: true })
    await writeFile(join(root, '.pipeline', 'loops.yaml'), existing, 'utf8')
    const deps = makeDeps({ cwd: root })
    expect(await cmdInit(deps, ['--yes', '--id', 'second-loop', '--goal', GOAL_OK])).toBe(0)
    const after = await readFile(join(root, '.pipeline', 'loops.yaml'), 'utf8')
    expect(after.startsWith(existing)).toBe(true) // 原区间逐字节保留
    const { data, errors } = loadRegistry(root)
    expect(errors).toEqual([])
    expect(data!.loops.map((x) => x.id)).toEqual(['first-loop', 'second-loop'])
  })

  test('④ CAS：写前文件被并发改 → 如实拒绝 exit 非零、不落盘（内存 fake：读两次内容不一致）', async () => {
    const path = join(root, '.pipeline', 'loops.yaml')
    const existing = createLoopsYamlText({
      id: 'base-loop', name: 'base-loop', kind: 'orchestrator', goal: GOAL_OK, cadence: '4h',
      risk: 'low', runner: 'claude-code', change_prefix: 'bl-', phases: ['open', 'explore'],
      human_gates: ['explore'], state: '.superpowers/loops/progress.md', design_doc: 'docs/loops/base-loop.md',
      status: 'paused', budget: { max_runs_per_day: 48, max_in_flight: 1, on_exceed: 'skip' }, kill_criteria: ['no-change-3'],
    }).text!
    let reads = 0
    const writes: string[] = []
    const env: InitEnv = {
      fs: {
        readText: (p) => { reads++; return p === path ? (reads === 1 ? existing : `${existing}# 并发插入\n`) : null },
        createExclusive: () => { throw new Error('不该走创建路径') },
        overwrite: (_p, t) => { writes.push(t) },
      },
      addDraftMark: async () => {},
      isInteractive: () => false,
      makePrompter: () => ({ ask: async () => '', close: () => {} }),
    }
    const deps = makeDeps({ cwd: root })
    const code = await cmdInit(deps, ['--yes', '--id', 'race-loop', '--goal', GOAL_OK], env)
    expect(code).not.toBe(0)
    expect(writes).toHaveLength(0) // 未落盘
    expect(deps.errLines.join('\n')).toMatch(/CAS/)
  })

  test('⑤ --prefix none → change_prefix: null（可读回裸 null）', async () => {
    const deps = makeDeps({ cwd: root })
    await cmdInit(deps, ['--yes', '--id', 'np-loop', '--goal', GOAL_OK, '--prefix', 'none'])
    expect(loadRegistry(root).data!.loops[0]!.change_prefix).toBeNull()
  })

  test('⑤b --prefix 显式值 → 原样落盘', async () => {
    const deps = makeDeps({ cwd: root })
    await cmdInit(deps, ['--yes', '--id', 'cp-loop', '--goal', GOAL_OK, '--prefix', 'custom-'])
    expect(loadRegistry(root).data!.loops[0]!.change_prefix).toBe('custom-')
  })

  test('⑥ 非 enum runner → stderr 软警告且仍成功 exit 0、runner 原样落盘', async () => {
    const deps = makeDeps({ cwd: root })
    const code = await cmdInit(deps, ['--yes', '--id', 'r-loop', '--goal', GOAL_OK, '--runner', 'cron'])
    expect(code).toBe(0)
    expect(deps.errLines.join('\n')).toContain('不是标准 runner')
    expect(loadRegistry(root).data!.loops[0]!.runner).toBe('cron')
  })

  test('⑦ goal <10 字 → 拒（exit 非零、不落盘）', async () => {
    const deps = makeDeps({ cwd: root })
    const code = await cmdInit(deps, ['--yes', '--id', 'g-loop', '--goal', '太短'])
    expect(code).not.toBe(0)
    expect(loadRegistry(root).data).toBeNull() // 未建文件
  })

  test('⑦b 非法 id → 拒', async () => {
    const deps = makeDeps({ cwd: root })
    expect(await cmdInit(deps, ['--yes', '--id', 'Bad_ID', '--goal', GOAL_OK])).not.toBe(0)
  })

  test('缺必填（无 --id）非交互 → stderr 列明 + exit 1', async () => {
    const deps = makeDeps({ cwd: root })
    const code = await cmdInit(deps, ['--yes', '--goal', GOAL_OK])
    expect(code).toBe(1)
    expect(deps.errLines.join('\n')).toContain('--id')
  })

  test('⑧ 成功后 drafts.json 含该 id（真 fs 草稿标记）', async () => {
    const deps = makeDeps({ cwd: root })
    await cmdInit(deps, ['--yes', '--id', 'd-loop', '--goal', GOAL_OK])
    const marks = JSON.parse(await readFile(join(root, '.pipeline', 'loops.drafts.json'), 'utf8'))
    expect(marks.ids).toContain('d-loop')
  })

  test('⑧b 草稿标记写失败（注入 addDraftMark 抛）→ WARN + exit 0（loop 仍落盘）', async () => {
    const { env, store, drafts } = memInitEnv()
    env.addDraftMark = async () => { throw new Error('坏路径：EACCES') }
    const deps = makeDeps({ cwd: root })
    const code = await cmdInit(deps, ['--yes', '--id', 'w-loop', '--goal', GOAL_OK], env)
    expect(code).toBe(0) // 不因标记失败而失败
    expect(deps.errLines.join('\n')).toContain('WARN')
    expect(drafts).toHaveLength(0)
    expect(store.get(join(root, '.pipeline', 'loops.yaml'))).toContain('w-loop') // loop 已落盘
  })

  test('⑨ --json 成功信封 {ok:true,id,path,draft:true} 单行', async () => {
    const deps = makeDeps({ cwd: root })
    await cmdInit(deps, ['--yes', '--id', 'j-loop', '--goal', GOAL_OK, '--json'])
    expect(deps.outLines).toHaveLength(1)
    const env = JSON.parse(deps.outLines[0]!)
    expect(env).toEqual({ ok: true, id: 'j-loop', path: join(root, '.pipeline', 'loops.yaml'), draft: true })
  })

  test('⑨b --json 错误信封 {ok:false,error} + exit 非零', async () => {
    const deps = makeDeps({ cwd: root })
    const code = await cmdInit(deps, ['--yes', '--id', 'bad', '--goal', '太短', '--json'])
    expect(code).not.toBe(0)
    const env = JSON.parse(deps.outLines[0]!)
    expect(env.ok).toBe(false)
    expect(typeof env.error).toBe('string')
  })

  test('并发首建：wx 独占（内存 fake createExclusive 命中 EEXIST）→ 如实报错', async () => {
    const path = join(root, '.pipeline', 'loops.yaml')
    const { env } = memInitEnv()
    // 让 readText 返回 null（缺文件走创建路径），但 createExclusive 抛 EEXIST（模拟并发抢先创建）
    env.fs.readText = () => null
    env.fs.createExclusive = () => { const e = new Error('EEXIST') as NodeJS.ErrnoException; e.code = 'EEXIST'; throw e }
    const deps = makeDeps({ cwd: root })
    const code = await cmdInit(deps, ['--yes', '--id', 'race2', '--goal', GOAL_OK], env)
    expect(code).not.toBe(0)
    expect(deps.errLines.join('\n')).toContain('EEXIST')
    void path
  })

  test('dispatch：cmdLoops(init) 分派到 cmdInit（默认 REAL_INIT_ENV 走真 fs）', async () => {
    const deps = makeDeps({ cwd: root })
    const code = await cmdLoops(deps, 'init', ['--yes', '--id', 'disp-loop', '--goal', GOAL_OK])
    expect(code).toBe(0)
    expect(loadRegistry(root).data!.loops[0]!.id).toBe('disp-loop')
  })
})

describe('loops init —— 交互向导（脚本化 Prompter 注入，真 fs 落盘）', () => {
  let root: string
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'lite-loopwiz-')) })
  afterEach(async () => { await rm(root, { recursive: true, force: true }) })

  test('⑩ 全回车收默认（id/goal 键入，其余回车）等价于 ①', async () => {
    // 问题顺序：id, goal, designDoc, prefix, kind, runner, gates, kill, risk, cadence, phases
    const answers = ['wiz-loop', GOAL_OK, '', '', '', '', '', '', '', '', '']
    const env: InitEnv = { ...REAL_INIT_ENV, isInteractive: () => true, makePrompter: () => scriptedPrompter(answers) }
    const deps = makeDeps({ cwd: root })
    const code = await cmdInit(deps, [], env) // 无 --yes → 交互
    expect(code).toBe(0)
    const l = loadRegistry(root).data!.loops[0]!
    expect(l.id).toBe('wiz-loop')
    expect(l.goal).toBe(GOAL_OK)
    expect(l.status).toBe('paused')
    expect(l.cadence).toBe('4h') // risk 默认 low → 4h
    expect(l.change_prefix).toBe('wl-') // derivePrefix('wiz-loop')
    expect(l.phases).toEqual(['open', 'explore', 'spec', 'build', 'verify', 'ship', 'archive'])
  })

  test('⑩b 校验失败就地重问（首个 id 非法 → 重问收合法值）', async () => {
    const answers = ['Bad ID', 'good-loop', GOAL_OK, '', '', '', '', '', '', '', '']
    const env: InitEnv = { ...REAL_INIT_ENV, isInteractive: () => true, makePrompter: () => scriptedPrompter(answers) }
    const deps = makeDeps({ cwd: root })
    expect(await cmdInit(deps, [], env)).toBe(0)
    expect(loadRegistry(root).data!.loops[0]!.id).toBe('good-loop')
    expect(deps.errLines.join('\n')).toContain('id 非法') // 重问前打了错误提示
  })

  test('⑩c 交互态 risk=high 时 cadence 默认联动 1h（回车收派生默认）', async () => {
    const answers = ['hi-loop', GOAL_OK, '', '', '', '', '', '', 'high', '', '']
    const env: InitEnv = { ...REAL_INIT_ENV, isInteractive: () => true, makePrompter: () => scriptedPrompter(answers) }
    const deps = makeDeps({ cwd: root })
    expect(await cmdInit(deps, [], env)).toBe(0)
    const l = loadRegistry(root).data!.loops[0]!
    expect(l.risk).toBe('high')
    expect(l.cadence).toBe('1h') // risk=high 后 cadence 默认联动
  })
})

describe('derivePrefix —— change_prefix 推导（id 分段首字母 + -）', () => {
  test('restyle-loop → rl-', () => { expect(derivePrefix('restyle-loop')).toBe('rl-') })
  test('demo-loop → dl-', () => { expect(derivePrefix('demo-loop')).toBe('dl-') })
  test('单段 foo → f-', () => { expect(derivePrefix('foo')).toBe('f-') })
  test('多连字符 a--b（空段跳过）→ ab-', () => { expect(derivePrefix('a--b')).toBe('ab-') })
})
