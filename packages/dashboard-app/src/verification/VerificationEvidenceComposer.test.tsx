import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { VerificationEvidenceComposer } from './VerificationEvidenceComposer'
import { TaskDocumentsSection } from '../shared/TaskDocumentsSection'

function renderComposer(locale: 'zh' | 'en' = 'zh', onToast = vi.fn()): ReturnType<typeof render> {
  localStorage.setItem('tenon-dashboard-lang', locale)
  return render(
    <I18nProvider>
      <VerificationEvidenceComposer root="/repo" locale={locale === 'zh' ? 'zh-CN' : 'en'} onToast={onToast} />
    </I18nProvider>,
  )
}

function addCommandEntry(): void {
  fireEvent.click(screen.getByTestId('evidence-add-entry'))
  fireEvent.change(screen.getByTestId('evidence-title-1'), { target: { value: 'Unit tests' } })
  fireEvent.change(screen.getByTestId('evidence-command-1'), { target: { value: 'npm test' } })
  fireEvent.change(screen.getByTestId('evidence-result-1'), { target: { value: '42 passed' } })
}

beforeEach(() => {
  window.__TENON_DASHBOARD_TOKEN__ = 'tok-ui'
})

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('VerificationEvidenceComposer', () => {
  it('renders through the neutral document-section slot', () => {
    const documents = { governed: true, pass: true, blockers: [], items: [] }
    const { rerender } = render(
      <I18nProvider>
        <TaskDocumentsSection documents={documents} />
      </I18nProvider>,
    )
    expect(screen.queryByTestId('evidence-compose-open')).not.toBeInTheDocument()
    rerender(
      <I18nProvider>
        <TaskDocumentsSection
          documents={documents}
          extra={<VerificationEvidenceComposer root="/repo" locale="en" />}
        />
      </I18nProvider>,
    )
    expect(screen.getByTestId('evidence-compose-open')).toBeVisible()
  })

  it('opens an accessible empty state, submits a loading draft, and restores focus on Escape', async () => {
    let resolveRequest!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>((resolve) => {
      resolveRequest = resolve
    })))
    renderComposer('en')

    const opener = screen.getByTestId('evidence-compose-open')
    opener.focus()
    fireEvent.click(opener)
    expect(screen.getByRole('dialog', { name: 'Compose verification evidence' })).toBeVisible()
    expect(screen.getByTestId('evidence-empty')).toHaveTextContent('No evidence entries yet')
    expect(screen.getByTestId('evidence-compose')).toBeDisabled()

    addCommandEntry()
    fireEvent.click(screen.getByTestId('evidence-compose'))
    expect(screen.getByTestId('evidence-compose')).toHaveTextContent('Composing')
    expect(screen.getByTestId('evidence-compose')).toBeDisabled()
    expect(screen.getByTestId('evidence-title-1')).toBeDisabled()
    expect(screen.getByTestId('evidence-add-entry')).toBeDisabled()

    resolveRequest(new Response(JSON.stringify({
      ok: true,
      markdown: '# Verification evidence draft\\n\\n42 passed',
      entryCount: 1,
    }), { status: 200 }))
    await waitFor(() => expect(screen.getByTestId('evidence-output')).toHaveValue('# Verification evidence draft\\n\\n42 passed'))

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('evidence-compose-dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('keeps fields intact and localizes structured server validation errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: false,
      code: 'verification_evidence_invalid',
      error: 'do not render me',
      details: [{ code: 'field_too_large', path: 'entries[0].result' }],
      overflow: false,
    }), { status: 400 })))
    renderComposer('en')
    fireEvent.click(screen.getByTestId('evidence-compose-open'))
    addCommandEntry()
    fireEvent.click(screen.getByTestId('evidence-compose'))

    await waitFor(() => expect(screen.getByTestId('evidence-error')).toHaveTextContent('entries[0].result'))
    expect(screen.getByTestId('evidence-error')).not.toHaveTextContent('do not render me')
    expect(screen.getByTestId('evidence-title-1')).toHaveValue('Unit tests')
    expect(screen.getByTestId('evidence-result-1')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByTestId('evidence-result-1')).toHaveAttribute(
      'aria-describedby',
      'verification-evidence-error',
    )
    expect(screen.getByTestId('evidence-result-1')).toHaveFocus()
  })

  it.each([
    ['zh', '请求体'],
    ['en', 'request body'],
  ] as const)('localizes a root-level structured validation path in %s', async (locale, localizedPath) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: false,
      code: 'verification_evidence_invalid',
      error: 'do not render me',
      details: [{ code: 'output_too_large', path: '' }],
      overflow: false,
    }), { status: 400 })))
    renderComposer(locale)
    fireEvent.click(screen.getByTestId('evidence-compose-open'))
    addCommandEntry()
    fireEvent.click(screen.getByTestId('evidence-compose'))

    await waitFor(() => expect(screen.getByTestId('evidence-error')).toHaveTextContent(localizedPath))
    expect(screen.getByTestId('evidence-error')).not.toHaveTextContent('do not render me')
  })

  it('preserves evidence body whitespace in the request while using trimmed views for validation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      markdown: '# Verification evidence draft',
      entryCount: 1,
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    renderComposer('en')
    fireEvent.click(screen.getByTestId('evidence-compose-open'))
    addCommandEntry()
    fireEvent.change(screen.getByTestId('evidence-command-1'), { target: { value: ' \tnpm test\n ' } })
    fireEvent.change(screen.getByTestId('evidence-title-1'), { target: { value: ' \tUnit tests  ' } })
    fireEvent.change(screen.getByTestId('evidence-result-1'), { target: { value: '\n 42 passed \t\n' } })
    fireEvent.click(screen.getByTestId('evidence-compose'))
    await screen.findByTestId('evidence-output')

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit
    const body = JSON.parse(String(request.body)) as {
      entries: Array<{ title: string; command?: string; result?: string }>
    }
    expect(body.entries[0]).toMatchObject({
      title: ' \tUnit tests  ',
      command: ' \tnpm test\n ',
      result: '\n 42 passed \t\n',
    })
  })

  it('blocks incomplete entries client-side without making a request', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderComposer()
    fireEvent.click(screen.getByTestId('evidence-compose-open'))
    fireEvent.click(screen.getByTestId('evidence-add-entry'))
    fireEvent.change(screen.getByTestId('evidence-title-1'), { target: { value: '浏览器验收' } })
    fireEvent.change(screen.getByTestId('evidence-kind-1'), { target: { value: 'browser' } })
    fireEvent.change(screen.getByTestId('evidence-result-1'), { target: { value: '' } })
    fireEvent.click(screen.getByTestId('evidence-compose'))

    expect(screen.getByTestId('evidence-error')).toHaveTextContent('请填写结果')
    expect(screen.getByTestId('evidence-result-1')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByTestId('evidence-result-1')).toHaveFocus()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('aborts a closed request and ignores its late response after reopening', async () => {
    const resolvers: Array<(response: Response) => void> = []
    const signals: AbortSignal[] = []
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      if (init.signal) signals.push(init.signal)
      return new Promise<Response>((resolve) => resolvers.push(resolve))
    }))
    renderComposer('en')
    fireEvent.click(screen.getByTestId('evidence-compose-open'))
    addCommandEntry()
    fireEvent.click(screen.getByTestId('evidence-compose'))
    expect(signals).toHaveLength(1)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(signals[0]?.aborted).toBe(true)
    fireEvent.click(screen.getByTestId('evidence-compose-open'))
    expect(screen.getByTestId('evidence-compose')).not.toBeDisabled()
    fireEvent.click(screen.getByTestId('evidence-compose'))
    expect(signals).toHaveLength(2)

    resolvers[1]?.(new Response(JSON.stringify({
      ok: true,
      markdown: '# New session',
      entryCount: 1,
    }), { status: 200 }))
    await waitFor(() => expect(screen.getByTestId('evidence-output')).toHaveValue('# New session'))

    resolvers[0]?.(new Response(JSON.stringify({
      ok: true,
      markdown: '# Stale session',
      entryCount: 1,
    }), { status: 200 }))
    await Promise.resolve()
    expect(screen.getByTestId('evidence-output')).toHaveValue('# New session')
  })

  it('ignores a closed request that rejects after a reopened session succeeds', async () => {
    let rejectStale!: (reason?: unknown) => void
    const stale = new Promise<Response>((_resolve, reject) => {
      rejectStale = reject
    })
    const fresh = Promise.resolve(new Response(JSON.stringify({
      ok: true,
      markdown: '# New session after stale failure',
      entryCount: 1,
    }), { status: 200 }))
    vi.stubGlobal('fetch', vi.fn()
      .mockReturnValueOnce(stale)
      .mockReturnValueOnce(fresh))
    renderComposer('en')
    fireEvent.click(screen.getByTestId('evidence-compose-open'))
    addCommandEntry()
    fireEvent.click(screen.getByTestId('evidence-compose'))

    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByTestId('evidence-compose-open'))
    fireEvent.click(screen.getByTestId('evidence-compose'))
    await waitFor(() => expect(screen.getByTestId('evidence-output'))
      .toHaveValue('# New session after stale failure'))

    rejectStale(new Error('stale network failure'))
    await Promise.resolve()

    expect(screen.getByTestId('evidence-output')).toHaveValue('# New session after stale failure')
    expect(screen.queryByTestId('evidence-error')).not.toBeInTheDocument()
    expect(screen.getByTestId('evidence-compose')).not.toBeDisabled()
    expect(screen.getByTestId('evidence-title-1')).toHaveValue('Unit tests')
  })

  it('reports clipboard failure inline and confirms successful copies through the host toast', async () => {
    const onToast = vi.fn()
    const writeText = vi.fn()
      .mockRejectedValueOnce(new Error('denied'))
      .mockResolvedValueOnce(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      markdown: '# 验证证据草稿',
      entryCount: 1,
    }), { status: 200 })))
    renderComposer('zh', onToast)
    fireEvent.click(screen.getByTestId('evidence-compose-open'))
    addCommandEntry()
    fireEvent.click(screen.getByTestId('evidence-compose'))
    await screen.findByTestId('evidence-output')

    fireEvent.click(screen.getByTestId('evidence-copy'))
    await waitFor(() => expect(screen.getByTestId('evidence-copy-error')).toHaveTextContent('复制失败'))
    fireEvent.click(screen.getByTestId('evidence-copy'))
    await waitFor(() => expect(onToast).toHaveBeenCalledWith('验证证据草稿已复制'))
  })

  it('keeps the readonly Markdown fallback visibly focusable for manual keyboard copy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      markdown: '# Verification evidence draft',
      entryCount: 1,
    }), { status: 200 })))
    renderComposer('en')
    fireEvent.click(screen.getByTestId('evidence-compose-open'))
    addCommandEntry()
    fireEvent.click(screen.getByTestId('evidence-compose'))

    const output = await screen.findByTestId('evidence-output')
    expect(output.className).toContain('focus-visible:ring-2')
    expect(output.className).toContain('focus-visible:ring-accent-t')
  })
})
