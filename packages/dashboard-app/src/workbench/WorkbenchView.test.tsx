import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { invalidateWorkflowRules, useWorkflowRules } from '../model/workflowModel'
import { makeChange, makeProject, makeSnapshot } from '../testkit'
import { stageCounts, WorkbenchView, type WbWorkflowDef } from './WorkbenchView'

const ROOT = '/tmp/proj-a'

// T12 fixture：对照 design-demos/v5-progress-workbench.html 的 release-train 三阶段示例，
// 但形状是真实 server 契约（GET /api/workflows/:name 的 { name, steps: StepDef[] }，同
// 旧 workflow 列表页测试（T18 已退役） 顶层 fixture 一致）。draft 带 3 个技能（验证 chips 截断 +N）、
// review 是复核门、ship 带 2 个产出（验证摘要行计数）。
const RELEASE_TRAIN = {
  name: 'release-train',
  steps: [
    {
      id: 'draft', label: '起草', gate: null,
      skills: [{ id: 'superpowers:tdd' }, { id: 'impeccable', depends_on: ['superpowers:tdd'] }, { id: 'browser-qa' }],
      inputs: [], outputs: [{ field: 'draft_doc', type: 'file_path' }], guards: [],
      transitions: [{ event: 'submitted', to: 'review' }],
    },
    {
      // T13：review 带 inputs——验收①「保存 body 含 inputs 原样透传」的探针字段
      //（Inputs UI 不渲染，但 schema/serialize 兼容保留，保存不丢）。
      id: 'review', label: '人工复核', gate: 'review',
      skills: [], inputs: [{ field: 'draft_doc', type: 'file_path' }], outputs: [], guards: [],
      transitions: [{ event: 'approved', to: 'ship' }, { event: 'rejected', to: 'draft' }],
    },
    {
      id: 'ship', label: '发布', gate: null,
      skills: [], inputs: [],
      outputs: [{ field: 'release_notes', type: 'file_path' }, { field: 'sha', type: 'string' }],
      guards: [], transitions: [],
    },
  ],
}

function renderView(props: Partial<Parameters<typeof WorkbenchView>[0]> = {}) {
  render(
    <I18nProvider>
      <WorkbenchView root={ROOT} {...props} />
    </I18nProvider>,
  )
}


// T16 fixture：/api/loops/snapshot 单 loop 行（server LoopRow 契约形状；缺省空——多数用例只关心
// workflow 编辑面，摘要「自动运行」行回落「未配置」）。
const LOOP_ROW = {
  root: ROOT,
  id: 'restyle-loop',
  name: '样式迁移',
  autonomy_level: 'L1',
  status: 'active',
  cadence: '2h',
  goal: '把旧版工单卡样式逐个迁移到 SaaS 卡片风',
  design_doc: 'design/restyle.md',
  change_prefix: 'rl-',
  risk: 'low',
  runner: 'claude-code',
  human_gates: ['合并前'],
  kill_criteria: ['no-change-3'],
  allowlist: [],
  denylist: [],
  budget_decl: { max_runs_per_day: 24, max_in_flight: 1, on_exceed: 'skip', max_tokens_per_day: 100000 },
  readiness: { score: 62, band: 'L2-ready' },
  budget: { breaker: 'ok', runsToday: 3, spentToday: 3000, remaining: 97000, hasBudget: true, maxTokensPerDay: 100000 },
  // T7：关系条数据面（server LoopRow 契约形状同步——本文件多数用例不断言关系条内容，给稳定占位值）。
  matched_changes: ['rl-0142-migrate-card'],
  phases: ['build', 'verify'],
}

let loopRows: unknown[]

beforeEach(() => {
  localStorage.clear()
  invalidateWorkflowRules() // 模块级 rules 缓存跨用例清空（同 旧 workflow 列表页测试（T18 已退役） 既有先例）
  loopRows = []
  global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
    if (url === `/api/workflows?root=${encodeURIComponent(ROOT)}`) {
      return new Response(JSON.stringify({ names: ['release-train'] }), { status: 200 })
    }
    if (url === `/api/workflows/release-train?root=${encodeURIComponent(ROOT)}`) {
      return new Response(JSON.stringify(RELEASE_TRAIN), { status: 200 })
    }
    // T13：保存端点（POST /api/workflows/:name，root 在 body 里）——缺省恒成功
    if (url === '/api/workflows/release-train' && opts?.method === 'POST') {
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }
    // T16：Loop 卡数据面（缺省无 loop——空态；用例按需往 loopRows 里灌行）
    if (url === '/api/loops/snapshot') {
      return new Response(JSON.stringify({ generated_at: '2026-07-11T00:00:00Z', rows: loopRows }), { status: 200 })
    }
    throw new Error(`unexpected fetch ${url}`)
  }) as unknown as typeof fetch
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('WorkbenchView stepper（验收①）', () => {
  it('按 /api/workflows 数据渲染 3 张阶段卡：序号/名称/ID/配置摘要计数与 def 一致', async () => {
    renderView()
    const draft = await screen.findByTestId('wb-step-draft')
    expect(within(draft).getByText('1')).toBeInTheDocument()
    expect(within(draft).getByText('起草')).toBeInTheDocument()
    expect(within(draft).getByText('draft')).toBeInTheDocument()
    expect(within(draft).getByText(/3 技能/)).toBeInTheDocument()
    expect(within(draft).getByText(/1 产出/)).toBeInTheDocument()
    // 技能 chips：前 2 个短名 + 截断 +1
    expect(within(draft).getByText('tdd')).toBeInTheDocument()
    expect(within(draft).getByText('impeccable')).toBeInTheDocument()
    expect(within(draft).getByText('+1')).toBeInTheDocument()

    const ship = screen.getByTestId('wb-step-ship')
    expect(within(ship).getByText(/0 技能/)).toBeInTheDocument()
    expect(within(ship).getByText(/2 产出/)).toBeInTheDocument()

    // gate 徽章只出现在 review 卡
    expect(within(screen.getByTestId('wb-step-review')).getByText('复核门')).toBeInTheDocument()
    expect(within(draft).queryByText('复核门')).toBeNull()

    // 卡间连接件带转换事件名
    expect(screen.getByText('submitted')).toBeInTheDocument()
    expect(screen.getByText('approved')).toBeInTheDocument()
  })

  it('「+ 添加阶段」按钮：自定义 workflow 可点、default 保持禁用（验收反馈#4，补齐 T13 遗留缺口）', async () => {
    renderView()
    await screen.findByTestId('wb-step-draft')
    expect(screen.getByRole('button', { name: '+ 添加阶段' })).toBeEnabled()

    fireEvent.click(screen.getByTestId('wb-wf-btn'))
    fireEvent.click(await screen.findByTestId('wb-wf-item-default'))
    await screen.findByTestId('wb-step-open')
    const btn = screen.getByRole('button', { name: '+ 添加阶段' })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('title', 'default 工作流只读，复制为自定义工作流后可编辑')
  })
})

