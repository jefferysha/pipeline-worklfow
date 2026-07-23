/**
 * channel 子命令 —— event-sourced worker 总线薄壳（BACKLOG #27 / GOAL A4 M4）。
 * 老仓真相源：skills/pipeline/scripts/channel-state.sh + channel/*.py（事件面语义见 kernel/src/channel/index.ts 顶注）。
 *
 * ★正交红线（架构级不可阉割）：channel 操作【正交持久 worker 层】，绝不触 barrier /
 *   confirm-review-interaction 三门 / build_sha / git-commit；主线仍 owns commits。
 *   本命令只引用 deps.io + deps.cwd（构造默认 host）——绝不读写 deps.store（.pipeline.yaml）、
 *   deps.flow（相位/转换）、三门 marker 或 git。事件全落在 channel root，与 openspec/changes 隔离。
 *
 * ── 事件面子命令 ──────────────────────────────────────────────────────────────────────────
 *   create / title / context / send / wait / messages / registry / interrupt / thread / forum / list / dir
 *   （send 三态校验：先 append message 永不丢，再据 delivery-mode + classifyDelivery 逐失败 target
 *    append undeliverable；thread 强制 forum 校验 + normalizeThreadKey + rename 防 silently merge。）
 * ── 进程管理层（非事件面）──────────────────────────────────────────────────────────────────
 *   spawn / kill / run / prune —— 建在 fork supervisor + OS 信号 + guard 四重 OS 判定之上
 *   （见 kernel guard.ts 顶注）；注入面见下方 ChannelHost 的 proc/fs/launchSupervisor。
 */
import { rmSync } from 'node:fs'
import { homedir } from 'node:os'
import {
  bucketDir,
  classifyDelivery,
  createChannelStore,
  echoOnlyAdapters,
  enforceSpawnBudget,
  eventsPath,
  formatBudgetOverflowError,
  formatThreadBoard,
  hasLiveWorker,
  matchesEventFilter,
  nodeChannelFs,
  nodeProcessFace,
  normalizeThreadKey,
  parseEventsText,
  projectKey,
  reduceThreads,
  resolveRoot,
  startSupervisor,
  toOverflowFacts,
  workerFile,
  type ChannelEnv,
  type ChannelEvent,
  type ChannelFs,
  type ChannelStore,
  type Clock,
  type DeliveryMode,
  type EventFilterOptions,
  type LivenessDeps,
  type ProcessFace,
  type Scope,
  type ShutdownReason,
  type SupervisorConfig,
  type WorkerGuardPolicy,
} from '@pipeline-lite/channel'
import { splitFlags } from '../argv.js'
import type { CliDeps } from '../deps.js'

/** run/spawn 起 supervisor 的产物：pid（forked）+ 可选 in-proc handle（shutdown/done，run 收尾用）。 */
export interface LaunchedSupervisor {
  pid: number | undefined
  shutdown?: (signalName: string, reason: ShutdownReason) => Promise<void>
  done?: Promise<number>
}

/** supervisor 启动器（缺省 fork CLI `channel __supervisor`；测试/run 注入 in-proc）。 */
export type SupervisorLauncher = (
  channel: string,
  worker: string,
  config: SupervisorConfig,
  scope: Scope,
) => Promise<LaunchedSupervisor> | LaunchedSupervisor

/**
 * channel host 注入面：event log store + env（事件面）+ 进程层注入（proc/fs/launchSupervisor）。
 * 事件面命令只用 store+env（缺省即可）；进程层命令（spawn/kill/run/prune）另用 proc/fs/launcher，
 * 全部可选、缺省真 node 面，集成/mock 注入 fake（真 fork/真信号在集成层）。
 */
export interface ChannelHost {
  store: ChannelStore
  env: ChannelEnv
  /** 真进程注入面（真 fork/kill/liveness）；缺省 nodeProcessFace()。 */
  proc?: ProcessFace
  /** channel fs 面（pid/reservation/cursor 文件）；缺省 nodeChannelFs()。 */
  fs?: ChannelFs
  /** 注入 now（预算/kill grace 判时）；缺省 Date.now。 */
  now?: () => number
  /** 注入 sleep（kill grace / run 轮询）；缺省真 setTimeout（unref）。 */
  sleep?: (ms: number) => Promise<void>
  /** 读环境变量（预算四级链的 env 层）；缺省 process.env。 */
  envVar?: (name: string) => string | undefined
  /** 递归删目录（prune/run 收尾）；缺省真 rmSync recursive（限 env.root 下）。 */
  rmrf?: (path: string) => void
  /** kill grace 上限 ms；缺省 8000。 */
  killGraceMs?: number
  /** supervisor 启动器；缺省 fork CLI `channel __supervisor`。 */
  launchSupervisor?: SupervisorLauncher
}

/** 真 host：$TRELLIS_CHANNEL_ROOT 或 ~/.trellis/channels + $PIPELINE_CHANNEL_PROJECT 覆盖桶。 */
export function nodeChannelHost(cwd: string, clock?: Clock): ChannelHost {
  const root = resolveRoot(homedir(), process.env.TRELLIS_CHANNEL_ROOT)
  const override = process.env.PIPELINE_CHANNEL_PROJECT
  const env: ChannelEnv = { root, cwd, ...(override ? { projectOverride: override } : {}) }
  return { store: createChannelStore(env, undefined, clock), env }
}

