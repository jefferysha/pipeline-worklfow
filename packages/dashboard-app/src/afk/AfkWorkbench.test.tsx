import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { AfkWorkbench } from './AfkWorkbench'

const SNAPSHOT = {
  generated_at: '2026-07-07T00:00:00Z',
  scheduler: { status: 'busy', queued: 0, running: 1, merged: 0, failed: 0, conflict: 0, paused: 1, total: 2, message: '' },
  lanes: {
    queued: [], merged: [], failed: [], conflict: [],
    running: [{ name: 'demo-2', root: '/tmp/a', path: '/tmp/a/openspec/changes/demo-2', phase: 'build', automation: 'running', lane: 'running', attempts: 0, queued_at: '', last_error: '', sandbox: 'sandcastle-abc', worktree: '/tmp/wt-2' }],
    paused: [{ name: 'demo-1', root: '/tmp/a', path: '/tmp/a/openspec/changes/demo-1', phase: 'build', automation: 'paused', lane: 'paused', attempts: 0, queued_at: '', last_error: '', sandbox: '', worktree: '' }],
  },
  cards: [],
}

function renderAfk() {
  render(
    <I18nProvider>
      <AfkWorkbench />
    </I18nProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
    if (url === '/api/afk/snapshot') return new Response(JSON.stringify(SNAPSHOT), { status: 200 })
    if (url.startsWith('/api/afk/demo-2/log')) return new Response(JSON.stringify({ log: 'building...\n' }), { status: 200 })
    if (url.startsWith('/api/afk/demo-1/retry') && opts?.method === 'POST') return new Response(JSON.stringify({ ok: true }), { status: 200 })
    throw new Error(`unexpected ${url}`)
  }) as unknown as typeof fetch
})
afterEach(() => vi.restoreAllMocks())