describe('WorkbenchView 选中态与编辑区占位（验收②）', () => {
  it('默认选中第一阶段；点卡切换 aria-current 且编辑区占位联动', async () => {
    renderView()
    const draft = await screen.findByTestId('wb-step-draft')
    expect(draft).toHaveAttribute('aria-current', 'step')
    expect(screen.getByTestId('wb-editor-stage')).toHaveTextContent('draft')

    fireEvent.click(screen.getByTestId('wb-step-ship'))
    expect(screen.getByTestId('wb-step-ship')).toHaveAttribute('aria-current', 'step')
    expect(draft).not.toHaveAttribute('aria-current')
    expect(screen.getByTestId('wb-editor-stage')).toHaveTextContent('ship')
  })
})

describe('WorkbenchView workflow 下拉（验收①/②）', () => {
  it('按钮显示当前 workflow 与阶段数；切到 default 渲染 7 张卡、复核门徽章落在 review 阶段', async () => {
    renderView()
    await screen.findByTestId('wb-step-draft')
    const btn = screen.getByTestId('wb-wf-btn')
    expect(btn).toHaveTextContent('release-train')
    expect(btn).toHaveTextContent('3 阶段')

    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    const defaultItem = await screen.findByTestId('wb-wf-item-default')
    expect(defaultItem).toHaveTextContent('7 阶段')

    fireEvent.click(defaultItem)
    await screen.findByTestId('wb-step-open')
    for (const p of ['open', 'explore', 'spec', 'build', 'verify', 'ship', 'archive']) {
      expect(screen.getByTestId(`wb-step-${p}`)).toBeInTheDocument()
    }
    // REVIEW_PHASES（explore/spec/verify）带复核门徽章，open 不带
    for (const p of ['explore', 'spec', 'verify']) {
      expect(within(screen.getByTestId(`wb-step-${p}`)).getByText('复核门')).toBeInTheDocument()
    }
    expect(within(screen.getByTestId('wb-step-open')).queryByText('复核门')).toBeNull()
    expect(btn).toHaveTextContent('7 阶段')
  })
})

describe('WorkbenchView 右栏摘要（验收③前半）', () => {
  it('摘要四行：阶段 3 / 复核门 1 / 技能 3（跨阶段去重）/ 钩子占位', async () => {
    renderView()
    await screen.findByTestId('wb-step-draft')
    expect(screen.getByTestId('wb-sum-stages')).toHaveTextContent('3')
    expect(screen.getByTestId('wb-sum-gates')).toHaveTextContent('1')
    expect(screen.getByTestId('wb-sum-skills')).toHaveTextContent('3')
    expect(screen.getByTestId('wb-sum-hooks')).toHaveTextContent('—')
  })
})

/**
 * v6 T13 断言迁移登记：「流程预览」「预演」两组用例随 GSAP 假预演整体退役——
 * reduced-motion 直达终态类断言无迁移目标(「最近流转」为静态真实事件列表,无循环动画);
 * gate 红点语义由流程带门徽章(v6 T11 popover 用例)接管;节点序断言由下方「最近流转」
 * describe 的真实事件序断言接管。
 */
// ── T13：阶段编辑区（StepEditor 挂载 + 保存接线 + 脏守卫 + default 只读）──

/** 取最近一次 POST 保存调用（url + 解析后的 body）；无 POST → null。 */
function lastSaveCall(): { url: string; body: unknown } | null {
  const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
  const post = [...calls].reverse().find((c) => (c[1] as RequestInit | undefined)?.method === 'POST')
  if (!post) return null
  return { url: String(post[0]), body: JSON.parse(String((post[1] as RequestInit).body)) }
}

describe('WorkbenchView T13 编辑 → 保存（验收①）', () => {
  it('加载后未编辑：无「未保存」chip，保存钮 disabled（上轮 minor 收口项）', async () => {
    renderView()
    await screen.findByTestId('wb-step-draft')
    expect(screen.queryByTestId('wb-dirty')).toBeNull()
    expect(screen.getByTestId('wb-save')).toBeDisabled()
  })

  it('编辑名称+开 nonempty 开关 → dirty chip 出现；保存 body 与 def 形状一致且 inputs 原样透传', async () => {
    renderView()
    await screen.findByTestId('wb-step-draft')
    fireEvent.change(screen.getByLabelText('阶段名称'), { target: { value: '初稿' } })
    fireEvent.click(screen.getByRole('switch', { name: '产出非空方可推进' }))
    expect(screen.getByTestId('wb-dirty')).toHaveTextContent('未保存')
    expect(screen.getByTestId('wb-save')).toBeEnabled()

    fireEvent.click(screen.getByTestId('wb-save'))
    await waitFor(() => expect(screen.getByTestId('wb-save-ok')).toHaveTextContent('已保存'))

    const save = lastSaveCall()
    expect(save?.url).toBe('/api/workflows/release-train')
    // 与 kernel serialize 消费的 WorkflowDef 形状逐字段一致：只有 draft 的 label/guards 变化，
    // review 的 inputs（Inputs UI 已移除）原样透传，其余步骤零改动。
    expect(save?.body).toEqual({
      ...RELEASE_TRAIN,
      steps: [
        { ...RELEASE_TRAIN.steps[0], label: '初稿', guards: [{ type: 'nonempty-output' }] },
        RELEASE_TRAIN.steps[1],
        RELEASE_TRAIN.steps[2],
      ],
      root: ROOT,
    })
    // 保存成功后脏状态清除、保存钮回到 disabled
    expect(screen.queryByTestId('wb-dirty')).toBeNull()
    expect(screen.getByTestId('wb-save')).toBeDisabled()
  })

  it('编辑联动：改名后阶段卡与右栏流程预览同步显示新名（摘要联动的同一份 def 状态）', async () => {
    renderView()
    await screen.findByTestId('wb-step-draft')
    fireEvent.change(screen.getByLabelText('阶段名称'), { target: { value: '初稿' } })
    expect(within(screen.getByTestId('wb-step-draft')).getByText('初稿')).toBeInTheDocument()
    // v6 T13:右栏流程预览退役——联动断言收敛到流程带段(同一份 def 状态的另一消费方)。
    expect(screen.getByTestId('wb-step-draft')).toHaveTextContent('初稿')
    // 开复核门 → 摘要「复核门」计数 1→2 联动
    fireEvent.click(screen.getByRole('switch', { name: '复核门' }))
    expect(screen.getByTestId('wb-sum-gates')).toHaveTextContent('2')
  })

  it('保存被 kernel validate 拒（400 errors[]）→ 错误原文上抛展示，已编辑内容不丢', async () => {
    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === `/api/workflows?root=${encodeURIComponent(ROOT)}`) {
        return new Response(JSON.stringify({ names: ['release-train'] }), { status: 200 })
      }
      if (url === `/api/workflows/release-train?root=${encodeURIComponent(ROOT)}`) {
        return new Response(JSON.stringify(RELEASE_TRAIN), { status: 200 })
      }
      if (url === '/api/workflows/release-train' && opts?.method === 'POST') {
        return new Response(JSON.stringify({ ok: false, errors: ["step 'draft': 循环依赖：a -> b -> a", "step 'draft' 的 skill id 'x y' 含非法字符（仅允许 a-zA-Z0-9_-）"] }), { status: 400 })
      }
      throw new Error(`unexpected fetch ${url}`)
    }) as unknown as typeof fetch
    renderView()
    await screen.findByTestId('wb-step-draft')
    fireEvent.change(screen.getByLabelText('阶段名称'), { target: { value: '初稿' } })
    fireEvent.click(screen.getByTestId('wb-save'))
    await waitFor(() => expect(screen.getByTestId('wb-save-errors')).toBeInTheDocument())
    // kernel validate 错误逐条原文展示（不翻译、不吞并）
    expect(screen.getByText("step 'draft': 循环依赖：a -> b -> a")).toBeInTheDocument()
    expect(screen.getByText(/skill id 'x y' 含非法字符/)).toBeInTheDocument()
    // 编辑内容仍在、dirty 未被误清
    expect(screen.getByLabelText('阶段名称')).toHaveValue('初稿')
    expect(screen.getByTestId('wb-dirty')).toBeInTheDocument()
  })
})

