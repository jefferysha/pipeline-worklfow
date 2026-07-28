import { resolve, sep } from 'node:path'
import type { MemContentReadBudget, MemFs } from '../fs.js'
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

function boundedSessionSql(scoped: boolean): string {
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
    ${scoped ? 'WHERE directory = ? OR substr(directory, 1, length(?)) = ?' : ''}
    ORDER BY time_updated DESC, id
    LIMIT ?
  `
}

function boundedSessionParams(f: MemFilter, limit: number): Array<string | number> {
  const bounds: Array<string | number> = [
    SQLITE_SESSION_ID_BYTES,
    SQLITE_SESSION_DIRECTORY_BYTES,
    SQLITE_SESSION_TITLE_BYTES,
    SQLITE_SESSION_PARENT_ID_BYTES,
  ]
  if (!f.cwd) return [...bounds, limit]
  const projectRoot = resolve(f.cwd)
  const projectPrefix = projectRoot + sep
  return [...bounds, projectRoot, projectPrefix, projectPrefix, limit]
}

function hasMoreSessionRows(db: SqliteDb, f: MemFilter, offset: number): boolean {
  const scoped = Boolean(f.cwd)
  const sql = `
    SELECT 1 AS present
    FROM session
    ${scoped ? 'WHERE directory = ? OR substr(directory, 1, length(?)) = ?' : ''}
    ORDER BY time_updated DESC, id
    LIMIT 1 OFFSET ?
  `
  if (!f.cwd) return db.prepare(sql).get(offset) !== undefined
  const projectRoot = resolve(f.cwd)
  const projectPrefix = projectRoot + sep
  return db.prepare(sql).get(projectRoot, projectPrefix, projectPrefix, offset) !== undefined
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

export function readBoundedSessionRows(
  fs: MemFs,
  db: SqliteDb,
  f: MemFilter,
  source: SqliteSourceBudget,
): Json[] {
  const budget = fs.contentReadBudget
  if (!budget) return []
  const requestedLimit = Math.max(0, Math.trunc(f.limit))
  const sourceCapacity = Math.floor(
    Math.max(0, budget.perSourceBytes - source.bytesRead) / SQLITE_SESSION_METADATA_MAX_BYTES,
  )
  const aggregateCapacity = Math.floor(
    Math.max(0, budget.remainingBytes()) / SQLITE_SESSION_METADATA_MAX_BYTES,
  )
  const limit = Math.min(requestedLimit, sourceCapacity, aggregateCapacity)
  if (limit <= 0) {
    if (requestedLimit > 0 && hasMoreSessionRows(db, f, 0)) {
      if (sourceCapacity <= 0) budget.noteSourceTruncated()
      if (aggregateCapacity <= 0) budget.noteTotalExhausted()
      source.truncated = true
    }
    return []
  }

  const rows = Array.from(
    db.prepare(boundedSessionSql(Boolean(f.cwd))).iterate(
      ...boundedSessionParams(f, limit),
    ) as IterableIterator<Json>,
  )
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
    safeRows.push(row)
  }
  if (rows.length === limit && limit < requestedLimit && hasMoreSessionRows(db, f, limit)) {
    if (limit === sourceCapacity) budget.noteSourceTruncated()
    if (limit === aggregateCapacity) budget.noteTotalExhausted()
    source.truncated = true
  }
  return safeRows
}

const SQLITE_ROW_CHUNK_BYTES = 4 * 1024
const SQLITE_MAX_ROWS_PER_QUERY = 512

/**
 * SQLite is not a text-file adapter, so related search supplies contentReadBudget instead. Each row
 * returns at most 4 KiB from SQLite and iteration stops before either the per-session or aggregate
 * allowance can be exceeded. Normal CLI callers have no budget and retain the original `.all()` path.
 */
export function readBoundedSqliteRows(
  fs: MemFs,
  db: SqliteDb,
  sql: string,
  sessionId: string,
  source: SqliteSourceBudget,
): Json[] {
  const budget = fs.contentReadBudget
  if (!budget) return []
  const sourceRemaining = budget.perSourceBytes - source.bytesRead
  const aggregateRemaining = budget.remainingBytes()
  const chunkBytes = Math.min(SQLITE_ROW_CHUNK_BYTES, sourceRemaining, aggregateRemaining)
  if (chunkBytes <= 0) {
    if (sourceRemaining <= 0) budget.noteSourceTruncated()
    if (aggregateRemaining <= 0) budget.noteTotalExhausted()
    source.truncated = true
    return []
  }

  const iterator = db.prepare(sql).iterate(chunkBytes, sessionId) as IterableIterator<Json>
  const rows: Json[] = []
  while (rows.length < SQLITE_MAX_ROWS_PER_QUERY) {
    if (
      budget.perSourceBytes - source.bytesRead < chunkBytes
      || budget.remainingBytes() < chunkBytes
    ) {
      if (budget.perSourceBytes - source.bytesRead < chunkBytes) budget.noteSourceTruncated()
      if (budget.remainingBytes() < chunkBytes) budget.noteTotalExhausted()
      source.truncated = true
      break
    }
    const next = iterator.next()
    if (next.done) break
    const row = next.value
    const returnedBytes = typeof row.data === 'string' ? Buffer.byteLength(row.data) : 0
    budget.consume(returnedBytes)
    source.bytesRead += returnedBytes
    if (typeof row.full_bytes === 'number' && row.full_bytes > returnedBytes) {
      budget.noteSourceTruncated()
      source.truncated = true
    }
    rows.push(row)
  }
  if (rows.length === SQLITE_MAX_ROWS_PER_QUERY) {
    budget.noteSourceTruncated()
    source.truncated = true
  }
  return rows
}
