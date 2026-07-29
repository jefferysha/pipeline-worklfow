import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App, ErrorBoundary } from './App'
import { I18nProvider } from './i18n'
import { lastEventSource, resetEventSources } from './test-setup'
import { makeChange, makeProject, makeSnapshot } from './testkit'

// T17（计划 2026-07-11-v5-interaction-rebuild）：IA 收敛三视图。旧断言意图迁移表：
//   · 「一级导航恰 4 项（3+下拉触发）」→「恰 3 项：收件箱/进度/工作台」
//   · 「点看板→board-view / 点设置→settings-view」→「点进度→progress-view / 点工作台→workbench-view」
//   · 「注册对话框（register-dialog）三条」→ 注册 UI 退役（决议#7），迁移为 0 渲染断言；
//     零项目教学态断言收进 G18 describe（教学文案 + 无表单 + 无幽灵命令）
//   · 「工作台下拉→workflow 编辑器（nav-workflows）」→ 工作台是单一视图，直达断言
//   · 新增：视图记忆 localStorage 兜底（旧值 board/settings → inbox）、聚合语境进度渲染护栏
// v9-flowdeck 收件箱退役（叠加迁移）：
//   · 「默认落地=收件箱」→「默认落地=进度」；导航恰 2 项，nav-inbox 0 渲染
//   · 「收件箱空态/卡片/徽标（inbox-empty/inbox-card/inbox-badge）」→ 徽标断言迁 progress-badge，
//     空态「去进度」按钮用例整体删除（视图不复存在）；视图记忆兜底目标 inbox → progress
beforeEach(() => {
  localStorage.clear()
  resetEventSources()
  // 大多数既有 App 用例关注已选项目内行为，统一从显式 root 深链进入；无选择契约用例会覆盖 URL。
  window.history.replaceState({}, '', '/?root=%2Frepo')
  try {
    delete document.documentElement.dataset.theme
  } catch {
    /* ignore */
  }
  // 初始 GET /api/snapshot → 单项目一张非 gate 卡（默认落地=进度，无待拍板徽标语境）；
  // /api/workflows、/api/hooks、/api/loops/snapshot 三个分支喂 WorkbenchView 挂载时的真 fetch
  // （names 空 → 选中 default 零网络投影；hooks/loops 给合法空数据，不迫使工作台走错误分支）。
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/snapshot') {
        return { ok: true, json: async () => makeSnapshot([makeProject('/repo', [makeChange('seed-c', 'build')])]) }
      }
      if (url.startsWith('/api/workflows?root=')) {
        return { ok: true, json: async () => ({ names: [] }) }
      }
      if (url.startsWith('/api/hooks?root=')) {
        return { ok: true, json: async () => ({ ok: true, hooks: [], matrix: {} }) }
      }
      if (url === '/api/loops/snapshot') {
        return { ok: true, json: async () => ({ generated_at: '2026-07-11T00:00:00Z', rows: [] }) }
      }
      throw new Error(`unexpected fetch ${url}`)
    }),
  )
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('App 默认落地 = 进度（v9-flowdeck：收件箱退役，进度=唯一在制面）', () => {
  it('首屏渲染进度视图，而非工作台；收件箱视图不复存在', async () => {
    render(<App />)
    expect(await screen.findByTestId('progress-view')).toBeInTheDocument()
    expect(screen.queryByTestId('inbox-view')).toBeNull()
    expect(screen.queryByTestId('workbench-view')).toBeNull()
  })

  it('主导航只保留项目 / 进度 / AFK / 工作台 / 机器 / 宿主计划；状态、主题与语言收进设置', async () => {
    render(<App />)
    await screen.findByTestId('progress-view')
    const nav = screen.getByTestId('primary-nav')
    expect(within(nav).getAllByRole('button')).toHaveLength(6)
    expect(screen.getByTestId('nav-afk')).toBeInTheDocument()
    // 项目上下文不再占用全局顶栏；项目入口只保留在 rail。
    expect(screen.getByTestId('nav-projects')).toBeInTheDocument()
    expect(screen.queryByTestId('app-header')).toBeNull()
    expect(screen.queryByTestId('header-all-projects')).toBeNull()
    expect(document.querySelector('footer')).toBeNull()
    expect(screen.queryByTestId('nav-inbox')).toBeNull()
    expect(screen.queryByTestId('nav-board')).toBeNull()
    expect(screen.getByTestId('nav-settings')).toBeInTheDocument()
    expect(screen.queryByTestId('conn-indicator')).toBeNull()
  })

  it('主内容为移动底栏和 safe area 预留空间', async () => {
    render(<App />)
    await screen.findByTestId('progress-view')
    const main = screen.getByTestId('app-main')
    expect(main.className).toContain('mobile:pb-[calc(88px+env(safe-area-inset-bottom))]')
    expect(screen.getByTestId('app-navigation')).toHaveAttribute('data-responsive', 'rail-to-bottom')
  })

  it('首个可聚焦控件是跳到主内容的链接，目标 main 可被程序聚焦', async () => {
    render(<App />)
    await screen.findByTestId('progress-view')
    const skip = screen.getByRole('link', { name: '跳到主要内容' })
    expect(skip).toHaveAttribute('href', '#main-content')
    const main = screen.getByTestId('app-main')
    expect(main).toHaveAttribute('id', 'main-content')
    expect(main).toHaveAttribute('tabindex', '-1')
    await userEvent.tab()
    expect(skip).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(main).toHaveFocus()
  })

  it('点 rail「项目」入口 → 渲染 ProjectsView（同 header「所有项目」落点）', async () => {
    render(<App />)
    await screen.findByTestId('progress-view')
    fireEvent.click(screen.getByTestId('nav-projects'))
    expect(await screen.findByTestId('projects-view')).toBeInTheDocument()
    expect(screen.queryByTestId('project-register')).toBeNull()
    expect(screen.queryByTestId('project-register-path')).toBeNull()
  })
})