// 验收②后半：保存成功 → (root,name) 规则缓存失效（同 旧画布编辑器测试（T18 已退役） 评审 P0-4 的
// RulesProbe 内容断言法：探针先灌 v1 缓存，保存后重挂探针，真重拉才能看到 v2 的 4 个 step）。
function RulesProbe(): JSX.Element {
  const { rules } = useWorkflowRules(ROOT, ['release-train'])
  return <div data-testid="rules-probe">{rules.get('release-train')?.steps.length ?? 0}</div>
}

describe('WorkbenchView T13 保存后规则缓存失效（验收②）', () => {
  it('保存成功 → 下一个 useWorkflowRules 消费方真重拉、看到保存后的新定义', async () => {
    const V2 = {
      ...RELEASE_TRAIN,
      steps: [...RELEASE_TRAIN.steps, { id: 'extra', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] }],
    }
    let saved = false
    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === `/api/workflows?root=${encodeURIComponent(ROOT)}`) {
        return new Response(JSON.stringify({ names: ['release-train'] }), { status: 200 })
      }
      if (url === `/api/workflows/release-train?root=${encodeURIComponent(ROOT)}`) {
        return new Response(JSON.stringify(saved ? V2 : RELEASE_TRAIN), { status: 200 })
      }
      if (url === '/api/workflows/release-train' && opts?.method === 'POST') {
        saved = true
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      throw new Error(`unexpected fetch ${url}`)
    }) as unknown as typeof fetch

    // 1. 探针灌 v1 缓存（模拟收件箱/进度已消费过规则）
    const probe1 = render(<RulesProbe />)
    await waitFor(() => expect(screen.getByTestId('rules-probe').textContent).toBe('3'))
    probe1.unmount()

    // 2. 工作台编辑 + 保存成功（此后 server 端已是 v2）
    renderView()
    await screen.findByTestId('wb-step-draft')
    fireEvent.change(screen.getByLabelText('阶段名称'), { target: { value: '初稿' } })
    fireEvent.click(screen.getByTestId('wb-save'))
    await waitFor(() => expect(screen.getByTestId('wb-save-ok')).toBeInTheDocument())

    // 3. 消费方再次挂载：缓存已失效 → 真重拉 → 看到 v2 的 4 个 step
    render(<RulesProbe />)
    await waitFor(() => expect(screen.getByTestId('rules-probe').textContent).toBe('4'))
  })
})

describe('WorkbenchView T13 脏守卫：切 workflow 确认 Dialog（验收③）', () => {
  it('dirty 时切 workflow → 共享 Dialog 确认；取消停留原 workflow，确认丢弃并切换', async () => {
    renderView()
    await screen.findByTestId('wb-step-draft')
    fireEvent.change(screen.getByLabelText('阶段名称'), { target: { value: '初稿' } })

    // 切到 default → 不直接切，先弹确认
    fireEvent.click(screen.getByTestId('wb-wf-btn'))
    fireEvent.click(await screen.findByTestId('wb-wf-item-default'))
    expect(screen.getByTestId('wb-switch-confirm')).toBeInTheDocument()
    expect(screen.queryByTestId('wb-step-open')).toBeNull()

    // 取消：停留 release-train，编辑内容仍在
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByTestId('wb-switch-confirm')).toBeNull()
    expect(screen.getByLabelText('阶段名称')).toHaveValue('初稿')

    // 再切 + 确认丢弃：真切到 default
    fireEvent.click(screen.getByTestId('wb-wf-btn'))
    fireEvent.click(await screen.findByTestId('wb-wf-item-default'))
    fireEvent.click(screen.getByRole('button', { name: '丢弃并切换' }))
    await screen.findByTestId('wb-step-open')
  })

  it('非 dirty 切 workflow 不弹确认（既有直切行为不回归）', async () => {
    renderView()
    await screen.findByTestId('wb-step-draft')
    fireEvent.click(screen.getByTestId('wb-wf-btn'))
    fireEvent.click(await screen.findByTestId('wb-wf-item-default'))
    expect(screen.queryByTestId('wb-switch-confirm')).toBeNull()
    await screen.findByTestId('wb-step-open')
  })
})

