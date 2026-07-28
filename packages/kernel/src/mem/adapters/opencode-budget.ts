import { resolve } from 'node:path'
import type { MemContentReadBudget, MemFs } from '../fs.js'
import { sameProject } from '../filter.js'
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
    ORDER BY rowid DESC
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
    if (!target || sameProject(row.directory, target)) ids.add(row.project_id)
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
  const projectIds = projectIdsForFilter(db, f, source, budget)
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
  const limit = Math.min(requestedLimit + 1, sourceCapacity, aggregateCapacity)
  if (limit <= 0) {
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
    const remaining = limit - rows.length
    if (remaining <= 0) {
      candidateRowsTruncated = true
      break
    }
    const params = boundedSessionParams(projectId, remaining)
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
      projectRows.length === remaining
      && hasMoreSessionRows(db, projectId, projectRows.length)
    ) candidateRowsTruncated = true
    if (rows.length >= limit && projectIndex < projectIds.length - 1) {
      candidateRowsTruncated = true
      break
    }
  }
  const safeRows: Json[] = []
  for (const row of rows) {
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
    if (truncatedFields.includes('id')) continue
    if (truncatedFields.includes('parent_id')) row.parent_id = null
    if (!f.cwd || sameProject(typeof row.directory === 'string' ? row.directory : null, f.cwd)) {
      safeRows.push(row)
    }
  }
  const capped = safeRows
    .sort((left, right) => {
      const updated = Number(right.time_updated ?? 0) - Number(left.time_updated ?? 0)
      if (updated !== 0) return updated
      return String(left.id ?? '').localeCompare(String(right.id ?? ''))
    })
    .slice(0, requestedLimit)
  if (candidateRowsTruncated || rows.length > requestedLimit) {
    if (budget.noteDiscoveryTruncated) budget.noteDiscoveryTruncated()
    else budget.noteSourceTruncated()
    if (limit === sourceCapacity && sourceCapacity <= requestedLimit) budget.noteSourceTruncated()
    if (limit === aggregateCapacity) budget.noteTotalExhausted()
    source.truncated = true
  }
  return capped
}

const SQLITE_RELATION_ID_BYTES = 512
const SQLITE_ROW_DATA_BYTES = 4 * 1024
const SQLITE_MAX_ROWS_PER_QUERY = 512

export interface BoundedSqliteRowsQuery {
  sql: string
  hasMoreSql: string
  scopeId: string
  relationField: 'id' | 'message_id'
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

function hasMoreRows(
  db: SqliteDb,
  query: BoundedSqliteRowsQuery,
  offset: number,
): boolean {
  return db.prepare(query.hasMoreSql).get(query.scopeId, offset) !== undefined
}

/**
 * SQLite is not a text-file adapter, so related search supplies contentReadBudget instead. Each row
 * returns at most 4 KiB from SQLite and iteration stops before either the per-session or aggregate
 * allowance can be exceeded. Normal CLI callers have no budget and retain the original `.all()` path.
 */
export function readBoundedSqliteRows(
  fs: MemFs,
  db: SqliteDb,
  query: BoundedSqliteRowsQuery,
  source: SqliteSourceBudget,
): Json[] {
  const budget = fs.contentReadBudget
  if (!budget) return []
  const sourceRemaining = budget.perSourceBytes - source.bytesRead
  const aggregateRemaining = budget.remainingBytes()
  const rowBytes = Math.min(
    SQLITE_ROW_DATA_BYTES,
    Math.max(0, sourceRemaining - SQLITE_RELATION_ID_BYTES),
    Math.max(0, aggregateRemaining - SQLITE_RELATION_ID_BYTES),
  )
  if (rowBytes <= 0) {
    if (sourceRemaining <= SQLITE_RELATION_ID_BYTES) budget.noteSourceTruncated()
    if (aggregateRemaining <= SQLITE_RELATION_ID_BYTES) budget.noteTotalExhausted()
    source.truncated = true
    return []
  }

  const queryParams = [
    SQLITE_RELATION_ID_BYTES,
    rowBytes,
    query.scopeId,
    SQLITE_MAX_ROWS_PER_QUERY,
  ] as const
  if (
    !hasBoundedQueryPlan(db, query.sql, queryParams)
    || !hasBoundedQueryPlan(db, query.hasMoreSql, [query.scopeId, 0])
  ) {
    budget.noteSourceUnavailable('opencode')
    source.truncated = true
    return []
  }

  const iterator = db.prepare(query.sql).iterate(...queryParams) as IterableIterator<Json>
  const rows: Json[] = []
  for (;;) {
    if (rows.length >= SQLITE_MAX_ROWS_PER_QUERY) {
      if (hasMoreRows(db, query, rows.length)) {
        budget.noteSourceTruncated()
        source.truncated = true
      }
      break
    }
    const maximumProjectedBytes = SQLITE_RELATION_ID_BYTES + rowBytes
    if (
      budget.perSourceBytes - source.bytesRead < maximumProjectedBytes
      || budget.remainingBytes() < maximumProjectedBytes
    ) {
      if (hasMoreRows(db, query, rows.length)) {
        if (budget.perSourceBytes - source.bytesRead < maximumProjectedBytes) {
          budget.noteSourceTruncated()
        }
        if (budget.remainingBytes() < maximumProjectedBytes) budget.noteTotalExhausted()
        source.truncated = true
      }
      break
    }
    const next = iterator.next()
    if (next.done) break
    const row = next.value
    const relationValue = row[query.relationField]
    const relationBytes = typeof relationValue === 'string'
      ? Buffer.byteLength(relationValue)
      : 0
    const returnedDataBytes = typeof row.data === 'string' ? Buffer.byteLength(row.data) : 0
    const returnedBytes = relationBytes + returnedDataBytes
    if (
      budget.perSourceBytes - source.bytesRead < returnedBytes
      || budget.remainingBytes() < returnedBytes
    ) {
      if (budget.perSourceBytes - source.bytesRead < returnedBytes) budget.noteSourceTruncated()
      if (budget.remainingBytes() < returnedBytes) budget.noteTotalExhausted()
      source.truncated = true
      break
    }
    budget.consume(returnedBytes)
    source.bytesRead += returnedBytes
    const relationTruncated = typeof row.relation_full_bytes === 'number'
      && row.relation_full_bytes > SQLITE_RELATION_ID_BYTES
    const dataTruncated = typeof row.full_bytes === 'number'
      && row.full_bytes > rowBytes
    if (relationTruncated || dataTruncated) {
      budget.noteSourceTruncated()
      source.truncated = true
    }
    if (relationTruncated) continue
    rows.push(row)
  }
  rows.sort((left, right) => {
    const time = Number(left.time_created ?? 0) - Number(right.time_created ?? 0)
    if (time !== 0) return time
    return String(left[query.relationField] ?? '').localeCompare(
      String(right[query.relationField] ?? ''),
    )
  })
  return rows
}
