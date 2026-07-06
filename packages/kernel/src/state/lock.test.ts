import { mkdir, mkdtemp, rmdir, rm, stat, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LOCK_DIR_NAME, STALE_LOCK_MS, withLock } from './lock.js'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'pl-lock-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('withLock（mkdir 原子锁）', () => {
  it('锁目录为 <changeDir>/.pipeline.lock/，执行中存在、结束后释放', async () => {
    const lockDir = path.join(dir, LOCK_DIR_NAME)
    await withLock(dir, async () => {
      const st = await stat(lockDir)
      expect(st.isDirectory()).toBe(true)
    })
    await expect(stat(lockDir)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('透传 fn 返回值；fn 抛错时仍释放锁', async () => {
    expect(await withLock(dir, async () => 42)).toBe(42)
    await expect(withLock(dir, async () => { throw new Error('boom') })).rejects.toThrow('boom')
    await expect(stat(path.join(dir, LOCK_DIR_NAME))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('互斥：临界区不交错', async () => {
    const events: string[] = []
    await Promise.all([
      withLock(dir, async () => {
        events.push('a-in')
        await new Promise((r) => setTimeout(r, 50))
        events.push('a-out')
      }),
      withLock(dir, async () => {
        events.push('b-in')
        events.push('b-out')
      }),
    ])
    expect(events).toHaveLength(4)
    // 无论谁先进，in/out 必须成对相邻（零交错）
    expect(events[0]!.replace('-in', '')).toBe(events[1]!.replace('-out', ''))
    expect(events[2]!.replace('-in', '')).toBe(events[3]!.replace('-out', ''))
  })

  it('陈锁回收：锁目录 mtime 超 60s → 视为陈锁被接管', async () => {
    const lockDir = path.join(dir, LOCK_DIR_NAME)
    await mkdir(lockDir)
    const past = (Date.now() - STALE_LOCK_MS - 30_000) / 1000
    await utimes(lockDir, past, past)
    const start = Date.now()
    expect(await withLock(dir, async () => 'reclaimed')).toBe('reclaimed')
    expect(Date.now() - start).toBeLessThan(2_000)
  })

  it('新鲜外部锁：等待持有者释放后才进入', async () => {
    const lockDir = path.join(dir, LOCK_DIR_NAME)
    await mkdir(lockDir)
    const t = setTimeout(() => void rmdir(lockDir), 120)
    const start = Date.now()
    expect(await withLock(dir, async () => 'waited')).toBe('waited')
    expect(Date.now() - start).toBeGreaterThanOrEqual(100)
    clearTimeout(t)
  })
})
