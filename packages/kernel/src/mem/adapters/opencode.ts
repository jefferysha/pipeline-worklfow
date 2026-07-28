/**
 * mem/adapters/opencode —— OpenCode 会话读取器（真 node:sqlite，零第三方依赖，闭 G5 缺口）。
 * 对位老仓 skills/pipeline/scripts/mem/adapters/opencode.py（老仓该文件同样是 no-op 占位，从未有过
 * 真实现——下面的 schema 是本轮直接对 opencode-ai@1.17.14 实测+逆向所得，非沿用老仓）。
 *
 * 背景：OpenCode 1.2+ 迁到 SQLite 存储；此前的 SQLite 读取器需第三方原生依赖（better-sqlite3），
 * 其 prebuilt + node-gyp 兜底链在受限网络/Windows 上炸 install，故曾回退降级为 no-op。
 * node:sqlite 是 Node 内建模块（v22.5.0 引入），满足本仓「kernel 零第三方运行时依赖」硬规则
 * （CONTRACT §5 rule 2），是这里的读取路径。
 *
 * node:sqlite 版本门禁（诚实门——务必读）：
 *   - v22.5.0–v22.12.x：模块存在但需 `--experimental-sqlite` CLI flag 才能被 import，否则直接抛；
 *     该 flag 是进程启动期参数，库代码运行时无法补开。
 *   - v22.13.0 起 flag 门禁移除，但模块仍标 @experimental（stderr 有一次性 ExperimentalWarning，
 *     行为可能随小版本调整）；官方稳定化要到 v26。
 *   - 本仓 engines.node 只要求 `>=22`，故 v22.5–v22.12 这一段在用户机器上仍可能真实存在。
 *   → 策略：每次调用惰性 try/catch 探测 `require('node:sqlite')`；不可用（模块缺失/flag 未开/
 *     文件非法/schema 不符预期）一律静默降级回空结果——绝不抛、绝不假装成功（GOAL.md「诚实门」）。
 *     `opencodeSqliteAvailable()` 导出供上层（如 CLI 的降级提示）判断是否要出警告，而非无条件印。
 *
 * 布局（2026-07 实测 opencode-ai@1.17.14：真跑 `opencode session list` 建库 + 真跑一条 `opencode run`
 * 产生真会话 + `sqlite3 .schema` 逐字核对——非仅凭读源码猜测）：
 *   `$XDG_DATA_HOME/opencode/opencode.db`（缺省时官方包用 xdg-basedir，落 `<home>/.local/share`，
 *   三大平台一致、不特判 macOS/Windows 习惯路径——见官方 packages/core/src/global.ts）。
 *   单一全局 db，横跨所有项目/会话（不像 claude/codex 是逐项目目录切分）；session 行自带
 *   directory 列即 cwd，无需 join project 表。
 *   - `session(id, directory, title, parent_id, time_created, time_updated, ...)`——parent_id
 *     是 OpenCode 原生子 agent 链外键，直接喂给 MemSession.parent_id，激活 sessions.ts 既有的
 *     buildChildIndex（本文件之外，无需改动）。
 *   - `message(id, session_id, time_created, time_updated, data JSON)`——data 是
 *     `Omit<角色 Info, 'id'|'sessionID'>`，角色本身在 `data.role ∈ {user, assistant}`；
 *     不含文本本身——文本在 part 表。
 *   - `part(id, message_id, session_id, time_created, time_updated, data JSON)`——`data.type`
 *     判别：只有 `'text'` 携带人类可读文本（`data.text`）；reasoning/tool/step-start/step-finish/
 *     file/snapshot/patch/agent/retry/subtask/compaction 均无对话文本或是内部记账，丢弃
 *     （对齐 claude/pi「只收 text、丢 thinking/tool_use」的既有取舍）。
 *
 * 已知诚实缺口（未实现，非漏做）——compaction 边界折叠：
 *   claude 用 isCompactSummary 内联 summary、pi 用 firstKeptEntryId 回溯，都能把「压缩前」turns
 *   整体替换成一条 [compact summary]。OpenCode 的压缩语义结构不同——一个 `compaction` 型 part 只
 *   标记边界/tail_start_id，真正摘要文本在*另一条*后续 assistant 消息（经 `message.data.summary
 *   === true` 标记）。没有真实已压缩会话可核对，贸然猜测折叠规则风险大于收益，故不做。后果有界：
 *   compaction part 本身无文本会被自然丢弃，其余消息仍按线性全量呈现（不丢数据，只是不做
 *   「折叠去重」这层优化）。
 */
