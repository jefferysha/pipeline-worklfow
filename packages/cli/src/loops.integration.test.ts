/**
 * loop 治理子系统 —— 真实端到端集成测试（BACKLOG #35，GOAL C9：无伪测试 / D16 loop-engineering 内建）。
 *
 * 零 mock：mkdtemp 真临时项目 + 真写 .pipeline/loops.yaml / .superpowers/loops/progress.md /
 * openspec/changes/<prefix>*​/.pipeline.yaml + 真沙箱屏障副本 + realDeps 真 clock + 真调 cmdLoops enforce/list/status
 * （默认 REAL_LOOPS_FS 走真 node fs：真 loadRegistry 窄解析+schema 校验 / 真 progress 解析 / 真在途计数 / 真 barrier audit）。
 * 断言真实 verdict（budget 超限→kill、R8 在途→warn、kill 判据命中→kill、R11 误记账→warn、L1 report-only）。
 *
 * 覆盖（C10）：list happy + --json + registry 缺失/坏；enforce happy(ok)/warn(R8)/kill(R2,R1)/R11/exit code/--loop 过滤；
 * status；分级放权 L1 report-only / L3 not-report-only；跨命令串联 list→enforce→status。
 */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

/** 写一条合法 loop 的 YAML 块（缩进 2）。autonomy_level 传 null 则省略（测缺省填 L1）。 */
function loopBlock(o: {
  id: string; kind?: string; prefix?: string | null; status?: string; cadence?: string; autonomy?: string | null
  maxRuns?: number; maxInFlight?: number
}): string {
  const kind = o.kind ?? 'orchestrator'
  const prefix = o.prefix === undefined ? `${o.id}-` : o.prefix
  const lvl = o.autonomy === undefined ? 'L1' : o.autonomy
  return [
    `  - id: ${o.id}`,
    `    name: ${o.id} 编排 loop`,
    `    kind: ${kind}`,
    `    goal: 每小时发现立项跑通收敛目标架构`,
    `    cadence: ${o.cadence ?? '1h'}`,
    `    risk: medium`,
    `    runner: cron-session`,
    `    change_prefix: ${prefix === null ? 'null' : prefix}`,
    `    phases:`,
    `      - decide`,
    `      - record`,
    `    human_gates:`,
    `      - P2 战略项只写提案`,
    `    state: .superpowers/loops/progress.md`,
    `    design_doc: docs/loops/${o.id}.md`,
    `    status: ${o.status ?? 'active'}`,
    `    budget:`,
    `      max_runs_per_day: ${o.maxRuns ?? 24}`,
    `      max_in_flight: ${o.maxInFlight ?? 1}`,
    `      on_exceed: skip`,
    `    kill_criteria:`,
    `      - backlog 连续 2 轮空`,
    ...(lvl === null ? [] : [`    autonomy_level: ${lvl}`]),
  ].join('\n')
}

async function writeRegistry(...blocks: string[]): Promise<void> {
  await mkdir(join(cwd, '.pipeline'), { recursive: true })
  await writeFile(join(cwd, '.pipeline', 'loops.yaml'), `version: 1\nloops:\n${blocks.join('\n')}\n`, 'utf8')
}

async function writeProgress(lines: string[]): Promise<void> {
  await mkdir(join(cwd, '.superpowers', 'loops'), { recursive: true })
  await writeFile(join(cwd, '.superpowers', 'loops', 'progress.md'), lines.join('\n') + '\n', 'utf8')
}

async function writeChange(name: string, fields: Record<string, string>): Promise<void> {
  const dir = join(cwd, 'openspec', 'changes', name)
  await mkdir(dir, { recursive: true })
  const body = Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('\n')
  await writeFile(join(dir, '.pipeline.yaml'), body + '\n', 'utf8')
}

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'loops-e2e-'))
})
afterEach(async () => {
  await rm(cwd, { recursive: true, force: true })
})

