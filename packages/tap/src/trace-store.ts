/**
 * trace-store —— 捕获记录本地落盘（JSONL/文件，绝不外发）。
 *
 * 老仓真相源（严格只读移植）: skills/pipeline/scripts/tap/trace_store.py
 *   create_session:95 · get_or_create_session:121 · append_record:155 · finalize_session:224
 *   · load_session_row:308 · resolve_db_path:53。
 *
 * 结构改进（GOAL B3「JSONL 侧文件替代存储变形」）：老仓用 SQLite（traces.sqlite3）；本仓改本地
 *   文件——sessions/<id>.json 存会话元数据（可变），records/<id>.jsonl append-only 存记录。
 *   零第三方运行时依赖（node stdlib fs 即可），去掉 sqlite 原生依赖。
 *
 * 安全护栏（#34e）：本模块**只**依赖 node:fs / node:path / node:crypto——零 outbound 网络。
 *   捕获数据只写入解析出的本地目录，绝无任何回传。（security.test 源码级扫描守此不变量。）
 */
import {
  appendFileSync,
  closeSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  readSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { join, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { resolveTapDir, type TapDirOptions } from './paths.js'
import type { TraceRecord } from './record.js'
import { decodeSessionRow, decodeTraceRecord } from './trace-codecs.js'

export type { TraceRecord }

export interface SessionRow {
  id: string
  started_at: string
  updated_at: string
  date_key: string
  client: string
  proxy_mode: string
  status: string
  record_count: number
  summary: Record<string, unknown> | null
}

export interface CreateSessionOptions { client?: string; proxyMode?: string; startedAt?: Date }

export type TraceRecordWindowWarning =
  | 'record-limit'
  | 'byte-limit'
  | 'malformed-record'
  | 'count-mismatch'

export interface TraceRecordWindow {
  total_count: number
  returned_count: number
  skipped_count: number
  truncated: boolean
  integrity: 'complete' | 'partial'
  warnings: TraceRecordWindowWarning[]
  records: TraceRecord[]
}

export interface TraceStore {
  readonly dir: string
  createSession(opts?: CreateSessionOptions): string
  getOrCreateSession(id: string, opts?: CreateSessionOptions): { sessionId: string; recordCount: number }
  appendRecord(id: string, record: TraceRecord): void
  finalizeSession(id: string, summary?: Record<string, unknown>): void
  loadSessionRow(id: string): SessionRow | null
  readRecords(id: string): TraceRecord[]
  readRecordWindow(id: string): TraceRecordWindow
  listSessions(): SessionRow[]
}

const RECORD_WINDOW_LIMIT = 200
const RECORD_WINDOW_BYTE_LIMIT = 8 * 1024 * 1024

/** 规范本地捕获目录。trace_store.py:53 resolve_db_path（去 sqlite 文件名，改目录）。 */
export function resolveTraceDir(opts: TapDirOptions = {}): string {
  return resolveTapDir(opts)
}

function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

class FileTraceStore implements TraceStore {
  readonly dir: string
  private readonly sessionsDir: string
  private readonly recordsDir: string

  constructor(dir: string) {
    this.dir = dir
    this.sessionsDir = join(dir, 'sessions')
    this.recordsDir = join(dir, 'records')
    mkdirSync(this.sessionsDir, { recursive: true })
    mkdirSync(this.recordsDir, { recursive: true })
  }

  private sessionFile(id: string): string { return join(this.sessionsDir, `${encodeURIComponent(id)}.json`) }
  private recordsFile(id: string): string { return join(this.recordsDir, `${encodeURIComponent(id)}.jsonl`) }

  private openRecordsFileForRead(id: string): { fd: number; size: number } | null {
    const candidate = this.recordsFile(id)
    if (!existsSync(candidate)) return null
    const root = realpathSync(this.dir)
    const recordsRoot = realpathSync(this.recordsDir)
    const candidateStat = lstatSync(candidate)
    if (!recordsRoot.startsWith(`${root}${sep}`) || candidateStat.isSymbolicLink() || !candidateStat.isFile()) {
      throw new Error('unsafe trace records path')
    }
    const resolved = realpathSync(candidate)
    if (!resolved.startsWith(`${recordsRoot}${sep}`)) throw new Error('unsafe trace records path')
    const fd = openSync(candidate, constants.O_RDONLY | constants.O_NOFOLLOW)
    return { fd, size: candidateStat.size }
  }

  private writeSession(row: SessionRow): void {
    const tmp = this.sessionFile(row.id) + '.tmp'
    writeFileSync(tmp, JSON.stringify(row), 'utf8')
    renameSync(tmp, this.sessionFile(row.id))
  }

  loadSessionRow(id: string): SessionRow | null {
    const f = this.sessionFile(id)
    if (!existsSync(f)) return null
    try {
      return decodeSessionRow(JSON.parse(readFileSync(f, 'utf8')))
    } catch {
      return null
    }
  }

  createSession(opts: CreateSessionOptions = {}): string {
    const id = randomUUID()
    const now = opts.startedAt ?? new Date()
    const iso = now.toISOString()
    this.writeSession({
      id,
      started_at: iso,
      updated_at: iso,
      date_key: localDateKey(now),
      client: opts.client ?? '',
      proxy_mode: opts.proxyMode ?? '',
      status: 'active',
      record_count: 0,
      summary: null,
    })
    return id
  }

  getOrCreateSession(id: string, opts: CreateSessionOptions = {}): { sessionId: string; recordCount: number } {
    const existing = this.loadSessionRow(id)
    if (existing) return { sessionId: id, recordCount: existing.record_count }
    const now = new Date()
    const iso = now.toISOString()
    this.writeSession({
      id,
      started_at: iso,
      updated_at: iso,
      date_key: localDateKey(now),
      client: opts.client ?? '',
      proxy_mode: opts.proxyMode ?? '',
      status: 'active',
      record_count: 0,
      summary: null,
    })
    return { sessionId: id, recordCount: 0 }
  }

  appendRecord(id: string, record: TraceRecord): void {
    let row = this.loadSessionRow(id)
    if (!row) {
      // 防御：记录先于 session 到达（路由场景），补建。
      this.getOrCreateSession(id)
      row = this.loadSessionRow(id)
      if (!row) throw new Error(`failed to create trace session '${id}'`)
    }
    appendFileSync(this.recordsFile(id), JSON.stringify(record) + '\n', 'utf8')
    row.record_count += 1
    row.updated_at = typeof record.timestamp === 'string' ? record.timestamp : new Date().toISOString()
    row.status = 'active'
    this.writeSession(row)
  }

  finalizeSession(id: string, summary?: Record<string, unknown>): void {
    const row = this.loadSessionRow(id)
    if (!row) return
    let status = 'complete'
    if (summary) {
      const apiCalls = Number(summary.api_calls ?? 0)
      if (apiCalls === 0) status = 'empty'
      else if (summary.has_error) status = 'error'
    }
    const merged: Record<string, unknown> = { ...(row.summary ?? {}), ...(summary ?? {}) }
    merged.status = status
    merged.id = id
    merged.updated_at = new Date().toISOString()
    row.status = status
    row.summary = merged
    row.updated_at = merged.updated_at as string
    this.writeSession(row)
  }

  readRecords(id: string): TraceRecord[] {
    const f = this.recordsFile(id)
    if (!existsSync(f)) return []
    const records: TraceRecord[] = []
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      if (line.trim().length === 0) continue
      try {
        const record = decodeTraceRecord(JSON.parse(line))
        if (record) records.push(record)
      } catch {
        // A malformed append-only line is ignored just like a damaged session sidecar.
      }
    }
    return records
  }

  readRecordWindow(id: string): TraceRecordWindow {
    const row = this.loadSessionRow(id)
    if (!row) {
      return {
        total_count: 0,
        returned_count: 0,
        skipped_count: 0,
        truncated: false,
        integrity: 'complete',
        warnings: [],
        records: [],
      }
    }

    const opened = this.openRecordsFileForRead(id)
    if (opened === null) {
      const countMismatch = row.record_count !== 0
      return {
        total_count: row.record_count,
        returned_count: 0,
        skipped_count: 0,
        truncated: false,
        integrity: countMismatch ? 'partial' : 'complete',
        warnings: countMismatch ? ['count-mismatch'] : [],
        records: [],
      }
    }

    const fileSize = opened.size
    const bytesToRead = Math.min(fileSize, RECORD_WINDOW_BYTE_LIMIT)
    const offset = fileSize - bytesToRead
    const buffer = Buffer.allocUnsafe(bytesToRead)
    const fd = opened.fd
    let bytesRead = 0
    try {
      while (bytesRead < bytesToRead) {
        const n = readSync(fd, buffer, bytesRead, bytesToRead - bytesRead, offset + bytesRead)
        if (n === 0) break
        bytesRead += n
      }
    } finally {
      closeSync(fd)
    }

    const byteLimited = offset > 0
    const lines = buffer.subarray(0, bytesRead).toString('utf8').split('\n')
    if (lines.at(-1) === '') lines.pop()

    let skippedCount = 0
    if (byteLimited && lines.length > 0) {
      // The read starts inside an unknown JSONL boundary. Conservatively discard the
      // first fragment instead of treating a coincidental `{` as a complete record.
      lines.shift()
      skippedCount += 1
    }

    const recordsNewestFirst: TraceRecord[] = []
    let malformed = false
    const visibleLines = lines.filter((line) => line.trim().length > 0)
    const visibleLineCount = skippedCount + visibleLines.length
    let recordLimited = false
    for (let index = visibleLines.length - 1; index >= 0; index -= 1) {
      const line = visibleLines[index]!
      try {
        const record = decodeTraceRecord(JSON.parse(line))
        if (record) {
          if (recordsNewestFirst.length === RECORD_WINDOW_LIMIT) {
            recordLimited = true
            break
          }
          recordsNewestFirst.push(record)
        }
        else {
          malformed = true
          skippedCount += 1
        }
      } catch {
        malformed = true
        skippedCount += 1
      }
    }

    const selected = recordsNewestFirst.reverse()
    const countMismatch = !byteLimited && visibleLineCount !== row.record_count
    const warnings: TraceRecordWindowWarning[] = []
    if (recordLimited) warnings.push('record-limit')
    if (byteLimited) warnings.push('byte-limit')
    if (malformed) warnings.push('malformed-record')
    if (countMismatch) warnings.push('count-mismatch')
    const partial = byteLimited || malformed || countMismatch

    return {
      total_count: Math.max(row.record_count, visibleLineCount),
      returned_count: selected.length,
      skipped_count: skippedCount,
      truncated: recordLimited || byteLimited,
      integrity: partial ? 'partial' : 'complete',
      warnings,
      records: selected,
    }
  }

  listSessions(): SessionRow[] {
    if (!existsSync(this.sessionsDir)) return []
    const out: SessionRow[] = []
    for (const name of readdirSync(this.sessionsDir)) {
      if (!name.endsWith('.json')) continue
      try {
        const row = decodeSessionRow(JSON.parse(readFileSync(join(this.sessionsDir, name), 'utf8')))
        if (row) out.push(row)
      } catch {
        /* 跳过损坏文件 */
      }
    }
    return out
  }
}

export function createTraceStore(opts: TapDirOptions = {}): TraceStore {
  return new FileTraceStore(resolveTraceDir(opts))
}

let store: TraceStore | null = null
/** 进程内单例（生产路径解析自 env/home）。get_trace_store:66。 */
export function getTraceStore(): TraceStore {
  if (store === null) store = createTraceStore()
  return store
}
export function resetTraceStore(): void { store = null }
