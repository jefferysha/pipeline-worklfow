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
  // 初始 GET /api/snapshot → 空快照（无待办）；新增 /api/workflows?root= 分支（GOAL E8
  // 接线，Task 9）——WorkflowEditorView 挂载时真 fetch 这个端点，桩子按 URL 分派而不是像此前
  // 那样对任意 fetch 调用都无差别返回同一个快照，否则这条新端点会因为拿到快照形状的 body
  // （而非 `{ names: [] }`）而在 `.json()` 之后解析出不匹配的字段。
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/snapshot') {
        return { ok: true, json: async () => makeSnapshot([]) }
      }
      if (url.startsWith('/api/workflows?root=')) {
        return { ok: true, json: async () => ({ names: [] }) }
      }
      throw new Error(`unexpected fetch ${url}`)
    }),
  )
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

describe('App workflow 编辑器接线（GOAL.md E8 收编，Task 9）', () => {
  it('点工作台下拉里的 workflow 编辑器 → 渲染 WorkflowEditorView（列表页）', async () => {
    render(<App />)
    await screen.findByTestId('inbox-view')
    fireEvent.click(screen.getByTestId('nav-workbench'))
    fireEvent.click(screen.getByTestId('nav-workflows'))
    // getByText（单一匹配）在这里会因为“找到多个元素”报错：names 为空数组时
    // WorkflowEditorView 同时渲染标题 `<h2>自定义 workflow</h2>` 和空态文案
    // `还没有自定义 workflow`（后者字面包含前者作为子串），两者都命中这个正则。改用
    // `getAllByText` 断言"至少渲染出一处"——同 RTL 在这种歧义报错里自己建议的修法一致，
    // 断言意图不变（确认 WorkflowEditorView 列表页真的渲染了），不是放松验证强度。
    await waitFor(() => expect(screen.getAllByText(/自定义 workflow|Custom workflows/).length).toBeGreaterThan(0))
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

describe('App currentRoot 语义（D5：吃掉 G14，多项目默认取第一个）', () => {
  it('双项目快照：收件箱徽章只计第一个项目的 gate 卡', async () => {
    render(<App />)
    await screen.findByTestId('inbox-view')
    const es = lastEventSource()
    const next = makeSnapshot([
      makeProject('/repo-a', [makeChange('a-verify', 'verify')]),
      makeProject('/repo-b', [makeChange('b-verify', 'verify'), makeChange('b-spec', 'spec')]),
    ])
    act(() => {
      es!.emit('snapshot', JSON.stringify(next))
    })
    await waitFor(() => expect(screen.getByTestId('inbox-badge').textContent).toBe('1'))
    expect(screen.getByText('a-verify')).toBeInTheDocument()
    expect(screen.queryByText('b-verify')).toBeNull()
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
