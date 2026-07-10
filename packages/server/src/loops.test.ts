import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadRegistry } from '@pipeline-lite/kernel'
import { applyLoopsUpdate, buildLoopsSnapshot } from './loops.js'

const LOOP_YAML = `version: 1
loops:
  - id: build-loop
    name: Build Loop
    kind: orchestrator
    goal: 保证每次构建都真跑八门验证不假绿保证每次构建都真跑八门验证
    cadence: 1h
    risk: medium
    runner: cron
    change_prefix: build-loop-
    phases: [build, verify]
    human_gates: [g1, g2]
    state: .superpowers/loops/progress.md
    design_doc: docs/build-loop.md
    status: active
    budget:
      max_runs_per_day: 24
      max_in_flight: 1
      on_exceed: skip
      max_tokens_per_day: 100000
    kill_criteria: [k1, k2]
    autonomy_level: L1
`

async function makeProjectWithLoop(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'loops-snap-'))
  await mkdir(join(root, '.pipeline'), { recursive: true })
  await writeFile(join(root, '.pipeline', 'loops.yaml'), LOOP_YAML, 'utf8')
  return root
}

describe('buildLoopsSnapshot', () => {
  it('聚合跨项目 loop，行带 root 字段消歧，含真 readiness/budget 计算', async () => {
    const rootA = await makeProjectWithLoop()
    const rootB = await makeProjectWithLoop() // 同 id（build-loop）不同项目，验证不冲突

    const snap = await buildLoopsSnapshot({ registry: () => [rootA, rootB], now: () => new Date('2026-07-07T00:00:00Z') })

    expect(snap.rows).toHaveLength(2)
    expect(snap.rows.map((r) => r.root).sort()).toEqual([rootA, rootB].sort())
    for (const row of snap.rows) {
      expect(row.id).toBe('build-loop')
      expect(row.autonomy_level).toBe('L1')
      expect(row.readiness.score).toBeGreaterThanOrEqual(0)
      expect(row.budget.breaker).toBe('ok')
    }
  })

  it('项目没有 loops.yaml → 该项目贡献 0 行，不报错、不跳过其它项目', async () => {
    const rootNoLoops = await mkdtemp(join(tmpdir(), 'loops-snap-empty-'))
    const rootWithLoop = await makeProjectWithLoop()
    const snap = await buildLoopsSnapshot({ registry: () => [rootNoLoops, rootWithLoop], now: () => new Date() })
    expect(snap.rows).toHaveLength(1)
    expect(snap.rows[0]?.root).toBe(rootWithLoop)
  })
})

describe('applyLoopsUpdate —— loops.yaml 字段写回（v5 T3，POST /api/loops/update 的写回逻辑）', () => {
  it('patch 标量 + budget + allowlist/denylist → 真改盘，loadRegistry 读回一致', async () => {
    const root = await makeProjectWithLoop()
    const r = await applyLoopsUpdate(root, 'build-loop', {
      cadence: '2h',
      max_runs_per_day: 12,
      allowlist: ['src/**'],
      denylist: ['secrets/**'],
    })
    expect(r).toEqual({ ok: true })
    const { data, errors } = loadRegistry(root)
    expect(errors).toEqual([])
    const loop = data!.loops[0]!
    expect(loop.cadence).toBe('2h')
    expect(loop.budget.max_runs_per_day).toBe(12)
    expect(loop.allowlist).toEqual(['src/**'])
    expect(loop.denylist).toEqual(['secrets/**'])
  })

  it('未知 loop id → ok:false，盘上文件不动', async () => {
    const root = await makeProjectWithLoop()
    const before = await readFile(join(root, '.pipeline', 'loops.yaml'), 'utf8')
    const r = await applyLoopsUpdate(root, 'ghost-loop', { cadence: '2h' })
    expect(r.ok).toBe(false)
    expect('error' in r && r.error).toContain('ghost-loop')
    expect(await readFile(join(root, '.pipeline', 'loops.yaml'), 'utf8')).toBe(before)
  })

  it('autonomy_level 不收（走 /api/loops/level）→ ok:false', async () => {
    const root = await makeProjectWithLoop()
    const r = await applyLoopsUpdate(root, 'build-loop', { autonomy_level: 'L3' })
    expect(r.ok).toBe(false)
    expect('error' in r && r.error).toContain('autonomy_level')
  })

  it('patch 后 schema 校验失败（cadence 不合 pattern）→ ok:false 携定位错误，不落盘', async () => {
    const root = await makeProjectWithLoop()
    const before = await readFile(join(root, '.pipeline', 'loops.yaml'), 'utf8')
    const r = await applyLoopsUpdate(root, 'build-loop', { cadence: 'whenever-i-feel-like' })
    expect(r.ok).toBe(false)
    expect('errors' in r && r.errors!.some((e) => e.includes('cadence'))).toBe(true)
    expect(await readFile(join(root, '.pipeline', 'loops.yaml'), 'utf8')).toBe(before)
  })

  it('loops.yaml 不存在 → ok:false（不是 throw）', async () => {
    const root = await mkdtemp(join(tmpdir(), 'loops-upd-none-'))
    const r = await applyLoopsUpdate(root, 'build-loop', { cadence: '2h' })
    expect(r.ok).toBe(false)
  })
})
