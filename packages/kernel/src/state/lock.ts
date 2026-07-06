/**
 * mkdir 原子锁 —— POSIX mkdir 原子性，macOS/Linux/BSD 通吃（flock 在 macOS 默认缺席），
 * 语义对齐老内核 state-lib.sh portable_lock。锁目录固定 `<changeDir>/.pipeline.lock/`。
 *
 * 双层互斥：
 * - 进程内：按锁目录路径 FIFO 排队（Promise 链），并发 withLock 严格串行、零忙等；
 * - 跨进程：mkdir 抢占 + 轮询等待 + 陈锁回收（锁目录 mtime 超 60s 视为持有者已死，接管）。
 *
 * 注意：锁不可重入——fn 内组合多步请用 read/write 原语，勿嵌套 set/setMany/cas/withLock。
 */
import { mkdir, rm, rmdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

export const LOCK_DIR_NAME = '.pipeline.lock'
/** 陈锁阈值：锁目录 mtime 超过 60s 视为陈锁，可回收接管 */
export const STALE_LOCK_MS = 60_000
const ACQUIRE_TIMEOUT_MS = 10_000
const POLL_MS = 10

/** 进程内 FIFO 队尾（按解析后的锁目录路径），存入的 promise 永不 reject */
const queues = new Map<string, Promise<void>>()

function lockDirFor(changeDir: string): string {
  return path.join(path.resolve(changeDir), LOCK_DIR_NAME)
}

async function acquire(lockDir: string): Promise<void> {
  const deadline = Date.now() + ACQUIRE_TIMEOUT_MS
  for (;;) {
    try {
      await mkdir(lockDir)
      return
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
    }
    // 已被占用：陈锁（mtime 超 60s）→ 回收后立刻重试；否则轮询等待
    try {
      const st = await stat(lockDir)
      if (Date.now() - st.mtimeMs > STALE_LOCK_MS) {
        await rm(lockDir, { recursive: true, force: true })
        continue
      }
    } catch {
      continue // stat 竞态失败 = 锁刚被释放，立刻重试 mkdir
    }
    if (Date.now() >= deadline) {
      throw new Error(`withLock: acquire timeout after ${ACQUIRE_TIMEOUT_MS}ms: ${lockDir}`)
    }
    await sleep(POLL_MS)
  }
}

async function release(lockDir: string): Promise<void> {
  try {
    await rmdir(lockDir)
  } catch {
    // 已被陈锁回收/不存在 —— 释放幂等，不抛
  }
}

/** mkdir 原子锁 + 陈锁回收，锁内串行执行 fn；透传 fn 结果，异常时保证释放。 */
export async function withLock<T>(changeDir: string, fn: () => Promise<T>): Promise<T> {
  const lockDir = lockDirFor(changeDir)
  const prev = queues.get(lockDir) ?? Promise.resolve()
  const run = prev.then(async () => {
    await acquire(lockDir)
    try {
      return await fn()
    } finally {
      await release(lockDir)
    }
  })
  const settled = run.then(
    () => undefined,
    () => undefined,
  )
  queues.set(lockDir, settled)
  void settled.then(() => {
    if (queues.get(lockDir) === settled) queues.delete(lockDir)
  })
  return run
}
