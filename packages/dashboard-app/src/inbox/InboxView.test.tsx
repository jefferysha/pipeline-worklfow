import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nProvider } from '../i18n'
import { InboxView } from './InboxView'
import { makeChange, makeProject, makeSnapshot } from '../testkit'

beforeEach(() => {
  localStorage.clear()
})

function renderInbox(ui: Parameters<typeof InboxView>[0]) {
  return render(
    <I18nProvider>
      <InboxView {...ui} />
    </I18nProvider>,
  )
}

describe('InboxView 空态（病灶②：默认回答"在等我什么"，无事时明说）', () => {
  it('无在等的 change → 空态"没有在等你的事" + 去看板按钮', () => {
    const snap = makeSnapshot([makeProject('/a', [makeChange('c', 'build')])])
    renderInbox({ snapshot: snap, loading: false, error: null, onOpenBoard: () => {} })
    expect(screen.getByTestId('inbox-empty')).toBeInTheDocument()
    expect(screen.getByText('没有在等你的事')).toBeInTheDocument()
    expect(screen.queryByTestId('inbox-card')).toBeNull()
  })

  it('空态"去看板"按钮触发 onOpenBoard', () => {
    const spy = vi.fn()
    renderInbox({ snapshot: makeSnapshot([]), loading: false, error: null, onOpenBoard: spy })
    fireEvent.click(screen.getByText('去看板'))
    expect(spy).toHaveBeenCalledOnce()
  })
})

describe('InboxView 有卡片', () => {
  const snap = makeSnapshot([
    makeProject('/Users/me/repo-x', [
      makeChange('login-flow', 'verify', { track: 'frontend' }),
      makeChange('data-model', 'spec', { track: 'backend' }),
      makeChange('busy-one', 'build'),
    ]),
  ])

  it('只渲染复核相位卡（build 不出现）', () => {
    renderInbox({ snapshot: snap, loading: false, error: null, onOpenBoard: () => {} })
    const cards = screen.getAllByTestId('inbox-card')
    expect(cards).toHaveLength(2)
    expect(screen.getByText('login-flow')).toBeInTheDocument()
    expect(screen.getByText('data-model')).toBeInTheDocument()
    expect(screen.queryByText('busy-one')).toBeNull()
  })

  it('计数 = 2 个在等你', () => {
    renderInbox({ snapshot: snap, loading: false, error: null, onOpenBoard: () => {} })
    expect(screen.getByTestId('inbox-count').textContent).toBe('2 个在等你')
  })

  it('每卡显示决定类型文案（verify=等你复核放行）+ 相位徽标 + 项目名', () => {
    renderInbox({ snapshot: snap, loading: false, error: null, onOpenBoard: () => {} })
    const reasons = screen.getAllByTestId('inbox-card-reason').map((n) => n.textContent)
    expect(reasons).toContain('三轨验证跑完，等你复核放行')
    expect(reasons).toContain('规格 / 计划完成，等你确认')
    expect(screen.getAllByTestId('inbox-card-phase').map((n) => n.textContent)).toContain('验证')
    expect(screen.getAllByText('repo-x').length).toBeGreaterThan(0)
  })
})

describe('InboxView loading / error', () => {
  it('首帧 loading（无 snapshot）显示加载中', () => {
    renderInbox({ snapshot: null, loading: true, error: null, onOpenBoard: () => {} })
    expect(screen.getByTestId('inbox-loading')).toBeInTheDocument()
  })

  it('error（无 snapshot）显示错误', () => {
    renderInbox({ snapshot: null, loading: false, error: '快照获取失败（500）', onOpenBoard: () => {} })
    expect(screen.getByTestId('inbox-error').textContent).toContain('500')
  })
})
