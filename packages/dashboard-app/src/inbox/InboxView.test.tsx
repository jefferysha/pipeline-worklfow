/**
 * InboxView v5 重构（T9）—— master-detail：左行列表 + 右 356px sticky 详情（shared/TaskDetail
 * variant='timeline'）。视觉/交互基准 design-demos/v5-progress-workbench.html 收件箱段；
 * 动作文案以 demo v5 为唯一口径（计划决议 #13）。
 *
 * 意图迁移表（旧 InboxView.test.tsx 断言 → 新归属）：
 *   · 空态 + 去进度（T17 前是"去看板"）              → 按钮去处随三视图 IA 改指进度
 *   · 准入过滤（selectInbox 消费面）+ currentRoot   → 保留；行 testid 仍 inbox-card
 *   · 「等你复核」徽章                              → 结论式语义 badge 三态（✓可以放行 /
 *     失败 ×N · 等你决定 / 等你判断），本文件「行列表」组
 *   · 行内快捷钮 inbox-quick-*                     → 退役——动作面唯一收敛到右栏详情卡动作条
 *     （inbox-act-approve/reject/retry/dismiss），双提交风险的根因消除
 *   · 回退二次确认 + busy 守卫（Esc 不绕过在途请求）→ 保留（动作条打回走同一 pending 流）
 *   · Enter 的 Dialog 打开旁路（终审修复批）        → 保留（断言对象从 change-detail 换
 *     task-detail）
 *   · j/k 焦点环 / Enter 开关 / Esc 收起            → 保留 + 新增 scrollIntoView 断言与
 *     Esc 占位卡（inbox-collapsed）
 *   · 聚合语境（G19③，禁 currentRoot 哨兵）        → 保留；断言升级为「选中 /repo-b 行后
 *     动作条提交带它自己的 root」
 *   · 右栏「项目在制/关联产物」摘要卡（Task 17）    → 退役——右栏让位给 master-detail 详情卡
 *     （v5 信息架构：速览并进详情卡的阶段时间线与产物 chip）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { I18nProvider } from '../i18n'
import { InboxView } from './InboxView'
import { DEFAULT_RULES, rulesFromDef, rulesKey, type WorkflowRules } from '../model/workflowModel'
import { makeChange, makeProject, makeSnapshot } from '../testkit'

/** afk 端点调用记录 + 可按用例改写的返回（缺省 200）。history 端点恒 200 空（详情卡挂载即拉）。 */
let afkCalls: { url: string; init: RequestInit }[] = []
let afkResult: () => Response | Promise<Response> = () => new Response(JSON.stringify({ ok: true }), { status: 200 })

