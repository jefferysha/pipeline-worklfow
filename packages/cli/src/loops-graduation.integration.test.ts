/**
 * loops graduation —— 真实端到端集成测试（BACKLOG #38，GOAL C9 无伪测试 / B19 分级放权 L1→L3 / D16）。
 *
 * 零 mock：mkdtemp 真临时项目 + 真写 .pipeline/loops.yaml（声明含 autonomy_level）+ 真写
 * .superpowers/loops/progress.md 运行流水（含 result=/tokens=/change=）+ 真写 LOOP.md 人类镜像 +
 * realDeps 真 clock（2026-07-07T00:00Z）+ 真调 cmdLoops graduate/level（默认 REAL_GRADUATION_FS 走真
 * node fs：真 loadRegistry 窄解析+schema 校验 / 真 run-log 解析 / 真 loop-ready 评分（#37）/ 真漂移对账
 * （#37）/ 真 circuit breaker（#36）/ 真 surgical 改档写回 loops.yaml）。断言真实升降档裁决：
 *   graduate —— 就绪高+镜像同步+熔断 ok → canGraduate=true 荐升 L2；就绪不足 → blocked；
 *               L2 熔断 tripped → 降档信号；L2→L3 运行历史不足 → blocked。
 *   level    —— view 当前/建议档；set 逐级毕业写回 loops.yaml（真读回断言改档）；L1→L3 一步跨级被拒；
 *               安全降档总允许；未 --confirm = dry-run 不落盘。
 *
 * 覆盖（C10）：graduate happy(荐升)/blocked/降档/--loop/--json/registry 缺失；level view/set-promote/
 * set-cross-level-reject/set-demote/set-dry-run/set-blocked-reject；跨命令 graduate→level set→graduate。
 */
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { realDeps, rm } from './integration-harness.js'
import { cmdLoops } from './commands/loops.js'

interface Run { code: number; out: string[]; err: string[] }

let cwd: string

async function loops(sub: string, ...args: string[]): Promise<Run> {
  const out: string[] = []
  const err: string[] = []
  // 第 4/5 参默认真 fs；graduate/level 用第 6 参 REAL_GRADUATION_FS（真读 loops.yaml/progress.md/LOOP.md + 真写回）
  const code = await cmdLoops(realDeps(cwd, out, err), sub, args)
  return { code, out, err }
}

/** 写一条合法 loop 的 YAML 块（缩进 2）；参数控制升降档判据（score/drift/breaker/level）。 */
function loopBlock(o: {
  id: string; cadence?: string; risk?: string; status?: string; changePrefix?: string | null
  goal?: string; gates?: string[]; kill?: string[]; maxTokens?: number | null
  designDoc?: string; state?: string; autonomy?: string | null
}): string {
  const prefix = o.changePrefix === undefined ? `${o.id}-` : o.changePrefix
  const gates = o.gates ?? ['P2 战略项只写提案', 'push/合并到远端']
  const kill = o.kill ?? ['backlog 连续 2 轮空', '同项连败 3 次']
  const budget = [
    '    budget:',
    '      max_runs_per_day: 24',
    '      max_in_flight: 1',
    '      on_exceed: skip',
    ...(o.maxTokens === undefined || o.maxTokens === null ? [] : [`      max_tokens_per_day: ${o.maxTokens}`]),
  ]
  const lvl = o.autonomy === undefined ? 'L1' : o.autonomy
  return [
    `  - id: ${o.id}`,
    `    name: ${o.id} 编排 loop`,
    '    kind: orchestrator',
    `    goal: ${o.goal ?? '每小时从队列发现立项跑通四门收编收敛到架构报告的单写者目标架构直至全部成功判据勾满'}`,
    `    cadence: ${o.cadence ?? '1h'}`,
    `    risk: ${o.risk ?? 'medium'}`,
    '    runner: cron-session',
    `    change_prefix: ${prefix === null ? 'null' : prefix}`,
    '    phases:',
    '      - decide',
    '      - record',
    '    human_gates:',
    ...gates.map((g) => `      - ${g}`),
    `    state: ${o.state ?? '.superpowers/loops/progress.md'}`,
    `    design_doc: ${o.designDoc ?? `docs/loops/${o.id}.md`}`,
    `    status: ${o.status ?? 'active'}`,
    ...budget,
    '    kill_criteria:',
    ...kill.map((k) => `      - ${k}`),
    ...(lvl === null ? [] : [`    autonomy_level: ${lvl}`]),
  ].join('\n')
}

