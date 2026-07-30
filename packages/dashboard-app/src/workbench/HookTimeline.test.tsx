import type { ReactNode } from 'react'
import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider, useT } from '../i18n'
import { invalidateWorkflowRules } from '../model/workflowModel'
import { invalidateMandatoryConfig } from './mandatorySkills'
import { useHooksConfig } from './HookTimeline'
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
let promptSkipKeyword: string
let postPromptBypassResponse: () => Response
let hooksGetResponse: () => Response | Promise<Response>

function renderView(props: Partial<Parameters<typeof WorkbenchView>[0]> = {}) {
  render(
    <I18nProvider>
      <WorkbenchView root={ROOT} {...props} />
    </I18nProvider>,
  )
}

function PromptSkipLocaleRaceHarness(): JSX.Element {
  const { setLang } = useT()
  const config = useHooksConfig(ROOT)
  return (
    <>
      <button type="button" onClick={() => setLang('en')}>switch locale</button>
      <button
        type="button"
        onClick={() => void config.savePromptSkipKeyword('saved-tenon')}
      >
        save keyword
      </button>
      <span data-testid="prompt-skip-keyword">{config.promptSkipKeyword ?? 'loading'}</span>
      <span data-testid="prompt-skip-busy">{String(config.promptSkipBusy)}</span>
    </>
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
  promptSkipKeyword = 'no-tenon'
  postHooksResponse = () => new Response(JSON.stringify({ ok: true }), { status: 200 })
  postPromptBypassResponse = () => new Response(JSON.stringify({
    ok: true,
    prompt_skip_keyword: promptSkipKeyword,
  }), { status: 200 })
  hooksGetResponse = () => new Response(JSON.stringify({
    ok: true,
    hooks: HOOKS,
    matrix: hooksMatrix,
    prompt_skip_keyword: promptSkipKeyword,
  }), { status: 200 })
  global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
    if (url === `/api/workflows?root=${encodeURIComponent(ROOT)}`) {
      return new Response(JSON.stringify({ names: ['release-train'] }), { status: 200 })
    }
    if (url === `/api/workflows/release-train?root=${encodeURIComponent(ROOT)}`) {
      return new Response(JSON.stringify(RELEASE_TRAIN), { status: 200 })
    }
    if (url === `/api/hooks?root=${encodeURIComponent(ROOT)}`) {
      return hooksGetResponse()
    }
    if (url === '/api/hooks' && opts?.method === 'POST') return postHooksResponse()
    if (url === '/api/hooks/prompt-routing-bypass' && opts?.method === 'POST') {
      const body = JSON.parse(String(opts.body)) as { prompt_skip_keyword: string }
      const response = postPromptBypassResponse()
      if (response.ok) promptSkipKeyword = body.prompt_skip_keyword
      return response
    }
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

describe('UserPromptSubmit 单轮旁路词', () => {
  it('旁路词草稿上报统一 dirty；改回服务端值或保存成功后清除', async () => {
    const onDirtyChange = vi.fn()
    postPromptBypassResponse = () => new Response(JSON.stringify({
      ok: true,
      prompt_skip_keyword: 'saved-tenon',
    }), { status: 200 })
    renderView({ onDirtyChange })
    const zone = await selectStage('draft')
    const editor = await within(zone).findByTestId('wb-prompt-routing-bypass')
    const input = within(editor).getByRole('textbox', { name: '单轮旁路词' })
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false))

    fireEvent.change(input, { target: { value: 'draft-tenon' } })
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true))

    fireEvent.change(input, { target: { value: 'no-tenon' } })
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false))

    fireEvent.change(input, { target: { value: 'saved-tenon' } })
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true))
    fireEvent.click(within(editor).getByRole('button', { name: '保存旁路词' }))
    expect(await within(editor).findByRole('status')).toHaveTextContent('saved-tenon')
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false))
  })

  it('英文 locale 的加载状态不泄漏中文', async () => {
    localStorage.setItem('tenon-dashboard-lang', 'en')
    hooksGetResponse = () => new Promise<Response>(() => {})
    renderView()
    const zone = await selectStage('draft')
    expect(within(zone).getAllByText('Reading Hook configuration…')).toHaveLength(4)
    expect(within(zone).queryByText('Hook 配置读取中…')).toBeNull()
  })

  it('读取失败显示 alert，不把失败谎报为持续 loading', async () => {
    hooksGetResponse = () => new Response(JSON.stringify({ ok: false, error: '配置损坏' }), { status: 500 })
    renderView()
    const zone = await selectStage('draft')
    expect(await within(zone).findByRole('alert')).toHaveTextContent('无法读取 Hook 配置，请重试。')
    expect(within(zone).queryByText('配置损坏')).toBeNull()
    expect(within(zone).queryByText('Hook 配置读取中…')).toBeNull()
  })

  it('英文 GET 失败不泄漏中文 server 详情', async () => {
    localStorage.setItem('tenon-dashboard-lang', 'en')
    hooksGetResponse = () => new Response(JSON.stringify({ ok: false, error: '配置损坏' }), { status: 500 })
    renderView()
    const zone = await selectStage('draft')
    expect(await within(zone).findByRole('alert')).toHaveTextContent('Could not load Hook configuration. Try again.')
    expect(within(zone).queryByText('配置损坏')).toBeNull()
  })

  it('初始加载空字符串时持续显示已禁用状态，且使用高对比文本 token', async () => {
    promptSkipKeyword = ''
    renderView()
    const zone = await selectStage('draft')
    const editor = await within(zone).findByTestId('wb-prompt-routing-bypass')
    const status = within(editor).getByRole('status')
    expect(status).toHaveTextContent('已禁用')
    expect(status).toHaveClass('text-green-d')
    expect(status).not.toHaveClass('text-green')
  })

  it.each([
    ['zh', 'path/no-tenon.md', '路径分隔符'],
    ['en', 'path/no-tenon.md', 'path separators'],
  ] as const)('%s 提示明确说明标点与路径边界', async (lang, example, boundaryCopy) => {
    localStorage.setItem('tenon-dashboard-lang', lang)
    renderView()
    const zone = await selectStage('draft')
    const editor = await within(zone).findByTestId('wb-prompt-routing-bypass')
    expect(editor).toHaveTextContent(example)
    expect(editor).toHaveTextContent(boundaryCopy)
  })

  it('加载真实值并可用 Enter 保存，成功状态以 server 返回值为准', async () => {
    renderView()
    const zone = await selectStage('draft')
    const editor = await within(zone).findByTestId('wb-prompt-routing-bypass')
    const input = within(editor).getByRole('textbox', { name: '单轮旁路词' })
    expect(input).toHaveValue('no-tenon')
    fireEvent.change(input, { target: { value: 'skip-tenon' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
    await waitFor(() => {
      const post = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        ([url]) => url === '/api/hooks/prompt-routing-bypass',
      )
      expect(JSON.parse(String((post![1] as RequestInit).body))).toEqual({
        root: ROOT,
        prompt_skip_keyword: 'skip-tenon',
      })
    })
    expect(await within(editor).findByRole('status')).toHaveTextContent('skip-tenon')
  })

  it('清空草稿不会隐式关闭开关，可继续键入并用 Enter 保存替换词', async () => {
    renderView()
    const zone = await selectStage('draft')
    const editor = await within(zone).findByTestId('wb-prompt-routing-bypass')
    const input = within(editor).getByRole('textbox', { name: '单轮旁路词' })
    const toggle = within(editor).getByRole('switch', { name: '启用单轮旁路' })

    fireEvent.change(input, { target: { value: '' } })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(input).toBeEnabled()

    fireEvent.change(input, { target: { value: 'replacement-tenon' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
    await waitFor(() => {
      const post = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        ([url]) => url === '/api/hooks/prompt-routing-bypass',
      )
      expect(JSON.parse(String((post![1] as RequestInit).body))).toEqual({
        root: ROOT,
        prompt_skip_keyword: 'replacement-tenon',
      })
    })
  })

  it('非法草稿显示 alert 且不发送请求', async () => {
    renderView()
    const zone = await selectStage('draft')
    const editor = await within(zone).findByTestId('wb-prompt-routing-bypass')
    const input = within(editor).getByRole('textbox', { name: '单轮旁路词' })
    fireEvent.change(input, { target: { value: 'has space' } })
    fireEvent.click(within(editor).getByRole('button', { name: '保存旁路词' }))
    expect(within(editor).getByRole('alert')).toHaveTextContent('1–32')
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.some(
      ([url]) => url === '/api/hooks/prompt-routing-bypass',
    )).toBe(false)
  })

  it('关闭后保存空字符串；保存失败保留草稿并可重试', async () => {
    postPromptBypassResponse = () => new Response(JSON.stringify({ ok: false, error: '磁盘只读' }), { status: 500 })
    renderView()
    const zone = await selectStage('draft')
    const editor = await within(zone).findByTestId('wb-prompt-routing-bypass')
    fireEvent.click(within(editor).getByRole('switch', { name: '启用单轮旁路' }))
    fireEvent.click(within(editor).getByRole('button', { name: '保存旁路词' }))
    expect(await within(editor).findByRole('alert')).toHaveTextContent('旁路词未保存，请重试。')
    expect(within(editor).queryByText('磁盘只读')).toBeNull()
    expect(within(editor).getByRole('textbox', { name: '单轮旁路词' })).toHaveValue('')

    postPromptBypassResponse = () => new Response(JSON.stringify({
      ok: true,
      prompt_skip_keyword: '',
    }), { status: 200 })
    fireEvent.click(within(editor).getByRole('button', { name: '重试保存' }))
    expect(await within(editor).findByRole('status')).toHaveTextContent('已禁用')
  })

  it.each([
    {
      label: 'server 错误',
      response: () => Promise.resolve(new Response(JSON.stringify({ ok: false, error: '磁盘只读' }), { status: 500 })),
    },
    {
      label: 'network 错误',
      response: () => Promise.reject(new Error('网络断开')),
    },
    {
      label: 'malformed response',
      response: () => Promise.resolve(new Response(JSON.stringify({ ok: true, prompt_skip_keyword: 42 }), { status: 200 })),
    },
    {
      label: 'out-of-contract string response',
      response: () => Promise.resolve(new Response(JSON.stringify({ ok: true, prompt_skip_keyword: 'bad value' }), { status: 200 })),
    },
  ])('英文 POST $label 不泄漏中文底层详情', async ({ response }) => {
    localStorage.setItem('tenon-dashboard-lang', 'en')
    const baseFetch = global.fetch
    global.fetch = vi.fn((url: string, opts?: RequestInit) => {
      if (url === '/api/hooks/prompt-routing-bypass' && opts?.method === 'POST') return response()
      return baseFetch(url, opts)
    }) as unknown as typeof fetch
    renderView()
    const zone = await selectStage('draft')
    const editor = await within(zone).findByTestId('wb-prompt-routing-bypass')
    fireEvent.change(within(editor).getByRole('textbox', { name: 'One-turn bypass keyword' }), {
      target: { value: 'skip-tenon' },
    })
    const save = within(editor).getByRole('button', { name: 'Save bypass keyword' })
    expect(save).toHaveClass('bg-btn-bg', 'text-btn-fg')
    expect(save).not.toHaveClass('text-white')
    fireEvent.click(save)
    expect(await within(editor).findByRole('alert')).toHaveTextContent('Bypass keyword was not saved. Try again.')
    expect(within(editor).queryByText(/磁盘|网络/)).toBeNull()
  })

  it.each([
    {
      label: '旧 root 的迟到成功',
      response: () => new Response(JSON.stringify({ ok: true, prompt_skip_keyword: 'root-a-value' }), { status: 200 }),
    },
    {
      label: '旧 root 的迟到失败',
      response: () => new Response(JSON.stringify({ ok: false, error: 'root A 磁盘只读' }), { status: 500 }),
    },
  ])('$label 不覆盖新 root 的 keyword/error/busy', async ({ response }) => {
    const rootB = '/tmp/proj-b'
    let resolveSave: ((value: Response) => void) | undefined
    global.fetch = vi.fn((url: string, opts?: RequestInit) => {
      if (url === `/api/hooks?root=${encodeURIComponent(ROOT)}`) {
        return Promise.resolve(new Response(JSON.stringify({
          ok: true, hooks: HOOKS, matrix: {}, prompt_skip_keyword: 'root-a',
        }), { status: 200 }))
      }
      if (url === `/api/hooks?root=${encodeURIComponent(rootB)}`) {
        return Promise.resolve(new Response(JSON.stringify({
          ok: true, hooks: HOOKS, matrix: {}, prompt_skip_keyword: 'root-b',
        }), { status: 200 }))
      }
      if (url === '/api/hooks/prompt-routing-bypass' && opts?.method === 'POST') {
        return new Promise<Response>((resolve) => {
          resolveSave = resolve
        })
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`))
    }) as unknown as typeof fetch
    const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider>{children}</I18nProvider>
    const hook = renderHook(({ root }) => useHooksConfig(root), {
      initialProps: { root: ROOT },
      wrapper,
    })
    await waitFor(() => expect(hook.result.current.promptSkipKeyword).toBe('root-a'))

    let saveResult: Promise<boolean> | undefined
    act(() => {
      saveResult = hook.result.current.savePromptSkipKeyword('root-a-value')
    })
    expect(hook.result.current.promptSkipBusy).toBe(true)
    hook.rerender({ root: rootB })
    await waitFor(() => expect(hook.result.current.promptSkipKeyword).toBe('root-b'))
    await act(async () => {
      resolveSave?.(response())
      await saveResult
    })
    expect(hook.result.current.promptSkipKeyword).toBe('root-b')
    expect(hook.result.current.promptSkipError).toBeNull()
    expect(hook.result.current.promptSkipBusy).toBe(false)
  })

  it('同一 root 保存期间切换语言不会重发 GET、解锁 busy 或丢弃 POST 结果', async () => {
    let resolveSave: ((value: Response) => void) | undefined
    let getCount = 0
    global.fetch = vi.fn((url: string, opts?: RequestInit) => {
      if (url === `/api/hooks?root=${encodeURIComponent(ROOT)}`) {
        getCount += 1
        return Promise.resolve(new Response(JSON.stringify({
          ok: true, hooks: HOOKS, matrix: {}, prompt_skip_keyword: 'no-tenon',
        }), { status: 200 }))
      }
      if (url === '/api/hooks/prompt-routing-bypass' && opts?.method === 'POST') {
        return new Promise<Response>((resolve) => {
          resolveSave = resolve
        })
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`))
    }) as unknown as typeof fetch

    render(<I18nProvider><PromptSkipLocaleRaceHarness /></I18nProvider>)
    await waitFor(() => expect(screen.getByTestId('prompt-skip-keyword')).toHaveTextContent('no-tenon'))
    fireEvent.click(screen.getByRole('button', { name: 'save keyword' }))
    expect(screen.getByTestId('prompt-skip-busy')).toHaveTextContent('true')

    fireEvent.click(screen.getByRole('button', { name: 'switch locale' }))
    await act(async () => {
      await Promise.resolve()
    })
    expect(getCount).toBe(1)
    expect(screen.getByTestId('prompt-skip-busy')).toHaveTextContent('true')

    await act(async () => {
      resolveSave?.(new Response(JSON.stringify({
        ok: true,
        prompt_skip_keyword: 'saved-tenon',
      }), { status: 200 }))
    })
    await waitFor(() => expect(screen.getByTestId('prompt-skip-keyword')).toHaveTextContent('saved-tenon'))
    expect(screen.getByTestId('prompt-skip-busy')).toHaveTextContent('false')
  })
})