describe('AfkWorkbench', () => {
  it('左列表显示两个 change，点击 running 的那个 → 右侧详情显示日志', async () => {
    renderAfk()
    await waitFor(() => expect(screen.getByText('demo-2')).toBeInTheDocument())
    fireEvent.click(screen.getByText('demo-2'))
    await waitFor(() => expect(screen.getByText(/building\.\.\./)).toBeInTheDocument())
  })

  it('详情区渲染 sandbox/worktree 路径（F3/design §4 要求，此前数据已 fetch 但从未渲染）', async () => {
    renderAfk()
    await waitFor(() => expect(screen.getByText('demo-2')).toBeInTheDocument())
    fireEvent.click(screen.getByText('demo-2'))
    await waitFor(() => expect(screen.getByText(/sandcastle-abc/)).toBeInTheDocument())
    expect(screen.getByText(/\/tmp\/wt-2/)).toBeInTheDocument()
  })

  it('sandbox/worktree 为空字符串（paused 卡）时不渲染对应行（不是渲染一行空内容）', async () => {
    renderAfk()
    await waitFor(() => expect(screen.getByText('demo-1')).toBeInTheDocument())
    fireEvent.click(screen.getByText('demo-1'))
    await waitFor(() => expect(screen.getByRole('button', { name: /重试|Retry/i })).toBeInTheDocument())
    expect(screen.queryByText(/沙箱|Sandbox/)).not.toBeInTheDocument()
    expect(screen.queryByText(/worktree|Worktree/)).not.toBeInTheDocument()
  })

  it('paused 的 change 点击后详情区有"重试"按钮，点击真 POST /retry，成功后真 refetch 快照', async () => {
    let snapshotCalls = 0
    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === '/api/afk/snapshot') {
        snapshotCalls += 1
        return new Response(JSON.stringify(SNAPSHOT), { status: 200 })
      }
      if (url.startsWith('/api/afk/demo-1/retry') && opts?.method === 'POST') return new Response(JSON.stringify({ ok: true }), { status: 200 })
      throw new Error(`unexpected ${url}`)
    }) as unknown as typeof fetch
    renderAfk()
    await waitFor(() => expect(screen.getByText('demo-1')).toBeInTheDocument())
    expect(snapshotCalls).toBe(1)
    fireEvent.click(screen.getByText('demo-1'))
    const retryBtn = await screen.findByRole('button', { name: /重试|Retry/i })
    fireEvent.click(retryBtn)
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
      expect(calls.some((c) => String(c[0]).includes('/retry'))).toBe(true)
    })
    await waitFor(() => expect(snapshotCalls).toBe(2))
  })

  it('快照 fetch 失败时显示错误信息，而不是一直卡在空白/加载状态', async () => {
    global.fetch = vi.fn(async (url: string) => {
      if (url === '/api/afk/snapshot') return new Response(JSON.stringify({ ok: false, error: 'boom' }), { status: 500 })
      throw new Error(`unexpected ${url}`)
    }) as unknown as typeof fetch
    renderAfk()
    await waitFor(() => expect(screen.getByText(/加载失败|错误|error|Error/i)).toBeInTheDocument())
  })

  it('选中 change 后日志 fetch 失败 → 详情区显示错误信息而不是空白', async () => {
    global.fetch = vi.fn(async (url: string) => {
      if (url === '/api/afk/snapshot') return new Response(JSON.stringify(SNAPSHOT), { status: 200 })
      if (url.startsWith('/api/afk/demo-2/log')) return new Response(JSON.stringify({ ok: false, error: 'log boom' }), { status: 500 })
      throw new Error(`unexpected ${url}`)
    }) as unknown as typeof fetch
    renderAfk()
    await waitFor(() => expect(screen.getByText('demo-2')).toBeInTheDocument())
    fireEvent.click(screen.getByText('demo-2'))
    await waitFor(() => expect(screen.getByText(/日志加载失败|加载失败|error|Error/i)).toBeInTheDocument())
  })

  it('取消操作失败（非 2xx）时显示错误信息', async () => {
    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === '/api/afk/snapshot') return new Response(JSON.stringify(SNAPSHOT), { status: 200 })
      if (url.startsWith('/api/afk/demo-2/log')) return new Response(JSON.stringify({ log: 'building...\n' }), { status: 200 })
      if (url.startsWith('/api/afk/demo-2/cancel') && opts?.method === 'POST') {
        return new Response(JSON.stringify({ ok: false, error: 'cancel boom' }), { status: 400 })
      }
      throw new Error(`unexpected ${url}`)
    }) as unknown as typeof fetch
    renderAfk()
    await waitFor(() => expect(screen.getByText('demo-2')).toBeInTheDocument())
    fireEvent.click(screen.getByText('demo-2'))
    const cancelBtn = await screen.findByRole('button', { name: /取消|Cancel/i })
    fireEvent.click(cancelBtn)
    await waitFor(() => expect(screen.getByText(/取消失败|操作失败|error|Error/i)).toBeInTheDocument())
  })

  it('lane=running 但 automation=scheduled（已认领未起跑）时，详情区不应显示"取消"按钮', async () => {
    // 对应 server laneOf()：scheduled 和 running 都折叠进 running 泳道，但 cancelAfkRun 只认
    // automation==='running'，scheduled 传进去必 400。Cancel 门禁须用 automation 而非 lane 判断。
    const SCHEDULED_SNAPSHOT = {
      generated_at: '2026-07-07T00:00:00Z',
      scheduler: { status: 'busy', queued: 0, running: 1, merged: 0, failed: 0, conflict: 0, paused: 0, total: 1, message: '' },
      lanes: {
        queued: [], merged: [], failed: [], conflict: [], paused: [],
        running: [{ name: 'demo-scheduled', root: '/tmp/a', path: '/tmp/a/openspec/changes/demo-scheduled', phase: 'build', automation: 'scheduled', lane: 'running', attempts: 0, queued_at: '', last_error: '', sandbox: 'sandcastle-xyz', worktree: '/tmp/wt-3' }],
      },
      cards: [],
    }
    global.fetch = vi.fn(async (url: string) => {
      if (url === '/api/afk/snapshot') return new Response(JSON.stringify(SCHEDULED_SNAPSHOT), { status: 200 })
      if (url.startsWith('/api/afk/demo-scheduled/log')) return new Response(JSON.stringify({ log: null }), { status: 200 })
      throw new Error(`unexpected ${url}`)
    }) as unknown as typeof fetch
    renderAfk()
    await waitFor(() => expect(screen.getByText('demo-scheduled')).toBeInTheDocument())
    fireEvent.click(screen.getByText('demo-scheduled'))
    await waitFor(() => expect(screen.getByText(/（无日志）/)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /取消|Cancel/i })).not.toBeInTheDocument()
  })

  it('重试操作失败（非 2xx）时显示错误信息', async () => {
    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === '/api/afk/snapshot') return new Response(JSON.stringify(SNAPSHOT), { status: 200 })
      if (url.startsWith('/api/afk/demo-1/log')) return new Response(JSON.stringify({ log: null }), { status: 200 })
      if (url.startsWith('/api/afk/demo-1/retry') && opts?.method === 'POST') {
        return new Response(JSON.stringify({ ok: false, error: 'retry boom' }), { status: 400 })
      }
      throw new Error(`unexpected ${url}`)
    }) as unknown as typeof fetch
    renderAfk()
    await waitFor(() => expect(screen.getByText('demo-1')).toBeInTheDocument())
    fireEvent.click(screen.getByText('demo-1'))
    const retryBtn = await screen.findByRole('button', { name: /重试|Retry/i })
    fireEvent.click(retryBtn)
    await waitFor(() => expect(screen.getByText(/重试失败|操作失败|error|Error/i)).toBeInTheDocument())
  })

  it('挂队表单：填 change 名点"挂队" → 真 POST /enqueue，成功后真 refetch 快照且清空输入框', async () => {
    let snapshotCalls = 0
    let enqueueBody: unknown = null
    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === '/api/afk/snapshot') {
        snapshotCalls += 1
        return new Response(JSON.stringify(SNAPSHOT), { status: 200 })
      }
      if (url === '/api/afk/new-change/enqueue' && opts?.method === 'POST') {
        enqueueBody = JSON.parse(opts.body as string)
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      throw new Error(`unexpected ${url}`)
    }) as unknown as typeof fetch
    renderAfk()
    await waitFor(() => expect(screen.getByText('demo-2')).toBeInTheDocument())
    expect(snapshotCalls).toBe(1)
    const input = screen.getByPlaceholderText(/change 名|change name/i)
    fireEvent.change(input, { target: { value: 'new-change' } })
    fireEvent.click(screen.getByRole('button', { name: /挂队|Enqueue/i }))
    await waitFor(() => expect(enqueueBody).toEqual({ root: expect.any(String) }))
    await waitFor(() => expect(snapshotCalls).toBe(2))
    expect((input as HTMLInputElement).value).toBe('')
  })

  it('挂队失败（非 2xx）→ 显示错误信息，不清空输入框', async () => {
    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === '/api/afk/snapshot') return new Response(JSON.stringify(SNAPSHOT), { status: 200 })
      if (url === '/api/afk/dup/enqueue' && opts?.method === 'POST') {
        return new Response(JSON.stringify({ ok: false, error: "automation 状态已是 'running'，无需重复挂队" }), { status: 400 })
      }
      throw new Error(`unexpected ${url}`)
    }) as unknown as typeof fetch
    renderAfk()
    await waitFor(() => expect(screen.getByText('demo-2')).toBeInTheDocument())
    const input = screen.getByPlaceholderText(/change 名|change name/i)
    fireEvent.change(input, { target: { value: 'dup' } })
    fireEvent.click(screen.getByRole('button', { name: /挂队|Enqueue/i }))
    await waitFor(() => expect(screen.getByText(/无需重复挂队|挂队失败|Enqueue failed/i)).toBeInTheDocument())
    expect((input as HTMLInputElement).value).toBe('dup')
  })

  it('输入框为空时点"挂队" → 不发请求（前端最基本的非空校验，不靠 server 兜底一个空字符串 name）', async () => {
    const calls: string[] = []
    global.fetch = vi.fn(async (url: string) => {
      calls.push(url)
      if (url === '/api/afk/snapshot') return new Response(JSON.stringify(SNAPSHOT), { status: 200 })
      throw new Error(`unexpected ${url}`)
    }) as unknown as typeof fetch
    renderAfk()
    await waitFor(() => expect(screen.getByText('demo-2')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /挂队|Enqueue/i }))
    await waitFor(() => expect(calls).toEqual(['/api/afk/snapshot']))
  })

  it('中英切换：英文下渲染英文空态提示（此前面板完全不走 t()）', async () => {
    localStorage.setItem('pipeline-dashboard-lang', 'en')
    global.fetch = vi.fn(async (url: string) => {
      if (url === '/api/afk/snapshot') {
        return new Response(
          JSON.stringify({ generated_at: '', scheduler: { status: 'idle', queued: 0, running: 0, merged: 0, failed: 0, conflict: 0, paused: 0, total: 0, message: '' }, lanes: { queued: [], merged: [], failed: [], conflict: [], running: [], paused: [] }, cards: [] }),
          { status: 200 },
        )
      }
      throw new Error(`unexpected ${url}`)
    }) as unknown as typeof fetch
    renderAfk()
    await waitFor(() => expect(screen.getByText('Select a change to see details')).toBeInTheDocument())
  })
})