describe('真实 e2e —— list 登记表（真窄解析 + schema 校验）', () => {
  test('list：真读 loops.yaml → 逐 loop 行；executor 也列出', async () => {
    await writeRegistry(
      loopBlock({ id: 'loop-be' }),
      loopBlock({ id: 'afk-scheduler', kind: 'executor', prefix: null, cadence: 'continuous' }),
    )
    const r = await loops('list')
    expect(r.code).toBe(0)
    const out = r.out.join('\n')
    expect(out).toContain('loop-be')
    expect(out).toContain('afk-scheduler')
    expect(out).toContain('orchestrator')
    expect(out).toContain('executor')
  })

  test('list --json：真解析回显 + autonomy_level 缺省真填 L1（分级放权默认 report-only）', async () => {
    await writeRegistry(loopBlock({ id: 'loop-be', autonomy: null })) // 省略 autonomy_level
    const r = await loops('list', '--json')
    expect(r.code).toBe(0)
    const reg = JSON.parse(r.out.join('\n'))
    expect(reg.version).toBe(1)
    expect(reg.loops[0].id).toBe('loop-be')
    expect(reg.loops[0].autonomy_level).toBe('L1') // 真缺省填充
    expect(reg.loops[0].budget.max_runs_per_day).toBe(24)
  })

  test('list：registry 缺失 → 提示 + exit 0（常态，非错误）', async () => {
    const r = await loops('list')
    expect(r.code).toBe(0)
    expect(r.out.join('\n')).toMatch(/no|无|registry/i)
  })

  test('list：schema 非法（缺 required）→ 定位错误到 stderr + exit 1', async () => {
    await mkdir(join(cwd, '.pipeline'), { recursive: true })
    await writeFile(join(cwd, '.pipeline', 'loops.yaml'), 'version: 1\nloops:\n  - id: broken\n    kind: orchestrator\n', 'utf8')
    const r = await loops('list')
    expect(r.code).toBe(1)
    expect(r.err.join('\n')).toMatch(/missing required|name/)
  })
})

describe('真实 e2e —— enforce 裁决（真 verdict + 真 exit code 0/1/2/3）', () => {
  test('全绿：orchestrator ok + executor 跳过 → exit 0', async () => {
    await writeRegistry(
      loopBlock({ id: 'loop-be' }),
      loopBlock({ id: 'afk-scheduler', kind: 'executor', prefix: null, cadence: 'continuous' }),
    )
    const r = await loops('enforce', '--json')
    expect(r.code).toBe(0)
    const rep = JSON.parse(r.out.join('\n'))
    expect(rep.verdicts.map((v: { id: string }) => v.id)).toEqual(['loop-be'])
    expect(rep.verdicts[0].verdict).toBe('ok')
    expect(rep.skipped.map((s: { id: string }) => s.id)).toEqual(['afk-scheduler'])
  })

  test('R2 预算超限：progress 真写今日 24 轮 → kill → exit 2；L1 report_only=true', async () => {
    await writeRegistry(loopBlock({ id: 'loop-be', maxRuns: 24 }))
    const rows = ['| ts | loop | action | inflight | note |']
    for (let i = 0; i < 24; i++) rows.push(`| 2026-07-07T09:${String(i).padStart(2, '0')} | loop-be | run | 0 | result=ok |`)
    await writeProgress(rows)
    const r = await loops('enforce', '--json')
    expect(r.code).toBe(2)
    const v = JSON.parse(r.out.join('\n')).verdicts[0]
    expect(v.verdict).toBe('kill')
    expect(v.reasons.map((x: { rule: string }) => x.rule)).toContain('R2')
    expect(v.metrics.runs_today).toBe(24)
    // 分级放权 L1：即便 kill 判据命中，裁决为 report-only（不自动停，执行面留 #38）
    expect(v.report_only).toBe(true)
    expect(v.enforcement).toBe('report-only')
  })

  test('R1 kill switch：status=paused → kill → exit 2', async () => {
    await writeRegistry(loopBlock({ id: 'loop-be', status: 'paused' }))
    const r = await loops('enforce')
    expect(r.code).toBe(2)
    expect(r.out.join('\n')).toContain('kill')
    expect(r.out.join('\n')).toContain('R1')
  })

  test('R8 在途已满：真建 loop-be-1/.pipeline.yaml automation=running → warn → exit 1', async () => {
    await writeRegistry(loopBlock({ id: 'loop-be', maxInFlight: 1 }))
    await writeChange('loop-be-1', { automation: 'running', phase: 'build' })
    const r = await loops('enforce', '--json')
    expect(r.code).toBe(1)
    const v = JSON.parse(r.out.join('\n')).verdicts[0]
    expect(v.verdict).toBe('warn')
    expect(v.metrics.in_flight).toBe(1)
    expect(v.reasons.map((x: { rule: string }) => x.rule)).toContain('R8')
  })

  test('R11 沙箱屏障误记账：主账本 automation=failed + 沙箱达 ship 屏障 → warn（不进 kill 集）', async () => {
    await writeRegistry(loopBlock({ id: 'loop-be' }))
    // 主账本 failed
    await writeChange('loop-be-x', { automation: 'failed', phase: 'build' })
    // 沙箱副本达 merge-back 屏障（命名约定）
    const sandboxDir = join(cwd, '.sandcastle', 'worktrees', 'sandcastle-pipeline-loop-be-x', 'openspec', 'changes', 'loop-be-x')
    await mkdir(sandboxDir, { recursive: true })
    await writeFile(join(sandboxDir, '.pipeline.yaml'), 'phase: ship\nverify_result: pass\nbranch_status: handled\n', 'utf8')
    const r = await loops('enforce', '--json')
    expect(r.code).toBe(1)
    const v = JSON.parse(r.out.join('\n')).verdicts[0]
    expect(v.verdict).toBe('warn')
    expect(v.reasons.map((x: { rule: string }) => x.rule)).toContain('R11')
    expect(v.metrics.misaccounted).toBe(1)
  })

  test('--loop 过滤：未知 id → exit 3；已知 id → 只裁该 loop', async () => {
    await writeRegistry(loopBlock({ id: 'loop-be' }), loopBlock({ id: 'loop-fe' }))
    expect((await loops('enforce', '--loop', 'ghost')).code).toBe(3)
    const r = await loops('enforce', '--loop', 'loop-fe', '--json')
    expect(r.code).toBe(0)
    expect(JSON.parse(r.out.join('\n')).verdicts.map((v: { id: string }) => v.id)).toEqual(['loop-fe'])
  })

  test('registry 校验失败 → report 抑制、错误到 stderr、exit 3', async () => {
    await mkdir(join(cwd, '.pipeline'), { recursive: true })
    await writeFile(join(cwd, '.pipeline', 'loops.yaml'), 'version: 1\nloops:\n  - id: BAD_ID\n', 'utf8')
    const r = await loops('enforce')
    expect(r.code).toBe(3)
    expect(r.err.length).toBeGreaterThan(0)
  })
})

