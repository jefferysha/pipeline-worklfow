/**
 * mem/search —— 检索评分 + 多 token AND 文本匹配（纯逻辑）。
 * 对位老仓 skills/pipeline/scripts/mem/search.py。
 */
import type { DialogueTurn, SearchExcerpt, SearchHit } from './types.js'
import { isHostSummaryTurn } from './dialogue.js'

/**
 * 加权密度相关性：(3*userCount + asstCount) / totalTurns。
 * user 命中 ×3——用户原话才是「真正在意的」，assistant 阐述是下游噪声；除 totalTurns 归一让
 * 短而集中的会话压过又长又水的。totalTurns==0 → 0。
 */
export function relevanceScore(h: SearchHit): number {
  const total = h.totalTurns ?? 0
  if (total === 0) return 0
  return (3 * (h.userCount ?? 0) + (h.asstCount ?? 0)) / total
}

export interface ChunkSpan {
  start: number
  end: number
  truncated: boolean
}

/**
 * 找 hit 位置周围的段落对齐 chunk（两侧最近 \n\n 之间的连续文本）。
 * 若自然段超 maxChars → 居中字符窗回退并报 truncated。
 */
export function chunkAround(text: string, hitIdx: number, maxChars: number): ChunkSpan {
  const startPara = text.slice(0, hitIdx).lastIndexOf('\n\n')
  let start = startPara === -1 ? 0 : startPara + 2
  const endPara = text.indexOf('\n\n', hitIdx)
  let end = endPara === -1 ? text.length : endPara
  let truncated = false
  if (end - start > maxChars) {
    start = Math.max(0, hitIdx - Math.floor(maxChars / 2))
    end = Math.min(text.length, hitIdx + Math.ceil(maxChars / 2))
    truncated = true
  }
  return { start, end, truncated }
}

/**
 * 多 token AND grep。空白分词；turn 命中 iff 每个 token（大小写不敏感）都出现。
 * count = 命中 turn 内全部 token 出现总数。excerpts 是 hit 周围段落对齐 chunk，按 chunk
 * start 去重；user-role chunk 列在 assistant chunk 前。
 */
export function searchInDialogue(
  turns: readonly DialogueTurn[],
  kw: string,
  maxExcerpts = 3,
  chunkChars = 400,
): SearchHit {
  const tokens = kw.toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) {
    return { count: 0, userCount: 0, asstCount: 0, totalTurns: turns.length, excerpts: [] }
  }

  let userCount = 0
  let asstCount = 0
  const userExcerpts: SearchExcerpt[] = []
  const asstExcerpts: SearchExcerpt[] = []

  for (const t of turns) {
    const effectiveRole = isHostSummaryTurn(t) ? 'assistant' : t.role
    const hay = t.text.toLowerCase()
    if (!tokens.every((tok) => hay.includes(tok))) continue

    const hitPositions: Array<{ idx: number; tok: string }> = []
    const tokenFreq = new Map<string, number>()
    let turnHits = 0
    for (const tok of tokens) {
      let frm = 0
      let n = 0
      for (;;) {
        const idx = hay.indexOf(tok, frm)
        if (idx === -1) break
        n += 1
        turnHits += 1
        hitPositions.push({ idx, tok })
        frm = idx + tok.length
      }
      tokenFreq.set(tok, n)
    }
    if (effectiveRole === 'user') userCount += turnHits
    else asstCount += turnHits
    hitPositions.sort((a, b) => a.idx - b.idx)

    const candidates: Array<ChunkSpan & { coverage: number; rarity: number }> = []
    const seenStarts = new Set<number>()
    for (const { idx, tok } of hitPositions) {
      const ca = chunkAround(t.text, idx, chunkChars)
      if (seenStarts.has(ca.start)) continue
      seenStarts.add(ca.start)
      const sl = hay.slice(ca.start, ca.end)
      const coverage = tokens.reduce((acc, tk) => acc + (sl.includes(tk) ? 1 : 0), 0)
      const rarity = 1 / (tokenFreq.get(tok) || 1)
      candidates.push({ start: ca.start, end: ca.end, truncated: ca.truncated, coverage, rarity })
    }
    // 三级排序：coverage 降 > rarity 降 > start 升
    candidates.sort((a, b) => b.coverage - a.coverage || b.rarity - a.rarity || a.start - b.start)
    for (const c of candidates) {
      let snippet = t.text.slice(c.start, c.end).trim()
      if (c.truncated) {
        if (c.start > 0) snippet = '…' + snippet
        if (c.end < t.text.length) snippet = snippet + '…'
      }
      const target = effectiveRole === 'user' ? userExcerpts : asstExcerpts
      target.push({ role: effectiveRole, snippet })
    }
  }

  // user excerpts 全前置，再 cap
  const excerpts = [...userExcerpts, ...asstExcerpts].slice(0, maxExcerpts)
  return {
    count: userCount + asstCount,
    userCount,
    asstCount,
    totalTurns: turns.length,
    excerpts,
  }
}
