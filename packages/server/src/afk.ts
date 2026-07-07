/**
 * afk 域 —— AFK Sandcastle 指挥面数据端 + 写回（BACKLOG #29d / GOAL A5，afk-workbench Task 4 起加写）。
 *
 * 聚合各 change 的 automation_* 字段（kernel StateStore 已随 snapshot 读进 change.fields）→
 *   ① AFK 泳道数据：queued / running / merged / failed / conflict / paused；
 *   ② 调度器 doctor 灯：健康摘要（ok / busy / attention）；
 *   ③ 调度器流水 log：从 automation_queued_at / automation_last_error 派生的活动流；
 *   ④ cancelAfkRun（afk-workbench Task 4）：POST /api/afk/:name/cancel 的写回逻辑——落取消标记
 *     文件 + docker kill 容器，见该函数头注释。
 *
 * server 零第三方依赖：本模块只消费已构造的 Snapshot（kernel 读出的字段），**不 import
 * @pipeline-lite/automation 运行时**——automation 的 AUTOMATION_STATES 是语义真相源，此处以
 * 字面量对位并注释指明，避免把 server 的 tsc 构建耦合到 automation 包（只读语义，不建依赖）。
 * automation 字段生命周期与 8 态枚举见 packages/automation/src/types.ts（AUTOMATION_STATES）。
 * 同一零依赖原则延伸到 cancelAfkRun 的取消标记文件名——见下方 CANCEL_MARKER_FILE 常量注释。
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { StateStore } from '@pipeline-lite/kernel'
import type { Snapshot } from './types.js'

/** AFK 泳道（对位 automation AUTOMATION_STATES 的活跃子集；off 不入板，scheduled 归 running，见 laneOf）。 */
export const AFK_LANES = ['queued', 'running', 'merged', 'failed', 'conflict', 'paused'] as const
export type AfkLane = (typeof AFK_LANES)[number]

export interface AfkCard {
  name: string
  root: string
  path: string
  phase: string
  /** 原始 automation 字段值（含 scheduled 等未折叠态）。 */
  automation: string
  lane: AfkLane
  attempts: number
  queued_at: string
  last_error: string
  sandbox: string
  worktree: string
  preserved_path: string
}

/** 调度器 doctor 灯：ok（无活跃）/ busy（有排队或在跑）/ attention（有 failed/conflict 待人工）。 */
export interface SchedulerHealth {
  status: 'ok' | 'busy' | 'attention'
  queued: number
  running: number
  merged: number
  failed: number
  conflict: number
  paused: number
  /** 非 off 的 change 总数（进入过自动化路径的）。 */
  total: number
  message: string
}

export interface AfkSnapshot {
  generated_at: string
  scheduler: SchedulerHealth
  lanes: Record<AfkLane, AfkCard[]>
  cards: AfkCard[]
}

export interface AfkLogEntry {
  ts: string
  name: string
  root: string
  automation: string
  kind: 'queued' | 'error' | 'state'
  detail: string
}

export interface AfkLog {
  generated_at: string
  entries: AfkLogEntry[]
}

function str(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v.join(',')
  return v ?? ''
}

/** automation 态 → 泳道。off / 空 / 未知 → null（不入板）；scheduled（已认领在飞）→ running。 */
export function laneOf(automation: string): AfkLane | null {
  switch (automation) {
    case 'queued':
      return 'queued'
    case 'scheduled':
    case 'running':
      return 'running'
    case 'merged':
      return 'merged'
    case 'failed':
      return 'failed'
    case 'conflict':
      return 'conflict'
    case 'paused':
      return 'paused'
    default:
      return null
  }
}

function emptyLanes(): Record<AfkLane, AfkCard[]> {
  return { queued: [], running: [], merged: [], failed: [], conflict: [], paused: [] }
}

/** 从一个 change 投影（automation=off/未知 → null，不入板）。 */
function cardOf(root: string, c: Snapshot['projects'][number]['changes'][number]): AfkCard | null {
  const automation = str(c.fields.automation)
  const lane = laneOf(automation)
  if (!lane) return null
  const attemptsRaw = Number(str(c.fields.automation_attempts) || '0')
  return {
    name: c.name,
    root,
    path: c.path,
    phase: c.phase,
    automation,
    lane,
    attempts: Number.isFinite(attemptsRaw) ? attemptsRaw : 0,
    queued_at: str(c.fields.automation_queued_at),
    last_error: str(c.fields.automation_last_error),
    sandbox: str(c.fields.automation_sandbox),
    worktree: str(c.fields.automation_worktree),
    preserved_path: str(c.fields.automation_preserved_path),
  }
}

/** 聚合快照 → AFK 泳道 + 调度器灯。off 的 change 被排除（不入 cards/lanes/total）。 */
export function buildAfkSnapshot(snapshot: Snapshot, clock: () => string): AfkSnapshot {
  const lanes = emptyLanes()
  const cards: AfkCard[] = []
  for (const proj of snapshot.projects) {
    for (const c of proj.changes) {
      const card = cardOf(proj.root, c)
      if (!card) continue
      cards.push(card)
      lanes[card.lane].push(card)
    }
  }
  // 稳定排序：泳道内按名，flat cards 亦按名（可预测输出，测试可断言）。
  const byName = (a: AfkCard, b: AfkCard): number => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  for (const lane of AFK_LANES) lanes[lane].sort(byName)
  cards.sort(byName)

  const queued = lanes.queued.length
  const running = lanes.running.length
  const merged = lanes.merged.length
  const failed = lanes.failed.length
  const conflict = lanes.conflict.length
  const paused = lanes.paused.length
  const total = cards.length

  const attention = failed + conflict > 0
  const status: SchedulerHealth['status'] = attention ? 'attention' : queued + running > 0 ? 'busy' : 'ok'
  const message = attention
    ? `调度器需人工介入：${failed} failed / ${conflict} conflict（现场已保留）`
    : queued + running > 0
      ? `调度器运行中：${running} 在跑 / ${queued} 排队`
      : total > 0
        ? `无活跃任务：${merged} 已合并 / ${paused} 暂停`
        : 'AFK 空闲（无自动化任务）'

  return {
    generated_at: clock(),
    scheduler: { status, queued, running, merged, failed, conflict, paused, total, message },
    lanes,
    cards,
  }
}

