import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { makeChange, makeProject, makeSnapshot } from '../testkit'
import { MachineView } from './MachineView'

const ROOT = '/repo/current'

beforeEach(() => {
  localStorage.clear()
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.startsWith('/api/afk/readiness')) return new Response(JSON.stringify({ ok: true, docker: { available: true }, image: { configured: 'sandcastle:local', present: false, build_hint: 'npm run sandcastle:build' }, credentials: { 'claude-code': { CLAUDE_CODE_OAUTH_TOKEN: { set: false } }, codex: { OPENAI_API_KEY: { set: false }, CODEX_HOME: { set: true, source: 'default-home' } } } }), { status: 200 })
    if (url === '/api/docker/images') return new Response(JSON.stringify({ ok: true, available: true, images: ['other:latest'] }), { status: 200 })
    if (url === '/api/secrets') return new Response(JSON.stringify({ ok: true, keys: { CLAUDE_CODE_OAUTH_TOKEN: { set: false }, OPENAI_API_KEY: { set: false } } }), { status: 200 })
    if (url === '/api/skills/registry') return new Response(JSON.stringify({ skills: [{ name: 'ci-triage', installed: true, source: 'builtin', tier: 'mandatory', available: true }, { name: 'browser-e2e', installed: false, source: 'user', tier: 'mandatory', available: true, installCmd: 'tenon setup' }, { name: 'zoom-out', installed: false, source: 'user', tier: 'optional', available: false }] }), { status: 200 })
    if (url === '/api/loops/snapshot') return new Response(JSON.stringify({ generated_at: 'now', rows: [
      { root: ROOT, id: 'broken-loop', name: 'Broken', status: 'active', autonomy_level: 'L2', cadence: '1h', goal: 'x', design_doc: 'x', change_prefix: null, risk: 'high', runner: 'codex', human_gates: [], kill_criteria: [], allowlist: [], denylist: [], budget_decl: { max_runs_per_day: 1, max_in_flight: 1, on_exceed: 'skip-run' }, readiness: { score: 30, band: 'not-ready' }, budget: { breaker: 'tripped', runsToday: 1, spentToday: 100, remaining: 0 }, matched_changes: [], phases: [], draft: false, skill_bundle_id: null, ledger: { health: 'degraded', rejected_records: 2 } },
    ] }), { status: 200 })
    throw new Error(`unexpected fetch ${url}`)
  }) as unknown as typeof fetch
})
afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('MachineView 统一就绪与跨项目风险', () => {
  it('把已接线 Trace timeline 暴露在真实机器页诊断入口', async () => {
    const baseFetch = global.fetch
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/traces/sessions') {
        return new Response(JSON.stringify({
          generated_at: 'now',
          outbound: 'local-only',
          count: 0,
          sessions: [],
        }), { status: 200 })
      }
      return baseFetch(input)
    }) as unknown as typeof fetch

    const snapshot = makeSnapshot([makeProject(ROOT, [])], {
      capabilities: { operations: true, traffic: true },
    })
    render(<I18nProvider><MachineView snapshot={snapshot} currentRoot={ROOT} onOpenProject={vi.fn()} /></I18nProvider>)

    expect(await screen.findByTestId('machine-diagnostics')).toContainElement(screen.getByTestId('advanced-panel'))
    expect(screen.getByTestId('advanced-traffic')).toHaveTextContent('Trace 时间线')
    expect(await screen.findByTestId('traffic-empty')).toHaveTextContent('暂无捕获会话')
  })

  it('集中显示 Docker/镜像/Codex/技能事实，缺镜像与未装技能形成可行动 blocker', async () => {
    const snapshot = makeSnapshot([makeProject(ROOT, [])], { capabilities: { operations: true } })
    render(<I18nProvider><MachineView snapshot={snapshot} currentRoot={ROOT} onOpenProject={vi.fn()} /></I18nProvider>)
    await waitFor(() => expect(screen.getByTestId('machine-readiness')).toBeInTheDocument())
    expect(screen.getByTestId('machine-docker')).toHaveAttribute('data-state', 'ready')
    expect(screen.getByTestId('machine-image')).toHaveAttribute('data-state', 'blocked')
    expect(screen.getByTestId('machine-codex')).toHaveAttribute('data-state', 'ready')
    expect(screen.getByTestId('machine-codex')).toHaveTextContent('默认 Codex 配置目录')
    expect(screen.getByTestId('machine-codex')).not.toHaveTextContent('default-home')
    expect(screen.getByTestId('machine-skills')).toHaveAttribute('data-state', 'blocked')
    expect(screen.getByTestId('machine-blockers').textContent).toContain('sandcastle:local')
    expect(screen.getByTestId('machine-blockers').textContent).toContain('browser-e2e')
  })

  it('风险队列把后端异常翻译为可理解的中文处置项，并为窄屏声明单列与全宽动作', async () => {
    const onOpenProject = vi.fn()
    const snapshot = makeSnapshot([makeProject(ROOT, [makeChange('failed-change', 'build', { fields: { automation: 'failed' } })])])
    render(<I18nProvider><MachineView snapshot={snapshot} currentRoot={ROOT} onOpenProject={onOpenProject} /></I18nProvider>)
    const queue = await screen.findByTestId('machine-risk-queue')
    for (const text of ['failed-change', '自动运行失败', '账本异常', '预算已熔断', '就绪度不足', '未配置技能包']) expect(queue.textContent).toContain(text)
    for (const raw of ['automation failed', 'ledger degraded', 'budget tripped', 'readiness not-ready', 'skill bundle missing']) expect(queue.textContent).not.toContain(raw)
    const riskRow = within(queue).getByTestId('machine-risk-row-broken-loop')
    expect(riskRow).toHaveClass('max-[480px]:flex-col')
    expect(within(riskRow).getByRole('button')).toHaveClass('max-[480px]:w-full')
    fireEvent.click(within(queue).getByTestId('machine-risk-open-broken-loop'))
    expect(onOpenProject).toHaveBeenCalledWith(ROOT)
  })

  it('optional 或上游已下架的 skill 仍计入明细，但不把机器误判为 blocked、也不生成 blocker', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('/api/afk/readiness')) return new Response(JSON.stringify({ ok: true, docker: { available: true }, image: { configured: 'sandcastle:local', present: true, build_hint: 'npm run sandcastle:build' }, credentials: { 'claude-code': { CLAUDE_CODE_OAUTH_TOKEN: { set: false } }, codex: { OPENAI_API_KEY: { set: false }, CODEX_HOME: { set: true, source: 'default-home' } } } }), { status: 200 })
      if (url === '/api/docker/images') return new Response(JSON.stringify({ ok: true, available: true, images: ['sandcastle:local'] }), { status: 200 })
      if (url === '/api/secrets') return new Response(JSON.stringify({ ok: true, keys: { CLAUDE_CODE_OAUTH_TOKEN: { set: false }, OPENAI_API_KEY: { set: false } } }), { status: 200 })
      if (url === '/api/skills/registry') return new Response(JSON.stringify({ skills: [
        { name: 'browser-qa', installed: true, source: 'user', tier: 'mandatory', available: true },
        { name: 'hallmark', installed: false, source: 'user', tier: 'optional', available: true },
        { name: 'zoom-out', installed: false, source: 'user', tier: 'optional', available: false },
      ] }), { status: 200 })
      if (url === '/api/loops/snapshot') return new Response(JSON.stringify({ generated_at: 'now', rows: [] }), { status: 200 })
      throw new Error(`unexpected fetch ${url}`)
    }) as unknown as typeof fetch

    render(<I18nProvider><MachineView snapshot={makeSnapshot([makeProject(ROOT, [])], { capabilities: { operations: true } })} currentRoot={ROOT} onOpenProject={vi.fn()} /></I18nProvider>)

    await waitFor(() => expect(screen.getByTestId('machine-skills')).toHaveAttribute('data-state', 'ready'))
    expect(screen.getByTestId('machine-skills')).toHaveTextContent('1/3')
    expect(screen.getByTestId('machine-blockers')).not.toHaveTextContent('hallmark')
    expect(screen.getByTestId('machine-blockers')).not.toHaveTextContent('zoom-out')
  })

  it('Skill registry 的 HTTP 503 保留 HTTP 分类，不误报网络错误', async () => {
    localStorage.setItem('tenon-dashboard-lang', 'en')
    const baseFetch = global.fetch
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/skills/registry') return new Response(JSON.stringify({ error: '上游技能库不可用' }), { status: 503 })
      return baseFetch(input)
    }) as unknown as typeof fetch
    render(<I18nProvider><MachineView snapshot={makeSnapshot([makeProject(ROOT, [])], { capabilities: { operations: true } })} currentRoot={ROOT} onOpenProject={vi.fn()} /></I18nProvider>)
    const blockers = await screen.findByTestId('machine-blockers')
    await waitFor(() => expect(blockers).toHaveTextContent('HTTP 503'))
    expect(blockers).not.toHaveTextContent('Network error')
  })

  it('Skill registry 的 200 非法 schema 显示服务端响应无效，不崩到 ErrorBoundary', async () => {
    const baseFetch = global.fetch
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/skills/registry') return new Response(JSON.stringify({ skills: [{ name: 'bad', installed: true, source: 'builtin', tier: 42 }] }), { status: 200 })
      return baseFetch(input)
    }) as unknown as typeof fetch
    render(<I18nProvider><MachineView snapshot={makeSnapshot([makeProject(ROOT, [])], { capabilities: { operations: true } })} currentRoot={ROOT} onOpenProject={vi.fn()} /></I18nProvider>)
    await waitFor(() => expect(screen.getByTestId('machine-blockers')).toHaveTextContent('服务端响应格式无效'))
  })

  it('未选择项目是明确本地阻断，不制造 readiness 网络错误', async () => {
    render(<I18nProvider><MachineView snapshot={makeSnapshot([])} currentRoot="" onOpenProject={vi.fn()} /></I18nProvider>)
    await waitFor(() => expect(screen.getByTestId('machine-blockers')).toHaveTextContent('未选择项目'))
    expect(screen.getByTestId('machine-blockers')).not.toHaveTextContent('网络错误')
  })
})
