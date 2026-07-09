import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
  // G18 后语义：零项目快照会渲染教学 onboarding 而非收件箱——默认桩子给一个带
  // 非 gate change 的项目，让"默认落地=收件箱（空态）"这批既有断言的语境继续成立；
  // 零项目路径由下方专门的 onboarding 用例覆盖。
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/snapshot') {
        return { ok: true, json: async () => makeSnapshot([makeProject('/repo', [makeChange('seed-c', 'build')])]) }
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

describe('App 注册对话框（评审 P0-5：陷阱修复——迁移前无 role/无取消/Esc 与 backdrop 点击都不关）', () => {
  it('打开注册对话框 → 有「取消」按钮、按 Esc 对话框消失、焦点回到「＋」钮', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByTestId('inbox-view')

    const plusBtn = screen.getByTestId('project-register')
    await user.click(plusBtn)
    expect(await screen.findByTestId('register-dialog')).toBeInTheDocument()

    // 取消按钮存在（迁移前这个对话框没有任何取消入口——无路可退陷阱）
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument()

    // Esc 关闭
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('register-dialog')).toBeNull()

    // 焦点归位到打开前的触发元素（Dialog 卸载归位契约）
    expect(document.activeElement).toBe(plusBtn)
  })

  it('点「取消」按钮同样能关闭注册对话框', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByTestId('inbox-view')
    await user.click(screen.getByTestId('project-register'))
    await screen.findByTestId('register-dialog')

    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByTestId('register-dialog')).toBeNull()
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

describe('App G18 教学空状态', () => {
  it('零项目快照 → 全视图替换为注册 onboarding（而非收件箱空态）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/snapshot') return { ok: true, json: async () => makeSnapshot([]) }
        if (url.startsWith('/api/workflows?root=')) return { ok: true, json: async () => ({ names: [] }) }
        throw new Error(`unexpected fetch ${url}`)
      }),
    )
    render(<App />)
    expect(await screen.findByTestId('onboard-no-project')).toBeInTheDocument()
    expect(screen.queryByTestId('inbox-view')).toBeNull()
  })

  it('有项目零 change → 收件箱替换为新建引导 onboarding', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/snapshot') return { ok: true, json: async () => makeSnapshot([makeProject('/repo', [])]) }
        if (url.startsWith('/api/workflows?root=')) return { ok: true, json: async () => ({ names: [] }) }
        throw new Error(`unexpected fetch ${url}`)
      }),
    )
    render(<App />)
    expect(await screen.findByTestId('onboard-no-change')).toBeInTheDocument()
    // 打开新建对话框入口真的接线
    fireEvent.click(screen.getByTestId('onboard-new-change'))
    expect(await screen.findByTestId('newchange-dialog')).toBeInTheDocument()
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

describe('App 断线横幅 + 重连（评审 P2-13，Task 5）', () => {
  it('connected=true（默认）时不渲染 offline-banner', async () => {
    render(<App />)
    await screen.findByTestId('inbox-view')
    expect(screen.queryByTestId('offline-banner')).toBeNull()
  })

  it('SSE onerror → connected=false → 渲染 offline-banner（role=status，文案含"连接断开"）', async () => {
    render(<App />)
    await screen.findByTestId('inbox-view')
    const es = lastEventSource()
    expect(es).toBeDefined()
    act(() => {
      es!.emit('error', '')
    })
    const banner = await screen.findByTestId('offline-banner')
    expect(banner).toHaveAttribute('role', 'status')
    expect(banner.textContent).toContain('连接断开')
  })

  it('点「重连」：新发起一次 GET /api/snapshot + 重建一条新 SSE 订阅（不复用失效的旧连接）', async () => {
    render(<App />)
    await screen.findByTestId('inbox-view')
    const es = lastEventSource()
    act(() => {
      es!.emit('error', '')
    })
    await screen.findByTestId('offline-banner')

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    const before = fetchMock.mock.calls.filter((c: unknown[]) => c[0] === '/api/snapshot').length

    fireEvent.click(screen.getByTestId('offline-reconnect'))

    await waitFor(() => {
      const after = fetchMock.mock.calls.filter((c: unknown[]) => c[0] === '/api/snapshot').length
      expect(after).toBe(before + 1)
    })
    expect(lastEventSource()).not.toBe(es)
  })
})