describe('WorkbenchView T13 default workflow 只读态（验收④）', () => {
  it('default：只读 pill + 只读说明明示、控件禁用、无保存钮（server 端 400 已挡，前端预示）', async () => {
    renderView()
    await screen.findByTestId('wb-step-draft')
    fireEvent.click(screen.getByTestId('wb-wf-btn'))
    fireEvent.click(await screen.findByTestId('wb-wf-item-default'))
    await screen.findByTestId('wb-step-open')

    expect(screen.getByTestId('wb-ro-pill')).toHaveTextContent('内置 · 只读')
    expect(screen.getByTestId('wb-ed-readonly')).toHaveTextContent(/只读镜像/)
    expect(screen.getByLabelText('阶段名称')).toBeDisabled()
    expect(screen.getByRole('switch', { name: '复核门' })).toBeDisabled()
    expect(screen.queryByTestId('wb-save')).toBeNull()
    expect(screen.queryByTestId('wb-dirty')).toBeNull()
  })
})

// ── 验收反馈#4（补齐 T13 遗留缺口）：「+ 添加阶段」从禁用占位变真功能 ──
// 行为规格：自定义 workflow 非只读态可点 → 打开 Dialog（阶段名称 + 阶段 ID，ID 按名称自动
// slug 化、可再编辑覆盖，校验 ^[a-zA-Z0-9_-]+$ 且 steps 内唯一）→ 确认后在当前选中阶段之后
// 插入新 step（未选中则追加末尾）、线性语义接转换边、选中态切到新阶段、进入 dirty。

/** 最近一次保存调用的请求体（复用上方 lastSaveCall 的解析约定，narrow 出 WbWorkflowDef 形状）。 */
function lastSavedDef(): (WbWorkflowDef & { root: string }) | undefined {
  const call = lastSaveCall()
  return call?.body as (WbWorkflowDef & { root: string }) | undefined
}

/** rail 内按 DOM 顺序排列的阶段卡 id 序（v6 T11：StepperRail 重写为流程带后按
 *  data-testid 前缀取值，不再依赖 CSS 类名——「+ 添加阶段」按钮没有 data-testid，
 *  天然不会被此选择器命中，比原先绑 CSS 类名更不脆弱）。查询范围收在 `.wb8-stages`
 *  （v8-E 阶段卡横排容器,原 `.wb-flow`）内（而非整个 workbench-view）：StepEditor.tsx 的
 *  编辑区外壳也用了 'wb-step-editor' 这个 testid，前缀恰好同款，不收范围会被一起命中，
 *  数出第 4 个「阶段」。 */
function railStepOrder(): string[] {
  const root = screen.getByTestId('workbench-view')
  const rail = root.querySelector('.wb8-stages')
  if (!rail) return []
  return Array.from(rail.querySelectorAll<HTMLElement>('[data-testid^="wb-step-"]')).map((el) => el.getAttribute('data-testid') ?? '')
}

function openAddStageDialog(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: '+ 添加阶段' }))
  return screen.getByTestId('wb-add-stage')
}

describe('WorkbenchView 添加阶段 Dialog（验收反馈#4，补齐 T13 遗留缺口）', () => {
  it('点击打开 Dialog：阶段名称 + 阶段 ID 两个字段，ID 按名称自动 slug 化；手改 ID 后不再随名称联动', async () => {
    renderView()
    await screen.findByTestId('wb-step-draft')
    const dialog = openAddStageDialog()
    expect(within(dialog).getByLabelText('阶段名称')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('阶段 ID')).toHaveValue('')

    fireEvent.change(within(dialog).getByLabelText('阶段名称'), { target: { value: 'QA Gate' } })
    expect(within(dialog).getByLabelText('阶段 ID')).toHaveValue('qa-gate')

    // 手改 ID 后视为「已接管」，后续改名称不再覆盖它
    fireEvent.change(within(dialog).getByLabelText('阶段 ID'), { target: { value: 'qa-custom' } })
    fireEvent.change(within(dialog).getByLabelText('阶段名称'), { target: { value: 'QA Gate Two' } })
    expect(within(dialog).getByLabelText('阶段 ID')).toHaveValue('qa-custom')
  })

  it('ID 校验：非法字符报错、确认钮禁用；改回合法字符后错误消失、可确认', async () => {
    renderView()
    await screen.findByTestId('wb-step-draft')
    const dialog = openAddStageDialog()
    fireEvent.change(within(dialog).getByLabelText('阶段 ID'), { target: { value: 'bad id!' } })
    expect(within(dialog).getByTestId('wb-add-stage-id-error')).toHaveTextContent('阶段 ID 仅允许字母 / 数字 / - / _')
    expect(within(dialog).getByTestId('wb-add-stage-confirm')).toBeDisabled()

    fireEvent.change(within(dialog).getByLabelText('阶段 ID'), { target: { value: 'bad-id' } })
    expect(within(dialog).queryByTestId('wb-add-stage-id-error')).toBeNull()
    expect(within(dialog).getByTestId('wb-add-stage-confirm')).toBeEnabled()
  })

  it('ID 校验：与已有 step 重复报错、确认钮禁用，不落', async () => {
    renderView()
    await screen.findByTestId('wb-step-draft')
    const dialog = openAddStageDialog()
    fireEvent.change(within(dialog).getByLabelText('阶段 ID'), { target: { value: 'ship' } })
    expect(within(dialog).getByTestId('wb-add-stage-id-error')).toHaveTextContent('阶段 ID 已存在')
    expect(within(dialog).getByTestId('wb-add-stage-confirm')).toBeDisabled()
    // 禁用钮点击是浏览器/jsdom 层面的天然 no-op：不会新增第 4 张卡
    fireEvent.click(within(dialog).getByTestId('wb-add-stage-confirm'))
    expect(railStepOrder()).toEqual(['wb-step-draft', 'wb-step-review', 'wb-step-ship'])
    expect(screen.getByTestId('wb-add-stage')).toBeInTheDocument()
  })

  it('选中中间阶段（review）后添加 → 插在其后；前一步 transition 重定向指向新阶段、新阶段转到原后继；保存 payload 含新 step', async () => {
    renderView()
    await screen.findByTestId('wb-step-draft')
    fireEvent.click(screen.getByTestId('wb-step-review'))

    const dialog = openAddStageDialog()
    fireEvent.change(within(dialog).getByLabelText('阶段名称'), { target: { value: 'QA Gate' } })
    fireEvent.click(within(dialog).getByTestId('wb-add-stage-confirm'))

    // Dialog 关闭、新卡插在 review 与 ship 之间、选中态切到新阶段、进入 dirty
    expect(screen.queryByTestId('wb-add-stage')).toBeNull()
    expect(railStepOrder()).toEqual(['wb-step-draft', 'wb-step-review', 'wb-step-qa-gate', 'wb-step-ship'])
    expect(screen.getByTestId('wb-step-qa-gate')).toHaveAttribute('aria-current', 'step')
    expect(screen.getByTestId('wb-editor-stage')).toHaveTextContent('qa-gate')
    expect(screen.getByTestId('wb-dirty')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('wb-save'))
    await waitFor(() => expect(screen.getByTestId('wb-save-ok')).toBeInTheDocument())

    const saved = lastSavedDef()
    expect(saved?.steps.map((s) => s.id)).toEqual(['draft', 'review', 'qa-gate', 'ship'])
    // review 原 approved→ship 改指 qa-gate，rejected→draft 原样保留
    expect(saved?.steps.find((s) => s.id === 'review')?.transitions).toEqual([
      { event: 'approved', to: 'qa-gate' },
      { event: 'rejected', to: 'draft' },
    ])
    // 新 step 形状：{ id, label, gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions }
    expect(saved?.steps.find((s) => s.id === 'qa-gate')).toEqual({
      id: 'qa-gate', label: 'QA Gate', gate: null, skills: [], inputs: [], outputs: [], guards: [],
      transitions: [{ event: 'qa-gate-complete', to: 'ship' }],
    })
    // ship 未被牵动
    expect(saved?.steps.find((s) => s.id === 'ship')?.transitions).toEqual([])
  })

  it('选中末尾阶段（ship）后添加 → 追加到末尾，不产生悬空边（末尾插入保持终点语义）', async () => {
    renderView()
    await screen.findByTestId('wb-step-draft')
    fireEvent.click(screen.getByTestId('wb-step-ship'))

    const dialog = openAddStageDialog()
    fireEvent.change(within(dialog).getByLabelText('阶段名称'), { target: { value: 'Notify' } })
    fireEvent.click(within(dialog).getByTestId('wb-add-stage-confirm'))

    expect(railStepOrder()).toEqual(['wb-step-draft', 'wb-step-review', 'wb-step-ship', 'wb-step-notify'])
    expect(screen.getByTestId('wb-step-notify')).toHaveAttribute('aria-current', 'step')

    fireEvent.click(screen.getByTestId('wb-save'))
    await waitFor(() => expect(screen.getByTestId('wb-save-ok')).toBeInTheDocument())

    const saved = lastSavedDef()
    expect(saved?.steps.map((s) => s.id)).toEqual(['draft', 'review', 'ship', 'notify'])
    expect(saved?.steps.find((s) => s.id === 'ship')?.transitions).toEqual([]) // 未被强行接上新 step
    expect(saved?.steps.find((s) => s.id === 'notify')?.transitions).toEqual([]) // 末尾插入不造悬空边
  })

  it('插入后未保存即切 workflow → 触发脏守卫确认 Dialog（脏守卫四件套复用生效）', async () => {
    renderView()
    await screen.findByTestId('wb-step-draft')
    const dialog = openAddStageDialog()
    fireEvent.change(within(dialog).getByLabelText('阶段名称'), { target: { value: 'QA Gate' } })
    fireEvent.click(within(dialog).getByTestId('wb-add-stage-confirm'))
    expect(screen.getByTestId('wb-dirty')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('wb-wf-btn'))
    fireEvent.click(await screen.findByTestId('wb-wf-item-default'))
    expect(screen.getByTestId('wb-switch-confirm')).toBeInTheDocument()
    expect(screen.queryByTestId('wb-step-open')).toBeNull()
  })
})

