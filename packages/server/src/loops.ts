/**
 * loops 治理跨项目聚合读（新增，server 零新依赖）——kernel 的 loadRegistry/computeReadiness/
 * computeBudgetStatus 都是单 repoRoot 的，这里对机器级注册的每个项目各跑一遍再拼一份
 * dashboard 用的扁平行列表。LoopEntry.id 只在单项目内唯一，聚合后用 root 字段消歧
 * （不假设跨项目全局唯一，不做 id 改写）。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  computeBudgetStatus,
  computeReadiness,
  loadRegistry,
  type AutonomyLevel,
  type BudgetStatus,
  type ReadinessScore,
} from '@pipeline-lite/kernel'

export interface LoopRow {
  root: string
  id: string
  name: string
  autonomy_level: AutonomyLevel
  status: string
  readiness: ReadinessScore
  budget: BudgetStatus
}

export interface LoopsSnapshot {
  generated_at: string
  rows: LoopRow[]
}

export interface LoopsSnapshotDeps {
  registry: () => string[]
  now: () => Date
}

function readRunLogText(root: string): string | null {
  try {
    return readFileSync(join(root, '.superpowers', 'loops', 'progress.md'), 'utf8')
  } catch {
    return null
  }
}

export async function buildLoopsSnapshot(deps: LoopsSnapshotDeps): Promise<LoopsSnapshot> {
  const now = deps.now()
  const rows: LoopRow[] = []
  for (const root of deps.registry()) {
    const { data } = loadRegistry(root)
    if (!data) continue
    const runLogText = readRunLogText(root)
    for (const loop of data.loops) {
      rows.push({
        root,
        id: loop.id,
        name: loop.name,
        autonomy_level: loop.autonomy_level,
        status: loop.status,
        readiness: computeReadiness(loop),
        budget: computeBudgetStatus(loop, runLogText, now),
      })
    }
  }
  return { generated_at: now.toISOString(), rows }
}
