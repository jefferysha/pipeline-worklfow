/**
 * mem/adapters/pi —— 持久化 Pi Agent 会话读取器（注入 fs）。
 * 对位老仓 skills/pipeline/scripts/mem/adapters/pi.py。
 *
 * 布局：~/.pi/agent/sessions/--<encoded-cwd>--/<ts>_<id>.jsonl 或自定义会话目录下直 .jsonl。
 * entry 经 id/parentId 成树；extract 只沿活跃分支（末 entry leaf 回溯）+ seen 防环 + firstKeptEntryId 重建。
 */
import { basename, join, resolve } from 'node:path'
import type { DialogueTurn, MemFilter, MemSession, PhaseEvent, SearchHit } from '../types.js'
import type { MemFs } from '../fs.js'
import { mtimeIso } from '../fs.js'
import { isBootstrapTurn, stripInjectionTags } from '../dialogue.js'
import { inRangeOverlap, sameProject } from '../filter.js'
import { parseTaskPyCommandsAll } from '../phase.js'
import { searchInDialogue } from '../search.js'
import { parseJsonlLines, readJsonlFirst } from '../jsonl.js'
import { piAgentDir, piProjectDirFromCwd, piSessionRoots, walkDir } from '../paths.js'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any

export function piListSessions(fs: MemFs, f: MemFilter): MemSession[] {
  const out: MemSession[] = []
  const files = candidateFiles(fs, f)
    .sort((left, right) => (fs.mtimeMs(right) ?? 0) - (fs.mtimeMs(left) ?? 0))
  for (const filePath of files) {
    if (fs.contentReadBudget && !fs.contentReadBudget.claimCandidate()) {
      fs.contentReadBudget.noteCandidateLimitReached()
      break
    }
    const header = readJsonlFirst(fs.readText(filePath)) as Json
    if (!header || header.type !== 'session') continue

    const sid: string = typeof header.id === 'string' ? header.id : idFromFile(filePath)
    const cwd: string | null = typeof header.cwd === 'string' ? header.cwd : null
    if (f.cwd && !sameProject(cwd, f.cwd)) continue

    let title: string | null = null
    let lastMs: number | null = null
    for (const entry of parseJsonlLines(fs.readText(filePath))) {
      const e = entry as Json
      if (e?.type === 'session_info') {
        const name = e.name
        title = typeof name === 'string' && name.trim() ? name.trim() : null
        continue
      }
      if (e?.type !== 'message') continue
      const msg = e.message ?? {}
      const role = msg.role
      if (role !== 'user' && role !== 'assistant') continue
      let activity = timestampMs(msg.timestamp)
      if (activity === null) activity = timestampMs(e.timestamp)
      if (activity !== null) lastMs = Math.max(lastMs ?? 0, activity)
    }

    let updated: string | undefined
    if (lastMs !== null) updated = new Date(lastMs).toISOString()
    else updated = mtimeIso(fs, filePath)
    const created: string | null = typeof header.timestamp === 'string' ? header.timestamp : null
    if (!inRangeOverlap(created, updated, f)) continue

    out.push({ platform: 'pi', id: sid, title, cwd, created, updated: updated ?? null, filePath })
  }
  return out
}

function candidateFiles(fs: MemFs, f: MemFilter): string[] {
  const defaultRoot = join(piAgentDir(fs), 'sessions')
  const seen = new Set<string>()
  const out: string[] = []
  const pushJsonl = (root: string): void => {
    if (!fs.exists(root)) return
    for (const file of walkDir(fs, root)) {
      if (!file.endsWith('.jsonl')) continue
      const normalized = resolve(file)
      if (seen.has(normalized)) continue
      seen.add(normalized)
      out.push(file)
    }
  }
  for (const root of piSessionRoots(fs)) {
    if (f.cwd && resolve(root) === resolve(defaultRoot)) pushJsonl(piProjectDirFromCwd(fs, f.cwd))
    else pushJsonl(root)
  }
  return out
}

function idFromFile(filePath: string): string {
  const base = basename(filePath).slice(0, -'.jsonl'.length)
  const underscore = base.indexOf('_')
  return underscore === -1 ? base : base.slice(underscore + 1)
}

function timestampMs(value: unknown): number | null {
  if (typeof value === 'number' && !Number.isNaN(value)) return Math.trunc(value)
  if (typeof value !== 'string') return null
  const t = Date.parse(value)
  return Number.isNaN(t) ? null : t
}

export function piExtractDialogue(fs: MemFs, s: MemSession): DialogueTurn[] {
  return buildPiTurnsAndEvents(fs, s).turns
}

export function piSearch(fs: MemFs, s: MemSession, kw: string): SearchHit {
  return searchInDialogue(piExtractDialogue(fs, s), kw)
}

export function collectPiTurnsAndEvents(fs: MemFs, s: MemSession): { turns: DialogueTurn[]; events: PhaseEvent[] } {
  return buildPiTurnsAndEvents(fs, s)
}

function buildPiTurnsAndEvents(fs: MemFs, s: MemSession): { turns: DialogueTurn[]; events: PhaseEvent[] } {
  const effective = effectiveActivePath(fs, s.filePath)
  const turns: DialogueTurn[] = []
  const events: PhaseEvent[] = []
  for (const entry of effective) {
    // collect 在 push turn 之前调（turnIndex 取当前 turns 长度）
    collectTaskEvents(entry, turns.length, events)
    const turn = turnFromEntry(entry)
    if (turn) turns.push(turn)
  }
  return { turns, events }
}