describe('App 宿主计划机器级视图', () => {
  it('零项目时仍可通过 hostPlan 深链加载，不落入项目 Onboarding', async () => {
    window.history.replaceState({}, '', '/?view=hostPlan')
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/snapshot') {
        return { ok: true, json: async () => makeSnapshot([]) }
      }
      if (url === '/api/host-targets') {
        return {
          ok: true,
          json: async () => ({ schema_version: 'host-target-plan/v1', targets: [] }),
        }
      }
      throw new Error(`unexpected fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    expect(await screen.findByTestId('host-plan-view')).toBeInTheDocument()
    expect(screen.getByTestId('host-plan-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('onboard-no-project')).toBeNull()
    expect(fetchMock.mock.calls.map(([url]) => url)).toContain('/api/host-targets')
  })

  it('全局 snapshot 首次失败时仍渲染独立 Host Plan，不被 snapshot 错误页遮蔽', async () => {
    window.history.replaceState({}, '', '/?view=hostPlan')
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/snapshot') {
        return {
          ok: false,
          status: 500,
          json: async () => ({ ok: false, error: 'snapshot 暂时不可用' }),
        }
      }
      if (url === '/api/host-targets') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ schema_version: 'host-target-plan/v1', targets: [] }),
        }
      }
      throw new Error(`unexpected fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    expect(await screen.findByTestId('host-plan-view')).toBeInTheDocument()
    expect(screen.getByTestId('host-plan-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('snapshot-error')).toBeNull()
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(
      expect.arrayContaining(['/api/snapshot', '/api/host-targets']),
    )
  })
})

describe('App 初始 snapshot 错误恢复', () => {
  it('首次 500 显示明确错误与重试入口，重试成功后恢复项目总览', async () => {
    window.history.replaceState({}, '', '/?view=projects')
    let snapshotAttempts = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url !== '/api/snapshot') throw new Error(`unexpected fetch ${url}`)
      snapshotAttempts += 1
      if (snapshotAttempts === 1) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ ok: false, error: 'snapshot 暂时不可用' }),
        }
      }
      return {
        ok: true,
        json: async () => makeSnapshot([makeProject('/repo', [makeChange('recovered', 'verify')])]),
      }
    }))

    render(<App />)

    const errorState = await screen.findByTestId('snapshot-error')
    expect(errorState).toHaveAttribute('role', 'alert')
    expect(errorState).toHaveTextContent('快照获取失败（500）')
    const retry = screen.getByRole('button', { name: '重试加载' })

    fireEvent.click(retry)

    expect(await screen.findByTestId('projects-view')).toBeInTheDocument()
    expect(await screen.findByTestId('project-row-repo')).toBeInTheDocument()
    expect(screen.queryByTestId('snapshot-error')).toBeNull()
    expect(snapshotAttempts).toBe(2)
  })
})

