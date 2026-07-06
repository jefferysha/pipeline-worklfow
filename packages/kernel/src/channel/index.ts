/**
 * channel —— event-sourced worker 总线内核（BACKLOG #27 / GOAL A4 M4）。
 *
 * 正交持久 worker 层：event-sourced 消息/事件总线 + 从事件流重建 worker/inbox/thread 状态。
 * 与 build→verify barrier 正交，★绝不触 barrier / confirm-review-interaction 三门 / build_sha /
 * git-commit；只读地为 barrier 提供 worker 事实（有几个活 worker、预算是否耗尽）。
 * 纯逻辑 + 注入 fs 面，零第三方依赖。CLI 薄壳在 packages/cli/src/commands/channel.ts。
 *
 * ── 老仓真相源（skills/pipeline/scripts/channel/*.py，约 20 模块）─────────────────────────────
 *   events.py       21 kind 白名单 + parseKind + 幂等 + append-only JSONL      → events.ts / store.ts
 *   seq.py          .seq 侧车 + reconcileSeq 自修（jsonl 尾为真相，宁崩不猜）    → seq.ts / store.ts
 *   paths.py        scope + Project 桶解析（cwd sanitize，_global 桶）           → paths.ts
 *   worker_state.py reduceWorkerRegistry（lifecycle × activity 两正交维度投影）   → worker-state.ts
 *   filters.py      matchesInboxPolicy / classifyDelivery / matchesEventFilter    → filters.ts
 *   thread_state.py forum thread 投影 + rename 别名链 + thread-board 渲染          → thread-state.ts
 *   turns.py        TurnTracker 主机本地 turn 栈（idle↔mid-turn hook）            → turns.ts
 *   guard.py        idle 清理谓词 + spawn 预算裁决 + overflow 文本（只读事实）      → guard.ts
 *
 * ── event-sourced 核心语义 ────────────────────────────────────────────────────────────────
 *   存储模型：每 channel 一条 append-only events.jsonl（每行一事件）+ .seq 侧车（纯缓存，可重建）。
 *   所有派生状态（worker registry / thread / inbox 计数）都是从事件流纯函数投影，磁盘不存派生态。
 *   seq 由 append 内部分配、单调递增（宁崩不猜、绝不留空洞）。可在任意机器一致重放。
 *
 * ── 本批范围 vs 留后续 ────────────────────────────────────────────────────────────────────
 *   ✅ 本批（事件模型 + 状态重建 + 只读事实）：event log（append/read/reconcile/list）、seq、paths、
 *      worker registry 投影、三过滤、thread 投影、TurnTracker、guard 纯决策核心。
 *   ⏳ 留后续（进程管理层，非纯逻辑）：supervisor 三循环编排 + 真 spawn 子进程（claude/codex/echo）、
 *      inbox_watcher 真 tail→stdin 桥接、stdout_pump、idle/warning timer、shutdown 信号漏斗、
 *      guard 的 OS liveness 四重判定（pid/os.kill/ps）+ SIGTERM cleanup、watch.py 增量 tail、
 *      adapters（provider 编码）。这些需真进程/OS 信号，不在"事件模型 + 状态重建"批次内。
 */

// 类型契约
export type {
  ChannelEvent,
  ChannelOrigin,
  DeliveryMode,
  EventPartial,
  InboxPolicy,
  Scope,
  ThreadState,
  UndeliverableReason,
  WorkerActivity,
  WorkerLifecycle,
  WorkerState,
} from './types.js'

// events —— 21 kind 白名单 + 纯解析/幂等
export {
  CHANNEL_EVENT_KINDS,
  findIdempotentEvent,
  parseChannelKind,
  parseChannelKinds,
  parseEventsText,
  validateEventBase,
  VALID_ORIGINS,
} from './events.js'
export type { ChannelEventKind } from './events.js'

// seq —— 侧车 + jsonl 尾恢复
export { lastSeqInLines, nextSeq, parseSidecar, readLastJsonlSeqFromText } from './seq.js'

// paths —— scope + Project 桶
export {
  bucketDir,
  bucketFor,
  channelDir,
  eventsPath,
  GLOBAL_BUCKET,
  lockPath,
  projectKey,
  resolveRoot,
  sanitizeBucket,
  seqPath,
  workerFile,
} from './paths.js'
export type { ChannelEnv } from './paths.js'

// 投影：worker registry / thread
export { reduceWorkerRegistry } from './worker-state.js'
export {
  buildThreadAliasResolver,
  collectThreadTimeline,
  formatThreadBoard,
  normalizeThreadKey,
  reduceThreads,
  THREAD_ACTIONS,
} from './thread-state.js'
export type { ThreadAliasResolver } from './thread-state.js'

// 三过滤：inbox / delivery / meaningful
export { classifyDelivery, matchesEventFilter, matchesInboxPolicy, MEANINGFUL_EVENT_KINDS } from './filters.js'
export type { EventFilterOptions } from './filters.js'

// turn 栈
export { TurnTracker } from './turns.js'
export type { Turn } from './turns.js'

// guard —— 只读事实 + 预算裁决
export {
  formatBudgetOverflowError,
  isIdleCleanupEligible,
  liveWorkerCandidates,
  parseIsoMs,
  spawnBudgetVerdict,
  TERMINAL_LIFECYCLES,
} from './guard.js'
export type { LiveWorkerRecord, OverflowLiveFact } from './guard.js'

// fs 注入面 + 事件日志 store
export { nodeChannelFs, withChannelLock } from './fs.js'
export type { ChannelDirent, ChannelFs } from './fs.js'
export { createChannelStore } from './store.js'
export type { ChannelListRow, ChannelStore, Clock, ListOptions } from './store.js'

// ── 进程层（BACKLOG #27b / GOAL A4 M4）：真 fork / live-tail / OS-liveness / SIGTERM cleanup ──
// process —— 真进程注入面（fork/kill/liveness 探针/ps cmdline 验证）
export { isSupervisorCmdline, makeLineBuffer, nodeProcessFace } from './process.js'
export type { ProcessFace, SpawnFaceOptions, WorkerProcess } from './process.js'
// watcher —— events.jsonl 增量 live-tailer（carry/截断/三起始模式/200ms 轮询）
export { initialOffset, nodeTailFs, readNewEvents, tailEvents } from './watcher.js'
export type { StartMode, TailFs, TailOptions, TailState } from './watcher.js'
// liveness —— OS-liveness 四重判定 + SIGTERM cleanup + spawn 预算执行 + prune 助手
export {
  cleanupExpiredIdleWorkers,
  enforceSpawnBudget,
  hasLiveWorker,
  scanLiveWorkers,
  toOverflowFacts,
} from './liveness.js'
export type {
  CleanupResult,
  EnforceResult,
  LivenessDeps,
  LiveWorker,
  WorkerGuardPolicy,
} from './liveness.js'
// supervisor —— worker 生命周期编排 + adapter + shutdown 幂等漏斗 + inbox-watcher 桥接
export {
  applyParseResult,
  EchoAdapter,
  echoOnlyAdapters,
  IdleTimer,
  inboxEventEligible,
  SHUTDOWN_REASONS,
  ShutdownController,
  startSupervisor,
} from './supervisor.js'
export type {
  AdapterView,
  ParseResult,
  Scheduler,
  ShutdownDeps,
  ShutdownReason,
  SupervisorConfig,
  SupervisorDeps,
  SupervisorHandle,
  WorkerAdapter,
} from './supervisor.js'
