/**
 * filters —— 三过滤：matchesInboxPolicy / classifyDelivery / matchesEventFilter（纯逻辑 SOT）。
 * 老仓真相源：skills/pipeline/scripts/channel/filters.py（matches_inbox_policy:31 / classify_delivery:45
 *   / matches_event_filter:68 / MEANINGFUL_EVENT_KINDS:13）。
 *
 * 铁律（不可阉割，与老仓一致）：
 *   · matchesInboxPolicy 是 reducer/delivery/supervisor 三处共用 SOT，worker 永不消费自身 message。
 *   · classifyDelivery 纯从 durable registry 判，绝不查 OS liveness；broadcast 永不 undeliverable。
 *   · matchesEventFilter 的"显式 kind 旁路 meaningful 门"——让 wait --kind supervisor_warning 能工作。
 */
import type { ChannelEvent, DeliveryMode, InboxPolicy, UndeliverableReason, WorkerState } from './types.js'

/** watch/wait 默认只关心的 12 种"有意义"事件（filters.py:13）。 */
export const MEANINGFUL_EVENT_KINDS: ReadonlySet<string> = new Set([
  'create', 'join', 'leave', 'message', 'thread', 'context', 'channel',
  'spawned', 'killed', 'respawned', 'done', 'error',
])

/** 事件的目标列表（to 归一为 string[]，filters.py:19 _targets）。 */
function targets(ev: ChannelEvent): string[] {
  const to = ev.to
  if (to === undefined || to === null) return []
  if (typeof to === 'string') return to ? [to] : []
  if (Array.isArray(to)) return to.filter((t): t is string => typeof t === 'string' && t.length > 0)
  return []
}

/** 这条 message 进不进某 worker 的收件箱（filters.py:31）。 */
export function matchesInboxPolicy(
  ev: ChannelEvent,
  workerId: string,
  policy: InboxPolicy = 'explicitOnly',
): boolean {
  if (ev.kind !== 'message') return false
  if (ev.by === workerId) return false // worker 不消费自己发的
  const tg = targets(ev)
  if (tg.length > 0) return tg.includes(workerId)
  // broadcast（无目标）→ 仅 broadcastAndExplicit 收
  return policy === 'broadcastAndExplicit'
}

/**
 * 返回 [[target, reason], ...]（filters.py:45）。
 * appendOnly → 恒空（保留 pre-spawn backlog）；broadcast（无 target）→ 永不产生。
 * 纯从 durable registry 判，绝不查 OS liveness。
 */
export function classifyDelivery(
  targetList: string[],
  registryWorkers: WorkerState[],
  mode: DeliveryMode = 'requireRunningWorker',
): [string, UndeliverableReason][] {
  if (mode === 'appendOnly') return []
  if (targetList.length === 0) return [] // broadcast 永不 undeliverable
  const known = new Map(registryWorkers.map((w) => [w.id, w]))
  const out: [string, UndeliverableReason][] = []
  for (const t of targetList) {
    const w = known.get(t)
    if (w === undefined) {
      out.push([t, 'worker-unknown'])
    } else if (mode === 'requireRunningWorker' && w.terminal) {
      out.push([t, 'worker-terminal'])
    }
    // requireKnownWorker：已知即可，terminal 也算投得到
  }
  return out
}

/** matchesEventFilter 的调用方信号（filters.py:68 的关键字参数）。 */
export interface EventFilterOptions {
  selfId?: string
  /** 调用方"我要啥"信号：string / string[] / undefined。 */
  wantKind?: string | string[]
  includeNonMeaningful?: boolean
  includeProgress?: boolean
  /** 白名单 by。 */
  fromBy?: string | string[]
  /** string / string[] / "exclusive"（只要有目标的）。 */
  toFilter?: string | string[] | 'exclusive'
  threadKey?: string
  threadAction?: string
}

/** watch/wait/messages 共用的事件过滤（filters.py:68）。 */
export function matchesEventFilter(ev: ChannelEvent, opts: EventFilterOptions = {}): boolean {
  const kind = ev.kind
  const by = ev.by

  // 1. self 排除
  if (opts.selfId !== undefined && by === opts.selfId) return false

  // 2. hasExplicitKind = 调用方"我知道我要啥" → 旁路 meaningful 门
  const hasExplicitKind =
    (typeof opts.wantKind === 'string' && opts.wantKind.length > 0) ||
    (Array.isArray(opts.wantKind) && opts.wantKind.length > 0)

  // 3. 非 includeNonMeaningful 且 非 explicit 且 不在 meaningful 集 → 排除
  if (!opts.includeNonMeaningful && !hasExplicitKind && !MEANINGFUL_EVENT_KINDS.has(kind)) {
    return false
  }

  // 4. progress 默认排除
  if (!opts.includeProgress && kind === 'progress' && !hasExplicitKind) return false

  // 5. matchesKind
  if (opts.wantKind !== undefined) {
    if (typeof opts.wantKind === 'string') {
      if (opts.wantKind && kind !== opts.wantKind) return false
    } else if (opts.wantKind.length > 0) {
      if (!opts.wantKind.includes(kind)) return false
    }
  }

  // 6. thread / action 过滤
  if (opts.threadKey !== undefined) {
    if (kind !== 'thread' || ev.thread !== opts.threadKey) return false
  }
  if (opts.threadAction !== undefined) {
    if (kind !== 'thread' || ev.action !== opts.threadAction) return false
  }

  // 7. from（白名单 by）
  if (opts.fromBy !== undefined) {
    const allow = typeof opts.fromBy === 'string' ? [opts.fromBy] : opts.fromBy
    if (!allow.includes(by)) return false
  }

  // 8. to
  if (opts.toFilter !== undefined) {
    const tg = targets(ev)
    if (opts.toFilter === 'exclusive') {
      if (tg.length === 0) return false
    } else {
      const want = typeof opts.toFilter === 'string' ? [opts.toFilter] : opts.toFilter
      if (tg.length > 0 && !tg.some((t) => want.includes(t))) return false
    }
  }

  return true
}
