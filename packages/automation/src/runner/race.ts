/**
 * 三路 race：idle-timeout / completion-grace / abort（BACKLOG #29c，DESIGN §7-item1）。
 * 移植老仓 runner/race.ts:99-293（Effect Deferred/Fiber → Promise.race + setTimeout + AbortController）。
 *
 * 状态机（idle ↔ grace 是 SWITCH，永远只武装一个计时器）：
 *   - 见完成信号前：武装 IDLE 计时器，每行输出 clear+re-arm；到期 REJECT AgentIdleTimeoutError。
 *   - 首次在累积输出里见完成信号 → completionDetected 翻转；此后每行改武装 GRACE 计时器；到期
 *     RESOLVE 缓冲输出（含信号）——把控制权交回，即便子进程仍挂（ADR 0019 宽限窗，等 git/gh/codex
 *     子进程退出并捕获尾部 build_sha/usage）。**禁止简化成"见信号即 kill"**。
 *   - AbortSignal fire → REJECT reason 原样（不包裹）。调用时已 aborted → 立即 reject，不武装。
 *
 * 判定拆成纯函数（detectsCompletion / armDecision）单测；invokeWithRace 用真计时器接线（fake timers 单测）。
 */
import type { ExecResult } from './exec.js'

export const DEFAULT_COMPLETION_SIGNAL = '<promise>COMPLETE</promise>'
export const DEFAULT_IDLE_TIMEOUT_MS = 20 * 60 * 1000 // 1200s（三轨 verify+e2e 是长任务，DESIGN §1.1）
export const DEFAULT_COMPLETION_TIMEOUT_MS = 60 * 1000 // ADR 0019 完成宽限窗

/** agent 见信号前 idle 超时（无输出挂死）时抛。classify 归 retry 类（瞬态，非移动靶）。 */
export class AgentIdleTimeoutError extends Error {
  override readonly name = 'AgentIdleTimeoutError'
  readonly _tag = 'AgentIdleTimeoutError'
}

/** 累积输出是否已含任一完成信号。 */
export const detectsCompletion = (accumulated: string, signals: readonly string[]): boolean =>
  signals.some((sig) => accumulated.includes(sig))

/** 该武装哪个计时器 + 到期语义：未见信号→idle 窗/reject-idle；见信号后→grace 窗/resolve。 */
export const armDecision = (
  completionDetected: boolean,
  idleMs: number,
  graceMs: number,
): { ms: number; onExpiry: 'reject-idle' | 'resolve' } =>
  completionDetected ? { ms: graceMs, onExpiry: 'resolve' } : { ms: idleMs, onExpiry: 'reject-idle' }

export interface RaceOptions {
  readonly idleMs: number
  readonly graceMs: number
  readonly completionSignals: readonly string[]
  readonly signal?: AbortSignal
}

/**
 * 把 runExec 与 idle/grace 计时器 + abort 信号 race。runExec 收 onLine 逐行回调（活跃感知）。
 * resolve exec 结果（或 grace 到期的缓冲输出），或 reject AgentIdleTimeoutError / abort reason / exec 错误。
 */
export const invokeWithRace = (
  runExec: (onLine: (line: string) => void) => Promise<ExecResult>,
  opts: RaceOptions,
): Promise<ExecResult> =>
  new Promise<ExecResult>((resolve, reject) => {
    const { idleMs, graceMs, completionSignals, signal } = opts
    let settled = false
    let accumulated = ''
    let completionDetected = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const clear = (): void => {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
    }
    const cleanup = (): void => {
      clear()
      if (onAbort && signal) signal.removeEventListener('abort', onAbort)
    }
    const settleResolve = (v: ExecResult): void => {
      if (settled) return
      settled = true
      cleanup()
      resolve(v)
    }
    const settleReject = (e: unknown): void => {
      if (settled) return
      settled = true
      cleanup()
      reject(e)
    }

    const resetTimer = (): void => {
      clear()
      const d = armDecision(completionDetected, idleMs, graceMs)
      timer = setTimeout(() => {
        if (d.onExpiry === 'resolve') settleResolve({ stdout: accumulated, stderr: '', exitCode: 0 })
        else settleReject(new AgentIdleTimeoutError(`Agent idle for ${idleMs / 1000}s — no output received.`))
      }, d.ms)
      ;(timer as { unref?: () => void }).unref?.()
    }

    let onAbort: (() => void) | undefined
    if (signal) {
      if (signal.aborted) {
        reject(signal.reason)
        return
      }
      onAbort = () => settleReject(signal.reason)
      signal.addEventListener('abort', onAbort, { once: true })
    }

    // 起始武装 idle 计时器（exec 起跑前）。
    resetTimer()

    const onLine = (line: string): void => {
      if (settled) return
      accumulated += (accumulated ? '\n' : '') + line
      if (!completionDetected && detectsCompletion(accumulated, completionSignals)) {
        completionDetected = true // 翻转：此后武装 grace 窗
      }
      resetTimer()
    }

    runExec(onLine)
      .then((res) => {
        if (settled) return
        settleResolve(res)
      })
      .catch((err) => settleReject(err))
  })
