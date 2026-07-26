import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStateStore } from '@tenon/kernel'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { claim, commitFailureOwned, incrAttempts, markQueued, setAutomationOwned } from './claim.js'

/**
 * 真 fs + 真 kernel StateStore：驱动 automation 字段的 cas 并发闸（无 mock）。
 * 每例真起临时 repo → init change → 真读写 .pipeline.yaml → 断言真实落盘。
 */
describe('cas 并发闸（真 kernel cas 写 automation 字段）', () => {
  let root: string
  const store = createStateStore()
  const fixedClock = () => '2026-07-07T00:00:00Z'

  const initChange = async (name: string, track: 'backend' | 'pm' = 'backend') =>
    store.init({
      repoRoot: root, name, track, reviewSeed: track === 'pm' ? 'skipped' : 'pending',
      preset: 'full', clock: fixedClock,
    })

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'afk-claim-'))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('claim：queued→scheduled 原子认领；二次 claim 落空（TOCTOU 防双抢）', async () => {
    const dir = await initChange('c1')
    await markQueued(store, dir, fixedClock)
    expect(await store.get(dir, 'automation')).toBe('queued')
    expect(await store.get(dir, 'automation_queued_at')).toBe('2026-07-07T00:00:00Z')

    expect(await claim(store, dir)).toBe(true)
    expect(await store.get(dir, 'automation')).toBe('scheduled') // 真落盘
    // 已被认领 → 二次 claim 必落空
    expect(await claim(store, dir)).toBe(false)
    expect(await store.get(dir, 'automation')).toBe('scheduled')
  })

  it('setAutomationOwned：running/scheduled 才能写终态（双 cas 提交点）', async () => {
    const dir = await initChange('c2')
    await markQueued(store, dir, fixedClock)
    await claim(store, dir) // → scheduled
    await store.set(dir, 'automation', 'running')
    // running → merged 赢
    expect(await setAutomationOwned(store, dir, 'merged')).toBe(true)
    expect(await store.get(dir, 'automation')).toBe('merged')
    // 已是 merged（非 daemon-owned）→ 再写终态落空（幽灵重排防护）
    expect(await setAutomationOwned(store, dir, 'failed')).toBe(false)
    expect(await store.get(dir, 'automation')).toBe('merged')
  })

  it('incrAttempts：原子 read-modify-write，超预算标 exhausted', async () => {
    const dir = await initChange('c3')
    expect(await store.get(dir, 'automation_attempts')).toBe('0') // init 值
    const r1 = await incrAttempts(store, dir, 1)
    expect(r1).toEqual({ value: 1, exhausted: false })
    expect(await store.get(dir, 'automation_attempts')).toBe('1') // 真落盘
    const r2 = await incrAttempts(store, dir, 1)
    expect(r2).toEqual({ value: 2, exhausted: true }) // 2 > maxRetries=1
  })

  it('commitFailureOwned retry：owner 校验、attempts+1、queued 与诊断字段在同一锁内一次提交', async () => {
    const dir = await initChange('failure-commit')
    await markQueued(store, dir, fixedClock)
    await claim(store, dir)
    await store.set(dir, 'automation', 'running')

    expect(await commitFailureOwned(store, dir, {
      classification: 'retry',
      maxRetries: 1,
      fields: { automation_last_error: 'boom', automation_cause: '' },
    })).toEqual({ status: 'committed', automation: 'queued', attempts: 1 })
    expect(await store.get(dir, 'automation')).toBe('queued')
    expect(await store.get(dir, 'automation_attempts')).toBe('1')
    expect(await store.get(dir, 'automation_last_error')).toBe('boom')
  })

  it('commitFailureOwned owner 已丢失：返回同锁内 observed，attempts/诊断零改动', async () => {
    const dir = await initChange('failure-lost')
    await store.set(dir, 'automation', 'merged')

    expect(await commitFailureOwned(store, dir, {
      classification: 'retry',
      maxRetries: 1,
      fields: { automation_last_error: 'must-not-write', automation_cause: '' },
    })).toEqual({ status: 'ownership-lost', observed: 'merged' })
    expect(await store.get(dir, 'automation')).toBe('merged')
    expect(await store.get(dir, 'automation_attempts')).toBe('0')
    expect(await store.get(dir, 'automation_last_error')).toBe('')
  })

  it('并发两个 claim 竞同一 change：恰好一个赢（真锁串行）', async () => {
    const dir = await initChange('c4')
    await markQueued(store, dir, fixedClock)
    const [a, b] = await Promise.all([claim(store, dir), claim(store, dir)])
    expect([a, b].filter(Boolean)).toHaveLength(1)
    expect(await store.get(dir, 'automation')).toBe('scheduled')
  })
})
