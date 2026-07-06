/**
 * mem/context —— 对话窗上下文抽取（纯选择 + fs 注入的 readMemContext）。
 * 对位老仓 skills/pipeline/scripts/mem/context.py。
 */
import type { ContextResult, ContextTurn, DialogueTurn, MemFilter } from './types.js'
import type { MemFs } from './fs.js'
import {
  buildChildIndex,
  extractDialogue,
  findSessionById,
  listAll,
  MemSessionNotFoundError,
  resolveFilter,
  WIDE_LIMIT,
} from './sessions.js'

export interface SelectResult {
  turns: ContextTurn[]
  totalHitTurns: number
  budgetUsed: number
}

/**
 * 纯选择：对 grep 排名 turn（user 优先 > hit 密度），取 top nTurns，每个按 around 扩展上下文，
 * 再在 maxChars 内 emit——单 turn 超半预算则头截断。无 grep → 返前 nTurns 个 turn。
 * 不可阉割：user 优先 / around 扩展 / 半预算头截断 / out 非空才 break。
 */
export function selectContextTurns(
  turns: readonly (DialogueTurn | null | undefined)[],
  grep: string | null,
  nTurns: number,
  around: number,
  maxChars: number,
): SelectResult {
  let hitIndices: number[] = []
  let totalHitTurns = 0

  if (grep) {
    const tokens = grep.toLowerCase().split(/\s+/).filter(Boolean)
    const matchCount = (text: string): number => {
      const hay = text.toLowerCase()
      if (!tokens.every((tok) => hay.includes(tok))) return 0
      let n = 0
      for (const tok of tokens) {
        let frm = 0
        for (;;) {
          const idx = hay.indexOf(tok, frm)
          if (idx === -1) break
          n += 1
          frm = idx + tok.length
        }
      }
      return n
    }
    const ranked: Array<{ idx: number; role: string; hits: number }> = []
    turns.forEach((turn, i) => {
      if (turn == null) return
      const h = tokens.length === 0 ? 0 : matchCount(turn.text)
      if (h > 0) ranked.push({ idx: i, role: turn.role, hits: h })
    })
    totalHitTurns = ranked.length
    // user 优先 > hits 降 > idx 升
    ranked.sort(
      (a, b) => (a.role === 'user' ? 0 : 1) - (b.role === 'user' ? 0 : 1) || b.hits - a.hits || a.idx - b.idx,
    )
    hitIndices = ranked.slice(0, nTurns).map((r) => r.idx)
  } else {
    for (let i = 0; i < Math.min(nTurns, turns.length); i++) hitIndices.push(i)
  }

  // around 扩展，Set 去重
  const display = new Set<number>()
  for (const idx of hitIndices) {
    const lo = Math.max(0, idx - around)
    const hi = Math.min(turns.length - 1, idx + around)
    for (let j = lo; j <= hi; j++) display.add(j)
  }
  const ordered = [...display].sort((a, b) => a - b)
  const hitSet = new Set(hitIndices)

  const out: ContextTurn[] = []
  let used = 0
  for (const i of ordered) {
    const t = turns[i]
    if (t == null) continue
    let text = t.text
    const cap = Math.floor(maxChars / 2)
    if (text.length > cap) text = text.slice(0, cap) + `\n…[+${t.text.length - cap} chars]`
    // out 非空才 break（保证至少出一条）
    if (used + text.length > maxChars && out.length > 0) break
    out.push({ idx: i, role: t.role, text, isHit: hitSet.has(i) })
    used += text.length
  }

  return { turns: out, totalHitTurns, budgetUsed: used }
}

/** 钻入单会话：top-N hit turn + 周围上下文，字符预算。无 grep → 会话开头。 */
export function readMemContext(
  fs: MemFs,
  options: {
    sessionId: string
    filter?: Partial<MemFilter>
    grep?: string | null
    turns?: number
    around?: number
    maxChars?: number
    includeChildren?: boolean
  },
): ContextResult {
  const f = resolveFilter(options.filter)
  const s = findSessionById(fs, options.sessionId, f)
  if (!s) throw new MemSessionNotFoundError(options.sessionId)

  const grep = typeof options.grep === 'string' ? options.grep : null
  const nTurns = options.turns ?? 3
  const around = options.around ?? 1
  const maxChars = options.maxChars ?? 6000

  let turns = extractDialogue(fs, s)
  let mergedChildren = 0
  if (options.includeChildren === true) {
    const wide = { ...f, cwd: null, limit: WIDE_LIMIT }
    const all = listAll(fs, wide)
    const childIndex = buildChildIndex(all)
    const kids = childIndex.get(s.id) ?? []
    mergedChildren = kids.length
    for (const c of kids) turns = turns.concat(extractDialogue(fs, c))
  }

  const selected = selectContextTurns(turns, grep, nTurns, around, maxChars)

  return {
    session: s,
    query: grep,
    totalTurns: turns.length,
    totalHitTurns: selected.totalHitTurns,
    mergedChildren,
    budgetUsed: selected.budgetUsed,
    maxChars,
    turns: selected.turns,
    warnings: [],
  }
}
