/**
 * store —— 事件日志 I/O 编排（append-only JSONL + seq 侧车 + 从事件重建）。真 fs（临时目录）。
 * 老仓真相源：skills/pipeline/scripts/channel/{events,seq}.py 的 fs 面。
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createChannelStore } from './store.js'
import type { ChannelEnv } from './paths.js'

let root: string
let env: ChannelEnv
const CLOCK = '2026-07-07T00:00:00Z'

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'chan-store-'))
  env = { root, cwd: '/proj/alpha' }
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('append —— seq 内部分配、ts 注入、真落 JSONL', () => {
  test('append 分配递增 seq（覆盖调用方写的 seq）', () => {
    const store = createChannelStore(env, undefined, () => CLOCK)
    const a = store.append('c1', { kind: 'create', by: 'main', task: 't', type: 'chat', seq: 999 })
    const b = store.append('c1', { kind: 'message', by: 'alice', text: 'hi' })
    expect(a.seq).toBe(1)
    expect(b.seq).toBe(2)
    expect(a.ts).toBe(CLOCK)
  })

  test('真读回落盘的 events.jsonl', async () => {
    const store = createChannelStore(env, undefined, () => CLOCK)
    store.append('c1', { kind: 'create', by: 'main', task: 't', type: 'chat' })
    const raw = await readFile(join(root, '-proj-alpha', 'c1', 'events.jsonl'), 'utf8')
    const lines = raw.trim().split('\n')
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0]!)).toMatchObject({ seq: 1, kind: 'create', by: 'main' })
  })

  test('read 回读全部事件', () => {
    const store = createChannelStore(env, undefined, () => CLOCK)
    store.append('c1', { kind: 'create', by: 'main', task: 't', type: 'chat' })
    store.append('c1', { kind: 'message', by: 'alice', text: 'hi' })
    const evs = store.read('c1')
    expect(evs.map((e) => e.kind)).toEqual(['create', 'message'])
  })

  test('缺 kind / 缺 by → 抛', () => {
    const store = createChannelStore(env, undefined, () => CLOCK)
    expect(() => store.append('c1', { by: 'x' } as never)).toThrow()
    expect(() => store.append('c1', { kind: 'message' } as never)).toThrow()
  })
})

describe('幂等（idempotencyKey）', () => {
  test('同 key 同 kind → 返回旧事件、不追加', () => {
    const store = createChannelStore(env, undefined, () => CLOCK)
    const a = store.append('c1', { kind: 'message', by: 'alice', text: 'hi', idempotencyKey: 'k1' })
    const b = store.append('c1', { kind: 'message', by: 'alice', text: 'hi again', idempotencyKey: 'k1' })
    expect(b.seq).toBe(a.seq)
    expect(store.read('c1')).toHaveLength(1)
  })
  test('同 key 不同 kind → 抛', () => {
    const store = createChannelStore(env, undefined, () => CLOCK)
    store.append('c1', { kind: 'message', by: 'alice', idempotencyKey: 'k1', text: 'x' })
    expect(() => store.append('c1', { kind: 'thread', by: 'alice', idempotencyKey: 'k1' })).toThrow()
  })
})

describe('reconcile —— jsonl 尾为真相对齐 .seq 侧车', () => {
  test('reconcile 返回 last seq，自修侧车', async () => {
    const store = createChannelStore(env, undefined, () => CLOCK)
    store.append('c1', { kind: 'create', by: 'main', task: 't', type: 'chat' })
    store.append('c1', { kind: 'message', by: 'a', text: 'x' })
    expect(store.reconcile('c1')).toBe(2)
    const sidecar = await readFile(join(root, '-proj-alpha', 'c1', '.seq'), 'utf8')
    expect(sidecar.trim()).toBe('2')
  })

  test('删侧车后 append 仍从 jsonl 尾续（不留 seq 空洞）', async () => {
    const store = createChannelStore(env, undefined, () => CLOCK)
    store.append('c1', { kind: 'create', by: 'main', task: 't', type: 'chat' })
    store.append('c1', { kind: 'message', by: 'a', text: 'x' })
    await rm(join(root, '-proj-alpha', 'c1', '.seq'), { force: true })
    const c = store.append('c1', { kind: 'message', by: 'b', text: 'y' })
    expect(c.seq).toBe(3)
  })
})

describe('registry —— append 事件后真投影', () => {
  test('spawned + message → registry pendingMessageCount', () => {
    const store = createChannelStore(env, undefined, () => CLOCK)
    store.append('c1', { kind: 'create', by: 'main', task: 't', type: 'chat' })
    store.append('c1', { kind: 'spawned', by: 'sup', as: 'w1' })
    store.append('c1', { kind: 'message', by: 'main', to: 'w1', text: 'go' })
    const reg = store.registry('c1')
    expect(reg.workers).toHaveLength(1)
    expect(reg.workers[0]).toMatchObject({ id: 'w1', channel: 'c1', pendingMessageCount: 1 })
  })
})

describe('list —— 桶内 channel 汇总', () => {
  test('列出创建过的 channel（含 type/task/事件数）', () => {
    const store = createChannelStore(env, undefined, () => CLOCK)
    store.append('c1', { kind: 'create', by: 'main', task: 'first', type: 'chat' })
    store.append('c2', { kind: 'create', by: 'main', task: 'second', type: 'forum' })
    const rows = store.list({})
    const names = rows.map((r) => r.name).sort()
    expect(names).toEqual(['c1', 'c2'])
    const c2 = rows.find((r) => r.name === 'c2')!
    expect(c2).toMatchObject({ type: 'forum', task: 'second' })
  })

  test('ephemeral 默认隐藏、--all 显示', () => {
    const store = createChannelStore(env, undefined, () => CLOCK)
    store.append('eph', { kind: 'create', by: 'main', task: 'e', type: 'chat', ephemeral: true })
    expect(store.list({}).map((r) => r.name)).not.toContain('eph')
    expect(store.list({ all: true }).map((r) => r.name)).toContain('eph')
  })
})

describe('红线 —— channel 事件绝不落在 openspec/changes（正交 barrier）', () => {
  test('channelDir 落在 channel root 下，与 .pipeline.yaml 完全隔离', () => {
    const store = createChannelStore(env, undefined, () => CLOCK)
    const dir = store.channelDir('c1')
    expect(dir.startsWith(root)).toBe(true)
    expect(dir).not.toContain('openspec')
    expect(dir).not.toContain('.pipeline')
  })
})