describe('App URL 深链路（可复制的视图 / 项目 / Change 现场）', () => {
  it('有已注册项目但 URL 无 root：保持未选择、进入项目总览且不调用 per-root API', async () => {
    window.history.replaceState({}, '', '/?debug=1&view=progress')
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/snapshot') {
        return { ok: true, json: async () => makeSnapshot([makeProject('/repo-a', [makeChange('a1', 'build')])]) }
      }
      throw new Error(`unexpected per-root fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    expect(await screen.findByTestId('projects-view')).toBeInTheDocument()
    const params = new URLSearchParams(window.location.search)
    expect(params.get('root')).toBeNull()
    expect(params.get('change')).toBeNull()
    expect(params.get('debug')).toBe('1')
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/snapshot'])
  })

  it('失效 root 深链：清除 root/change 并保持无选择，不重定向首个项目', async () => {
    window.history.replaceState({}, '', '/?debug=1&view=progress&root=%2Fmissing&change=ghost')
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/snapshot') {
        return { ok: true, json: async () => makeSnapshot([makeProject('/repo-a', [makeChange('a1', 'build')])]) }
      }
      throw new Error(`unexpected per-root fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    expect(await screen.findByTestId('projects-view')).toBeInTheDocument()
    const params = new URLSearchParams(window.location.search)
    expect(params.get('root')).toBeNull()
    expect(params.get('change')).toBeNull()
    expect(params.get('debug')).toBe('1')
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/snapshot'])
  })

  it('已登记但不可达的 root 深链也必须清除，不能挂载 per-root 视图', async () => {
    window.history.replaceState({}, '', '/?view=progress&root=%2Foffline&change=stale')
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/snapshot') {
        return {
          ok: true,
          json: async () => makeSnapshot([
            makeProject('/offline', [makeChange('stale', 'verify')], {
              ok: false,
              error: 'root 不可达',
            }),
          ]),
        }
      }
      throw new Error(`unexpected per-root fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    expect(await screen.findByTestId('projects-view')).toBeInTheDocument()
    const params = new URLSearchParams(window.location.search)
    expect(params.get('root')).toBeNull()
    expect(params.get('change')).toBeNull()
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/snapshot'])
  })

  it('无项目选择时从跨项目 snapshot 读取自定义 workflow gate，不发 per-root 请求也不误报', async () => {
    window.history.replaceState({}, '', '/?view=projects')
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/snapshot') {
        return {
          ok: true,
          json: async () => makeSnapshot([
            makeProject('/repo-custom', [
              makeChange('review-me', 'review', {
                fields: { workflow: 'compact' },
                workflowRules: {
                  executionModel: 'step-graph',
                  steps: ['review', 'done'],
                  transitions: { review: [{ event: 'approve', to: 'done' }], done: [] },
                  gateByStep: { review: 'review', done: null },
                  labelByStep: { review: '复核', done: '完成' },
                  outputsByStep: { review: [], done: [] },
                },
                workflowExecution: {
                  readinessByTransition: {
                    review: { approve: { ready: true, blockers: [] } },
                    done: {},
                  },
                },
              }),
            ]),
          ]),
        }
      }
      throw new Error(`unexpected per-root fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    const row = await screen.findByTestId('project-row-repo-custom')
    expect(row).toHaveAttribute('data-need', 'true')
    expect(within(row).getByTestId('project-row-repo-custom-stat-need')).toHaveAttribute('data-value', '1')
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/snapshot'])
  })

  it('浏览器返回到无 root URL：经同一选择模型回到项目总览', async () => {
    render(<App />)
    await screen.findByTestId('progress-view')

    window.history.replaceState({}, '', '/?debug=1&view=progress')
    act(() => window.dispatchEvent(new PopStateEvent('popstate')))

    expect(await screen.findByTestId('projects-view')).toBeInTheDocument()
    const params = new URLSearchParams(window.location.search)
    expect(params.get('root')).toBeNull()
    expect(params.get('debug')).toBe('1')
  })

  it('零项目也能通过 view=overview 打开完整概览，不被 onboarding 替换', async () => {
    window.history.replaceState({}, '', '/?view=overview')
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url === '/api/snapshot') return { ok: true, json: async () => makeSnapshot([]) }
      throw new Error(`unexpected fetch ${url}`)
    })

    render(<App />)

    expect(await screen.findByTestId('solution-view')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('让 coding agents 按可验证流程交付')
    expect(screen.queryByTestId('onboard-no-project')).toBeNull()
    expect(new URLSearchParams(window.location.search).get('view')).toBe('overview')
  })

  it('Overview 如实保留本机只读 snapshot 连接，不宣称整页零请求', async () => {
    window.history.replaceState({}, '', '/?view=overview')
    render(<App />)

    expect(await screen.findByTestId('solution-view')).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledWith('/api/snapshot', expect.anything())
    expect(screen.getByText(/概览页不写入项目状态/)).toBeInTheDocument()
    expect(screen.queryByText(/本页不发请求/)).toBeNull()
  })

  it('语言切换同步更新文档 lang 元数据', async () => {
    window.history.replaceState({}, '', '/?view=overview')
    render(<App />)
    await screen.findByTestId('solution-view')

    expect(document.documentElement).toHaveAttribute('lang', 'zh')
    fireEvent.click(screen.getByTestId('nav-settings'))
    fireEvent.click(screen.getByTestId('lang-toggle'))
    await waitFor(() => expect(document.documentElement).toHaveAttribute('lang', 'en'))
  })

  it('带 view/root/change 首次进入：直接打开对应项目的 Change 抽屉', async () => {
    window.history.replaceState({}, '', '/?view=progress&root=%2Frepo&change=seed-c')
    render(<App />)
    expect(await screen.findByTestId('prg9-drawer')).toHaveAttribute('aria-label', 'seed-c')
    expect(new URLSearchParams(window.location.search).get('change')).toBe('seed-c')
  })

  it('macOS /tmp 深链能命中 snapshot 的 /private/tmp canonical root，不回落到首个旧项目', async () => {
    window.history.replaceState({}, '', '/?view=progress&root=%2Ftmp%2Fpipeline-ui-project.V60AOf&change=ui-real-browser')
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url === '/api/snapshot') {
        return {
          ok: true,
          json: async () => makeSnapshot([
            makeProject('/old/demo-project', []),
            makeProject('/private/tmp/pipeline-ui-project.V60AOf', [makeChange('ui-real-browser', 'build')]),
          ]),
        }
      }
      throw new Error(`unexpected fetch ${url}`)
    })
    render(<App />)
    expect(await screen.findByTestId('prg9-drawer')).toHaveAttribute('aria-label', 'ui-real-browser')
    expect(new URLSearchParams(window.location.search).get('root')).toBe('/private/tmp/pipeline-ui-project.V60AOf')
  })

  it('进入项目总览会更新可复制 URL，并显式清除项目 root', async () => {
    render(<App />)
    await screen.findByTestId('progress-view')
    fireEvent.click(screen.getByTestId('nav-projects'))
    const params = new URLSearchParams(window.location.search)
    expect(params.get('view')).toBe('projects')
    expect(params.get('root')).toBeNull()
  })
})

