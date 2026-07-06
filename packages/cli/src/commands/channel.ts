/**
 * channel 子命令 —— event-sourced worker 总线薄壳（BACKLOG #27 / GOAL A4 M4）。
 * 老仓真相源：skills/pipeline/scripts/channel-state.sh + channel/*.py（事件面语义见 kernel/src/channel/index.ts 顶注）。
 *
 * ★正交红线（架构级不可阉割）：channel 操作【正交持久 worker 层】，绝不触 barrier /
 *   confirm-review-interaction 三门 / build_sha / git-commit；主线仍 owns commits。
 *   本命令只引用 deps.io + deps.cwd（构造默认 host）——绝不读写 deps.store（.pipeline.yaml）、
 *   deps.flow（相位/转换）、三门 marker 或 git。事件全落在 channel root，与 openspec/changes 隔离。
 *
 * ── 本批子命令（事件面）───────────────────────────────────────────────────────────────────
 *   create / title / context / send / wait / messages / registry / interrupt / thread / forum / list / dir
 *   （send 三态校验：先 append message 永不丢，再据 delivery-mode + classifyDelivery 逐失败 target
 *    append undeliverable；thread 强制 forum 校验 + normalizeThreadKey + rename 防 silently merge。）
 * ── 留后续（真 spawn / 进程管理层，非事件面）──────────────────────────────────────────────
 *   spawn / kill / run / prune —— 需 fork supervisor + OS 信号 + guard 四重 OS 判定（见 kernel guard.ts 顶注）。
 *
 * 接线备注（收编前的临时桥）：kernel barrel（packages/kernel/src/index.ts）尚未导出 channel/（barrel 归主
 *   会话），故此处相对 import 直取 kernel 源。主会话收编时：① 在 kernel src/index.ts 加
 *   `export * from './channel/index.js'`；② 把本文件相对 import 换成 '@pipeline-lite/kernel'；
 *   ③ 在 program.ts 注册 `channel` 命令（见报告接线清单）。
 */
import { homedir } from 'node:os'
import {
  classifyDelivery,
  createChannelStore,
  formatThreadBoard,
  normalizeThreadKey,
  reduceThreads,
  resolveRoot,
  matchesEventFilter,
  type ChannelEnv,
  type ChannelEvent,
  type ChannelStore,
  type Clock,
  type DeliveryMode,
  type EventFilterOptions,
  type Scope,
} from '@pipeline-lite/kernel'
import type { CliDeps } from '../deps.js'

/** channel host 注入面：event log store + env（默认真 fs + 真 env；集成/mock 注入 fake）。 */
export interface ChannelHost {
  store: ChannelStore
  env: ChannelEnv
}

/** 真 host：$TRELLIS_CHANNEL_ROOT 或 ~/.trellis/channels + $PIPELINE_CHANNEL_PROJECT 覆盖桶。 */
export function nodeChannelHost(cwd: string, clock?: Clock): ChannelHost {
  const root = resolveRoot(homedir(), process.env.TRELLIS_CHANNEL_ROOT)
  const override = process.env.PIPELINE_CHANNEL_PROJECT
  const env: ChannelEnv = { root, cwd, ...(override ? { projectOverride: override } : {}) }
  return { store: createChannelStore(env, undefined, clock), env }
}

const TIMEOUT_EXIT = 124
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

interface ParsedArgs {
  positional: string[]
  flags: Record<string, string | true>
}

/** argv 手写解析：--key 后若 next 非 -- → 值，否则布尔 true。 */
function parseArgs(args: string[]): ParsedArgs {
  const positional: string[] = []
  const flags: Record<string, string | true> = {}
  let i = 0
  while (i < args.length) {
    const a = args[i]!
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const nxt = args[i + 1]
      if (nxt !== undefined && !nxt.startsWith('--')) {
        flags[key] = nxt
        i += 1
      } else {
        flags[key] = true
      }
    } else {
      positional.push(a)
    }
    i += 1
  }
  return { positional, flags }
}

function strFlag(flags: Record<string, string | true>, key: string): string | undefined {
  const v = flags[key]
  return typeof v === 'string' ? v : undefined
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
 * wait 事件面（快照扫描版）：扫 --since 之后匹配 filter 的事件，出首个（exit 0）或 exit 124。
 * ⏳ 留后续：老仓 wait 从 EOF 起阻塞 tail + timeout（watch.py 增量读）——阻塞式 live-tail 是运行时层。
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
  const sinceRaw = strFlag(p.flags, 'since')
  const since = sinceRaw !== undefined ? Number.parseInt(sinceRaw, 10) : undefined
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
  if (pending && pending.size > 0) deps.io.err(`timeout: still waiting on ${[...pending].sort().join(', ')}`)
  else deps.io.err('timeout: no matching event')
  return TIMEOUT_EXIT
}

function cmdMessages(deps: CliDeps, host: ChannelHost, p: ParsedArgs): number {
  const name = p.positional[0]
  if (!name) die('[channel messages] 缺 channel 名')
  const scope = scopeOf(p.flags)
  const sinceRaw = strFlag(p.flags, 'since')
  const since = sinceRaw !== undefined ? Number.parseInt(sinceRaw, 10) : undefined
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
  const lastRaw = strFlag(p.flags, 'last')
  if (lastRaw) {
    const n = Number.parseInt(lastRaw, 10)
    if (Number.isInteger(n) && n > 0) snap = snap.slice(-n)
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

留后续（真 spawn / 进程管理层）：spawn / kill / run / prune。`

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
  const p = parseArgs(args)
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
      case 'kill':
      case 'run':
      case 'prune':
        deps.io.err(`[channel] '${sub}' 是真 spawn / 进程管理层，本批留后续（见 commands/channel.md）`)
        return USAGE_EXIT
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
