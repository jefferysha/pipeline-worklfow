import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nProvider } from '../i18n'
import { Onboarding } from './Onboarding'

beforeEach(() => {
  localStorage.clear()
  ;(window as unknown as { __PIPELINE_DASHBOARD_TOKEN__?: string }).__PIPELINE_DASHBOARD_TOKEN__ = 'tok'
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function renderOb(over: Partial<Parameters<typeof Onboarding>[0]> = {}) {
  const props = { kind: 'no-project' as const, onRegistered: vi.fn(), onNewChange: vi.fn(), ...over }
  render(
    <I18nProvider>
      <Onboarding {...props} />
    </I18nProvider>,
  )
  return props
}

describe('Onboarding no-project（零项目首屏：注册表单 + CLI 双路径）', () => {
  it('渲染标题/路径输入/注册按钮/CLI 教学块', () => {
    renderOb()
    expect(screen.getByText('还没有注册任何项目')).toBeInTheDocument()
    expect(screen.getByTestId('onboard-path')).toBeInTheDocument()
    expect(screen.getByTestId('onboard-register')).toBeInTheDocument()
    expect(screen.getByTestId('onboard-cli').textContent).toContain('pipeline')
  })

  it('注册提交：POST /api/projects → onRegistered 回调', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, root: '/x' }) })
    vi.stubGlobal('fetch', fetchMock)
    const props = renderOb()
    fireEvent.change(screen.getByTestId('onboard-path'), { target: { value: '/Users/me/code/proj' } })
    fireEvent.click(screen.getByTestId('onboard-register'))
    await waitFor(() => expect(props.onRegistered).toHaveBeenCalledOnce())
    expect(String(fetchMock.mock.calls[0]![0])).toBe('/api/projects')
  })

  it('注册失败：server 文案行内可见，不回调', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ ok: false, error: '路径不存在' }) }))
    const props = renderOb()
    fireEvent.change(screen.getByTestId('onboard-path'), { target: { value: '/nope' } })
    fireEvent.click(screen.getByTestId('onboard-register'))
    await waitFor(() => expect(screen.getByTestId('onboard-error').textContent).toContain('路径不存在'))
    expect(props.onRegistered).not.toHaveBeenCalled()
  })

  it('复制按钮：clipboard 写入 CLI 命令 + 文案切换"已复制"', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    renderOb()
    fireEvent.click(screen.getByTestId('onboard-copy'))
    await waitFor(() => expect(screen.getByTestId('onboard-copy').textContent).toContain('已复制'))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('pipeline projects add'))
  })
})

describe('Onboarding no-change（有项目零 change：新建引导）', () => {
  it('渲染新建引导 + 主按钮回调 + init CLI 教学', () => {
    const props = renderOb({ kind: 'no-change', root: '/Users/me/code/proj' })
    expect(screen.getByText('这个项目还没有 change')).toBeInTheDocument()
    expect(screen.getByTestId('onboard-cli').textContent).toContain('pipeline init')
    fireEvent.click(screen.getByTestId('onboard-new-change'))
    expect(props.onNewChange).toHaveBeenCalledOnce()
  })
})
