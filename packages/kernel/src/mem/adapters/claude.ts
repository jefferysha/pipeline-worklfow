/**
 * mem/adapters/claude —— 持久化 Claude Code 会话读取器（注入 fs）。
 * 对位老仓 skills/pipeline/scripts/mem/adapters/claude.py。
 *
 * 布局：~/.claude/projects/<sanitized-cwd>/<sessionId>.jsonl，可选 <projectDir>/sessions-index.json
 * 提供 cwd/created/title。extract 只收 user/assistant text，丢 thinking/tool_use。
 */
import { basename, dirname, join } from 'node:path'
import type { DialogueTurn, MemFilter, MemSession, PhaseEvent, SearchHit } from '../types.js'
import type { MemFs } from '../fs.js'
import { mtimeIso, readMemSessionMetadataChecked } from '../fs.js'
import { hostSummaryTurn, isBootstrapTurn, stripInjectionTags } from '../dialogue.js'
import { inRangeOverlap, sameProject } from '../filter.js'
import { parseTaskPyCommandsAll } from '../phase.js'
import { searchInDialogue } from '../search.js'
import { findInJsonl, parseJsonlLines, readJsonlFirst } from '../jsonl.js'
import {
  claudeProjectDirFromCwd,
  claudeProjectsRoot,
  walkDirForRelatedSearch,
} from '../paths.js'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any

export function claudeListSessions(fs: MemFs, f: MemFilter): MemSession[] {
  const root = claudeProjectsRoot(fs)
  if (!fs.exists(root)) return []
  const out: MemSession[] = []

  // Only the legacy, unbudgeted CLI path materializes this full-recall directory list. Related
  // Sessions starts with the bounded walker below, including when the derived project path is absent.
  const projectDirs = (): string[] => {
    const allDirs = (): string[] => fs.readDir(root)
      .filter((entry) => entry.isDirectory)
      .map((entry) => join(root, entry.name))
    if (!f.cwd) return allDirs()
    const derived = claudeProjectDirFromCwd(fs, f.cwd)
    return fs.exists(derived) ? [derived] : allDirs()
  }

  const indexes = new Map<string, Map<string, Json>>()
  const indexFor = (directory: string): Map<string, Json> => {
    const cached = indexes.get(directory)
    if (cached) return cached
    const indexById = new Map<string, Json>()
    const indexPath = join(directory, 'sessions-index.json')
    const indexRaw = fs.exists(indexPath) ? fs.readText(indexPath) : undefined
    if (indexRaw) {
      try {
        const index = JSON.parse(indexRaw)
        const idxEntries = index && Array.isArray(index.entries) ? index.entries : []
        for (const e of idxEntries) if (e && typeof e.id === 'string') indexById.set(e.id, e)
      } catch {
        /* 坏 index 忽略，退到 per-session 兜底 */
      }
    }
    indexes.set(directory, indexById)
    return indexById
  }

  const relatedRoot = f.cwd && fs.exists(claudeProjectDirFromCwd(fs, f.cwd))
    ? claudeProjectDirFromCwd(fs, f.cwd)
    : root
  const sessionEntries = fs.contentReadBudget
    ? walkDirForRelatedSearch(
      fs,
      relatedRoot,
      (file) => file.endsWith('.jsonl'),
      Math.max(f.limit * 4, f.limit + 1),
      'claude',
      (directory) => relatedRoot === root && dirname(directory) === root,
    ).map((file) => ({
      directory: dirname(file),
      entry: { name: basename(file), isFile: true, isDirectory: false },
    }))
    : projectDirs()
      .flatMap((directory) => fs.readDir(directory)
        .filter((entry) => entry.isFile && entry.name.endsWith('.jsonl'))
        .map((entry) => ({ directory, entry })))
      .sort((left, right) => {
        const leftPath = join(left.directory, left.entry.name)
        const rightPath = join(right.directory, right.entry.name)
        return (fs.mtimeMs(rightPath) ?? 0) - (fs.mtimeMs(leftPath) ?? 0)
      })

  for (const { directory, entry } of sessionEntries) {
    if (fs.contentReadBudget && fs.contentReadBudget.remainingBytes() <= 0) {
      fs.contentReadBudget.noteTotalExhausted()
      break
    }
    const filePath = join(directory, entry.name)
    const sid = entry.name.slice(0, -'.jsonl'.length)
    const idx = indexFor(directory).get(sid)
    let cwd: string | null = idx?.cwd ?? null
    let created: string | null = idx?.created ?? null
    const title: string | null = idx?.title ?? null

    if (!cwd || !created) {
      const metadata = readMemSessionMetadataChecked(fs, filePath)
      const text = metadata.text
      const evt = findInJsonl(text, (o) => typeof (o as Json)?.cwd === 'string', 100) as Json
      cwd = cwd || (evt?.cwd ?? null)
      if (!created) {
        const first = readJsonlFirst(text) as Json
        created = (evt?.timestamp ?? null) || (first?.timestamp ?? null)
      }
      if (f.cwd && !cwd && metadata.truncated) fs.contentReadBudget?.noteSourceTruncated()
    }

    const updated = mtimeIso(fs, filePath)
    if (updated === undefined) continue
    if (!inRangeOverlap(created, updated, f)) continue
    if (f.cwd && !sameProject(cwd, f.cwd)) continue

    out.push({ platform: 'claude', id: sid, title, cwd, created, updated, filePath })
    if (fs.contentReadBudget && out.length >= f.limit) break
  }
  return out
}

