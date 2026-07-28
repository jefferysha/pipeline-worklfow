import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchRelatedSessions } from './memoryClient'

const response = {
  protocol: 'tenon-related-session-memory/v1',
  query: 'review gate',
  platform: 'codex',
  partial: false,
  warnings: [],
  matches: [],
}

afterEach(() => {
  delete window.__TENON_DASHBOARD_TOKEN__
  vi.restoreAllMocks()
})

describe('related-session search client', () => {
  it('uses the protected POST boundary and forwards cancellation', async () => {
    window.__TENON_DASHBOARD_TOKEN__ = 'dashboard-token'
    const controller = new AbortController()
    global.fetch = vi.fn(async () => new Response(JSON.stringify(response), { status: 200 })) as unknown as typeof fetch

    await expect(searchRelatedSessions({
      root: '/repo',
      name: 'change-a',
      query: 'review gate',
      platform: 'codex',
    }, controller.signal)).resolves.toEqual(response)

    expect(fetch).toHaveBeenCalledWith('/api/mem/related-sessions/search', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer dashboard-token',
      },
      body: JSON.stringify({
        root: '/repo',
        name: 'change-a',
        query: 'review gate',
        platform: 'codex',
      }),
      signal: controller.signal,
    })
  })

  it('rejects non-success and malformed responses through typed API errors', async () => {
    global.fetch = vi.fn(async () => new Response(
      JSON.stringify({ error: 'memory-search-busy' }),
      { status: 429 },
    )) as unknown as typeof fetch
    await expect(searchRelatedSessions({
      root: '/repo', name: 'change-a', query: 'review gate', platform: 'all',
    })).rejects.toMatchObject({ name: 'ApiError', status: 429, message: 'memory-search-busy' })

    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as unknown as typeof fetch
    await expect(searchRelatedSessions({
      root: '/repo', name: 'change-a', query: 'review gate', platform: 'all',
    })).rejects.toMatchObject({ name: 'ApiError', status: 200 })
  })
})
