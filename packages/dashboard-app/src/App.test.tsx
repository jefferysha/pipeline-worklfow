import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
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

  it('一级导航恰好 2 项：进度 / 工作台（无收件箱入口）', async () => {
    render(<App />)
    await screen.findByTestId('progress-view')
    const nav = screen.getByTestId('primary-nav')
    expect(within(nav).getAllByRole('button')).toHaveLength(2)
    expect(screen.queryByTestId('nav-inbox')).toBeNull()
    expect(screen.queryByTestId('nav-board')).toBeNull()
    expect(screen.queryByTestId('nav-settings')).toBeNull()
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

  it('聚合语境 + 项目非零但全部不可达（ok=false）：工作台渲染诚实空态，不拿空 root 挂 WorkbenchView（T17 评审收口）', async () => {
    localStorage.setItem('pipeline-dashboard-root', '') // 聚合选择——回落链在此才可能全落空
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url === '/api/snapshot') {
        return { ok: true, json: async () => makeSnapshot([makeProject('/repo', [], { ok: false })]) }
      }
      throw new Error(`unexpected fetch ${url}`)
    })
    render(<App />)
    await screen.findByTestId('progress-view')
    fireEvent.click(screen.getByTestId('nav-workbench'))
    expect(await screen.findByTestId('wb-no-root')).toHaveTextContent('没有可读取的项目')
    expect(screen.queryByTestId('workbench-view')).toBeNull()
  })

})

describe('App 视图记忆（localStorage 旧值兜底回 progress，收件箱退役）', () => {
  it('记忆值是退役视图（board）→ 落地进度而非崩溃/空渲染', async () => {
    localStorage.setItem('pipeline-dashboard-view', 'board')
    render(<App />)
    expect(await screen.findByTestId('progress-view')).toBeInTheDocument()
  })

  it('记忆值是刚退役的 inbox → 同样兜底回进度，不渲染收件箱', async () => {
    localStorage.setItem('pipeline-dashboard-view', 'inbox')
    render(<App />)
    expect(await screen.findByTestId('progress-view')).toBeInTheDocument()
    expect(screen.queryByTestId('inbox-view')).toBeNull()
  })

  it('记忆值是合法视图（workbench）→ 直接落地工作台', async () => {
    localStorage.setItem('pipeline-dashboard-view', 'workbench')
    render(<App />)
    expect(await screen.findByTestId('workbench-view')).toBeInTheDocument()
  })

  it('切视图写回记忆：点工作台后 localStorage 存 workbench', async () => {
    render(<App />)
    await screen.findByTestId('progress-view')
    fireEvent.click(screen.getByTestId('nav-workbench'))
    expect(localStorage.getItem('pipeline-dashboard-view')).toBe('workbench')
  })
})

describe('App 注册 UI 退役（T17 决议#7：pipeline init 自动登记，注册入口全删）', () => {
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
})

describe('App 深浅色自适应 + i18n', () => {
  it('主题切换在 <html data-theme> 落值', async () => {
    render(<App />)
    await screen.findByTestId('progress-view')
    // 初始应用主题（默认 light）
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'))
    fireEvent.click(screen.getByTestId('theme-toggle'))
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'))
  })

  it('语言切换 zh→en：一级导航文案真更新', async () => {
    render(<App />)
    await screen.findByTestId('progress-view')
    const nav = screen.getByTestId('primary-nav')
    expect(nav.textContent).toContain('进度')
    fireEvent.click(screen.getByTestId('lang-toggle'))
    expect(nav.textContent).toContain('Progress')
    expect(nav.textContent).not.toContain('进度')
  })
})

