import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nProvider } from '../i18n'
import { makeChange } from '../testkit'
import { ReviewHandshakeStatus } from './ReviewHandshakeStatus'

function renderStatus(
  phase: string,
  reviewHandshake?: ReturnType<typeof makeChange>['reviewHandshake'],
) {
  const change = makeChange('demo', phase, {
    ...(reviewHandshake === undefined ? {} : { reviewHandshake }),
  })
  return render(
    <I18nProvider>
      <ReviewHandshakeStatus change={change} />
    </I18nProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
})

describe('ReviewHandshakeStatus', () => {
  it('非 review step 不渲染状态卡或可聚焦控件', () => {
    const { container } = renderStatus('build', { status: 'not-requested' })
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByTestId('review-handshake-status')).not.toBeInTheDocument()
  })

  it('旧 runtime 缺字段时明确显示 unavailable，不冒充未请求', () => {
    renderStatus('spec')
    expect(screen.getByTestId('review-handshake-status')).toHaveTextContent('复核状态不可用')
    expect(screen.queryByText('尚未发起复核请求')).not.toBeInTheDocument()
  })

  it('三态分别展示下一步，且 pending/approved 保留原始 exact event', () => {
    const pending = renderStatus('verify', {
      status: 'pending',
      event: 'verify-fail',
      requestedAt: '2026-07-30T02:00:00Z',
    })
    expect(screen.getByRole('status')).toHaveTextContent('等待明确确认')
    expect(screen.getByText('verify-fail')).toBeInTheDocument()
    expect(screen.getByTestId('review-handshake-status').querySelectorAll('button, a, input, select'))
      .toHaveLength(0)

    pending.rerender(
      <I18nProvider>
        <ReviewHandshakeStatus change={makeChange('demo', 'verify', {
          reviewHandshake: {
            status: 'approved',
            event: 'verify-fail',
            requestedAt: '2026-07-30T02:00:00Z',
            acknowledgedAt: '2026-07-30T02:01:00Z',
          },
        })} />
      </I18nProvider>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('已确认，可继续')
    expect(screen.getByText('verify-fail')).toBeInTheDocument()

    pending.rerender(
      <I18nProvider>
        <ReviewHandshakeStatus change={makeChange('demo', 'verify', {
          reviewHandshake: { status: 'not-requested' },
        })} />
      </I18nProvider>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('尚未发起复核请求')
    expect(screen.queryByText('verify-fail')).not.toBeInTheDocument()
  })

  it('英文文案不翻译 exact event identity', () => {
    localStorage.setItem('tenon-dashboard-lang', 'en')
    renderStatus('explore', {
      status: 'pending',
      event: 'explore-complete',
      requestedAt: '2026-07-30T02:00:00Z',
    })
    expect(screen.getByRole('status')).toHaveTextContent('Awaiting explicit confirmation')
    expect(screen.getByText('explore-complete')).toBeInTheDocument()
  })
})
