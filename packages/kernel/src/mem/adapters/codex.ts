/**
 * mem/adapters/codex —— 持久化 Codex 会话读取器（注入 fs）。
 * 对位老仓 skills/pipeline/scripts/mem/adapters/codex.py。
 *
 * 布局：~/.codex/sessions/**\/rollout-<ts>-<id>.jsonl。元数据读首事件 payload；文件名时间戳作 created 兜底。
 */
import { basename } from 'node:path'
import type { DialogueTurn, MemFilter, MemSession, PhaseEvent, SearchHit } from '../types.js'
import type { MemFs } from '../fs.js'
import { mtimeIso, readMemSessionMetadataChecked } from '../fs.js'
import { hostSummaryTurn, isBootstrapTurn, stripInjectionTags } from '../dialogue.js'
import { inRangeOverlap, sameProjectForMemFs } from '../filter.js'
import { parseTaskPyCommandsAll } from '../phase.js'
import { searchInDialogue } from '../search.js'
import { parseJsonlLines, readJsonlFirst } from '../jsonl.js'
import { codexSessionsRoot, walkDir, walkDirForRelatedSearch } from '../paths.js'
import { required } from '../../required.js'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any

const ROLLOUT_RE = /^rollout-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})-(.+)$/
const TS_FIX_RE = /T(\d{2})-(\d{2})-(\d{2})/

function parseDialogueRole(v: unknown): 'user' | 'assistant' | null {
  return v === 'user' || v === 'assistant' ? v : null
}

/**
 * 从 Codex function_call 的 arguments 恢复 shell 命令串。三形态：
 * ① raw shell str（JSON.parse 失败原样返）；② stringified JSON obj；③ raw object 同形。
 */