describe('App 视图切换（v9-flowdeck 两视图接线）', () => {
  it('点工作台 → 渲染 WorkbenchView（直达，无下拉）；点进度切回 ProgressView', async () => {
    render(<App />)
    await screen.findByTestId('progress-view')
    fireEvent.click(screen.getByTestId('nav-workbench'))
    expect(await screen.findByTestId('workbench-view')).toBeInTheDocument()
    expect(screen.queryByTestId('workbench-menu')).toBeNull()
    fireEvent.click(screen.getByTestId('nav-progress'))
    expect(screen.getByTestId('progress-view')).toBeInTheDocument()
  })

  it('项目非零但全部不可达（ok=false）：工作台渲染诚实空态，不拿不可达 root 挂 WorkbenchView（v10c：不再经聚合语境）', async () => {
    localStorage.setItem('tenon-dashboard-view', 'workbench') // 直接落工作台，回落链此时全落空
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url === '/api/snapshot') {
        return { ok: true, json: async () => makeSnapshot([makeProject('/repo', [], { ok: false })]) }
      }
      throw new Error(`unexpected fetch ${url}`)
    })
    render(<App />)
    expect(await screen.findByTestId('wb-no-root')).toHaveTextContent('没有可读取的项目')
    expect(screen.queryByTestId('workbench-view')).toBeNull()
  })

})

