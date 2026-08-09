import { spawn, type ChildProcess } from 'node:child_process'

export interface DashboardProcessHandle {
  readonly pid: number
  terminate(): Promise<void>
}

export class DashboardTerminationUnconfirmedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DashboardTerminationUnconfirmedError'
  }
}

const DASHBOARD_TERMINATION_GRACE_MS = 2_000

/**
 * Owns the complete detached-child lifecycle. Termination succeeds only after Node observes the
 * child's exit event; sending a signal is an intent, not proof that the process released 18765.
 */
function confirmedTermination(child: ChildProcess): Promise<void> {
  return new Promise((resolveTerminated, rejectTerminated) => {
    let settled = false
    let forceTimer: NodeJS.Timeout | undefined
    let proofTimer: NodeJS.Timeout | undefined
    const cleanup = (): void => {
      if (forceTimer !== undefined) clearTimeout(forceTimer)
      if (proofTimer !== undefined) clearTimeout(proofTimer)
      child.off('exit', onExit)
    }
    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      cleanup()
      if (error === undefined) resolveTerminated()
      else rejectTerminated(error)
    }
    const onExit = (): void => finish()
    const signal = (name: NodeJS.Signals): boolean => {
      try {
        return child.kill(name)
      } catch (error) {
        finish(new DashboardTerminationUnconfirmedError(
          `向候选 Dashboard 发送 ${name} 失败，且未观察到 exit：${error instanceof Error ? error.message : String(error)}`,
        ))
        return false
      }
    }

    if (child.exitCode !== null || child.signalCode !== null) {
      finish()
      return
    }
    child.once('exit', onExit)
    if (!signal('SIGTERM')) {
      finish(new DashboardTerminationUnconfirmedError(
        '向候选 Dashboard 发送 SIGTERM 未成功，且未观察到 exit',
      ))
      return
    }
    forceTimer = setTimeout(() => {
      if (settled) return
      if (!signal('SIGKILL')) {
        finish(new DashboardTerminationUnconfirmedError(
          '向候选 Dashboard 发送 SIGKILL 未成功，且未观察到 exit',
        ))
        return
      }
      proofTimer = setTimeout(() => {
        finish(new DashboardTerminationUnconfirmedError(
          '候选 Dashboard 收到 SIGKILL 后仍未在期限内产生 exit 事件',
        ))
      }, DASHBOARD_TERMINATION_GRACE_MS)
    }, DASHBOARD_TERMINATION_GRACE_MS)
  })
}

export function launchDetachedDashboardProcess(
  serverBundle: string,
  env: NodeJS.ProcessEnv,
  nodeExecutable = process.execPath,
): Promise<DashboardProcessHandle | null> {
  return new Promise((resolveStarted) => {
    let settled = false
    const finish = (started: DashboardProcessHandle | null): void => {
      if (settled) return
      settled = true
      resolveStarted(started)
    }
    const child = spawn(nodeExecutable, [serverBundle], { detached: true, stdio: 'ignore', env })
    child.once('error', () => finish(null))
    child.once('spawn', () => {
      const pid = child.pid
      if (pid === undefined || !Number.isSafeInteger(pid) || pid <= 0) {
        finish(null)
        return
      }
      child.unref()
      finish({
        pid,
        terminate: () => confirmedTermination(child),
      })
    })
  })
}
