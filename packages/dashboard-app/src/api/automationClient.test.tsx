import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatApiError } from './transport'
import {
  postAfkDismiss,
  postAfkEnqueue,
  postAfkRetry,
  postAutomationSettings,
} from './automationClient'

beforeEach(() => {
  window.__TENON_DASHBOARD_TOKEN__ = 'tok-abc'
})

afterEach(() => {
  vi.restoreAllMocks()
})

const settings = {
  root: '/repo-a',
  max_parallel: 4,
  max_retries: 1,
  default_opt_in: false,
  image: '',
}

const settingsSuccess = {
  enabled: false,
  max_parallel: 4,
  max_retries: 1,
  default_opt_in: false,
  image: '',
}

const en = (key: string): string => ({
  'common.network_error': 'Network error',
  'common.invalid_response': 'Invalid server response.',
  'common.request_http_error': 'HTTP error',
})[key] ?? key

describe('AFK write success envelopes', () => {
  it.each([
    ['settings', () => postAutomationSettings(settings)],
    ['enqueue', () => postAfkEnqueue('change-a', '/repo-a')],
    ['retry', () => postAfkRetry('change-a', '/repo-a')],
    ['dismiss', () => postAfkDismiss('change-a', '/repo-a')],
  ])('%s rejects every malformed HTTP 200 body as an invalid response', async (_name, request) => {
    for (const body of [{}, { ok: false }, { ok: 'true' }, null]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response(JSON.stringify(body), { status: 200 }),
      ))

      const error = await request().then(
        () => null,
        (cause: unknown) => cause,
      )
      expect(error).toMatchObject({
        name: 'ApiError',
        status: 200,
      })
      expect(formatApiError(error, en)).toBe('Invalid server response.')
    }
  })

  it.each([
    ['settings', () => postAutomationSettings(settings)],
    ['enqueue', () => postAfkEnqueue('change-a', '/repo-a')],
    ['retry', () => postAfkRetry('change-a', '/repo-a')],
    ['dismiss', () => postAfkDismiss('change-a', '/repo-a')],
  ])('%s rejects a non-JSON HTTP 200 body as an invalid response', async (_name, request) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not-json', { status: 200 })))

    await expect(request()).rejects.toMatchObject({
      name: 'ApiError',
      status: 200,
    })
  })

  it.each([
    { ok: true },
    { ok: true, settings: {} },
    { ok: true, settings: { ...settingsSuccess, max_parallel: '4' } },
    { ok: true, settings: { ...settingsSuccess, enabled: undefined } },
    { ok: true, settings: { ...settingsSuccess, max_parallel: 0 } },
    { ok: true, settings: { ...settingsSuccess, max_parallel: 9 } },
    { ok: true, settings: { ...settingsSuccess, max_parallel: 1.5 } },
    { ok: true, settings: { ...settingsSuccess, max_retries: -1 } },
    { ok: true, settings: { ...settingsSuccess, max_retries: 4 } },
    { ok: true, settings: { ...settingsSuccess, max_retries: 0.5 } },
    { ok: true, settings: { ...settingsSuccess, image: ' sandcastle:local ' } },
    { ok: true, settings: { ...settingsSuccess, image: 'has space' } },
    { ok: true, settings: { ...settingsSuccess, image: 'x'.repeat(201) } },
    { ok: true, settings: { ...settingsSuccess, unexpected: true } },
  ])('settings rejects a malformed normalized settings result', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200 }),
    ))

    await expect(postAutomationSettings(settings)).rejects.toMatchObject({
      name: 'ApiError',
      status: 200,
    })
  })

  it.each([
    ['settings', () => postAutomationSettings(settings), { ok: true, settings: settingsSuccess, unexpected: true }],
    ['enqueue', () => postAfkEnqueue('change-a', '/repo-a'), { ok: true, unexpected: true }],
    ['retry', () => postAfkRetry('change-a', '/repo-a'), { ok: true, unexpected: true }],
    ['dismiss', () => postAfkDismiss('change-a', '/repo-a'), { ok: true, unexpected: true }],
  ])('%s rejects a success envelope with undeclared fields', async (_name, request, body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200 }),
    ))

    await expect(request()).rejects.toMatchObject({
      name: 'ApiError',
      status: 200,
    })
  })

  it.each([
    ['settings', () => postAutomationSettings(settings), { ok: true, settings: settingsSuccess }],
    ['enqueue', () => postAfkEnqueue('change-a', '/repo-a'), { ok: true }],
    ['retry', () => postAfkRetry('change-a', '/repo-a'), { ok: true }],
    ['dismiss', () => postAfkDismiss('change-a', '/repo-a'), { ok: true }],
  ])('%s accepts the server success envelope', async (_name, request, body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })))
    await expect(request()).resolves.toBeUndefined()
  })
})