describe('App 视图记忆（localStorage 旧值兜底回 progress，收件箱退役）', () => {
  it('记忆值是退役视图（board）→ 落地进度而非崩溃/空渲染', async () => {
    localStorage.setItem('tenon-dashboard-view', 'board')
    render(<App />)
    expect(await screen.findByTestId('progress-view')).toBeInTheDocument()
  })

  it('记忆值是刚退役的 inbox → 同样兜底回进度，不渲染收件箱', async () => {
    localStorage.setItem('tenon-dashboard-view', 'inbox')
    render(<App />)
    expect(await screen.findByTestId('progress-view')).toBeInTheDocument()
    expect(screen.queryByTestId('inbox-view')).toBeNull()
  })

  it('记忆值是合法视图（workbench）→ 直接落地工作台', async () => {
    localStorage.setItem('tenon-dashboard-view', 'workbench')
    render(<App />)
    expect(await screen.findByTestId('workbench-view')).toBeInTheDocument()
  })

  it('切视图写回记忆：点工作台后 localStorage 存 workbench', async () => {
    render(<App />)
    await screen.findByTestId('progress-view')
    fireEvent.click(screen.getByTestId('nav-workbench'))
    expect(localStorage.getItem('tenon-dashboard-view')).toBe('workbench')
  })

  it('品牌 Overview 不覆盖上一次运营视图记忆', async () => {
    render(<App />)
    await screen.findByTestId('progress-view')
    fireEvent.click(screen.getByTestId('nav-projects'))
    expect(localStorage.getItem('tenon-dashboard-view')).toBe('projects')

    fireEvent.click(screen.getByTestId('nav-overview'))
    expect(await screen.findByTestId('solution-view')).toBeInTheDocument()
    expect(localStorage.getItem('tenon-dashboard-view')).toBe('projects')
  })
})

describe('App 注册 UI 退役（T17 决议#7：tenon init 自动登记，注册入口全删）', () => {
  it('单项目语境无 ＋ 注册按钮、无注册对话框入口', async () => {
    render(<App />)
    await screen.findByTestId('progress-view')
    expect(screen.queryByTestId('project-register')).toBeNull()
    expect(screen.queryByTestId('register-dialog')).toBeNull()
  })
})

describe('App SSE 实时更新（真 EventSource stub → 组件真更新，非 mock 返回）', () => {
  it('emit 含复核阶段卡的快照 → 进度徽标由无到 1，新 change 行真渲染', async () => {
    render(<App />)
    await screen.findByTestId('progress-view')
    // 初始快照只有一张非 gate 卡 → 无待拍板徽标
    expect(screen.queryByTestId('progress-badge')).toBeNull()

    const es = lastEventSource()
    expect(es).toBeDefined()
    // T7 准入修订：verify 卡计入待拍板必须三轨证据齐（缺产出判「等产出」不计）。
    const next = makeSnapshot([
      makeProject('/repo', [
        makeChange('needs-review', 'verify', {
          fields: { verify_result: 'pass', agent_review_result: 'pass', codex_review_result: 'pass' },
        }),
      ]),
    ])
    act(() => {
      es!.emit('snapshot', JSON.stringify(next))
    })

    // 组件真更新：进度徽标计数 1（selectInbox 口径），新 change 名出现在进度列表
    //（可能同时出现在行与详情等多处，getAllByText 断言"至少一处"）。
    await waitFor(() => expect(screen.getByTestId('progress-badge').textContent).toBe('1'))
    expect(screen.getAllByText('needs-review').length).toBeGreaterThan(0)
  })

  it('已选项目从注册快照移除：清除上下文，不把后续请求切到其他项目', async () => {
    render(<App />)
    await screen.findByTestId('progress-view')
    const es = lastEventSource()

    act(() => {
      es!.emit('snapshot', JSON.stringify(makeSnapshot([makeProject('/repo-b', [makeChange('b1', 'build')])])))
    })

    expect(await screen.findByTestId('projects-view')).toBeInTheDocument()
    const params = new URLSearchParams(window.location.search)
    expect(params.get('root')).toBeNull()
    expect(screen.getByTestId('project-row-repo-b')).toBeInTheDocument()
    expect(screen.queryByTestId('progress-view')).toBeNull()
  })
})

