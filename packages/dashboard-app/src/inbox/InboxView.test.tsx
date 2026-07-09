import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nProvider } from '../i18n'
import { InboxView } from './InboxView'
import { DEFAULT_RULES, rulesFromDef, type WorkflowRules } from '../model/workflowModel'
import { makeChange, makeProject, makeSnapshot } from '../testkit'

beforeEach(() => {
  localStorage.clear()
})

const REL_RULES = rulesFromDef({
  name: 'release-train',
  steps: [
    { id: 'draft', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [{ event: 'approved', to: 'review' }] },
    { id: 'review', label: '', gate: 'review', skills: [], inputs: [], outputs: [], guards: [], transitions: [{ event: 'shipped', to: 'ship' }] },
    { id: 'ship', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
  ],
})
const RULES = new Map<string, WorkflowRules>([['default', DEFAULT_RULES], ['release-train', REL_RULES]])

function renderInbox(over: Partial<Parameters<typeof InboxView>[0]> = {}) {
  const props = {
    snapshot: makeSnapshot([makeProject('/repo', [makeChange('c1', 'build')])]),
    loading: false,
    error: null,
    currentRoot: '/repo',
    rulesByWf: RULES,
    onOpenBoard: vi.fn(),
    onTransition: vi.fn().mockResolvedValue(undefined),
    onToast: vi.fn(),
    onError: vi.fn(),
    ...over,
  }
  render(
    <I18nProvider>
      <InboxView {...props} />
    </I18nProvider>,
  )
  return props
}

describe('InboxView 空态（默认回答"在等我什么"，无事时明说）', () => {
  it('无在等的 change → 空态 + 去看板按钮触发 onOpenBoard', () => {
    const props = renderInbox()
    expect(screen.getByTestId('inbox-empty')).toBeInTheDocument()
    expect(screen.getByText('没有在等你的事')).toBeInTheDocument()
    expect(screen.queryByTestId('inbox-card')).toBeNull()
    fireEvent.click(screen.getByText('去看板'))
    expect(props.onOpenBoard).toHaveBeenCalledOnce()
  })
})

describe('InboxView 工票行（gate 泛化 + 快捷转换）', () => {
  const snap = makeSnapshot([
    makeProject('/repo', [
      makeChange('login-flow', 'verify', { track: 'frontend' }),
      makeChange('data-model', 'spec', { track: 'backend' }),
      makeChange('busy-one', 'build'),
      makeChange('changelog-cn', 'review', { track: 'chat', fields: { workflow: 'release-train' } }),
    ]),
    makeProject('/other', [makeChange('other-verify', 'verify')]),
  ])

  it('只渲染 gate 卡（含自定义 workflow 的 review 卡=G17 证据），且只看 currentRoot', () => {
    renderInbox({ snapshot: snap })
    const cards = screen.getAllByTestId('inbox-card')
    expect(cards).toHaveLength(3)
    expect(screen.getByText('login-flow')).toBeInTheDocument()
    expect(screen.getByText('data-model')).toBeInTheDocument()
    expect(screen.getByText('changelog-cn')).toBeInTheDocument()
    expect(screen.queryByText('busy-one')).toBeNull()
    expect(screen.queryByText('other-verify')).toBeNull()
  })

  it('计数 + 每行：等你复核徽章 / workflow 标签 / 相位胶囊（原始 step id）', () => {
    renderInbox({ snapshot: snap })
    expect(screen.getByTestId('inbox-count').textContent).toBe('3 个在等你')
    expect(screen.getAllByText('等你复核')).toHaveLength(3)
    expect(screen.getAllByTestId('inbox-card-wf').map((n) => n.textContent)).toContain('release-train')
    expect(screen.getAllByTestId('inbox-card-phase').map((n) => n.textContent)).toContain('review')
    expect(screen.getAllByTestId('inbox-card-phase').map((n) => n.textContent)).toContain('verify')
  })

  it('正向快捷按钮 → onTransition(name, root, event) + toast（自定义 workflow 用自己的 event 名）', async () => {
    const props = renderInbox({ snapshot: snap })
    fireEvent.click(screen.getByTestId('inbox-quick-shipped'))
    await waitFor(() => expect(props.onTransition).toHaveBeenCalledWith('changelog-cn', '/repo', 'shipped'))
    await waitFor(() => expect(props.onToast).toHaveBeenCalled())
  })

  it('verify 卡双出口：正向直推；回退（↩ build）先弹确认，确认后 verify-fail', async () => {
    const props = renderInbox({ snapshot: snap })
    expect(screen.getByTestId('inbox-quick-verify-pass')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('inbox-quick-verify-fail'))
    expect(props.onTransition).not.toHaveBeenCalled()
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('inbox-confirm-yes'))
    await waitFor(() => expect(props.onTransition).toHaveBeenCalledWith('login-flow', '/repo', 'verify-fail'))
  })

  it('转换失败 → onError 呈现文案', async () => {
    const props = renderInbox({
      snapshot: snap,
      onTransition: vi.fn().mockRejectedValue(new Error('前置校验不满足')),
    })
    fireEvent.click(screen.getByTestId('inbox-quick-shipped'))
    await waitFor(() => expect(props.onError).toHaveBeenCalled())
    expect((props.onError as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toContain('前置校验不满足')
  })
})

describe('InboxView loading / error', () => {
  it('首帧 loading（无 snapshot）显示加载中', () => {
    renderInbox({ snapshot: null, loading: true })
    expect(screen.getByTestId('inbox-loading')).toBeInTheDocument()
  })

  it('error（无 snapshot）显示错误', () => {
    renderInbox({ snapshot: null, error: '快照获取失败（500）' })
    expect(screen.getByTestId('inbox-error').textContent).toContain('500')
  })
})
