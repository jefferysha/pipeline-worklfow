import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { invalidateWorkflowRules } from '../model/workflowModel'
import { WorkbenchView } from './WorkbenchView'

const ROOT = '/tmp/proj-a'

// T15 fixture：GET /api/hooks 的 hooks 元数据——与 server/hooksConfig.ts::HOOK_METAS 逐条同形
// （8 hook + 时机归类以 plugin 注册为准；gate/interactive-skill-gate 强制常开、
// confirm-clear/decision-recorder 暂不可配，都是 configurable:false）。
const HOOKS = [
  { id: 'session-start', event: 'SessionStart', matcher: '*', script: 'hooks/session-start.sh', configurable: true },
  { id: 'breadcrumb', event: 'UserPromptSubmit', matcher: '*', script: 'hooks/breadcrumb.sh', configurable: true },
  { id: 'router', event: 'UserPromptSubmit', matcher: '*', script: 'hooks/router.sh', configurable: true },
  { id: 'gate', event: 'PreToolUse', matcher: 'Skill|Bash|Edit|Write|MultiEdit', script: 'hooks/gate.sh', configurable: false },
  { id: 'confirm-clear', event: 'PostToolUse', matcher: 'AskUserQuestion', script: 'hooks/confirm-clear.sh', configurable: false },
  { id: 'decision-recorder', event: 'PostToolUse', matcher: 'AskUserQuestion', script: 'hooks/decision-recorder.sh', configurable: false },
  { id: 'skill-tracker', event: 'PostToolUse', matcher: 'Skill', script: 'hooks/skill-tracker.sh', configurable: true },
  { id: 'interactive-skill-gate', event: 'PostToolUse', matcher: 'Skill', script: 'hooks/interactive-skill-gate.sh', configurable: false },
]

