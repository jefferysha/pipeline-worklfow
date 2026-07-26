import type { MemFs, MemSession, SearchMatch } from '@tenon/kernel'
import type { CliDeps } from '../deps.js'

export const memIsoDate = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

export function padMemRight(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length)
}

export function padMemLeft(value: string, width: number): string {
  return value.length >= width ? value : ' '.repeat(width - value.length) + value
}

export function shortMemDate(iso: string | null | undefined): string {
  if (!iso) return ' '.repeat(9)
  return iso.slice(0, 16).replace('T', ' ')
}

export function shortMemPath(fs: MemFs, path: string | null | undefined): string {
  if (!path) return '(no cwd)'
  return path.split(fs.home).join('~')
}

export function printMemSessions(deps: CliDeps, fs: MemFs, rows: MemSession[]): void {
  if (rows.length === 0) {
    deps.io.out('(no sessions)')
    return
  }
  for (const session of rows) {
    const sessionId = session.id.length > 12 ? session.id.slice(0, 12) : padMemRight(session.id, 12)
    const parentTag = session.parent_id ? `  ↳ child of ${session.parent_id.slice(0, 12)}` : ''
    const title = session.title ? `  — ${session.title}` : ''
    deps.io.out(
      `[${padMemRight(session.platform, 8)}] ${shortMemDate(session.updated || session.created)}  ${sessionId}  ${shortMemPath(fs, session.cwd)}${title}${parentTag}`,
    )
  }
}

export function searchMatchJson(match: SearchMatch, includeChildren: boolean): unknown {
  const hit = match.hit
  return {
    session: match.session,
    score: Math.round(match.score * 10000) / 10000,
    hit_count: hit.count,
    user_count: hit.userCount,
    asst_count: hit.asstCount,
    total_turns: hit.totalTurns,
    descendants_merged: includeChildren ? match.descendantsMerged : 0,
    excerpts: hit.excerpts,
  }
}
