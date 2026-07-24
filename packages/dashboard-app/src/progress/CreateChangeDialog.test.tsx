import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nProvider } from '../i18n'
import { CreateChangeDialog } from './CreateChangeDialog'
import type { WbRouterPreview, WbTrackDefinition } from '../api/client'

function track(id: string, input?: Partial<WbTrackDefinition>): WbTrackDefinition {
  return {
    id,
    label: id[0]!.toUpperCase() + id.slice(1),
    builtin: true,
    workflow: { default: 'default', allowed: '*' },
    policyProfile: {
      reviewSeed: 'pending',
      automationEligible: true,
      coverageProfile: id === 'frontend' ? 'frontend' : 'backend',
      routing: { enabled: true, pattern: id, priority: id === 'frontend' ? 300 : 200 },
      skills: { matrix: true, profile: id },
    },
    ...input,
  }
}

const preview: WbRouterPreview = {
  ok: true,
  revision: 'rev-a',
  source: 'builtin-only',
  winner: null,
  suppressed_reason: null,
  candidates: [
    { track: track('frontend'), order: 0, priority: 300, score: 2, routable: true, excluded: false },
    {
      track: track('backend', { workflow: { default: 'release', allowed: ['release', 'default'] } }),
      order: 1,
      priority: 200,
      score: 1,
      routable: true,
      excluded: false,
    },
  ],
}
preview.winner = preview.candidates[0]!

function okJson(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  localStorage.clear()
  window.__PIPELINE_DASHBOARD_TOKEN__ = 'ui-token'
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function renderDialog(over?: Partial<Parameters<typeof CreateChangeDialog>[0]>) {
  const props = {
    root: '/repo',
    onClose: vi.fn(),
    onCreated: vi.fn(),
    onToast: vi.fn(),
    ...over,
  }
  render(<I18nProvider><CreateChangeDialog {...props} /></I18nProvider>)
  return props
}

describe('CreateChangeDialog —— Route Lock 主旅程', () => {
  it('意图输入后自动调用真实 router preview，并显示 winner 的 score/priority/policy', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.startsWith('/api/workflows?')) return okJson({ names: ['release'] })
      if (url === '/api/router/preview') return okJson(preview)
      throw new Error(`unexpected fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderDialog()

    fireEvent.change(screen.getByTestId('change-intent'), { target: { value: 'Build a responsive UI' } })
    expect(await screen.findByTestId('route-winner')).toHaveTextContent('Frontend')
    expect(screen.getByTestId('route-winner')).toHaveTextContent('score 2')
    expect(screen.getByTestId('route-winner')).toHaveTextContent('priority 300')
    expect(screen.getByTestId('route-policy')).toHaveTextContent('frontend')
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/router/preview')
    expect(call?.[1]).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer ui-token' }),
      body: JSON.stringify({ root: '/repo', prompt: 'Build a responsive UI' }),
    })
  })

  it('允许改选 Track/Workflow，展示真实首 Step；确认后 POST /api/changes 并刷新关闭', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/workflows?')) return okJson({ names: ['release'] })
      if (url === '/api/router/preview') return okJson(preview)
      if (url.startsWith('/api/workflows/release?')) {
        return okJson({ name: 'release', steps: [{ id: 'draft', label: 'Draft', transitions: [] }] })
      }
      if (url === '/api/changes') {
        expect(JSON.parse(String(init?.body))).toEqual({
          root: '/repo',
          name: 'ship-ui',
          track: 'backend',
          workflow: 'release',
          task_prompt: 'Backend release endpoint',
          activate_session: true,
        })
        return okJson({
          ok: true,
          name: 'ship-ui',
          path: '/repo/openspec/changes/ship-ui',
          task_prompt_saved: true,
          session: { requested: true, active: true, status: 'active', exit_code: 0 },
        })
      }
      throw new Error(`unexpected fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const props = renderDialog()

    fireEvent.change(screen.getByTestId('change-name'), { target: { value: 'ship-ui' } })
    fireEvent.change(screen.getByTestId('change-intent'), { target: { value: 'Backend release endpoint' } })
    await screen.findByTestId('route-winner')
    fireEvent.click(screen.getByTestId('route-candidate-backend'))
    await waitFor(() => expect(screen.getByTestId('change-workflow')).toHaveValue('release'))
    expect(await screen.findByTestId('route-first-step')).toHaveTextContent('draft')
    fireEvent.click(screen.getByTestId('change-create'))

    await waitFor(() => expect(props.onCreated).toHaveBeenCalledWith('ship-ui'))
    expect(props.onToast).toHaveBeenCalled()
    expect(props.onClose).toHaveBeenCalled()
  })

  it('会话指针未能确认时，如实提示任务已创建但未激活', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/workflows?')) return okJson({ names: [] })
      if (url === '/api/router/preview') return okJson(preview)
      if (url === '/api/changes') {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          task_prompt: 'Create a stable landing page',
          activate_session: true,
        })
        return okJson({
          ok: true,
          name: 'landing',
          path: '/repo/openspec/changes/landing',
          task_prompt_saved: true,
          session: { requested: true, active: false, status: 'degraded', exit_code: 0 },
        })
      }
      throw new Error(`unexpected fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const props = renderDialog()

    fireEvent.change(screen.getByTestId('change-name'), { target: { value: 'landing' } })
    fireEvent.change(screen.getByTestId('change-intent'), { target: { value: 'Create a stable landing page' } })
    await screen.findByTestId('route-winner')
    fireEvent.click(screen.getByTestId('change-create'))

    await waitFor(() => expect(props.onCreated).toHaveBeenCalledWith('landing'))
    expect(props.onToast).toHaveBeenCalledWith(expect.stringContaining('当前会话未能激活'))
  })

  it('hook suppression 明确说明不自动选路，但用户仍可手动锁定；非法 name 禁止创建', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.startsWith('/api/workflows?')) return okJson({ names: [] })
      if (url === '/api/router/preview') return okJson({ ...preview, winner: null, suppressed_reason: 'discussion' })
      throw new Error(`unexpected fetch ${url}`)
    }))
    renderDialog()
    fireEvent.change(screen.getByTestId('change-name'), { target: { value: 'bad name' } })
    fireEvent.change(screen.getByTestId('change-intent'), { target: { value: '为什么 UI 会失败' } })
    expect(await screen.findByTestId('route-suppressed')).toHaveTextContent('discussion')
    expect(screen.getByTestId('change-create')).toBeDisabled()
    expect(screen.getByTestId('change-name-error')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('route-candidate-frontend'))
    expect(screen.getByTestId('route-candidate-frontend')).toHaveAttribute('aria-pressed', 'true')
  })
})
