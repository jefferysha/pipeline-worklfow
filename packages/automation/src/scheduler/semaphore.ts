/**
 * 手写计数信号量 —— 逐字移植老仓 scheduler/semaphore.ts:1-48（源自 sandcastle
 * .sandcastle/run.ts:42-55）。刻意不引 p-limit：enqueue-resolver 模式给 FIFO release 公平性，
 * 且小到值得自己拥有（kernel/automation 零第三方运行时依赖）。
 *
 * acquire() 在上限内立即 resolve，否则把 resolver park 到 FIFO 队列。release() 唤醒最老的
 * parked waiter（FIFO），保持 running 不变量。调用方必须每个 acquire 配一个 finally 里的
 * release——throw 的 holder 漏 release 会泄一个槽，池饿向 0。
 */
export interface Semaphore {
  acquire(): Promise<void>
  release(): void
  /** 当前持有的槽数（诊断 / 测试用）。 */
  running(): number
}

export const createSemaphore = (maxParallel: number): Semaphore => {
  if (maxParallel < 1) throw new Error('maxParallel must be >= 1')
  let running = 0
  const queue: Array<() => void> = []

  const acquire = (): Promise<void> => {
    if (running < maxParallel) {
      running++
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => queue.push(resolve))
  }

  const release = (): void => {
    // 下溢守卫（老仓 ROUND-11 L1）：多路 settle 可能对同一 holder release 两次；裸 running--
    // 会到 -1 → 永久多报一个空槽 → 超订 maxParallel。已空 → no-op。
    if (running <= 0) return
    running--
    const next = queue.shift()
    if (next) {
      running++
      next()
    }
  }

  return { acquire, release, running: () => running }
}
