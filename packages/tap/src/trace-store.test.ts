/**
 * trace-store.test —— 真 fs（GOAL C9）：真 mkdtemp 目录、真 appendFile 落 JSONL、真读回。
 * 断言真实落盘字节与 session 元数据；证明捕获数据只落**本地**目录。
 * 老仓真相源：trace_store.py create_session/get_or_create_session/append_record/finalize_session。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createTraceStore } from './trace-store.js'
import { rmDir, tempTapDir } from './test-support.js'

const dirs: string[] = []
afterEach(async () => { while (dirs.length) await rmDir(dirs.pop()!) })
async function freshStore(): Promise<{ store: ReturnType<typeof createTraceStore>; dir: string }> {
  const dir = await tempTapDir()
  dirs.push(dir)
  return { store: createTraceStore({ dir }), dir }
}

describe('createSession —— 建活跃会话', () => {
  it('返回 uuid，落 session 元数据到本地目录（status=active, record_count=0）', async () => {
    const { store, dir } = await freshStore()
    const id = store.createSession({ client: 'claude', proxyMode: 'reverse' })
    expect(id).toMatch(/^[0-9a-f-]{36}$/i)
    const row = store.loadSessionRow(id)
    expect(row).not.toBeNull()
    expect(row!.status).toBe('active')
    expect(row!.record_count).toBe(0)
    expect(row!.client).toBe('claude')
    expect(row!.proxy_mode).toBe('reverse')
    // 真落在注入的本地目录内
    expect(existsSync(dir)).toBe(true)
    expect(readdirSync(dir).length).toBeGreaterThan(0)
  })
})

describe('appendRecord —— 真 JSONL 落盘', () => {
  it('append 一条 → records/<id>.jsonl 真多一行，record_count++', async () => {
    const { store, dir } = await freshStore()
    const id = store.createSession({ client: 'claude', proxyMode: 'reverse' })
    store.appendRecord(id, { turn: 1, timestamp: '2026-07-07T00:00:00Z', request: { method: 'POST', path: '/v1/messages' }, response: { status: 200 } })
    store.appendRecord(id, { turn: 2, timestamp: '2026-07-07T00:00:01Z', request: { method: 'POST', path: '/v1/messages' }, response: { status: 200 } })
    const jsonl = readFileSync(join(dir, 'records', `${id}.jsonl`), 'utf8').trim().split('\n')
    expect(jsonl.length).toBe(2)
    expect(JSON.parse(jsonl[0]!).turn).toBe(1)
    expect(JSON.parse(jsonl[1]!).turn).toBe(2)
    expect(store.loadSessionRow(id)!.record_count).toBe(2)
    // readRecords 真读回
    const recs = store.readRecords(id)
    expect(recs.length).toBe(2)
    expect(recs[1]!.turn).toBe(2)
  })

  it('每条记录是合法独立 JSON 行（JSONL 契约）', async () => {
    const { store, dir } = await freshStore()
    const id = store.createSession()
    store.appendRecord(id, { turn: 1, request: { body: { nested: { x: [1, 2, 3] } } } })
    const raw = readFileSync(join(dir, 'records', `${id}.jsonl`), 'utf8')
    expect(raw.endsWith('\n')).toBe(true)
    expect(() => JSON.parse(raw.trim())).not.toThrow()
  })
})

describe('getOrCreateSession —— 幂等 + turn 溯源', () => {
  it('新 id → 建，record_count=0', async () => {
    const { store } = await freshStore()
    const r = store.getOrCreateSession('sess-a', { client: 'claude', proxyMode: 'reverse' })
    expect(r.sessionId).toBe('sess-a')
    expect(r.recordCount).toBe(0)
  })
  it('已存在 → 返回现有 record_count（turn = prior + 1 的基础）', async () => {
    const { store } = await freshStore()
    store.getOrCreateSession('sess-b', { client: 'claude', proxyMode: 'reverse' })
    store.appendRecord('sess-b', { turn: 1 })
    const r = store.getOrCreateSession('sess-b')
    expect(r.recordCount).toBe(1)
  })
})

describe('finalizeSession —— 收尾定状态', () => {
  it('api_calls>0 → complete，写 summary', async () => {
    const { store } = await freshStore()
    const id = store.createSession()
    store.appendRecord(id, { turn: 1 })
    store.finalizeSession(id, { api_calls: 1, has_error: false })
    const row = store.loadSessionRow(id)!
    expect(row.status).toBe('complete')
    expect(row.summary).toMatchObject({ api_calls: 1 })
  })
  it('api_calls=0 → empty', async () => {
    const { store } = await freshStore()
    const id = store.createSession()
    store.finalizeSession(id, { api_calls: 0, has_error: false })
    expect(store.loadSessionRow(id)!.status).toBe('empty')
  })
  it('has_error → error', async () => {
    const { store } = await freshStore()
    const id = store.createSession()
    store.appendRecord(id, { turn: 1 })
    store.finalizeSession(id, { api_calls: 1, has_error: true })
    expect(store.loadSessionRow(id)!.status).toBe('error')
  })
})

describe('listSessions —— 枚举', () => {
  it('列出所有已建会话', async () => {
    const { store } = await freshStore()
    store.createSession({ client: 'a' })
    store.createSession({ client: 'b' })
    expect(store.listSessions().length).toBe(2)
  })
})

describe('本地隔离 —— 捕获数据只落注入目录（不外发的物理前提）', () => {
  it('所有落盘文件都在 store.dir 之下', async () => {
    const { store, dir } = await freshStore()
    const id = store.createSession()
    store.appendRecord(id, { turn: 1 })
    // sessions/ 与 records/ 都在 dir 内；无其它落点
    const top = readdirSync(dir).sort()
    expect(top).toEqual(['records', 'sessions'])
    expect(store.dir).toBe(dir)
  })
})
