import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { I18nProvider } from '../i18n'
import { BoardView } from './BoardView'
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

function makeDataTransfer() {
  const store: Record<string, string> = {}
  return {
    setData: (k: string, v: string) => {
      store[k] = v
    },
    getData: (k: string) => store[k] ?? '',
    dropEffect: '',
    effectAllowed: '',
  }
}

function renderBoard(over: Partial<Parameters<typeof BoardView>[0]> = {}) {
  const props = {
    snapshot: makeSnapshot([makeProject('/repo', [makeChange('c1', 'build')])]),
    loading: false,
    error: null,
    currentRoot: '/repo',
    rulesByWf: RULES,
    rulesErrors: new Map<string, string>(),
    onTransition: vi.fn().mockResolvedValue(undefined),
    onToast: vi.fn(),
    onError: vi.fn(),
    ...over,
  }
  render(
    <I18nProvider>
      <BoardView {...props} />
    </I18nProvider>,
  )
  return props
}

describe('BoardView 分组看板（G17：每个 workflow 独立列集）', () => {
  it('default 组渲染 7 列（testid 带 workflow 前缀）', () => {
    renderBoard()
    expect(screen.getByTestId('board-group-default')).toBeInTheDocument()
    for (const step of ['open', 'explore', 'spec', 'build', 'verify', 'ship', 'archive']) {
      expect(screen.getByTestId(`board-col-default-${step}`)).toBeInTheDocument()
    }
  })

  it('卡片落在其相位列（build 卡在 build 列，不在 verify 列）', () => {
    renderBoard()
    expect(screen.getByTestId('board-col-default-build').textContent).toContain('c1')
    expect(screen.getByTestId('board-col-default-verify').textContent).not.toContain('c1')
  })

  it('自定义 workflow 独立分组：自己的列集 + 卡片可见（G17 修复证据）', () => {
    renderBoard({
      snapshot: makeSnapshot([
        makeProject('/repo', [
          makeChange('c1', 'build'),
          makeChange('rel-x', 'review', { fields: { workflow: 'release-train' } }),
        ]),
      ]),
    })
    const group = screen.getByTestId('board-group-release-train')
    expect(group).toBeInTheDocument()
    for (const step of ['draft', 'review', 'ship']) {
      expect(screen.getByTestId(`board-col-release-train-${step}`)).toBeInTheDocument()
    }
    expect(screen.getByTestId('board-col-release-train-review').textContent).toContain('rel-x')
    // default 组不含自定义卡
    expect(screen.getByTestId('board-group-default').textContent).not.toContain('rel-x')
  })

  it('无该 workflow 卡片 → 不渲染该组；空 default 项目 → 看板空态', () => {
    renderBoard()
    expect(screen.queryByTestId('board-group-release-train')).toBeNull()
    // 另渲染一个空快照实例（独立断言空态路径）
  })

  it('空看板显示提示', () => {
    renderBoard({ snapshot: makeSnapshot([makeProject('/repo', [])]) })
    expect(screen.getByTestId('board-empty')).toBeInTheDocument()
  })

  it('只显示 currentRoot 的卡（其它项目不渲染）', () => {
    renderBoard({
      snapshot: makeSnapshot([
        makeProject('/repo', [makeChange('mine', 'build')]),
        makeProject('/other', [makeChange('theirs', 'build')]),
      ]),
    })
    expect(screen.getByTestId('board-col-default-build').textContent).toContain('mine')
    expect(screen.queryByText('theirs')).toBeNull()
  })

  it('default 组 archive 列渲染折叠计数条而非逐卡', () => {
    renderBoard({
      snapshot: makeSnapshot([
        makeProject('/repo', [
          makeChange('done-1', 'archive'),
          makeChange('done-2', 'archive'),
          makeChange('c1', 'build'),
        ]),
      ]),
    })
    const col = screen.getByTestId('board-col-default-archive')
    expect(within(col).getByTestId('board-fold-archive').textContent).toContain('2')
    expect(col.textContent).not.toContain('done-1')
  })

  it('折叠分组：点 caret 隐藏组 body，再点恢复（localStorage 记忆）', () => {
    renderBoard()
    const caret = screen.getByTestId('board-fold-default')
    fireEvent.click(caret)
    expect(screen.queryByTestId('board-col-default-build')).toBeNull()
    expect(localStorage.getItem('board.collapsed./repo.default')).toBe('1')
    fireEvent.click(caret)
    expect(screen.getByTestId('board-col-default-build')).toBeInTheDocument()
  })

  it('rules 拉取失败的组：错误提示 + 卡片只读可见（不可拖、无快捷按钮）——卡不消失', () => {
    renderBoard({
      snapshot: makeSnapshot([
        makeProject('/repo', [makeChange('ghost-x', 'weird', { fields: { workflow: 'ghost' } })]),
      ]),
      rulesErrors: new Map([['ghost', "workflow 'ghost' 不存在"]]),
    })
    expect(screen.getByTestId('board-group-error-ghost').textContent).toContain('不存在')
    expect(screen.getByText('ghost-x')).toBeInTheDocument()
    expect(screen.queryByTestId('board-card-ghost-x')?.getAttribute('draggable')).not.toBe('true')
  })
})