// ── T16：「自动运行(Loop)」卡挂载 + 右栏摘要「自动运行」行 ──

describe('WorkbenchView T16 Loop 卡与摘要行', () => {
  it('无 loop 的 root：编辑卡后挂空态 Loop 卡（loops.yaml 教学），摘要行显「未配置」', async () => {
    renderView()
    await screen.findByTestId('wb-step-draft')
    const card = await screen.findByTestId('wb-loop-card')
    expect(within(card).getByTestId('lp-empty')).toHaveTextContent('.pipeline/loops.yaml')
    // 编辑卡在前、Loop 卡在后（demo 布局序）
    const editor = screen.getByTestId('wb-editor')
    expect(editor.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await waitFor(() => expect(screen.getByTestId('wb-sum-loop')).toHaveTextContent('未配置'))
  })

  it('有 loop：卡渲染真参数，摘要行 = 开 · 今日 runsToday/max_runs_per_day（已保存真值口径）', async () => {
    loopRows = [LOOP_ROW]
    renderView()
    await screen.findByTestId('wb-step-draft')
    const card = await screen.findByTestId('wb-loop-card')
    expect(within(card).getByTestId('lp-goal')).toHaveValue('把旧版工单卡样式逐个迁移到 SaaS 卡片风')
    await waitFor(() => expect(screen.getByTestId('wb-sum-loop')).toHaveTextContent('开 · 今日 3/24'))
    // 单 loop：卡头下拉隐藏
    expect(within(card).queryByTestId('lp-loop-select')).toBeNull()
  })

  it('暂停中的 loop：摘要行「停 · 今日 …」', async () => {
    loopRows = [{ ...LOOP_ROW, status: 'paused' }]
    renderView()
    await screen.findByTestId('wb-step-draft')
    await waitFor(() => expect(screen.getByTestId('wb-sum-loop')).toHaveTextContent('停 · 今日 3/24'))
  })
})

describe('WorkbenchView 加载失败', () => {
  it('workflow 定义 404 → 行内错误文案（不白屏）', async () => {
    global.fetch = vi.fn(async (url: string) => {
      if (url === `/api/workflows?root=${encodeURIComponent(ROOT)}`) {
        return new Response(JSON.stringify({ names: ['release-train'] }), { status: 200 })
      }
      return new Response(JSON.stringify({ error: 'workflow 未找到' }), { status: 404 })
    }) as unknown as typeof fetch
    renderView()
    await waitFor(() => expect(screen.getByText(/加载 workflow 失败：workflow 未找到/)).toBeInTheDocument())
  })
})

// ── v6 计划 T11：StepperRail → 流程带——stageCounts 纯函数直测 + WorkbenchView 接线集成测试 ──

describe('stageCounts 纯函数（v6 T11，零 IO）', () => {
  const OTHER_ROOT = '/tmp/proj-b'

  it('按阶段分桶真实 change 数；只认精确匹配的 root + changeWorkflowName===workflow', () => {
    const snap = makeSnapshot([
      makeProject(ROOT, [
        makeChange('c1', 'draft', { fields: { workflow: 'release-train' } }),
        makeChange('c2', 'review', { fields: { workflow: 'release-train' } }),
        makeChange('c3', 'review', { fields: { workflow: 'release-train' } }),
        makeChange('c4', 'draft', { fields: { workflow: 'default' } }), // 其它 workflow，不计入
      ]),
      makeProject(OTHER_ROOT, [makeChange('c5', 'draft', { fields: { workflow: 'release-train' } })]), // 其它 root，不计入
    ])
    const counts = stageCounts(snap, ROOT, 'release-train')
    expect(counts['draft']).toEqual({ count: 1, running: false })
    expect(counts['review']).toEqual({ count: 2, running: false })
    expect(counts['ship']).toBeUndefined()
  })

  it('running 判据精确等于 automation===\'running\'（不折叠 scheduled，逐字对齐验收判据④）', () => {
    const snap = makeSnapshot([
      makeProject(ROOT, [
        makeChange('c1', 'review', { fields: { workflow: 'release-train', automation: 'running' } }),
        makeChange('c2', 'draft', { fields: { workflow: 'release-train', automation: 'scheduled' } }),
      ]),
    ])
    const counts = stageCounts(snap, ROOT, 'release-train')
    expect(counts['review']).toEqual({ count: 1, running: true })
    expect(counts['draft']).toEqual({ count: 1, running: false }) // scheduled ≠ running：不点脉冲
  })

  it('archived change 排除（对齐决议 #5「archive 排除进度」口径）', () => {
    const snap = makeSnapshot([
      makeProject(ROOT, [
        makeChange('c1', 'ship', { fields: { workflow: 'release-train' }, archived: 'true' }),
      ]),
    ])
    expect(stageCounts(snap, ROOT, 'release-train')).toEqual({})
  })

  it('root 不可达（ok:false）或 snapshot 为空：回落空对象，不抛异常', () => {
    const snap = makeSnapshot([makeProject(ROOT, [makeChange('c1', 'draft')], { ok: false })])
    expect(stageCounts(snap, ROOT, 'release-train')).toEqual({})
    expect(stageCounts(null, ROOT, 'release-train')).toEqual({})
  })
})

describe('WorkbenchView 流程带真实计数 / running 脉冲（v6 T11 集成）', () => {
  it('snapshot 未传（既有消费方缺省态）：计数气泡与脉冲均不渲染，不报错', async () => {
    renderView()
    await screen.findByTestId('wb-step-draft')
    expect(screen.queryByTestId('wb-flow-count-draft')).toBeNull()
    expect(screen.queryByTestId('wb-flow-gloss-draft')).toBeNull()
  })

  it('传入 snapshot：计数气泡精确等于该阶段真实 change 数，running 脉冲只在 automation===running 的阶段渲染', async () => {
    const snap = makeSnapshot([
      makeProject(ROOT, [
        makeChange('c1', 'draft', { fields: { workflow: 'release-train' } }),
        makeChange('c2', 'review', { fields: { workflow: 'release-train' } }),
        makeChange('c3', 'review', { fields: { workflow: 'release-train', automation: 'running' } }),
        makeChange('c4', 'ship', { fields: { workflow: 'release-train' }, archived: 'true' }), // 已归档，不计入
      ]),
    ])
    renderView({ snapshot: snap })
    await screen.findByTestId('wb-step-draft')

    expect(screen.getByTestId('wb-flow-count-draft')).toHaveTextContent('1')
    expect(screen.getByTestId('wb-flow-count-review')).toHaveTextContent('2')
    expect(screen.queryByTestId('wb-flow-count-ship')).toBeNull() // 唯一一条已归档，真实计数为 0

    expect(screen.queryByTestId('wb-flow-gloss-draft')).toBeNull()
    expect(screen.getByTestId('wb-flow-gloss-review')).toBeInTheDocument()
    expect(screen.queryByTestId('wb-flow-gloss-ship')).toBeNull()
  })

  it('切换 workflow 后计数随新 workflow 重新分桶（default 7 阶段投影）', async () => {
    const snap = makeSnapshot([
      makeProject(ROOT, [
        makeChange('c1', 'build', {}), // fields 空 → changeWorkflowName 回落 'default'
      ]),
    ])
    renderView({ snapshot: snap })
    await screen.findByTestId('wb-step-draft')
    expect(screen.queryByTestId('wb-flow-count-build')).toBeNull() // 此刻在 release-train，没有 build 阶段

    fireEvent.click(screen.getByTestId('wb-wf-btn'))
    fireEvent.click(await screen.findByTestId('wb-wf-item-default'))
    await screen.findByTestId('wb-step-open')
    expect(screen.getByTestId('wb-flow-count-build')).toHaveTextContent('1')
  })
})

describe('WorkbenchView 门徽章 popover（v6 T11 集成，静态 hook 元数据真接线）', () => {
  it('gate 阶段（review）点击门徽章：popover 显示 gate.sh + interactive-skill-gate.sh 的真实人话名/说明（复用既有 hk_name_*/hk_desc_* 词典）', async () => {
    renderView()
    await screen.findByTestId('wb-step-draft')
    const gate = screen.getByTestId('wb-flow-gate-review')
    fireEvent.click(gate)
    const pop = screen.getByTestId('wb-flow-gatepop-review')
    expect(within(pop).getByText('门拦截')).toBeInTheDocument()
    expect(within(pop).getByText(/复核没过时，挡住技能调用与写文件/)).toBeInTheDocument()
    expect(within(pop).getByText('技能解锁检查')).toBeInTheDocument()
    expect(within(pop).getByText(/依赖顺序没到的技能直接拦下/)).toBeInTheDocument()
  })

  it('非 gate 阶段（draft/ship）不渲染门徽章', async () => {
    renderView()
    await screen.findByTestId('wb-step-draft')
    expect(screen.queryByTestId('wb-flow-gate-draft')).toBeNull()
    expect(screen.queryByTestId('wb-flow-gate-ship')).toBeNull()
  })

  it('点击门徽章不会连带触发选中阶段切换（编辑区仍是原选中阶段）', async () => {
    renderView()
    await screen.findByTestId('wb-step-draft')
    expect(screen.getByTestId('wb-editor-stage')).toHaveTextContent('draft')
    fireEvent.click(screen.getByTestId('wb-flow-gate-review'))
    expect(screen.getByTestId('wb-editor-stage')).toHaveTextContent('draft')
  })
})

/**
 * v6 T12：编辑区瘦身——Hook 时序线从 StepEditor slot 挪右栏(per-root 数据面,不吃 workflow
 * 只读态);右栏新增安全门说明卡(决议#2 人话版)与 manifest 技能矩阵入口卡。
 * 断言迁移登记:原「编辑区含 Hook 分区」的隐性布局由本 describe 的①显式接管(编辑卡内不再有
 * wb-hooks);HookTimeline 自身开关/锁定/回滚逻辑仍由 HookTimeline.test.tsx 全量覆盖,不重复。
 * v8-E 迁移登记：Hook 时序线再挪进「阶段编辑」页签(①断言同步)、矩阵入口卡挪进「技能健康」
 * 页签(④断言收窄 within(wb-pane-health));安全门说明卡(③)留右栏不动。开关按选中阶段读写(②)
 * 与矩阵入口脏守卫路径(④)的行为断言全部保留——守门等强度,只换宿主位置。
 */
describe('WorkbenchView v6 T12（v8-E 页签化后）：Hook 时序/安全门/矩阵卡', () => {
  const HOOKS_BODY = {
    hooks: [
      { id: 'session-start', event: 'SessionStart', configurable: true },
      { id: 'gate', event: 'PreToolUse', configurable: false },
      { id: 'interactive-skill-gate', event: 'PostToolUse', configurable: false },
      { id: 'confirm-clear', event: 'PostToolUse', configurable: false },
    ],
    matrix: {},
  }
  let hookPosts: string[]
  beforeEach(() => {
    hookPosts = []
    const prev = global.fetch
    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (typeof url === 'string' && url.startsWith('/api/hooks')) {
        if (opts?.method === 'POST') {
          hookPosts.push(String(opts.body))
          return new Response(JSON.stringify({ ok: true }), { status: 200 })
        }
        return new Response(JSON.stringify(HOOKS_BODY), { status: 200 })
      }
      return (prev as unknown as typeof fetch)(url as never, opts)
    }) as unknown as typeof fetch
  })

  it('① Hook 时序线并入「阶段编辑」页签(v8-E)——wb-hooks 在 wb-pane-stage 内、不在编辑卡内,右栏 wb-side-hooks 卡已撤', async () => {
    renderView()
    const pane = await screen.findByTestId('wb-pane-stage')
    await within(pane).findByTestId('wb-hooks')
    // 编辑卡内仍不平铺 hook 区（v6 T12 的既有守门等价物：时序线是编辑卡的兄弟,不是子分区）
    const editor = await screen.findByTestId('wb-editor')
    expect(within(editor).queryByTestId('wb-hooks')).toBeNull()
    // 右栏宿主卡随 v8-E 右栏瘦身撤下
    expect(screen.queryByTestId('wb-side-hooks')).toBeNull()
  })

  it('② 开关按当前选中阶段读写:切到 review 后 POST 键的阶段半边是 review', async () => {
    renderView()
    await screen.findByTestId('wb-hooks')
    fireEvent.click(screen.getByTestId('wb-step-review'))
    fireEvent.click(await screen.findByTestId('wb-hk-sw-session-start'))
    await waitFor(() => expect(hookPosts.length).toBe(1))
    const body = JSON.parse(hookPosts[0]!) as { hook: string; phase: string; enabled: boolean }
    expect(body.hook).toBe('session-start')
    expect(body.phase).toBe('review')
    expect(body.enabled).toBe(false)
  })

  it('③ 安全门说明卡:强制常开与未接线两段人话说明(决议#2 回归)', async () => {
    renderView()
    const card = await screen.findByTestId('wb-side-safegate')
    expect(card.textContent).toContain('强制常开')
    expect(card.textContent).toContain('不做假开关')
  })

  it('④ 矩阵入口卡(v8-E 已并入「技能健康」页签):自定义 workflow 下可点,点击切到 default;default 下按钮禁用', async () => {
    renderView()
    const health = await screen.findByTestId('wb-pane-health')
    const btn = await within(health).findByTestId('wb-mx-open')
    expect(btn).toBeEnabled()
    fireEvent.click(btn)
    await waitFor(() => expect(screen.getByTestId('wb-wf-btn').textContent).toContain('default'))
    expect(screen.getByTestId('wb-mx-open')).toBeDisabled()
  })
})

