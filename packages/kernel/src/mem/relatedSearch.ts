import type { BoundedTextRead, MemFs } from './fs.js'
import { searchMemSessions } from './sessions.js'
import type {
  MemPlatformFilter,
  MemWarning,
  RelatedSessionMatch,
  RelatedSessionSearchResult,
} from './types.js'

export const RELATED_SESSION_SEARCH_BUDGETS = Object.freeze({
  queryMinChars: 2,
  queryMaxChars: 128,
  queryMaxTokens: 8,
  candidates: 100,
  results: 8,
  perFileBytes: 2 * 1024 * 1024,
  totalBytes: 16 * 1024 * 1024,
  excerptChars: 320,
  titleChars: 160,
})

const PLATFORMS = new Set<MemPlatformFilter>(['all', 'claude', 'codex', 'opencode', 'pi'])

export type RelatedSessionSearchInputErrorReason =
  | 'query-length'
  | 'query-token-count'
  | 'invalid-platform'

export class RelatedSessionSearchInputError extends Error {
  constructor(public readonly reason: RelatedSessionSearchInputErrorReason) {
    super(`invalid related-session search input: ${reason}`)
    this.name = 'RelatedSessionSearchInputError'
  }
}

export interface RelatedSessionSearchOptions {
  root: string
  query: string
  platform: MemPlatformFilter
}

interface BudgetState {
  bytesRead: number
  warnings: MemWarning[]
  warningCodes: Set<string>
}

function addWarning(state: BudgetState, warning: MemWarning): void {
  if (state.warningCodes.has(warning.code)) return
  state.warningCodes.add(warning.code)
  state.warnings.push(warning)
}

/**
 * Existing adapters consume MemFs.readText. This request-local wrapper redirects every text read through
 * the optional bounded primitive, caches it, and stops issuing reads when the aggregate budget is spent.
 * nodeMemFs always supplies the primitive; the fallback exists only for older injected fakes and is
 * explicitly reported as partial because it cannot prove a read-layer ceiling.
 */
function budgetedFs(source: MemFs, state: BudgetState): MemFs {
  const cache = new Map<string, string | undefined>()
  const sourceEnv = source.env

  const boundedRead = (path: string, maxBytes: number): BoundedTextRead | undefined => {
    if (source.readTextBounded) return source.readTextBounded(path, maxBytes)

    const raw = source.readText(path)
    if (raw === undefined) return undefined
    addWarning(state, {
      code: 'bounded-read-unavailable',
      message: 'A session source could not prove a read-layer byte ceiling.',
    })
    const bytes = Buffer.from(raw)
    const selected = bytes.subarray(0, maxBytes)
    return {
      text: selected.toString('utf8'),
      bytesRead: selected.byteLength,
      truncated: selected.byteLength < bytes.byteLength,
    }
  }

  return {
    home: source.home,
    exists: (path) => source.exists(path),
    readDir: (path) => source.readDir(path),
    readText: (path) => {
      if (cache.has(path)) return cache.get(path)
      const remaining = RELATED_SESSION_SEARCH_BUDGETS.totalBytes - state.bytesRead
      if (remaining <= 0) {
        addWarning(state, {
          code: 'total-read-budget-exhausted',
          message: 'The total session-read budget was exhausted.',
        })
        cache.set(path, undefined)
        return undefined
      }

      const maxBytes = Math.min(RELATED_SESSION_SEARCH_BUDGETS.perFileBytes, remaining)
      const read = boundedRead(path, maxBytes)
      if (!read) {
        if (source.exists(path)) {
          addWarning(state, {
            code: 'file-read-unavailable',
            message: 'A session source could not be read.',
          })
        }
        cache.set(path, undefined)
        return undefined
      }

      const bytesRead = Math.min(maxBytes, Math.max(0, Math.trunc(read.bytesRead)))
      state.bytesRead += bytesRead
      const textBytes = Buffer.from(read.text)
      const text = textBytes.subarray(0, maxBytes).toString('utf8')

      if (read.truncated) {
        if (maxBytes < RELATED_SESSION_SEARCH_BUDGETS.perFileBytes) {
          addWarning(state, {
            code: 'total-read-budget-exhausted',
            message: 'The total session-read budget was exhausted.',
          })
        } else {
          addWarning(state, {
            code: 'file-read-truncated',
            message: 'At least one session exceeded the per-file read budget.',
          })
        }
      }
      cache.set(path, text)
      return text
    },
    mtimeMs: (path) => source.mtimeMs(path),
    env: sourceEnv ? (name) => sourceEnv(name) : undefined,
    contentReadBudget: {
      perSourceBytes: RELATED_SESSION_SEARCH_BUDGETS.perFileBytes,
      remainingBytes: () => RELATED_SESSION_SEARCH_BUDGETS.totalBytes - state.bytesRead,
      consume: (bytes) => {
        const remaining = RELATED_SESSION_SEARCH_BUDGETS.totalBytes - state.bytesRead
        state.bytesRead += Math.min(remaining, Math.max(0, Math.trunc(bytes)))
      },
      noteSourceTruncated: () => addWarning(state, {
        code: 'file-read-truncated',
        message: 'At least one session exceeded the per-file read budget.',
      }),
      noteTotalExhausted: () => addWarning(state, {
        code: 'total-read-budget-exhausted',
        message: 'The total session-read budget was exhausted.',
      }),
    },
  }
}

