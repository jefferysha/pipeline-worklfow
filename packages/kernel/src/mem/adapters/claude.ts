/**
 * mem/adapters/claude —— 持久化 Claude Code 会话读取器（注入 fs）。
 * 对位老仓 skills/pipeline/scripts/mem/adapters/claude.py。
 *
 * 布局：~/.claude/projects/<sanitized-cwd>/<sessionId>.jsonl，可选 <projectDir>/sessions-index.json
 * 提供 cwd/created/title。extract 只收 user/assistant text，丢 thinking/tool_use。
 */
import { join } from 'node:path'
import type { DialogueTurn, MemFilter, MemSession, PhaseEvent, SearchHit } from '../types.js'
import type { MemFs } from '../fs.js'
import { mtimeIso } from '../fs.js'
import { isBootstrapTurn, stripInjectionTags } from '../dialogue.js'
import { inRangeOverlap, sameProject } from '../filter.js'
import { parseTaskPyCommandsAll } from '../phase.js'
import { searchInDialogue } from '../search.js'
import { findInJsonl, parseJsonlLines, readJsonlFirst } from '../jsonl.js'
import { claudeProjectDirFromCwd, claudeProjectsRoot } from '../paths.js'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any

export function claudeListSessions(fs: MemFs, f: MemFilter): MemSession[] {
  const root = claudeProjectsRoot(fs)
  if (!fs.exists(root)) return []
  const out: MemSession[] = []

  const allDirs = (): string[] => fs.readDir(root).filter((e) => e.isDirectory).map((e) => join(root, e.name))

  // --cwd fast path：派生名不存在则全扫——per-session sameProject 仍兜底，永不静默返 0。
  let projectDirs: string[]
  if (f.cwd) {
    const derived = claudeProjectDirFromCwd(fs, f.cwd)
    projectDirs = fs.exists(derived) ? [derived] : allDirs()
  } else {
    projectDirs = allDirs()
  }

  for (const d of projectDirs) {
    const entries = fs.readDir(d)

    const indexRaw = fs.readText(join(d, 'sessions-index.json'))
    const indexById = new Map<string, Json>()
    if (indexRaw) {
      try {
        const index = JSON.parse(indexRaw)
        const idxEntries = index && Array.isArray(index.entries) ? index.entries : []
        for (const e of idxEntries) if (e && typeof e.id === 'string') indexById.set(e.id, e)
      } catch {
        /* 坏 index 忽略，退到 per-session 兜底 */
      }
    }

    for (const e of entries) {
      if (!e.isFile || !e.name.endsWith('.jsonl')) continue
      const filePath = join(d, e.name)
      const sid = e.name.slice(0, -'.jsonl'.length)
      const idx = indexById.get(sid)
      let cwd: string | null = idx?.cwd ?? null
      let created: string | null = idx?.created ?? null
      const title: string | null = idx?.title ?? null

      if (!cwd || !created) {
        const text = fs.readText(filePath)
        const evt = findInJsonl(text, (o) => typeof (o as Json)?.cwd === 'string', 100) as Json
        cwd = cwd || (evt?.cwd ?? null)
        if (!created) {
          const first = readJsonlFirst(text) as Json
          created = (evt?.timestamp ?? null) || (first?.timestamp ?? null)
        }
      }

      const updated = mtimeIso(fs, filePath)
      if (updated === undefined) continue
      if (!inRangeOverlap(created, updated, f)) continue
      if (f.cwd && cwd && !sameProject(cwd, f.cwd)) continue

      out.push({ platform: 'claude', id: sid, title, cwd, created, updated, filePath })
    }
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
      turns = summary ? [{ role: 'user', text: `[compact summary]\n${summary}` }] : []
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
      state.turns = summary ? [{ role: 'user', text: `[compact summary]\n${summary}` }] : []
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
