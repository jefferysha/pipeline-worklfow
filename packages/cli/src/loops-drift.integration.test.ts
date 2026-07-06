/**
 * loops drift/audit —— 真实端到端集成测试（BACKLOG #37，GOAL C9：无伪测试 / B21 漂移检测+就绪审计 / D16）。
 *
 * 零 mock：mkdtemp 真临时项目 + 真写 .pipeline/loops.yaml（声明意图）+ 真写
 * .superpowers/loops/progress.md 运行流水（实际状态）+ 真写 LOOP.md（人类镜像）+ realDeps 真 clock +
 * 真调 cmdLoops drift/audit（默认 REAL_DRIFT_FS 走真 node fs：真 loadRegistry 窄解析+schema 校验 /
 * 真 run-log 解析 / 真 LOOP.md 镜像对账 / 真就绪评分）。断言真实漂移项与真实评分：
 *   drift —— 声明 cadence 1h 但流水 4h 没跑 → cadence-idle；LOOP.md 未提及 → mirror-missing；
 *            LOOP.md 声明幽灵 loop → mirror-orphan；流水记未登记 id → runlog-orphan-id；
 *            change=<name> 与 prefix 不符 → change-prefix；paused 但今日仍跑 → status-drift；never-run。
 *   audit —— 满配 loop → 100/ready；schema 合法但设计极简 loop → <70/not-ready + 具体建议。
 *
 * 覆盖（C10）：drift 七维度 + CLEAN + --json + --loop 过滤 + registry 缺失/坏；
 * audit ready/not-ready/--json/--loop；跨命令串联 list→drift→audit 同一真 registry。
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
  // 第 4 参 REAL_LOOPS_FS，第 5 参默认 REAL_DRIFT_FS（真读 loops.yaml/progress.md/LOOP.md）
  const code = await cmdLoops(realDeps(cwd, out, err), sub, args, REAL_LOOPS_FS)
  return { code, out, err }
}

/** 写一条合法 loop 的 YAML 块（缩进 2）；参数控制漂移/评分维度。 */
function loopBlock(o: {
  id: string; kind?: string; cadence?: string; risk?: string; status?: string
  changePrefix?: string | null; goal?: string; gates?: string[]; kill?: string[]
  maxTokens?: number | null; designDoc?: string; state?: string; autonomy?: string | null
}): string {
  const prefix = o.changePrefix === undefined ? `${o.id}-` : o.changePrefix
  const gates = o.gates ?? ['P2 战略项只写提案', 'push/合并到远端']
  const kill = o.kill ?? ['backlog 连续 2 轮空', '同项连败 3 次']
  const budget = [
    `    budget:`,
    `      max_runs_per_day: 24`,
    `      max_in_flight: 1`,
    `      on_exceed: skip`,
    ...(o.maxTokens === undefined || o.maxTokens === null ? [] : [`      max_tokens_per_day: ${o.maxTokens}`]),
  ]
  const lvl = o.autonomy === undefined ? 'L1' : o.autonomy
  return [
    `  - id: ${o.id}`,
    `    name: ${o.id} 编排 loop`,
    `    kind: ${o.kind ?? 'orchestrator'}`,
    `    goal: ${o.goal ?? '每小时从队列发现立项跑通四门收编收敛到架构报告的单写者目标架构直至全部成功判据勾满'}`,
    `    cadence: ${o.cadence ?? '1h'}`,
    `    risk: ${o.risk ?? 'medium'}`,
    `    runner: cron-session`,
    `    change_prefix: ${prefix === null ? 'null' : prefix}`,
    `    phases:`,
    `      - decide`,
    `      - record`,
    `    human_gates:`,
    ...gates.map((g) => `      - ${g}`),
    `    state: ${o.state ?? '.superpowers/loops/progress.md'}`,
    `    design_doc: ${o.designDoc ?? `docs/loops/${o.id}.md`}`,
    `    status: ${o.status ?? 'active'}`,
    ...budget,
    `    kill_criteria:`,
    ...kill.map((k) => `      - ${k}`),
    ...(lvl === null ? [] : [`    autonomy_level: ${lvl}`]),
  ].join('\n')
}

async function writeRegistry(...blocks: string[]): Promise<void> {
  await mkdir(join(cwd, '.pipeline'), { recursive: true })
  await writeFile(join(cwd, '.pipeline', 'loops.yaml'), `version: 1\nloops:\n${blocks.join('\n')}\n`, 'utf8')
}

