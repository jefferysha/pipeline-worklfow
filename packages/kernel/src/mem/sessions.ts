/**
 * mem/sessions —— 会话编排：来源 fan-out、平台派发、子 agent child 合并、会话查找、phase 切片，
 * 及 list/search/extract 公共入口（注入 fs）。
 * 对位老仓 skills/pipeline/scripts/mem/sessions.py。
 */
import type {
  BrainstormWindow,
  DialogueGroup,
  DialogueTurn,
  ExtractResult,
  MemFilter,
  MemPhase,
  MemSession,
  MemWarning,
  PhaseEvent,
  SearchHit,
  SearchMatch,
  SearchResult,
} from './types.js'
import type { MemFs } from './fs.js'
import { buildBrainstormWindows } from './phase.js'
import { relevanceScore, searchInDialogue } from './search.js'
import {
  claudeExtractDialogue,
  claudeListSessions,
  claudeSearch,
  collectClaudeTurnsAndEvents,
} from './adapters/claude.js'
import {
  codexExtractDialogue,
  codexListSessions,
  codexSearch,
  collectCodexTurnsAndEvents,
} from './adapters/codex.js'
import {
  opencodeExtractDialogue,
  opencodeListSessions,
  opencodeResolveParentSessions,
  opencodeSearch,
} from './adapters/opencode.js'
import { collectPiTurnsAndEvents, piExtractDialogue, piListSessions, piSearch } from './adapters/pi.js'

// 内部 wide limit——limit 只 cap 显示；search 召回 + 会话查找须全量扫。
export const WIDE_LIMIT = 1_000_000

/** readMemContext / extractMemDialogue 解析不出会话 id 时抛。 */
export class MemSessionNotFoundError extends Error {
  constructor(public readonly sessionId: string) {
    super(`mem session not found: ${sessionId}`)
    this.name = 'MemSessionNotFoundError'
  }
}

/** 补全 platform / limit 默认值，让内部 helper 见到完整 filter。 */
export function resolveFilter(filt?: Partial<MemFilter>): MemFilter {
  const f = filt ?? {}
  return {
    platform: f.platform ?? 'all',
    since: f.since ?? null,
    until: f.until ?? null,
    cwd: f.cwd === undefined ? null : f.cwd,
    limit: f.limit ?? 50,
  }
}

function recencyKey(s: MemSession): string {
  return s.updated || s.created || ''
}

/** recency 降序比较（较新排前）。 */
function recencyDesc(a: MemSession, b: MemSession): number {
  const ka = recencyKey(a)
  const kb = recencyKey(b)
  return ka < kb ? 1 : ka > kb ? -1 : 0
}

/** fan out 到每个在 scope 的平台，按 recency 合并，cap 在 f.limit。 */
export function listAll(fs: MemFs, f: MemFilter): MemSession[] {
  const platform = f.platform
  const all: MemSession[] = []
  if (platform === 'all' || platform === 'claude') all.push(...claudeListSessions(fs, f))
  if (platform === 'all' || platform === 'codex') all.push(...codexListSessions(fs, f))
  if (platform === 'all' || platform === 'opencode') all.push(...opencodeListSessions(fs, f))
  if (platform === 'all' || platform === 'pi') all.push(...piListSessions(fs, f))
  all.sort(recencyDesc)
  return all.slice(0, f.limit)
}

export function extractDialogue(fs: MemFs, s: MemSession): DialogueTurn[] {
  switch (s.platform) {
    case 'claude':
      return claudeExtractDialogue(fs, s)
    case 'codex':
      return codexExtractDialogue(fs, s)
    case 'opencode':
      return opencodeExtractDialogue(fs, s)
    case 'pi':
      return piExtractDialogue(fs, s)
    default:
      return []
  }
}

function searchSession(
  fs: MemFs,
  s: MemSession,
  kw: string,
  hostSummariesAsAssistant = false,
): SearchHit {
  if (hostSummariesAsAssistant) {
    return searchInDialogue(
      extractDialogue(fs, s),
      kw,
      3,
      400,
      { hostSummariesAsAssistant: true },
    )
  }
  switch (s.platform) {
    case 'claude':
      return claudeSearch(fs, s, kw)
    case 'codex':
      return codexSearch(fs, s, kw)
    case 'opencode':
      return opencodeSearch(fs, s, kw)
    case 'pi':
      return piSearch(fs, s, kw)
    default:
      return searchInDialogue([], kw)
  }
}

