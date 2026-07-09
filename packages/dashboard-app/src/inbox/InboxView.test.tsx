import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
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

/**
 * 手动控制的 Promise：制造"转换请求在途"窗口（busy=true 期间不会自动结算），
 * 用于验证 Esc/backdrop 不绕过 busy 锁（评审修复轮）。做法对齐
 * SettingsView.test.tsx 的 deferred()。
 */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

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

describe('InboxView busy 守卫（评审修复：迁移到共享 Dialog 后 Esc/backdrop 不得绕过在途请求）', () => {
  it('回退确认 busy 在途时按 Esc → 确认框仍在、状态未清；结算后正常收尾', async () => {
    const gate = deferred<void>()
    const props = renderInbox({
      snapshot: makeSnapshot([makeProject('/repo', [makeChange('c9', 'verify')])]),
      onTransition: vi.fn().mockReturnValue(gate.promise),
    })
    fireEvent.click(screen.getByTestId('inbox-quick-verify-fail'))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('inbox-confirm-yes')) // busy=true，请求挂起在 gate 上
    fireEvent.keyDown(document, { key: 'Escape' })
    // 修复前：Esc 无条件 setPending(null)，确认框被关掉，本断言会失败——这就是红。
    expect(screen.getByTestId('inbox-confirm')).toBeInTheDocument()

    await act(async () => {
      gate.resolve()
    })
    await waitFor(() => expect(screen.queryByTestId('inbox-confirm')).toBeNull())
    expect(props.onToast).toHaveBeenCalled()
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

/**
 * 详情卡点开 + j/k 键盘（Task 7，评审 P0-1：让用户不离开 dashboard 就能完成一次有理有据
 * 的放行）。login-flow 故意给比 data-model 更新的 updated_at，让它在 selectInbox 的排序
 * （updated_at 倒序）里稳定排第一——4 条测试都不依赖"点开的具体是哪张卡"，但排序确定
 * 能让断言意图更直白（第一条测试同时核对"点第一行开的卡确实是证据 chips 所在那张卡"）。
 */
describe('InboxView 详情卡点开 + 证据 chips + j/k 键盘（Task 7，评审 P0-1）', () => {
  const snap = makeSnapshot([
    makeProject('/repo', [
      makeChange('login-flow', 'verify', {
        track: 'frontend',
        updated_at: '2026-07-08T00:00:00Z',
        fields: {
          verify_result: 'pass',
          agent_review_result: 'fail',
          codex_review_result: 'pending',
          verification_report: '/repo/report.md',
          build_sha: 'sha1',
        },
      }),
      makeChange('data-model', 'spec', { track: 'backend' }),
    ]),
  ])

  it('点第一行 → 下方出 change 详情卡（含正确的 change 名）；行内证据 chips 渲染 pass/fail tone 类名', () => {
    renderInbox({ snapshot: snap })
    // 证据 chips（行内 <div class="ev">，gateEvidence 复用）：tone 类名齐全。
    expect(screen.getByTestId('inbox-evidence-verify_result').className).toContain('ev__chip--pass')
    expect(screen.getByTestId('inbox-evidence-agent_review_result').className).toContain('ev__chip--fail')

    expect(screen.queryByTestId('change-detail')).toBeNull()
    fireEvent.click(screen.getAllByTestId('inbox-card')[0]!)
    const detail = screen.getByTestId('change-detail')
    expect(detail).toBeInTheDocument()
    expect(detail).toHaveTextContent('login-flow')
  })

  it('Enter（默认 kbd-focus 落在首行）→ 出 change 详情卡', () => {
    renderInbox({ snapshot: snap })
    expect(screen.queryByTestId('change-detail')).toBeNull()
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(screen.getByTestId('change-detail')).toBeInTheDocument()
  })

  it('j/k 移动 .kbd-focus（首行默认聚焦，j 移到下一行，k 移回首行）', () => {
    renderInbox({ snapshot: snap })
    expect(screen.getAllByTestId('inbox-card')[0]!.className).toContain('kbd-focus')
    expect(screen.getAllByTestId('inbox-card')[1]!.className).not.toContain('kbd-focus')

    fireEvent.keyDown(document, { key: 'j' })
    expect(screen.getAllByTestId('inbox-card')[0]!.className).not.toContain('kbd-focus')
    expect(screen.getAllByTestId('inbox-card')[1]!.className).toContain('kbd-focus')

    fireEvent.keyDown(document, { key: 'k' })
    expect(screen.getAllByTestId('inbox-card')[0]!.className).toContain('kbd-focus')
    expect(screen.getAllByTestId('inbox-card')[1]!.className).not.toContain('kbd-focus')
  })

  it('Esc 关闭已打开的详情卡', () => {
    renderInbox({ snapshot: snap })
    fireEvent.click(screen.getAllByTestId('inbox-card')[0]!)
    expect(screen.getByTestId('change-detail')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('change-detail')).toBeNull()
  })
})

/**
 * 行内快捷钮 vs 详情卡动作条（评审 Minor-5 修复）—— 卡打开后该行的 `.qk` 快捷钮组与详情卡
 * 底部动作条会同时存在，同一条转换在两处都能触发，构成双提交风险（例如误触行内快捷钮时
 * 详情卡还开着，两处状态可能不同步）。修复后：详情卡是该行唯一的动作面，`.qk` 打开时隐藏、
 * 关闭后恢复。
 */
describe('InboxView 行内快捷钮 vs 详情卡动作条（评审 Minor-5：卡打开时行内快捷钮组隐藏，动作面唯一）', () => {
  const snap = makeSnapshot([
    makeProject('/repo', [makeChange('login-flow', 'verify', { track: 'frontend', updated_at: '2026-07-08T00:00:00Z' })]),
  ])

  it('点开行 → 该行 inbox-quick-* 从 DOM 消失；关卡后恢复', () => {
    renderInbox({ snapshot: snap })
    expect(screen.getByTestId('inbox-quick-verify-pass')).toBeInTheDocument()
    expect(screen.getByTestId('inbox-quick-verify-fail')).toBeInTheDocument()

    fireEvent.click(screen.getAllByTestId('inbox-card')[0]!)
    expect(screen.getByTestId('change-detail')).toBeInTheDocument()
    expect(screen.queryByTestId('inbox-quick-verify-pass')).toBeNull()
    expect(screen.queryByTestId('inbox-quick-verify-fail')).toBeNull()

    fireEvent.click(screen.getAllByTestId('inbox-card')[0]!)
    expect(screen.queryByTestId('change-detail')).toBeNull()
    expect(screen.getByTestId('inbox-quick-verify-pass')).toBeInTheDocument()
    expect(screen.getByTestId('inbox-quick-verify-fail')).toBeInTheDocument()
  })
})
