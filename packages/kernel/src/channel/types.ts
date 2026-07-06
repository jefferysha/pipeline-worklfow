/**
 * channel 类型契约 —— event-sourced worker 总线的数据形。
 * 老仓真相源：skills/pipeline/scripts/channel/{events,worker_state,thread_state}.py。
 *
 * 存储模型：每个 channel 一条 append-only events.jsonl（每行一个事件）。所有派生状态
 * （worker registry / thread / inbox 计数）都是从 events.jsonl 纯函数投影（event-sourcing），
 * 磁盘上不存派生态。seq 由 append 内部分配、单调递增。
 */

/** 事件来源（events.py:38 VALID_ORIGINS）。 */
export type ChannelOrigin = 'cli' | 'api' | 'worker'

/** channel 作用域：project=cwd 桶；global=_global 桶（paths.py bucket_for）。 */
export type Scope = 'project' | 'global'

/** 投递模式（filters.py classify_delivery）。 */
export type DeliveryMode = 'appendOnly' | 'requireKnownWorker' | 'requireRunningWorker'

/** worker inbox 策略（filters.py matches_inbox_policy）。 */
export type InboxPolicy = 'explicitOnly' | 'broadcastAndExplicit'

/** worker 生命周期（worker_state.py 两正交维度之一）。 */
export type WorkerLifecycle = 'starting' | 'running' | 'done' | 'error' | 'killed' | 'crashed'

/** worker 活动态（worker_state.py 两正交维度之二）。 */
export type WorkerActivity = 'idle' | 'mid-turn'

/**
 * 一个 channel 事件（events.jsonl 的一行）。seq/ts 必有（append 分配）；kind/by 必有；
 * to/origin/idempotencyKey/meta 通用可选；其余 kind-specific 字段经索引签名容纳
 * （worker/as/turnId/inputSeq/action/thread/status/... 见 events.py:_build_partial）。
 */
export interface ChannelEvent {
  seq: number
  ts: string
  kind: string
  by: string
  to?: string | string[]
  origin?: ChannelOrigin
  idempotencyKey?: string
  meta?: Record<string, unknown>
  [key: string]: unknown
}

/** append 前的事件雏形（seq/ts 由 append 覆盖/注入；kind/by 必填）。 */
export interface EventPartial {
  kind: string
  by: string
  to?: string | string[]
  origin?: ChannelOrigin
  idempotencyKey?: string
  meta?: Record<string, unknown>
  ts?: string
  [key: string]: unknown
}

/** reduceWorkerRegistry 投影出的单 worker 态（worker_state.py:46 _new_worker + 各 kind 派生）。 */
export interface WorkerState {
  id: string
  lifecycle: WorkerLifecycle
  activity: WorkerActivity
  terminal: boolean
  inboxPolicy: InboxPolicy
  pendingMessageCount: number
  activeTurnId?: string | null
  activeTurnStartedAt?: string
  spawnedAt?: string
  idleSince?: string
  startedBy?: string
  provider?: unknown
  agent?: unknown
  exitCode?: unknown
  exitSignal?: unknown
  reason?: unknown
  signal?: unknown
  error?: unknown
  updatedAt?: string
  lastSeq?: number
  channel?: string
}

/** reduceThreads 投影出的单 thread 态（thread_state.py:147 _new_state + 各 action 派生）。 */
export interface ThreadState {
  thread: string
  status: string
  labels: string[]
  assignees: string[]
  lastSeq: number
  comments: number
  aliases: string[]
  title?: string
  description?: string
  summary?: string
  openedAt?: string
  updatedAt?: string
  context?: unknown[]
}

/** classifyDelivery 的失败原因。 */
export type UndeliverableReason = 'worker-unknown' | 'worker-terminal'
