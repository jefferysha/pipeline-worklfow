import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { invalidateWorkflowRules, useWorkflowRules } from '../model/workflowModel'
import { WorkbenchView } from './WorkbenchView'

const ROOT = '/tmp/proj-a'

// T12 fixture：对照 design-demos/v5-progress-workbench.html 的 release-train 三阶段示例，
// 但形状是真实 server 契约（GET /api/workflows/:name 的 { name, steps: StepDef[] }，同
// WorkflowEditorView.test.tsx 顶层 fixture 一致）。draft 带 3 个技能（验证 chips 截断 +N）、
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

function renderView() {
  render(
    <I18nProvider>
      <WorkbenchView root={ROOT} />
    </I18nProvider>,
  )
}

/** 可控 matchMedia 桩：预演测试驱动 gsap.matchMedia 的 reduced-motion 分支（jsdom 原生恒 false）。 */
function stubMatchMedia(reduceMatches: boolean): void {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: query.includes('prefers-reduced-motion: reduce')
      ? reduceMatches
      : query.includes('no-preference') && !reduceMatches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  })))
}

beforeEach(() => {
  localStorage.clear()
  invalidateWorkflowRules() // 模块级 rules 缓存跨用例清空（同 WorkflowEditorView.test.tsx 既有先例）
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

  it('「+ 添加阶段」按钮以禁用态占位（T13 挂载点）', async () => {
    renderView()
    await screen.findByTestId('wb-step-draft')
    expect(screen.getByRole('button', { name: '+ 添加阶段' })).toBeDisabled()
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

describe('WorkbenchView 流程预览（验收③后半）', () => {
  it('预览节点序 = steps 序，gate 节点带红点', async () => {
    renderView()
    await screen.findByTestId('wb-step-draft')
    const track = screen.getByTestId('wb-pv-track')
    const nodes = Array.from(track.querySelectorAll('.wb-pv-node'))
    expect(nodes.map((n) => n.textContent)).toEqual(['起草', '人工复核', '发布'])
    expect(screen.getByTestId('wb-pv-gdot-review')).toBeInTheDocument()
    expect(screen.queryByTestId('wb-pv-gdot-draft')).toBeNull()
    expect(screen.queryByTestId('wb-pv-gdot-ship')).toBeNull()
  })
})

describe('WorkbenchView 预演（验收④）', () => {
  it('reduced-motion：点「预演」直达终态——节点全亮（末节点绿）、连线全亮、阶段卡同步点亮', async () => {
    stubMatchMedia(true)
    renderView()
    await screen.findByTestId('wb-step-draft')
    fireEvent.click(screen.getByTestId('wb-play'))

    // 钉住实现路径：终态必须来自 gsap.matchMedia 的 reduce 分支（真消费了媒体查询），
    // 而不是「环境不支持 matchMedia」的兜底分支——否则 reduced-motion 契约是假绿。
    const mmCalls = (window.matchMedia as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]))
    expect(mmCalls.some((q) => q.includes('prefers-reduced-motion: reduce'))).toBe(true)

    expect(screen.getByTestId('wb-pv-node-draft')).toHaveClass('lit')
    expect(screen.getByTestId('wb-pv-node-review')).toHaveClass('lit')
    expect(screen.getByTestId('wb-pv-node-ship')).toHaveClass('lit-g')
    expect(screen.getByTestId('wb-pv-line-0')).toHaveClass('lit')
    expect(screen.getByTestId('wb-pv-line-1')).toHaveClass('lit')
    expect(screen.getByTestId('wb-step-draft')).toHaveClass('wb-step--live')
    expect(screen.getByTestId('wb-step-ship')).toHaveClass('wb-step--live-g')
    // 直达终态：不停留在播放中，按钮回到「预演」文案
    expect(screen.getByTestId('wb-play')).toHaveTextContent('预演流程')
  })

  it('切换 workflow 复位预演点亮态', async () => {
    stubMatchMedia(true)
    renderView()
    await screen.findByTestId('wb-step-draft')
    fireEvent.click(screen.getByTestId('wb-play'))
    expect(screen.getByTestId('wb-pv-node-draft')).toHaveClass('lit')

    fireEvent.click(screen.getByTestId('wb-wf-btn'))
    fireEvent.click(await screen.findByTestId('wb-wf-item-default'))
    await screen.findByTestId('wb-step-open')
    expect(screen.getByTestId('wb-pv-node-open')).not.toHaveClass('lit')
  })
})

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
    expect(screen.getByTestId('wb-pv-node-draft')).toHaveTextContent('初稿')
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

// 验收②后半：保存成功 → (root,name) 规则缓存失效（同 WorkflowCanvas.test.tsx 评审 P0-4 的
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