import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { DialogueTurn, MemFilter, MemSession, SearchHit } from '../types.js'
import type { MemFs } from '../fs.js'
import { isBootstrapTurn, stripInjectionTags } from '../dialogue.js'
import { inRangeOverlap, sameProject } from '../filter.js'
import { searchInDialogue } from '../search.js'
import {
  readBoundedSessionRows,
  readBoundedSqliteRows,
  sqliteSourceBudget,
} from './opencode-budget.js'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any

type SqliteNS = typeof import('node:sqlite')
type SqliteDb = InstanceType<SqliteNS['DatabaseSync']>

/**
 * 惰性探测 node:sqlite 可用性；每次调用都重新 try（不缓存"不可用"结论）。
 * 探测本身廉价——内建模块 require 命中 Node 自身的模块缓存，重复调用不重复解析/初始化。
 */
function loadSqlite(): SqliteNS | null {
  try {
    const req = createRequire(import.meta.url)
    return req('node:sqlite') as SqliteNS
  } catch {
    return null
  }
}

/** 供上层判断本机是否真能读 OpenCode（而非无条件印"reader unavailable"警告）。 */
export function opencodeSqliteAvailable(): boolean {
  return loadSqlite() !== null
}

function opencodeDbPath(fs: MemFs): string {
  const xdgData = fs.env?.('XDG_DATA_HOME')
  const dataHome = xdgData && xdgData.trim() ? xdgData : join(fs.home, '.local', 'share')
  return join(dataHome, 'opencode', 'opencode.db')
}

/**
 * 开库 → 跑 fn → 关库；任何一步失败（sqlite 不可用/文件不存在/非法 sqlite 文件/schema 不符
 * 预期——例如未来 OpenCode 改列名）一律诚实降级回 fallback，绝不向上抛。
 * dbPath 内部算（唯一真相源——opencodeDbPath(fs)），调用方不必也不应自行重复推导传入。
 */
function withOpenCodeDb<T>(fs: MemFs, fallback: T, fn: (db: SqliteDb) => T): T {
  const dbPath = opencodeDbPath(fs)
  if (!fs.exists(dbPath)) return fallback
  const sqlite = loadSqlite()
  if (!sqlite) {
    fs.contentReadBudget?.noteSourceUnavailable('opencode')
    return fallback
  }
  let db: SqliteDb | undefined
  try {
    db = new sqlite.DatabaseSync(dbPath, { readOnly: true })
    return fn(db)
  } catch {
    fs.contentReadBudget?.noteSourceUnavailable('opencode')
    return fallback
  } finally {
    if (db) {
      try {
        db.close()
      } catch {
        /* 连接已损坏，close 本身抛也无所谓——忽略 */
      }
    }
  }
}

