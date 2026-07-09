import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { I18nProvider } from '../i18n'
import { Nav } from './Nav'

beforeEach(() => {
  localStorage.clear()
})

function renderNav(over: Partial<Parameters<typeof Nav>[0]> = {}) {
  const props = {
    view: 'inbox' as const,
    onView: vi.fn(),
    lang: 'zh' as const,
    onLang: vi.fn(),
    theme: 'light' as const,
    onTheme: vi.fn(),
    connected: true,
    inboxCount: 0,
    ...over,
  }
  render(
    <I18nProvider>
      <Nav {...props} />
    </I18nProvider>,
  )
  return props
}

describe('Nav 一级导航（GOAL.md F1 收尾：顶部 3 项 + "工作台" 下拉分组）', () => {
  it('一级导航折叠态恰 4 个按钮：收件箱 / 看板 / 设置 / 工作台（下拉触发）', () => {
    renderNav()
    const nav = screen.getByTestId('primary-nav')
    const buttons = within(nav).getAllByRole('button')
    expect(buttons).toHaveLength(4)
    expect(nav.textContent).toContain('收件箱')
    expect(nav.textContent).toContain('看板')
    expect(nav.textContent).toContain('设置')
    expect(nav.textContent).toContain('工作台')
  })

  it('工作台下拉默认收起，不含 loop 设置 / AFK 工作台按钮', () => {
    renderNav()
    expect(screen.queryByTestId('nav-loops')).toBeNull()
    expect(screen.queryByTestId('nav-afk')).toBeNull()
    expect(screen.getByTestId('nav-workbench')).toHaveAttribute('aria-expanded', 'false')
  })

  it('点工作台展开下拉，内含 loop 设置 + AFK 工作台两项', () => {
    renderNav()
    fireEvent.click(screen.getByTestId('nav-workbench'))
    expect(screen.getByTestId('nav-workbench')).toHaveAttribute('aria-expanded', 'true')
    const menu = screen.getByTestId('workbench-menu')
    expect(within(menu).getByTestId('nav-loops')).toBeInTheDocument()
    expect(within(menu).getByTestId('nav-afk')).toBeInTheDocument()
    expect(menu.textContent).toMatch(/loop/i)
    expect(menu.textContent).toMatch(/afk/i)
  })

  it('工作台下拉含第三项 workflow 编辑器', () => {
    renderNav()
    fireEvent.click(screen.getByTestId('nav-workbench'))
    const menu = screen.getByTestId('workbench-menu')
    expect(within(menu).getByTestId('nav-workflows')).toBeInTheDocument()
  })

  it('再点工作台触发按钮收起下拉', () => {
    renderNav()
    fireEvent.click(screen.getByTestId('nav-workbench'))
    fireEvent.click(screen.getByTestId('nav-workbench'))
    expect(screen.queryByTestId('workbench-menu')).toBeNull()
  })

  it('debug 工具（流量/运行时）仍不在一级导航', () => {
    renderNav()
    fireEvent.click(screen.getByTestId('nav-workbench'))
    const nav = screen.getByTestId('primary-nav')
    expect(nav.textContent).not.toMatch(/流量|运行时|traffic|runtime/i)
  })

  it('当前视图标 aria-current=page（顶层项）', () => {
    renderNav({ view: 'board' })
    expect(screen.getByTestId('nav-board')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('nav-inbox')).not.toHaveAttribute('aria-current')
  })

  it('view=loops/afk 时工作台触发按钮自身标 aria-current=page（子项活跃即分组活跃）', () => {
    renderNav({ view: 'loops' })
    expect(screen.getByTestId('nav-workbench')).toHaveAttribute('aria-current', 'page')
  })

  it('view=board 时工作台触发按钮不标 aria-current', () => {
    renderNav({ view: 'board' })
    expect(screen.getByTestId('nav-workbench')).not.toHaveAttribute('aria-current')
  })
})

describe('Nav 交互 + 徽标', () => {
  it('点看板触发 onView(board)', () => {
    const props = renderNav()
    fireEvent.click(screen.getByTestId('nav-board'))
    expect(props.onView).toHaveBeenCalledWith('board')
  })

  it('展开工作台后点 loop 设置触发 onView(loops) 并收起下拉', () => {
    const props = renderNav()
    fireEvent.click(screen.getByTestId('nav-workbench'))
    fireEvent.click(screen.getByTestId('nav-loops'))
    expect(props.onView).toHaveBeenCalledWith('loops')
    expect(screen.queryByTestId('workbench-menu')).toBeNull()
  })

  it('展开工作台后点 AFK 工作台触发 onView(afk) 并收起下拉', () => {
    const props = renderNav()
    fireEvent.click(screen.getByTestId('nav-workbench'))
    fireEvent.click(screen.getByTestId('nav-afk'))
    expect(props.onView).toHaveBeenCalledWith('afk')
    expect(screen.queryByTestId('workbench-menu')).toBeNull()
  })

  it('语言切换 zh→en', () => {
    const props = renderNav({ lang: 'zh' })
    fireEvent.click(screen.getByTestId('lang-toggle'))
    expect(props.onLang).toHaveBeenCalledWith('en')
  })

  it('主题切换 light→dark', () => {
    const props = renderNav({ theme: 'light' })
    fireEvent.click(screen.getByTestId('theme-toggle'))
    expect(props.onTheme).toHaveBeenCalledWith('dark')
  })

  it('inboxCount>0 显示徽标数', () => {
    renderNav({ inboxCount: 4 })
    expect(screen.getByTestId('inbox-badge').textContent).toBe('4')
  })

  it('inboxCount=0 不显示徽标', () => {
    renderNav({ inboxCount: 0 })
    expect(screen.queryByTestId('inbox-badge')).toBeNull()
  })
})