describe('App 深浅色自适应 + i18n', () => {
  it('主题切换在 <html data-theme> 落值', async () => {
    render(<App />)
    await screen.findByTestId('progress-view')
    // 初始应用主题（默认 light）
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'))
    fireEvent.click(screen.getByTestId('nav-settings'))
    fireEvent.click(screen.getByTestId('theme-toggle'))
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'))
  })

  it('语言切换 zh→en：一级导航文案真更新', async () => {
    render(<App />)
    await screen.findByTestId('progress-view')
    const nav = screen.getByTestId('primary-nav')
    expect(nav.textContent).toContain('进度')
    fireEvent.click(screen.getByTestId('nav-settings'))
    fireEvent.click(screen.getByTestId('lang-toggle'))
    expect(nav.textContent).toContain('Progress')
    expect(nav.textContent).not.toContain('变更')
  })
})

describe('App G18 教学空状态（T17 起纯教学态）', () => {
  it('零项目快照 → 全视图替换为教学 onboarding：无注册表单、CLI 是 tenon init、无幽灵命令', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/snapshot') return { ok: true, json: async () => makeSnapshot([]) }
        if (url.startsWith('/api/workflows?root=')) return { ok: true, json: async () => ({ names: [] }) }
        throw new Error(`unexpected fetch ${url}`)
      }),
    )
    render(<App />)
    const ob = await screen.findByTestId('onboard-no-project')
    expect(screen.queryByTestId('progress-view')).toBeNull()
    // 决议#7 + T2：注册表单退役，教学 CLI 为 tenon init（自动登记），幽灵命令清除
    expect(screen.queryByTestId('project-register-form')).toBeNull()
    expect(screen.queryByTestId('project-register-path')).toBeNull()
    expect(screen.queryByTestId('project-register-submit')).toBeNull()
    expect(screen.getByTestId('onboard-cli').textContent).toContain('tenon init')
    expect(ob.textContent).not.toContain('projects add')
  })

  it('有项目零 change → 进度替换为 Route Lock 新建入口，并保留 init CLI 退路', async () => {
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
    expect(screen.getByTestId('onboard-cli').textContent).toContain('tenon init')
    fireEvent.click(screen.getByTestId('onboard-new-change'))
    expect(await screen.findByTestId('create-change-dialog')).toBeInTheDocument()
  })
})

describe('App currentRoot 语义（只消费显式选择）', () => {
  it('双项目快照：进度徽标只计显式选择项目的 gate 卡', async () => {
    window.history.replaceState({}, '', '/?view=progress&root=%2Frepo-a')
    // T7 准入修订：证据齐的 gate 卡才计入徽标（判据在 inbox.test.tsx 钉，这里只验 currentRoot 过滤）。
    const evidenceOk = { verify_result: 'pass', agent_review_result: 'pass', codex_review_result: 'pass' }
    const next = makeSnapshot([
      makeProject('/repo-a', [makeChange('a-verify', 'verify', { fields: { ...evidenceOk } })]),
      makeProject('/repo-b', [
        makeChange('b-verify', 'verify', { fields: { ...evidenceOk } }),
        makeChange('b-spec', 'spec', { fields: { design_doc: 'docs/d.md', plan: 'docs/p.md' } }),
      ]),
    ])
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/snapshot') return { ok: true, json: async () => next }
      throw new Error(`unexpected fetch ${url}`)
    }))
    render(<App />)
    await screen.findByTestId('progress-view')
    await waitFor(() => expect(screen.getByTestId('progress-badge').textContent).toBe('1'))
    // a-verify 可能同时出现在行与详情等多处，getAllByText 断言"至少一处"
    //（意图不变：currentRoot 过滤后只看得到显式选择项目的卡）。
    expect(screen.getAllByText('a-verify').length).toBeGreaterThan(0)
    expect(screen.queryByText('b-verify')).toBeNull()
  })
})

