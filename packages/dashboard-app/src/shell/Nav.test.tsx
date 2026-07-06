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

describe('Nav 一级导航 ≤3 项（病灶③解法）', () => {
  it('一级导航恰好 3 个按钮：收件箱 / 看板 / 设置', () => {
    renderNav()
    const nav = screen.getByTestId('primary-nav')
    const buttons = within(nav).getAllByRole('button')
    expect(buttons).toHaveLength(3)
    expect(nav.textContent).toContain('收件箱')
    expect(nav.textContent).toContain('看板')
    expect(nav.textContent).toContain('设置')
  })

  it('debug 工具（流量/运行时/loops/afk）不在一级导航', () => {
    renderNav()
    const nav = screen.getByTestId('primary-nav')
    expect(nav.textContent).not.toMatch(/流量|运行时|loops|afk|traffic|runtime/i)
  })

  it('当前视图标 aria-current=page', () => {
    renderNav({ view: 'board' })
    expect(screen.getByTestId('nav-board')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('nav-inbox')).not.toHaveAttribute('aria-current')
  })
})

describe('Nav 交互 + 徽标', () => {
  it('点看板触发 onView(board)', () => {
    const props = renderNav()
    fireEvent.click(screen.getByTestId('nav-board'))
    expect(props.onView).toHaveBeenCalledWith('board')
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