/** 真写运行流水 progress.md：5 列表格，note 可含 change=<name>。 */
async function writeRunLog(rows: Array<{ ts: string; id: string; note?: string }>): Promise<void> {
  await mkdir(join(cwd, '.superpowers', 'loops'), { recursive: true })
  const lines = [
    '| ts | loop | action | inflight | note |',
    '|----|------|--------|----------|------|',
    ...rows.map((r) => `| ${r.ts} | ${r.id} | run | 0 | ${r.note ?? 'result=ok'} |`),
  ]
  await writeFile(join(cwd, '.superpowers', 'loops', 'progress.md'), lines.join('\n') + '\n', 'utf8')
}

/** 真写 LOOP.md 人类镜像（### `id` 标题声明 loop）。 */
async function writeLoopDoc(...ids: string[]): Promise<void> {
  const secs = ids.map((id) => `### \`${id}\` — ${id} 协议\n\n- goal：见 registry\n`)
  await writeFile(join(cwd, 'LOOP.md'), `# LOOP.md\n\n${secs.join('\n')}`, 'utf8')
}

// realDeps 固定 clock = 2026-07-07T00:00:00Z → now = 2026-07-07T00:00，今日 = 2026-07-07
const TODAY = '2026-07-07'

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'loops-drift-e2e-'))
})
afterEach(async () => {
  await rm(cwd, { recursive: true, force: true })
})