function collectTurnsAndEvents(fs: MemFs, s: MemSession): { turns: DialogueTurn[]; events: PhaseEvent[] } {
  switch (s.platform) {
    case 'claude':
      return collectClaudeTurnsAndEvents(fs, s)
    case 'codex':
      return collectCodexTurnsAndEvents(fs, s)
    case 'opencode':
      return { turns: opencodeExtractDialogue(fs, s), events: [] }
    case 'pi':
      return collectPiTurnsAndEvents(fs, s)
    default:
      return { turns: [], events: [] }
  }
}

/** 建 parent → 后代（传递展平）索引，供 OpenCode 子 agent 链。栈 DFS 展平。 */
export function buildChildIndex(sessions: readonly MemSession[]): Map<string, MemSession[]> {
  const canonicalKeys = new Set(sessions.map((session) => sessionKey(session.platform, session.id)))
  const directChildren = new Map<string, MemSession[]>()
  for (const s of sessions) {
    if (s.platform !== 'opencode' || !s.parent_id) continue
    const parentKey = sessionKey('opencode', s.parent_id)
    const arr = directChildren.get(parentKey) ?? []
    arr.push(s)
    directChildren.set(parentKey, arr)
  }
  const out = new Map<string, MemSession[]>()
  const legacyAliases: Array<{ key: string; children: MemSession[] }> = []
  for (const parentKey of directChildren.keys()) {
    const stack = [...(directChildren.get(parentKey) ?? [])]
    const flat: MemSession[] = []
    const visited = new Set<string>([parentKey])
    while (stack.length) {
      const cur = stack.pop()!
      const curKey = sessionKey(cur.platform, cur.id)
      if (visited.has(curKey)) continue
      visited.add(curKey)
      flat.push(cur)
      for (const c of directChildren.get(curKey) ?? []) stack.push(c)
    }
    out.set(parentKey, flat)
    legacyAliases.push({ key: parentKey.slice('opencode:'.length), children: flat })
  }
  // Preserve unambiguous historical bare OpenCode lookups without letting an opaque id such as
  // "opencode:x" impersonate the canonical key of an actual session with id "x".
  for (const alias of legacyAliases) {
    if (!canonicalKeys.has(alias.key) && !out.has(alias.key)) out.set(alias.key, alias.children)
  }
  return out
}

/** Host session ids are opaque only within their platform namespace. */
export function sessionKey(platform: MemSession['platform'], id: string): string {
  return `${platform}:${id}`
}

/**
 * 正常 OpenCode child 由 parent 合并；损坏的环必须保留一个稳定搜索根，否则环中所有节点都会被吸收。
 * 每个环固定选择 platform:id 字典序最小者为根，确保候选顺序不影响结果。
 */
function buildAbsorbedChildKeys(sessions: readonly MemSession[]): Set<string> {
  const candidateKeys = new Set(sessions.map((session) => sessionKey(session.platform, session.id)))
  const parentByChild = new Map<string, string>()
  for (const session of sessions) {
    if (session.platform !== 'opencode' || !session.parent_id) continue
    const parentKey = sessionKey('opencode', session.parent_id)
    if (!candidateKeys.has(parentKey)) continue
    parentByChild.set(sessionKey(session.platform, session.id), parentKey)
  }

  const absorbed = new Set(parentByChild.keys())
  const completed = new Set<string>()
  for (const startKey of parentByChild.keys()) {
    if (completed.has(startKey)) continue
    const path: string[] = []
    const pathIndex = new Map<string, number>()
    let currentKey: string | undefined = startKey
    while (currentKey !== undefined && parentByChild.has(currentKey) && !completed.has(currentKey)) {
      const cycleStart = pathIndex.get(currentKey)
      if (cycleStart !== undefined) {
        const cycleKeys = path.slice(cycleStart)
        let cycleRoot = cycleKeys[0]!
        for (const key of cycleKeys) if (key < cycleRoot) cycleRoot = key
        absorbed.delete(cycleRoot)
        break
      }
      pathIndex.set(currentKey, path.length)
      path.push(currentKey)
      currentKey = parentByChild.get(currentKey)
    }
    for (const key of path) completed.add(key)
  }
  return absorbed
}

