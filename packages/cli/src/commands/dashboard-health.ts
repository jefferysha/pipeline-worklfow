import { get as httpGet } from 'node:http'

const DEFAULT_SOCKET_TIMEOUT_MS = 350
const DEFAULT_WALL_CLOCK_TIMEOUT_MS = 500
const DEFAULT_MAX_RESPONSE_BYTES = 16 * 1_024

export interface DashboardHealthProbeOptions {
  readonly socketTimeoutMs?: number
  readonly wallClockTimeoutMs?: number
  readonly maxResponseBytes?: number
}

function isHealthyDashboard(
  value: unknown,
  expectedReleaseId: string | undefined,
  expectedStateScopeId: string,
): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const body = value as Record<string, unknown>
  return body.ok === true
    && body.scope === 'global'
    && typeof body.version === 'string'
    && body.version !== ''
    && (expectedReleaseId === undefined || body.releaseId === expectedReleaseId)
    && body.stateScopeId === expectedStateScopeId
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
): Promise<boolean> {
  const socketTimeoutMs = options.socketTimeoutMs ?? DEFAULT_SOCKET_TIMEOUT_MS
  const wallClockTimeoutMs = options.wallClockTimeoutMs ?? DEFAULT_WALL_CLOCK_TIMEOUT_MS
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES
  return new Promise((resolveProbe) => {
    let settled = false
    let wallClockTimer: NodeJS.Timeout | undefined
    const finish = (healthy: boolean): void => {
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
          finish(false)
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
        response.once('aborted', () => finish(false))
        response.once('error', () => finish(false))
        response.once('end', () => {
          if (response.statusCode !== 200 || receivedBytes > maxResponseBytes) {
            finish(false)
            return
          }
          try {
            finish(isHealthyDashboard(JSON.parse(text), expectedReleaseId, expectedStateScopeId))
          } catch {
            finish(false)
          }
        })
      },
    )
    wallClockTimer = setTimeout(() => {
      request.destroy()
      finish(false)
    }, wallClockTimeoutMs)
    request.once('timeout', () => {
      request.destroy()
      finish(false)
    })
    request.once('error', () => finish(false))
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms))
}

export async function waitForHealthyServer(
  port: number,
  expectedReleaseId: string | undefined,
  expectedStateScopeId: string,
): Promise<boolean> {
  // A release can first have to gracefully preempt a previous dashboard. Keep the readiness
  // budget longer than that server's four-second handoff without allowing any attempt to hang.
  for (let attempt = 0; attempt < 65; attempt += 1) {
    if (await probeHealthyDashboard(port, expectedReleaseId, expectedStateScopeId)) return true
    await sleep(100)
  }
  return false
}
