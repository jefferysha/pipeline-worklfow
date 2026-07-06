import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nProvider } from '../i18n'
import { AdvancedPanel } from './AdvancedPanel'
import { makeSnapshot } from '../testkit'

beforeEach(() => {
  localStorage.clear()
})

function renderAdv(snapshot: Parameters<typeof AdvancedPanel>[0]['snapshot']) {
  render(
    <I18nProvider>
      <AdvancedPanel snapshot={snapshot} />
    </I18nProvider>,
  )
}

describe('AdvancedPanel（病灶③：debug 工具降级为折叠占位）', () => {
  it('用 <details> 折叠，默认不展开', () => {
    renderAdv(makeSnapshot([]))
    const panel = screen.getByTestId('advanced-panel')
    expect(panel.tagName.toLowerCase()).toBe('details')
    expect(panel).not.toHaveAttribute('open')
  })

  it('列出 4 个降级工具：流量 / 运行时 / loops / afk', () => {
    renderAdv(makeSnapshot([]))
    for (const key of ['traffic', 'runtime', 'loops', 'afk']) {
      expect(screen.getByTestId(`advanced-${key}`)).toBeInTheDocument()
    }
  })

  it('server 未声明能力时全标占位（待对应里程碑数据端）', () => {
    renderAdv(makeSnapshot([], { capabilities: { snapshot: true } }))
    for (const key of ['traffic', 'runtime', 'loops', 'afk']) {
      expect(screen.getByTestId(`advanced-status-${key}`).textContent).toContain('占位')
    }
    expect(screen.getByTestId('advanced-traffic').textContent).toMatch(/M8/)
    expect(screen.getByTestId('advanced-afk').textContent).toMatch(/M5/)
  })

  it('若 server 声明某能力为 true 则显示 ready（能力声明驱动，不谎报）', () => {
    renderAdv(makeSnapshot([], { capabilities: { traffic: true } }))
    expect(screen.getByTestId('advanced-status-traffic').textContent).toContain('ready')
    expect(screen.getByTestId('advanced-status-loops').textContent).toContain('占位')
  })
})