describe('App v10c 契约护栏（旧聚合偏好 root=\'\' + 进度视图 → 落「项目」总览页，不渲染聚合）', () => {
  it("旧聚合偏好（root='')停在 progress → 自动落项目总览页，两项目卡都在，不出聚合进度行", async () => {
    localStorage.setItem('tenon-dashboard-root', '') // 旧聚合偏好（本次重构退役）
    localStorage.setItem('tenon-dashboard-view', 'progress')
    window.history.replaceState({}, '', '/?view=progress')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
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
        throw new Error(`unexpected fetch ${url}`)
      }),
    )
    render(<App />)
    // 契约：progress 恒单项目——旧聚合偏好被 useEffect 落到「项目」总览页（不再渲染聚合进度）。
    expect(await screen.findByTestId('projects-view')).toBeInTheDocument()
    expect(screen.getByTestId('project-row-repo-a')).toBeInTheDocument()
    expect(screen.getByTestId('project-row-repo-b')).toBeInTheDocument()
    // 聚合进度行不再存在（画布/列表都归单项目进度页）
    expect(screen.queryByTestId('prg9-row-a1')).toBeNull()
  })

  it('点项目卡钻进单项目进度页：setCurrentRoot + 切 progress，只看该项目', async () => {
    localStorage.setItem('tenon-dashboard-view', 'projects')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
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
        throw new Error(`unexpected fetch ${url}`)
      }),
    )
    const push = vi.spyOn(window.history, 'pushState')
    render(<App />)
    fireEvent.click(await screen.findByTestId('project-row-repo-b'))
    expect(await screen.findByTestId('progress-view')).toBeInTheDocument()
    // v10c：下方列表已退役，单项目 change 现由画布 change 卡承载（prg-cv-chg-*）。
    await waitFor(() => expect(screen.getByTestId('prg-cv-chg-b1')).toBeInTheDocument())
    expect(screen.queryByTestId('prg-cv-chg-a1')).toBeNull()
    expect(push).toHaveBeenCalled()
    expect(new URLSearchParams(window.location.search).get('root')).toBe('/repo-b')
  })

  it('未选择项目时不把首个项目写进 URL，只停留在项目总览', async () => {
    window.history.replaceState({}, '', '/?view=progress')
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/snapshot') {
        return { ok: true, json: async () => makeSnapshot([
          makeProject('/repo-a', [makeChange('a1', 'build')]),
          makeProject('/repo-b', [makeChange('b1', 'build')]),
        ]) }
      }
      throw new Error(`unexpected fetch ${url}`)
    }))
    render(<App />)
    expect(await screen.findByTestId('projects-view')).toBeInTheDocument()
    expect(new URLSearchParams(window.location.search).get('root')).toBeNull()
  })
})

describe('App 调试外壳退役', () => {
  it('高级调试面与 server 版本不再占用全局页脚', async () => {
    render(<App />)
    await screen.findByTestId('progress-view')
    expect(screen.queryByTestId('advanced-panel')).toBeNull()
    expect(document.querySelector('footer')).toBeNull()
    const nav = screen.getByTestId('primary-nav')
    expect(nav.textContent).not.toMatch(/流量|traffic|高级/i)
  })
})

describe('App 断线横幅 + 重连（评审 P2-13，Task 5）', () => {
  it('connected=true（默认）时不渲染 offline-banner', async () => {
    render(<App />)
    await screen.findByTestId('progress-view')
    expect(screen.queryByTestId('offline-banner')).toBeNull()
  })

  it('SSE onerror → connected=false → 渲染 offline-banner（role=status，文案含"连接断开"）', async () => {
    render(<App />)
    await screen.findByTestId('progress-view')
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
    await screen.findByTestId('progress-view')
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

  // 评审修复（担忧①）：重连此前另开一条独立订阅，不碰 useSnapshot 内部真正持有 connected
  // 的那条订阅——点了重连横幅不会自愈。下沉到 hook 本体后，新连接收到帧时 connected 走 hook
  // 既有的置位逻辑自然翻正，横幅必须从 DOM 消失（而不是像修复前那样常驻，直到原订阅自己恢复）。
  it('点「重连」→ 新连接送帧后，offline-banner 从 DOM 消失（重连下沉 useSnapshot 本体）', async () => {
    render(<App />)
    await screen.findByTestId('progress-view')
    const es = lastEventSource()
    act(() => {
      es!.emit('error', '')
    })
    await screen.findByTestId('offline-banner')

    fireEvent.click(screen.getByTestId('offline-reconnect'))

    const next = lastEventSource()
    expect(next).not.toBe(es)

    act(() => {
      next!.emit('snapshot', JSON.stringify(makeSnapshot([makeProject('/repo', [makeChange('seed-c', 'build')])])))
    })

    await waitFor(() => expect(screen.queryByTestId('offline-banner')).toBeNull())
  })
})

// v10c：聚合语境（currentRoot 空串）整体退役——「点全部项目→空串保持」「空串偏好跨刷新保持」两用例
// 随之删除。切项目能力由 project-switcher 下拉 + 「项目」总览页卡覆盖（见上方护栏 describe）。

describe('App 项目切换（项目总览是唯一入口）', () => {
  it('双项目：从项目总览点 repo-b 后打开该项目进度', async () => {
    render(<App />)
    await screen.findByTestId('progress-view')
    const es = lastEventSource()
    const next = makeSnapshot([
      makeProject('/repo-a', [makeChange('a1', 'build')]),
      makeProject('/repo-b', [makeChange('b1', 'build')]),
    ])
    act(() => {
      es!.emit('snapshot', JSON.stringify(next))
    })
    fireEvent.click(screen.getByTestId('nav-projects'))
    const row = await screen.findByTestId('project-row-repo-b')
    fireEvent.click(row)
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('root')).toBe('/repo-b'))
    expect(screen.getByTestId('progress-view')).toBeInTheDocument()
    expect(screen.queryByTestId('project-switcher')).toBeNull()
  })
})