describe('真实 e2e —— drift 漂移检测（registry × LOOP.md × run-log 三方对账）', () => {
  test('全对齐（镜像同步 + 节奏跟上）→ CLEAN → exit 0', async () => {
    await writeRegistry(loopBlock({ id: 'loop-be', cadence: '1h' }))
    await writeLoopDoc('loop-be')
    // now=07-07T00:00，上次 07-06T23:30（30 分钟前，<2×60）→ 不 idle
    await writeRunLog([{ ts: '2026-07-06T23:30', id: 'loop-be', note: 'result=ok change=loop-be-3' }])
    const r = await loops('drift', '--json')
    expect(r.code).toBe(0)
    const rep = JSON.parse(r.out.join('\n'))
    expect(rep.clean).toBe(true)
    expect(rep.items).toEqual([])
  })

  test('cadence-idle：声明 1h 但距上次执行 4h（>2×）→ warn → exit 1', async () => {
    await writeRegistry(loopBlock({ id: 'loop-be', cadence: '1h' }))
    await writeLoopDoc('loop-be')
    await writeRunLog([{ ts: '2026-07-06T20:00', id: 'loop-be' }]) // 4h 前
    const r = await loops('drift', '--json')
    expect(r.code).toBe(1)
    const items = JSON.parse(r.out.join('\n')).items
    const idle = items.find((i: { dimension: string }) => i.dimension === 'cadence-idle')
    expect(idle).toBeDefined()
    expect(idle.loop).toBe('loop-be')
    expect(idle.detail).toMatch(/240/)
  })

  test('never-run：active 有限 cadence 但流水零执行 → warn → exit 1', async () => {
    await writeRegistry(loopBlock({ id: 'loop-be', cadence: '1h' }))
    await writeLoopDoc('loop-be')
    await writeRunLog([]) // 空流水
    const r = await loops('drift', '--json')
    expect(r.code).toBe(1)
    expect(JSON.parse(r.out.join('\n')).items.some((i: { dimension: string }) => i.dimension === 'never-run')).toBe(true)
  })

  test('mirror-missing：LOOP.md 未提及 registry id → warn → exit 1（TestLoopMdMirror 推广）', async () => {
    await writeRegistry(loopBlock({ id: 'loop-be' }))
    await writeLoopDoc('loop-fe') // 提了别的，没提 loop-be
    await writeRunLog([{ ts: '2026-07-06T23:30', id: 'loop-be' }])
    const r = await loops('drift', '--json')
    expect(r.code).toBe(1)
    const m = JSON.parse(r.out.join('\n')).items.find((i: { dimension: string }) => i.dimension === 'mirror-missing')
    expect(m).toBeDefined()
    expect(m.loop).toBe('loop-be')
  })

  test('mirror-orphan：LOOP.md 声明幽灵 loop（不在 registry）→ warn', async () => {
    await writeRegistry(loopBlock({ id: 'loop-be' }))
    await writeLoopDoc('loop-be', 'ghost-loop')
    await writeRunLog([{ ts: '2026-07-06T23:30', id: 'loop-be' }])
    const r = await loops('drift', '--json')
    expect(r.code).toBe(1)
    const o = JSON.parse(r.out.join('\n')).items.find((i: { dimension: string }) => i.dimension === 'mirror-orphan')
    expect(o).toBeDefined()
    expect(o.loop).toBe('ghost-loop')
  })

  test('runlog-orphan-id：流水记了未登记的 loop id → warn', async () => {
    await writeRegistry(loopBlock({ id: 'loop-be' }))
    await writeLoopDoc('loop-be')
    await writeRunLog([
      { ts: '2026-07-06T23:30', id: 'loop-be' },
      { ts: '2026-07-06T23:40', id: 'loop-zombie' },
    ])
    const r = await loops('drift', '--json')
    expect(r.code).toBe(1)
    const z = JSON.parse(r.out.join('\n')).items.find((i: { dimension: string }) => i.dimension === 'runlog-orphan-id')
    expect(z).toBeDefined()
    expect(z.loop).toBe('loop-zombie')
  })

  test('change-prefix：流水 change=<name> 与声明 change_prefix 不符 → warn', async () => {
    await writeRegistry(loopBlock({ id: 'loop-be', changePrefix: 'loop-be-' }))
    await writeLoopDoc('loop-be')
    await writeRunLog([{ ts: '2026-07-06T23:30', id: 'loop-be', note: 'result=ok change=loop-fe-9' }])
    const r = await loops('drift', '--json')
    expect(r.code).toBe(1)
    const c = JSON.parse(r.out.join('\n')).items.find((i: { dimension: string }) => i.dimension === 'change-prefix')
    expect(c).toBeDefined()
    expect(c.detail).toContain('loop-fe-9')
  })

  test('status-drift：status=paused 但今日仍有执行 → warn', async () => {
    await writeRegistry(loopBlock({ id: 'loop-be', status: 'paused' }))
    await writeLoopDoc('loop-be')
    await writeRunLog([{ ts: `${TODAY}T00:00`, id: 'loop-be' }]) // 今日
    const r = await loops('drift', '--json')
    expect(r.code).toBe(1)
    const s = JSON.parse(r.out.join('\n')).items.find((i: { dimension: string }) => i.dimension === 'status-drift')
    expect(s).toBeDefined()
    expect(s.loop).toBe('loop-be')
  })

  test('--loop 过滤：只报该 loop 的漂移项，checked 单元素', async () => {
    await writeRegistry(
      loopBlock({ id: 'loop-be' }),
      loopBlock({ id: 'loop-fe' }),
    )
    await writeLoopDoc() // 空——两个都 mirror-missing
    await writeRunLog([])
    const r = await loops('drift', '--loop', 'loop-be', '--json')
    expect(r.code).toBe(1)
    const rep = JSON.parse(r.out.join('\n'))
    expect(rep.checked).toEqual(['loop-be'])
    expect(rep.items.every((i: { loop: string }) => i.loop === 'loop-be')).toBe(true)
  })

  test('未知 --loop → exit 3', async () => {
    await writeRegistry(loopBlock({ id: 'loop-be' }))
    await writeLoopDoc('loop-be')
    expect((await loops('drift', '--loop', 'ghost')).code).toBe(3)
  })

  test('text 输出含 dimension + 建议', async () => {
    await writeRegistry(loopBlock({ id: 'loop-be', cadence: '1h' }))
    await writeLoopDoc('loop-be')
    await writeRunLog([{ ts: '2026-07-06T18:00', id: 'loop-be' }])
    const r = await loops('drift')
    expect(r.code).toBe(1)
    const out = r.out.join('\n')
    expect(out).toContain('cadence-idle')
    expect(out).toMatch(/→/)
  })

  test('registry 缺失 → exit 3 + 未找到提示', async () => {
    const r = await loops('drift')
    expect(r.code).toBe(3)
    expect(r.err.join('\n')).toMatch(/loops\.yaml|未找到/i)
  })

  test('registry 校验失败 → exit 3、错误到 stderr', async () => {
    await mkdir(join(cwd, '.pipeline'), { recursive: true })
    await writeFile(join(cwd, '.pipeline', 'loops.yaml'), 'version: 1\nloops:\n  - id: BAD_ID\n', 'utf8')
    const r = await loops('drift')
    expect(r.code).toBe(3)
    expect(r.err.length).toBeGreaterThan(0)
  })
})

