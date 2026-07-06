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
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { resolveTapDir, type TapDirOptions } from './paths.js'
import type { TraceRecord } from './record.js'

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

export interface TraceStore {
  readonly dir: string
  createSession(opts?: CreateSessionOptions): string
  getOrCreateSession(id: string, opts?: CreateSessionOptions): { sessionId: string; recordCount: number }
  appendRecord(id: string, record: TraceRecord): void
  finalizeSession(id: string, summary?: Record<string, unknown>): void
  loadSessionRow(id: string): SessionRow | null
  readRecords(id: string): TraceRecord[]
  listSessions(): SessionRow[]
}

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

  private writeSession(row: SessionRow): void {
    const tmp = this.sessionFile(row.id) + '.tmp'
    writeFileSync(tmp, JSON.stringify(row), 'utf8')
    renameSync(tmp, this.sessionFile(row.id))
  }

  loadSessionRow(id: string): SessionRow | null {
    const f = this.sessionFile(id)
    if (!existsSync(f)) return null
    try {
      return JSON.parse(readFileSync(f, 'utf8')) as SessionRow
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
      row = this.loadSessionRow(id)!
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
    return readFileSync(f, 'utf8')
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as TraceRecord)
  }

  listSessions(): SessionRow[] {
    if (!existsSync(this.sessionsDir)) return []
    const out: SessionRow[] = []
    for (const name of readdirSync(this.sessionsDir)) {
      if (!name.endsWith('.json')) continue
      try {
        out.push(JSON.parse(readFileSync(join(this.sessionsDir, name), 'utf8')) as SessionRow)
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