beforeEach(() => {
  localStorage.clear()
  afkCalls = []
  afkResult = () => new Response(JSON.stringify({ ok: true }), { status: 200 })
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (/\/api\/change\/[^/]+\/history\?root=/.test(url)) {
      return new Response(JSON.stringify({ entries: [] }), { status: 200 })
    }
    if (/\/api\/afk\/[^/]+\/(retry|dismiss)$/.test(url)) {
      afkCalls.push({ url, init: init! })
      return afkResult()
    }
    throw new Error(`unexpected fetch ${url}`)
  }) as unknown as typeof fetch
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const REL_RULES = rulesFromDef({
  name: 'release-train',
  steps: [
    { id: 'draft', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [{ event: 'approved', to: 'review' }] },
    { id: 'review', label: '', gate: 'review', skills: [], inputs: [], outputs: [], guards: [], transitions: [{ event: 'shipped', to: 'ship' }] },
    { id: 'ship', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
  ],
})
const RULES = new Map<string, WorkflowRules>([
  [rulesKey('/repo', 'default'), DEFAULT_RULES],
  [rulesKey('/repo', 'release-train'), REL_RULES],
])

const VERIFY_OK = { verify_result: 'pass', agent_review_result: 'pass', codex_review_result: 'pass' }
const DOCS_OK = { design_doc: 'docs/d.md', plan: 'docs/p.md' }
/** demo hotfix-login 对位：automation 失败卡（五态 failed，人拍板重试/放弃）。 */
const FAILED = {
  automation: 'failed',
  automation_attempts: '3',
  automation_last_error: 'verify: 2 failed · auth.test.ts',
}

/** 手动控制的 Promise：制造"请求在途"窗口（busy 守卫断言用，做法对齐 SettingsView.test.tsx）。 */
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
    rulesByKey: RULES,
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

/** 等详情卡 history 拉取落定（TaskDetail data-settled 契约），避免异步 setState 泄出 act。 */
async function settled(): Promise<void> {
  await waitFor(() => expect(screen.getByTestId('dt-hist-sec').dataset.settled).toBe('true'))
}

describe('InboxView 空态（默认回答"在等我什么"，无事时明说）', () => {
  it('无在等的 change → 空态 + 去进度按钮触发 onOpenBoard（T17 IA：看板退役，去处改进度）', () => {
    const props = renderInbox()
    expect(screen.getByTestId('inbox-empty')).toBeInTheDocument()
    expect(screen.getByText('没有在等你的事')).toBeInTheDocument()
    expect(screen.queryByTestId('inbox-card')).toBeNull()
    fireEvent.click(screen.getByText('去进度'))
    expect(props.onOpenBoard).toHaveBeenCalledOnce()
  })
})

/**
 * 行列表：准入过滤（能拍板才进）+ 结论式语义 badge + 人话 lead（demo 三情形口径：
 * 可放行 / 失败等决定 / 纯人判）。updated_at 定序：login-flow 最新恒排第一（详情默认开它）。
 */
describe('InboxView 行列表（v5：人话主文案 + 结论式 badge + 证据 chips）', () => {
  const snap = makeSnapshot([
    makeProject('/repo', [
      makeChange('login-flow', 'verify', { track: 'frontend', updated_at: '2026-07-08T00:00:00Z', fields: { ...VERIFY_OK } }),
      makeChange('data-model', 'spec', { track: 'backend', updated_at: '2026-07-07T00:00:00Z', fields: { ...DOCS_OK } }),
      makeChange('hotfix-login', 'build', { track: 'backend', updated_at: '2026-07-06T00:00:00Z', fields: { ...FAILED } }),
      makeChange('changelog-cn', 'review', { track: 'chat', updated_at: '2026-07-05T00:00:00Z', fields: { workflow: 'release-train' } }),
      makeChange('busy-one', 'build'),
    ]),
    makeProject('/other', [makeChange('other-verify', 'verify', { fields: { ...VERIFY_OK } })]),
  ])

  it('准入过滤后仅「能拍板」行渲染（失败卡也进），且只看 currentRoot', async () => {
    renderInbox({ snapshot: snap })
    await settled()
    const rows = screen.getAllByTestId('inbox-card')
    expect(rows).toHaveLength(4)
    expect(screen.queryByText('busy-one')).toBeNull()
    expect(screen.queryByText('other-verify')).toBeNull()
    expect(screen.getByTestId('inbox-count').textContent).toBe('4 个在等你')
  })

  it('三情形 badge + lead：可放行（✓）/ 失败 ×N 等你决定 / 纯人判等你判断', async () => {
    renderInbox({ snapshot: snap })
    await settled()
    const rows = screen.getAllByTestId('inbox-card')
    // 可放行（verify 三轨全过）
    expect(rows[0]!.textContent).toContain('✓ 可以放行')
    expect(rows[0]!.textContent).toContain('全部通过')
    // 可放行（spec 文档齐）：细分 lead 沿 awaiting.spec
    expect(rows[1]!.textContent).toContain('✓ 可以放行')
    // 失败卡：badge 带重试计数，lead 是"重试还是放弃"的人话问句 + last_error
    expect(rows[2]!.textContent).toContain('失败 ×3 · 等你决定')
    expect(rows[2]!.textContent).toContain('重试还是放弃')
    expect(rows[2]!.textContent).toContain('auth.test.ts')
    // 纯人判（自定义 workflow 无自动检查）
    expect(rows[3]!.textContent).toContain('等你判断')
    expect(rows[3]!.textContent).toContain('人工复核')
  })

  it('行元素：wf 标签只在非 default 行出现；相位胶囊原始 step id；失败行出 automation 值 chip', async () => {
    renderInbox({ snapshot: snap })
    await settled()
    const wfLabels = screen.getAllByTestId('inbox-card-wf')
    expect(wfLabels).toHaveLength(1)
    expect(wfLabels[0]!.textContent).toBe('release-train')
    expect(screen.getAllByTestId('inbox-card-phase').map((n) => n.textContent)).toContain('review')
    expect(screen.getAllByTestId('inbox-card-phase').map((n) => n.textContent)).toContain('verify')
    expect(screen.getByTestId('inbox-fail-chip').textContent).toBe('automation=failed')
  })

  it('行内证据 chips：tone 类名 pass/fail 齐全（gateEvidence 复用不漂移）', async () => {
    renderInbox({
      snapshot: makeSnapshot([
        makeProject('/repo', [
          makeChange('login-flow', 'verify', {
            fields: { verify_result: 'pass', agent_review_result: 'fail', codex_review_result: 'fail' },
          }),
        ]),
      ]),
    })
    await settled()
    expect(screen.getByTestId('inbox-evidence-verify_result').className).toContain('ev__chip--pass')
    expect(screen.getByTestId('inbox-evidence-agent_review_result').className).toContain('ev__chip--fail')
    // 有未过项 → 不再说"可以放行"，badge 降为等你判断
    expect(screen.getAllByTestId('inbox-card')[0]!.textContent).toContain('等你判断')
  })
})

describe('InboxView master-detail 联动（默认开首行；点行切换；Esc 收起占位卡；Enter 重开）', () => {
  const snap = makeSnapshot([
    makeProject('/repo', [
      makeChange('login-flow', 'verify', { updated_at: '2026-07-08T00:00:00Z', fields: { ...VERIFY_OK } }),
      makeChange('data-model', 'spec', { updated_at: '2026-07-07T00:00:00Z', fields: { ...DOCS_OK } }),
    ]),
  ])

  it('初始即开首行详情（demo 默认态）：右栏 task-detail 是 updated_at 最新那张', async () => {
    renderInbox({ snapshot: snap })
    const detail = screen.getByTestId('task-detail')
    expect(within(detail).getByText('login-flow')).toBeInTheDocument()
    expect(screen.getAllByTestId('inbox-card')[0]!.className).toContain('ibx-row--on')
    expect(screen.getAllByTestId('inbox-card')[0]!.getAttribute('aria-selected')).toBe('true')
    await settled()
  })

  it('点第二行 → 详情联动切换 + 选中态换行', async () => {
    renderInbox({ snapshot: snap })
    fireEvent.click(screen.getAllByTestId('inbox-card')[1]!)
    expect(within(screen.getByTestId('task-detail')).getByText('data-model')).toBeInTheDocument()
    expect(screen.getAllByTestId('inbox-card')[1]!.getAttribute('aria-selected')).toBe('true')
    expect(screen.getAllByTestId('inbox-card')[0]!.getAttribute('aria-selected')).toBe('false')
    await settled()
  })

  it('Esc 收起 → 详情卡卸载、出占位卡；Enter 重开 kbd 焦点所在行', async () => {
    renderInbox({ snapshot: snap })
    await settled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('task-detail')).toBeNull()
    expect(screen.getByTestId('inbox-collapsed')).toBeInTheDocument()
    expect(screen.getByTestId('inbox-collapsed').textContent).toContain('详情已收起')

    fireEvent.keyDown(document, { key: 'Enter' })
    expect(screen.getByTestId('task-detail')).toBeInTheDocument()
    expect(screen.queryByTestId('inbox-collapsed')).toBeNull()
    await settled()
  })

  it('详情卡 ✕ 关闭钮 = Esc（收起出占位卡）', async () => {
    renderInbox({ snapshot: snap })
    await settled()
    fireEvent.click(screen.getByTestId('detail-close'))
    expect(screen.queryByTestId('task-detail')).toBeNull()
    expect(screen.getByTestId('inbox-collapsed')).toBeInTheDocument()
  })

  it('j/k 移动 .kbd-focus 且 scrollIntoView 跟随；Enter 打开焦点行（非选中行）', async () => {
    const siv = vi.fn()
    const proto = Element.prototype as unknown as { scrollIntoView?: (o?: unknown) => void }
    const orig = proto.scrollIntoView
    proto.scrollIntoView = siv
    try {
      renderInbox({ snapshot: snap })
      await settled()
      const rows = screen.getAllByTestId('inbox-card')
      expect(rows[0]!.className).toContain('kbd-focus')

      fireEvent.keyDown(document, { key: 'j' })
      expect(screen.getAllByTestId('inbox-card')[1]!.className).toContain('kbd-focus')
      expect(siv).toHaveBeenCalled()

      fireEvent.keyDown(document, { key: 'Enter' })
      expect(within(screen.getByTestId('task-detail')).getByText('data-model')).toBeInTheDocument()

      fireEvent.keyDown(document, { key: 'k' })
      expect(screen.getAllByTestId('inbox-card')[0]!.className).toContain('kbd-focus')
      await settled()
    } finally {
      if (orig) proto.scrollIntoView = orig
      else delete proto.scrollIntoView
    }
  })
})

