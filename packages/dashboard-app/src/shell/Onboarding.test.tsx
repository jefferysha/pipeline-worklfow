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

// T17（决议#7 + T2）：注册表单退役——pipeline init 会 best-effort 自动登记项目，no-project
// 空状态改纯教学态。旧断言意图迁移表：
//   · 「路径输入 + 注册按钮 + POST /api/projects」→ 表单 0 渲染（注册走 CLI，端点仅兼容保留）
//   · 「注册失败行内文案」→ 无注册路径，无此态
//   · 「复制按钮写入 pipeline projects add …」→ 幽灵命令清除，写入的是 pipeline init 命令
describe('Onboarding no-project（T17 纯教学态：跑 pipeline init，项目自动出现）', () => {
  it('渲染标题 + 教学文案（pipeline init 自动登记）+ CLI 命令块', () => {
    renderOb()
    expect(screen.getByText('还没有注册任何项目')).toBeInTheDocument()
    expect(screen.getByTestId('onboard-no-project').textContent).toContain('自动出现')
    expect(screen.getByTestId('onboard-cli').textContent).toContain('pipeline init')
  })

  it('注册表单已退役：无路径输入、无注册按钮', () => {
    renderOb()
    expect(screen.queryByTestId('onboard-path')).toBeNull()
    expect(screen.queryByTestId('onboard-register')).toBeNull()
  })

  it('幽灵命令清除：整个空状态不出现 "pipeline projects add"（真实命令是 pipeline init 自动登记）', () => {
    renderOb()
    expect(screen.getByTestId('onboard-no-project').textContent).not.toContain('projects add')
  })

  it('复制按钮：clipboard 写入 pipeline init 命令 + 文案切换"已复制"', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    renderOb()
    fireEvent.click(screen.getByTestId('onboard-copy'))
    await waitFor(() => expect(screen.getByTestId('onboard-copy').textContent).toContain('已复制'))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('pipeline init'))
    expect(writeText).not.toHaveBeenCalledWith(expect.stringContaining('projects add'))
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
