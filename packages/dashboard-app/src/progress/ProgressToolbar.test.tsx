import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider, useT } from '../i18n'
import { ProgressToolbar } from './ProgressToolbar'
import type { DeckTab } from './progressViewModel'

function Subject({ onDeckTab = () => {} }: { onDeckTab?: (tab: DeckTab) => void }): JSX.Element {
  const { t } = useT()
  const [deckTab, setDeckTab] = useState<DeckTab>('all')
  return (
    <ProgressToolbar
      t={t}
      rowCount={4}
      deckTab={deckTab}
      deckCounts={{ all: 4, need: 1, run: 1, queue: 2 }}
      filterSummary={{
        shown: deckCountsFor(deckTab),
        context: 4 - deckCountsFor(deckTab),
      }}
      workflows={['default']}
      workflow="all"
      onDeckTab={(tab) => {
        setDeckTab(tab)
        onDeckTab(tab)
      }}
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

  it('状态页签使用 roving tabindex，并支持方向键循环与 Home/End 跳转', () => {
    const onDeckTab = vi.fn()
    render(<I18nProvider><Subject onDeckTab={onDeckTab} /></I18nProvider>)
    const all = screen.getByTestId('prg9t-tab-all')
    const need = screen.getByTestId('prg9t-tab-need')
    const queue = screen.getByTestId('prg9t-tab-queue')

    expect(all).toHaveAttribute('tabindex', '0')
    expect(need).toHaveAttribute('tabindex', '-1')
    all.focus()
    fireEvent.keyDown(all, { key: 'ArrowRight' })
    expect(onDeckTab).toHaveBeenLastCalledWith('need')
    expect(need).toHaveFocus()
    expect(need).toHaveAttribute('tabindex', '0')

    fireEvent.keyDown(need, { key: 'End' })
    expect(onDeckTab).toHaveBeenLastCalledWith('queue')
    expect(queue).toHaveFocus()
    fireEvent.keyDown(queue, { key: 'ArrowRight' })
    expect(all).toHaveFocus()
    fireEvent.keyDown(all, { key: 'Home' })
    expect(all).toHaveFocus()
    fireEvent.keyDown(all, { key: 'ArrowLeft' })
    expect(queue).toHaveFocus()
  })

  it('非全部筛选显示可见 polite 计数摘要，零匹配和英文都保持诚实', () => {
    const { rerender } = render(
      <I18nProvider>
        <SummarySubject deckTab="need" />
      </I18nProvider>,
    )
    expect(screen.getByTestId('prg-filter-status')).toHaveAttribute('role', 'status')
    expect(screen.getByTestId('prg-filter-status')).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByTestId('prg-filter-status')).toHaveTextContent('匹配 1 个 · 上下文 3 个')

    rerender(<I18nProvider><SummarySubject deckTab="run" /></I18nProvider>)
    expect(screen.getByTestId('prg-filter-status')).toHaveTextContent('匹配 0 个 · 上下文 4 个')
    expect(document.body.textContent).not.toContain('加载')

    localStorage.setItem('tenon-dashboard-lang', 'en')
    rerender(<I18nProvider key="en"><SummarySubject deckTab="run" /></I18nProvider>)
    expect(screen.getByTestId('prg-filter-status')).toHaveTextContent('Matches 0 · Context 4')
    expect(screen.getByTestId('prg-filter-status').textContent).not.toMatch(/[\u3400-\u9fff]/)
  })
})

function SummarySubject({ deckTab }: { deckTab: DeckTab }): JSX.Element {
  const { t } = useT()
  return (
    <ProgressToolbar
      t={t}
      rowCount={4}
      deckTab={deckTab}
      deckCounts={{ all: 4, need: 1, run: 0, queue: 3 }}
      filterSummary={{
        shown: deckTab === 'need' ? 1 : deckTab === 'run' ? 0 : deckTab === 'queue' ? 3 : 4,
        context: deckTab === 'need' ? 3 : deckTab === 'run' ? 4 : deckTab === 'queue' ? 1 : 0,
      }}
      workflows={[]}
      workflow="all"
      onDeckTab={() => {}}
      onWorkflow={() => {}}
      onCreate={() => {}}
    />
  )
}

function deckCountsFor(tab: DeckTab): number {
  return { all: 4, need: 1, run: 1, queue: 2 }[tab]
}