describe('InboxView 动作条（gate：放行/打回走 transition，demo v5 文案口径 · 决议 #13）', () => {
  const snap = makeSnapshot([
    makeProject('/repo', [makeChange('login-flow', 'verify', { fields: { ...VERIFY_OK } })]),
  ])

  it('「→ 放行」→ onTransition(name, root, 第一条前进 event) + toast', async () => {
    const props = renderInbox({ snapshot: snap })
    await settled()
    const approve = screen.getByTestId('inbox-act-approve')
    expect(approve.textContent).toBe('→ 放行')
    fireEvent.click(approve)
    await waitFor(() => expect(props.onTransition).toHaveBeenCalledWith('login-flow', '/repo', 'verify-pass'))
    await waitFor(() => expect(props.onToast).toHaveBeenCalled())
  })

  it('「↩ 打回」先弹二次确认，确认后走回退 event；失败 → onError', async () => {
    const props = renderInbox({ snapshot: snap, onTransition: vi.fn().mockRejectedValue(new Error('前置校验不满足')) })
    await settled()
    const reject = screen.getByTestId('inbox-act-reject')
    expect(reject.textContent).toBe('↩ 打回')
    fireEvent.click(reject)
    expect(props.onTransition).not.toHaveBeenCalled()
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('inbox-confirm-yes'))
    await waitFor(() => expect(props.onTransition).toHaveBeenCalledWith('login-flow', '/repo', 'verify-fail'))
    await waitFor(() => expect(props.onError).toHaveBeenCalled())
    expect((props.onError as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toContain('前置校验不满足')
  })

  it('busy 守卫：请求在途时动作钮全禁用；Esc 不能绕过在途请求关确认框', async () => {
    const gate = deferred<void>()
    const props = renderInbox({ snapshot: snap, onTransition: vi.fn().mockReturnValue(gate.promise) })
    await settled()
    fireEvent.click(screen.getByTestId('inbox-act-reject'))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('inbox-confirm-yes')) // busy=true，挂起在 gate 上
    expect(screen.getByTestId('inbox-act-approve')).toBeDisabled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByTestId('inbox-confirm')).toBeInTheDocument()

    await act(async () => {
      gate.resolve()
    })
    await waitFor(() => expect(screen.queryByTestId('inbox-confirm')).toBeNull())
    expect(props.onToast).toHaveBeenCalled()
  })
})