/**
 * v8-E（意见⑥）：主列 sheet 页签化——五页签(阶段编辑/自动运行/AFK 执行/凭证/技能健康),
 * pane 恒挂载切 .on 显隐(各卡数据面行为与平铺时代一致,既有 T16/T21/T8 用例不用点页签就能
 * 寻址);点阶段卡驱动 sheet 切回「阶段编辑」页。墨线/crossfade 是 GSAP 装饰动画,jsdom 不断言。
 */
describe('WorkbenchView v8-E：sheet 页签化', () => {
  it('五页签渲染,默认「阶段编辑」选中;切页签换 aria-selected 与 pane .on;各页宿主卡就位', async () => {
    renderView()
    await screen.findByTestId('wb-step-draft')
    for (const k of ['stage', 'loop', 'afk', 'secrets', 'health']) {
      expect(screen.getByTestId(`wb-tab-${k}`)).toBeInTheDocument()
      expect(screen.getByTestId(`wb-pane-${k}`)).toBeInTheDocument()
    }
    expect(screen.getByTestId('wb-tab-stage')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('wb-pane-stage').className).toContain('on')
    // 各页宿主卡在自己的 pane 里（恒挂载——换页签不重挂数据面）
    expect(within(screen.getByTestId('wb-pane-stage')).getByTestId('wb-editor')).toBeInTheDocument()
    expect(within(screen.getByTestId('wb-pane-loop')).getByTestId('wb-loop-card')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('wb-tab-loop'))
    expect(screen.getByTestId('wb-tab-loop')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('wb-tab-stage')).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByTestId('wb-pane-loop').className).toContain('on')
    expect(screen.getByTestId('wb-pane-stage').className).not.toContain('on')
  })

  it('点阶段卡=选中并驱动 sheet 切回「阶段编辑」页签(其它页签停留态被拉回)', async () => {
    renderView()
    await screen.findByTestId('wb-step-draft')
    fireEvent.click(screen.getByTestId('wb-tab-secrets'))
    expect(screen.getByTestId('wb-tab-secrets')).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(screen.getByTestId('wb-step-review'))
    expect(screen.getByTestId('wb-tab-stage')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('wb-pane-stage').className).toContain('on')
    expect(screen.getByTestId('wb-editor-stage')).toHaveTextContent('review')
  })

  it('右栏瘦身:摘要/安全门/最近流转留守,SkillHealthPanel 并入「技能健康」页签(skh 标题在 pane 内)', async () => {
    renderView()
    await screen.findByTestId('wb-step-draft')
    const side = screen.getByTestId('workbench-view').querySelector('.side-col')
    expect(side).not.toBeNull()
    expect(within(side as HTMLElement).getByTestId('wb-sum-stages')).toBeInTheDocument()
    expect(within(side as HTMLElement).getByTestId('wb-side-safegate')).toBeInTheDocument()
    expect(within(side as HTMLElement).getByTestId('wb-recent')).toBeInTheDocument()
    // 技能齐全度面不再在右栏——在「技能健康」页签里
    expect(within(side as HTMLElement).queryByText('技能齐全度')).toBeNull()
    expect(within(screen.getByTestId('wb-pane-health')).getByText('技能齐全度')).toBeInTheDocument()
  })
})