/**
 * 调度器流水 —— 从 automation_* 派生的活动流（老仓 afkObserver/kanbanDisplay 的旁路上板对位面）。
 * 每个非 off 的 change 贡献：queued_at → 'queued' 流水；last_error → 'error' 流水；当前态 → 'state' 流水。
 * 按时间戳降序（缺时间戳者排后，回落 generated_at）。
 */
export function buildAfkLog(snapshot: Snapshot, clock: () => string): AfkLog {
  const now = clock()
  const entries: AfkLogEntry[] = []
  for (const proj of snapshot.projects) {
    for (const c of proj.changes) {
      const card = cardOf(proj.root, c)
      if (!card) continue
      const anchor = card.queued_at || now
      if (card.queued_at) {
        entries.push({ ts: card.queued_at, name: card.name, root: card.root, automation: card.automation, kind: 'queued', detail: '已挂队（automation=queued）' })
      }
      if (card.last_error) {
        entries.push({ ts: anchor, name: card.name, root: card.root, automation: card.automation, kind: 'error', detail: card.last_error })
      }
      entries.push({ ts: anchor, name: card.name, root: card.root, automation: card.automation, kind: 'state', detail: `当前态 automation=${card.automation}` })
    }
  }
  entries.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0))
  return { generated_at: now, entries }
}

/**
 * 取消标记文件名——**必须**与 packages/automation/src/lifecycle/worktree.ts 导出的
 * `CANCEL_MARKER_FILE` 字面量保持一致（`runChangeInSandbox` 结算时探测的正是这个文件名）。
 * 本应直接 import 该常量，但 server 对 automation 包坚持零运行时依赖（同上方模块头注释 /
 * AUTOMATION_STATES 的既有先例）：packages/server/package.json 未把 @pipeline-lite/automation
 * 列为 dependency，packages/server/tsconfig.json 的 `references` 也未包含 `../automation`——
 * 即便 npm workspace 会把 automation hoist 进根 node_modules 使得 import 在运行时"能用"，
 * 那也是绕开声明依赖图的隐式耦合，且会让 server 的 `tsc -b` 构建顺序悄悄依赖一个未声明的
 * project reference。故沿用文件头已定的字面量对位模式，而非在此开一个例外。
 * 两侧字面量的漂移风险由 automation 侧 worktree.test.ts 断言 CANCEL_MARKER_FILE 的字面量值兜底。
 */
const CANCEL_MARKER_FILE = '.cancel-requested'

/**
 * afk-workbench Task 4：POST /api/afk/:name/cancel 的写回逻辑。
 * 前置：changeDir 须真存在（有 .pipeline.yaml，同 transition.ts 的存在性前置校验——kernel
 * StateStore.get/read 对不存在的 changeDir 是真 throw ENOENT，不判在此拦，会在 handlePost
 * 顶层兜底 catch 里变成走味的 500，而非本端点该给的 400）；automation 字段须为 'running'
 * （否则视为找不到运行中的 job）；automation_worktree/automation_sandbox 须非空（Task 1
 * 已确保二者在 running 态下非空，此处仍防御性校验）。
 * 顺序：先落取消标记文件（worktree 根），再 docker kill 容器——与 automation 侧
 * `runChangeInSandbox` 结算时"先探测标记、再判定是否 CancelledRunError"的读取顺序对应，
 * 保证标记先于 kill 造成的非零退出到场，不会被误判成瞬态失败走 classify 的 retry 分支。
 * docker kill 失败（容器已退出/已不存在等）不视为本端点的错误——标记已落即达成取消意图，
 * 真正的结算判定权在 automation 侧的 hasCancelMarker 探测，不在这次 kill 的 exec 退出码。
 */
export async function cancelAfkRun(store: StateStore, changeDir: string): Promise<{ ok: boolean; error?: string }> {
  if (!existsSync(join(changeDir, '.pipeline.yaml'))) {
    return { ok: false, error: '找不到该 change（无 .pipeline.yaml），找不到运行中的 job' }
  }
  const automation = str(await store.get(changeDir, 'automation'))
  if (automation !== 'running') {
    return { ok: false, error: `automation 状态是 '${automation || '(空)'}'，不是 running，找不到运行中的 job` }
  }
  const worktree = str(await store.get(changeDir, 'automation_worktree'))
  const sandbox = str(await store.get(changeDir, 'automation_sandbox'))
  if (!worktree || !sandbox) {
    return { ok: false, error: '缺 automation_worktree/automation_sandbox，无法定位容器' }
  }
  await writeFile(join(worktree, CANCEL_MARKER_FILE), '1', 'utf8')
  await new Promise<void>((resolve) => {
    execFile('docker', ['kill', sandbox], () => resolve()) // kill 失败（容器已退出）不视为错误
  })
  return { ok: true }
}
