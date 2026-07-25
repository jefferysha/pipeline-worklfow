import type { EventPartial } from './types.js'
import type { WorkerProcess } from './process.js'

export type Scheduler = (fn: () => void, ms: number) => () => void

const SHUTDOWN_GRACE_MS = 3000

export const defaultSupervisorScheduler: Scheduler = (fn, ms) => {
  const timer = setTimeout(fn, ms)
  if (typeof timer.unref === 'function') timer.unref()
  return () => clearTimeout(timer)
}

export interface ShutdownDeps {
  worker: string
  append: (partial: EventPartial) => void
  child: () => WorkerProcess
  graceMs?: number
  timeoutMs?: number
  idleTimeoutMs?: number
  schedule?: Scheduler
  log?: (message: string) => void
}

/** Idempotent shutdown funnel shared by every supervisor exit path. */
export class ShutdownController {
  private reason: string | undefined
  private signal: string | undefined
  private terminalEmitted = false
  private killedStarted = false
  private killedDone = false
  private killedWaiters: (() => void)[] = []
  private readonly ladderCancels: (() => void)[] = []
  private readonly schedule: Scheduler
  private readonly graceMs: number
  private readonly log: (message: string) => void

  constructor(private readonly deps: ShutdownDeps) {
    this.schedule = deps.schedule ?? defaultSupervisorScheduler
    this.graceMs = deps.graceMs ?? SHUTDOWN_GRACE_MS
    this.log = deps.log ?? (() => {})
  }

  isShuttingDown(): boolean {
    return this.reason !== undefined
  }

  markTerminalEmitted(): void {
    this.terminalEmitted = true
  }

  hasTerminalEvent(): boolean {
    return this.terminalEmitted
  }

  claim(reason: string): boolean {
    if (this.reason !== undefined) return false
    this.reason = reason
    return true
  }

  private settleKilled(): void {
    this.killedDone = true
    const waiters = this.killedWaiters.splice(0)
    for (const waiter of waiters) waiter()
  }

  private awaitKilled(): Promise<void> {
    if (this.killedDone || !this.killedStarted) return Promise.resolve()
    return new Promise((resolve) => this.killedWaiters.push(resolve))
  }

  private startKillLadder(): void {
    const child = this.deps.child()
    child.closeStdin()
    const forceKill = (): void => {
      if (!child.exited()) {
        this.log('[supervisor] still alive, SIGKILL worker\n')
        child.kill('SIGKILL')
      }
    }
    const terminate = (): void => {
      if (!child.exited()) {
        this.log('[supervisor] grace expired, SIGTERM worker\n')
        child.kill('SIGTERM')
        this.ladderCancels.push(this.schedule(forceKill, this.graceMs))
      }
    }
    this.ladderCancels.push(this.schedule(terminate, this.graceMs))
  }

  private writeKilled(reason: string, signal: string): void {
    const partial: EventPartial = {
      kind: 'killed',
      by: `supervisor:${this.deps.worker}`,
      reason,
      signal,
    }
    if (reason === 'timeout' && this.deps.timeoutMs) partial.timeout_ms = this.deps.timeoutMs
    if (reason === 'idle-timeout' && this.deps.idleTimeoutMs) {
      partial.idle_timeout_ms = this.deps.idleTimeoutMs
    }
    try {
      this.deps.append(partial)
    } finally {
      this.settleKilled()
    }
  }

  async request(signalName: string, reason: string): Promise<void> {
    if (this.killedStarted) {
      await this.awaitKilled()
      return
    }
    this.killedStarted = true
    if (this.reason === undefined) this.reason = reason
    if (this.signal === undefined) this.signal = signalName

    this.log(`[supervisor] shutting down worker (reason=${this.reason}, signal=${this.signal})\n`)
    this.startKillLadder()
    const claimedReason = this.reason
    const claimedSignal = this.signal
    if (claimedReason === undefined || claimedSignal === undefined) {
      this.settleKilled()
      throw new Error('shutdown request lost its claimed reason or signal')
    }
    this.writeKilled(claimedReason, claimedSignal)
  }

  async finalizeOnExit(code: number | null, signal: string | null): Promise<void> {
    this.log(`[supervisor] worker exit code=${code ?? 'null'} signal=${signal ?? 'null'}\n`)
    if (!this.terminalEmitted && this.reason === undefined) {
      this.terminalEmitted = true
      if (code === 0) {
        this.deps.append({
          kind: 'done',
          by: this.deps.worker,
          synthesized: true,
          exit_code: code,
        })
      } else {
        this.deps.append({
          kind: 'error',
          by: this.deps.worker,
          message: `worker exited without terminal event (code=${code}, signal=${signal})`,
          synthesized: true,
          exit_code: code,
          exit_signal: signal,
        })
      }
    }
    if (this.killedStarted) await this.awaitKilled()
  }

  dispose(): void {
    for (const cancel of this.ladderCancels.splice(0)) cancel()
  }
}

/** Idle-timeout lifecycle guard. Mid-turn callers pause it and reset it after a completed turn. */
export class IdleTimer {
  private cancel: (() => void) | undefined
  private cancelled = false

  constructor(
    private readonly idleTimeoutMs: number,
    private readonly shutdown: ShutdownController,
    private readonly isChildExited: () => boolean,
    private readonly schedule: Scheduler = defaultSupervisorScheduler,
  ) {
    if (idleTimeoutMs > 0) this.reset()
  }

  private clear(): void {
    if (this.cancel !== undefined) {
      this.cancel()
      this.cancel = undefined
    }
  }

  private fire(): void {
    this.cancel = undefined
    if (this.cancelled) return
    if (this.shutdown.isShuttingDown() || this.shutdown.hasTerminalEvent() || this.isChildExited()) {
      return
    }
    void this.shutdown.request('SIGTERM', 'idle-timeout')
  }

  reset(): void {
    if (this.cancelled || this.idleTimeoutMs <= 0) return
    this.clear()
    this.cancel = this.schedule(() => this.fire(), this.idleTimeoutMs)
  }

  pause(): void {
    this.clear()
  }

  dispose(): void {
    this.cancelled = true
    this.clear()
  }
}
