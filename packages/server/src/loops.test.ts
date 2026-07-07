import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildLoopsSnapshot } from './loops.js'

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
