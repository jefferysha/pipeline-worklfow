import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ApiError, fetchSnapshot, getToken, postTransition, subscribeSnapshot } from './client'
import { lastEventSource, resetEventSources } from '../test-setup'
import { makeSnapshot } from '../testkit'

beforeEach(() => {
  resetEventSources()
  ;(window as unknown as { __PIPELINE_DASHBOARD_TOKEN__?: string }).__PIPELINE_DASHBOARD_TOKEN__ = 'tok-abc'
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('getToken（同源注入的 window token）', () => {
  it('读取 window.__PIPELINE_DASHBOARD_TOKEN__', () => {
    expect(getToken()).toBe('tok-abc')
  })
})

describe('postTransition（B5 token 写回，契约 { root, event }）', () => {
  it('POST 正确 url / method / Authorization Bearer / body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    vi.stubGlobal('fetch', fetchMock)
    await postTransition('login flow', '/repo-a', 'build-complete')
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/change/login%20flow/transition')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer tok-abc')
    expect(headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body as string)).toEqual({ root: '/repo-a', event: 'build-complete' })
  })

  it('!ok 时抛 ApiError 且带 server error 文案', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ ok: false, error: 'phase 不匹配' }) }),
    )
    await expect(postTransition('c', '/r', 'verify-pass')).rejects.toThrow('phase 不匹配')
    await expect(postTransition('c', '/r', 'verify-pass')).rejects.toBeInstanceOf(ApiError)
  })
})

describe('fetchSnapshot', () => {
  it('解析 /api/snapshot JSON', async () => {
    const snap = makeSnapshot([])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => snap }))
    const got = await fetchSnapshot()
    expect(got.capabilities.snapshot).toBe(true)
  })

  it('!ok → ApiError 带状态码', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }))
    await expect(fetchSnapshot()).rejects.toThrow('500')
  })
})

describe('subscribeSnapshot（真 EventSource stub，组件真收帧）', () => {
  it('emit snapshot 事件 → 回调收到解析后的 Snapshot；退订调用 close', () => {
    const received: unknown[] = []
    const unsub = subscribeSnapshot((s) => received.push(s))
    const es = lastEventSource()!
    expect(es.url).toBe('/api/stream')
    es.emit('snapshot', JSON.stringify(makeSnapshot([])))
    expect(received).toHaveLength(1)
    expect((received[0] as { version: string }).version).toBe('0.1.0')
    unsub()
    expect(es.readyState).toBe(2) // CLOSED
  })

  it('坏帧不抛（忽略）', () => {
    const received: unknown[] = []
    subscribeSnapshot((s) => received.push(s))
    const es = lastEventSource()!
    expect(() => es.emit('snapshot', '{bad json')).not.toThrow()
    expect(received).toHaveLength(0)
  })
})
