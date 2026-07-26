/**
 * thread-state —— forum thread 投影（event-sourcing：thread 事件流 → ThreadState 列表）。
 * 老仓真相源：skills/pipeline/scripts/channel/thread_state.py（normalize_thread_key:29
 *   / build_thread_alias_resolver:108 / reduce_threads:194 / collect_thread_timeline:246
 *   / format_thread_board:261）。
 *
 * 铁律（不可阉割，与老仓一致）：
 *   · normalizeThreadKey 是 thread key 的唯一校验 SOT（^[A-Za-z0-9._-]+$）。
 *   · rename 由 alias resolver 处理；applyThreadAction 的 rename 分支 no-op（timeline 经 resolve 归并）。
 *   · 防 silently merge：resolve 把旧 key 映到当前 key，reduce 归并同一 timeline。
 */
import type { ChannelEvent, ThreadState } from './types.js'

const THREAD_KEY_RE = /^[A-Za-z0-9._-]+$/

/** applyThreadAction 接受的 7 个 action（rename 走专门子命令、不进 post 白名单，thread_state.py:23）。 */
export const THREAD_ACTIONS = [
  'opened', 'comment', 'status', 'labels', 'assignees', 'summary', 'processed',
] as const

/** trim + 白名单校验；空/非法抛（thread_state.py:29）。 */
export function normalizeThreadKey(v: string): string {
  const trimmed = (v ?? '').trim()
  if (!trimmed) throw new Error('Thread key must not be empty')
  if (!THREAD_KEY_RE.test(trimmed)) {
    throw new Error("Thread key may only contain letters, numbers, '.', '_' and '-'")
  }
  return trimmed
}

// ── schema 辅助 ──────────────────────────────────────────────────────────────
function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((x): x is string => typeof x === 'string')
}

interface ContextEntry {
  type?: string
  path?: string
  text?: string
  file?: string
  raw?: string
}

/** 兼容两种 context 形：{type:file,path}/{type:raw,text}（Tenon contract）与 {file}/{raw}（本仓）。 */
function asContextEntries(value: unknown): ContextEntry[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out: ContextEntry[] = []
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object') continue
    const e = entry as ContextEntry
    if (e.type === 'file' && typeof e.path === 'string') out.push(e)
    else if (e.type === 'raw' && typeof e.text === 'string') out.push(e)
    else if (typeof e.file === 'string') out.push(e)
    else if (typeof e.raw === 'string') out.push(e)
  }
  return out.length > 0 ? out : undefined
}

function contextEntryKey(entry: ContextEntry): string {
  if (entry.type === 'file') return `file:${entry.path}`
  if (entry.type === 'raw') return `raw:${entry.text}`
  if (typeof entry.file === 'string') return `file:${entry.file}`
  return `raw:${entry.raw}`
}

function isThreadEvent(ev: ChannelEvent): boolean {
  return ev.kind === 'thread'
}
function isThreadContextEvent(ev: ChannelEvent): boolean {
  return ev.kind === 'context' && ev.target === 'thread' && Boolean(ev.thread)
}

// ── build_thread_alias_resolver ──────────────────────────────────────────────
export interface ThreadAliasResolver {
  resolve(key: string): string
  aliasesFor(currentKey: string): string[]
}

export function buildThreadAliasResolver(events: ChannelEvent[]): ThreadAliasResolver {
  const aliasToCurrent = new Map<string, string>()
  const aliasesByCurrent = new Map<string, Set<string>>()

  const currentFor = (key: string): string => {
    let cur = aliasToCurrent.get(key) ?? key
    const seen = new Set<string>()
    while (!seen.has(cur)) {
      const next = aliasToCurrent.get(cur)
      if (next === undefined) break
      seen.add(cur)
      cur = next
    }
    return cur
  }

  for (const ev of events) {
    if (!isThreadEvent(ev) || ev.action !== 'rename') continue
    const newRaw = ev.newThread
    const newKey = typeof newRaw === 'string' ? newRaw.trim() : undefined
    const oldKey = typeof ev.thread === 'string' ? ev.thread : undefined
    if (!newKey || !oldKey || newKey === oldKey) continue
    const oldCurrent = currentFor(oldKey)
    const targetCurrent = currentFor(newKey)
    if (oldCurrent === targetCurrent) continue
    const moving = aliasesByCurrent.get(oldCurrent) ?? new Set<string>()
    moving.add(oldCurrent)
    aliasesByCurrent.delete(oldCurrent)
    const target = aliasesByCurrent.get(targetCurrent) ?? new Set<string>()
    for (const alias of moving) {
      if (alias !== targetCurrent) target.add(alias)
      aliasToCurrent.set(alias, targetCurrent)
    }
    aliasesByCurrent.set(targetCurrent, target)
  }

  return {
    resolve(key: string): string {
      let cur = aliasToCurrent.get(key) ?? key
      const seen = new Set<string>()
      while (!seen.has(cur)) {
        const next = aliasToCurrent.get(cur)
        if (next === undefined) break
        seen.add(cur)
        cur = next
      }
      return cur
    },
    aliasesFor(currentKey: string): string[] {
      const s = aliasesByCurrent.get(currentKey)
      return s ? [...s] : []
    },
  }
}