async function writeRegistry(...blocks: string[]): Promise<void> {
  await mkdir(join(cwd, '.pipeline'), { recursive: true })
  await writeFile(join(cwd, '.pipeline', 'loops.yaml'), `version: 1\nloops:\n${blocks.join('\n')}\n`, 'utf8')
}

async function readRegistry(): Promise<string> {
  return readFile(join(cwd, '.pipeline', 'loops.yaml'), 'utf8')
}

/** 真写运行流水 progress.md：5 列表格，note 可含 result=/tokens=/change=。 */
async function writeRunLog(rows: Array<{ ts: string; id: string; note?: string }>): Promise<void> {
  await mkdir(join(cwd, '.superpowers', 'loops'), { recursive: true })
  const lines = [
    '| ts | loop | action | inflight | note |',
    '|----|------|--------|----------|------|',
    ...rows.map((r) => `| ${r.ts} | ${r.id} | run | 0 | ${r.note ?? 'result=ok'} |`),
  ]
  await writeFile(join(cwd, '.superpowers', 'loops', 'progress.md'), lines.join('\n') + '\n', 'utf8')
}

/** 真写 LOOP.md 人类镜像（### `id` 声明；镜像同步 = 无 mirror-missing 漂移，是升档前置）。 */
async function writeLoopDoc(...ids: string[]): Promise<void> {
  const secs = ids.map((id) => `### \`${id}\` — ${id} 协议\n\n- goal：见 registry\n`)
  await writeFile(join(cwd, 'LOOP.md'), `# LOOP.md\n\n${secs.join('\n')}`, 'utf8')
}

/** 就绪且无漂移的近期流水（now=07-07T00:00；23:30 = 30m 前，<2×60m 不 idle）。满配 loop 评分 100。 */
async function healthySetup(id: string, level: string, extraRows: Array<{ ts: string; id: string; note?: string }> = []): Promise<void> {
  await writeRegistry(loopBlock({ id, cadence: '1h', changePrefix: `${id}-`, maxTokens: 100000, autonomy: level }))
  await writeLoopDoc(id)
  await writeRunLog([{ ts: '2026-07-06T23:30', id, note: `result=ok change=${id}-3` }, ...extraRows])
}

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'loops-grad-e2e-'))
})
afterEach(async () => {
  await rm(cwd, { recursive: true, force: true })
})

