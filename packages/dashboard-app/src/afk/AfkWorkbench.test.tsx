import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

beforeEach(() => {
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
    render(<AfkWorkbench />)
    await waitFor(() => expect(screen.getByText('demo-2')).toBeInTheDocument())
    fireEvent.click(screen.getByText('demo-2'))
    await waitFor(() => expect(screen.getByText(/building\.\.\./)).toBeInTheDocument())
  })

  it('paused 的 change 点击后详情区有"重试"按钮，点击真 POST /retry', async () => {
    render(<AfkWorkbench />)
    await waitFor(() => expect(screen.getByText('demo-1')).toBeInTheDocument())
    fireEvent.click(screen.getByText('demo-1'))
    const retryBtn = await screen.findByRole('button', { name: /重试|Retry/i })
    fireEvent.click(retryBtn)
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
      expect(calls.some((c) => String(c[0]).includes('/retry'))).toBe(true)
    })
  })

  it('快照 fetch 失败时显示错误信息，而不是一直卡在空白/加载状态', async () => {
    global.fetch = vi.fn(async (url: string) => {
      if (url === '/api/afk/snapshot') return new Response(JSON.stringify({ ok: false, error: 'boom' }), { status: 500 })
      throw new Error(`unexpected ${url}`)
    }) as unknown as typeof fetch
    render(<AfkWorkbench />)
    await waitFor(() => expect(screen.getByText(/加载失败|错误|error|Error/i)).toBeInTheDocument())
  })

  it('选中 change 后日志 fetch 失败 → 详情区显示错误信息而不是空白', async () => {
    global.fetch = vi.fn(async (url: string) => {
      if (url === '/api/afk/snapshot') return new Response(JSON.stringify(SNAPSHOT), { status: 200 })
      if (url.startsWith('/api/afk/demo-2/log')) return new Response(JSON.stringify({ ok: false, error: 'log boom' }), { status: 500 })
      throw new Error(`unexpected ${url}`)
    }) as unknown as typeof fetch
    render(<AfkWorkbench />)
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
    render(<AfkWorkbench />)
    await waitFor(() => expect(screen.getByText('demo-2')).toBeInTheDocument())
    fireEvent.click(screen.getByText('demo-2'))
    const cancelBtn = await screen.findByRole('button', { name: /取消|Cancel/i })
    fireEvent.click(cancelBtn)
    await waitFor(() => expect(screen.getByText(/取消失败|操作失败|error|Error/i)).toBeInTheDocument())
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
    render(<AfkWorkbench />)
    await waitFor(() => expect(screen.getByText('demo-1')).toBeInTheDocument())
    fireEvent.click(screen.getByText('demo-1'))
    const retryBtn = await screen.findByRole('button', { name: /重试|Retry/i })
    fireEvent.click(retryBtn)
    await waitFor(() => expect(screen.getByText(/重试失败|操作失败|error|Error/i)).toBeInTheDocument())
  })
})