function searchSessionWithChildren(
  fs: MemFs,
  s: MemSession,
  kw: string,
  childIndex: Map<string, MemSession[]>,
  hostSummariesAsAssistant: boolean,
  searchableKeys?: ReadonlySet<string>,
): SearchHit {
  const rootKey = sessionKey(s.platform, s.id)
  const children = (childIndex.get(rootKey) ?? [])
    .filter((child) => searchableKeys?.has(sessionKey(child.platform, child.id)) ?? true)
  if (!children.length && (searchableKeys?.has(rootKey) ?? true)) {
    return searchSession(fs, s, kw, hostSummariesAsAssistant)
  }
  const merged = (searchableKeys?.has(rootKey) ?? true) ? [...extractDialogue(fs, s)] : []
  for (const c of children) merged.push(...extractDialogue(fs, c))
  return searchInDialogue(
    merged,
    kw,
    3,
    400,
    hostSummariesAsAssistant ? { hostSummariesAsAssistant: true } : {},
  )
}

/** 按精确 id 或 id 前缀解析会话，扫每个项目（强制全局全量）。精确优先，否则 startsWith 第一个。 */
export function findSessionById(fs: MemFs, sid: string, f: Partial<MemFilter>): MemSession | null {
  const wide = { ...resolveFilter(f), cwd: null, limit: WIDE_LIMIT }
  const all = listAll(fs, wide)
  for (const s of all) if (s.id === sid) return s
  for (const s of all) if (s.id.startsWith(sid)) return s
  return null
}

/**
 * 纯 phase 切片（单测可直喂 turns + events）。
 * brainstorm 空 → 全量降级 + warning；implement 空 → 空（相反降级）。
 */
export function slicePhasePure(
  turns: DialogueTurn[],
  events: PhaseEvent[],
  phase: MemPhase,
): { groups: DialogueGroup[]; windows: BrainstormWindow[]; totalTurns: number; warnings: MemWarning[] } {
  const warnings: MemWarning[] = []
  const windows = buildBrainstormWindows(events, turns.length)

  if (phase === 'brainstorm') {
    if (!windows.length) {
      warnings.push({
        code: 'no-brainstorm-boundary',
        message: 'no task.py create/start boundary found in session — returning full dialogue.',
      })
      return { groups: [{ label: null, turns }], windows: [], totalTurns: turns.length, warnings }
    }
    const groups = windows.map((w) => ({ label: w.label, turns: turns.slice(w.startTurn, w.endTurn) }))
    return { groups, windows, totalTurns: turns.length, warnings }
  }

  // phase === "implement"：不在任何 brainstorm 窗内的补集。
  if (!windows.length) {
    warnings.push({
      code: 'no-brainstorm-boundary',
      message: 'no task.py create/start boundary found in session — implement phase is empty.',
    })
    return { groups: [{ label: null, turns: [] }], windows: [], totalTurns: turns.length, warnings }
  }
  const covered = new Set<number>()
  for (const w of windows) for (let i = w.startTurn; i < w.endTurn; i++) covered.add(i)
  const implementTurns = turns.filter((_t, i) => !covered.has(i))
  return { groups: [{ label: null, turns: implementTurns }], windows, totalTurns: turns.length, warnings }
}

/** 按 phase 切清洗对话。Claude/Codex/Pi 有原生边界检测；OpenCode 降级全量 + warning。 */
function sliceMemPhase(
  fs: MemFs,
  s: MemSession,
  phase: MemPhase,
): { groups: DialogueGroup[]; windows: BrainstormWindow[]; totalTurns: number; warnings: MemWarning[] } {
  const warnings: MemWarning[] = []
  if (phase === 'all' || s.platform === 'opencode') {
    if (phase !== 'all' && s.platform === 'opencode') {
      warnings.push({
        code: 'opencode-phase-unsupported',
        message: `--phase ${phase} on platform=opencode is not yet supported; returning full dialogue.`,
      })
    }
    const turns = extractDialogue(fs, s)
    return { groups: [{ label: null, turns }], windows: [], totalTurns: turns.length, warnings }
  }
  const collected = collectTurnsAndEvents(fs, s)
  return slicePhasePure(collected.turns, collected.events, phase)
}

/** extract 的 grep 是单子串 includes（≠ search/context 的多 token AND）。grepLc 已小写。 */
function applyGrep(turns: DialogueTurn[], grepLc: string | null): DialogueTurn[] {
  if (!grepLc) return turns
  return turns.filter((t) => t.text.toLowerCase().includes(grepLc))
}

// ---------- public API ----------

export function listMemSessions(fs: MemFs, options?: { filter?: Partial<MemFilter> }): MemSession[] {
  return listAll(fs, resolveFilter(options?.filter))
}

