/**
 * afkData —— AFK 指挥面数据端客户端（消费 packages/server GET /api/afk/snapshot，#29d）。
 * 形状逐字镜像 server/src/afk.ts（server 是真相源；此处前端只读镜像，零跨包 npm 依赖）。
 */

export const AFK_LANES = ['queued', 'running', 'merged', 'failed', 'conflict', 'paused'] as const
export type AfkLane = (typeof AFK_LANES)[number]

export interface AfkCard {
  name: string
  root: string
  path: string
  phase: string
  automation: string
  lane: AfkLane
  attempts: number
  queued_at: string
  last_error: string
  sandbox: string
  worktree: string
  preserved_path: string
}

export interface SchedulerHealth {
  status: 'ok' | 'busy' | 'attention'
  queued: number
  running: number
  merged: number
  failed: number
  conflict: number
  paused: number
  total: number
  message: string
}

export interface AfkSnapshot {
  generated_at: string
  scheduler: SchedulerHealth
  lanes: Record<AfkLane, AfkCard[]>
  cards: AfkCard[]
}

/** 拉 AFK 快照（同源 GET；失败抛 Error，面板据此呈错误态）。 */
export async function fetchAfkSnapshot(): Promise<AfkSnapshot> {
  const res = await fetch('/api/afk/snapshot', { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`AFK 数据端获取失败（${res.status}）`)
  return (await res.json()) as AfkSnapshot
}
