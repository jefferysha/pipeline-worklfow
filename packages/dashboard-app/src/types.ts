/**
 * 前端契约类型 —— 逐字镜像 packages/server GET /api/snapshot 的响应体（server/src/types.ts）。
 * server 是消费源，前端只读这些形状；改 server 契约须同步改此处（无 npm 依赖跨包，手抄以保零耦合）。
 */

/** snapshot 里单个 change 的投影（.pipeline.yaml 全字段 + 常读字段提升到顶层）。 */
export interface ChangeSnapshot {
  name: string
  path: string
  phase: string
  phase_status: string
  track: string
  preset: string
  archived: string
  updated_at: string
  fields: Record<string, string | string[]>
}

/** 单个已注册 Project 的聚合。 */
export interface ProjectSnapshot {
  root: string
  ok: boolean
  changes: ChangeSnapshot[]
  error?: string
}

/** GET /api/snapshot 的完整响应体。 */
export interface Snapshot {
  version: string
  generated_at: string
  /** 能力声明（GOAL B6）：前端按声明渲染，未接线域不谎报（Advanced 占位据此标注）。 */
  capabilities: Record<string, boolean>
  project_count: number
  change_count: number
  projects: ProjectSnapshot[]
}

// ── 流程规则镜像（单一真相源 = 老仓/新仓 templates/manifest.yaml，此处为前端只读镜像）──

export const PHASES = ['open', 'explore', 'spec', 'build', 'verify', 'ship', 'archive'] as const
export type Phase = (typeof PHASES)[number]

export const TRACKS = ['chat', 'pm', 'frontend', 'backend'] as const
export type Track = (typeof TRACKS)[number]

/**
 * review-gate 相位（manifest review_phases 镜像）：进入这些相位即落复核门 marker，
 * 是"在等我决定"的判据源（收件箱据此选卡，B10/病灶②的解法）。
 */
export const REVIEW_PHASES = ['explore', 'spec', 'verify'] as const

/** from → 合法目标相位（manifest transitions 镜像；verify 双出口 = ship/build 回退）。 */
export const TRANSITIONS: Record<Phase, readonly Phase[]> = {
  open: ['explore'],
  explore: ['spec'],
  spec: ['build'],
  build: ['verify'],
  verify: ['ship', 'build'],
  ship: ['archive'],
  archive: ['archive'],
}

/** phase 边 → 转换 event 名（逐边镜像 server/src/transition.ts TRANSITION_EVENTS）。 */
export const EVENT_BY_EDGE: Record<string, string> = {
  'open->explore': 'open-complete',
  'explore->spec': 'explore-complete',
  'spec->build': 'spec-complete',
  'build->verify': 'build-complete',
  'verify->ship': 'verify-pass',
  'verify->build': 'verify-fail',
  'ship->archive': 'ship-complete',
  'archive->archive': 'archived',
}

export function isPhase(v: string): v is Phase {
  return (PHASES as readonly string[]).includes(v)
}
