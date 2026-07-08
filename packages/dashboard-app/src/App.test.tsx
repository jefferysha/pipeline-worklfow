import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import { App } from './App'
import { lastEventSource, resetEventSources } from './test-setup'
import { makeChange, makeProject, makeSnapshot } from './testkit'

beforeEach(() => {
  localStorage.clear()
  resetEventSources()
  try {
    delete document.documentElement.dataset.theme
  } catch {
    /* ignore */
  }
  // 初始 GET /api/snapshot → 空快照（无待办）
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => makeSnapshot([]) }))
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('App 默认落地 = 收件箱（病灶②解法）', () => {
  it('首屏渲染收件箱视图，而非看板', async () => {
    render(<App />)
    expect(await screen.findByTestId('inbox-view')).toBeInTheDocument()
    expect(screen.queryByTestId('board-view')).toBeNull()
  })

  it('一级导航折叠态恰好 4 项：收件箱/看板/设置 + 工作台下拉触发（GOAL.md F1 收尾）', async () => {
    render(<App />)
    await screen.findByTestId('inbox-view')
    const nav = screen.getByTestId('primary-nav')
    expect(within(nav).getAllByRole('button')).toHaveLength(4)
  })
})

describe('App 视图切换', () => {
  it('点看板 → 显示看板视图；点设置 → 设置视图', async () => {
    render(<App />)
    await screen.findByTestId('inbox-view')
    fireEvent.click(screen.getByTestId('nav-board'))
    expect(screen.getByTestId('board-view')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('nav-settings'))
    expect(screen.getByTestId('settings-view')).toBeInTheDocument()
  })
})

describe('App SSE 实时更新（真 EventSource stub → 组件真更新，非 mock 返回）', () => {
  it('emit 含复核相位卡的快照 → 收件箱由空态更新为有卡 + 徽标计数', async () => {
    render(<App />)
    // 初始空态
    expect(await screen.findByTestId('inbox-empty')).toBeInTheDocument()

    const es = lastEventSource()
    expect(es).toBeDefined()
    const next = makeSnapshot([makeProject('/repo', [makeChange('needs-review', 'verify')])])
    act(() => {
      es!.emit('snapshot', JSON.stringify(next))
    })

    // 组件真更新：空态消失、卡片出现、导航徽标计数 1
    await waitFor(() => expect(screen.getByTestId('inbox-card')).toBeInTheDocument())
    expect(screen.getByText('needs-review')).toBeInTheDocument()
    expect(screen.getByTestId('inbox-badge').textContent).toBe('1')
    expect(screen.queryByTestId('inbox-empty')).toBeNull()
  })
})

describe('App 深浅色自适应 + i18n', () => {
  it('主题切换在 <html data-theme> 落值', async () => {
    render(<App />)
    await screen.findByTestId('inbox-view')
    // 初始应用主题（默认 light）
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'))
    fireEvent.click(screen.getByTestId('theme-toggle'))
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'))
  })

  it('语言切换 zh→en：一级导航文案真更新', async () => {
    render(<App />)
    await screen.findByTestId('inbox-view')
    const nav = screen.getByTestId('primary-nav')
    expect(nav.textContent).toContain('收件箱')
    fireEvent.click(screen.getByTestId('lang-toggle'))
    expect(nav.textContent).toContain('Inbox')
    expect(nav.textContent).not.toContain('收件箱')
  })
})

describe('App 高级折叠入口（debug 降级）', () => {
  it('Advanced 折叠面在页脚、不在一级导航', async () => {
    render(<App />)
    await screen.findByTestId('inbox-view')
    expect(screen.getByTestId('advanced-panel')).toBeInTheDocument()
    const nav = screen.getByTestId('primary-nav')
    expect(nav.textContent).not.toMatch(/流量|traffic|高级/i)
  })
})