function effectiveActivePath(fs: MemFs, filePath: string): Json[] {
  const entries: Json[] = []
  for (const entry of parseJsonlLines(fs.readText(filePath))) {
    const e = entry as Json
    if (e?.type === 'session') continue
    if (typeof e?.id !== 'string') continue
    entries.push(e)
  }
  if (!entries.length) return []

  const byId = new Map<string, Json>()
  for (const entry of entries) if (typeof entry.id === 'string') byId.set(entry.id, entry)

  const leaf = entries[entries.length - 1]
  const activePath: Json[] = []
  let current: Json | undefined = leaf
  const seen = new Set<string>()
  while (current) {
    const cid = current.id
    if (typeof cid !== 'string' || seen.has(cid)) break
    seen.add(cid)
    activePath.unshift(current)
    const parentId = current.parentId
    current = typeof parentId === 'string' ? byId.get(parentId) : undefined
  }

  const compactionIdx = findLastIndex(activePath, (e) => e?.type === 'compaction')
  if (compactionIdx === -1) return activePath

  const compaction = activePath[compactionIdx]
  let firstKeptIdx = -1
  for (let idx = 0; idx < activePath.length; idx++) {
    if (idx < compactionIdx && activePath[idx]?.id === compaction?.firstKeptEntryId) {
      firstKeptIdx = idx
      break
    }
  }
  const kept = firstKeptIdx === -1 ? [] : activePath.slice(firstKeptIdx, compactionIdx)
  return [compaction, ...kept, ...activePath.slice(compactionIdx + 1)]
}

function findLastIndex(items: readonly Json[], pred: (e: Json) => boolean): number {
  for (let i = items.length - 1; i >= 0; i--) if (pred(items[i])) return i
  return -1
}

function turnFromEntry(entry: Json): DialogueTurn | null {
  const etype = entry?.type
  if (etype === 'compaction') return syntheticTurn('[compact summary]', entry?.summary)
  if (etype === 'branch_summary') return syntheticTurn('[branch summary]', entry?.summary)
  if (etype === 'custom_message') return buildTurn('user', entry?.content)
  if (etype !== 'message') return null

  const msg = entry?.message
  if (!msg) return null
  const role = msg.role
  if (role === 'user') return buildTurn('user', msg.content)
  if (role === 'assistant') return buildTurn('assistant', msg.content)
  if (role === 'custom') return buildTurn('user', msg.content)
  if (role === 'branchSummary') return syntheticTurn('[branch summary]', msg.summary)
  if (role === 'compactionSummary') return syntheticTurn('[compact summary]', msg.summary)
  return null
}

function syntheticTurn(prefix: string, raw: unknown): DialogueTurn | null {
  if (typeof raw !== 'string') return null
  const text = stripInjectionTags(raw)
  if (!text) return null
  return { role: 'user', text: `${prefix}\n${text}` }
}

function buildTurn(role: 'user' | 'assistant', content: Json): DialogueTurn | null {
  const parts: string[] = []
  let totalRaw = 0
  if (typeof content === 'string') {
    totalRaw = content.length
    const cleaned = stripInjectionTags(content)
    if (cleaned) parts.push(cleaned)
  } else if (Array.isArray(content)) {
    for (const block of content) {
      if (block?.type !== 'text' || typeof block.text !== 'string') continue
      totalRaw += block.text.length
      const cleaned = stripInjectionTags(block.text)
      if (cleaned) parts.push(cleaned)
    }
  }
  if (!parts.length) return null
  const merged = parts.join('\n\n')
  if (isBootstrapTurn(merged, totalRaw)) return null
  return { role, text: merged }
}

function collectTaskEvents(entry: Json, turnIndex: number, events: PhaseEvent[]): void {
  if (entry?.type !== 'message') return
  const msg = entry?.message
  if (!msg) return

  if (msg.role === 'bashExecution' && typeof msg.command === 'string') {
    pushTaskEvents(msg.command, entry?.timestamp, turnIndex, events)
    return
  }
  if (msg.role !== 'assistant' || !Array.isArray(msg.content)) return
  for (const block of msg.content) {
    if (block?.type !== 'toolCall') continue
    if (typeof block.name !== 'string') continue
    const toolName = block.name.toLowerCase()
    if (toolName !== 'bash' && toolName !== 'shell') continue
    const args = block.arguments
    if (!args || typeof args !== 'object') continue
    const command = args.command
    if (typeof command !== 'string') continue
    pushTaskEvents(command, entry?.timestamp, turnIndex, events)
  }
}

function pushTaskEvents(command: string, timestamp: unknown, turnIndex: number, events: PhaseEvent[]): void {
  for (const parsed of parseTaskPyCommandsAll(command)) {
    const ev: PhaseEvent = {
      action: parsed.action,
      timestamp: (typeof timestamp === 'string' ? timestamp : '') || '',
      turnIndex,
    }
    if (parsed.action === 'create') ev.slug = parsed.slug
    else ev.taskDir = parsed.taskDir
    events.push(ev)
  }
}
