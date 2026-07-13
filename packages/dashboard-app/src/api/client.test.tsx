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

  // 评审 P1-5：server PreconditionError 返回 { error: lines[0], detail: lines }——此前只读
  // error，多条 guard 违规只显示第一条，用户「修一条→再撞下一条」。detail 全量透传。
  it('409 带 detail[] 多行 → ApiError 文案包含全部违规行，不只第一条', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false, status: 409,
        json: async () => ({ ok: false, error: '缺 design_doc', detail: ['缺 design_doc', '缺 verification_report', 'branch_status 未处理'] }),
      }),
    )
    const err = await postTransition('c', '/r', 'verify-pass').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    const msg = (err as ApiError).message
    expect(msg).toContain('缺 design_doc')
    expect(msg).toContain('缺 verification_report')
    expect(msg).toContain('branch_status 未处理')
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

describe('G18 api 三函数（registerProject/unregisterProject/fetchWorkflowNames）', () => {
  it('registerProject：POST /api/projects 带 token + body {root}，返回规范化 root', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, root: '/repo-a' }) })
    vi.stubGlobal('fetch', fetchMock)
    const { registerProject } = await import('./client')
    const got = await registerProject('/repo-a/')
    expect(got.root).toBe('/repo-a')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/projects')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-abc')
    expect(JSON.parse(init.body as string)).toEqual({ root: '/repo-a/' })
  })

  it('registerProject：!ok 抛 ApiError 带 server 文案（409 已注册）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ ok: false, error: '项目已注册' }) }))
    const { registerProject } = await import('./client')
    await expect(registerProject('/repo-a')).rejects.toThrow('项目已注册')
  })

  it('unregisterProject：DELETE /api/projects?root= 带 token、无 Content-Type', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    vi.stubGlobal('fetch', fetchMock)
    const { unregisterProject } = await import('./client')
    await unregisterProject('/repo a')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/projects?root=%2Frepo%20a')
    expect(init.method).toBe('DELETE')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer tok-abc')
    expect(headers['Content-Type']).toBeUndefined()
  })

  it('fetchWorkflowNames：GET /api/workflows?root= 返回 names', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ names: ['rel', 'hotfix'] }) })
    vi.stubGlobal('fetch', fetchMock)
    const { fetchWorkflowNames } = await import('./client')
    const names = await fetchWorkflowNames('/repo')
    expect(names).toEqual(['rel', 'hotfix'])
    expect(String(fetchMock.mock.calls[0]![0])).toBe('/api/workflows?root=%2Frepo')
  })
})

/**
 * T9 失败卡动作两函数：重试（server 既有 /retry，CAS failed/conflict/paused → queued）与
 * 放弃（决议 #4 的 /dismiss，端点由 T11 落地——客户端先按同一契约接线）。
 */
describe('T9 afk 失败卡动作（postAfkRetry/postAfkDismiss）', () => {
  it('postAfkRetry：POST /api/afk/:name/retry 带 token + body {root}（name URL 编码）', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    vi.stubGlobal('fetch', fetchMock)
    const { postAfkRetry } = await import('./client')
    await postAfkRetry('hotfix login', '/repo-a')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/afk/hotfix%20login/retry')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer tok-abc')
    expect(headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body as string)).toEqual({ root: '/repo-a' })
  })

  it('postAfkDismiss：POST /api/afk/:name/dismiss；!ok 抛 ApiError 带 server 文案', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    vi.stubGlobal('fetch', fetchMock)
    const { postAfkDismiss } = await import('./client')
    await postAfkDismiss('hotfix-login', '/repo-a')
    expect(String(fetchMock.mock.calls[0]![0])).toBe('/api/afk/hotfix-login/dismiss')

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ ok: false, error: '状态已变，请刷新' }) }))
    await expect(postAfkDismiss('hotfix-login', '/repo-a')).rejects.toThrow('状态已变')
  })
})

/**
 * v9-J：fetchSessionLinks 批量预取（进度视图 failed 行「回终端」chip 一次拉全部，产品决策=
 * 批量端点而非逐行发请求）。非 2xx / 网络异常静默降级空表，不抛 ApiError——批量预取失败不该
 * 炸整个视图（同 fetchSessionLink 单条先例）。
 */
describe('fetchSessionLinks（GET /api/mem/session-links 批量）', () => {
  it('items 为空 → 直接返回空表，不发请求', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { fetchSessionLinks } = await import('./client')
    const got = await fetchSessionLinks([])
    expect(got).toEqual({})
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('URL 里 root/name 用重复键正确配对（下标对齐，同 server getAll 契约）', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ links: {} }) })
    vi.stubGlobal('fetch', fetchMock)
    const { fetchSessionLinks } = await import('./client')
    await fetchSessionLinks([
      { root: '/repo a', name: 'x' },
      { root: '/repo-b', name: 'y' },
    ])
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined]
    expect(String(url)).toBe('/api/mem/session-links?root=%2Frepo+a&name=x&root=%2Frepo-b&name=y')
    expect((init?.headers as Record<string, string> | undefined)?.Accept).toBe('application/json')
  })

  it('非 2xx → 静默降级为空对象，不抛错', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ ok: false }) }))
    const { fetchSessionLinks } = await import('./client')
    const got = await fetchSessionLinks([{ root: '/repo', name: 'a' }])
    expect(got).toEqual({})
  })

  it('成功 → 透传 server 的 .links', async () => {
    const links = { 'a@/repo': { found: true, platform: 'claude', resumeCmd: 'cd /repo && claude --resume sid' } }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ links }) }))
    const { fetchSessionLinks } = await import('./client')
    const got = await fetchSessionLinks([{ root: '/repo', name: 'a' }])
    expect(got).toEqual(links)
  })
})
