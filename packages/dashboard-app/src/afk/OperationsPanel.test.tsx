import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { I18nProvider } from '../i18n'
import { OperationsPanel } from './OperationsPanel'

const ROOT = '/tmp/ops-project'
const templates = [
  { version: 1, id: 'ci-sweeper', goal: 'Keep CI green', trigger: [{ kind: 'schedule' }], risk: 'medium', recommendedWorkflow: 'default', recommendedSkills: ['ci-triage'] },
  { version: 1, id: 'daily-triage', goal: 'Review the queue', trigger: [{ kind: 'schedule' }], risk: 'low', recommendedWorkflow: 'default', recommendedSkills: ['loop-triage'] },
]

let requests: Array<{ url: string; body?: Record<string, unknown> }>

function operationResponse(label: string): Response {
  return new Response(JSON.stringify({
    ok: true,
    exit_code: 0,
    command: ['pipeline'],
    result: { status: label },
    stdout: JSON.stringify({ status: label }),
    stderr: '',
  }), { status: 200 })
}

beforeEach(() => {
  localStorage.clear()
  requests = []
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : undefined
    requests.push({ url, body })
    if (url.startsWith('/api/operations/starters')) {
      return new Response(JSON.stringify({ ok: true, templates, defaults: { runner: 'codex', workflow: 'default' } }), { status: 200 })
    }
    if (url === '/api/loops/snapshot') {
      return new Response(JSON.stringify({ generated_at: '2026-07-19T00:00:00Z', rows: [
        { root: ROOT, id: 'ci-loop', name: 'CI', status: 'active', autonomy_level: 'L2' },
        { root: ROOT, id: 'docs-loop', name: 'Docs', status: 'active', autonomy_level: 'L1' },
      ] }), { status: 200 })
    }
    if (url.startsWith('/api/cadence/status')) {
      return new Response(JSON.stringify({
        enabled: true, poll_interval_ms: 30000, generated_at: '2026-07-20T12:00:00Z', running: false, errors: [],
        loops: [
          { root: ROOT, loop_id: 'ci-loop', cadence: '1h', runner: 'codex', state: 'waiting', last_finished_at: '2026-07-20T11:30:00Z', due_at: '2026-07-20T12:30:00Z' },
          { root: ROOT, loop_id: 'broken-loop', cadence: '2h', runner: 'codex', state: 'blocked', last_finished_at: null, due_at: null, error: 'durable ledger 含坏行' },
        ],
      }), { status: 200 })
    }
    if (url.startsWith('/api/operations/')) {
      return new Response(JSON.stringify({
        ok: true, exit_code: 0, command: ['pipeline'], result: { status: 'planned' }, stdout: '{"status":"planned"}', stderr: '',
      }), { status: 200 })
    }
    throw new Error(`unexpected fetch ${url}`)
  }) as unknown as typeof fetch
})

afterEach(() => vi.restoreAllMocks())

function renderPanel() {
  const onToast = vi.fn()
  render(<I18nProvider><OperationsPanel root={ROOT} onToast={onToast} /></I18nProvider>)
  return { onToast }
}

