import { resolve } from 'node:path'
import type { MemContentReadBudget, MemFs } from '../fs.js'
import { sameProjectForMemFs } from '../filter.js'
import type { MemFilter } from '../types.js'

type Json = Record<string, unknown>
type SqliteNS = typeof import('node:sqlite')
type SqliteDb = InstanceType<SqliteNS['DatabaseSync']>

export interface SqliteSourceBudget {
  bytesRead: number
  truncated: boolean
}

/**
 * A related-search contentReadBudget is request-local. Weak keys keep the database counters alive
 * for that request without retaining completed requests; the path keeps distinct OpenCode databases
 * independent when an injected caller uses one budget across multiple MemFs roots.
 */
const sqliteSourceBudgets = new WeakMap<MemContentReadBudget, Map<string, SqliteSourceBudget>>()

export function sqliteSourceBudget(fs: MemFs, dbPath: string): SqliteSourceBudget {
  const budget = fs.contentReadBudget
  if (!budget) return { bytesRead: 0, truncated: false }

  let sources = sqliteSourceBudgets.get(budget)
  if (!sources) {
    sources = new Map()
    sqliteSourceBudgets.set(budget, sources)
  }
  let source = sources.get(dbPath)
  if (!source) {
    source = { bytesRead: 0, truncated: false }
    sources.set(dbPath, source)
  }
  return source
}

const SQLITE_SESSION_ID_BYTES = 512
const SQLITE_SESSION_DIRECTORY_BYTES = 4 * 1024
const SQLITE_SESSION_TITLE_BYTES = 161
const SQLITE_SESSION_PARENT_ID_BYTES = 512
const SQLITE_SESSION_FIXED_BYTES = 16
const SQLITE_SESSION_FIELD_LIMITS = {
  id: SQLITE_SESSION_ID_BYTES,
  directory: SQLITE_SESSION_DIRECTORY_BYTES,
  title: SQLITE_SESSION_TITLE_BYTES,
  parent_id: SQLITE_SESSION_PARENT_ID_BYTES,
} as const
const SQLITE_SESSION_METADATA_MAX_BYTES = 3 * (
  SQLITE_SESSION_ID_BYTES
  + SQLITE_SESSION_DIRECTORY_BYTES
  + SQLITE_SESSION_TITLE_BYTES
  + SQLITE_SESSION_PARENT_ID_BYTES
) + SQLITE_SESSION_FIXED_BYTES
const SQLITE_PROJECT_ID_BYTES = 512
const SQLITE_PROJECT_DIRECTORY_BYTES = 4 * 1024
const SQLITE_PROJECT_ROWS = 256

function boundedSessionSql(): string {
  return `
    SELECT CAST(substr(CAST(id AS blob), 1, ?) AS text) AS id,
           length(CAST(id AS blob)) AS id_full_bytes,
           CAST(substr(CAST(directory AS blob), 1, ?) AS text) AS directory,
           length(CAST(directory AS blob)) AS directory_full_bytes,
           CAST(substr(CAST(title AS blob), 1, ?) AS text) AS title,
           length(CAST(title AS blob)) AS title_full_bytes,
           CAST(substr(CAST(parent_id AS blob), 1, ?) AS text) AS parent_id,
           length(CAST(parent_id AS blob)) AS parent_id_full_bytes,
           time_created, time_updated
    FROM session
    WHERE project_id = ?
    LIMIT ?
  `
}

function boundedSessionParams(projectId: string, limit: number): Array<string | number> {
  return [
    SQLITE_SESSION_ID_BYTES,
    SQLITE_SESSION_DIRECTORY_BYTES,
    SQLITE_SESSION_TITLE_BYTES,
    SQLITE_SESSION_PARENT_ID_BYTES,
    projectId,
    limit,
  ]
}

function hasMoreSessionRows(db: SqliteDb, projectId: string, offset: number): boolean {
  return db
    .prepare('SELECT 1 AS present FROM session WHERE project_id = ? LIMIT 1 OFFSET ?')
    .get(projectId, offset) !== undefined
}

function sessionFieldBytes(row: Json, field: string): number {
  return typeof row[field] === 'string' ? Buffer.byteLength(row[field]) : 0
}