// ── reduce_threads ───────────────────────────────────────────────────────────
interface ThreadAccum extends Omit<ThreadState, 'context'> {
  contextMap: Map<string, ContextEntry>
}

function newState(key: string, seq: number): ThreadAccum {
  return {
    thread: key,
    status: 'open',
    labels: [],
    assignees: [],
    lastSeq: seq,
    comments: 0,
    aliases: [],
    contextMap: new Map(),
  }
}

function applyThreadAction(state: ThreadAccum, ev: ChannelEvent): void {
  const action = ev.action
  if (action === 'opened') {
    state.status = typeof ev.status === 'string' ? ev.status : 'open'
    if (typeof ev.title === 'string') state.title = ev.title
    if (typeof ev.description === 'string') state.description = ev.description
    const initial = asContextEntries(ev.context) ?? asContextEntries(ev.linkedContext)
    if (initial) {
      state.contextMap = new Map()
      for (const entry of initial) state.contextMap.set(contextEntryKey(entry), entry)
    }
    state.labels = asStringArray(ev.labels) ?? state.labels
    state.assignees = asStringArray(ev.assignees) ?? state.assignees
  } else if (action === 'comment') {
    state.comments += 1
  } else if (action === 'status') {
    if (typeof ev.status === 'string') state.status = ev.status
  } else if (action === 'labels') {
    state.labels = asStringArray(ev.labels) ?? state.labels
  } else if (action === 'assignees') {
    state.assignees = asStringArray(ev.assignees) ?? state.assignees
  } else if (action === 'summary') {
    if (typeof ev.summary === 'string') state.summary = ev.summary
  } else if (action === 'processed') {
    state.status = typeof ev.status === 'string' ? ev.status : 'processed'
  }
  // rename: 由 alias resolver 处理，此处 no-op
}

export function reduceThreads(events: ChannelEvent[]): ThreadState[] {
  const resolver = buildThreadAliasResolver(events)
  const states = new Map<string, ThreadAccum>()

  const ensure = (key: string, seq: number): ThreadAccum => {
    const existing = states.get(key)
    if (existing) return existing
    const created = newState(key, seq)
    states.set(key, created)
    return created
  }

  for (const ev of events) {
    const seq = typeof ev.seq === 'number' ? ev.seq : 0
    if (isThreadEvent(ev)) {
      const current = resolver.resolve(ev.thread as string)
      const state = ensure(current, seq)
      const ts = ev.ts
      if (typeof ts === 'string') {
        state.updatedAt = ts
        if (state.openedAt === undefined) state.openedAt = ts
      }
      state.lastSeq = seq
      applyThreadAction(state, ev)
      continue
    }
    if (isThreadContextEvent(ev)) {
      const current = resolver.resolve(ev.thread as string)
      const state = states.get(current)
      if (state === undefined) continue
      const entries = asContextEntries(ev.context)
      if (!entries) continue
      if (ev.action === 'add') {
        for (const entry of entries) state.contextMap.set(contextEntryKey(entry), entry)
      } else if (ev.action === 'delete') {
        for (const entry of entries) state.contextMap.delete(contextEntryKey(entry))
      }
      const ts = ev.ts
      if (typeof ts === 'string') state.updatedAt = ts
      state.lastSeq = seq
    }
  }

  const out: ThreadState[] = []
  for (const [currentKey, accum] of states) {
    const { contextMap, ...rest } = accum
    const state: ThreadState = { ...rest }
    state.aliases = resolver.aliasesFor(currentKey)
    if (contextMap.size > 0) state.context = [...contextMap.values()]
    out.push(state)
  }
  out.sort((a, b) => {
    const av = a.updatedAt ?? ''
    const bv = b.updatedAt ?? ''
    return av < bv ? 1 : av > bv ? -1 : 0
  })
  return out
}

/** 某 thread（含 rename 别名）的事件 timeline，按事件流序（thread_state.py:246）。 */
export function collectThreadTimeline(events: ChannelEvent[], threadKey: string): ChannelEvent[] {
  const resolver = buildThreadAliasResolver(events)
  const current = resolver.resolve(threadKey)
  const aliases = new Set<string>([current, ...resolver.aliasesFor(current)])
  const out: ChannelEvent[] = []
  for (const ev of events) {
    if (isThreadEvent(ev) && typeof ev.thread === 'string' && aliases.has(ev.thread)) out.push(ev)
    else if (isThreadContextEvent(ev) && typeof ev.thread === 'string' && aliases.has(ev.thread)) out.push(ev)
  }
  return out
}

/** thread-board 文本视图（forum 默认渲染，thread_state.py:261）。 */
export function formatThreadBoard(states: ThreadState[]): string {
  if (states.length === 0) return '(no threads)'
  const lines: string[] = []
  for (const s of states) {
    const title = s.title ?? ''
    let head = `[${s.status}] ${s.thread}`
    if (title) head += ` — ${title}`
    const meta: string[] = []
    if (s.comments) meta.push(`${s.comments} comments`)
    if (s.labels.length) meta.push('labels: ' + s.labels.join(','))
    if (s.assignees.length) meta.push('assignees: ' + s.assignees.join(','))
    if (meta.length) head += '  (' + meta.join('; ') + ')'
    lines.push(head)
  }
  return lines.join('\n')
}