describe('真实 e2e —— audit loop-ready 就绪评分（loop-audit 0-100）', () => {
  test('满配 loop → score 100、band=ready → exit 0、零建议', async () => {
    // 默认 goal(≥30)/gates(2)/kill(2)/designDoc/state 均满配，仅补 changePrefix + token 预算
    await writeRegistry(loopBlock({
      id: 'loop-be', cadence: '1h', changePrefix: 'loop-be-', maxTokens: 100000,
    }))
    const r = await loops('audit', '--json')
    expect(r.code).toBe(0)
    const s = JSON.parse(r.out.join('\n')).scores[0]
    expect(s.id).toBe('loop-be')
    expect(s.score).toBe(100)
    expect(s.band).toBe('ready')
    expect(s.suggestions).toEqual([])
  })

  test('schema 合法但设计极简 loop → <70/not-ready → exit 1 + 具体建议', async () => {
    // goal≈12(schema 合法但 <30) / gates=1 / kill=1 / 无 token 预算 / change_prefix=null → 就绪缺口多
    await writeRegistry(loopBlock({
      id: 'loop-min', cadence: '1h', changePrefix: null, maxTokens: null,
      goal: '收敛轻量内核子命令面移植', gates: ['问人'], kill: ['连续空轮'],
      designDoc: 'dd', state: '.superpowers/loops/progress.md',
    }))
    const r = await loops('audit', '--json')
    expect(r.code).toBe(1)
    const s = JSON.parse(r.out.join('\n')).scores[0]
    expect(s.score).toBeLessThan(70)
    expect(s.band).toBe('not-ready')
    expect(s.suggestions.length).toBeGreaterThan(0)
    // change_prefix=null 缺口应有建议
    expect(s.dimensions.find((d: { name: string }) => d.name === 'change_prefix').score).toBe(0)
  })

  test('维度求和 = score（真实评分自洽）', async () => {
    await writeRegistry(loopBlock({ id: 'loop-be', maxTokens: 100000 }))
    const r = await loops('audit', '--json')
    const s = JSON.parse(r.out.join('\n')).scores[0]
    const sum = s.dimensions.reduce((a: number, d: { score: number }) => a + d.score, 0)
    expect(sum).toBe(s.score)
  })

  test('--loop 过滤：只评该 loop', async () => {
    await writeRegistry(
      loopBlock({ id: 'loop-be', maxTokens: 100000 }),
      loopBlock({ id: 'loop-fe', maxTokens: 100000 }),
    )
    const r = await loops('audit', '--loop', 'loop-fe', '--json')
    expect(r.code).toBe(0)
    const scores = JSON.parse(r.out.join('\n')).scores
    expect(scores.map((s: { id: string }) => s.id)).toEqual(['loop-fe'])
  })

  test('text 输出含 score/band/维度分', async () => {
    await writeRegistry(loopBlock({ id: 'loop-be', maxTokens: 100000 }))
    const r = await loops('audit')
    expect(r.code).toBe(0)
    const out = r.out.join('\n')
    expect(out).toContain('loop-be')
    expect(out).toMatch(/score=/)
    expect(out).toMatch(/goal=/)
  })

  test('registry 缺失 → exit 3', async () => {
    const r = await loops('audit')
    expect(r.code).toBe(3)
  })
})

describe('真实 e2e —— 跨命令串联（同一真 registry + 流水 + 镜像）', () => {
  test('list（登记）→ drift（对账）→ audit（评分）跑通', async () => {
    await writeRegistry(loopBlock({ id: 'loop-be', cadence: '1h', maxTokens: 100000 }))
    await writeLoopDoc('loop-be')
    await writeRunLog([{ ts: '2026-07-06T18:00', id: 'loop-be' }]) // 6h 前 → idle
    expect((await loops('list')).code).toBe(0)
    // drift：6h > 2×1h → cadence-idle → exit 1
    expect((await loops('drift')).code).toBe(1)
    // audit：满配 → ready → exit 0
    expect((await loops('audit')).code).toBe(0)
  })
})
