import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { WorkflowEditorView } from './WorkflowEditorView'

const ROOT = '/tmp/proj-a'

function renderView(onOpen = vi.fn()) {
  render(
    <I18nProvider>
      <WorkflowEditorView root={ROOT} onOpen={onOpen} />
    </I18nProvider>,
  )
  return onOpen
}

beforeEach(() => {
  localStorage.clear()
  global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
    if (url === `/api/workflows?root=${encodeURIComponent(ROOT)}`) {
      return new Response(JSON.stringify({ names: ['onboarding', 'release'] }), { status: 200 })
    }
    if (url === '/api/workflows/newone' && opts?.method === 'POST') {
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }
    if (url === `/api/workflows/onboarding?root=${encodeURIComponent(ROOT)}` && opts?.method === 'DELETE') {
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }
    throw new Error(`unexpected fetch ${url}`)
  }) as unknown as typeof fetch
})
afterEach(() => vi.restoreAllMocks())

describe('WorkflowEditorView', () => {
  it('挂载后真 fetch 列表，渲染两个 workflow 名字', async () => {
    renderView()
    await waitFor(() => expect(screen.getByText('onboarding')).toBeInTheDocument())
    expect(screen.getByText('release')).toBeInTheDocument()
  })

  it('列表为空 → 空态文案', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ names: [] }), { status: 200 })) as unknown as typeof fetch
    renderView()
    await waitFor(() => expect(screen.getByText('还没有自定义 workflow')).toBeInTheDocument())
  })

  it('点一个名字 → 调用 onOpen(name)', async () => {
    const onOpen = renderView()
    await waitFor(() => expect(screen.getByText('onboarding')).toBeInTheDocument())
    fireEvent.click(screen.getByText('onboarding'))
    expect(onOpen).toHaveBeenCalledWith('onboarding')
  })

  it('输入合法新名字 + 点新建 → POST 创建空骨架，成功后调用 onOpen(新名字)', async () => {
    const onOpen = renderView()
    await waitFor(() => expect(screen.getByText('onboarding')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText(/新 workflow 名/), { target: { value: 'newone' } })
    fireEvent.click(screen.getByRole('button', { name: '新建' }))
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith('newone'))
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
    const postCall = calls.find((c) => c[0] === '/api/workflows/newone')
    const body = JSON.parse(postCall![1].body as string)
    expect(body).toEqual({ name: 'newone', steps: [], root: ROOT })
  })

  it('非法新名字（含空格）→ 不发请求，显示错误', async () => {
    renderView()
    await waitFor(() => expect(screen.getByText('onboarding')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText(/新 workflow 名/), { target: { value: 'bad name' } })
    fireEvent.click(screen.getByRole('button', { name: '新建' }))
    expect(screen.getByText(/非法名字/)).toBeInTheDocument()
  })

  it('新名字是 default → 拒绝，不发请求', async () => {
    renderView()
    await waitFor(() => expect(screen.getByText('onboarding')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText(/新 workflow 名/), { target: { value: 'default' } })
    fireEvent.click(screen.getByRole('button', { name: '新建' }))
    expect(screen.getByText(/非法名字/)).toBeInTheDocument()
  })

  it('点删除 → 二次确认弹窗 → 确认后真 DELETE，成功后从列表消失', async () => {
    renderView()
    await waitFor(() => expect(screen.getByText('onboarding')).toBeInTheDocument())
    fireEvent.click(screen.getAllByRole('button', { name: '删除' })[0]!)
    // 确认弹窗：再点一次同一个"删除"确认按钮（弹窗内的确认按钮，测试用 confirm 文案定位）
    fireEvent.click(screen.getByRole('button', { name: /^确认/ }))
    await waitFor(() => expect(screen.queryByText('onboarding')).not.toBeInTheDocument())
    expect(screen.getByText('release')).toBeInTheDocument()
  })

  // whole-feature review Finding 2：confirmDelete 此前在非 2xx 响应时复用了"加载失败"专用的
  // 致命 `error` state——组件顶部 `if (error) return <p>...</p>` 会把整个列表 + 新建表单替换成
  // 一行错误文案，用户没有任何办法恢复（不能重试删除、不能新建、不能点开其它 workflow），除非
  // 刷新整个页面。本用例证明修复后：非 2xx DELETE 只产生一个就近展示、非致命的错误提示，
  // 列表（含删除失败的那一项）和新建表单必须仍然可见、可交互。
  it('DELETE 失败（非 2xx）→ 行内错误提示，列表（含删除失败的那一项）与新建表单仍可见可交互', async () => {
    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === `/api/workflows?root=${encodeURIComponent(ROOT)}`) {
        return new Response(JSON.stringify({ names: ['onboarding', 'release'] }), { status: 200 })
      }
      if (url === `/api/workflows/onboarding?root=${encodeURIComponent(ROOT)}` && opts?.method === 'DELETE') {
        return new Response(JSON.stringify({ error: '仍被 change 引用' }), { status: 409 })
      }
      throw new Error(`unexpected fetch ${url}`)
    }) as unknown as typeof fetch
    renderView()
    await waitFor(() => expect(screen.getByText('onboarding')).toBeInTheDocument())
    fireEvent.click(screen.getAllByRole('button', { name: '删除' })[0]!)
    fireEvent.click(screen.getByRole('button', { name: /^确认/ }))
    await waitFor(() => expect(screen.getByText(/删除失败/)).toBeInTheDocument())

    // 不是致命错误：列表（含删除失败的 onboarding 本身）和另一个未受影响的 workflow 仍可见。
    expect(screen.getByText('onboarding')).toBeInTheDocument()
    expect(screen.getByText('release')).toBeInTheDocument()
    // 新建表单仍可交互（不是被整段替换成一行文案）。
    const input = screen.getByPlaceholderText(/新 workflow 名/)
    expect(input).toBeInTheDocument()
    fireEvent.change(input, { target: { value: 'newone' } })
    expect(input).toHaveValue('newone')
    // 删除按钮本身也还在、可再次点击（不是一次性挡死后再也点不到）。
    expect(screen.getAllByRole('button', { name: '删除' }).length).toBeGreaterThan(0)
  })
})
