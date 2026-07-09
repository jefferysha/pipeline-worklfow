import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '../i18n'
import { NewChangeDialog } from './NewChangeDialog'

beforeEach(() => {
  localStorage.clear()
  ;(window as unknown as { __PIPELINE_DASHBOARD_TOKEN__?: string }).__PIPELINE_DASHBOARD_TOKEN__ = 'tok'
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(over: { createStatus?: number; createError?: string } = {}) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).startsWith('/api/workflows?root=')) {
      return { ok: true, status: 200, json: async () => ({ names: ['release-train'] }) }
    }
    if (String(url) === '/api/changes' && init?.method === 'POST') {
      const status = over.createStatus ?? 200
      return {
        ok: status === 200,
        status,
        json: async () => (status === 200 ? { ok: true, name: 'x', path: '/p' } : { ok: false, error: over.createError ?? 'boom' }),
      }
    }
    throw new Error(`unexpected fetch ${url}`)
  })
}

function renderDialog(over: Partial<Parameters<typeof NewChangeDialog>[0]> = {}) {
  const props = { root: '/repo', onClose: vi.fn(), onCreated: vi.fn(), ...over }
  render(
    <I18nProvider>
      <NewChangeDialog {...props} />
    </I18nProvider>,
  )
  return props
}

describe('NewChangeDialog（G18 主入口）', () => {
  it('渲染名字/workflow/track 三字段，workflow 下拉含 default + 拉取到的自定义名', async () => {
    vi.stubGlobal('fetch', stubFetch())
    renderDialog()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByTestId('newchange-name')).toBeInTheDocument()
    await waitFor(() => {
      const wfSelect = screen.getByTestId('newchange-workflow') as HTMLSelectElement
      expect([...wfSelect.options].map((o) => o.value)).toEqual(['default', 'release-train'])
    })
    const trackSelect = screen.getByTestId('newchange-track') as HTMLSelectElement
    expect([...trackSelect.options].map((o) => o.value)).toEqual(['chat', 'pm', 'frontend', 'backend'])
  })

  it('名字实时校验：含空格 → 朱红错误行 + 创建禁用；改合法后恢复', async () => {
    vi.stubGlobal('fetch', stubFetch())
    renderDialog()
    const input = screen.getByTestId('newchange-name')
    fireEvent.change(input, { target: { value: 'bad name' } })
    expect(screen.getByTestId('newchange-name-error')).toBeInTheDocument()
    expect(screen.getByTestId('newchange-submit')).toBeDisabled()
    fireEvent.change(input, { target: { value: 'fix-login' } })
    expect(screen.queryByTestId('newchange-name-error')).toBeNull()
    expect(screen.getByTestId('newchange-submit')).toBeEnabled()
  })

  it('CLI 教学行实时拼出等价命令', async () => {
    vi.stubGlobal('fetch', stubFetch())
    renderDialog()
    fireEvent.change(screen.getByTestId('newchange-name'), { target: { value: 'fix-login' } })
    fireEvent.change(screen.getByTestId('newchange-track'), { target: { value: 'frontend' } })
    expect(screen.getByTestId('newchange-cli').textContent).toContain(
      'pipeline init fix-login --workflow default --track frontend',
    )
  })

  it('提交：POST /api/changes 正确 body → onCreated 回调', async () => {
    const fetchMock = stubFetch()
    vi.stubGlobal('fetch', fetchMock)
    const props = renderDialog()
    fireEvent.change(screen.getByTestId('newchange-name'), { target: { value: 'fix-login' } })
    fireEvent.click(screen.getByTestId('newchange-submit'))
    await waitFor(() => expect(props.onCreated).toHaveBeenCalledOnce())
    const call = fetchMock.mock.calls.find(([u]) => String(u) === '/api/changes')!
    expect(JSON.parse((call[1] as RequestInit).body as string)).toEqual({
      root: '/repo', name: 'fix-login', workflow: 'default', track: 'chat',
    })
  })

  it('server 拒绝 → 行内错误呈现文案，不关闭', async () => {
    vi.stubGlobal('fetch', stubFetch({ createStatus: 400, createError: 'change 已存在' }))
    const props = renderDialog()
    fireEvent.change(screen.getByTestId('newchange-name'), { target: { value: 'dup-x' } })
    fireEvent.click(screen.getByTestId('newchange-submit'))
    await waitFor(() => expect(screen.getByTestId('newchange-server-error').textContent).toContain('change 已存在'))
    expect(props.onCreated).not.toHaveBeenCalled()
    expect(props.onClose).not.toHaveBeenCalled()
  })

  it('取消 → onClose', async () => {
    vi.stubGlobal('fetch', stubFetch())
    const props = renderDialog()
    fireEvent.click(screen.getByText('取消'))
    expect(props.onClose).toHaveBeenCalledOnce()
  })

  // 评审 P0-5 随迁（P3-16）：迁移到共享 Dialog 前，名字输入框不会自动聚焦，且整个表单不在
  // 任何 <form> 里——回车键在纯 <div> 结构里没有隐式提交语义，什么都不会发生。
  it('挂载后名字输入框自动聚焦（initialFocusRef）', async () => {
    vi.stubGlobal('fetch', stubFetch())
    renderDialog()
    expect(document.activeElement).toBe(screen.getByTestId('newchange-name'))
  })

  it('包裹在 <form> 内：名字输入框回车提交一次（不重复提交）', async () => {
    const fetchMock = stubFetch()
    vi.stubGlobal('fetch', fetchMock)
    const props = renderDialog()
    const user = userEvent.setup()

    const nameInput = screen.getByTestId('newchange-name')
    expect(document.activeElement).toBe(nameInput) // 前提：本用例复用挂载即聚焦这件事
    await user.type(nameInput, 'fix-login')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(props.onCreated).toHaveBeenCalledOnce())
    const postCalls = fetchMock.mock.calls.filter(([u]) => String(u) === '/api/changes')
    expect(postCalls).toHaveLength(1)
  })
})
