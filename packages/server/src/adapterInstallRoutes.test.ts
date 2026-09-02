import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { resolveAdapterInstallGet } from './adapterInstallRoutes.js'

describe('adapter install SSE route', () => {
  it('ends a synchronously replayed completed job exactly once', async () => {
    const jobId = '11111111-1111-4111-8111-111111111111'
    const state = {
      job_id: jobId,
      host: 'cursor',
      phase: 'planned' as const,
      message: 'planned',
      at: '2026-09-02T00:00:00.000Z',
    }
    const unsubscribe = vi.fn()
    const manager = {
      get: vi.fn().mockReturnValue({ job_id: jobId, root: '/repo', hosts: ['cursor'], dry_run: true, states: [state] }),
      subscribe: vi.fn((_id: string, listener: (value: typeof state) => void) => {
        listener(state)
        return unsubscribe
      }),
    }
    const request = new EventEmitter()
    ;(request as EventEmitter & { url: string }).url = `/api/adapters/install/${jobId}/stream?root=%2Frepo`
    const response = {
      writableEnded: false,
      writeHead: vi.fn(),
      write: vi.fn(() => true),
      end: vi.fn(),
    }

    await resolveAdapterInstallGet(request as never, response as never, `/api/adapters/install/${jobId}/stream`, {
      manager,
      workflowRootForRequest: () => ({ ok: true, anchor: { path: '/repo' } as never }),
      sendJson: vi.fn(),
    })

    expect(response.end).toHaveBeenCalledTimes(1)
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})
