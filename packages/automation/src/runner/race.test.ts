import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AgentIdleTimeoutError,
  armDecision,
  detectsCompletion,
  invokeWithRace,
} from './race.js'
import type { ExecResult } from './exec.js'

/**
 * 三路 race：idle-timeout / completion-grace / abort（老仓 runner/race.ts:99-293，DESIGN §7-item1）。
 * idle↔grace 是 SWITCH（永远只武装一个计时器）：见信号前 idle 超时 REJECT；见信号后切 grace 计时器
 * 到期 RESOLVE（宽限窗等子进程退出，ADR 0019）。纯判定单测 + 真计时器接线（fake timers，无 docker）。
 */
describe('race 纯判定', () => {
  it('detectsCompletion：累计输出含任一信号 → true', () => {
    expect(detectsCompletion('...<promise>COMPLETE</promise>...', ['<promise>COMPLETE</promise>'])).toBe(true)
    expect(detectsCompletion('still working', ['<promise>COMPLETE</promise>'])).toBe(false)
  })

  it('armDecision：未见信号 → idle 窗 / 到期 reject-idle', () => {
    expect(armDecision(false, 600_000, 60_000)).toEqual({ ms: 600_000, onExpiry: 'reject-idle' })
  })

  it('armDecision：见信号后 → grace 窗 / 到期 resolve（宽限成功）', () => {
    expect(armDecision(true, 600_000, 60_000)).toEqual({ ms: 60_000, onExpiry: 'resolve' })
  })
})

describe('invokeWithRace 真计时器接线', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('exec 先于 idle 完成 → 透传 exec 结果', async () => {
    const res = await invokeWithRace(
      async () => ({ stdout: 'done', stderr: '', exitCode: 0 }) as ExecResult,
      { idleMs: 10_000, graceMs: 1000, completionSignals: ['DONE'] },
    )
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toBe('done')
  })

  it('无输出 → idle 超时 REJECT AgentIdleTimeoutError（tag）', async () => {
    vi.useFakeTimers()
    const p = invokeWithRace(
      () => new Promise<ExecResult>(() => {}), // exec 永不结算，无 onLine
      { idleMs: 5000, graceMs: 1000, completionSignals: ['DONE'] },
    )
    const assertion = expect(p).rejects.toMatchObject({ _tag: 'AgentIdleTimeoutError' })
    await vi.advanceTimersByTimeAsync(5001)
    await assertion
  })

  it('见完成信号 → 切 grace 窗，到期 RESOLVE（缓冲输出，即便 exec 仍挂）', async () => {
    vi.useFakeTimers()
    const p = invokeWithRace(
      (onLine) => {
        onLine('<promise>COMPLETE</promise>')
        return new Promise<ExecResult>(() => {}) // exec 挂住，靠 grace 到期收口
      },
      { idleMs: 60_000, graceMs: 1000, completionSignals: ['<promise>COMPLETE</promise>'] },
    )
    await vi.advanceTimersByTimeAsync(1001)
    const res = await p
    expect(res.stdout).toContain('<promise>COMPLETE</promise>')
  })

  it('signal 已 abort → 立刻 REJECT reason（不武装任何计时器）', async () => {
    const controller = new AbortController()
    controller.abort(new Error('停止'))
    await expect(
      invokeWithRace(async () => ({ stdout: '', stderr: '', exitCode: 0 }) as ExecResult, {
        idleMs: 10_000,
        graceMs: 1000,
        completionSignals: ['DONE'],
        signal: controller.signal,
      }),
    ).rejects.toThrow('停止')
  })

  it('AgentIdleTimeoutError 带 _tag（classify 归 retry 类）', () => {
    expect(new AgentIdleTimeoutError('idle')._tag).toBe('AgentIdleTimeoutError')
  })
})