function summaryText(content: Json): string {
  if (typeof content === 'string') return stripInjectionTags(content)
  if (Array.isArray(content)) {
    const parts: string[] = []
    for (const block of content) {
      if (block?.type === 'text' && typeof block.text === 'string') {
        const cleaned = stripInjectionTags(block.text)
        if (cleaned) parts.push(cleaned)
      }
    }
    return parts.join('\n\n')
  }
  return ''
}

/**
 * 纯函数：从已 parse 的 claude 事件行抽对话。
 * user：type/role user + content str；assistant：type/role assistant + content 数组只保 text；
 * thinking/tool_use 丢；compaction（isCompactSummary）→ turns 整体重置为单条。
 */
export function claudeExtractFromLines(lines: readonly Json[]): DialogueTurn[] {
  let turns: DialogueTurn[] = []
  for (const obj of lines) {
    const t = obj?.type
    const msg = obj?.message
    if (t === 'user' && obj?.isCompactSummary === true) {
      const summary = summaryText(msg?.content)
      turns = summary ? [hostSummaryTurn(`[compact summary]\n${summary}`)] : []
      continue
    }
    if (!msg) continue
    const content = msg.content
    if (t === 'user' && msg.role === 'user') {
      if (typeof content === 'string') {
        const text = stripInjectionTags(content)
        if (text && !isBootstrapTurn(text, content.length)) turns.push({ role: 'user', text })
      }
    } else if (t === 'assistant' && msg.role === 'assistant' && Array.isArray(content)) {
      const parts: string[] = []
      for (const block of content) {
        if (block?.type === 'text' && typeof block.text === 'string') {
          const cleaned = stripInjectionTags(block.text)
          if (cleaned) parts.push(cleaned)
        }
      }
      if (parts.length) turns.push({ role: 'assistant', text: parts.join('\n\n') })
    }
  }
  return turns
}

export function claudeExtractDialogue(fs: MemFs, s: MemSession): DialogueTurn[] {
  return claudeExtractFromLines(parseJsonlLines(fs.readText(s.filePath)))
}

export function claudeSearch(fs: MemFs, s: MemSession, kw: string): SearchHit {
  return searchInDialogue(claudeExtractDialogue(fs, s), kw)
}

/**
 * 单遍扫，同产清洗 turns 和 task.py create|start Bash tool_use 事件 + turnIndex。
 * compaction 同时清空 turns AND events（pre-compact 事件索引压缩后失效）。
 */
export function collectClaudeTurnsAndEvents(fs: MemFs, s: MemSession): { turns: DialogueTurn[]; events: PhaseEvent[] } {
  const state = { turns: [] as DialogueTurn[], events: [] as PhaseEvent[] }
  for (const obj of parseJsonlLines(fs.readText(s.filePath))) {
    const o = obj as Json
    const t = o?.type
    const msg = o?.message
    if (t === 'user' && o?.isCompactSummary === true) {
      const summary = summaryText(msg?.content)
      state.turns = summary ? [hostSummaryTurn(`[compact summary]\n${summary}`)] : []
      state.events = []
      continue
    }
    if (!msg) continue
    const content = msg.content
    if (t === 'user' && msg.role === 'user') {
      if (typeof content === 'string') {
        const text = stripInjectionTags(content)
        if (text && !isBootstrapTurn(text, content.length)) state.turns.push({ role: 'user', text })
      }
      continue
    }
    if (t === 'assistant' && msg.role === 'assistant' && Array.isArray(content)) {
      const parts: string[] = []
      for (const block of content) {
        const bt = block?.type
        if (bt === 'text' && typeof block.text === 'string') {
          const cleaned = stripInjectionTags(block.text)
          if (cleaned) parts.push(cleaned)
        } else if (bt === 'tool_use') {
          if (block?.name !== 'Bash') continue
          const inp = block?.input
          if (!inp || typeof inp !== 'object') continue
          const command = inp.command
          if (typeof command !== 'string') continue
          for (const parsed of parseTaskPyCommandsAll(command)) {
            const ev: PhaseEvent = { action: parsed.action, timestamp: o?.timestamp || '', turnIndex: state.turns.length }
            if (parsed.action === 'create') ev.slug = parsed.slug
            else ev.taskDir = parsed.taskDir
            state.events.push(ev)
          }
        }
      }
      if (parts.length) state.turns.push({ role: 'assistant', text: parts.join('\n\n') })
    }
  }
  return state
}