// ── 进程层 host 默认解析 ─────────────────────────────────────────────────────
function hostFs(host: ChannelHost): ChannelFs {
  return host.fs ?? nodeChannelFs()
}
function hostProc(host: ChannelHost): ProcessFace {
  return host.proc ?? nodeProcessFace()
}
function hostNow(host: ChannelHost): () => number {
  return host.now ?? (() => Date.now())
}
function realSleep(ms: number): Promise<void> {
  return new Promise((r) => {
    const t = setTimeout(r, ms)
    if (typeof t.unref === 'function') t.unref()
  })
}
function hostSleep(host: ChannelHost): (ms: number) => Promise<void> {
  return host.sleep ?? realSleep
}
function hostEnvVar(host: ChannelHost): (name: string) => string | undefined {
  return host.envVar ?? ((n) => process.env[n])
}
/** 递归删目录，硬护栏：只删 env.root 下的路径（绝不误删 cwd/openspec）。 */
function hostRmrf(host: ChannelHost): (path: string) => void {
  return (
    host.rmrf ??
    ((path: string) => {
      if (!path.startsWith(host.env.root)) return // ★红线：绝不删 channel root 之外
      try {
        rmSync(path, { recursive: true, force: true })
      } catch {
        /* best-effort */
      }
    })
  )
}

/** 缺省 supervisor 启动器：写 config 侧车 + fork CLI `channel __supervisor`（detached，同 root/桶 env）。 */
function defaultLauncher(host: ChannelHost): SupervisorLauncher {
  return (channel, worker, config, scope) => {
    const fs = hostFs(host)
    const proc = hostProc(host)
    const cfgPath = workerFile(host.env, channel, worker, 'config', scope)
    fs.writeText(cfgPath, JSON.stringify(config))
    const entry = process.argv[1] ?? ''
    const childEnv: Record<string, string> = {
      TRELLIS_CHANNEL_ROOT: host.env.root,
      PIPELINE_CHANNEL_PROJECT: projectKey(host.env),
    }
    const pid = proc.spawnDetached(process.execPath, [entry, 'channel', '__supervisor', channel, worker, cfgPath], {
      env: childEnv,
    })
    return { pid }
  }
}

const KILL_GRACE_MS = 8000
const CLEANUP_SUFFIXES = ['pid', 'worker-pid', 'config', 'spawnlock', 'reservation', 'shutdown-reason']

function intFlag(flags: Record<string, string | true>, key: string): number | undefined {
  const v = strFlag(flags, key)
  if (v === undefined) return undefined
  const n = Number.parseInt(v, 10)
  return Number.isInteger(n) ? n : undefined
}
function intOrUndef(v: string | undefined): number | undefined {
  if (v === undefined) return undefined
  const n = Number.parseInt(v, 10)
  return Number.isInteger(n) ? n : undefined
}

/** spawn/idle 预算 policy（CLI>env>default 三级链；manifest 四级由主线 barrier 侧管，进程层不碰）。 */
function resolvePolicy(host: ChannelHost, flags: Record<string, string | true>): WorkerGuardPolicy {
  const envVar = hostEnvVar(host)
  const max = intFlag(flags, 'max-live-workers') ?? intOrUndef(envVar('TRELLIS_CHANNEL_MAX_LIVE_WORKERS')) ?? 0
  const idle = intFlag(flags, 'idle-timeout') ?? intOrUndef(envVar('TRELLIS_CHANNEL_WORKER_IDLE_TIMEOUT')) ?? 0
  return { idleTimeoutMs: idle, maxLiveWorkers: max }
}

/** 秒解析：<n>[ms|s|m|h|d]（缺省 s）。非法 → fallback。 */
function parseDurationS(s: string | undefined, fallback: number): number {
  const m = /^(\d+)(ms|s|m|h|d)?$/.exec((s ?? '').trim())
  if (!m) return fallback
  const n = Number.parseInt(m[1]!, 10)
  const unit = m[2] ?? 's'
  const mul: Record<string, number> = { ms: 0.001, s: 1, m: 60, h: 3600, d: 86400 }
  return n * mul[unit]!
}

/**
 * 快照扫描「无匹配」的退出码。沿用 124 是为兼容既有调用方的判码习惯（124 = GNU timeout 的
 * 超时码），但**语义不是「等待超时」**——cmdWait 从不等待新事件，扫完现存事件即返回。
 * 措辞与常量名都按实际语义写，别再叫 TIMEOUT。
 */
const NO_MATCH_EXIT = 124
const USAGE_EXIT = 2

/** 用法/校验错误哨兵（对齐老仓 red → exit 2）。 */
class ChannelDie extends Error {
  constructor(
    msg: string,
    readonly code = USAGE_EXIT,
  ) {
    super(msg)
  }
}
function die(msg: string, code = USAGE_EXIT): never {
  throw new ChannelDie(msg, code)
}

/** flag 解析共享 argv.ts splitFlags（--key 后若 next 非 -- → 值，否则布尔 true）。 */
interface ParsedArgs {
  positional: string[]
  flags: Record<string, string | true>
}

function strFlag(flags: Record<string, string | true>, key: string): string | undefined {
  const v = flags[key]
  return typeof v === 'string' ? v : undefined
}

/**
 * 数值 flag 严格解析（对齐 mem.ts parseOptionalNumberFlag:84-90 口径）：未给 → undefined；
 * 给了但非有限数 → die exit 2（fail-loud，不让 NaN 静默失效过滤器/返回全部）。
 */