function parseJson(raw: unknown): Json {
  if (typeof raw !== 'string') return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function msToIso(ms: unknown): string | null {
  return typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

export function opencodeListSessions(fs: MemFs, f: MemFilter): MemSession[] {
  const dbPath = opencodeDbPath(fs)
  return withOpenCodeDb(fs, [] as MemSession[], (db) => {
    const rows = fs.contentReadBudget
      ? readBoundedSessionRows(fs, db, f, sqliteSourceBudget(fs, dbPath))
      : db
        .prepare('SELECT id, directory, title, parent_id, time_created, time_updated FROM session')
        .all() as Json[]
    const out: MemSession[] = []
    for (const row of rows) {
      const cwd: string | null = typeof row.directory === 'string' && row.directory ? row.directory : null
      if (f.cwd && !sameProject(cwd, f.cwd)) continue
      const created = msToIso(row.time_created)
      const updated = msToIso(row.time_updated)
      if (!inRangeOverlap(created, updated, f)) continue
      out.push({
        platform: 'opencode',
        id: String(row.id),
        title: typeof row.title === 'string' && row.title ? row.title : null,
        cwd,
        created,
        updated,
        filePath: dbPath,
        parent_id: typeof row.parent_id === 'string' && row.parent_id ? row.parent_id : null,
      })
    }
    return out
  })
}

function roleOf(data: Json): 'user' | 'assistant' | null {
  return data?.role === 'user' ? 'user' : data?.role === 'assistant' ? 'assistant' : null
}

/**
 * message + part 联表：message 定角色（data.role），part 出文本（type==='text' 的 data.text）。
 * 单条 message 可能有多个 text part（少见但 schema 允许）——依 part 主键序拼接，与 claude/pi
 * 对一条消息多个 content block 的拼接方式一致。
 */
export function opencodeExtractDialogue(fs: MemFs, s: MemSession): DialogueTurn[] {
  return withOpenCodeDb(fs, [] as DialogueTurn[], (db) => {
    const sourceBudget = sqliteSourceBudget(fs, opencodeDbPath(fs))
    const messageRows = fs.contentReadBudget
      ? readBoundedSqliteRows(
        fs,
        db,
        {
          sql: `SELECT CAST(substr(CAST(id AS blob), 1, ?) AS text) AS id,
                length(CAST(id AS blob)) AS relation_full_bytes,
                CAST(substr(CAST(data AS blob), 1, ?) AS text) AS data,
                length(CAST(data AS blob)) AS full_bytes,
                time_created
         FROM message
         WHERE session_id = ?
         ORDER BY time_created
         LIMIT ?`,
          hasMoreSql: 'SELECT 1 AS present FROM message WHERE session_id = ? LIMIT 1 OFFSET ?',
          scopeId: s.id,
          relationField: 'id',
        },
        sourceBudget,
      )
      : db
        .prepare('SELECT id, data FROM message WHERE session_id = ? ORDER BY time_created, id')
        .all(s.id) as Json[]
    if (!messageRows.length) return []

    const partRows = fs.contentReadBudget
      ? messageRows.flatMap((message) => readBoundedSqliteRows(
        fs,
        db,
        {
          sql: `SELECT CAST(substr(CAST(message_id AS blob), 1, ?) AS text) AS message_id,
                length(CAST(message_id AS blob)) AS relation_full_bytes,
                CAST(substr(CAST(data AS blob), 1, ?) AS text) AS data,
                length(CAST(data AS blob)) AS full_bytes,
                time_created
         FROM part
         WHERE message_id = ?
         ORDER BY id
         LIMIT ?`,
          hasMoreSql: 'SELECT 1 AS present FROM part WHERE message_id = ? LIMIT 1 OFFSET ?',
          scopeId: String(message.id),
          relationField: 'message_id',
        },
        sourceBudget,
      ))
      : db
        .prepare('SELECT id, message_id, data FROM part WHERE session_id = ? ORDER BY time_created, id')
        .all(s.id) as Json[]
    const partsByMessage = new Map<string, Json[]>()
    for (const p of partRows) {
      const mid = String(p.message_id)
      const list = partsByMessage.get(mid)
      if (list) list.push(p)
      else partsByMessage.set(mid, [p])
    }

    const turns: DialogueTurn[] = []
    for (const row of messageRows) {
      const role = roleOf(parseJson(row.data))
      if (!role) continue
      const parts = partsByMessage.get(String(row.id)) ?? []
      const collected: string[] = []
      let totalRaw = 0
      for (const p of parts) {
        const pdata = parseJson(p.data)
        if (!pdata || pdata.type !== 'text' || typeof pdata.text !== 'string') continue
        totalRaw += pdata.text.length
        const cleaned = stripInjectionTags(pdata.text)
        if (cleaned) collected.push(cleaned)
      }
      if (!collected.length) continue
      const merged = collected.join('\n\n')
      if (isBootstrapTurn(merged, totalRaw)) continue
      turns.push({ role, text: merged })
    }
    return turns
  })
}

/**
 * 真检索（3 参数）+ 老 1 参数签名向后兼容（重载）。
 * 生产调用点是 sessions.ts:106 的 switch-case，走 3 参数形式：真读 db 出对话再检索。
 * 1 参数形式无生产调用方，只余向后兼容——无 fs/session 可读，恒回空 SearchHit（no-op）。
 */
export function opencodeSearch(kw: string): SearchHit
export function opencodeSearch(fs: MemFs, s: MemSession, kw: string): SearchHit
export function opencodeSearch(fsOrKw: MemFs | string, s?: MemSession, kw?: string): SearchHit {
  if (typeof fsOrKw === 'string') return searchInDialogue([], fsOrKw)
  return searchInDialogue(opencodeExtractDialogue(fsOrKw, s as MemSession), kw as string)
}
