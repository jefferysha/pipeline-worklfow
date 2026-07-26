import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { I18nProvider, useT } from '../i18n'
import { ProgressToolbar } from './ProgressToolbar'

function Subject(): JSX.Element {
  const { t } = useT()
  return (
    <ProgressToolbar
      t={t}
      rowCount={4}
      deckTab="all"
      deckCounts={{ all: 4, need: 1, run: 1, queue: 2 }}
      workflows={['default']}
      workflow="all"
      onDeckTab={() => {}}
      onWorkflow={() => {}}
      onCreate={() => {}}
    />
  )
}

describe('ProgressToolbar 响应式与国际化', () => {
  afterEach(() => localStorage.removeItem('tenon-dashboard-lang'))
  it('状态页签在窄屏只在自身容器横向滚动，按钮不压成竖排文字', () => {
    render(<I18nProvider><Subject /></I18nProvider>)
    const tabs = screen.getByTestId('prg9t-tabs')
    expect(tabs.parentElement?.className).toContain('overflow-x-auto')
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab.className).toContain('shrink-0')
      expect(tab.className).toContain('whitespace-nowrap')
    }
  })

  it('英文模式的标题、副标题和 workflow 筛选标签不混入中文', () => {
    localStorage.setItem('tenon-dashboard-lang', 'en')
    render(<I18nProvider><Subject /></I18nProvider>)
    expect(screen.getByRole('heading', { name: 'Progress' })).toBeInTheDocument()
    expect(screen.getByText(/Follow each task through its workflow/)).toBeInTheDocument()
    expect(screen.getByLabelText('Filter by workflow')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/[进度沿按筛选]/)
  })
})