describe('App currentRoot 聚合选择（D5/G19③：currentRoot 空串是全应用聚合的唯一表示，Task 5）', () => {
  it('点切换器「全部项目」→ currentRoot 变为空串并保持（不被 roots[0] 兜底逻辑吃回去）', async () => {
    render(<App />)
    await screen.findByTestId('inbox-view')
    const es = lastEventSource()
    const next = makeSnapshot([
      makeProject('/repo-a', [makeChange('a1', 'build')]),
      makeProject('/repo-b', [makeChange('b1', 'build')]),
    ])
    act(() => {
      es!.emit('snapshot', JSON.stringify(next))
    })
    await waitFor(() => expect(screen.getByTestId('project-switcher').textContent).toContain('repo-a'))

    fireEvent.click(screen.getByTestId('project-switcher'))
    fireEvent.click(screen.getByTestId('project-item-all'))
    expect(screen.getByTestId('project-switcher').textContent).toContain('全部项目')

    // 再来一帧快照（模拟后台刷新）：聚合选择必须继续保持，不能被"空串当没设置"的旧兜底吃回去。
    act(() => {
      es!.emit('snapshot', JSON.stringify(next))
    })
    expect(screen.getByTestId('project-switcher').textContent).toContain('全部项目')
  })

  it('localStorage 记忆的聚合偏好（空串）跨刷新保持', async () => {
    localStorage.setItem('pipeline-dashboard-root', '')
    render(<App />)
    await screen.findByTestId('inbox-view')
    const es = lastEventSource()
    const next = makeSnapshot([
      makeProject('/repo-a', [makeChange('a1', 'build')]),
      makeProject('/repo-b', [makeChange('b1', 'build')]),
    ])
    act(() => {
      es!.emit('snapshot', JSON.stringify(next))
    })
    await waitFor(() => expect(screen.getByTestId('project-switcher')).toBeInTheDocument())
    expect(screen.getByTestId('project-switcher').textContent).toContain('全部项目')
  })
})

describe('App 注销项目（评审 P2-13，Task 5）', () => {
  function stubTwoProjects() {
    return vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/snapshot') {
        return {
          ok: true,
          json: async () =>
            makeSnapshot([
              makeProject('/repo-a', [makeChange('a1', 'build')]),
              makeProject('/repo-b', [makeChange('b1', 'build')]),
            ]),
        }
      }
      if (url.startsWith('/api/workflows?root=')) return { ok: true, json: async () => ({ names: [] }) }
      if (url.startsWith('/api/projects?root=') && init?.method === 'DELETE') {
        return { ok: true, json: async () => ({}) }
      }
      throw new Error(`unexpected fetch ${url}`)
    })
  }

  it('注销当前项目成功 → DELETE 命中正确 root + currentRoot 切到聚合（切换器显示"全部项目"）', async () => {
    const fetchMock = stubTwoProjects()
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)
    await screen.findByTestId('inbox-view')
    // D5：无 localStorage 记忆时取第一个已注册项目
    expect(screen.getByTestId('project-switcher').textContent).toContain('repo-a')

    fireEvent.click(screen.getByTestId('project-switcher'))
    fireEvent.click(screen.getByTestId('project-unregister-repo-a'))
    const dialog = await screen.findByTestId('unregister-confirm')
    fireEvent.click(within(dialog).getByRole('button', { name: '确认注销' }))

    await waitFor(() => {
      const delCall = fetchMock.mock.calls.find(
        ([u, i]) => String(u).startsWith('/api/projects?root=') && i?.method === 'DELETE',
      )
      expect(delCall).toBeDefined()
      expect(String(delCall![0])).toContain(encodeURIComponent('/repo-a'))
    })
    await waitFor(() => expect(screen.getByTestId('project-switcher').textContent).toContain('全部项目'))
  })

  it('注销非当前项目成功 → currentRoot 不变', async () => {
    const fetchMock = stubTwoProjects()
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)
    await screen.findByTestId('inbox-view')
    expect(screen.getByTestId('project-switcher').textContent).toContain('repo-a')

    fireEvent.click(screen.getByTestId('project-switcher'))
    fireEvent.click(screen.getByTestId('project-unregister-repo-b'))
    const dialog = await screen.findByTestId('unregister-confirm')
    fireEvent.click(within(dialog).getByRole('button', { name: '确认注销' }))

    await waitFor(() => {
      const delCall = fetchMock.mock.calls.find(
        ([u, i]) => String(u).startsWith('/api/projects?root=') && i?.method === 'DELETE',
      )
      expect(delCall).toBeDefined()
    })
    expect(screen.getByTestId('project-switcher').textContent).toContain('repo-a')
  })
})