function sessionFieldTruncated(
  row: Json,
  field: keyof typeof SQLITE_SESSION_FIELD_LIMITS,
): boolean {
  const fullBytes = row[`${field}_full_bytes`]
  return typeof fullBytes === 'number' && fullBytes > SQLITE_SESSION_FIELD_LIMITS[field]
}

function accountSessionRow(
  fs: MemFs,
  row: Json,
  f: MemFilter,
  source: SqliteSourceBudget,
  budget: MemContentReadBudget,
): Json | null {
  const returnedBytes = SQLITE_SESSION_FIXED_BYTES
    + sessionFieldBytes(row, 'id')
    + sessionFieldBytes(row, 'directory')
    + sessionFieldBytes(row, 'title')
    + sessionFieldBytes(row, 'parent_id')
  budget.consume(returnedBytes)
  source.bytesRead += returnedBytes
  const sessionFields = Object.keys(SQLITE_SESSION_FIELD_LIMITS) as Array<
    keyof typeof SQLITE_SESSION_FIELD_LIMITS
  >
  const truncatedFields = sessionFields.filter((field) => sessionFieldTruncated(row, field))
  if (truncatedFields.length > 0) {
    budget.noteSourceTruncated()
    source.truncated = true
  }
  if (truncatedFields.includes('id')) return null
  if (truncatedFields.includes('parent_id')) row.parent_id = null
  if (
    f.cwd
    && !sameProjectForMemFs(fs, typeof row.directory === 'string' ? row.directory : null, f.cwd)
  ) {
    return null
  }
  return row
}

function boundedProjectRows(
  db: SqliteDb,
  table: 'project' | 'project_directory',
  source: SqliteSourceBudget,
  budget: MemContentReadBudget,
): Json[] | null {
  const maximumRowBytes = SQLITE_PROJECT_ID_BYTES + SQLITE_PROJECT_DIRECTORY_BYTES
  const capacity = Math.min(
    SQLITE_PROJECT_ROWS,
    Math.floor(Math.max(0, budget.perSourceBytes - source.bytesRead) / maximumRowBytes),
    Math.floor(Math.max(0, budget.remainingBytes()) / maximumRowBytes),
  )
  if (capacity <= 0) {
    budget.noteSourceTruncated()
    source.truncated = true
    return []
  }
  const idField = table === 'project' ? 'id' : 'project_id'
  const directoryField = table === 'project' ? 'worktree' : 'directory'
  try {
    const rows = db.prepare(`
      SELECT CAST(substr(CAST(${idField} AS blob), 1, ?) AS text) AS project_id,
             length(CAST(${idField} AS blob)) AS project_id_full_bytes,
             CAST(substr(CAST(${directoryField} AS blob), 1, ?) AS text) AS directory,
             length(CAST(${directoryField} AS blob)) AS directory_full_bytes
      FROM ${table}
      LIMIT ?
    `).all(SQLITE_PROJECT_ID_BYTES, SQLITE_PROJECT_DIRECTORY_BYTES, capacity) as Json[]
    const safe: Json[] = []
    for (const row of rows) {
      const idBytes = typeof row.project_id === 'string' ? Buffer.byteLength(row.project_id) : 0
      const directoryBytes = typeof row.directory === 'string' ? Buffer.byteLength(row.directory) : 0
      budget.consume(idBytes + directoryBytes)
      source.bytesRead += idBytes + directoryBytes
      const idTruncated = typeof row.project_id_full_bytes === 'number'
        && row.project_id_full_bytes > SQLITE_PROJECT_ID_BYTES
      const directoryTruncated = typeof row.directory_full_bytes === 'number'
        && row.directory_full_bytes > SQLITE_PROJECT_DIRECTORY_BYTES
      if (idTruncated || directoryTruncated) {
        budget.noteSourceTruncated()
        source.truncated = true
      }
      if (!idTruncated && !directoryTruncated) safe.push(row)
    }
    if (
      rows.length === capacity
      && db.prepare(`SELECT 1 AS present FROM ${table} LIMIT 1 OFFSET ?`).get(capacity) !== undefined
    ) {
      budget.noteSourceTruncated()
      source.truncated = true
    }
    return safe
  } catch {
    return null
  }
}

