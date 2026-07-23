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

// full-install W2（旅程 P0 断点）：no-project 从单命令教学升级为「诚实三步 checklist」——起步
// 去终端（决议#7 不加注册 UI），三条真命令（pipeline init / setup / doctor）逐条可复制。旧断言
// 意图迁移：单 CLI 块 → 三步命令行，每条各自可复制；「自动登记项目」事实并入 step_init 文案。
describe('Onboarding no-project（自动发现 + 终端初始化 checklist）', () => {
  it('渲染标题 + 诚实框架，不再要求用户输入本机绝对路径', () => {
    renderOb()
    const card = screen.getByTestId('onboard-no-project')
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

  it('三步可执行 checklist：init / setup / doctor 三条真命令都在且各自可复制文本正确', () => {
    renderOb()
    // 命令文本（可复制的字面终端命令，非 i18n）
    expect(screen.getByTestId('onboard-cli').textContent).toContain('pipeline init')
    expect(screen.getByTestId('onboard-cmd-setup').textContent).toBe('pipeline setup')
    expect(screen.getByTestId('onboard-cmd-doctor').textContent).toBe('pipeline doctor')
    // 每条都有独立复制钮
    expect(screen.getByTestId('onboard-copy')).toBeInTheDocument()
    expect(screen.getByTestId('onboard-copy-setup')).toBeInTheDocument()
    expect(screen.getByTestId('onboard-copy-doctor')).toBeInTheDocument()
    // 装技能这一步的人话标签在（批 4 的核心：不只教 init，还教 setup 装技能配就绪）
    expect(screen.getByTestId('onboard-no-project').textContent).toContain('装技能')
  })

  it('每条命令逐个可复制：clipboard 写入对应命令 + 文案切「已复制」', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    renderOb()
    fireEvent.click(screen.getByTestId('onboard-copy'))
    await waitFor(() => expect(screen.getByTestId('onboard-copy').textContent).toContain('已复制'))
    expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining('pipeline init'))
    fireEvent.click(screen.getByTestId('onboard-copy-setup'))
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith('pipeline setup'))
    fireEvent.click(screen.getByTestId('onboard-copy-doctor'))
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith('pipeline doctor'))
  })

  it('项目来源只给自动登记的真实 init 路径，不再发送 POST /api/projects', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderOb()
    expect(screen.getByTestId('onboard-cli')).toHaveTextContent('pipeline init')
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
    expect(screen.getByText('这个项目还没有 change')).toBeInTheDocument()
    expect(screen.getByTestId('onboard-no-change')).not.toHaveTextContent('⧉')
    expect(screen.getByTestId('onboard-cli').textContent).toContain('pipeline init')
    expect(screen.getByTestId('onboard-cli').textContent).toContain('/Users/me/code/proj')
    fireEvent.click(screen.getByTestId('onboard-new-change'))
    expect(await screen.findByTestId('create-change-dialog')).toBeInTheDocument()
    expect(screen.getByText('选择执行路线')).toBeInTheDocument()
  })
})