describe('App G18 教学空状态（T17 起纯教学态）', () => {
  it('零项目快照 → 全视图替换为教学 onboarding：无注册表单、CLI 是 pipeline init、无幽灵命令', async () => {
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
    // 决议#7 + T2：注册表单退役，教学 CLI 为 pipeline init（自动登记），幽灵命令清除
    expect(screen.queryByTestId('onboard-path')).toBeNull()
    expect(screen.queryByTestId('onboard-register')).toBeNull()
    expect(screen.getByTestId('onboard-cli').textContent).toContain('pipeline init')
    expect(ob.textContent).not.toContain('projects add')
  })

  it('有项目零 change → 进度替换为 init CLI 教学 onboarding（新建入口已退役：dashboard 只读，创建走终端）', async () => {
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
    expect(screen.getByTestId('onboard-cli').textContent).toContain('pipeline init')
    // 产品决策：dashboard 是只读进度面，新建 change 一律走终端——入口按钮与对话框整组退役
    expect(screen.queryByTestId('onboard-new-change')).toBeNull()
    expect(screen.queryByTestId('newchange-dialog')).toBeNull()
  })
})

describe('App currentRoot 语义（D5：吃掉 G14，多项目默认取第一个）', () => {
  it('双项目快照：进度徽标只计第一个项目的 gate 卡', async () => {
    render(<App />)
    await screen.findByTestId('progress-view')
    const es = lastEventSource()
    // T7 准入修订：证据齐的 gate 卡才计入徽标（判据在 inbox.test.tsx 钉，这里只验 currentRoot 过滤）。
    const evidenceOk = { verify_result: 'pass', agent_review_result: 'pass', codex_review_result: 'pass' }
    const next = makeSnapshot([
      makeProject('/repo-a', [makeChange('a-verify', 'verify', { fields: { ...evidenceOk } })]),
      makeProject('/repo-b', [
        makeChange('b-verify', 'verify', { fields: { ...evidenceOk } }),
        makeChange('b-spec', 'spec', { fields: { design_doc: 'docs/d.md', plan: 'docs/p.md' } }),
      ]),
    ])
    act(() => {
      es!.emit('snapshot', JSON.stringify(next))
    })
    await waitFor(() => expect(screen.getByTestId('progress-badge').textContent).toBe('1'))
    // a-verify 可能同时出现在行与详情等多处，getAllByText 断言"至少一处"
    //（意图不变：currentRoot 过滤后只看得到第一个项目的卡）。
    expect(screen.getAllByText('a-verify').length).toBeGreaterThan(0)
    expect(screen.queryByText('b-verify')).toBeNull()
  })
})

describe('App 聚合语境渲染护栏（T17 验收④：currentRoot 空串 → 进度看全部项目）', () => {
  it('聚合 + 进度视图：两个项目的任务行都渲染', async () => {
    localStorage.setItem('pipeline-dashboard-root', '')
    localStorage.setItem('pipeline-dashboard-view', 'progress')
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
    expect(await screen.findByTestId('progress-view')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByTestId('prg9-row-a1')).toBeInTheDocument()
      expect(screen.getByTestId('prg9-row-b1')).toBeInTheDocument()
    })
  })
})

describe('App 高级折叠入口（debug 降级）', () => {
  it('Advanced 折叠面在页脚、不在一级导航', async () => {
    render(<App />)
    await screen.findByTestId('progress-view')
    expect(screen.getByTestId('advanced-panel')).toBeInTheDocument()
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

describe('App currentRoot 聚合选择（D5/G19③：currentRoot 空串是全应用聚合的唯一表示，Task 5）', () => {
  it('点切换器「全部项目」→ currentRoot 变为空串并保持（不被 roots[0] 兜底逻辑吃回去）', async () => {
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
    await screen.findByTestId('progress-view')
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
    await screen.findByTestId('progress-view')
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
    await screen.findByTestId('progress-view')
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

// v6 计划 T11：App 是唯一 useSnapshot() 调用点，流程带真实计数/running 脉冲靠这里把同一份
// snapshot 逐层传给 WorkbenchView（不在 WorkbenchView 内独立开第二条 SSE 订阅）——这里钉住
// 接线本身没漏（而非重复 WorkbenchView.test.tsx 已经覆盖的 stageCounts 投影细节）。
describe('App 流程带真实计数接线（v6 计划 T11）', () => {
  it('点工作台：snapshot 里 automation===running 的 change 所在阶段渲染计数气泡与脉冲', async () => {
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
    expect(screen.getByTestId('wb-flow-count-build')).toHaveTextContent('1')
    expect(screen.getByTestId('wb-flow-gloss-build')).toBeInTheDocument()
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
