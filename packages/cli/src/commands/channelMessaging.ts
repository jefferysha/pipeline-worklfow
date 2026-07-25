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


import {
  ChannelDie, die, emit, hostFs, hostNow, hostProc, scopeOf, strFlag, numberFlag, csv,
  NO_MATCH_EXIT,
  type ChannelHost, type ParsedArgs,
} from './channelSupport.js'

export function cmdCreate(deps: CliDeps, host: ChannelHost, p: ParsedArgs): number {
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

export function cmdTitle(deps: CliDeps, host: ChannelHost, p: ParsedArgs): number {
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

export function cmdContext(deps: CliDeps, host: ChannelHost, p: ParsedArgs): number {
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
export function cmdSend(deps: CliDeps, host: ChannelHost, p: ParsedArgs): number {
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
export function cmdWait(deps: CliDeps, host: ChannelHost, p: ParsedArgs): number {
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

export function cmdMessages(deps: CliDeps, host: ChannelHost, p: ParsedArgs): number {
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

export function cmdRegistry(deps: CliDeps, host: ChannelHost, p: ParsedArgs): number {
  const name = p.positional[0]
  if (!name) die('[channel registry] 缺 channel 名')
  emit(deps, host.store.registry(name, scopeOf(p.flags)))
  return 0
}

// ── interrupt（只写 interrupt_requested 事件；supervisor 执行闭环）─────────────
export function cmdInterrupt(deps: CliDeps, host: ChannelHost, p: ParsedArgs): number {
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

export function cmdThread(deps: CliDeps, host: ChannelHost, p: ParsedArgs): number {
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

export function cmdForum(deps: CliDeps, host: ChannelHost, p: ParsedArgs): number {
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
export function cmdList(deps: CliDeps, host: ChannelHost, p: ParsedArgs): number {
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

export function cmdDir(deps: CliDeps, host: ChannelHost, p: ParsedArgs): number {
  const name = p.positional[0]
  if (!name) die('[channel dir] 缺 channel 名')
  deps.io.out(host.store.channelDir(name, scopeOf(p.flags)))
  return 0
}

// ── 进程层：spawn / kill / run / prune / __supervisor（真 fork / OS 信号 / liveness）─────────────