describe('App 项目自动发现外壳', () => {
  it('不提供全局项目切换、手工注册或注销入口', async () => {
    render(<App />)
    await screen.findByTestId('progress-view')
    for (const id of ['project-switcher', 'project-register-path', 'project-register-submit', 'unregister-confirm']) {
      expect(screen.queryByTestId(id)).toBeNull()
    }
  })
})

// Workbench 只负责编辑工作流，不重复展示在办任务数量；运行中的阶段只保留轻量脉冲提示。
describe('App 工作台运行态接线', () => {
  it('snapshot 中 automation===running 的 change 所在阶段渲染脉冲，不混入任务计数', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url === '/api/snapshot') {
        return {
          ok: true,
          json: async () =>
            makeSnapshot([makeProject('/repo', [makeChange('seed-c', 'build', { fields: { automation: 'running' } })])]),
        }
      }
      if (url.startsWith('/api/workflows?root=')) return { ok: true, json: async () => ({ names: [] }) }
      if (url.startsWith('/api/hooks?root=')) return { ok: true, json: async () => ({ ok: true, hooks: [], matrix: {} }) }
      if (url === '/api/loops/snapshot') return { ok: true, json: async () => ({ generated_at: '2026-07-11T00:00:00Z', rows: [] }) }
      throw new Error(`unexpected fetch ${url}`)
    })
    render(<App />)
    await screen.findByTestId('progress-view')
    fireEvent.click(screen.getByTestId('nav-workbench'))
    await screen.findByTestId('workbench-view')
    expect(screen.getByTestId('wb-flow-gloss-build')).toBeInTheDocument()
    expect(screen.queryByTestId('wb-flow-count-build')).toBeNull()
  })
})

/**
 * Bug3 配套：顶层 ErrorBoundary——任意子树 render 抛错时局部降级兜底，不再整页白屏
 * （client.ts 形状校验是第一道，ErrorBoundary 是兜底第二道：任何未预期的 render 抛错都被接住）。
 */
describe('ErrorBoundary 顶层兜底（render 抛错不白屏）', () => {
  function Boom(): JSX.Element {
    throw new Error('render boom')
  }
  it('子树 render 抛错 → 渲染降级兜底（app-error-boundary）而非白屏', () => {
    // React 会把捕获的错误打到 console.error——本用例故意触发，静音以免污染输出。
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <I18nProvider>
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>
      </I18nProvider>,
    )
    expect(screen.getByTestId('app-error-boundary')).toBeInTheDocument()
    spy.mockRestore()
  })

  it('子树不抛错 → 正常渲染 children，不显兜底', () => {
    render(
      <I18nProvider>
        <ErrorBoundary>
          <div data-testid="ok-child">ok</div>
        </ErrorBoundary>
      </I18nProvider>,
    )
    expect(screen.getByTestId('ok-child')).toBeInTheDocument()
    expect(screen.queryByTestId('app-error-boundary')).toBeNull()
  })
})
