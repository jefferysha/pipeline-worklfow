import { describe, expect, it, vi } from 'vitest'
import { singleFlight } from './singleFlight.js'

describe('singleFlight', () => {
  it('skips overlapping polls and permits the next poll after completion', async () => {
    let finish: (() => void) | undefined
    const task = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
    const poll = singleFlight(task)

    const first = poll()
    await poll()
    expect(task).toHaveBeenCalledTimes(1)
    finish?.()
    await first

    const third = poll()
    expect(task).toHaveBeenCalledTimes(2)
    finish?.()
    await third
  })

  it('releases the single-flight gate after a failed poll', async () => {
    const task = vi.fn()
      .mockRejectedValueOnce(new Error('fingerprint failed'))
      .mockResolvedValueOnce(undefined)
    const poll = singleFlight(task)

    await expect(poll()).rejects.toThrow('fingerprint failed')
    await expect(poll()).resolves.toBeUndefined()
    expect(task).toHaveBeenCalledTimes(2)
  })
})