describe('真实 e2e —— graduate 升档准入裁决（消费 #37 audit/drift + #36 breaker）', () => {
  test('L1 就绪高 + 镜像同步 + 熔断 ok → canGraduate=true、荐升 L2', async () => {
    await healthySetup('loop-be', 'L1')
    const r = await loops('graduate', '--json')
    const v = JSON.parse(r.out.join('\n')).verdicts[0]
    expect(v.current).toBe('L1')
    expect(v.canGraduate).toBe(true)
    expect(v.recommended).toBe('L2')
    expect(v.blockers).toEqual([])
    expect(v.demotionReason).toBeNull()
    expect(v.readinessScore).toBe(100)
    expect(r.code).toBe(1) // 有升档待人工门放行 = warn 级
  })

  test('就绪不足（设计极简 loop <70）→ blocked、canGraduate=false + blockers', async () => {
    await writeRegistry(loopBlock({
      id: 'loop-min', cadence: '1h', changePrefix: null, maxTokens: null,
      goal: '收敛轻量内核子命令面移植', gates: ['问人'], kill: ['连续空轮'], designDoc: 'dd', autonomy: 'L1',
    }))
    await writeLoopDoc('loop-min')
    await writeRunLog([{ ts: '2026-07-06T23:30', id: 'loop-min' }])
    const r = await loops('graduate', '--json')
    const v = JSON.parse(r.out.join('\n')).verdicts[0]
    expect(v.canGraduate).toBe(false)
    expect(v.blockers.length).toBeGreaterThan(0)
    expect(v.recommended).toBe('L1')
  })

  test('活跃漂移（LOOP.md 未提及 = mirror-missing）阻断升档', async () => {
    await writeRegistry(loopBlock({ id: 'loop-be', cadence: '1h', changePrefix: 'loop-be-', maxTokens: 100000, autonomy: 'L1' }))
    await writeLoopDoc('loop-other') // 未提及 loop-be → mirror-missing 漂移
    await writeRunLog([{ ts: '2026-07-06T23:30', id: 'loop-be' }])
    const r = await loops('graduate', '--json')
    const v = JSON.parse(r.out.join('\n')).verdicts[0]
    expect(v.canGraduate).toBe(false)
    expect(v.driftCount).toBeGreaterThan(0)
    expect(v.blockers.some((b: string) => /漂移/.test(b))).toBe(true)
  })

  test('L2 熔断 tripped（今日 token 花费超预算，#36）→ 降档信号、荐降 L1', async () => {
    await writeRegistry(loopBlock({ id: 'loop-be', cadence: '1h', changePrefix: 'loop-be-', maxTokens: 10000, autonomy: 'L2' }))
    await writeLoopDoc('loop-be')
    await writeRunLog([{ ts: '2026-07-07T00:00', id: 'loop-be', note: 'result=ok tokens=12000' }]) // 今日 12000 ≥ 10000
    const r = await loops('graduate', '--json')
    const v = JSON.parse(r.out.join('\n')).verdicts[0]
    expect(v.current).toBe('L2')
    expect(v.breaker).toBe('tripped')
    expect(v.demotionReason).not.toBeNull()
    expect(v.recommended).toBe('L1')
    expect(r.code).toBe(2) // 降档 = 最严
  })

  test('L2→L3 运行历史不足（<最小轮次）→ blocked（即便就绪 100 + 无漂移）', async () => {
    // 满配 → 100；但只有 1 轮历史 < MIN_L2_RUNS_FOR_L3
    await healthySetup('loop-be', 'L2')
    const r = await loops('graduate', '--loop', 'loop-be', '--json')
    const v = JSON.parse(r.out.join('\n')).verdicts[0]
    expect(v.readinessScore).toBe(100)
    expect(v.canGraduate).toBe(false)
    expect(v.blockers.some((b: string) => /历史|轮/.test(b))).toBe(true)
  })

  test('L2→L3 运行历史充足（≥最小轮次无失败）→ canGraduate=true 荐升 L3', async () => {
    await healthySetup('loop-be', 'L2', [
      { ts: '2026-07-06T22:10', id: 'loop-be' },
      { ts: '2026-07-06T22:40', id: 'loop-be' },
      { ts: '2026-07-06T23:00', id: 'loop-be' },
      { ts: '2026-07-06T23:20', id: 'loop-be' },
      { ts: '2026-07-06T23:50', id: 'loop-be' },
    ])
    const r = await loops('graduate', '--loop', 'loop-be', '--json')
    const v = JSON.parse(r.out.join('\n')).verdicts[0]
    expect(v.canGraduate).toBe(true)
    expect(v.recommended).toBe('L3')
  })

  test('registry 缺失 → exit 3', async () => {
    expect((await loops('graduate')).code).toBe(3)
  })

  test('text 输出含 current/recommended/can-graduate', async () => {
    await healthySetup('loop-be', 'L1')
    const r = await loops('graduate')
    const out = r.out.join('\n')
    expect(out).toContain('loop-be')
    expect(out).toMatch(/L1/)
    expect(out).toMatch(/L2/)
  })
})

