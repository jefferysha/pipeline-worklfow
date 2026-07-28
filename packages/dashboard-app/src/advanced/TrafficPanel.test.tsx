/**
 * TrafficPanel.test —— #34d traffic 查看器前端真 render（GOAL C9 / A7）。
 * @testing-library 真挂载 + 真 fetch stub 喂 /api/traces/* 数据端形状 → 断言真实 DOM：
 * 会话列表、点选会话拉记录、明细渲染、local-only 护栏提示。非 mock 返回。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '../i18n'
import { TrafficPanel } from './TrafficPanel'

const SESSIONS = {
  generated_at: '2026-07-07T00:00:00Z',
  outbound: 'local-only',
  count: 2,
  sessions: [
    { id: 'sess-A', started_at: '2026-07-07T00:00:00Z', updated_at: '2026-07-07T00:00:02Z', date_key: '2026-07-07', client: 'claude', proxy_mode: 'reverse', status: 'complete', record_count: 2, summary: null },
    { id: 'sess-B', started_at: '2026-07-07T01:00:00Z', updated_at: '2026-07-07T01:00:01Z', date_key: '2026-07-07', client: 'codex', proxy_mode: 'forward', status: 'active', record_count: 1, summary: null },
  ],
}
const RECORDS_A = {
  generated_at: '2026-07-07T00:00:00Z',
  outbound: 'local-only',
  session: 'sess-A',
  count: 2,
  records: [
    { request_id: 'req-1', request: { path: '/v1/messages', method: 'POST' }, response: { status: 200 } },
    { request_id: 'req-2', request: { path: '/v1/messages', method: 'POST' }, response: { status: 429 } },
  ],
}

function stubFetch(opts: { sessionsOk?: boolean } = {}): void {
  const sessionsOk = opts.sessionsOk ?? true
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('/api/traces/sessions')) {
        return { ok: sessionsOk, status: sessionsOk ? 200 : 500, json: async () => SESSIONS } as unknown as Response
      }
      if (u.includes('/api/traces/records')) {
        return { ok: true, status: 200, json: async () => RECORDS_A } as unknown as Response
      }
      throw new Error(`unexpected fetch ${u}`)
    }),
  )
}

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

function renderTraffic(): void {
  render(
    <I18nProvider>
      <TrafficPanel />
    </I18nProvider>,
  )
}

describe('TrafficPanel（#34d 真消费 /api/traces/*）', () => {
  it('真 fetch /api/traces/sessions → 渲染两条会话（client/记录数/状态）', async () => {
    stubFetch()
    renderTraffic()
    expect(await screen.findByTestId('traffic-session-sess-A')).toBeInTheDocument()
    expect(screen.getByTestId('traffic-session-sess-B')).toBeInTheDocument()
    const a = screen.getByTestId('traffic-session-sess-A')
    expect(a.textContent).toContain('claude')
    expect(a.textContent).toContain('2')
    expect(screen.getByRole('button', { name: /claude/ })).not.toHaveClass('hover:border-green')
    expect(screen.getByRole('button', { name: /claude/ })).toHaveClass('aria-pressed:border-(--accent)')
  })

  it('#34e 护栏提示：显式标注本地捕获 / 不外发（local-only）', async () => {
    stubFetch()
    renderTraffic()
    expect(await screen.findByTestId('traffic-panel')).toBeInTheDocument()
    expect(screen.getByTestId('traffic-note').textContent?.toLowerCase()).toContain('local-only')
  })

  it('点选会话 → 真 fetch /api/traces/records → 渲染两条记录（path/status）', async () => {
    stubFetch()
    renderTraffic()
    const btn = await screen.findByTestId('traffic-session-sess-A')
    await userEvent.click(within(btn).getByRole('button'))
    expect(await screen.findByTestId('traffic-records')).toBeInTheDocument()
    expect(screen.getByTestId('traffic-record-0').textContent).toContain('/v1/messages')
    expect(screen.getByTestId('traffic-record-1').textContent).toContain('429')
  })

  it('数据端失败 → 呈现错误态而非崩溃', async () => {
    stubFetch({ sessionsOk: false })
    renderTraffic()
    expect(await screen.findByTestId('traffic-panel')).toBeInTheDocument()
    expect(screen.getByTestId('traffic-error')).toHaveAttribute('role', 'alert')
  })
})