/**
 * demo↔生产残余差异清单 #4（评审登记项，补测试不改实现）：五个 wb8-pane 恒挂载、只切 .on
 * 类显隐（见上方 JSX 头注释 :748-749）——切页签不卸载 StepEditor，编辑到一半、还没提交的
 * 草稿应原样保留。探针刻意不选「阶段名称」input：那是受控自 def（WorkbenchView 状态，T13
 * 起 def 本身就是编辑草稿），即便 pane 被条件卸载重挂载，重新读同一个 def.steps[].label 也会
 * "看似"保留，测不出真差异。StepEditor 里唯一真正活在组件自身 useState、不进 def 的，是
 * 「+ 添加」产出物 chip 的输入态（adding/draft，见 StepEditor.tsx commitAdd 头注释）——
 * 若 pane 被卸载重挂载，这个 useState 必被清空复位，是能证伪的探针。
 */
describe('WorkbenchView v8-E：pane 恒挂载保留未提交草稿（demo↔生产差异清单 #4）', () => {
  it('阶段编辑页「+ 添加」产出物输入框键入草稿不提交，切到「自动运行」页再切回，草稿原样保留', async () => {
    renderView()
    await screen.findByTestId('wb-step-draft')

    // 进入「+ 添加」就地输入态，键入草稿——不按 Enter/失焦提交，此刻只活在 StepEditor 本地 state。
    fireEvent.click(screen.getByRole('button', { name: '+ 添加' }))
    const input = screen.getByTestId('wb-ed-output-input')
    fireEvent.change(input, { target: { value: 'draft_wip_field' } })
    expect(input).toHaveValue('draft_wip_field')

    // 切到「自动运行」页签（pane 显隐切 .on，不卸载）。
    fireEvent.click(screen.getByTestId('wb-tab-loop'))
    expect(screen.getByTestId('wb-pane-loop').className).toContain('on')
    expect(screen.getByTestId('wb-pane-stage').className).not.toContain('on')

    // 切回「阶段编辑」页——若 StepEditor 曾被卸载重挂载，adding/draft 这两个本地 state 会复位，
    // 「+ 添加」输入框会消失、换回未展开的 + 按钮；恒挂载则原样还在同一个输入框、同一段草稿文本。
    fireEvent.click(screen.getByTestId('wb-tab-stage'))
    expect(screen.getByTestId('wb-pane-stage').className).toContain('on')
    expect(screen.getByTestId('wb-ed-output-input')).toHaveValue('draft_wip_field')

    // 仍是未提交草稿：没有被打断提交成正式产出物 chip，保存钮也不会因此被点亮。
    expect(within(screen.getByTestId('wb-ed-outputs')).queryByText('draft_wip_field')).toBeNull()
    expect(screen.queryByTestId('wb-dirty')).toBeNull()
  })
})