function projectIdsForFilter(
  fs: MemFs,
  db: SqliteDb,
  f: MemFilter,
  source: SqliteSourceBudget,
  budget: MemContentReadBudget,
): string[] | null {
  const projects = boundedProjectRows(db, 'project', source, budget)
  if (projects === null) return null
  const directories = boundedProjectRows(db, 'project_directory', source, budget) ?? []
  const target = f.cwd ? resolve(f.cwd) : null
  const ids = new Set<string>()
  for (const row of [...projects, ...directories]) {
    if (typeof row.project_id !== 'string' || typeof row.directory !== 'string') continue
    if (!target || sameProjectForMemFs(fs, row.directory, target)) ids.add(row.project_id)
  }
  return [...ids].sort()
}

export function readBoundedSessionRows(
  fs: MemFs,
  db: SqliteDb,
  f: MemFilter,
  source: SqliteSourceBudget,
): Json[] {
  const budget = fs.contentReadBudget
  if (!budget) return []
  const requestedLimit = Math.max(0, Math.trunc(f.limit))
  const projectIds = projectIdsForFilter(fs, db, f, source, budget)
  if (projectIds === null) {
    budget.noteSourceUnavailable('opencode')
    source.truncated = true
    return []
  }
  if (projectIds.length === 0 || requestedLimit <= 0) return []
  const sourceCapacity = Math.floor(
    Math.max(0, budget.perSourceBytes - source.bytesRead) / SQLITE_SESSION_METADATA_MAX_BYTES,
  )
  const aggregateCapacity = Math.floor(
    Math.max(0, budget.remainingBytes()) / SQLITE_SESSION_METADATA_MAX_BYTES,
  )
  // Scan only as many indexed project rows as the hard byte budgets can account for, retaining a
  // fixed top-K below. This avoids both a full-table/temp-sort query and the incorrect assumption
  // that insertion rowid represents update recency.
  const scanCapacity = Math.min(sourceCapacity, aggregateCapacity)
  if (scanCapacity <= 0) {
    if (sourceCapacity <= 0) budget.noteSourceTruncated()
    if (aggregateCapacity <= 0) budget.noteTotalExhausted()
    source.truncated = true
    return []
  }

  const sql = boundedSessionSql()
  const hasMoreSql = 'SELECT 1 AS present FROM session WHERE project_id = ? LIMIT 1 OFFSET ?'
  const rows: Json[] = []
  let candidateRowsTruncated = false
  for (const [projectIndex, projectId] of projectIds.entries()) {
    const remainingCapacity = scanCapacity - rows.length
    if (remainingCapacity <= 0) {
      candidateRowsTruncated = true
      break
    }
    const remainingProjects = projectIds.length - projectIndex
    const projectScanLimit = Math.max(1, Math.floor(remainingCapacity / remainingProjects))
    const params = boundedSessionParams(projectId, projectScanLimit)
    if (
      !hasBoundedQueryPlan(db, sql, params)
      || !hasBoundedQueryPlan(db, hasMoreSql, [projectId, 0])
    ) {
      budget.noteSourceUnavailable('opencode')
      source.truncated = true
      return []
    }
    const projectRows = Array.from(
      db.prepare(sql).iterate(...params) as IterableIterator<Json>,
    )
    rows.push(...projectRows)
    if (
      projectRows.length === projectScanLimit
      && hasMoreSessionRows(db, projectId, projectRows.length)
    ) candidateRowsTruncated = true
    if (rows.length >= scanCapacity && projectIndex < projectIds.length - 1) {
      candidateRowsTruncated = true
      break
    }
  }
  const safeRows: Json[] = []
  for (const row of rows) {
    const safe = accountSessionRow(fs, row, f, source, budget)
    if (safe) safeRows.push(safe)
  }
  // An index-order prefix cannot truthfully stand in for the most-recent candidate set. Once the
  // byte-accounted scan cannot cover the whole selected project relation, fail closed with partial
  // warnings instead of returning an arbitrary subset that merely gets sorted after truncation.
  if (candidateRowsTruncated) {
    if (budget.noteDiscoveryTruncated) budget.noteDiscoveryTruncated()
    else budget.noteSourceTruncated()
    if (scanCapacity === sourceCapacity && sourceCapacity <= rows.length) budget.noteSourceTruncated()
    if (scanCapacity === aggregateCapacity && aggregateCapacity <= rows.length) budget.noteTotalExhausted()
    source.truncated = true
    return []
  }
  const capped = safeRows
    .sort((left, right) => {
      const updated = Number(right.time_updated ?? 0) - Number(left.time_updated ?? 0)
      if (updated !== 0) return updated
      return String(left.id ?? '').localeCompare(String(right.id ?? ''))
    })
    .slice(0, requestedLimit)
  if (rows.length > requestedLimit) {
    if (budget.noteDiscoveryTruncated) budget.noteDiscoveryTruncated()
    else budget.noteSourceTruncated()
    if (scanCapacity === sourceCapacity && sourceCapacity <= rows.length) budget.noteSourceTruncated()
    if (scanCapacity === aggregateCapacity && aggregateCapacity <= rows.length) budget.noteTotalExhausted()
    source.truncated = true
  }
  return capped
}

