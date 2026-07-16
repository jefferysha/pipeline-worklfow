/**
 * 工作台静态数据（T18 自 settings/ 迁入——旧设置视图 退役）—— 阶段轴 + 阶段×轨道强制技能矩阵。
 * 消费方：workbench/mandatorySkills（画布 default 泳道技能区）与 workbench/SkillChain。
 *
 * 均为 templates/manifest.yaml（单一真相源）的前端只读镜像，作用**只是兜底**：/api/config 不可达
 * 或非 2xx 时回落到这里显示（mandatorySkills.tsx:85,89），且该态下所有写入口一律 disabled——
 * 镜像可能与 server 真值不符，给能点的按钮就是谎报。真值的读写都在 server 侧：写回端点
 * POST /api/config/mandatory-skills 直改 manifest.yaml（仅收 pm/frontend/backend，见
 * server/src/config.ts 的 EDITABLE_TRACKS；`_all` 与 archive 拒写）。
 */
import { PHASES, REVIEW_PHASES, TRACKS, TRANSITIONS } from '../types'

export { PHASES, REVIEW_PHASES, TRACKS, TRANSITIONS }

/** 矩阵展示用轨道（chat 无强制表，矩阵列取 pm/frontend/backend，同 manifest mandatory_skills 键空间）。 */
export const MATRIX_TRACKS = ['pm', 'frontend', 'backend'] as const

/** manifest mandatory_skills 镜像（键 = 'phase.track'；_all = 兜底）。 */
export const MANDATORY_SKILLS: Record<string, string[]> = {
  'open._all': ['opsx:propose|openspec-propose'],
  'explore.pm': ['superpowers:brainstorming', 'grill-with-docs'],
  'explore.frontend': ['opsx:explore|openspec-explore', 'superpowers:brainstorming', 'grill-with-docs'],
  'explore.backend': ['opsx:explore|openspec-explore', 'superpowers:brainstorming', 'grill-with-docs', 'improve-codebase-architecture'],
  'spec.pm': ['superpowers:brainstorming', 'grill-with-docs'],
  'spec.frontend': ['opsx:propose|openspec-propose', 'superpowers:writing-plans'],
  'spec.backend': ['opsx:propose|openspec-propose', 'superpowers:writing-plans'],
  'build.pm': ['prototype|huashu-design', 'frontend-design', 'design-taste-frontend|taste-skill'],
  'build.frontend': ['superpowers:test-driven-development', 'frontend-design', 'web-design-guidelines', 'design-taste-frontend|taste-skill'],
  'build.backend': ['superpowers:writing-plans', 'superpowers:test-driven-development'],
  'verify.pm': ['browser-qa', 'web-design-guidelines', 'design-taste-frontend|taste-skill', 'superpowers:verification-before-completion'],
  'verify.frontend': ['superpowers:verification-before-completion', 'e2e-testing', 'browser-qa', 'verify|verification-loop', 'web-design-guidelines', 'design-taste-frontend|taste-skill'],
  'verify.backend': ['superpowers:verification-before-completion'],
  'ship.pm': ['to-spec', 'to-tickets'],
  'ship.frontend': ['opsx:apply|openspec-apply-change', 'opsx:archive|openspec-archive-change', 'superpowers:finishing-a-development-branch', 'commit-commands:commit-push-pr'],
  'ship.backend': ['opsx:apply|openspec-apply-change', 'superpowers:finishing-a-development-branch', 'commit-commands:commit-push-pr'],
}

/** 某 phase×track 的强制 skill（含 _all 兜底，同 manifest 三级回退 per-track → _all → 空）。 */
export function mandatoryFor(phase: string, track: string): string[] {
  const perTrack = MANDATORY_SKILLS[`${phase}.${track}`]
  if (perTrack) return perTrack
  const all = MANDATORY_SKILLS[`${phase}._all`]
  return all ?? []
}

export function isReviewGate(phase: string): boolean {
  return (REVIEW_PHASES as readonly string[]).includes(phase)
}
