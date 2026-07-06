import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nProvider } from '../i18n'
import { AdvancedPanel } from './AdvancedPanel'
import { makeSnapshot } from '../testkit'

// afk/traffic 面板挂载即 fetch 数据端——stub 全局 fetch 喂空形状，隔离网络（能力驱动渲染判据不依赖内容）。
function stubFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('/api/afk/snapshot')) {
        return { ok: true, status: 200, json: async () => ({ generated_at: '', scheduler: { status: 'ok', queued: 0, running: 0, merged: 0, failed: 0, conflict: 0, paused: 0, total: 0, message: '空闲' }, lanes: { queued: [], running: [], merged: [], failed: [], conflict: [], paused: [] }, cards: [] }) } as unknown as Response
      }
      if (u.includes('/api/traces/sessions')) {
        return { ok: true, status: 200, json: async () => ({ generated_at: '', outbound: 'local-only', count: 0, sessions: [] }) } as unknown as Response
      }
      throw new Error(`unexpected fetch ${u}`)
    }),
  )
}

beforeEach(() => {
  localStorage.clear()
  stubFetch()
})
afterEach(() => vi.unstubAllGlobals())

function renderAdv(snapshot: Parameters<typeof AdvancedPanel>[0]['snapshot']) {
  render(
    <I18nProvider>
      <AdvancedPanel snapshot={snapshot} />
    </I18nProvider>,
  )
}

describe('AdvancedPanel（病灶③：debug 工具降级为折叠占位）', () => {
  it('用 <details> 折叠，默认不展开', () => {
    renderAdv(makeSnapshot([]))
    const panel = screen.getByTestId('advanced-panel')
    expect(panel.tagName.toLowerCase()).toBe('details')
    expect(panel).not.toHaveAttribute('open')
  })

  it('列出 4 个降级工具：流量 / 运行时 / loops / afk', () => {
    renderAdv(makeSnapshot([]))
    for (const key of ['traffic', 'runtime', 'loops', 'afk']) {
      expect(screen.getByTestId(`advanced-${key}`)).toBeInTheDocument()
    }
  })

  it('server 未声明能力时全标占位（待对应里程碑数据端）', () => {
    renderAdv(makeSnapshot([], { capabilities: { snapshot: true } }))
    for (const key of ['traffic', 'runtime', 'loops', 'afk']) {
      expect(screen.getByTestId(`advanced-status-${key}`).textContent).toContain('占位')
    }
    expect(screen.getByTestId('advanced-traffic').textContent).toMatch(/M8/)
    expect(screen.getByTestId('advanced-afk').textContent).toMatch(/M5/)
  })

  it('#29d：server 声明 afk=true → 真渲染 AFK 面板（非占位）', async () => {
    renderAdv(makeSnapshot([], { capabilities: { afk: true } }))
    expect(await screen.findByTestId('afk-panel')).toBeInTheDocument()
    // afk 已接线：不再是占位徽标
    expect(screen.queryByTestId('advanced-status-afk')).toBeNull()
    // 未接线的 loops 仍占位
    expect(screen.getByTestId('advanced-status-loops').textContent).toContain('占位')
  })

  it('#34d：server 声明 traffic=true → 真渲染 traffic 面板（能力声明驱动，不谎报）', async () => {
    renderAdv(makeSnapshot([], { capabilities: { traffic: true } }))
    expect(await screen.findByTestId('traffic-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('advanced-status-traffic')).toBeNull()
    expect(screen.getByTestId('advanced-status-loops').textContent).toContain('占位')
  })
})
