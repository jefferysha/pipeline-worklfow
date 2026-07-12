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
  const props = { kind: 'no-project' as const, onNewChange: vi.fn(), ...over }
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
describe('Onboarding no-project（诚实三步 checklist：dashboard 只读，起步去终端）', () => {
  it('渲染标题 + 诚实框架（只读 / 去终端）', () => {
    renderOb()
    expect(screen.getByTestId('onboard-no-project')).toBeInTheDocument()
    const desc = screen.getByText(/这个 dashboard 只读/)
    expect(desc.textContent).toContain('终端')
    expect(desc.textContent).toContain('刷新本页')
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

  it('诚实：无注册表单（无路径输入 / 无注册按钮），无幽灵命令 pipeline projects add', () => {
    renderOb()
    expect(screen.queryByTestId('onboard-path')).toBeNull()
    expect(screen.queryByTestId('onboard-register')).toBeNull()
    expect(screen.getByTestId('onboard-no-project').textContent).not.toContain('projects add')
  })
})

describe('Onboarding no-change（有项目零 change：新建引导 + init CLI 教学）', () => {
  it('渲染新建引导 + 主按钮回调 + init CLI 教学（带项目 root）', () => {
    const props = renderOb({ kind: 'no-change', root: '/Users/me/code/proj' })
    expect(screen.getByText('这个项目还没有 change')).toBeInTheDocument()
    expect(screen.getByTestId('onboard-cli').textContent).toContain('pipeline init')
    expect(screen.getByTestId('onboard-cli').textContent).toContain('/Users/me/code/proj')
    fireEvent.click(screen.getByTestId('onboard-new-change'))
    expect(props.onNewChange).toHaveBeenCalledOnce()
  })
})
