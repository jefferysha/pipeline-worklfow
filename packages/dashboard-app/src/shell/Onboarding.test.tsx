import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nProvider } from '../i18n'
import { Onboarding } from './Onboarding'

beforeEach(() => {
  localStorage.clear()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function renderOb(over: Partial<Parameters<typeof Onboarding>[0]> = {}) {
  const props = { kind: 'no-project' as const, ...over }
  render(
    <I18nProvider>
      <Onboarding {...props} />
    </I18nProvider>,
  )
  return props
}

// full-install W2（旅程 P0 断点）：no-project 从单命令教学升级为「诚实两步 checklist」——起步
// 去终端（决议#7 不加注册 UI），两条真命令（tenon init / doctor）逐条可复制。Dashboard 本身
// 已是 setup 的结果，因此不再给无宿主参数的 setup 命令；「自动登记项目」事实并入 step_init 文案。
describe('Onboarding no-project（自动发现 + 终端初始化 checklist）', () => {
  it('渲染标题 + 诚实框架，不再要求用户输入本机绝对路径', () => {
    renderOb()
    const card = screen.getByTestId('onboard-no-project')
    expect(screen.getByRole('heading', { level: 1, name: '还没有注册任何项目' })).toBeInTheDocument()
    expect(card).toBeInTheDocument()
    expect(card.textContent).toContain('终端')
    expect(screen.queryByTestId('project-register-form')).toBeNull()
    expect(screen.queryByTestId('project-register-path')).toBeNull()
    expect(screen.queryByTestId('project-register-submit')).toBeNull()
    expect(card).toHaveTextContent('自动出现在这里')
    expect(card).not.toHaveTextContent('注册现有目录')
    expect(card).not.toHaveTextContent('⧉')
    expect(card.querySelector('svg')).not.toBeNull()
  })

  it('两步可执行 checklist：只给 init / doctor，不猜宿主并重复 setup', () => {
    renderOb()
    // 命令文本（可复制的字面终端命令，非 i18n）
    expect(screen.getByTestId('onboard-cli').textContent).toContain('tenon init')
    expect(screen.getByTestId('onboard-cmd-doctor').textContent).toBe('tenon doctor')
    // 每条都有独立复制钮
    expect(screen.getByTestId('onboard-copy')).toBeInTheDocument()
    expect(screen.getByTestId('onboard-copy-doctor')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '复制命令：tenon init my-change --track chat' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '复制命令：tenon doctor' })).toBeInTheDocument()
    expect(screen.queryByTestId('onboard-cmd-setup')).toBeNull()
    expect(screen.getByTestId('onboard-no-project')).not.toHaveTextContent('tenon setup')
  })

  it('每条命令逐个可复制：clipboard 写入对应命令 + 文案切「已复制」', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    renderOb()
    fireEvent.click(screen.getByTestId('onboard-copy'))
    await waitFor(() => expect(screen.getByTestId('onboard-copy').textContent).toContain('已复制'))
    expect(screen.getByTestId('onboard-copy')).not.toHaveTextContent('✓')
    expect(screen.getByTestId('onboard-copy').querySelector('svg')).not.toBeNull()
    expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining('tenon init'))
    fireEvent.click(screen.getByTestId('onboard-copy-doctor'))
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith('tenon doctor'))
  })

  it('项目来源只给自动登记的真实 init 路径，不再发送 POST /api/projects', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderOb()
    expect(screen.getByTestId('onboard-cli')).toHaveTextContent('tenon init')
    expect(screen.getByTestId('onboard-no-project')).not.toHaveTextContent('projects add')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('Onboarding no-change（有项目零 change：Route Lock 主入口 + CLI 诚实退路）', () => {
  it('渲染标题、真实新建入口与带 root 的 CLI 退路', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.startsWith('/api/workflows?')) return new Response(JSON.stringify({ names: [] }), { status: 200 })
      throw new Error(`unexpected fetch ${url}`)
    }))
    renderOb({ kind: 'no-change', root: '/Users/me/code/proj' })
    expect(screen.getByRole('heading', { level: 1, name: '这个项目还没有 change' })).toBeInTheDocument()
    expect(screen.getByTestId('onboard-no-change')).not.toHaveTextContent('⧉')
    expect(screen.getByTestId('onboard-cli').textContent).toContain('tenon init')
    expect(screen.getByTestId('onboard-cli').textContent).toContain('/Users/me/code/proj')
    fireEvent.click(screen.getByTestId('onboard-new-change'))
    expect(await screen.findByTestId('create-change-dialog')).toBeInTheDocument()
    expect(screen.getByText('选择执行路线')).toBeInTheDocument()
  })
})
