import { ArrowRight } from 'lucide-react'
import type { WbSkillEntry } from '../api/client'
import { skillPresentation } from './skillPresentation'

export function skillExecutionWaves(
  skills: readonly string[],
  depsBySkill: Readonly<Record<string, string[]>>,
): string[][] {
  const skillSet = new Set(skills)
  const memo = new Map<string, number>()

  function depthOf(skillId: string, trail: ReadonlySet<string>): number {
    const cached = memo.get(skillId)
    if (cached !== undefined) return cached
    if (trail.has(skillId)) return 0
    const nextTrail = new Set(trail).add(skillId)
    const dependencies = (depsBySkill[skillId] ?? []).filter((dependency) => skillSet.has(dependency))
    const depth = dependencies.length === 0
      ? 0
      : Math.max(...dependencies.map((dependency) => depthOf(dependency, nextTrail))) + 1
    memo.set(skillId, depth)
    return depth
  }

  const waves: string[][] = []
  for (const skillId of skills) {
    const depth = depthOf(skillId, new Set())
    const wave = waves[depth] ?? []
    wave.push(skillId)
    waves[depth] = wave
  }
  return waves.filter((wave) => wave.length > 0)
}

export function SkillExecutionTopology({
  skills,
  depsBySkill,
  registry,
  testId,
  compact = false,
}: {
  skills: readonly string[]
  depsBySkill: Readonly<Record<string, string[]>>
  registry: WbSkillEntry[] | null | undefined
  testId: string
  compact?: boolean
}): JSX.Element {
  const waves = skillExecutionWaves(skills, depsBySkill)

  return (
    <div data-testid={testId} className={compact ? 'overflow-x-auto rounded-xl bg-fill/80 p-3' : 'overflow-x-auto rounded-2xl border border-border bg-card p-4'}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-text">调用顺序</h3>
          <p className="mt-0.5 text-[11px] leading-4 text-text-3">同一批并行；箭头之后串行进入下一批</p>
        </div>
        <span className="flex-none rounded-full bg-card px-2.5 py-1 text-[11px] font-semibold text-text-2 shadow-sm">{waves.length} 个批次</span>
      </div>
      {waves.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-2 px-4 py-6 text-center text-sm text-text-3">添加 Skill 后显示真实调用链</div>
      ) : (
        <div className="flex min-w-max items-stretch gap-2" aria-label="Skill 串并行执行拓扑">
          {waves.map((wave, waveIndex) => (
            <div key={`${waveIndex}-${wave.join('-')}`} className="flex items-center gap-2">
              <div className={compact ? 'min-w-36 rounded-xl bg-card p-2 shadow-sm' : 'min-w-40 rounded-xl bg-fill p-2.5'} data-testid={`${testId}-wave-${waveIndex + 1}`}>
                <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-semibold text-text-3">
                  <span>第 {waveIndex + 1} 批</span>
                  <span>{wave.length > 1 ? `${wave.length} 项并行` : '单项执行'}</span>
                </div>
                <div className="space-y-1.5">
                  {wave.map((skillId) => (
                    <div key={skillId} className={compact ? 'rounded-lg bg-fill px-2.5 py-2 text-xs font-semibold text-text' : 'rounded-lg bg-card px-3 py-2 text-xs font-semibold text-text shadow-sm'}>
                      {skillPresentation(skillId, registry).name}
                    </div>
                  ))}
                </div>
              </div>
              {waveIndex < waves.length - 1 && (
                <span className="flex flex-col items-center gap-0.5 text-[9px] font-semibold text-accent-d">
                  <ArrowRight className="h-5 w-5 flex-none" aria-hidden="true" />
                  <span>串行进入</span>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