describe('InboxView 动作条（失败卡：重试/放弃走 afk 端点 + busy 守卫）', () => {
  const snap = makeSnapshot([
    makeProject('/repo', [makeChange('hotfix-login', 'build', { fields: { ...FAILED } })]),
  ])

  it('「↻ 重试」→ POST /api/afk/hotfix-login/retry body {root} + toast', async () => {
    const props = renderInbox({ snapshot: snap })
    await settled()
    const retry = screen.getByTestId('inbox-act-retry')
    expect(retry.textContent).toBe('↻ 重试')
    fireEvent.click(retry)
    await waitFor(() => expect(afkCalls).toHaveLength(1))
    expect(afkCalls[0]!.url).toBe('/api/afk/hotfix-login/retry')
    expect(JSON.parse(afkCalls[0]!.init.body as string)).toEqual({ root: '/repo' })
    await waitFor(() => expect(props.onToast).toHaveBeenCalled())
  })

  it('「✕ 放弃」→ POST /api/afk/hotfix-login/dismiss；server 409 → onError 透传文案', async () => {
    afkResult = () => new Response(JSON.stringify({ ok: false, error: '状态已变，请刷新' }), { status: 409 })
    const props = renderInbox({ snapshot: snap })
    await settled()
    const dismiss = screen.getByTestId('inbox-act-dismiss')
    expect(dismiss.textContent).toBe('✕ 放弃')
    fireEvent.click(dismiss)
    await waitFor(() => expect(afkCalls).toHaveLength(1))
    expect(afkCalls[0]!.url).toBe('/api/afk/hotfix-login/dismiss')
    await waitFor(() => expect(props.onError).toHaveBeenCalled())
    expect((props.onError as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toContain('状态已变')
  })

  it('busy 守卫：afk 请求在途时重试/放弃双双禁用，结算后恢复', async () => {
    const gate = deferred<Response>()
    afkResult = () => gate.promise
    renderInbox({ snapshot: snap })
    await settled()
    fireEvent.click(screen.getByTestId('inbox-act-retry'))
    await waitFor(() => expect(screen.getByTestId('inbox-act-retry')).toBeDisabled())
    expect(screen.getByTestId('inbox-act-dismiss')).toBeDisabled()

    await act(async () => {
      gate.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    })
    await waitFor(() => expect(screen.getByTestId('inbox-act-retry')).not.toBeDisabled())
  })
})

/**
 * Enter/Esc 的 Dialog 打开旁路（终审修复批语义保留）：确认框打开期间对 document 按 Enter/Esc
 * 不得拨动 master-detail 的开合——Dialog 自己的 LIFO 栈接管这两个键。
 */
describe('InboxView 键盘守卫（Dialog 打开时 Enter/Esc 不拨动详情开合）', () => {
  const snap = makeSnapshot([
    makeProject('/repo', [makeChange('login-flow', 'verify', { fields: { ...VERIFY_OK } })]),
  ])

  it('回退确认 Dialog 打开时对 document 发 Enter → 详情卡不被 toggle（仍保持打开）', async () => {
    renderInbox({ snapshot: snap })
    await settled()
    fireEvent.click(screen.getByTestId('inbox-act-reject'))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Enter' })
    expect(screen.getByTestId('task-detail')).toBeInTheDocument()
    expect(screen.queryByTestId('inbox-collapsed')).toBeNull()
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
 * 聚合语境（currentRoot=''，G19③）：行带各自项目名，选中行后动作条提交带它自己的 root
 * （上轮 Task 9→11 教训：禁用 currentRoot 哨兵——聚合下它是空串，不是任何行的 root）。
 */
describe('InboxView 聚合语境（currentRoot=""：行带 root 且详情动作用行自己的 root）', () => {
  const snap = makeSnapshot([
    makeProject('/repo-a', [makeChange('a-verify', 'verify', { updated_at: '2026-07-02T00:00:00Z', fields: { ...VERIFY_OK } })]),
    makeProject('/repo-b', [
      makeChange('b-review', 'review', { updated_at: '2026-07-01T00:00:00Z', fields: { workflow: 'release-train' } }),
    ]),
  ])
  const AGG_RULES = new Map<string, WorkflowRules>([
    [rulesKey('/repo-a', 'default'), DEFAULT_RULES],
    [rulesKey('/repo-b', 'default'), DEFAULT_RULES],
    [rulesKey('/repo-b', 'release-train'), REL_RULES],
  ])

  it('两行各带项目名；点 /repo-b 行 → 详情动作条提交 (b-review, /repo-b, shipped)', async () => {
    const props = renderInbox({ snapshot: snap, currentRoot: '', rulesByKey: AGG_RULES })
    const rows = screen.getAllByTestId('inbox-card')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.textContent).toContain('a-verify')
    expect(rows[0]!.textContent).toContain('repo-a')
    expect(rows[1]!.textContent).toContain('b-review')
    expect(rows[1]!.textContent).toContain('repo-b')

    fireEvent.click(rows[1]!)
    await settled()
    fireEvent.click(screen.getByTestId('inbox-act-approve'))
    await waitFor(() => expect(props.onTransition).toHaveBeenCalledWith('b-review', '/repo-b', 'shipped'))
  })
})