export function searchMemSessions(
  fs: MemFs,
  options: {
    keyword: string
    filter?: Partial<MemFilter>
    includeChildren?: boolean
    /** 新增调用方可显式约束扫描候选；省略时保留 CLI 的全量召回语义。 */
    candidateLimit?: number
    /** Related Sessions only: synthetic host summaries never qualify as original user content. */
    hostSummariesAsAssistant?: boolean
  },
): SearchResult {
  const f = resolveFilter(options.filter)
  const kw = options.keyword
  const includeChildren = options.includeChildren === true
  const hostSummariesAsAssistant = options.hostSummariesAsAssistant === true

  const requestedCandidateLimit = options.candidateLimit
  const candidateLimit =
    typeof requestedCandidateLimit === 'number'
    && Number.isSafeInteger(requestedCandidateLimit)
    && requestedCandidateLimit > 0
      ? requestedCandidateLimit
      : null
  const wide = { ...f, limit: candidateLimit === null ? WIDE_LIMIT : candidateLimit + 1 }
  const listedCandidates = listAll(fs, wide)
  const candidatesTruncated = candidateLimit !== null && listedCandidates.length > candidateLimit
  const candidates = candidateLimit === null ? listedCandidates : listedCandidates.slice(0, candidateLimit)
  const searchableKeys = new Set(
    candidates.map((session) => sessionKey(session.platform, session.id)),
  )
  const supportSessions = includeChildren && candidateLimit !== null
    ? opencodeResolveParentSessions(fs, candidates, f, candidateLimit)
    : []
  const graphSessions = [...candidates, ...supportSessions]
  const childIndex = includeChildren ? buildChildIndex(graphSessions) : new Map<string, MemSession[]>()
  const absorbedChildKeys = includeChildren ? buildAbsorbedChildKeys(graphSessions) : new Set<string>()
  const supportRoots = supportSessions.filter((session) => {
    const key = sessionKey(session.platform, session.id)
    if (absorbedChildKeys.has(key)) return false
    return (childIndex.get(key) ?? []).some((child) => (
      searchableKeys.has(sessionKey(child.platform, child.id))
    ))
  })
  const searchRoots = [...candidates, ...supportRoots]

  const matches: SearchMatch[] = []
  for (const s of searchRoots) {
    if (absorbedChildKeys.has(sessionKey(s.platform, s.id))) continue
    const hit = includeChildren
      ? searchSessionWithChildren(
        fs,
        s,
        kw,
        childIndex,
        hostSummariesAsAssistant,
        searchableKeys,
      )
      : searchSession(fs, s, kw, hostSummariesAsAssistant)
    if (hit.count === 0) continue
    const descendantsMerged = (childIndex.get(sessionKey(s.platform, s.id)) ?? [])
      .filter((child) => searchableKeys.has(sessionKey(child.platform, child.id)))
      .length
    matches.push({
      session: s,
      hit,
      score: relevanceScore(hit),
      descendantsMerged,
    })
  }
  // score 降 > hit.count 降 > recency 降
  matches.sort((a, b) => b.score - a.score || b.hit.count - a.hit.count || recencyDesc(a.session, b.session))

  const warnings: MemWarning[] = []
  if (candidatesTruncated) {
    warnings.push({
      code: 'candidate-limit-reached',
      message: `Only the ${candidateLimit} most recent sessions were searched.`,
    })
  }
  return { matches: matches.slice(0, f.limit), totalMatches: matches.length, warnings }
}

export function extractMemDialogue(
  fs: MemFs,
  options: { sessionId: string; filter?: Partial<MemFilter>; phase?: MemPhase; grep?: string | null },
): ExtractResult {
  const f = resolveFilter(options.filter)
  const phase: MemPhase = options.phase ?? 'all'
  const s = findSessionById(fs, options.sessionId, f)
  if (!s) throw new MemSessionNotFoundError(options.sessionId)

  const sl = sliceMemPhase(fs, s, phase)
  const grepLc = typeof options.grep === 'string' ? options.grep.toLowerCase() : null

  const groups: DialogueGroup[] = sl.groups.map((g) => ({ label: g.label, turns: applyGrep(g.turns, grepLc) }))
  const flat: DialogueTurn[] = []
  for (const g of groups) flat.push(...g.turns)

  return {
    session: s,
    phase,
    windows: sl.windows,
    totalTurns: sl.totalTurns,
    groups,
    turns: flat,
    warnings: sl.warnings,
  }
}
