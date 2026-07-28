import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { LoopScopePreview } from './LoopScopePreview'

const success = {
  ok: true,
  schema_version: 1,
  loop_id: 'release-loop',
  loop_status: 'active',
  autonomy_level: 'L3',
  enforced_for_unattended_merge: true,
  summary: { total: 2, allowed: 1, blocked: 1 },
  items: [
    { path: 'src/app.ts', verdict: 'allowed', reason: 'allowlist', matched_pattern: 'src/**' },
    { path: 'docs/guide.md', verdict: 'blocked', reason: 'path-outside-allowlist', matched_pattern: null },
  ],
}

function renderPreview(): void {
  render(
    <I18nProvider>
      <LoopScopePreview root="/repo" loopId="release-loop" />
    </I18nProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  window.__TENON_DASHBOARD_TOKEN__ = 'scope-token'
})
afterEach(() => vi.restoreAllMocks())

describe('LoopScopePreview', () => {
  it('keeps empty input local, submits with Ctrl+Enter, and renders allowed/blocked explanations', async () => {
    let resolveFetch: ((value: Response) => void) | undefined
    global.fetch = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve }))
    renderPreview()
    const trigger = screen.getByTestId('lp-scope-open')
    trigger.focus()
    fireEvent.click(trigger)

    const dialog = screen.getByTestId('lp-scope-dialog')
    const submit = within(dialog).getByTestId('lp-scope-submit')
    expect(submit).toBeDisabled()
    expect(global.fetch).not.toHaveBeenCalled()

    const input = within(dialog).getByTestId('lp-scope-input')
    fireEvent.change(input, { target: { value: '../secret' } })
    expect(submit).toBeDisabled()
    expect(within(dialog).getByText(/canonical/)).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: 'C:/Windows/system32' } })
    expect(submit).toBeDisabled()
    expect(global.fetch).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: 'src/app.ts\ndocs/guide.md' } })
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(within(dialog).getByTestId('lp-scope-loading')).toBeInTheDocument()
    expect(input).toBeDisabled()

    resolveFetch?.(new Response(JSON.stringify(success), { status: 200 }))
    await waitFor(() => expect(within(dialog).getByTestId('lp-scope-summary')).toHaveTextContent('1'))
    expect(within(dialog).getByText('src/app.ts')).toBeInTheDocument()
    expect(within(dialog).getByText('docs/guide.md')).toBeInTheDocument()
    expect(within(dialog).getByText('src/**')).toBeInTheDocument()
    expect(within(dialog).getByText('白名单外')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('lp-scope-dialog')).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it('preserves input across an HTTP error and retries the same bounded request', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: 'registry changed' }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(success), { status: 200 }))
    renderPreview()
    fireEvent.click(screen.getByTestId('lp-scope-open'))
    const dialog = screen.getByTestId('lp-scope-dialog')
    const input = within(dialog).getByTestId('lp-scope-input')
    fireEvent.change(input, { target: { value: 'src/app.ts\ndocs/guide.md' } })
    fireEvent.click(within(dialog).getByTestId('lp-scope-submit'))
    await waitFor(() => expect(within(dialog).getByTestId('lp-scope-error')).toHaveTextContent('registry 无法形成可信策略'))
    expect(input).toHaveValue('src/app.ts\ndocs/guide.md')
    fireEvent.click(within(dialog).getByTestId('lp-scope-retry'))
    await waitFor(() => expect(within(dialog).getByTestId('lp-scope-summary')).toBeInTheDocument())
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('renders the same complete interaction in English', async () => {
    localStorage.setItem('tenon-dashboard-lang', 'en')
    global.fetch = vi.fn(async () => new Response(JSON.stringify(success), { status: 200 }))
    renderPreview()
    expect(screen.getByRole('button', { name: 'Preview path scope' })).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('lp-scope-open'))
    expect(screen.getByText(/One project-relative path per line/)).toHaveTextContent('runtime checks again')
  })

  it('localizes errors in English without rendering server-localized details', async () => {
    localStorage.setItem('tenon-dashboard-lang', 'en')
    global.fetch = vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      code: 'LOOP_SCOPE_REGISTRY_INVALID',
      error: '服务端中文细节',
    }), { status: 409 }))
    renderPreview()
    fireEvent.click(screen.getByTestId('lp-scope-open'))
    fireEvent.change(screen.getByTestId('lp-scope-input'), { target: { value: 'src/app.ts' } })
    fireEvent.click(screen.getByTestId('lp-scope-submit'))
    await waitFor(() => expect(screen.getByTestId('lp-scope-error')).toHaveTextContent(
      'The current loop registry cannot form a trusted policy',
    ))
    expect(screen.queryByText('服务端中文细节')).toBeNull()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('aborts an in-flight request when the dialog closes and opens cleanly next time', async () => {
    let resolveFetch: ((value: Response) => void) | undefined
    global.fetch = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve }))
    renderPreview()
    fireEvent.click(screen.getByTestId('lp-scope-open'))
    fireEvent.change(screen.getByTestId('lp-scope-input'), { target: { value: 'src/app.ts' } })
    fireEvent.click(screen.getByTestId('lp-scope-submit'))
    const signal = vi.mocked(global.fetch).mock.calls[0]?.[1]?.signal
    expect(signal).toBeInstanceOf(AbortSignal)
    expect(signal?.aborted).toBe(false)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(signal?.aborted).toBe(true)
    resolveFetch?.(new Response(JSON.stringify({
      ...success,
      summary: { total: 1, allowed: 1, blocked: 0 },
      items: [success.items[0]],
    }), { status: 200 }))
    await Promise.resolve()

    fireEvent.click(screen.getByTestId('lp-scope-open'))
    expect(screen.getByTestId('lp-scope-input')).toHaveValue('')
    expect(screen.queryByTestId('lp-scope-summary')).toBeNull()
  })
})