// 与 WorkbenchView.test.tsx 同款三阶段 workflow（draft/review/ship），Hook 开关按选中阶段写键。
const RELEASE_TRAIN = {
  name: 'release-train',
  steps: [
    {
      id: 'draft', label: '起草', gate: null,
      skills: [], inputs: [], outputs: [], guards: [],
      transitions: [{ event: 'submitted', to: 'review' }],
    },
    {
      id: 'review', label: '人工复核', gate: 'review',
      skills: [], inputs: [], outputs: [], guards: [],
      transitions: [{ event: 'approved', to: 'ship' }],
    },
    { id: 'ship', label: '发布', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
  ],
}

let hooksMatrix: Record<string, false>
let postHooksResponse: () => Response

function renderView() {
  render(
    <I18nProvider>
      <WorkbenchView root={ROOT} />
    </I18nProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  invalidateWorkflowRules()
  hooksMatrix = {}
  postHooksResponse = () => new Response(JSON.stringify({ ok: true }), { status: 200 })
  global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
    if (url === `/api/workflows?root=${encodeURIComponent(ROOT)}`) {
      return new Response(JSON.stringify({ names: ['release-train'] }), { status: 200 })
    }
    if (url === `/api/workflows/release-train?root=${encodeURIComponent(ROOT)}`) {
      return new Response(JSON.stringify(RELEASE_TRAIN), { status: 200 })
    }
    if (url === `/api/hooks?root=${encodeURIComponent(ROOT)}`) {
      return new Response(JSON.stringify({ ok: true, hooks: HOOKS, matrix: hooksMatrix }), { status: 200 })
    }
    if (url === '/api/hooks' && opts?.method === 'POST') {
      return postHooksResponse()
    }
    throw new Error(`unexpected fetch ${url}`)
  }) as unknown as typeof fetch
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('HookTimeline 四时机分组（验收①）', () => {
  it('水平时序线渲染四时机节点 + 每轮重复标注 + 区头说明，8 个 hook 卡各归其时机列', async () => {
    renderView()
    const sec = await screen.findByTestId('wb-hooks')

    // 四时机节点：人话标题 + 事件名
    for (const [title, ev] of [
      ['会话开始', 'SessionStart'],
      ['你发消息', 'UserPromptSubmit'],
      ['agent 调工具', 'PreToolUse'],
      ['工具完成', 'PostToolUse'],
    ]) {
      const node = within(sec).getByTestId(`wb-hk-node-${ev}`)
      expect(node).toHaveTextContent(title!)
      expect(node).toHaveTextContent(ev!)
    }
    // 中段「每轮重复」循环标注 + 区头人话说明
    expect(within(sec).getByText('⟳ 每轮工具调用都重复')).toBeInTheDocument()
    expect(within(sec).getByText(/钩子实际作用在终端里的 Claude Code 会话上/)).toBeInTheDocument()

    // 8 卡按 plugin 注册的时机归类（不凭名字猜：interactive-skill-gate 在 PostToolUse）
    const stackOf = (ev: string) => within(sec).getByTestId(`wb-hk-stack-${ev}`)
    expect(within(stackOf('SessionStart')).getByTestId('wb-hk-session-start')).toBeInTheDocument()
    expect(within(stackOf('UserPromptSubmit')).getByTestId('wb-hk-breadcrumb')).toBeInTheDocument()
    expect(within(stackOf('UserPromptSubmit')).getByTestId('wb-hk-router')).toBeInTheDocument()
    expect(within(stackOf('PreToolUse')).getByTestId('wb-hk-gate')).toBeInTheDocument()
    for (const id of ['confirm-clear', 'decision-recorder', 'skill-tracker', 'interactive-skill-gate']) {
      expect(within(stackOf('PostToolUse')).getByTestId(`wb-hk-${id}`)).toBeInTheDocument()
    }
    // 人话卡：名称 + 一句做什么
    const router = within(sec).getByTestId('wb-hk-router')
    expect(router).toHaveTextContent('按轨道路由提示')
    expect(router).toHaveTextContent('pm / frontend / backend 各给对的方法论')
  })
})

describe('HookTimeline 锁定态与灰显（验收③）', () => {
  it('gate/interactive-skill-gate：「强制常开」badge + 开关禁用恒开；confirm-clear/decision-recorder：灰显「暂不可配」', async () => {
    renderView()
    await screen.findByTestId('wb-hooks')
    for (const id of ['gate', 'interactive-skill-gate']) {
      const card = screen.getByTestId(`wb-hk-${id}`)
      expect(within(card).getByText('强制常开')).toBeInTheDocument()
      const sw = screen.getByTestId(`wb-hk-sw-${id}`)
      expect(sw).toBeDisabled()
      expect(sw).toHaveAttribute('aria-checked', 'true')
    }
    for (const id of ['confirm-clear', 'decision-recorder']) {
      const card = screen.getByTestId(`wb-hk-${id}`)
      expect(card).toHaveClass('wb-hkcard--pending')
      expect(within(card).getByText('暂不可配')).toBeInTheDocument()
      expect(screen.getByTestId(`wb-hk-sw-${id}`)).toBeDisabled()
    }
  })
})

describe('HookTimeline 开关写回（验收②）', () => {
  it('关掉 router：乐观翻转 + POST body 按当前选中阶段；阶段卡/摘要计数联动 8→7', async () => {
    renderView()
    await screen.findByTestId('wb-hooks')
    // 数据面就绪后：阶段卡与摘要出真数（8 个 hook 全启用）
    const draft = screen.getByTestId('wb-step-draft')
    expect(within(draft).getByText(/8 钩子/)).toBeInTheDocument()
    expect(screen.getByTestId('wb-sum-hooks')).toHaveTextContent('8')

    const sw = screen.getByTestId('wb-hk-sw-router')
    expect(sw).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(sw)
    // 乐观更新：POST 未返回就先翻
    expect(sw).toHaveAttribute('aria-checked', 'false')
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
      const post = calls.find(([u, o]) => u === '/api/hooks' && (o as RequestInit)?.method === 'POST')
      expect(post).toBeTruthy()
      expect(JSON.parse(String((post![1] as RequestInit).body))).toEqual({
        root: ROOT, hook: 'router', phase: 'draft', enabled: false,
      })
    })
    // 计数联动：draft 卡 8→7，其他阶段仍 8；摘要（全阶段完全启用的 hook 数）8→7
    await waitFor(() => expect(within(draft).getByText(/7 钩子/)).toBeInTheDocument())
    expect(within(screen.getByTestId('wb-step-review')).getByText(/8 钩子/)).toBeInTheDocument()
    expect(screen.getByTestId('wb-sum-hooks')).toHaveTextContent('7')
  })

  it('POST 失败：回滚开关与计数 + 错误提示带 server 原文', async () => {
    postHooksResponse = () => new Response(JSON.stringify({ ok: false, error: '磁盘只读' }), { status: 500 })
    renderView()
    await screen.findByTestId('wb-hooks')
    const sw = screen.getByTestId('wb-hk-sw-router')
    fireEvent.click(sw)
    expect(sw).toHaveAttribute('aria-checked', 'false') // 乐观先翻
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'true')) // 失败回滚
    expect(screen.getByTestId('wb-hk-toggle-error')).toHaveTextContent('磁盘只读')
    expect(within(screen.getByTestId('wb-step-draft')).getByText(/8 钩子/)).toBeInTheDocument()
  })

  it('矩阵预置禁用键只作用在对应阶段：router.draft 禁用时，draft 关/review 开', async () => {
    hooksMatrix = { 'router.draft': false }
    renderView()
    await screen.findByTestId('wb-hooks')
    expect(screen.getByTestId('wb-hk-sw-router')).toHaveAttribute('aria-checked', 'false')
    expect(within(screen.getByTestId('wb-step-draft')).getByText(/7 钩子/)).toBeInTheDocument()
    expect(within(screen.getByTestId('wb-step-review')).getByText(/8 钩子/)).toBeInTheDocument()
    // 摘要=全阶段完全启用的 hook 数：router 在 draft 被关 → 7
    expect(screen.getByTestId('wb-sum-hooks')).toHaveTextContent('7')

    // 切到 review 阶段：同一张卡的开关反映 review 的矩阵（未禁用 → 开）
    fireEvent.click(screen.getByTestId('wb-step-review'))
    expect(screen.getByTestId('wb-hk-sw-router')).toHaveAttribute('aria-checked', 'true')
  })
})
