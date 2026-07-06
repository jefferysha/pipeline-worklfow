/**
 * AfkPanel.test —— #29d AFK 指挥面前端真 render（GOAL C9）。
 * @testing-library 真挂载组件 + 真 fetch stub 喂 /api/afk/snapshot 数据端形状 → 断言真实 DOM：
 * 泳道渲染、调度器 doctor 灯、卡片明细。非 mock 返回。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { I18nProvider } from '../i18n'
import { AfkPanel } from './AfkPanel'

const AFK_FIXTURE = {
  generated_at: '2026-07-07T00:00:00Z',
  scheduler: {
    status: 'attention',
    queued: 1, running: 1, merged: 0, failed: 1, conflict: 1, paused: 0, total: 4,
    message: '调度器需人工介入：1 failed / 1 conflict（现场已保留）',
  },
  lanes: {
    queued: [{ name: 'q1', root: '/r', path: '/r/openspec/changes/q1', phase: 'build', automation: 'queued', lane: 'queued', attempts: 0, queued_at: '2026-07-07T00:00:00Z', last_error: '', sandbox: '', worktree: '', preserved_path: '' }],
    running: [{ name: 'r1', root: '/r', path: '/r/openspec/changes/r1', phase: 'build', automation: 'running', lane: 'running', attempts: 0, queued_at: '', last_error: '', sandbox: 'box1', worktree: '', preserved_path: '' }],
    merged: [],
    failed: [{ name: 'f1', root: '/r', path: '/r/openspec/changes/f1', phase: 'build', automation: 'failed', lane: 'failed', attempts: 2, queued_at: '', last_error: 'verify exploded', sandbox: '', worktree: '', preserved_path: '' }],
    conflict: [{ name: 'c1', root: '/r', path: '/r/openspec/changes/c1', phase: 'build', automation: 'conflict', lane: 'conflict', attempts: 1, queued_at: '', last_error: 'merge conflict', sandbox: '', worktree: '', preserved_path: '/tmp/preserved' }],
    paused: [],
  },
  cards: [],
}

function stubFetch(afk: unknown = AFK_FIXTURE, ok = true): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).includes('/api/afk/snapshot')) {
        return { ok, status: ok ? 200 : 500, json: async () => afk } as unknown as Response
      }
      throw new Error(`unexpected fetch ${url}`)
    }),
  )
}

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

function renderAfk(): void {
  render(
    <I18nProvider>
      <AfkPanel />
    </I18nProvider>,
  )
}

describe('AfkPanel（#29d 真消费 /api/afk/snapshot）', () => {
  it('真 fetch 数据端 → 渲染 6 条泳道，各含对应卡片', async () => {
    stubFetch()
    renderAfk()
    // 异步 fetch 落定后卡片出现
    expect(await screen.findByTestId('afk-card-q1')).toBeInTheDocument()
    for (const lane of ['queued', 'running', 'merged', 'failed', 'conflict', 'paused']) {
      expect(screen.getByTestId(`afk-lane-${lane}`)).toBeInTheDocument()
    }
    expect(screen.getByTestId('afk-card-r1')).toBeInTheDocument()
    expect(screen.getByTestId('afk-card-f1')).toBeInTheDocument()
    expect(screen.getByTestId('afk-card-c1')).toBeInTheDocument()
    // 卡片落在正确泳道
    expect(within(screen.getByTestId('afk-lane-failed')).getByTestId('afk-card-f1')).toBeInTheDocument()
  })

  it('调度器 doctor 灯呈 attention 态 + 消息真显示', async () => {
    stubFetch()
    renderAfk()
    const light = await screen.findByTestId('afk-scheduler')
    expect(light.className).toMatch(/attention/)
    expect(light.textContent).toContain('人工介入')
  })

  it('failed 卡片显示 last_error 明细', async () => {
    stubFetch()
    renderAfk()
    const card = await screen.findByTestId('afk-card-f1')
    expect(card.textContent).toContain('verify exploded')
  })

  it('数据端失败 → 呈现错误态而非崩溃', async () => {
    stubFetch(AFK_FIXTURE, false)
    renderAfk()
    expect(await screen.findByTestId('afk-panel')).toBeInTheDocument()
    expect(screen.getByTestId('afk-error')).toBeInTheDocument()
  })
})