describe('真实 e2e —— 分级放权 L1→L3 落 schema（enforce 认级别）', () => {
  test('L3 loop：report_only=false、enforcement=unattended（毕业制升档基座）', async () => {
    await writeRegistry(loopBlock({ id: 'loop-le', autonomy: 'L3' }))
    const r = await loops('enforce', '--json')
    const v = JSON.parse(r.out.join('\n')).verdicts[0]
    expect(v.autonomy_level).toBe('L3')
    expect(v.report_only).toBe(false)
    expect(v.enforcement).toBe('unattended')
  })

  test('非法 autonomy_level（L9）→ schema 拒 → enforce exit 3', async () => {
    await writeRegistry(loopBlock({ id: 'loop-be', autonomy: 'L9' }))
    expect((await loops('enforce')).code).toBe(3)
  })
})

describe('真实 e2e —— status + 跨命令串联', () => {
  test('status：逐 loop 汇总 status/verdict/enforcement', async () => {
    await writeRegistry(loopBlock({ id: 'loop-be' }), loopBlock({ id: 'loop-fe', status: 'paused' }))
    const r = await loops('status')
    expect(r.code).toBe(0)
    const out = r.out.join('\n')
    expect(out).toContain('loop-be')
    expect(out).toContain('loop-fe')
    expect(out).toContain('paused')
    expect(out).toContain('report-only')
  })

  test('串联：list（登记）→ enforce（裁决 kill）→ status（汇总）同一真 registry', async () => {
    await writeRegistry(loopBlock({ id: 'loop-be', status: 'retired' }))
    expect((await loops('list')).code).toBe(0)
    const enf = await loops('enforce')
    expect(enf.code).toBe(2) // retired → R1 kill
    expect((await loops('status')).code).toBe(0)
  })
})
