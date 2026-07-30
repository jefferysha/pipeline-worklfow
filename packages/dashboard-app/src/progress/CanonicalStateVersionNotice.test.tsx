import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { CanonicalStateVersionNotice } from './CanonicalStateVersionNotice'

const issues = [{
  kind: 'unsupported-canonical-version' as const,
  change: 'future-change',
  foundVersion: 3,
  supportedVersion: 1,
  action: 'upgrade-runtime' as const,
}]

beforeEach(() => {
  localStorage.clear()
})

describe('CanonicalStateVersionNotice', () => {
  it('中文展示版本边界与安全升级指引，并复用 refresh 交互', () => {
    const onRefresh = vi.fn()
    render(
      <I18nProvider>
        <CanonicalStateVersionNotice issues={issues} loading={false} onRefresh={onRefresh} />
      </I18nProvider>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('需要升级 Tenon')
    expect(screen.getByRole('alert')).toHaveTextContent('future-change')
    expect(screen.getByRole('alert')).toHaveTextContent('3')
    expect(screen.getByRole('alert')).toHaveTextContent('1')
    expect(screen.getByText('tenon update --codex')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '升级后刷新' }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('支持键盘聚焦并通过 Enter 刷新', async () => {
    const user = userEvent.setup()
    const onRefresh = vi.fn()
    render(
      <I18nProvider>
        <CanonicalStateVersionNotice issues={issues} loading={false} onRefresh={onRefresh} />
      </I18nProvider>,
    )

    await user.tab()
    expect(screen.getByRole('button', { name: '升级后刷新' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('加载时禁用刷新并提供英文状态；空数组不渲染', () => {
    localStorage.setItem('tenon-dashboard-lang', 'en')
    const { rerender } = render(
      <I18nProvider>
        <CanonicalStateVersionNotice issues={issues} loading onRefresh={() => undefined} />
      </I18nProvider>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Tenon update required')
    expect(screen.getByRole('button', { name: 'Refreshing status…' })).toBeDisabled()

    rerender(
      <I18nProvider>
        <CanonicalStateVersionNotice issues={[]} loading={false} onRefresh={() => undefined} />
      </I18nProvider>,
    )
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
