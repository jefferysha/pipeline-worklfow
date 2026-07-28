import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '../i18n'
import { ContextBundlePreview } from './ContextBundlePreview'

const input = {
  kind: 'proposal',
  path: 'openspec/changes/demo/proposal.md',
  digest: `sha256:${'a'.repeat(64)}`,
  reason: '定义目标、范围、非目标与验收信号',
  reasonCode: 'context-bundle.reason.proposal',
  mode: 'full',
  sourceBytes: 901,
  materializedBytes: 640,
} as const

function responseBody(to = 'verify', inputs = [input]) {
  return {
    ok: true,
    preview: {
      schemaVersion: 'context-bundle-preview/v1',
      sideEffects: 'none',
      change: 'demo',
      from: 'build',
      to,
      tier: 'strong',
      documentCount: inputs.length,
      inputs,
      budget: { maxBytes: 120000, usedBytes: inputs.reduce((sum, item) => sum + item.materializedBytes, 0), fits: true },
      aggregateDigest: `sha256:${'b'.repeat(64)}`,
    },
  }
}

function renderPreview(currentPhase = 'build') {
  return render(
    <I18nProvider>
      <ContextBundlePreview root="/repo" change="demo" currentPhase={currentPhase} />
    </I18nProvider>,
  )
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ContextBundlePreview', () => {
  it('mount 时用下一 canonical phase + 120000 请求，loading 后显示 source/materialized bytes', async () => {
    const pending = deferred<Response>()
    const fetchMock = vi.fn().mockReturnValue(pending.promise)
    vi.stubGlobal('fetch', fetchMock)

    renderPreview()

    expect(screen.getByText('正在预检 Context Bundle…')).toBeInTheDocument()
    expect(screen.getByLabelText('目标阶段')).toHaveValue('verify')
    expect(screen.getByLabelText('预算（bytes）')).toHaveValue(120000)
    pending.resolve(new Response(JSON.stringify(responseBody()), { status: 200 }))

    expect(await screen.findByText('640 / 120,000 bytes')).toBeInTheDocument()
    expect(screen.getByText('1 份文档')).toBeInTheDocument()
    expect(screen.getByText('源文件 901 bytes · 物化 640 bytes')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('target=verify&budgetBytes=120000'),
      expect.any(Object),
    )
  })

  it('open 的成功零输入显示 policy-empty，而不是错误', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(responseBody()), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(responseBody('open', [])), { status: 200 })))
    const user = userEvent.setup()
    renderPreview()

    await screen.findByText('640 / 120,000 bytes')
    await user.selectOptions(screen.getByLabelText('目标阶段'), 'open')

    expect(await screen.findByText('该目标阶段不要求读取文档。')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('422 显示 required/available 与安全摘要；调大预算后 retry 成功', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(responseBody()), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: false,
        code: 'CONTEXT_BUNDLE_BUDGET_EXCEEDED',
        error: 'too small',
        preview: {
          ...responseBody().preview,
          budget: { maxBytes: 100, usedBytes: 640, fits: false },
          aggregateDigest: undefined,
        },
      }), { status: 422 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(responseBody()), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderPreview()
    await screen.findByText('640 / 120,000 bytes')

    const budget = screen.getByLabelText('预算（bytes）')
    await user.clear(budget)
    await user.type(budget, '100{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('预算不足：需要 640 bytes，可用 100 bytes。')
    expect(screen.getByText('源文件 901 bytes · 物化 640 bytes')).toBeInTheDocument()
    await user.clear(budget)
    await user.type(budget, '120000')
    await user.click(screen.getByRole('button', { name: '开始预检' }))

    expect(await screen.findByText('640 / 120,000 bytes')).toBeInTheDocument()
  })

  it('完整性错误显示 server 恢复提示，并能原地重试', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: false,
        code: 'CONTEXT_BUNDLE_DOCUMENT_STALE',
        error: 'proposal digest changed',
        repairAction: 'Record and read the document again.',
        detail: { path: 'openspec/changes/demo/proposal.md', kind: 'proposal' },
      }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(responseBody()), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderPreview()

    expect(await screen.findByRole('alert')).toHaveTextContent('必读文档已变化：openspec/changes/demo/proposal.md')
    expect(screen.getByRole('alert')).toHaveTextContent('修复或重新登记相关治理文档后')
    expect(screen.getByText('CONTEXT_BUNDLE_DOCUMENT_STALE')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试预览' }))
    expect(await screen.findByText('640 / 120,000 bytes')).toBeInTheDocument()
  })

  it('target 快速切换时取消旧请求，且旧响应不能覆盖最后结果', async () => {
    const first = deferred<Response>()
    const second = deferred<Response>()
    const fetchMock = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderPreview()

    const firstSignal = (fetchMock.mock.calls[0]?.[1] as RequestInit).signal as AbortSignal
    await user.selectOptions(screen.getByLabelText('目标阶段'), 'open')
    expect(firstSignal.aborted).toBe(true)
    second.resolve(new Response(JSON.stringify(responseBody('open', [])), { status: 200 }))
    expect(await screen.findByText('该目标阶段不要求读取文档。')).toBeInTheDocument()
    first.resolve(new Response(JSON.stringify(responseBody()), { status: 200 }))

    await waitFor(() => {
      expect(screen.getByText('该目标阶段不要求读取文档。')).toBeInTheDocument()
      expect(screen.queryByText('640 / 120,000 bytes')).not.toBeInTheDocument()
    })
  })

  it('可见 labels 提供 Tab 顺序，预算输入 Enter 与按钮走同一提交', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(responseBody()), { status: 200 }),
    ))
    const user = userEvent.setup()
    renderPreview()
    await screen.findByText('640 / 120,000 bytes')

    const target = screen.getByLabelText('目标阶段')
    const budget = screen.getByLabelText('预算（bytes）')
    const button = screen.getByRole('button', { name: '重新预检' })
    fireEvent.focus(document.body)
    await user.tab()
    expect(target).toHaveFocus()
    await user.tab()
    expect(budget).toHaveFocus()
    await user.tab()
    expect(button).toHaveFocus()

    await user.clear(budget)
    await user.type(budget, '5000{Enter}')
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(String(vi.mocked(fetch).mock.calls[1]?.[0])).toContain('budgetBytes=5000')
  })

  it('unmount 会 abort 当前请求', () => {
    const pending = deferred<Response>()
    const fetchMock = vi.fn().mockReturnValue(pending.promise)
    vi.stubGlobal('fetch', fetchMock)
    const rendered = renderPreview()
    const signal = (fetchMock.mock.calls[0]?.[1] as RequestInit).signal as AbortSignal

    rendered.unmount()

    expect(signal.aborted).toBe(true)
  })

  it('custom workflow step 仍显示入口，并以 open 作为安全默认 target', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(responseBody('open', [])), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    renderPreview('draft')

    expect(screen.getByText('Context Bundle 预算预览')).toBeInTheDocument()
    expect(screen.getByLabelText('目标阶段')).toHaveValue('open')
    expect(await screen.findByText('该目标阶段不要求读取文档。')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('target=open'),
      expect.any(Object),
    )
  })

  it('编辑 budget 会 abort 并失效在途响应，旧预算结果不会覆盖新输入', async () => {
    const pending = deferred<Response>()
    const fetchMock = vi.fn().mockReturnValue(pending.promise)
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderPreview()

    const signal = (fetchMock.mock.calls[0]?.[1] as RequestInit).signal as AbortSignal
    const budget = screen.getByLabelText('预算（bytes）')
    await user.clear(budget)
    await user.type(budget, '100')
    expect(signal.aborted).toBe(true)
    expect(screen.getByText('参数已改变，提交后重新预检。')).toBeInTheDocument()

    pending.resolve(new Response(JSON.stringify(responseBody()), { status: 200 }))
    await waitFor(() => expect(screen.queryByText('640 / 120,000 bytes')).not.toBeInTheDocument())
    expect(budget).toHaveValue(100)
  })

  it('英文界面按共享 reasonCode 本地化，协议 token 与 path 保持原样', async () => {
    localStorage.setItem('tenon-dashboard-lang', 'en')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(responseBody()), { status: 200 }),
    ))

    renderPreview()

    expect(screen.getByLabelText('Target stage')).toBeInTheDocument()
    expect(screen.getByLabelText('Budget (bytes)')).toBeInTheDocument()
    expect(await screen.findByText('Defines goals, scope, non-goals, and acceptance signals.')).toBeInTheDocument()
    expect(await screen.findByText('Source 901 bytes · materialized 640 bytes')).toBeInTheDocument()
    expect(screen.getByText('openspec/changes/demo/proposal.md')).toBeInTheDocument()
    expect(screen.getByText('full')).toBeInTheDocument()
  })

  it('英文错误按 stable code 与结构化 path 本地化，不显示 server 中文或绝对路径', async () => {
    localStorage.setItem('tenon-dashboard-lang', 'en')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: false,
      code: 'CONTEXT_BUNDLE_DOCUMENT_MISSING',
      error: '中文底层错误 /Users/private/repo',
      repairAction: '中文恢复动作',
      detail: { kind: 'proposal', path: 'openspec/changes/demo/proposal.md' },
    }), { status: 409 })))

    renderPreview()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('A required document is unavailable: openspec/changes/demo/proposal.md')
    expect(alert).toHaveTextContent('Fix or record the affected governance document')
    expect(alert).not.toHaveTextContent('中文')
    expect(alert).not.toHaveTextContent('/Users/private')
  })

  it('无可信 fd reader 时按 stable capability code 本地化并保留重试动作', async () => {
    localStorage.setItem('tenon-dashboard-lang', 'en')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: false,
      code: 'CONTEXT_BUNDLE_TRUSTED_READER_UNAVAILABLE',
      error: 'server platform detail /Users/private/repo',
      repairAction: 'server repair prose',
    }), { status: 501 })))

    renderPreview()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(
      'This runtime cannot safely traverse directory file descriptors. Preview in a Linux Dashboard.',
    )
    expect(alert).toHaveTextContent(
      'Start the Tenon Dashboard in a Linux environment, then retry.',
    )
    expect(alert).not.toHaveTextContent('/Users/private')
    expect(screen.getByRole('button', { name: 'Retry preview' })).toBeInTheDocument()
  })

  it('canonical state 损坏使用专用恢复文案，不误导用户重新登记文档', async () => {
    localStorage.setItem('tenon-dashboard-lang', 'en')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: false,
      code: 'CONTEXT_BUNDLE_STATE_CORRUPT',
      error: 'server prose',
      repairAction: 'server repair prose',
      detail: {},
    }), { status: 409 })))

    renderPreview()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(
      'The Change canonical state is corrupt. Restore a valid state first.',
    )
    expect(alert).toHaveTextContent('Restore a valid canonical Change state, then retry.')
    expect(alert).not.toHaveTextContent(
      'Fix or record the affected governance document, then retry here.',
    )
  })
})