describe('OperationsPanel：H11-H14 可操作面', () => {
  it('初始加载有明确状态且同 root 刷新不会并发发出第二组三联请求', async () => {
    global.fetch = vi.fn(() => new Promise<Response>(() => undefined)) as typeof fetch
    const { unmount } = render(<I18nProvider><OperationsPanel root={ROOT} /></I18nProvider>)
    expect(await screen.findByTestId('ops-loading')).toHaveTextContent('正在加载运行事实')
    const refresh = screen.getByTestId('ops-refresh')
    expect(refresh).toBeDisabled()
    fireEvent.click(refresh)
    expect(global.fetch).toHaveBeenCalledTimes(3)
    unmount()
  })

  it('空数据呈现明确空态，关键选择控件都有可访问名称与选中语义', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('/api/operations/starters')) {
        return new Response(JSON.stringify({ ok: true, templates: [], defaults: { runner: 'codex', workflow: 'default' } }), { status: 200 })
      }
      if (url === '/api/loops/snapshot') {
        return new Response(JSON.stringify({ generated_at: '2026-07-19T00:00:00Z', rows: [] }), { status: 200 })
      }
      if (url.startsWith('/api/cadence/status')) {
        return new Response(JSON.stringify({ enabled: true, poll_interval_ms: 30000, generated_at: '2026-07-20T12:00:00Z', running: false, errors: [], loops: [] }), { status: 200 })
      }
      throw new Error(`unexpected fetch ${url}`)
    }) as typeof fetch
    renderPanel()
    expect(await screen.findByTestId('ops-empty')).toHaveTextContent('当前项目还没有可运行的定时任务或模板')
    expect(screen.getByLabelText('对账模式')).toBeInTheDocument()
    expect(screen.getByLabelText('Triage 来源')).toBeInTheDocument()
    expect(screen.getByLabelText('Triage 模型')).toBeInTheDocument()
  })

  it('starter 选择器暴露 radio 语义和真实选中态', async () => {
    renderPanel()
    const group = await screen.findByRole('radiogroup', { name: '选择定时任务类型' })
    const selected = within(group).getByTestId('ops-starter-ci-sweeper')
    const alternate = within(group).getByTestId('ops-starter-daily-triage')
    expect(selected).toHaveAttribute('role', 'radio')
    expect(selected).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(alternate)
    expect(selected).toHaveAttribute('aria-checked', 'false')
    expect(alternate).toHaveAttribute('aria-checked', 'true')
  })

  it('English locale covers starter catalog, form help, risks, and run permissions without Chinese product copy', async () => {
    localStorage.setItem('tenon-dashboard-lang', 'en')
    renderPanel()
    const panel = await screen.findByTestId('operations-panel')
    expect(panel).toHaveTextContent('Choose a scheduled task type')
    expect(panel).toHaveTextContent('CI failure sweep')
    expect(panel).toHaveTextContent('Medium risk')
    expect(panel).toHaveTextContent('Discover or generate tasks')
    expect(panel).toHaveTextContent('Use only lowercase letters, numbers, and hyphens')
    expect(panel).toHaveTextContent('L2 · Assisted actions')
    expect(panel.textContent).not.toMatch(/[\u3400-\u9fff]/)
  })

  it('从 server 读 starter gallery，默认 runner=codex，不在前端手抄模板', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByTestId('ops-starter-ci-sweeper')).toBeInTheDocument())
    expect(screen.getByTestId('ops-starter-daily-triage')).toBeInTheDocument()
    expect(screen.getByTestId('ops-runner')).toHaveValue('codex')
    expect(screen.getByTestId('ops-starter-ci-sweeper')).toHaveTextContent('CI 故障巡检')
    expect(screen.getByTestId('ops-starter-ci-sweeper')).not.toHaveTextContent('ci-triage')
  })

  it('定时任务创建与验证用中文解释模板、任务、工作流的关系，不把 Loop/paused 等术语直接丢给用户', async () => {
    render(<I18nProvider><OperationsPanel root={ROOT} activeTool="starter" compact /></I18nProvider>)
    await waitFor(() => expect(screen.getByTestId('ops-starter-ci-sweeper')).toBeInTheDocument())
    expect(screen.getByTestId('operations-panel')).toHaveTextContent('选择定时任务类型')
    expect(screen.getByTestId('operations-panel')).toHaveTextContent('模板决定如何发现或生成任务')
    expect(screen.getByTestId('operations-panel')).toHaveTextContent('工作流决定每个任务按哪些阶段推进')
    expect(screen.getByTestId('operations-panel')).toHaveTextContent('定时任务名称')
    expect(screen.getByTestId('operations-panel')).toHaveTextContent('可用技能')
    expect(screen.getByTestId('operations-panel')).toHaveTextContent('任务工作流')
    expect(screen.getByTestId('operations-panel')).toHaveTextContent('执行代理')
    expect(screen.getByTestId('operations-panel')).toHaveTextContent('CI 故障巡检')
    expect(screen.getByTestId('operations-panel')).not.toHaveTextContent('paused')

    render(<I18nProvider><OperationsPanel root={ROOT} activeTool="run" compact /></I18nProvider>)
    expect(screen.getAllByTestId('operations-panel')[1]).toHaveTextContent('验证定时任务')
    expect(screen.getAllByTestId('operations-panel')[1]).toHaveTextContent('用于上线前检查')
    expect(screen.getAllByTestId('operations-panel')[1]).toHaveTextContent('定时任务')
    expect(screen.getAllByTestId('operations-panel')[1]).toHaveTextContent('运行权限')
  })

  it('选择 starter + 填 loop id 后创建 paused 草稿，body 含完整显式 binding', async () => {
    renderPanel()
    await waitFor(() => screen.getByTestId('ops-starter-ci-sweeper'))
    fireEvent.click(screen.getByTestId('ops-starter-ci-sweeper'))
    fireEvent.change(screen.getByTestId('ops-loop-id'), { target: { value: 'nightly-ci' } })
    fireEvent.change(screen.getByTestId('ops-skill-bundle'), { target: { value: 'backend' } })
    fireEvent.click(screen.getByTestId('ops-create-loop'))
    await waitFor(() => expect(requests.some((item) => item.url === '/api/operations/loops/init')).toBe(true))
    expect(requests.find((item) => item.url === '/api/operations/loops/init')?.body).toMatchObject({
      root: ROOT, id: 'nightly-ci', template: 'ci-sweeper', workflow: 'default',
      skill_bundle: 'backend', runner: 'codex',
    })
    expect(await screen.findByTestId('ops-result')).toHaveTextContent('操作成功')
  })

  it('starter 请求绑定完整事实和唯一 token；忙时修改输入后旧 response/finally 不污染新请求', async () => {
    const baseFetch = global.fetch
    const pending: Array<(response: Response) => void> = []
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) !== '/api/operations/loops/init') return baseFetch(input, init)
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : undefined
      requests.push({ url: String(input), body })
      return new Promise<Response>((resolve) => pending.push(resolve))
    }) as typeof fetch

    const { onToast } = renderPanel()
    await waitFor(() => expect(screen.getByTestId('ops-starter-ci-sweeper')).toBeInTheDocument())
    fireEvent.change(screen.getByTestId('ops-loop-id'), { target: { value: 'nightly-a' } })
    fireEvent.click(screen.getByTestId('ops-create-loop'))
    await waitFor(() => expect(pending).toHaveLength(1))

    fireEvent.change(screen.getByTestId('ops-loop-id'), { target: { value: 'nightly-b' } })
    expect(screen.getByTestId('ops-create-loop')).toBeEnabled()
    fireEvent.click(screen.getByTestId('ops-create-loop'))
    await waitFor(() => expect(pending).toHaveLength(2))

    pending[0]?.(operationResponse('stale-a'))
    await waitFor(() => expect(screen.getByTestId('ops-create-loop')).toHaveTextContent('执行中'))
    expect(screen.getByTestId('ops-create-loop')).toBeDisabled()
    expect(screen.queryByTestId('ops-result')).toBeNull()
    expect(onToast).not.toHaveBeenCalled()

    pending[1]?.(operationResponse('current-b'))
    expect(await screen.findByTestId('ops-result')).toHaveTextContent('current-b')
    expect(onToast).toHaveBeenCalledTimes(1)
    expect(requests.filter((item) => item.url === '/api/operations/loops/init').map((item) => item.body?.id))
      .toEqual(['nightly-a', 'nightly-b'])
  })

  it('Run 与 Sync 均以 dry-run 为默认；真实 L3 必须显式勾选双确认', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByTestId('ops-loop-selector')).toHaveValue('ci-loop'))
    fireEvent.click(screen.getByTestId('ops-run-submit'))
    await waitFor(() => expect(requests.some((item) => item.url === '/api/operations/loops/run')).toBe(true))
    expect(requests.find((item) => item.url === '/api/operations/loops/run')?.body).toMatchObject({
      root: ROOT, selector: 'ci-loop', dry_run: true, level: 'L2', commit: false,
    })

    fireEvent.click(screen.getByTestId('ops-run-real'))
    fireEvent.change(screen.getByTestId('ops-run-level'), { target: { value: 'L3' } })
    expect(screen.getByTestId('ops-run-submit')).toBeDisabled()
    fireEvent.click(screen.getByTestId('ops-confirm-run'))
    fireEvent.click(screen.getByTestId('ops-confirm-l3'))
    expect(screen.getByTestId('ops-run-submit')).not.toBeDisabled()

    fireEvent.click(screen.getByTestId('ops-sync-submit'))
    await waitFor(() => expect(requests.some((item) => item.url === '/api/operations/loops/sync')).toBe(true))
    expect(requests.find((item) => item.url === '/api/operations/loops/sync')?.body).toMatchObject({ mode: 'dry-run' })
  })

  it('真实运行双确认绑定 selector、level、commit 与 real-run，任一输入变化后即使改回也必须重新确认', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByTestId('ops-loop-selector')).toHaveValue('ci-loop'))
    fireEvent.click(screen.getByTestId('ops-run-real'))
    fireEvent.change(screen.getByTestId('ops-run-level'), { target: { value: 'L3' } })
    fireEvent.click(screen.getByTestId('ops-confirm-run'))
    fireEvent.click(screen.getByTestId('ops-confirm-l3'))
    expect(screen.getByTestId('ops-run-submit')).toBeEnabled()

    const commit = screen.getByTestId('ops-run-commit')
    commit.focus()
    fireEvent.click(commit)
    expect(commit).toHaveFocus()
    expect(screen.getByTestId('ops-confirm-run')).not.toBeChecked()
    expect(screen.getByTestId('ops-confirm-l3')).not.toBeChecked()
    expect(screen.getByTestId('ops-run-submit')).toBeDisabled()

    fireEvent.click(screen.getByTestId('ops-confirm-run'))
    fireEvent.click(screen.getByTestId('ops-confirm-l3'))
    fireEvent.change(screen.getByTestId('ops-run-level'), { target: { value: 'L2' } })
    fireEvent.change(screen.getByTestId('ops-run-level'), { target: { value: 'L3' } })
    expect(screen.getByTestId('ops-confirm-run')).not.toBeChecked()
    expect(screen.getByTestId('ops-confirm-l3')).not.toBeChecked()

    fireEvent.click(screen.getByTestId('ops-confirm-run'))
    fireEvent.click(screen.getByTestId('ops-confirm-l3'))
    fireEvent.change(screen.getByTestId('ops-loop-selector'), { target: { value: 'docs-loop' } })
    fireEvent.change(screen.getByTestId('ops-loop-selector'), { target: { value: 'ci-loop' } })
    expect(screen.getByTestId('ops-confirm-run')).not.toBeChecked()
    expect(screen.getByTestId('ops-run-submit')).toBeDisabled()

    fireEvent.change(screen.getByTestId('ops-run-level'), { target: { value: 'L3' } })
    fireEvent.click(screen.getByTestId('ops-confirm-run'))
    fireEvent.click(screen.getByTestId('ops-confirm-l3'))
    fireEvent.click(screen.getByTestId('ops-run-real'))
    fireEvent.click(screen.getByTestId('ops-run-real'))
    expect(screen.getByTestId('ops-confirm-run')).not.toBeChecked()
    expect(screen.getByTestId('ops-confirm-l3')).not.toBeChecked()
    expect(screen.getByTestId('ops-run-submit')).toBeDisabled()
  })

  it('危险确认在提交时立即消费，run/sync/triage 都不能复用确认重复提交', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByTestId('ops-loop-selector')).toHaveValue('ci-loop'))

    fireEvent.click(screen.getByTestId('ops-run-real'))
    fireEvent.change(screen.getByTestId('ops-run-level'), { target: { value: 'L3' } })
    fireEvent.click(screen.getByTestId('ops-confirm-run'))
    fireEvent.click(screen.getByTestId('ops-confirm-l3'))
    fireEvent.click(screen.getByTestId('ops-run-submit'))
    await waitFor(() => expect(requests.filter((item) => item.url === '/api/operations/loops/run')).toHaveLength(1))
    expect(screen.getByTestId('ops-confirm-run')).not.toBeChecked()
    expect(screen.getByTestId('ops-confirm-l3')).not.toBeChecked()
    expect(screen.getByTestId('ops-run-submit')).toBeDisabled()
    fireEvent.click(screen.getByTestId('ops-run-submit'))
    expect(requests.filter((item) => item.url === '/api/operations/loops/run')).toHaveLength(1)

    fireEvent.change(screen.getByTestId('ops-sync-mode'), { target: { value: 'apply' } })
    fireEvent.click(screen.getByTestId('ops-confirm-sync'))
    fireEvent.click(screen.getByTestId('ops-sync-submit'))
    await waitFor(() => expect(requests.filter((item) => item.url === '/api/operations/loops/sync')).toHaveLength(1))
    expect(screen.getByTestId('ops-confirm-sync')).not.toBeChecked()
    expect(screen.getByTestId('ops-sync-submit')).toBeDisabled()
    fireEvent.click(screen.getByTestId('ops-sync-submit'))
    expect(requests.filter((item) => item.url === '/api/operations/loops/sync')).toHaveLength(1)

    fireEvent.click(screen.getByTestId('ops-confirm-triage'))
    fireEvent.click(screen.getByTestId('ops-triage-submit'))
    await waitFor(() => expect(requests.filter((item) => item.url === '/api/operations/triage')).toHaveLength(1))
    expect(screen.getByTestId('ops-confirm-triage')).not.toBeChecked()
    expect(screen.getByTestId('ops-triage-submit')).toBeDisabled()
    fireEvent.click(screen.getByTestId('ops-triage-submit'))
    expect(requests.filter((item) => item.url === '/api/operations/triage')).toHaveLength(1)
  })

  it('triage 忙时修改决策事实可开始新请求，旧 catch/finally 不覆盖新请求状态', async () => {
    const baseFetch = global.fetch
    const pending: Array<{
      resolve: (response: Response) => void
      reject: (error: Error) => void
    }> = []
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) !== '/api/operations/triage') return baseFetch(input, init)
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : undefined
      requests.push({ url: String(input), body })
      return new Promise<Response>((resolve, reject) => pending.push({ resolve, reject }))
    }) as typeof fetch

    const { onToast } = renderPanel()
    await waitFor(() => expect(screen.getByTestId('ops-triage-submit')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('ops-confirm-triage'))
    fireEvent.click(screen.getByTestId('ops-triage-submit'))
    await waitFor(() => expect(pending).toHaveLength(1))

    fireEvent.change(screen.getByTestId('ops-triage-model'), { target: { value: 'gpt-5.6' } })
    fireEvent.click(screen.getByTestId('ops-confirm-triage'))
    expect(screen.getByTestId('ops-triage-submit')).toBeEnabled()
    fireEvent.click(screen.getByTestId('ops-triage-submit'))
    await waitFor(() => expect(pending).toHaveLength(2))

    pending[0]?.reject(new Error('stale-a'))
    await waitFor(() => expect(screen.getByTestId('ops-triage-submit')).toHaveTextContent('执行中'))
    expect(screen.getByTestId('ops-triage-submit')).toBeDisabled()
    expect(screen.queryByTestId('ops-operation-error')).toBeNull()
    expect(onToast).not.toHaveBeenCalled()

    pending[1]?.resolve(operationResponse('triage-b'))
    expect(await screen.findByTestId('ops-result')).toHaveTextContent('triage-b')
    expect(onToast).toHaveBeenCalledTimes(1)
  })

  it('apply 与 triage 确认绑定各自 selector/mode/source/model，变化后关闭且焦点留在变更控件', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByTestId('ops-loop-selector')).toHaveValue('ci-loop'))

    const syncMode = screen.getByTestId('ops-sync-mode')
    fireEvent.change(syncMode, { target: { value: 'apply' } })
    fireEvent.click(screen.getByTestId('ops-confirm-sync'))
    expect(screen.getByTestId('ops-sync-submit')).toBeEnabled()
    const selector = screen.getByTestId('ops-loop-selector')
    selector.focus()
    fireEvent.change(selector, { target: { value: 'docs-loop' } })
    expect(selector).toHaveFocus()
    expect(screen.getByTestId('ops-confirm-sync')).not.toBeChecked()
    fireEvent.change(selector, { target: { value: 'ci-loop' } })
    expect(screen.getByTestId('ops-confirm-sync')).not.toBeChecked()

    fireEvent.click(screen.getByTestId('ops-confirm-sync'))
    syncMode.focus()
    fireEvent.change(syncMode, { target: { value: 'dry-run' } })
    fireEvent.change(syncMode, { target: { value: 'apply' } })
    expect(syncMode).toHaveFocus()
    expect(screen.getByTestId('ops-confirm-sync')).not.toBeChecked()
    expect(screen.getByTestId('ops-sync-submit')).toBeDisabled()

    fireEvent.click(screen.getByTestId('ops-confirm-triage'))
    const model = screen.getByTestId('ops-triage-model')
    model.focus()
    fireEvent.change(model, { target: { value: 'gpt-5.6' } })
    expect(model).toHaveFocus()
    expect(screen.getByTestId('ops-confirm-triage')).not.toBeChecked()
    expect(screen.getByTestId('ops-triage-submit')).toBeDisabled()

    fireEvent.click(screen.getByTestId('ops-confirm-triage'))
    const source = screen.getByTestId('ops-triage-source')
    source.focus()
    fireEvent.change(source, { target: { value: 'loop-run-terminals' } })
    expect(source).toHaveFocus()
    expect(screen.getByTestId('ops-confirm-triage')).not.toBeChecked()
    expect(screen.getByTestId('ops-triage-submit')).toBeDisabled()
  })

  it('Codex triage 明示会写 checkpoint，确认后提交并显示真实 exit/result', async () => {
    renderPanel()
    await waitFor(() => screen.getByTestId('ops-triage-submit'))
    expect(screen.getByTestId('ops-triage-submit')).toBeDisabled()
    fireEvent.click(screen.getByTestId('ops-confirm-triage'))
    fireEvent.click(screen.getByTestId('ops-triage-submit'))
    await waitFor(() => expect(requests.some((item) => item.url === '/api/operations/triage')).toBe(true))
    expect(requests.find((item) => item.url === '/api/operations/triage')?.body).toMatchObject({
      root: ROOT, source: 'git-commits', confirm_apply: true,
    })
    expect(within(screen.getByTestId('ops-result')).getByText('操作成功')).toBeInTheDocument()
    expect(within(screen.getByTestId('ops-result')).getByText('退出码 0')).toBeInTheDocument()
    expect(screen.getByTestId('ops-result').textContent).toContain('planned')
  })

  it('所有搜索与配置文本输入都有稳定 name，且关闭非认证自动填充', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByTestId('ops-loop-id')).toBeInTheDocument())
    expect(screen.getByTestId('ops-loop-id')).toHaveAttribute('name', 'loop-id')
    expect(screen.getByTestId('ops-skill-bundle')).toHaveAttribute('name', 'skill-bundle')
    expect(screen.getByLabelText(/^任务工作流/)).toHaveAttribute('name', 'workflow')
    expect(screen.getByTestId('ops-triage-model')).toHaveAttribute('name', 'triage-model')
    for (const textbox of screen.getAllByRole('textbox')) {
      expect(textbox).toHaveAttribute('autocomplete', 'off')
    }
  })

  it('显示 server 真实 cadence 状态，而不是把 cadence 配置误当成已调度', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByTestId('ops-cadence-status')).toBeInTheDocument())
    expect(screen.getByTestId('ops-cadence-status')).toHaveAttribute('data-enabled', 'true')
    expect(screen.getByTestId('ops-cadence-loop-ci-loop')).toHaveAttribute('data-state', 'waiting')
    expect(screen.getByTestId('ops-cadence-loop-ci-loop')).toHaveTextContent('下次运行 2026年07月20日 12:30:00')
    expect(screen.getByTestId('ops-cadence-loop-ci-loop')).not.toHaveTextContent('UTC')
    expect(screen.getByTestId('ops-cadence-loop-broken-loop')).toHaveAttribute('data-state', 'blocked')
    expect(screen.getByTestId('ops-cadence-loop-broken-loop').textContent).toContain('durable ledger 含坏行')
  })
})