/**
 * v6 T13：「最近流转」——真实 history 事件回放(假预演退役后的右栏接棒)。数据面:当前
 * (root, workflow) 分组内非 archived change 逐个 GET /api/change/:name/history,合并降序取
 * 最近 N 条;单 change 无记录计入 legacy 标注(决议#10);archived 不入列(决议#5);无轮询(G22)。
 */
describe('WorkbenchView v6 T13：最近流转(真实 history 回放)', () => {
  const HIST: Record<string, Array<Record<string, string>>> = {
    c1: [
      { ts: '2026-07-11T01:00:00Z', kind: 'transition', from: 'draft', to: 'review' },
      { ts: '2026-07-11T03:00:00Z', kind: 'set', field: 'verify_result' },
    ],
    c2: [{ ts: '2026-07-11T02:00:00Z', kind: 'transition', from: 'review', to: 'ship' }],
    legacy1: [],
  }
  beforeEach(() => {
    const prev = global.fetch
    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      const m = /^\/api\/change\/([^/]+)\/history\?root=/.exec(String(url))
      if (m) {
        const name = decodeURIComponent(m[1]!)
        if (!(name in HIST)) return new Response(JSON.stringify({ ok: false, error: 'no such change' }), { status: 404 })
        return new Response(JSON.stringify({ ok: true, entries: HIST[name] }), { status: 200 })
      }
      return (prev as unknown as typeof fetch)(url as never, opts)
    }) as unknown as typeof fetch
  })

  const snapWith = (changes: ReturnType<typeof makeChange>[]) => makeSnapshot([makeProject(ROOT, changes)])

  it('多 change 事件合并按 ts 降序;archived 不入列;无记录 change 计入 legacy 标注', async () => {
    renderView({
      snapshot: snapWith([
        makeChange('c1', 'review', { fields: { workflow: 'release-train' } }),
        makeChange('c2', 'ship', { fields: { workflow: 'release-train' } }),
        makeChange('legacy1', 'draft', { fields: { workflow: 'release-train' } }),
        makeChange('c-arch', 'ship', { archived: 'true', fields: { workflow: 'release-train' } }),
        makeChange('c-other', 'draft', { fields: { workflow: 'default' } }),
      ]),
    })
    const list = await screen.findByTestId('wb-recent-list')
    const items = Array.from(list.querySelectorAll('.wb-rt-item')).map((li) => li.textContent ?? '')
    expect(items.length).toBe(3)
    expect(items[0]).toContain('verify_result') // 03:00 最新
    expect(items[1]).toContain('review → ship') // 02:00
    expect(items[2]).toContain('draft → review') // 01:00
    expect(items.some((x) => x.includes('c-arch'))).toBe(false)
    expect(screen.getByTestId('wb-recent-legacy').textContent).toContain('1')
  })

  it('分组内无 change → 空态文案,不发请求也不报错', async () => {
    renderView({ snapshot: snapWith([makeChange('c-other', 'draft', { fields: { workflow: 'default' } })]) })
    expect(await screen.findByTestId('wb-recent-empty')).toBeInTheDocument()
  })
})
