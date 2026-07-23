import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { invalidateWorkflowRules } from '../model/workflowModel'
import { invalidateMandatoryConfig } from './mandatorySkills'
import { WorkbenchView } from './WorkbenchView'

const ROOT = '/tmp/proj-a'

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

function renderView(props: Partial<Parameters<typeof WorkbenchView>[0]> = {}) {
  render(
    <I18nProvider>
      <WorkbenchView root={ROOT} {...props} />
    </I18nProvider>,
  )
}

async function selectStage(stage: string): Promise<HTMLElement> {
  const step = await screen.findByTestId(`wb-step-${stage}`)
  fireEvent.click(step)
  return screen.findByTestId(`wb-lane-hooks-${stage}`)
}

beforeEach(() => {
  localStorage.clear()
  invalidateWorkflowRules()
  invalidateMandatoryConfig()
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
    if (url === '/api/hooks' && opts?.method === 'POST') return postHooksResponse()
    if (url.startsWith('/api/config?root=')) {
      return new Response(JSON.stringify({
        ok: true,
        generated_at: '2026-07-19T00:00:00Z',
        revision: 'hooks-r5',
        source: 'builtin-only',
        mandatory_skills_writable_profiles: ['pm', 'frontend', 'backend'],
        mandatory_skills: {},
        tracks: ['pm', 'frontend', 'backend'].map((id, index) => ({
          id,
          label: id,
          builtin: true,
          workflow: { default: 'default', allowed: '*' },
          policyProfile: {
            reviewSeed: id === 'pm' ? 'skipped' : 'pending',
            automationEligible: true,
            coverageProfile: id,
            routing: { enabled: true, pattern: id, priority: 100 + index },
            skills: { matrix: true, profile: id },
          },
        })),
      }), { status: 200 })
    }
    if (url === '/api/skills/registry') return new Response(JSON.stringify({ skills: [] }), { status: 200 })
    if (url === '/api/loops/snapshot') {
      return new Response(JSON.stringify({ generated_at: '2026-07-11T00:00:00Z', rows: [] }), { status: 200 })
    }
    throw new Error(`unexpected fetch ${url}`)
  }) as unknown as typeof fetch
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('纵向阶段编辑器 Hook 执行链', () => {
  it('在一条执行时间线上展示四个时机，并把 8 个 Hook 放进真实时机', async () => {
    renderView()
    const zone = await selectStage('draft')

    for (const [event, title] of [
      ['SessionStart', '进入阶段'],
      ['UserPromptSubmit', '准备输入'],
      ['PreToolUse', '工具调用前'],
      ['PostToolUse', '工具调用后'],
    ]) {
      expect(within(zone).getByTestId(`wb-timeline-node-${event}`)).toHaveTextContent(title)
    }

    for (const id of HOOKS.map((hook) => hook.id)) {
      expect(within(zone).getByTestId(`wb-timeline-hook-${id}`)).toBeInTheDocument()
    }
    const router = within(zone).getByTestId('wb-timeline-hook-router')
    expect(router).toHaveTextContent('按轨道路由提示')
    expect(router).toHaveTextContent('运行时启用路由的轨道各给对的方法论')
    expect(router).toHaveTextContent('内置 Hook')
    expect(router).toHaveAttribute('title', expect.stringContaining('hooks/router.sh'))
    expect(router).toHaveAttribute('title', expect.stringContaining('匹配 *'))
  })

  it('内置强制 Hook 不提供假开关；允许调整的 Hook 才提供真实开关', async () => {
    renderView()
    const zone = await selectStage('draft')

    for (const id of ['gate', 'confirm-clear', 'decision-recorder', 'interactive-skill-gate']) {
      const row = within(zone).getByTestId(`wb-timeline-hook-${id}`)
      expect(row).toHaveTextContent('内置 Hook')
      expect(within(row).queryByRole('switch')).toBeNull()
    }
    for (const id of ['session-start', 'breadcrumb', 'router', 'skill-tracker']) {
      const sw = within(zone).getByTestId(`wb-lane-hk-sw-draft-${id}`)
      expect(sw).toBeEnabled()
      expect(sw).toHaveAttribute('aria-checked', 'true')
    }
  })
})

describe('纵向阶段编辑器 Hook 写回', () => {
  it('关掉 router：乐观更新并写入当前阶段，运行前事实同步为 7/8', async () => {
    renderView()
    const zone = await selectStage('draft')
    const facts = screen.getByTestId('wb-runtime-facts')
    await waitFor(() => expect(facts).toHaveTextContent('8 个 Hook · 8/8 已启用'))

    const sw = within(zone).getByTestId('wb-lane-hk-sw-draft-router')
    fireEvent.click(sw)
    expect(sw).toHaveAttribute('aria-checked', 'false')
    await waitFor(() => {
      const post = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        ([url, options]) => url === '/api/hooks' && (options as RequestInit)?.method === 'POST',
      )
      expect(post).toBeTruthy()
      expect(JSON.parse(String((post![1] as RequestInit).body))).toEqual({
        root: ROOT, hook: 'router', phase: 'draft', enabled: false,
      })
    })
    await waitFor(() => expect(facts).toHaveTextContent('7 个 Hook · 7/8 已启用'))
  })

  it('切到 review 后写回 review，draft 的矩阵状态不会串到 review', async () => {
    hooksMatrix = { 'router.draft': false }
    renderView()
    const draft = await selectStage('draft')
    expect(within(draft).getByTestId('wb-lane-hk-sw-draft-router')).toHaveAttribute('aria-checked', 'false')

    const review = await selectStage('review')
    const reviewSwitch = within(review).getByTestId('wb-lane-hk-sw-review-router')
    expect(reviewSwitch).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(reviewSwitch)
    await waitFor(() => {
      const post = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        ([url, options]) => url === '/api/hooks' && (options as RequestInit)?.method === 'POST',
      )
      expect(JSON.parse(String((post![1] as RequestInit).body))).toEqual({
        root: ROOT, hook: 'router', phase: 'review', enabled: false,
      })
    })
  })

  it('POST 失败会回滚开关与运行前事实', async () => {
    postHooksResponse = () => new Response(JSON.stringify({ ok: false, error: '磁盘只读' }), { status: 500 })
    renderView()
    const zone = await selectStage('draft')
    const sw = within(zone).getByTestId('wb-lane-hk-sw-draft-router')
    fireEvent.click(sw)
    expect(sw).toHaveAttribute('aria-checked', 'false')
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'true'))
    expect(screen.getByTestId('wb-runtime-facts')).toHaveTextContent('8 个 Hook · 8/8 已启用')
  })

  it('POST 失败通过宿主错误出口保留服务端原文', async () => {
    postHooksResponse = () => new Response(JSON.stringify({ ok: false, error: '磁盘只读' }), { status: 500 })
    const onToggleError = vi.fn()
    renderView({ onToggleError })
    const zone = await selectStage('draft')
    fireEvent.click(within(zone).getByTestId('wb-lane-hk-sw-draft-router'))
    await waitFor(() => expect(onToggleError).toHaveBeenCalledTimes(1))
    expect(String(onToggleError.mock.calls[0]![0])).toContain('磁盘只读')
  })
})