function validateOptions(options: RelatedSessionSearchOptions): { query: string; platform: MemPlatformFilter } {
  const query = typeof options.query === 'string' ? options.query.trim() : ''
  const queryLength = Array.from(query).length
  if (
    queryLength < RELATED_SESSION_SEARCH_BUDGETS.queryMinChars
    || queryLength > RELATED_SESSION_SEARCH_BUDGETS.queryMaxChars
  ) {
    throw new RelatedSessionSearchInputError('query-length')
  }
  if (query.split(/\s+/).filter(Boolean).length > RELATED_SESSION_SEARCH_BUDGETS.queryMaxTokens) {
    throw new RelatedSessionSearchInputError('query-token-count')
  }
  if (!PLATFORMS.has(options.platform)) {
    throw new RelatedSessionSearchInputError('invalid-platform')
  }
  return { query, platform: options.platform }
}

function boundedDisplayText(raw: string | null | undefined, maxChars: number): string | null {
  if (typeof raw !== 'string') return null
  const normalized = raw.replace(/\s+/g, ' ').trim()
  if (!normalized) return null
  const chars = Array.from(normalized)
  if (chars.length <= maxChars) return normalized
  return chars.slice(0, maxChars - 1).join('').trimEnd() + '…'
}

/**
 * Project-scoped, privacy-reduced search for the Dashboard.
 *
 * This is deliberately separate from searchMemSessions so the CLI retains its existing unbounded
 * recall contract. The returned DTO cannot serialize session source paths, cwd, or assistant text.
 */
export function searchRelatedSessions(
  fs: MemFs,
  options: RelatedSessionSearchOptions,
): RelatedSessionSearchResult {
  const { query, platform } = validateOptions(options)
  const state: BudgetState = { bytesRead: 0, warnings: [], warningCodes: new Set() }
  const scopedFs = budgetedFs(fs, state)

  const search = searchMemSessions(scopedFs, {
    keyword: query,
    filter: {
      cwd: options.root,
      platform,
      limit: RELATED_SESSION_SEARCH_BUDGETS.candidates,
    },
    includeChildren: true,
    candidateLimit: RELATED_SESSION_SEARCH_BUDGETS.candidates,
  })
  for (const warning of search.warnings) addWarning(state, warning)

  const matches: RelatedSessionMatch[] = []
  for (const match of search.matches) {
    if (match.hit.userCount <= 0) continue
    const userExcerpt = match.hit.excerpts.find((excerpt) => excerpt.role === 'user')
    const excerpt = boundedDisplayText(userExcerpt?.snippet, RELATED_SESSION_SEARCH_BUDGETS.excerptChars)
    if (!excerpt) continue
    const totalTurns = match.hit.totalTurns
    matches.push({
      platform: match.session.platform,
      sessionId: match.session.id,
      title: boundedDisplayText(match.session.title, RELATED_SESSION_SEARCH_BUDGETS.titleChars),
      updatedAt: match.session.updated ?? null,
      score: totalTurns > 0 ? (3 * match.hit.userCount) / totalTurns : 0,
      hitCount: match.hit.userCount,
      excerpt,
      descendantsMerged: match.descendantsMerged,
    })
  }
  matches.sort((a, b) => {
    const relevance = b.score - a.score || b.hitCount - a.hitCount
    if (relevance !== 0) return relevance
    const aUpdated = a.updatedAt ?? ''
    const bUpdated = b.updatedAt ?? ''
    return aUpdated < bUpdated ? 1 : aUpdated > bUpdated ? -1 : 0
  })

  return {
    query,
    platform,
    partial: state.warnings.length > 0,
    warnings: state.warnings,
    matches: matches.slice(0, RELATED_SESSION_SEARCH_BUDGETS.results),
  }
}
