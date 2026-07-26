import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, test } from 'vitest'
import { probeHealthyDashboard } from './dashboard-health.js'

const servers: Server[] = []

async function listen(server: Server): Promise<number> {
  servers.push(server)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('missing test server address')
  return address.port
}

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

describe('Dashboard health probe', () => {
  test('settles false when a 200 response aborts after a partial JSON body', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.write('{"ok":')
      setImmediate(() => response.socket?.destroy())
    })
    const port = await listen(server)

    await expect(probeHealthyDashboard(
      port,
      undefined,
      `sha256-v1-${'1'.repeat(64)}`,
      { wallClockTimeoutMs: 300 },
    )).resolves.toBe(false)
  })

  test('uses a wall-clock deadline even when a peer continuously drip-feeds the body', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      const timer = setInterval(() => response.write(' '), 20)
      response.once('close', () => clearInterval(timer))
    })
    const port = await listen(server)
    const startedAt = Date.now()

    await expect(probeHealthyDashboard(
      port,
      undefined,
      `sha256-v1-${'1'.repeat(64)}`,
      { wallClockTimeoutMs: 120 },
    )).resolves.toBe(false)
    expect(Date.now() - startedAt).toBeLessThan(500)
  })

  test('rejects an oversized health body without accumulating it indefinitely', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('x'.repeat(1_024))
    })
    const port = await listen(server)

    await expect(probeHealthyDashboard(
      port,
      undefined,
      `sha256-v1-${'1'.repeat(64)}`,
      { maxResponseBytes: 64 },
    )).resolves.toBe(false)
  })
})