describe('Nav 项目切换器（D5：吃掉 G14）', () => {
  const projects = [
    { root: '/code/repo-a', name: 'repo-a', count: 3 },
    { root: '/code/repo-b', name: 'repo-b', count: 1 },
  ]

  it('双项目：渲染下拉按钮（显示当前项目名），点开列出两项，点选回调 onRoot', () => {
    const onRoot = vi.fn()
    renderNav({ projects, currentRoot: '/code/repo-a', onRoot })
    const btn = screen.getByTestId('project-switcher')
    expect(btn.textContent).toContain('repo-a')
    fireEvent.click(btn)
    fireEvent.click(screen.getByTestId('project-item-repo-b'))
    expect(onRoot).toHaveBeenCalledWith('/code/repo-b')
  })

  it('单项目：静态标签不可点，无下拉', () => {
    renderNav({ projects: [projects[0]!], currentRoot: '/code/repo-a', onRoot: vi.fn() })
    expect(screen.queryByTestId('project-switcher')).toBeNull()
    expect(screen.getByTestId('project-label').textContent).toContain('repo-a')
  })

  it('注册入口：下拉末项触发 onRegisterProject；单项目时为独立 ＋ 按钮', () => {
    const onRegisterProject = vi.fn()
    renderNav({ projects, currentRoot: '/code/repo-a', onRoot: vi.fn(), onRegisterProject })
    fireEvent.click(screen.getByTestId('project-switcher'))
    fireEvent.click(screen.getByTestId('project-register'))
    expect(onRegisterProject).toHaveBeenCalledOnce()
  })

  it('未传 projects（如加载首帧）：不渲染切换器区域', () => {
    renderNav()
    expect(screen.queryByTestId('project-switcher')).toBeNull()
    expect(screen.queryByTestId('project-label')).toBeNull()
  })
})

describe('Nav 聚合入口「全部项目」（D5/G19③ 收编，Task 5：currentRoot 空串 = 全应用聚合的唯一表示）', () => {
  const projects = [
    { root: '/code/repo-a', name: 'repo-a', count: 3, ok: true },
    { root: '/code/repo-b', name: 'repo-b', count: 5, ok: false },
  ]

  it('下拉首项为「全部项目」，点击回调 onRoot(\'\')', () => {
    const onRoot = vi.fn()
    renderNav({ projects, currentRoot: '/code/repo-a', onRoot })
    fireEvent.click(screen.getByTestId('project-switcher'))
    const menu = screen.getByTestId('project-menu')
    const items = within(menu).getAllByRole('menuitem')
    expect(items[0]).toHaveAttribute('data-testid', 'project-item-all')
    expect(items[0]!.textContent).toContain('全部项目')
    fireEvent.click(items[0]!)
    expect(onRoot).toHaveBeenCalledWith('')
  })

  it('聚合计数 = 各 ok 项目 change 总和，ok=false 的项目不计入', () => {
    renderNav({ projects, currentRoot: '/code/repo-a', onRoot: vi.fn() })
    fireEvent.click(screen.getByTestId('project-switcher'))
    const agg = screen.getByTestId('project-item-all')
    // repo-a(ok, 3) + repo-b(!ok, 5) → 只计 3，不是 8
    expect(agg.textContent).toContain('3')
    expect(agg.textContent).not.toContain('8')
  })

  it('currentRoot 为空串时，切换器按钮本身显示「全部项目」', () => {
    renderNav({ projects, currentRoot: '', onRoot: vi.fn() })
    expect(screen.getByTestId('project-switcher').textContent).toContain('全部项目')
  })
})

describe('Nav 注销项目入口（评审 P2-13）', () => {
  const projects = [
    { root: '/code/repo-a', name: 'repo-a', count: 3 },
    { root: '/code/repo-b', name: 'repo-b', count: 1 },
  ]

  it('项目项含「注销…」入口，点击弹确认 Dialog（标题含项目名）', () => {
    renderNav({ projects, currentRoot: '/code/repo-a', onRoot: vi.fn(), onUnregister: vi.fn() })
    fireEvent.click(screen.getByTestId('project-switcher'))
    fireEvent.click(screen.getByTestId('project-unregister-repo-a'))
    const dialog = screen.getByTestId('unregister-confirm')
    expect(dialog).toBeInTheDocument()
    expect(dialog.textContent).toContain('repo-a')
  })

  it('确认注销 → 调 onUnregister(root)，Dialog 关闭', () => {
    const onUnregister = vi.fn()
    renderNav({ projects, currentRoot: '/code/repo-a', onRoot: vi.fn(), onUnregister })
    fireEvent.click(screen.getByTestId('project-switcher'))
    fireEvent.click(screen.getByTestId('project-unregister-repo-a'))
    fireEvent.click(screen.getByRole('button', { name: '确认注销' }))
    expect(onUnregister).toHaveBeenCalledWith('/code/repo-a')
    expect(screen.queryByTestId('unregister-confirm')).toBeNull()
  })

  it('取消 → 不调 onUnregister，Dialog 关闭', () => {
    const onUnregister = vi.fn()
    renderNav({ projects, currentRoot: '/code/repo-a', onRoot: vi.fn(), onUnregister })
    fireEvent.click(screen.getByTestId('project-switcher'))
    fireEvent.click(screen.getByTestId('project-unregister-repo-a'))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onUnregister).not.toHaveBeenCalled()
    expect(screen.queryByTestId('unregister-confirm')).toBeNull()
  })

  it('未传 onUnregister：不渲染注销入口', () => {
    renderNav({ projects, currentRoot: '/code/repo-a', onRoot: vi.fn() })
    fireEvent.click(screen.getByTestId('project-switcher'))
    expect(screen.queryByTestId('project-unregister-repo-a')).toBeNull()
  })
})
