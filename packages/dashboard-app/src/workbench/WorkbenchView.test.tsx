import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { invalidateWorkflowRules } from '../model/workflowModel'
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
      id: 'review', label: '人工复核', gate: 'review',
      skills: [], inputs: [], outputs: [], guards: [],
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
  global.fetch = vi.fn(async (url: string) => {
    if (url === `/api/workflows?root=${encodeURIComponent(ROOT)}`) {
      return new Response(JSON.stringify({ names: ['release-train'] }), { status: 200 })
    }
    if (url === `/api/workflows/release-train?root=${encodeURIComponent(ROOT)}`) {
      return new Response(JSON.stringify(RELEASE_TRAIN), { status: 200 })
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
