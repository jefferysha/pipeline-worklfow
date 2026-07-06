import { describe, expect, it } from 'vitest'
import { createSemaphore } from './semaphore.js'

/** 手写计数信号量（老仓 scheduler/semaphore.ts:1-48 逐字移植语义）。 */
describe('createSemaphore', () => {
  it('maxParallel < 1 抛错', () => {
    expect(() => createSemaphore(0)).toThrow()
  })

  it('并发上限内立即放行，超限 park 到 FIFO 队列', async () => {
    const sem = createSemaphore(2)
    await sem.acquire()
    await sem.acquire()
    expect(sem.running()).toBe(2)
    let third = false
    const p = sem.acquire().then(() => {
      third = true
    })
    await Promise.resolve()
    expect(third).toBe(false) // 第三个被 park
    sem.release()
    await p
    expect(third).toBe(true) // release 唤醒最老的 waiter（FIFO）
  })

  it('release 下溢守卫：重复 release 不把 running 打成负（不超订）', () => {
    const sem = createSemaphore(1)
    sem.release()
    sem.release()
    expect(sem.running()).toBe(0)
  })

  it('真并发限流：20 个任务同时抢，任意时刻在跑 ≤ maxParallel', async () => {
    const sem = createSemaphore(3)
    let live = 0
    let peak = 0
    const task = async () => {
      await sem.acquire()
      try {
        live++
        peak = Math.max(peak, live)
        await new Promise((r) => setTimeout(r, 1))
        live--
      } finally {
        sem.release()
      }
    }
    await Promise.all(Array.from({ length: 20 }, task))
    expect(peak).toBeLessThanOrEqual(3)
    expect(peak).toBeGreaterThan(0)
    expect(live).toBe(0)
  })
})