describe('真实 e2e —— level 查看/建议 + set 逐级毕业写回', () => {
  test('level view：打印当前档 + 建议档 + enforcement', async () => {
    await healthySetup('loop-be', 'L1')
    const r = await loops('level', 'loop-be')
    expect(r.code).toBe(0)
    const out = r.out.join('\n')
    expect(out).toContain('loop-be')
    expect(out).toMatch(/current=L1/)
    expect(out).toMatch(/report-only/)
  })

  test('set L2 --confirm（准入通过）→ 真写回 loops.yaml，autonomy_level 落盘 L2', async () => {
    await healthySetup('loop-be', 'L1')
    const before = await readRegistry()
    expect(before).toContain('autonomy_level: L1')
    const r = await loops('level', 'loop-be', 'set', 'L2', '--confirm')
    expect(r.code).toBe(0)
    const after = await readRegistry()
    expect(after).toContain('autonomy_level: L2')
    expect(after).not.toContain('autonomy_level: L1')
    // 真读回：graduate 现在认 current=L2
    const g = await loops('graduate', '--loop', 'loop-be', '--json')
    expect(JSON.parse(g.out.join('\n')).verdicts[0].current).toBe('L2')
  })

  test('set L2 无 --confirm → dry-run，loops.yaml 不落盘（默认不自动改档）', async () => {
    await healthySetup('loop-be', 'L1')
    const r = await loops('level', 'loop-be', 'set', 'L2')
    expect(r.code).toBe(0)
    expect(r.out.join('\n')).toMatch(/dry-run|--confirm|未改|未落盘/)
    expect(await readRegistry()).toContain('autonomy_level: L1') // 未变
  })

  test('L1 set L3（一步跨 2 级）→ 拒绝、exit≠0、loops.yaml 不变（绝不跨级）', async () => {
    await healthySetup('loop-be', 'L1')
    const r = await loops('level', 'loop-be', 'set', 'L3', '--confirm')
    expect(r.code).not.toBe(0)
    expect(r.err.join('\n')).toMatch(/跨级|逐级|cross/)
    expect(await readRegistry()).toContain('autonomy_level: L1')
  })

  test('set L2 但准入未过（就绪不足）→ 拒绝、不落盘', async () => {
    await writeRegistry(loopBlock({
      id: 'loop-min', cadence: '1h', changePrefix: null, maxTokens: null,
      goal: '收敛轻量内核子命令面移植', gates: ['问人'], kill: ['连续空轮'], designDoc: 'dd', autonomy: 'L1',
    }))
    await writeLoopDoc('loop-min')
    await writeRunLog([{ ts: '2026-07-06T23:30', id: 'loop-min' }])
    const r = await loops('level', 'loop-min', 'set', 'L2', '--confirm')
    expect(r.code).not.toBe(0)
    expect(await readRegistry()).toContain('autonomy_level: L1')
  })

  test('安全降档：L3 set L1 --confirm → 总允许，落盘 L1', async () => {
    await healthySetup('loop-be', 'L3')
    const r = await loops('level', 'loop-be', 'set', 'L1', '--confirm')
    expect(r.code).toBe(0)
    expect(await readRegistry()).toContain('autonomy_level: L1')
  })

  test('未知 loop id → exit 3', async () => {
    await healthySetup('loop-be', 'L1')
    expect((await loops('level', 'ghost')).code).toBe(3)
  })
})

describe('真实 e2e —— 跨命令串联（graduate → level set → graduate 同一真 registry）', () => {
  test('评估→逐级毕业→再评估，档位真实推进 L1→L2', async () => {
    await healthySetup('loop-be', 'L1')
    // ① graduate：可升
    expect(JSON.parse((await loops('graduate', '--json')).out.join('\n')).verdicts[0].canGraduate).toBe(true)
    // ② level set L2 --confirm：落盘
    expect((await loops('level', 'loop-be', 'set', 'L2', '--confirm')).code).toBe(0)
    // ③ graduate：current 已是 L2
    expect(JSON.parse((await loops('graduate', '--json')).out.join('\n')).verdicts[0].current).toBe('L2')
  })
})
