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

export interface SearchInDialogueOptions {
  /** Privacy-sensitive callers may prevent synthetic host summaries from counting as original user text. */
  hostSummariesAsAssistant?: boolean
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
  options: SearchInDialogueOptions = {},
): SearchHit {
  const tokens = kw.toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) {
    return { count: 0, userCount: 0, asstCount: 0, totalTurns: turns.length, excerpts: [] }
  }
  const tokenMultiplicity = new Map<string, number>()
  for (const token of tokens) tokenMultiplicity.set(token, (tokenMultiplicity.get(token) ?? 0) + 1)
  const excerptLimit = Math.max(0, Math.trunc(maxExcerpts))

  let userCount = 0
  let asstCount = 0
  const userExcerpts: SearchExcerpt[] = []
  const asstExcerpts: SearchExcerpt[] = []

  for (const t of turns) {
    const effectiveRole = options.hostSummariesAsAssistant && isHostSummaryTurn(t) ? 'assistant' : t.role
    const hay = t.text.toLowerCase()
    if (!tokens.every((tok) => hay.includes(tok))) continue

    const tokenFreq = new Map<string, number>()
    let turnHits = 0
    const target = effectiveRole === 'user' ? userExcerpts : asstExcerpts
    const candidateBudget = Math.max(0, excerptLimit - target.length)
    for (const [tok, multiplicity] of tokenMultiplicity) {
      let frm = 0
      let n = 0
      for (;;) {
        const idx = hay.indexOf(tok, frm)
        if (idx === -1) break
        n += 1
        frm = idx + tok.length
      }
      tokenFreq.set(tok, n)
      turnHits += n * multiplicity
    }
    if (effectiveRole === 'user') userCount += turnHits
    else asstCount += turnHits

    const candidates = candidateBudget > 0
      ? selectExcerptCandidates(t.text, hay, tokens, tokenFreq, chunkChars, candidateBudget)
      : []
    for (const c of candidates) {
      let snippet = t.text.slice(c.start, c.end).trim()
      if (c.truncated) {
        if (c.start > 0) snippet = '…' + snippet
        if (c.end < t.text.length) snippet = snippet + '…'
      }
      target.push({ role: effectiveRole, snippet })
      if (target.length >= excerptLimit) break
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

interface RankedChunk extends ChunkSpan {
  coverage: number
  rarity: number
}

function compareRankedChunks(a: RankedChunk, b: RankedChunk): number {
  return b.coverage - a.coverage || b.rarity - a.rarity || a.start - b.start
}

/**
 * Merge each token's occurrence stream by position, so every distinct chunk remains eligible for
 * coverage ranking without retaining an unbounded hit-position array. The top-K array is bounded by
 * the caller's remaining excerpt slots; occurrence counting stays exact in the preceding pass.
 */
function selectExcerptCandidates(
  text: string,
  hay: string,
  tokens: readonly string[],
  tokenFreq: ReadonlyMap<string, number>,
  chunkChars: number,
  limit: number,
): RankedChunk[] {
  const locateChunk = createChunkLocator(text, chunkChars)
  const cursors = Array.from(tokenFreq.keys(), (tok) => ({ tok, idx: hay.indexOf(tok) }))
  const selected: RankedChunk[] = []
  let lastStart: number | null = null

  for (;;) {
    let nextCursor = -1
    for (let idx = 0; idx < cursors.length; idx += 1) {
      const occurrence = cursors[idx]?.idx ?? -1
      if (occurrence === -1) continue
      if (nextCursor === -1 || occurrence < (cursors[nextCursor]?.idx ?? Number.MAX_SAFE_INTEGER)) {
        nextCursor = idx
      }
    }
    if (nextCursor === -1) break

    const cursor = cursors[nextCursor]!
    const occurrence = cursor.idx
    const chunk = locateChunk(occurrence)
    if (chunk.start !== lastStart) {
      lastStart = chunk.start
      const slice = hay.slice(chunk.start, chunk.end)
      const coverage = tokens.reduce((total, token) => total + (slice.includes(token) ? 1 : 0), 0)
      selected.push({
        ...chunk,
        coverage,
        rarity: 1 / (tokenFreq.get(cursor.tok) || 1),
      })
      selected.sort(compareRankedChunks)
      if (selected.length > limit) selected.pop()
    }
    cursor.idx = hay.indexOf(cursor.tok, occurrence + cursor.tok.length)
  }

  return selected
}

function createChunkLocator(text: string, maxChars: number): (hitIdx: number) => ChunkSpan {
  const paragraphBreaks: number[] = []
  let from = 0
  for (;;) {
    const idx = text.indexOf('\n\n', from)
    if (idx === -1) break
    paragraphBreaks.push(idx)
    from = idx + 1
  }

  const lowerBound = (value: number): number => {
    let low = 0
    let high = paragraphBreaks.length
    while (low < high) {
      const mid = low + Math.floor((high - low) / 2)
      if ((paragraphBreaks[mid] ?? 0) < value) low = mid + 1
      else high = mid
    }
    return low
  }

  return (hitIdx) => {
    const nextIdx = lowerBound(hitIdx)
    const previousIdx = lowerBound(hitIdx - 1) - 1
    let start = previousIdx >= 0 ? (paragraphBreaks[previousIdx] ?? -2) + 2 : 0
    let end = nextIdx < paragraphBreaks.length ? (paragraphBreaks[nextIdx] ?? text.length) : text.length
    let truncated = false
    if (end - start > maxChars) {
      start = Math.max(0, hitIdx - Math.floor(maxChars / 2))
      end = Math.min(text.length, hitIdx + Math.ceil(maxChars / 2))
      truncated = true
    }
    return { start, end, truncated }
  }
}