function numberFlag(flags: Record<string, string | true>, key: string): number | undefined {
  const v = flags[key]
  if (v === undefined) return undefined
  if (typeof v !== 'string') die(`[channel] --${key} 需数值`)
  const n = Number(v)
  if (!Number.isFinite(n)) die(`[channel] --${key} 非法数值: ${v}`)
  return n
}

function scopeOf(flags: Record<string, string | true>): Scope {
  return strFlag(flags, 'scope') === 'global' ? 'global' : 'project'
}

function csv(v: string | undefined): string[] {
  if (!v) return []
  return v
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

function emit(deps: CliDeps, ev: unknown): void {
  deps.io.out(JSON.stringify(ev))
}

// ── create / title / context ─────────────────────────────────────────────────
function cmdCreate(deps: CliDeps, host: ChannelHost, p: ParsedArgs): number {
  const name = p.positional[0]
  if (!name) die('[channel create] 缺 channel 名')
  const scope = scopeOf(p.flags)
  const type = strFlag(p.flags, 'type') ?? 'chat'
  const ev = host.store.append(
    name,
    {
      kind: 'create',
      by: 'main',
      origin: 'cli',
      action: 'create',
      task: strFlag(p.flags, 'task') ?? '',
      type,
      ...(p.flags.ephemeral === true ? { ephemeral: true } : {}),
      ...(strFlag(p.flags, 'description') ? { message: strFlag(p.flags, 'description') } : {}),
    },
    scope,
  )
  emit(deps, ev)
  return 0
}

function cmdTitle(deps: CliDeps, host: ChannelHost, p: ParsedArgs): number {
  const name = p.positional[0]
  if (!name) die('[channel title] 缺 channel 名')
  const scope = scopeOf(p.flags)
  if (typeof p.flags.set === 'string') {
    emit(deps, host.store.append(name, { kind: 'channel', by: 'main', origin: 'cli', action: 'title', title: p.flags.set }, scope))
    return 0
  }
  if (p.flags.clear === true) {
    emit(deps, host.store.append(name, { kind: 'channel', by: 'main', origin: 'cli', action: 'title', title: null }, scope))
    return 0
  }
  die('[channel title] 需 --set <title> 或 --clear')
}

function cmdContext(deps: CliDeps, host: ChannelHost, p: ParsedArgs): number {
  const name = p.positional[0]
  if (!name) die('[channel context] 缺 channel 名')
  const scope = scopeOf(p.flags)
  const action = p.flags.add === true ? 'add' : p.flags.delete === true ? 'delete' : undefined
  if (!action) die('[channel context] 需 --add 或 --delete')
  const file = strFlag(p.flags, 'file')
  const raw = strFlag(p.flags, 'raw')
  if (file) {
    if (!file.startsWith('/')) die(`[channel context] --file 必须是绝对路径: ${file}`)
  } else if (!raw) {
    die('[channel context] 需 --file <绝对路径> 或 --raw <非空文本>')
  }
  const thread = strFlag(p.flags, 'thread')
  const ctx: Record<string, string>[] = []
  if (file) ctx.push({ file })
  if (raw) ctx.push({ raw })
  emit(
    deps,
    host.store.append(
      name,
      { kind: 'context', by: 'main', origin: 'cli', action, target: thread ? 'thread' : 'channel', context: ctx, ...(thread ? { thread } : {}) },
      scope,
    ),
  )
  return 0
}

// ── send（三态校验）──────────────────────────────────────────────────────────
function cmdSend(deps: CliDeps, host: ChannelHost, p: ParsedArgs): number {
  const name = p.positional[0]
  if (!name) die('[channel send] 缺 channel 名')
  const by = strFlag(p.flags, 'as')
  if (!by) die('[channel send] 需 --as <by>')
  const text = p.positional[1] ?? ''
  if (!text) die('[channel send] 空文本（需 arg / --to 定向文本）')
  const scope = scopeOf(p.flags)
  const targets = csv(strFlag(p.flags, 'to'))
  const mode = (strFlag(p.flags, 'delivery-mode') ?? 'appendOnly') as DeliveryMode

  // ① 先 append message（用户意图先持久化、永不丢，即便随后判不可达）。
  const partial: Record<string, unknown> = { kind: 'message', by, origin: 'cli', text }
  if (targets.length === 1) partial.to = targets[0]
  else if (targets.length > 1) partial.to = targets
  const msg = host.store.append(name, partial as never, scope)
  emit(deps, msg)

  // ② 据 mode + registry classify：逐失败 target append undeliverable（replay 用持久化的 event.to）。
  if (mode !== 'appendOnly' && targets.length > 0) {
    const reg = host.store.registry(name, scope).workers
    for (const [target, reason] of classifyDelivery(targets, reg, mode)) {
      emit(
        deps,
        host.store.append(
          name,
          { kind: 'undeliverable', by: 'cli:send', origin: 'cli', targetWorker: target, messageSeq: msg.seq, reason },
          scope,
        ),
      )
    }
  }
  return 0
}

// ── wait / messages（事件面：快照扫描）─────────────────────────────────────────
function buildWaitFilter(self: string | undefined, p: ParsedArgs): EventFilterOptions {
  const from = csv(strFlag(p.flags, 'from'))
  const opts: EventFilterOptions = {}
  if (self) opts.selfId = self
  const kind = strFlag(p.flags, 'kind')
  if (kind) opts.wantKind = kind
  if (p.flags['include-progress'] === true) opts.includeProgress = true
  if (from.length > 0) opts.fromBy = from
  const to = strFlag(p.flags, 'to') ?? self
  if (to) opts.toFilter = to
  return opts
}

/**
 * wait 事件面：扫 --since 之后匹配 filter 的事件，出首个（exit 0）或 exit 124。
 * 语义是**快照扫描**——读完当前已有事件即返回，不从 EOF 起阻塞 tail 新事件、无超时时钟；
 * exit 124 的含义是「扫完现存事件仍无匹配」，而非「等待超时」。
 * （老仓 wait 走 watch.py 增量读做阻塞式 live-tail，属运行时层，不在本事件面内。）
 */
function cmdWait(deps: CliDeps, host: ChannelHost, p: ParsedArgs): number {
  const name = p.positional[0]
  if (!name) die('[channel wait] 缺 channel 名')
  const self = strFlag(p.flags, 'as')
  if (!self) die('[channel wait] 需 --as <self>')
  const scope = scopeOf(p.flags)
  const all = p.flags.all === true
  const from = csv(strFlag(p.flags, 'from'))
  if (all && from.length === 0) die('[channel wait] --all 必须配 --from')
  const since = numberFlag(p.flags, 'since')
  const filter = buildWaitFilter(self, p)

  const pending = all ? new Set(from) : null
  for (const ev of host.store.read(name, scope)) {
    if (since !== undefined && typeof ev.seq === 'number' && ev.seq <= since) continue
    if (!matchesEventFilter(ev, filter)) continue
    if (pending !== null) {
      pending.delete(typeof ev.by === 'string' ? ev.by : '')
      emit(deps, ev)
      if (pending.size === 0) return 0
    } else {
      emit(deps, ev)
      return 0
    }
  }
  if (pending && pending.size > 0) deps.io.err(`no-match: 已扫完现存事件，未见来自 ${[...pending].sort().join(', ')} 的匹配（本命令不等待新事件到达）`)
  else deps.io.err('no-match: 已扫完现存事件，无匹配（本命令不等待新事件到达）')
  return NO_MATCH_EXIT
}

function cmdMessages(deps: CliDeps, host: ChannelHost, p: ParsedArgs): number {
  const name = p.positional[0]
  if (!name) die('[channel messages] 缺 channel 名')
  const scope = scopeOf(p.flags)
  const since = numberFlag(p.flags, 'since')
  const from = csv(strFlag(p.flags, 'from'))
  const opts: EventFilterOptions = {}
  const kind = strFlag(p.flags, 'kind')
  if (kind) opts.wantKind = kind
  if (p.flags['include-progress'] === true) opts.includeProgress = true
  if (from.length > 0) opts.fromBy = from
  const to = strFlag(p.flags, 'to')
  if (to) opts.toFilter = to

  let snap = host.store.read(name, scope).filter((ev) => {
    if (since !== undefined && typeof ev.seq === 'number' && ev.seq <= since) return false
    return matchesEventFilter(ev, opts)
  })
  const last = numberFlag(p.flags, 'last')
  if (last !== undefined) {
    if (!Number.isInteger(last) || last <= 0) die(`[channel] --last 需正整数: ${strFlag(p.flags, 'last')}`)
    snap = snap.slice(-last)
  }
  for (const ev of snap) emit(deps, ev)
  return 0
}

function cmdRegistry(deps: CliDeps, host: ChannelHost, p: ParsedArgs): number {
  const name = p.positional[0]
  if (!name) die('[channel registry] 缺 channel 名')
  emit(deps, host.store.registry(name, scopeOf(p.flags)))
  return 0
}

// ── interrupt（只写 interrupt_requested 事件；supervisor 执行闭环）─────────────
function cmdInterrupt(deps: CliDeps, host: ChannelHost, p: ParsedArgs): number {
  const name = p.positional[0]
  if (!name) die('[channel interrupt] 缺 channel 名')
  const by = strFlag(p.flags, 'as')
  if (!by) die('[channel interrupt] 需 --as <by>')
  const to = strFlag(p.flags, 'to')
  if (!to) die('[channel interrupt] 需 --to <worker>')
  const text = p.positional[1] ?? ''
  if (!text) die('[channel interrupt] 空文本（需 arg）')
  emit(
    deps,
    host.store.append(
      name,
      { kind: 'interrupt_requested', by, origin: 'cli', worker: to, message: text, reason: 'user' },
      scopeOf(p.flags),
    ),
  )
  return 0
}

// ── forum: thread post|rename ────────────────────────────────────────────────
const POST_ACTIONS = new Set(['opened', 'comment', 'status', 'labels', 'assignees', 'summary', 'processed'])

function channelType(events: ChannelEvent[]): string {
  for (const e of events) {
    if (e.kind === 'create') return (typeof e.type === 'string' && e.type) || 'chat'
  }
  return 'chat'
}

function cmdThread(deps: CliDeps, host: ChannelHost, p: ParsedArgs): number {
  const op = p.positional[0]
  const name = p.positional[1]
  if (!op || !name) die('[channel thread] 用法: thread post|rename <name> ...')
  const by = strFlag(p.flags, 'as')
  if (!by) die('[channel thread] 需 --as <by>')
  const scope = scopeOf(p.flags)
  const events = host.store.read(name, scope)
  // forum 校验：legacy type=thread/threads 投影 chat（不升级 forum）；只有 type=forum 才允许 forum 操作。
  if (channelType(events) !== 'forum') {
    die(`[channel thread] ${name} 不是 forum channel（thread 操作需 --type forum）`)
  }

  if (op === 'rename') {
    const oldKey = normalizeThreadKey(strFlag(p.flags, 'thread') ?? '')
    const newKey = normalizeThreadKey(strFlag(p.flags, 'new-thread') ?? '')
    // 防 silently merge：新 key 已存在且 ≠ 旧 → 拒。
    const existing = new Set(reduceThreads(events).map((s) => s.thread))
    if (existing.has(newKey) && newKey !== oldKey) {
      die(`[channel thread rename] 目标 key '${newKey}' 已存在，拒绝 silently merge`)
    }
    emit(deps, host.store.append(name, { kind: 'thread', by, origin: 'cli', action: 'rename', thread: oldKey, newThread: newKey }, scope))
    return 0
  }

  if (op !== 'post') die(`[channel thread] 未知子操作 '${op}'（post|rename）`)
  const action = strFlag(p.flags, 'action')
  if (!action || !POST_ACTIONS.has(action)) {
    if (action === 'rename') die('[channel thread] rename 走专门子命令: thread rename <name> --thread X --new-thread Y')
    die(`[channel thread] 非法 action '${action ?? ''}'（合法: ${[...POST_ACTIONS].join(', ')}）`)
  }
  const threadRaw = strFlag(p.flags, 'thread') ?? ''
  let key: string
  if (action === 'opened') {
    key = threadRaw.trim() ? normalizeThreadKey(threadRaw) : `thread-${Math.floor(Date.now() / 1000).toString(16)}`
  } else {
    if (!threadRaw.trim()) die(`[channel thread] action=${action} 需 --thread`)
    key = normalizeThreadKey(threadRaw)
  }
  const partial: Record<string, unknown> = { kind: 'thread', by, origin: 'cli', action, thread: key }
  const title = strFlag(p.flags, 'title')
  const description = strFlag(p.flags, 'description')
  const status = strFlag(p.flags, 'status')
  const summary = strFlag(p.flags, 'summary')
  const labels = strFlag(p.flags, 'labels')
  const assignees = strFlag(p.flags, 'assignees')
  if (title) partial.title = title
  if (description) partial.description = description
  if (status) partial.status = status
  if (summary) partial.summary = summary
  if (labels) partial.labels = csv(labels)
  if (assignees) partial.assignees = csv(assignees)
  emit(deps, host.store.append(name, partial as never, scope))
  return 0
}

function cmdForum(deps: CliDeps, host: ChannelHost, p: ParsedArgs): number {
  const op = p.positional[0]
  if (op !== 'list') die('[channel forum] 用法: forum list <name>')
  const name = p.positional[1]
  if (!name) die('[channel forum list] 缺 channel 名')
  const scope = scopeOf(p.flags)
  const states = reduceThreads(host.store.read(name, scope))
  if (p.flags.json === true) deps.io.out(JSON.stringify(states))
  else deps.io.out(formatThreadBoard(states))
  return 0
}

// ── list / dir ───────────────────────────────────────────────────────────────
function cmdList(deps: CliDeps, host: ChannelHost, p: ParsedArgs): number {
  const rows = host.store.list({
    scope: scopeOf(p.flags),
    all: p.flags.all === true,
    allProjects: p.flags['all-projects'] === true,
  })
  if (p.flags.json === true) {
    deps.io.out(JSON.stringify({ channels: rows }))
    return 0
  }
  if (rows.length === 0) {
    deps.io.out('(no channels)')
    return 0
  }
  const showProject = p.flags['all-projects'] === true
  for (const c of rows) {
    const prefix = showProject ? `${c.project}/` : ''
    deps.io.out(
      `${(prefix + c.name).padEnd(24)} [${c.type}] events=${c.events} workers=${c.workersAlive}/${c.workersTotal}  ${typeof c.task === 'string' ? c.task : ''}`.trimEnd(),
    )
  }
  return 0
}

function cmdDir(deps: CliDeps, host: ChannelHost, p: ParsedArgs): number {
  const name = p.positional[0]
  if (!name) die('[channel dir] 缺 channel 名')
  deps.io.out(host.store.channelDir(name, scopeOf(p.flags)))
  return 0
}

// ── 进程层：spawn / kill / run / prune / __supervisor（真 fork / OS 信号 / liveness）─────────────
function buildConfig(host: ChannelHost, deps: CliDeps, flags: Record<string, string | true>, policy: WorkerGuardPolicy): SupervisorConfig {
  const cfgFile = strFlag(flags, 'config')
  if (cfgFile) {
    const raw = hostFs(host).readText(cfgFile)
    if (raw === undefined) die(`[channel] --config 读不到: ${cfgFile}`)
    const parsed = JSON.parse(raw) as SupervisorConfig
    if (parsed.idleTimeoutMs === undefined && policy.idleTimeoutMs > 0) parsed.idleTimeoutMs = policy.idleTimeoutMs
    return parsed
  }
  const provider = strFlag(flags, 'provider')
  if (!provider) die('[channel] 需 --config <path> 或 --provider <name>')
  const config: SupervisorConfig = { provider: provider!, cwd: strFlag(flags, 'cwd') ?? deps.cwd }
  if (policy.idleTimeoutMs > 0) config.idleTimeoutMs = policy.idleTimeoutMs
  const to = intFlag(flags, 'timeout-ms')
  if (to !== undefined) config.timeoutMs = to
  const ip = strFlag(flags, 'inbox-policy')
  if (ip === 'broadcastAndExplicit' || ip === 'explicitOnly') config.inboxPolicy = ip
  return config
}

/** spawn：桶级预算执行（reject not guess）→ 写 reservation → fork supervisor → 打印 pid。 */
async function cmdSpawn(deps: CliDeps, host: ChannelHost, p: ParsedArgs): Promise<number> {
  const name = p.positional[0]
  if (!name) die('[channel spawn] 缺 channel 名')
  const worker = strFlag(p.flags, 'as')
  if (!worker) die('[channel spawn] 需 --as <worker>')
  const scope = scopeOf(p.flags)
  const fs = hostFs(host)
  const proc = hostProc(host)
  const policy = resolvePolicy(host, p.flags)
  const livenessDeps: LivenessDeps = { env: host.env, fs, proc }

  // 预算执行（scan→cleanup 过期 idle→重扫→判额）。overflow 只 reject 新 spawn，绝不自动杀。
  const enforce = enforceSpawnBudget(livenessDeps, policy, hostNow(host)(), scope)
  if (!enforce.allowed) {
    deps.io.err(formatBudgetOverflowError(projectKey(host.env), toOverflowFacts(enforce.remaining), policy.maxLiveWorkers))
    return USAGE_EXIT
  }

  const config = buildConfig(host, deps, p.flags, policy)
  // 写 reservation 占位（防 spawned 事件落盘前的 race 漏算），再 fork。
  host.store.ensureDir(name, scope)
  fs.writeText(workerFile(host.env, name, worker, 'reservation', scope), worker + '\n')

  const launcher = host.launchSupervisor ?? defaultLauncher(host)
  const launched = await launcher(name, worker, config, scope)
  if (launched.pid === undefined) {
    fs.remove(workerFile(host.env, name, worker, 'reservation', scope))
    deps.io.err('[channel spawn] supervisor fork 失败')
    return 1
  }
  deps.io.out(String(launched.pid))
  return 0
}

function killCleanup(host: ChannelHost, name: string, worker: string, scope: Scope): void {
  const fs = hostFs(host)
  for (const s of CLEANUP_SUFFIXES) fs.remove(workerFile(host.env, name, worker, s, scope))
}

/** kill：默认 SIGTERM supervisor + grace poll → 仍活 SIGKILL + CLI 补写 killed；--force 直 SIGKILL。 */
async function cmdKill(deps: CliDeps, host: ChannelHost, p: ParsedArgs): Promise<number> {
  const name = p.positional[0]
  if (!name) die('[channel kill] 缺 channel 名')
  const worker = strFlag(p.flags, 'as')
  if (!worker) die('[channel kill] 需 --as <worker>')
  const scope = scopeOf(p.flags)
  const force = p.flags.force === true
  const fs = hostFs(host)
  const proc = hostProc(host)
  const now = hostNow(host)
  const sleep = hostSleep(host)
  const graceMs = host.killGraceMs ?? KILL_GRACE_MS

  const readPid = (suffix: string): number | undefined => {
    const raw = fs.readText(workerFile(host.env, name, worker, suffix, scope))
    if (raw === undefined) return undefined
    const n = Number.parseInt(raw.trim(), 10)
    return Number.isInteger(n) ? n : undefined
  }
  const supPid = readPid('pid')
  const workerPid = readPid('worker-pid')
  if (supPid === undefined) {
    deps.io.err('[channel kill] 无 pid 文件（worker 未运行？）')
    killCleanup(host, name, worker, scope)
    return USAGE_EXIT
  }
  if (!proc.pidAlive(supPid)) {
    host.store.append(name, { kind: 'error', by: 'cli:kill', worker, message: 'supervisor lost' }, scope)
    killCleanup(host, name, worker, scope)
    return 0
  }
  if (force) {
    if (workerPid !== undefined && proc.pidAlive(workerPid)) proc.kill(workerPid, 'SIGKILL')
    proc.kill(supPid, 'SIGKILL')
    host.store.append(name, { kind: 'killed', by: 'cli:kill', worker, reason: 'explicit-kill', signal: 'SIGKILL' }, scope)
    killCleanup(host, name, worker, scope)
    return 0
  }
  // 非 force：SIGTERM supervisor + grace poll（supervisor 漏斗自写 killed；死于 grace 内则不补写）。
  proc.kill(supPid, 'SIGTERM')
  const deadline = now() + graceMs
  while (now() < deadline && proc.pidAlive(supPid)) await sleep(100)
  if (proc.pidAlive(supPid)) {
    // grace 到仍活 → SIGKILL + CLI 补写 killed（保事件日志真实）。
    if (workerPid !== undefined && proc.pidAlive(workerPid)) proc.kill(workerPid, 'SIGKILL')
    proc.kill(supPid, 'SIGKILL')
    host.store.append(
      name,
      { kind: 'killed', by: 'cli:kill', worker, reason: 'explicit-kill', signal: 'SIGKILL', detail: 'grace expired, supervisor SIGKILL by CLI' },
      scope,
    )
  }
  killCleanup(host, name, worker, scope)
  return 0
}

const PRUNE_SELECTORS = ['ephemeral', 'all', 'empty', 'idle'] as const

/** prune：四 selector 互斥 → 跳 hasLiveWorker → 默认拒删（需 --yes）→ 真删死 worker channel。 */
function cmdPrune(deps: CliDeps, host: ChannelHost, p: ParsedArgs): number {
  const chosen = PRUNE_SELECTORS.filter((s) => p.flags[s] === true || (s === 'idle' && typeof p.flags.idle === 'string'))
  if (chosen.length === 0) die('[channel prune] 需四 selector 之一：--ephemeral|--all|--empty|--idle DUR')
  if (chosen.length > 1) die('[channel prune] selector 互斥（--ephemeral/--all/--empty/--idle 仅给一个）')
  const sel = chosen[0]!
  const idleS = parseDurationS(strFlag(p.flags, 'idle'), 0)
  const dry = p.flags['dry-run'] === true
  const yes = p.flags.yes === true
  const keep = new Set(csv(strFlag(p.flags, 'keep')))
  const scope = strFlag(p.flags, 'scope') === 'global' ? 'global' : 'project'
  const fs = hostFs(host)
  const proc = hostProc(host)
  const rmrf = hostRmrf(host)
  const now = hostNow(host)
  const bucket = bucketDir(host.env, scope)

  const candidates: { name: string; dir: string }[] = []
  for (const e of fs.listDir(bucket)) {
    if (!e.isDirectory || e.name.startsWith('.')) continue
    if (keep.has(e.name)) continue
    const dir = `${bucket}/${e.name}`
    if (hasLiveWorker(fs, proc, dir)) continue // 跳 hasLiveWorker（不可阉割）
    const evs = parseEventsText(fs.readText(`${dir}/events.jsonl`))
    const first = evs[0]
    const last = evs[evs.length - 1]
    let match = false
    if (sel === 'all') match = true
    else if (sel === 'ephemeral') match = Boolean(first && first.ephemeral)
    else if (sel === 'empty') match = evs.length <= 1
    else if (sel === 'idle') {
      const ts = typeof last?.ts === 'string' ? last.ts : ''
      const t = Date.parse(ts)
      match = !Number.isNaN(t) && (now() - t) / 1000 >= idleS
    }
    if (match) candidates.push({ name: e.name, dir })
  }

  if (dry) {
    for (const c of candidates) deps.io.out(`would remove: ${c.name}`)
    deps.io.out(`would remove ${candidates.length} channel(s)`)
    return 0
  }
  if (!yes) {
    deps.io.err(`Refusing to delete ${candidates.length} channel(s) without --yes`)
    return USAGE_EXIT
  }
  for (const c of candidates) rmrf(c.dir)
  deps.io.out(`removed ${candidates.length} channel(s)`)
  return 0
}

/** 轮询 events.jsonl 到谓词命中或超时（真读盘快照，run 用）。 */
async function pollForEvent(
  host: ChannelHost,
  name: string,
  scope: Scope,
  predicate: (ev: ChannelEvent) => boolean,
  timeoutMs: number,
): Promise<ChannelEvent | undefined> {
  const sleep = hostSleep(host)
  const now = hostNow(host)
  const deadline = now() + timeoutMs
  for (;;) {
    for (const ev of host.store.read(name, scope)) {
      if (predicate(ev)) return ev
    }
    if (now() >= deadline) return undefined
    await sleep(25)
  }
}

/** run：ephemeral create→spawn→send→wait done→rm（成功 stdout 末条 worker body，失败保留 exit 1）。 */
async function cmdRun(deps: CliDeps, host: ChannelHost, p: ParsedArgs): Promise<number> {
  const by = strFlag(p.flags, 'as')
  if (!by) die('[channel run] 需 --as <by>')
  if (!strFlag(p.flags, 'provider') && !strFlag(p.flags, 'config')) die('[channel run] 需 --provider <name> 或 --config <path>')
  const message = strFlag(p.flags, 'message')
  if (!message) die('[channel run] 需 --message <text>')
  const scope = scopeOf(p.flags)
  const worker = 'runner'
  const name = strFlag(p.flags, 'name') ?? `run-${Math.floor(Math.random() * 0xffffffff).toString(16)}`
  const timeoutMs = Math.round(parseDurationS(strFlag(p.flags, 'timeout'), 300) * 1000)
  const policy = resolvePolicy(host, p.flags)
  const rmrf = hostRmrf(host)

  // create ephemeral（失败保留的 channel 可被 prune --ephemeral 回收，不成永久孤儿）。
  host.store.append(name, { kind: 'create', by: 'main', action: 'create', task: 'run', type: 'chat', ephemeral: true }, scope)
  const config = buildConfig(host, deps, p.flags, policy)
  const launcher = host.launchSupervisor ?? defaultLauncher(host)
  const launched = await launcher(name, worker, config, scope)

  // 等 spawned/error（短窗口）。
  await pollForEvent(host, name, scope, (ev) => ev.kind === 'spawned' || (ev.kind === 'error' && typeof ev.by === 'string' && ev.by.startsWith('supervisor:')), 10_000)
  // send to worker。
  host.store.append(name, { kind: 'message', by, to: worker, text: message }, scope)
  // wait done/error/killed from worker within timeout。
  const outcome = await pollForEvent(host, name, scope, (ev) => ev.by === worker && (ev.kind === 'done' || ev.kind === 'error' || ev.kind === 'killed'), timeoutMs)

  // 收尾：kill supervisor（in-proc handle 优先，否则 SIGTERM pid）。
  if (launched.shutdown) {
    await launched.shutdown('SIGTERM', 'explicit-kill')
    if (launched.done) await launched.done
  } else if (launched.pid !== undefined) {
    hostProc(host).kill(launched.pid, 'SIGTERM')
  }

  if (outcome && outcome.kind === 'done') {
    const msgs = host.store
      .read(name, scope)
      .filter((e) => (e.kind === 'message' || e.kind === 'done') && e.by === worker && typeof e.text === 'string' && e.text)
    if (msgs.length > 0) deps.io.out(String(msgs[msgs.length - 1]!.text))
    rmrf(host.store.channelDir(name, scope))
    return 0
  }
  deps.io.err(`[channel run] worker 未成功完成；channel kept for inspection: ${host.store.channelDir(name, scope)}`)
  return 1
}

/** __supervisor：隐藏子命令（spawn detached fork 的入口）——起真 supervisor 主循环，SIGTERM 漏斗收口。 */
async function cmdSupervisor(deps: CliDeps, host: ChannelHost, p: ParsedArgs): Promise<number> {
  const [channel, worker, cfgPath] = p.positional
  if (!channel || !worker || !cfgPath) {
    deps.io.err('usage: channel __supervisor <channel> <worker> <config-path>')
    return USAGE_EXIT
  }
  const fs = hostFs(host)
  const raw = fs.readText(cfgPath)
  const config: SupervisorConfig = raw ? (JSON.parse(raw) as SupervisorConfig) : { provider: 'echo' }
  const scope = scopeOf(p.flags)
  const handle = await startSupervisor(channel, worker, config, {
    store: host.store,
    proc: hostProc(host),
    fs,
    env: host.env,
    resolveAdapter: echoOnlyAdapters,
    scope,
  })
  // 信号漏斗：早到的 SIGTERM/SIGINT/SIGHUP 都 funnel 进 shutdown（防孤儿）。
  const onSig = (signalName: string): void => {
    void handle.shutdown(signalName, 'explicit-kill')
  }
  process.on('SIGTERM', () => onSig('SIGTERM'))
  process.on('SIGINT', () => onSig('SIGINT'))
  process.on('SIGHUP', () => onSig('SIGHUP'))
  await handle.done
  return 0
}

const USAGE = `pipeline channel — event-sourced worker 总线（正交持久层，绝不触 barrier/三门/build_sha）

结构:
  create  <name> --task T [--type chat|forum] [--scope project|global] [--description D]
  title   <name> (--set <title> | --clear) [--scope ...]
  context <name> --add|--delete (--file <ABS> | --raw <text>) [--thread K] [--scope ...]
  dir     <name> [--scope project|global]
消息/中断:
  send      <name> <text> --as <by> [--to CSV] [--delivery-mode appendOnly|requireKnownWorker|requireRunningWorker]
  wait      <name> --as <self> [--from CSV] [--kind K] [--to T] [--since SEQ] [--all]   # 无匹配 exit 124
  messages  <name> [--last N] [--since SEQ] [--kind K] [--from CSV] [--to T]
  interrupt <name> --as <by> --to <worker> <text>                                       # 只写事件
  registry  <name>                                                                       # worker 注册表投影
forum:
  thread post   <name> --as <by> --action opened|comment|status|labels|assignees|summary|processed [--thread K]
  thread rename <name> --as <by> --thread OLD --new-thread NEW
  forum list    <name> [--json]
  list          [--json] [--all] [--all-projects]
进程层（真 fork / OS 信号 / liveness，正交持久 worker 层）：
  spawn <name> --as <worker> (--provider echo | --config <path>) [--max-live-workers N] [--idle-timeout MS]
  kill  <name> --as <worker> [--force] [--scope]                                # SIGTERM supervisor + grace
  run   [--name N] --as <by> (--provider echo | --config <path>) --message M [--timeout D]   # ephemeral 端到端
  prune (--ephemeral|--all|--empty|--idle DUR) [--dry-run] [--yes] [--keep CSV] [--scope]    # 跳 hasLiveWorker`

/**
 * channel 子命令分派（纯函数 + deps 注入 + host 注入面）。
 * host 缺省真 fs + 真 env（读用户 channel root）；集成层注入指向临时 root 的 host、mock 层注入 fake。
 * ★只用 deps.io + deps.cwd——绝不碰 deps.store / deps.flow / 三门 / build_sha / git（正交红线）。
 */
export async function cmdChannel(
  deps: CliDeps,
  sub: string,
  args: string[],
  host: ChannelHost = nodeChannelHost(deps.cwd),
): Promise<number> {
  if (sub === '' || sub === 'help' || sub === '--help' || sub === '-h') {
    deps.io.out(USAGE)
    return 0
  }
  const p = splitFlags(args)
  try {
    switch (sub) {
      case 'create':
        return cmdCreate(deps, host, p)
      case 'title':
        return cmdTitle(deps, host, p)
      case 'context':
        return cmdContext(deps, host, p)
      case 'send':
        return cmdSend(deps, host, p)
      case 'wait':
        return cmdWait(deps, host, p)
      case 'messages':
        return cmdMessages(deps, host, p)
      case 'registry':
        return cmdRegistry(deps, host, p)
      case 'interrupt':
        return cmdInterrupt(deps, host, p)
      case 'thread':
        return cmdThread(deps, host, p)
      case 'forum':
        return cmdForum(deps, host, p)
      case 'list':
        return cmdList(deps, host, p)
      case 'dir':
        return cmdDir(deps, host, p)
      case 'spawn':
        return await cmdSpawn(deps, host, p)
      case 'kill':
        return await cmdKill(deps, host, p)
      case 'run':
        return await cmdRun(deps, host, p)
      case 'prune':
        return cmdPrune(deps, host, p)
      case '__supervisor':
        return await cmdSupervisor(deps, host, p)
      default:
        deps.io.err(`[channel] 未知子命令: ${sub}`)
        return USAGE_EXIT
    }
  } catch (e) {
    if (e instanceof ChannelDie) {
      deps.io.err(e.message)
      return e.code
    }
    if (e instanceof Error) {
      deps.io.err(`[channel] ${e.message}`)
      return 1
    }
    throw e
  }
}
