/**
 * traces 域 —— tap 流量查看器数据端（BACKLOG #34d / GOAL A7）。
 *
 * 消费 @tenon/tap 的 TraceStore（listSessions / readRecords）——但为守两条硬约束：
 *   ① server 零第三方运行时依赖 + tsc 构建不耦合 tap 构建顺序（tap 在 server 之后 build）；
 *   ② 只读 import tap 的 API（绝不改 tap）。
 * 故此处只定义**结构化 port**（TraceStoreReader），真 TraceStore 由上层注入（bin 装配 / 测试）。
 * tap 的 TraceStore 在结构上满足此 port（listSessions/readRecords 签名一致）。
 *
 * 安全护栏（#34e 延续，收编前置）：traces **只读本地捕获、GET-only、绝不外发**——
 *   · server 绑 127.0.0.1 回环，写端点鉴权与 traces 无关（traces 是只读 GET）；
 *   · 本模块不发起任何网络，只把注入的**本地** store 结果投影成 JSON；
 *   · 响应显式带 outbound: 'local-only'，供前端 / doctor 明示「捕获数据不外发」。
 */

/** tap SessionRow 的只读投影（结构对位 tap/trace-store.ts::SessionRow）。 */
export interface TraceSessionRow {
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

/** 注入 port —— tap 的 TraceStore 结构上满足（只用其只读两法）。 */
export interface TraceStoreReader {
  listSessions(): TraceSessionRow[]
  readRecords(id: string): unknown[]
}

export interface TraceSessionsResponse {
  generated_at: string
  outbound: 'local-only'
  count: number
  sessions: TraceSessionRow[]
}

export interface TraceRecordsResponse {
  generated_at: string
  outbound: 'local-only'
  session: string
  count: number
  records: unknown[]
}

/** GET /api/traces/sessions —— 列本地捕获会话（最近更新在前）。 */
export function listTraceSessions(store: TraceStoreReader, clock: () => string): TraceSessionsResponse {
  const sessions = store.listSessions().slice()
  sessions.sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0))
  return { generated_at: clock(), outbound: 'local-only', count: sessions.length, sessions }
}

/** GET /api/traces/records?session=<id> —— 读某会话的本地记录（保序，未知会话 → 空）。 */
export function readTraceRecords(store: TraceStoreReader, session: string, clock: () => string): TraceRecordsResponse {
  const records = store.readRecords(session)
  return { generated_at: clock(), outbound: 'local-only', session, count: records.length, records }
}