describe('BoardView 拖拽换列 → 转换（真触发 onTransition）', () => {
  it('default：build 卡拖到 verify 列 → onTransition(name, root, build-complete)', async () => {
    const props = renderBoard()
    const card = screen.getByTestId('board-card-c1')
    const target = screen.getByTestId('board-col-default-verify')
    const dt = makeDataTransfer()
    fireEvent.dragStart(card, { dataTransfer: dt })
    fireEvent.dragOver(target, { dataTransfer: dt })
    fireEvent.drop(target, { dataTransfer: dt })
    await waitFor(() => expect(props.onTransition).toHaveBeenCalledWith('c1', '/repo', 'build-complete'))
    await waitFor(() => expect(props.onToast).toHaveBeenCalled())
  })

  it('自定义组内拖拽用自己的 event 名（draft→review = approved）', async () => {
    const props = renderBoard({
      snapshot: makeSnapshot([
        makeProject('/repo', [makeChange('rel-x', 'draft', { fields: { workflow: 'release-train' } })]),
      ]),
    })
    const dt = makeDataTransfer()
    fireEvent.dragStart(screen.getByTestId('board-card-rel-x'), { dataTransfer: dt })
    fireEvent.drop(screen.getByTestId('board-col-release-train-review'), { dataTransfer: dt })
    await waitFor(() => expect(props.onTransition).toHaveBeenCalledWith('rel-x', '/repo', 'approved'))
  })

  it('回退边（verify→build）弹二次确认，确认后触发 verify-fail', async () => {
    const props = renderBoard({
      snapshot: makeSnapshot([makeProject('/repo', [makeChange('c2', 'verify')])]),
    })
    const dt = makeDataTransfer()
    fireEvent.dragStart(screen.getByTestId('board-card-c2'), { dataTransfer: dt })
    fireEvent.drop(screen.getByTestId('board-col-default-build'), { dataTransfer: dt })
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(props.onTransition).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('board-confirm-yes'))
    await waitFor(() => expect(props.onTransition).toHaveBeenCalledWith('c2', '/repo', 'verify-fail'))
  })

  it('非法落点（open→verify 跳跃）no-op', async () => {
    const props = renderBoard({
      snapshot: makeSnapshot([makeProject('/repo', [makeChange('c3', 'open')])]),
    })
    const dt = makeDataTransfer()
    fireEvent.dragStart(screen.getByTestId('board-card-c3'), { dataTransfer: dt })
    fireEvent.drop(screen.getByTestId('board-col-default-verify'), { dataTransfer: dt })
    await new Promise((r) => setTimeout(r, 0))
    expect(props.onTransition).not.toHaveBeenCalled()
  })

  it('转换失败 → onError 呈现 server 文案', async () => {
    const props = renderBoard({
      onTransition: vi.fn().mockRejectedValue(new Error('前置校验不满足')),
    })
    const dt = makeDataTransfer()
    fireEvent.dragStart(screen.getByTestId('board-card-c1'), { dataTransfer: dt })
    fireEvent.drop(screen.getByTestId('board-col-default-verify'), { dataTransfer: dt })
    await waitFor(() => expect(props.onError).toHaveBeenCalled())
    expect((props.onError as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toContain('前置校验不满足')
  })
})

describe('BoardView 卡片快捷转换按钮（吸收方案 3）', () => {
  it('正向快捷按钮直推：verify 卡点「→ ship」→ verify-pass', async () => {
    const props = renderBoard({
      snapshot: makeSnapshot([makeProject('/repo', [makeChange('c2', 'verify')])]),
    })
    fireEvent.click(screen.getByTestId('board-quick-c2-verify-pass'))
    await waitFor(() => expect(props.onTransition).toHaveBeenCalledWith('c2', '/repo', 'verify-pass'))
  })

  it('回退快捷按钮走确认：verify 卡点「↩ build」先弹框', async () => {
    const props = renderBoard({
      snapshot: makeSnapshot([makeProject('/repo', [makeChange('c2', 'verify')])]),
    })
    fireEvent.click(screen.getByTestId('board-quick-c2-verify-fail'))
    expect(props.onTransition).not.toHaveBeenCalled()
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('gate 卡带朱红样式类 + 等你复核徽章', () => {
    renderBoard({
      snapshot: makeSnapshot([makeProject('/repo', [makeChange('c2', 'verify')])]),
    })
    const card = screen.getByTestId('board-card-c2')
    expect(card.className).toContain('board__card--gate')
    expect(within(card).getByText('等你复核')).toBeInTheDocument()
  })
})

describe('BoardView loading / error', () => {
  it('首帧 loading', () => {
    renderBoard({ snapshot: null, loading: true })
    expect(screen.getByTestId('board-loading')).toBeInTheDocument()
  })
  it('error', () => {
    renderBoard({ snapshot: null, error: '快照获取失败（500）' })
    expect(screen.getByTestId('board-error').textContent).toContain('500')
  })
})

describe('BoardView 盖章确认（动效词汇：转换成功的状态反馈）', () => {
  it('快捷推进成功 → 卡片上出现绿章「已推进 → ship」', async () => {
    renderBoard({
      snapshot: makeSnapshot([makeProject('/repo', [makeChange('c2', 'verify')])]),
    })
    fireEvent.click(screen.getByTestId('board-quick-c2-verify-pass'))
    expect(await screen.findByTestId('board-stamp-c2')).toBeInTheDocument()
    expect(screen.getByTestId('board-stamp-c2').textContent).toContain('ship')
  })
})

describe('BoardView busy 守卫（评审修复：迁移到共享 Dialog 后 Esc/backdrop 不得绕过在途请求）', () => {
  it('回退确认 busy 在途时按 Esc → 确认框仍在、状态未清；结算后正常收尾', async () => {
    const gate = deferred<void>()
    const props = renderBoard({
      snapshot: makeSnapshot([makeProject('/repo', [makeChange('c2', 'verify')])]),
      onTransition: vi.fn().mockReturnValue(gate.promise),
    })
    fireEvent.click(screen.getByTestId('board-quick-c2-verify-fail'))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('board-confirm-yes')) // busy=true，请求挂起在 gate 上
    fireEvent.keyDown(document, { key: 'Escape' })
    // 修复前：Esc 无条件 setPending(null)，确认框被关掉，本断言会失败——这就是红。
    expect(screen.getByTestId('board-confirm')).toBeInTheDocument()

    await act(async () => {
      gate.resolve()
    })
    await waitFor(() => expect(screen.queryByTestId('board-confirm')).toBeNull())
    expect(props.onToast).toHaveBeenCalled()
  })
})
