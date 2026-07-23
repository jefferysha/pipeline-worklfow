import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { makeChange, makeProject, makeSnapshot } from '../testkit'
import { MachineView } from './MachineView'

const ROOT = '/repo/current'

beforeEach(() => {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.startsWith('/api/afk/readiness')) return new Response(JSON.stringify({ ok: true, docker: { available: true }, image: { configured: 'sandcastle:local', present: false, build_hint: 'npm run sandcastle:build' }, credentials: { 'claude-code': { CLAUDE_CODE_OAUTH_TOKEN: { set: false } }, codex: { OPENAI_API_KEY: { set: false }, CODEX_HOME: { set: true, source: 'default-home' } } } }), { status: 200 })
    if (url === '/api/docker/images') return new Response(JSON.stringify({ ok: true, available: true, images: ['other:latest'] }), { status: 200 })
    if (url === '/api/secrets') return new Response(JSON.stringify({ ok: true, keys: { CLAUDE_CODE_OAUTH_TOKEN: { set: false }, OPENAI_API_KEY: { set: false } } }), { status: 200 })
    if (url === '/api/skills/registry') return new Response(JSON.stringify({ skills: [{ name: 'ci-triage', installed: true, source: 'builtin', tier: 'mandatory', available: true }, { name: 'browser-e2e', installed: false, source: 'user', tier: 'mandatory', available: true, installCmd: 'pipeline setup' }, { name: 'zoom-out', installed: false, source: 'user', tier: 'optional', available: false }] }), { status: 200 })
    if (url === '/api/loops/snapshot') return new Response(JSON.stringify({ generated_at: 'now', rows: [
      { root: ROOT, id: 'broken-loop', name: 'Broken', status: 'active', autonomy_level: 'L2', cadence: '1h', goal: 'x', design_doc: 'x', change_prefix: null, risk: 'high', runner: 'codex', human_gates: [], kill_criteria: [], allowlist: [], denylist: [], budget_decl: { max_runs_per_day: 1, max_in_flight: 1, on_exceed: 'skip-run' }, readiness: { score: 30, band: 'not-ready' }, budget: { breaker: 'tripped', runsToday: 1, spentToday: 100, remaining: 0 }, matched_changes: [], phases: [], draft: false, skill_bundle_id: null, ledger: { health: 'degraded', rejected_records: 2 } },
    ] }), { status: 200 })
    throw new Error(`unexpected fetch ${url}`)
  }) as unknown as typeof fetch
})
afterEach(() => vi.restoreAllMocks())

describe('MachineView 统一就绪与跨项目风险', () => {
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

  it('风险队列把后端异常翻译为可理解的中文处置项，并可跳回项目', async () => {
    const onOpenProject = vi.fn()
    const snapshot = makeSnapshot([makeProject(ROOT, [makeChange('failed-change', 'build', { fields: { automation: 'failed' } })])])
    render(<I18nProvider><MachineView snapshot={snapshot} currentRoot={ROOT} onOpenProject={onOpenProject} /></I18nProvider>)
    const queue = await screen.findByTestId('machine-risk-queue')
    for (const text of ['failed-change', '自动运行失败', '账本异常', '预算已熔断', '就绪度不足', '未配置技能包']) expect(queue.textContent).toContain(text)
    for (const raw of ['automation failed', 'ledger degraded', 'budget tripped', 'readiness not-ready', 'skill bundle missing']) expect(queue.textContent).not.toContain(raw)
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
})
