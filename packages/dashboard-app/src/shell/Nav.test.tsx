import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { I18nProvider } from '../i18n'
import { Nav, PRIMARY_VIEWS } from './Nav'

beforeEach(() => {
  localStorage.clear()
})

function renderNav(over: Partial<Parameters<typeof Nav>[0]> = {}) {
  const props = {
    view: 'progress' as const,
    onView: vi.fn(),
    lang: 'zh' as const,
    onLang: vi.fn(),
    theme: 'light' as const,
    onTheme: vi.fn(),
    connected: true,
    decisionCount: 0,
    afkCount: 0,
    ...over,
  }
  render(
    <I18nProvider>
      <Nav {...props} />
    </I18nProvider>,
  )
  return props
}

// 2026-07-15 外壳 IA 重构：rail 放视图导航——项目 / 进度 / AFK / 工作台（四枚 lucide 图标 + 小字）。
// 项目页承担自动发现与选择；rail 不重复展示当前项目名或项目切换器。
describe('Nav 一级导航（rail 五视图：项目 / 进度 / AFK / 工作台 / 机器）', () => {
  it('品牌是独立的可访问 Overview 入口，不计入五个运营导航项', () => {
    const props = renderNav()
    const brand = screen.getByRole('button', { name: 'Tenon 概览' })
    expect(brand).toHaveAttribute('data-testid', 'nav-overview')
    expect(brand).toHaveClass('motion-reduce:transition-none')
    expect(brand).not.toHaveAttribute('aria-current')
    fireEvent.click(brand)
    expect(props.onView).toHaveBeenCalledWith('overview')
    expect(within(screen.getByTestId('primary-nav')).getAllByRole('button')).toHaveLength(5)
  })

  it('Overview 激活时只有品牌标记 aria-current=page，五个运营项仍未选中', () => {
    renderNav({ view: 'overview' })
    expect(screen.getByTestId('nav-overview')).toHaveAttribute('aria-current', 'page')
    for (const operational of PRIMARY_VIEWS) {
      expect(screen.getByTestId(`nav-${operational}`)).not.toHaveAttribute('aria-current')
    }
  })

  it('一级导航恰 5 个按钮，并包含机器就绪入口', () => {
    renderNav()
    const nav = screen.getByTestId('primary-nav')
    const buttons = within(nav).getAllByRole('button')
    expect(buttons).toHaveLength(5)
    expect(nav.textContent).toContain('项目')
    expect(nav.textContent).toContain('进度')
    expect(nav.textContent).toContain('自动运行')
    expect(nav.textContent).toContain('工作台')
    expect(nav.textContent).toContain('机器')
    expect(nav.textContent).not.toContain('收件箱')
  })

  it('「项目」是 rail 首枚入口：nav-projects 渲染，点击触发 onView(projects)', () => {
    const props = renderNav()
    const btn = screen.getByTestId('nav-projects')
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)
    expect(props.onView).toHaveBeenCalledWith('projects')
    // 项目切换器/静态标签不在 rail 内
    expect(screen.queryByTestId('project-switcher')).toBeNull()
    expect(screen.queryByTestId('project-label')).toBeNull()
  })

  it('AFK 是一级视图：nav-afk 渲染，点击触发 onView(afk)', () => {
    const props = renderNav()
    const btn = screen.getByTestId('nav-afk')
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)
    expect(props.onView).toHaveBeenCalledWith('afk')
  })

  it('旧业务视图入口全部退役：nav-inbox / nav-board / nav-loops / nav-workflows 均不渲染', () => {
    renderNav()
    for (const id of ['nav-inbox', 'nav-board', 'nav-loops', 'nav-workflows']) {
      expect(screen.queryByTestId(id)).toBeNull()
    }
  })

  it('工作台不再是下拉分组触发：无 aria-haspopup、点击不出菜单', () => {
    renderNav()
    const wb = screen.getByTestId('nav-workbench')
    expect(wb).not.toHaveAttribute('aria-haspopup')
    fireEvent.click(wb)
    expect(screen.queryByTestId('workbench-menu')).toBeNull()
  })

  it('debug 工具（流量/运行时）不在一级导航', () => {
    renderNav()
    const nav = screen.getByTestId('primary-nav')
    expect(nav.textContent).not.toMatch(/流量|运行时|traffic|runtime/i)
  })

  it('当前视图标 aria-current=page', () => {
    renderNav({ view: 'progress' })
    expect(screen.getByTestId('nav-progress')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('nav-projects')).not.toHaveAttribute('aria-current')
    expect(screen.getByTestId('nav-afk')).not.toHaveAttribute('aria-current')
    expect(screen.getByTestId('nav-workbench')).not.toHaveAttribute('aria-current')
  })

  it('view=projects 时「项目」钮标 aria-current=page', () => {
    renderNav({ view: 'projects' })
    expect(screen.getByTestId('nav-projects')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('nav-progress')).not.toHaveAttribute('aria-current')
  })

  it('view=afk 时 AFK 钮标 aria-current=page', () => {
    renderNav({ view: 'afk' })
    expect(screen.getByTestId('nav-afk')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('nav-progress')).not.toHaveAttribute('aria-current')
  })

  it('view=workbench 时工作台钮标 aria-current=page', () => {
    renderNav({ view: 'workbench' })
    expect(screen.getByTestId('nav-workbench')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('nav-progress')).not.toHaveAttribute('aria-current')
  })
})