export function commandFromCodexArguments(argsRaw: unknown): string | null {
  const fromObject = (obj: Json): string | null => {
    if (typeof obj.cmd === 'string') return obj.cmd
    if (typeof obj.command === 'string') return obj.command
    if (Array.isArray(obj.argv)) {
      const parts = obj.argv.filter((a: unknown) => typeof a === 'string')
      if (parts.length) return parts.join(' ')
    }
    return null
  }
  if (typeof argsRaw === 'string') {
    let parsed: unknown
    try {
      parsed = JSON.parse(argsRaw)
    } catch {
      return argsRaw // 非 JSON——某些 Codex 版本内联 raw shell 串
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return fromObject(parsed as Json)
    return null
  }
  if (argsRaw && typeof argsRaw === 'object') return fromObject(argsRaw as Json)
  return null
}

function normalizeIso(s: string): string {
  const t = Date.parse(s)
  return Number.isNaN(t) ? '' : new Date(t).toISOString()
}

export function codexListSessions(fs: MemFs, f: MemFilter): MemSession[] {
  const root = codexSessionsRoot(fs)
  if (!fs.exists(root)) return []
  const out: MemSession[] = []
  const files = fs.contentReadBudget
    ? walkDirForRelatedSearch(
      fs,
      root,
      (file) => file.endsWith('.jsonl'),
      Math.max(f.limit * 4, f.limit + 1),
      'codex',
    )
    : walkDir(fs, root)
      .filter((file) => file.endsWith('.jsonl'))
      .sort((left, right) => (fs.mtimeMs(right) ?? 0) - (fs.mtimeMs(left) ?? 0))
  for (const file of files) {
    if (fs.contentReadBudget && fs.contentReadBudget.remainingBytes() <= 0) {
      fs.contentReadBudget.noteTotalExhausted()
      break
    }
    const base = basename(file).slice(0, -'.jsonl'.length)
    const m = ROLLOUT_RE.exec(base)
    let tsFromName: string | null = null
    if (m) {
      const fixed = required(m[1]).replace(TS_FIX_RE, 'T$1:$2:$3') + 'Z'
      tsFromName = normalizeIso(fixed)
    }

    const metadata = readMemSessionMetadataChecked(fs, file)
    const first = readJsonlFirst(metadata.text) as Json
    const meta = first?.payload ?? null
    const sid: string = (meta?.id ?? null) || (m ? m[2]! : null) || base
    const cwd: string | null = meta?.cwd ?? null
    const created: string = (first?.timestamp ?? null) || tsFromName || ''

    if (f.cwd && !sameProjectForMemFs(fs, cwd, f.cwd)) {
      if (!cwd && metadata.truncated) fs.contentReadBudget?.noteSourceTruncated()
      continue
    }
    const updated = mtimeIso(fs, file)
    if (updated === undefined) continue
    if (!inRangeOverlap(created, updated, f)) continue

    out.push({ platform: 'codex', id: sid, cwd, created, updated, filePath: file })
    if (fs.contentReadBudget && out.length >= f.limit) break
  }
  return out
}

function buildTurnFromMessage(role: 'user' | 'assistant', parts: Json): DialogueTurn | null {
  const collected: string[] = []
  let totalRaw = 0
  for (const c of parts ?? []) {
    const txt = c?.text
    if (typeof txt !== 'string') continue
    if (c?.type !== 'input_text' && c?.type !== 'output_text') continue
    totalRaw += txt.length
    const cleaned = stripInjectionTags(txt)
    if (cleaned) collected.push(cleaned)
  }
  if (!collected.length) return null
  const merged = collected.join('\n\n')
  if (isBootstrapTurn(merged, totalRaw)) return null
  return { role, text: merged }
}

function compactedReplacementTurns(replacementHistory: Json[]): DialogueTurn[] {
  let summaryIndex = -1
  for (let index = replacementHistory.length - 1; index >= 0; index -= 1) {
    const item = replacementHistory[index]
    if (!item || typeof item !== 'object') continue
    // Local compaction appends its plaintext summary as the final user message. Remote
    // compaction instead ends with an opaque `compaction` item, so its preceding user message
    // remains genuine history and must not be hidden.
    if (item.type === 'message' && item.role === 'user') summaryIndex = index
    break
  }
  const turns: DialogueTurn[] = []
  for (let index = 0; index < replacementHistory.length; index += 1) {
    const item = replacementHistory[index]
    if (item?.type !== 'message') continue
    const role = parseDialogueRole(item?.role)
    if (!role) continue
    const turn = buildTurnFromMessage(role, item?.content)
    if (!turn) continue
    const text = `[compact]\n${turn.text}`
    turns.push(index === summaryIndex ? hostSummaryTurn(text) : { role: turn.role, text })
  }
  return turns
}

export function codexExtractDialogue(fs: MemFs, s: MemSession): DialogueTurn[] {
  let turns: DialogueTurn[] = []
  for (const obj of parseJsonlLines(fs.readText(s.filePath))) {
    const o = obj as Json
    if (o?.type === 'compacted') {
      const rh = o?.payload?.replacement_history
      turns = []
      if (!Array.isArray(rh)) continue
      turns = compactedReplacementTurns(rh)
      continue
    }
    const p = o?.payload
    if (!p || p.type !== 'message') continue
    const role = parseDialogueRole(p.role)
    if (!role) continue
    const turn = buildTurnFromMessage(role, p.content)
    if (turn) turns.push(turn)
  }
  return turns
}

export function codexSearch(fs: MemFs, s: MemSession, kw: string): SearchHit {
  return searchInDialogue(codexExtractDialogue(fs, s), kw)
}

export function collectCodexTurnsAndEvents(fs: MemFs, s: MemSession): { turns: DialogueTurn[]; events: PhaseEvent[] } {
  const state = { turns: [] as DialogueTurn[], events: [] as PhaseEvent[] }
  for (const obj of parseJsonlLines(fs.readText(s.filePath))) {
    const o = obj as Json
    if (o?.type === 'compacted') {
      const rh = o?.payload?.replacement_history
      state.turns = []
      state.events = []
      if (!Array.isArray(rh)) continue
      state.turns = compactedReplacementTurns(rh)
      continue
    }
    const p = o?.payload
    if (!p) continue
    if (p.type === 'function_call') {
      if (p.name !== 'exec_command' && p.name !== 'shell') continue
      const cmd = commandFromCodexArguments(p.arguments)
      if (!cmd) continue
      for (const parsed of parseTaskPyCommandsAll(cmd)) {
        const ev: PhaseEvent = { action: parsed.action, timestamp: o?.timestamp || '', turnIndex: state.turns.length }
        if (parsed.action === 'create') ev.slug = parsed.slug
        else ev.taskDir = parsed.taskDir
        state.events.push(ev)
      }
      continue
    }
    if (p.type !== 'message') continue
    const role = parseDialogueRole(p.role)
    if (!role) continue
    const turn = buildTurnFromMessage(role, p.content)
    if (turn) state.turns.push(turn)
  }
  return state
}
