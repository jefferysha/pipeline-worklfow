import { execFile } from 'node:child_process'
import { get as httpGet } from 'node:http'
import { createConnection } from 'node:net'

const DEFAULT_SOCKET_TIMEOUT_MS = 350
const DEFAULT_WALL_CLOCK_TIMEOUT_MS = 500
const DEFAULT_MAX_RESPONSE_BYTES = 16 * 1_024

export interface DashboardHealthProbeOptions {
  readonly socketTimeoutMs?: number
  readonly wallClockTimeoutMs?: number
  readonly maxResponseBytes?: number
  readonly expectedTransactionId?: string
  /** Observe a valid transaction identity without treating it as owned by the caller. */
  readonly observeAnyTransaction?: boolean
}

export interface DashboardHealthIdentity {
  readonly version: 1
  readonly port: number
  readonly pid: number
  readonly releaseId: string
  readonly stateScopeId: string
  readonly transactionId?: string
}

function healthyDashboardIdentity(
  value: unknown,
  port: number,
  expectedReleaseId: string | undefined,
  expectedStateScopeId: string,
  expectedTransactionId: string | undefined,
  observeAnyTransaction: boolean,
): DashboardHealthIdentity | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const body = value as Record<string, unknown>
  const releaseId = typeof body.releaseId === 'string'
    && /^sha256-[a-f0-9]{64}$/.test(body.releaseId)
    ? body.releaseId
    : 'unmanaged'
  if (!(body.ok === true
    && body.scope === 'global'
    && typeof body.version === 'string'
    && body.version !== ''
    && (expectedReleaseId === undefined || releaseId === expectedReleaseId)
    && body.stateScopeId === expectedStateScopeId
    && (body.transactionId === undefined
      || (typeof body.transactionId === 'string'
        && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(body.transactionId)))
    && (observeAnyTransaction
      || (expectedTransactionId === undefined
        ? body.transactionId === undefined
        : body.transactionId === expectedTransactionId))
    && Number.isSafeInteger(body.pid)
    && (body.pid as number) > 0)) return null
  return {
    version: 1,
    port,
    pid: body.pid as number,
    releaseId,
    stateScopeId: expectedStateScopeId,
    ...(typeof body.transactionId === 'string' ? { transactionId: body.transactionId } : {}),
  }
}

/**
 * A health attempt always settles within one wall-clock budget. Socket inactivity alone is not a
 * bound because a peer can drip-feed bytes forever; response abort/error and body size are also
 * part of the transport contract.
 */
export function probeHealthyDashboard(
  port: number,
  expectedReleaseId: string | undefined,
  expectedStateScopeId: string,
  options: DashboardHealthProbeOptions = {},
): Promise<DashboardHealthIdentity | null> {
  const socketTimeoutMs = options.socketTimeoutMs ?? DEFAULT_SOCKET_TIMEOUT_MS
  const wallClockTimeoutMs = options.wallClockTimeoutMs ?? DEFAULT_WALL_CLOCK_TIMEOUT_MS
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES
  return new Promise((resolveProbe) => {
    let settled = false
    let wallClockTimer: NodeJS.Timeout | undefined
    const finish = (healthy: DashboardHealthIdentity | null): void => {
      if (settled) return
      settled = true
      if (wallClockTimer !== undefined) clearTimeout(wallClockTimer)
      resolveProbe(healthy)
    }
    const request = httpGet(
      { host: '127.0.0.1', port, path: '/api/health', timeout: socketTimeoutMs },
      (response) => {
        let text = ''
        let receivedBytes = 0
        const failResponse = (): void => {
          response.destroy()
          finish(null)
        }
        response.setEncoding('utf8')
        response.on('data', (chunk: string) => {
          receivedBytes += Buffer.byteLength(chunk)
          if (receivedBytes > maxResponseBytes) {
            failResponse()
            return
          }
          text += chunk
        })
        response.once('aborted', () => finish(null))
        response.once('error', () => finish(null))
        response.once('end', () => {
          if (response.statusCode !== 200 || receivedBytes > maxResponseBytes) {
            finish(null)
            return
          }
          try {
            finish(healthyDashboardIdentity(
              JSON.parse(text),
              port,
              expectedReleaseId,
              expectedStateScopeId,
              options.expectedTransactionId,
              options.observeAnyTransaction === true,
            ))
          } catch {
            finish(null)
          }
        })
      },
    )
    wallClockTimer = setTimeout(() => {
      request.destroy()
      finish(null)
    }, wallClockTimeoutMs)
    request.once('timeout', () => {
      request.destroy()
      finish(null)
    })
    request.once('error', () => finish(null))
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms))
}

export async function waitForHealthyServer(
  port: number,
  expectedReleaseId: string | undefined,
  expectedStateScopeId: string,
  expectedTransactionId?: string,
): Promise<DashboardHealthIdentity | null> {
  // A release can first have to gracefully preempt a previous dashboard. Keep the readiness
  // budget longer than that server's four-second handoff without allowing any attempt to hang.
  for (let attempt = 0; attempt < 65; attempt += 1) {
    const identity = await probeHealthyDashboard(
      port,
      expectedReleaseId,
      expectedStateScopeId,
      { expectedTransactionId },
    )
    if (identity !== null) return identity
    await sleep(100)
  }
  return null
}

function listenerPids(port: number): Promise<number[] | null> {
  return new Promise((resolve) => {
    execFile('lsof', ['-nP', '-t', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' }, (error, stdout) => {
      if (error === null) {
        resolve([...new Set(String(stdout ?? '').split(/\r?\n/)
          .map((line) => Number.parseInt(line.trim(), 10))
          .filter((pid) => Number.isSafeInteger(pid) && pid > 0))])
        return
      }
      resolve((error as { code?: unknown }).code === 1 ? [] : null)
    })
  })
}

export function dashboardPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    socket.setTimeout(250)
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('timeout', () => { socket.destroy(); resolve(true) })
    socket.once('error', (error) => {
      resolve((error as NodeJS.ErrnoException).code !== 'ECONNREFUSED')
    })
  })
}

/** Stop only the listener whose health identity and kernel listener ownership still match. */
export async function stopOwnedDashboard(identity: DashboardHealthIdentity): Promise<boolean> {
  const current = await probeHealthyDashboard(
    identity.port,
    identity.releaseId,
    identity.stateScopeId,
    { expectedTransactionId: identity.transactionId },
  )
  if (current === null) return !(await dashboardPortOpen(identity.port))
  if (current.pid !== identity.pid || current.transactionId !== identity.transactionId) return false
  const listeners = await listenerPids(identity.port)
  if (listeners === null || !listeners.includes(identity.pid)) return false
  try {
    process.kill(identity.pid, 'SIGTERM')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') return false
  }
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    if (!(await dashboardPortOpen(identity.port))) return true
    await sleep(50)
  }
  return false
}