describe('Nav 交互 + 徽标', () => {
  it('点进度触发 onView(progress)', () => {
    const props = renderNav()
    fireEvent.click(screen.getByTestId('nav-progress'))
    expect(props.onView).toHaveBeenCalledWith('progress')
  })

  it('点工作台直接触发 onView(workbench)（不再经下拉）', () => {
    const props = renderNav()
    fireEvent.click(screen.getByTestId('nav-workbench'))
    expect(props.onView).toHaveBeenCalledWith('workbench')
  })

  it('语言切换 zh→en', () => {
    const props = renderNav({ lang: 'zh' })
    fireEvent.click(screen.getByTestId('nav-settings'))
    fireEvent.click(screen.getByTestId('lang-toggle'))
    expect(props.onLang).toHaveBeenCalledWith('en')
  })

  it('主题切换 light→dark', () => {
    const props = renderNav({ theme: 'light' })
    fireEvent.click(screen.getByTestId('nav-settings'))
    fireEvent.click(screen.getByTestId('theme-toggle'))
    expect(props.onTheme).toHaveBeenCalledWith('dark')
  })

  it('decisionCount>0 徽标挂在「进度」项内显示计数（progress-badge）', () => {
    renderNav({ decisionCount: 4 })
    const badge = screen.getByTestId('progress-badge')
    expect(badge.textContent).toBe('4')
    expect(within(screen.getByTestId('nav-progress')).getByTestId('progress-badge')).toBe(badge)
    // 旧收件箱徽标 testid 随视图退役，不再渲染
    expect(screen.queryByTestId('inbox-badge')).toBeNull()
  })

  it('decisionCount=0 不显示徽标', () => {
    renderNav({ decisionCount: 0 })
    expect(screen.queryByTestId('progress-badge')).toBeNull()
  })

  it('afkCount>0 徽标挂在「AFK」项内显示计数（afk-badge）', () => {
    renderNav({ afkCount: 3 })
    const badge = screen.getByTestId('afk-badge')
    expect(badge.textContent).toBe('3')
    expect(within(screen.getByTestId('nav-afk')).getByTestId('afk-badge')).toBe(badge)
  })

  it('afkCount=0 不显示 AFK 徽标', () => {
    renderNav({ afkCount: 0 })
    expect(screen.queryByTestId('afk-badge')).toBeNull()
  })
})

// ── rail 底部（修点2 重做）：SSE 连接点不换行（一枚点 + 同行短标签），主题/语言两枚等大方钮同排。
// 状态承载走 data-on（纪律：状态一律 data-*/aria，不断言视觉类名）；title 沿用既有 common.* 文案。
describe('Nav rail 底部：连接、主题与语言收进设置浮层', () => {
  it('默认只展示设置按钮，不外显在线、主题和语言；打开后才显示这些设置', () => {
    renderNav({ connected: true })
    expect(screen.getByTestId('nav-settings')).toBeInTheDocument()
    expect(screen.queryByTestId('conn-indicator')).toBeNull()
    expect(screen.queryByTestId('theme-toggle')).toBeNull()
    expect(screen.queryByTestId('lang-toggle')).toBeNull()

    fireEvent.click(screen.getByTestId('nav-settings'))
    expect(screen.getByTestId('nav-settings-panel')).toBeInTheDocument()
    const conn = screen.getByTestId('conn-indicator')
    expect(conn).toHaveAttribute('data-on', 'true')
    expect(conn.textContent).toContain('在线')
    expect(conn).toHaveAttribute('title', '实时已连接')
    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument()
    expect(screen.getByTestId('lang-toggle')).toBeInTheDocument()
  })

  it('离线状态只在设置浮层内呈现', () => {
    renderNav({ connected: false })
    fireEvent.click(screen.getByTestId('nav-settings'))
    const conn = screen.getByTestId('conn-indicator')
    expect(conn).toHaveAttribute('data-on', 'false')
    expect(conn.textContent).toContain('离线')
  })

  it('英文模式的设置入口、浮层、主题和语言控件不混入中文', () => {
    localStorage.setItem('tenon-dashboard-lang', 'en')
    renderNav({ lang: 'en', theme: 'dark' })
    fireEvent.click(screen.getByTestId('nav-settings'))
    const panel = screen.getByTestId('nav-settings-panel')
    expect(screen.getByTestId('nav-settings')).toHaveTextContent('Settings')
    expect(panel).toHaveTextContent('Settings')
    expect(screen.getByTestId('theme-toggle')).toHaveTextContent('Dark')
    expect(screen.getByTestId('lang-toggle')).toHaveTextContent('Chinese')
    expect(panel.textContent).not.toMatch(/[设置深色浅色中文]/)
  })

  it('设置浮层打开后切换主页面会自动收起，不遮挡新页面', () => {
    renderNav()
    fireEvent.click(screen.getByTestId('nav-settings'))
    expect(screen.getByTestId('nav-settings-panel')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('nav-projects'))
    expect(screen.queryByTestId('nav-settings-panel')).toBeNull()
  })
})
