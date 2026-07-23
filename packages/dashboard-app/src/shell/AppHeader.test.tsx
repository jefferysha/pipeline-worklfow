import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { I18nProvider } from '../i18n'
import { AppHeader } from './AppHeader'

beforeEach(() => {
  localStorage.clear()
})

function renderHeader(over: Partial<Parameters<typeof AppHeader>[0]> = {}) {
  const props = {
    view: 'progress' as const,
    onView: vi.fn(),
    ...over,
  }
  render(
    <I18nProvider>
      <AppHeader {...props} />
    </I18nProvider>,
  )
  return props
}

const projects = [
  { root: '/code/repo-a', name: 'repo-a', count: 3 },
  { root: '/code/repo-b', name: 'repo-b', count: 1 },
]

// 2026-07-15 外壳 IA 重构：项目上下文从 rail 搬到内容顶部一条 header——当前项目名 + 切换器
// （沿用原 Nav 的项目列表/切换/注销逻辑与 testid）+「所有项目」入口。jsdom 无 matchMedia →
// GSAP 全部走「直显/直关」守卫路径，断言保持同步无需等动画。
describe('AppHeader 骨架 + 「所有项目」入口', () => {
  it('渲染 app-header；非 projects 视图给「所有项目」入口，点击 onView(projects)', () => {
    const props = renderHeader({ projects, currentRoot: '/code/repo-a' })
    expect(screen.getByTestId('app-header')).toBeInTheDocument()
    const all = screen.getByTestId('header-all-projects')
    fireEvent.click(all)
    expect(props.onView).toHaveBeenCalledWith('projects')
  })

  it("view='projects' 时 header 简化为标题：无切换器、无「所有项目」按钮", () => {
    renderHeader({ view: 'projects', projects, currentRoot: '/code/repo-a' })
    expect(screen.getByTestId('app-header-title')).toBeInTheDocument()
    expect(screen.queryByTestId('project-switcher')).toBeNull()
    expect(screen.queryByTestId('header-all-projects')).toBeNull()
  })

  it('未传 projects（加载首帧）：不渲染切换器/静态标签，「所有项目」入口仍在', () => {
    renderHeader()
    expect(screen.queryByTestId('project-switcher')).toBeNull()
    expect(screen.queryByTestId('project-label')).toBeNull()
    expect(screen.getByTestId('header-all-projects')).toBeInTheDocument()
  })
})

describe('AppHeader 项目切换器（沿用原 Nav 切换/注销 testid）', () => {
  it('双项目：切换器显示当前项目名，点开列出两项，点选回调 onRoot', () => {
    const onRoot = vi.fn()
    renderHeader({ projects, currentRoot: '/code/repo-a', onRoot })
    const btn = screen.getByTestId('project-switcher')
    expect(btn.textContent).toContain('repo-a')
    fireEvent.click(btn)
    fireEvent.click(screen.getByTestId('project-item-repo-b'))
    expect(onRoot).toHaveBeenCalledWith('/code/repo-b')
  })

  it('单项目：静态标签不可点、无下拉；标签含项目名', () => {
    renderHeader({ projects: [projects[0]!], currentRoot: '/code/repo-a', onRoot: vi.fn() })
    expect(screen.queryByTestId('project-switcher')).toBeNull()
    expect(screen.getByTestId('project-label').textContent).toContain('repo-a')
  })

  it('切换器按钮显示当前单项目名（非「全部项目」），下拉无聚合项 project-item-all', () => {
    renderHeader({ projects, currentRoot: '/code/repo-a', onRoot: vi.fn() })
    const btn = screen.getByTestId('project-switcher')
    expect(btn.textContent).toContain('repo-a')
    expect(btn.textContent).not.toContain('全部项目')
    fireEvent.click(btn)
    expect(screen.queryByTestId('project-item-all')).toBeNull()
    const menu = screen.getByTestId('project-menu')
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(2)
    expect(menu).toHaveAttribute('role', 'menu')
  })

  it('触发钮 aria-expanded 随开/合翻转，合上后菜单卸载', () => {
    renderHeader({ projects, currentRoot: '/code/repo-a', onRoot: vi.fn() })
    const btn = screen.getByTestId('project-switcher')
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('project-menu')).toBeInTheDocument()
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('project-menu')).toBeNull()
  })

  it('菜单底部渲染脚注说明（nav.project_menu_hint）', () => {
    renderHeader({ projects, currentRoot: '/code/repo-a', onRoot: vi.fn(), onUnregister: vi.fn() })
    fireEvent.click(screen.getByTestId('project-switcher'))
    expect(screen.getByTestId('project-menu').textContent).toContain('行尾按钮 = 注销此项目')
  })
})

describe('AppHeader 注销项目入口（沿用原 Nav 二次确认 Dialog）', () => {
  it('注销钮带 aria-label 与 title（含项目名），点击弹确认 Dialog（标题含项目名）', () => {
    renderHeader({ projects, currentRoot: '/code/repo-a', onRoot: vi.fn(), onUnregister: vi.fn() })
    fireEvent.click(screen.getByTestId('project-switcher'))
    const unreg = screen.getByTestId('project-unregister-repo-a')
    expect(unreg).toHaveAttribute('aria-label', '注销项目 repo-a')
    expect(unreg).toHaveAttribute('title', '注销项目 repo-a')
    fireEvent.click(unreg)
    const dialog = screen.getByTestId('unregister-confirm')
    expect(dialog).toBeInTheDocument()
    expect(dialog.textContent).toContain('repo-a')
  })

  it('确认注销 → 调 onUnregister(root)，Dialog 关闭', () => {
    const onUnregister = vi.fn()
    renderHeader({ projects, currentRoot: '/code/repo-a', onRoot: vi.fn(), onUnregister })
    fireEvent.click(screen.getByTestId('project-switcher'))
    fireEvent.click(screen.getByTestId('project-unregister-repo-a'))
    fireEvent.click(screen.getByRole('button', { name: '确认注销' }))
    expect(onUnregister).toHaveBeenCalledWith('/code/repo-a')
    expect(screen.queryByTestId('unregister-confirm')).toBeNull()
  })

  it('取消 → 不调 onUnregister，Dialog 关闭', () => {
    const onUnregister = vi.fn()
    renderHeader({ projects, currentRoot: '/code/repo-a', onRoot: vi.fn(), onUnregister })
    fireEvent.click(screen.getByTestId('project-switcher'))
    fireEvent.click(screen.getByTestId('project-unregister-repo-a'))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onUnregister).not.toHaveBeenCalled()
    expect(screen.queryByTestId('unregister-confirm')).toBeNull()
  })

  it('未传 onUnregister：不渲染注销入口', () => {
    renderHeader({ projects, currentRoot: '/code/repo-a', onRoot: vi.fn() })
    fireEvent.click(screen.getByTestId('project-switcher'))
    expect(screen.queryByTestId('project-unregister-repo-a')).toBeNull()
  })
})
