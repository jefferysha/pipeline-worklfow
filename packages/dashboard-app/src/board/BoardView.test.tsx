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

  it('非法落点（open→verify 跳跃）：不触发 onTransition，改为该列 shake + onError 一句解释（评审 P1-11，不再静默 no-op）', async () => {
    const props = renderBoard({
      snapshot: makeSnapshot([makeProject('/repo', [makeChange('c3', 'open')])]),
    })
    const dt = makeDataTransfer()
    fireEvent.dragStart(screen.getByTestId('board-card-c3'), { dataTransfer: dt })
    const target = screen.getByTestId('board-col-default-verify')
    fireEvent.drop(target, { dataTransfer: dt })
    await new Promise((r) => setTimeout(r, 0))
    expect(props.onTransition).not.toHaveBeenCalled()
    expect(target.className).toContain('board__col--shake')
    expect(props.onError).toHaveBeenCalledWith('open 没有到 verify 的转换边')
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

describe('BoardView 卡片点开详情（评审 P0-2：ARIA 谎言复活为真行为，Task 9）', () => {
  it('点卡 → detail 卡打开，内容与该卡对应', () => {
    renderBoard()
    expect(screen.queryByTestId('change-detail')).toBeNull()
    fireEvent.click(screen.getByTestId('board-card-c1'))
    const detail = screen.getByTestId('change-detail')
    expect(within(detail).getByText('c1')).toBeInTheDocument()
  })

  it('聚焦卡后按 Enter → 与 click 同效，打开 detail', () => {
    renderBoard()
    const card = screen.getByTestId('board-card-c1')
    card.focus()
    fireEvent.keyDown(card, { key: 'Enter' })
    expect(screen.getByTestId('change-detail')).toBeInTheDocument()
  })

  it('detail 打开时按 Esc → 关闭', () => {
    renderBoard()
    fireEvent.click(screen.getByTestId('board-card-c1'))
    expect(screen.getByTestId('change-detail')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('change-detail')).toBeNull()
  })

  it('detail 卡放行按钮走 onTransition（Task 7 组件真行为，非假动作条）', async () => {
    const props = renderBoard()
    fireEvent.click(screen.getByTestId('board-card-c1'))
    fireEvent.click(screen.getByTestId('detail-approve'))
    await waitFor(() => expect(props.onTransition).toHaveBeenCalledWith('c1', '/repo', 'build-complete'))
  })

  it('拖拽起手（dragstart）后紧随的 click 不打开 detail（防拖拽误触，非新增交互）', () => {
    renderBoard()
    const card = screen.getByTestId('board-card-c1')
    const dt = makeDataTransfer()
    fireEvent.dragStart(card, { dataTransfer: dt })
    fireEvent.click(card)
    expect(screen.queryByTestId('change-detail')).toBeNull()
  })
})

/**
 * 评审修复轮 Important-1：detail 打开时，该卡（root+name 与当前 detail 匹配）的行内
 * 快捷钮组隐藏——详情卡动作条是唯一动作面，同 InboxView.tsx Minor-5 先例（评审修复见
 * InboxView.test.tsx「行内快捷钮 vs 详情卡动作条」一节），避免同一条转换在看板卡快捷钮与
 * 详情卡动作条两处都能触发。用两张卡（c2/c3 同落 verify 列）证明"只隐藏正在展示的那一张，
 * 其余卡不受影响"。
 */
describe('BoardView 详情打开时该卡快捷钮组隐藏（评审修复轮 Important-1：动作面唯一）', () => {
  it('开卡后该卡 board-quick-* 从 DOM 消失，其他卡不受影响；关卡后恢复', () => {
    renderBoard({
      snapshot: makeSnapshot([makeProject('/repo', [makeChange('c2', 'verify'), makeChange('c3', 'verify')])]),
    })
    expect(screen.getByTestId('board-quick-c2-verify-pass')).toBeInTheDocument()
    expect(screen.getByTestId('board-quick-c3-verify-pass')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('board-card-c2'))
    expect(screen.getByTestId('change-detail')).toBeInTheDocument()
    expect(screen.queryByTestId('board-quick-c2-verify-pass')).toBeNull()
    expect(screen.queryByTestId('board-quick-c2-verify-fail')).toBeNull()
    // 其他卡（c3）不受影响：快捷钮组仍在
    expect(screen.getByTestId('board-quick-c3-verify-pass')).toBeInTheDocument()
    expect(screen.getByTestId('board-quick-c3-verify-fail')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('detail-close'))
    expect(screen.queryByTestId('change-detail')).toBeNull()
    expect(screen.getByTestId('board-quick-c2-verify-pass')).toBeInTheDocument()
    expect(screen.getByTestId('board-quick-c2-verify-fail')).toBeInTheDocument()
  })
})

/**
 * 评审修复轮 Important-2：draggingRef 复位此前完全依赖 React onDragEnd——若拖拽过程中
 * 源卡因某种原因（如 SSE 快照刷新把这张卡从列表里移除）被卸载，dragend 不会派发，这个
 * 全板共享的 ref 会永久卡在 true，此后所有卡片的 click 都会被短路失效。修法：document 级
 * mouseup 兜底复位（无论 DOM 怎么变都会派发），配 setTimeout(0) 避免破坏"拖拽落点后紧跟
 * 一次 click 仍应被抑制"的既有语义。第一条测试模拟"dragend 丢失"，必须在旧代码上真红
 * （旧代码里没有任何兜底，ref 永久卡 true，点击永远打不开 detail）；第二条是正向对称覆盖
 * （dragstart→dragend 正常路径），验证新增的 mouseup 兜底不会破坏既有 onDragEnd 复位路径。
 */
describe('BoardView draggingRef mouseup 兜底复位（评审修复轮 Important-2：防拖拽中途 dragend 丢失导致点击永久失效）', () => {
  it('dragstart 后 dragend 丢失：document mouseup 兜底复位，flush 后点卡能正常开 detail（旧代码红）', async () => {
    renderBoard()
    const card = screen.getByTestId('board-card-c1')
    const dt = makeDataTransfer()
    fireEvent.dragStart(card, { dataTransfer: dt })
    // dragend 丢失（如源卡在拖拽中被卸载）：不派发 fireEvent.dragEnd，只派发 document mouseup 兜底。
    fireEvent.mouseUp(document)
    await new Promise((r) => setTimeout(r, 0)) // flush mouseup 兜底里的 setTimeout(0)
    fireEvent.click(card)
    expect(screen.getByTestId('change-detail')).toBeInTheDocument()
  })

  it('正向：dragstart→dragend 正常路径后 click 恢复打开 detail（与 mouseup 兜底对称共存）', () => {
    renderBoard()
    const card = screen.getByTestId('board-card-c1')
    const dt = makeDataTransfer()
    fireEvent.dragStart(card, { dataTransfer: dt })
    fireEvent.dragEnd(card)
    fireEvent.click(card)
    expect(screen.getByTestId('change-detail')).toBeInTheDocument()
  })
})

/**
 * 评审修复轮 Important-3：BoardView 切换 currentRoot（项目切换器）不会卸载重挂组件，
 * detail 状态若跨项目残留、且新项目恰好有同名 change，仅按 name 反查会把"旧项目详情"
 * 错配成"新项目同名 change 的数据"（root 对不上，内容却照样渲染）。双保险修法：
 * (a) currentRoot 变化时主动清空 detail；(b) findDetailEntry 反查前核对 target.root===
 * currentRoot。用同一个 render 实例的 rerender（不卸载）模拟真实的项目切换。
 */
describe('BoardView 详情卡跨项目错配防护（评审修复轮 Important-3：切项目不卸载 + 同名 change 不误配）', () => {
  it('打开 detail 后切换 currentRoot（新项目里有同名 change）→ change-detail 不在 DOM（旧代码红：仍渲染且内容错配）', () => {
    const base = {
      snapshot: makeSnapshot([makeProject('/repo-a', [makeChange('shared', 'build')])]),
      loading: false,
      error: null,
      currentRoot: '/repo-a',
      rulesByWf: RULES,
      rulesErrors: new Map<string, string>(),
      onTransition: vi.fn().mockResolvedValue(undefined),
      onToast: vi.fn(),
      onError: vi.fn(),
    }
    const { rerender } = render(
      <I18nProvider>
        <BoardView {...base} />
      </I18nProvider>,
    )
    fireEvent.click(screen.getByTestId('board-card-shared'))
    expect(screen.getByTestId('change-detail')).toBeInTheDocument()

    rerender(
      <I18nProvider>
        <BoardView
          {...base}
          currentRoot="/repo-b"
          snapshot={makeSnapshot([makeProject('/repo-b', [makeChange('shared', 'verify')])])}
        />
      </I18nProvider>,
    )
    expect(screen.queryByTestId('change-detail')).toBeNull()
    // 板本身对新项目仍正常渲染（修复只掐掉错配的详情卡，不影响看板主体）
    expect(screen.getByTestId('board-card-shared')).toBeInTheDocument()
  })
})

/**
 * 评审 P1-11：真机评审证实 onDragOver 对任何列都亮 board__col--target、非法落点松手静默
 * no-op——用户分不清"不合法"和"坏了"。修法：dragStart 时把 {name,phase,workflow} 存进
 * dragging state，每列按 plannedTransition(group.rules, dragging.phase, step) 判定合法性——
 * 合法列 board__col--legal（蓝 ring），非法列 board__col--illegal（降透明度）；既有的
 * board__col--target hover 高亮收紧为"仅合法列生效"；跨组（workflow 不同）不按 step 名巧合
 * 判定，整组直接非法。上面"非法落点（open→verify 跳跃）"一条已经覆盖"非法 drop → shake +
 * onError + 不调 onTransition"，这里补的是它没覆盖的三块：dragStart 时的逐列 legal/illegal
 * 类、dragEnd 复位、跨组全非法、target 收紧。
 */
describe('BoardView 拖拽合法性前示（评审 P1-11：任何列都亮 target 的修复）', () => {
  it('dragStart 后合法列亮 board__col--legal、非法列降 board__col--illegal（不再任何列都亮 target）', () => {
    renderBoard() // c1 落在 build 相位，default rules 下 build 唯一合法出边是 verify
    const dt = makeDataTransfer()
    fireEvent.dragStart(screen.getByTestId('board-card-c1'), { dataTransfer: dt })
    const legalCol = screen.getByTestId('board-col-default-verify')
    expect(legalCol.className).toContain('board__col--legal')
    expect(legalCol.className).not.toContain('board__col--illegal')
    // open/explore/spec/ship/archive 都没有到 build 唯一合法出边 verify 之外的边；build 自己
    // （拖拽起点列）plannedTransition(fromStep===toStep) 恒 null，同样按公式判非法。
    for (const step of ['open', 'explore', 'spec', 'build', 'ship', 'archive']) {
      const col = screen.getByTestId(`board-col-default-${step}`)
      expect(col.className).toContain('board__col--illegal')
      expect(col.className).not.toContain('board__col--legal')
    }
  })

  it('dragEnd 清除 legal/illegal 类', () => {
    renderBoard()
    const card = screen.getByTestId('board-card-c1')
    const dt = makeDataTransfer()
    fireEvent.dragStart(card, { dataTransfer: dt })
    expect(screen.getByTestId('board-col-default-verify').className).toContain('board__col--legal')
    fireEvent.dragEnd(card)
    expect(screen.getByTestId('board-col-default-verify').className).not.toContain('board__col--legal')
    expect(screen.getByTestId('board-col-default-open').className).not.toContain('board__col--illegal')
  })

  it('既有 --target hover 高亮仅在合法列上生效，非法列 hover 不亮 target', () => {
    renderBoard()
    const dt = makeDataTransfer()
    fireEvent.dragStart(screen.getByTestId('board-card-c1'), { dataTransfer: dt })
    const legalCol = screen.getByTestId('board-col-default-verify')
    fireEvent.dragOver(legalCol, { dataTransfer: dt })
    expect(legalCol.className).toContain('board__col--target')
    const illegalCol = screen.getByTestId('board-col-default-open')
    fireEvent.dragOver(illegalCol, { dataTransfer: dt })
    expect(illegalCol.className).not.toContain('board__col--target')
  })

  it('跨组拖拽：workflow 不同则目标组全列非法（不按 step 名巧合判定合法）', () => {
    renderBoard({
      snapshot: makeSnapshot([
        makeProject('/repo', [
          makeChange('c1', 'build'),
          makeChange('rel-x', 'draft', { fields: { workflow: 'release-train' } }),
        ]),
      ]),
    })
    const dt = makeDataTransfer()
    fireEvent.dragStart(screen.getByTestId('board-card-c1'), { dataTransfer: dt }) // default:build
    for (const step of ['draft', 'review', 'ship']) {
      const col = screen.getByTestId(`board-col-release-train-${step}`)
      expect(col.className).toContain('board__col--illegal')
      expect(col.className).not.toContain('board__col--legal')
    }
  })
})
