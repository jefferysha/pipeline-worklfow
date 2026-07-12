import { mkdir, mkdtemp, readdir, readFile, rmdir, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LOCK_DIR_NAME, LOCK_OWNER_FILE, STALE_LOCK_MS, withLock } from './lock.js'

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

describe('withLock —— owner token + token 守卫的回收/释放（B1）', () => {
  it('持锁期间锁目录内写有非空 owner token', async () => {
    await withLock(dir, async () => {
      const owner = await readFile(path.join(dir, LOCK_DIR_NAME, LOCK_OWNER_FILE), 'utf8')
      expect(owner.trim().length).toBeGreaterThan(0)
    })
  })

  it('release 只删自己持有的锁：持锁期间锁被夺(移除并重建他人锁)→ release 不删他人的锁', async () => {
    const lockDir = path.join(dir, LOCK_DIR_NAME)
    await withLock(dir, async () => {
      // 模拟超时夺锁：他人 rm 掉我们的锁并重建自己的空锁（不含我们的 owner token）
      await rm(lockDir, { recursive: true, force: true })
      await mkdir(lockDir)
    })
    // 我们的 release 必须校验 token：owner 不属于我们 → 不 rmdir 他人的锁
    expect((await stat(lockDir)).isDirectory()).toBe(true)
    await rm(lockDir, { recursive: true, force: true }) // 清理
  })

  it('陈锁回收（owner 文件 mtime 超 60s）→ 视为陈锁被安全接管', async () => {
    const lockDir = path.join(dir, LOCK_DIR_NAME)
    await mkdir(lockDir)
    const ownerFile = path.join(lockDir, LOCK_OWNER_FILE)
    await writeFile(ownerFile, 'dead-owner-token\n', 'utf8')
    const past = (Date.now() - STALE_LOCK_MS - 30_000) / 1000
    await utimes(lockDir, past, past)
    await utimes(ownerFile, past, past)
    const start = Date.now()
    expect(await withLock(dir, async () => 'reclaimed')).toBe('reclaimed')
    expect(Date.now() - start).toBeLessThan(2_000)
    // 接管后锁被正常释放，且无 .stale 坟墓残留
    const entries = await readdir(dir)
    expect(entries.filter((e) => e.startsWith(LOCK_DIR_NAME))).toEqual([])
  })

  it('陈锁存在时的并发 withLock：接管陈锁、临界区互斥(从不双持)、无锁/坟墓残留', async () => {
    const lockDir = path.join(dir, LOCK_DIR_NAME)
    await mkdir(lockDir)
    const ownerFile = path.join(lockDir, LOCK_OWNER_FILE)
    await writeFile(ownerFile, 'dead\n', 'utf8')
    const past = (Date.now() - STALE_LOCK_MS - 30_000) / 1000
    await utimes(lockDir, past, past)
    await utimes(ownerFile, past, past)

    let inside = 0
    let maxInside = 0
    const runs: number[] = []
    await Promise.all(
      [1, 2, 3].map((n) =>
        withLock(dir, async () => {
          inside++
          maxInside = Math.max(maxInside, inside)
          await new Promise((r) => setTimeout(r, 15))
          runs.push(n)
          inside--
        }),
      ),
    )
    expect(maxInside).toBe(1) // 从不双持
    expect(runs.sort()).toEqual([1, 2, 3])
    const entries = await readdir(dir)
    expect(entries.filter((e) => e.startsWith(LOCK_DIR_NAME))).toEqual([])
  })
})