export function readBoundedSessionRowById(
  fs: MemFs,
  db: SqliteDb,
  f: MemFilter,
  source: SqliteSourceBudget,
  id: string,
): Json | null {
  const budget = fs.contentReadBudget
  if (!budget) return null
  const sourceRemaining = Math.max(0, budget.perSourceBytes - source.bytesRead)
  const aggregateRemaining = Math.max(0, budget.remainingBytes())
  if (sourceRemaining < SQLITE_SESSION_METADATA_MAX_BYTES) {
    budget.noteSourceTruncated()
    source.truncated = true
    return null
  }
  if (aggregateRemaining < SQLITE_SESSION_METADATA_MAX_BYTES) {
    budget.noteTotalExhausted()
    source.truncated = true
    return null
  }
  const sql = `
    SELECT CAST(substr(CAST(id AS blob), 1, ?) AS text) AS id,
           length(CAST(id AS blob)) AS id_full_bytes,
           CAST(substr(CAST(directory AS blob), 1, ?) AS text) AS directory,
           length(CAST(directory AS blob)) AS directory_full_bytes,
           CAST(substr(CAST(title AS blob), 1, ?) AS text) AS title,
           length(CAST(title AS blob)) AS title_full_bytes,
           CAST(substr(CAST(parent_id AS blob), 1, ?) AS text) AS parent_id,
           length(CAST(parent_id AS blob)) AS parent_id_full_bytes,
           time_created, time_updated
    FROM session
    WHERE id = ?
    LIMIT 1
  `
  const params: Array<string | number> = [
    SQLITE_SESSION_ID_BYTES,
    SQLITE_SESSION_DIRECTORY_BYTES,
    SQLITE_SESSION_TITLE_BYTES,
    SQLITE_SESSION_PARENT_ID_BYTES,
    id,
  ]
  if (!hasBoundedQueryPlan(db, sql, params)) {
    budget.noteSourceUnavailable('opencode')
    source.truncated = true
    return null
  }
  const row = db.prepare(sql).get(...params) as Json | undefined
  return row ? accountSessionRow(fs, row, f, source, budget) : null
}

const boundedPlanCache = new WeakMap<object, Map<string, boolean>>()

function hasBoundedQueryPlan(
  db: SqliteDb,
  sql: string,
  params: readonly (string | number)[],
): boolean {
  let cache = boundedPlanCache.get(db)
  if (!cache) {
    cache = new Map()
    boundedPlanCache.set(db, cache)
  }
  const cached = cache.get(sql)
  if (cached !== undefined) return cached
  let bounded = false
  try {
    const rows = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as Json[]
    const details = rows.map((row) => String(row.detail ?? '').toUpperCase())
    bounded = details.some((detail) => detail.includes('SEARCH '))
      && details.every((detail) => !detail.includes('SCAN ') && !detail.includes('USE TEMP B-TREE'))
  } catch {
    bounded = false
  }
  cache.set(sql, bounded)
  return bounded
}
