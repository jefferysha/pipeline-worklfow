import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nProvider } from '../i18n'
import { AdvancedPanel } from './AdvancedPanel'
import { makeSnapshot } from '../testkit'

// traffic 面板挂载即 fetch 数据端——stub 全局 fetch 喂空形状，隔离网络（能力驱动渲染判据不依赖内容）。
// afk 已升格为一级导航 <AfkWorkbench/>（Task 8），Advanced 折叠面不再挂载它，故不再需要 stub
// /api/afk/snapshot。
function stubFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = String(url)
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

  it('列出 2 个降级工具：流量 / 运行时（afk/loops 均已升格为一级导航——loops 收进 GOAL.md F1 的工作台下拉，见下方专项测试）', () => {
    renderAdv(makeSnapshot([]))
    for (const key of ['traffic', 'runtime']) {
      expect(screen.getByTestId(`advanced-${key}`)).toBeInTheDocument()
    }
    expect(screen.queryByTestId('advanced-afk')).toBeNull()
    expect(screen.queryByTestId('advanced-loops')).toBeNull()
  })

  it('server 未声明能力时全标占位（待对应里程碑数据端）', () => {
    renderAdv(makeSnapshot([], { capabilities: { snapshot: true } }))
    for (const key of ['traffic', 'runtime']) {
      expect(screen.getByTestId(`advanced-status-${key}`).textContent).toContain('占位')
    }
    expect(screen.getByTestId('advanced-traffic').textContent).toMatch(/M8/)
  })

  it('Task 8：afk 已升格为一级导航 <AfkWorkbench/>，即便 server 声明 afk=true，Advanced 折叠面也不再渲染 afk 摘要/占位（避免两份视图打架）', () => {
    renderAdv(makeSnapshot([], { capabilities: { afk: true } }))
    expect(screen.queryByTestId('advanced-afk')).toBeNull()
    expect(screen.queryByTestId('afk-panel')).toBeNull()
    expect(screen.queryByTestId('advanced-status-afk')).toBeNull()
    // 未接线的 runtime 仍占位（其余工具不受影响）
    expect(screen.getByTestId('advanced-status-runtime').textContent).toContain('占位')
  })

  it('GOAL.md F1：loops 已升格为一级导航（工作台下拉）<LoopsPanel/>，即便 server 声明 loops=true，Advanced 折叠面也不再渲染 loops 摘要/占位（与 afk 同一处置）', () => {
    renderAdv(makeSnapshot([], { capabilities: { loops: true } }))
    expect(screen.queryByTestId('advanced-loops')).toBeNull()
    expect(screen.queryByTestId('advanced-status-loops')).toBeNull()
    // 未接线的 runtime 仍占位（其余工具不受影响）
    expect(screen.getByTestId('advanced-status-runtime').textContent).toContain('占位')
  })

  it('#34d：server 声明 traffic=true → 真渲染 traffic 面板（能力声明驱动，不谎报）', async () => {
    renderAdv(makeSnapshot([], { capabilities: { traffic: true } }))
    expect(await screen.findByTestId('traffic-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('advanced-status-traffic')).toBeNull()
    expect(screen.getByTestId('advanced-status-runtime').textContent).toContain('占位')
  })
})
