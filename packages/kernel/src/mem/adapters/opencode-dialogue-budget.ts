import type { MemFs } from '../fs.js'
import type { SqliteSourceBudget } from './opencode-budget.js'

type Json = Record<string, unknown>
type SqliteNS = typeof import('node:sqlite')
type SqliteDb = InstanceType<SqliteNS['DatabaseSync']>

const SQLITE_RELATION_ID_BYTES = 512
const SQLITE_ROW_DATA_BYTES = 4 * 1024
const SQLITE_MAX_ROWS_PER_QUERY = 512

type RelationField = 'id' | 'message_id'

export interface BoundedSqliteRowsQuery {
  sql: string
  hasMoreSql: string
  scopeId: string
  relationFields: readonly RelationField[]
  orderField: RelationField
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
 * SQLite dialogue rows use a request-local byte budget. Every relation key is bounded and
 * byte-accounted; rows with a truncated key are rejected because they cannot be grouped safely.
 */
export function readBoundedSqliteRows(
  fs: MemFs,
  db: SqliteDb,
  query: BoundedSqliteRowsQuery,
  source: SqliteSourceBudget,
): Json[] {
  const budget = fs.contentReadBudget
  if (!budget) return []
  const relationAllowance = SQLITE_RELATION_ID_BYTES * query.relationFields.length
  const sourceRemaining = budget.perSourceBytes - source.bytesRead
  const aggregateRemaining = budget.remainingBytes()
  const rowBytes = Math.min(
    SQLITE_ROW_DATA_BYTES,
    Math.max(0, sourceRemaining - relationAllowance),
    Math.max(0, aggregateRemaining - relationAllowance),
  )
  if (rowBytes <= 0) {
    if (sourceRemaining <= relationAllowance) budget.noteSourceTruncated()
    if (aggregateRemaining <= relationAllowance) budget.noteTotalExhausted()
    source.truncated = true
    return []
  }

  const queryParams: Array<string | number> = [
    ...query.relationFields.map(() => SQLITE_RELATION_ID_BYTES),
    rowBytes,
    query.scopeId,
    SQLITE_MAX_ROWS_PER_QUERY,
  ]
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
    const maximumProjectedBytes = relationAllowance + rowBytes
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
    const relationBytes = query.relationFields.reduce((total, field) => (
      total + (typeof row[field] === 'string' ? Buffer.byteLength(row[field]) : 0)
    ), 0)
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
    const relationTruncated = query.relationFields.some((field) => (
      typeof row[`${field}_full_bytes`] === 'number'
      && Number(row[`${field}_full_bytes`]) > SQLITE_RELATION_ID_BYTES
    ))
    const dataTruncated = typeof row.full_bytes === 'number' && row.full_bytes > rowBytes
    if (relationTruncated || dataTruncated) {
      budget.noteSourceTruncated()
      source.truncated = true
    }
    if (!relationTruncated) rows.push(row)
  }
  rows.sort((left, right) => {
    const time = Number(left.time_created ?? 0) - Number(right.time_created ?? 0)
    if (time !== 0) return time
    return String(left[query.orderField] ?? '').localeCompare(
      String(right[query.orderField] ?? ''),
    )
  })
  return rows
}
