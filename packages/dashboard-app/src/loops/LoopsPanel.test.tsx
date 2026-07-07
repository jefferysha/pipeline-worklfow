import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LoopsPanel } from './LoopsPanel'

const SNAPSHOT = {
  generated_at: '2026-07-07T00:00:00Z',
  rows: [
    {
      root: '/tmp/proj-a', id: 'build-loop', name: 'Build Loop', autonomy_level: 'L1', status: 'active',
      readiness: { id: 'build-loop', score: 82, band: 'mostly-ready', dimensions: [], suggestions: [] },
      budget: { id: 'build-loop', hasBudget: true, maxTokensPerDay: 100000, warnThreshold: 80000, spentToday: 1000, remaining: 99000, usedRatio: 0.01, runsToday: 1, breaker: 'ok', onExceed: 'skip', autonomyLevel: 'L1', reportOnly: true, reason: '' },
    },
  ],
}

beforeEach(() => {
  global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
    if (url === '/api/loops/snapshot') {
      return new Response(JSON.stringify(SNAPSHOT), { status: 200 })
    }
    if (url === '/api/loops/level' && opts?.method === 'POST') {
      return new Response(JSON.stringify({ applied: true }), { status: 200 })
    }
    throw new Error(`unexpected fetch ${url}`)
  }) as unknown as typeof fetch
})
afterEach(() => vi.restoreAllMocks())

describe('LoopsPanel', () => {
  it('挂载后真 fetch 快照，渲染一行 loop（分级/就绪分/预算/状态）', async () => {
    render(<LoopsPanel />)
    await waitFor(() => expect(screen.getByText('build-loop')).toBeInTheDocument())
    expect(screen.getByText('L1')).toBeInTheDocument()
    expect(screen.getByText(/82/)).toBeInTheDocument()
  })

  it('点行展开详情 + 点升档按钮 → 真 POST /api/loops/level', async () => {
    render(<LoopsPanel />)
    await waitFor(() => expect(screen.getByText('build-loop')).toBeInTheDocument())
    fireEvent.click(screen.getByText('build-loop'))
    const upgradeBtn = await screen.findByRole('button', { name: /升档|Promote/i })
    fireEvent.click(upgradeBtn)
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
      const postCall = calls.find((c) => c[0] === '/api/loops/level')
      expect(postCall).toBeTruthy()
      expect(JSON.parse(postCall![1].body as string)).toEqual({ root: '/tmp/proj-a', id: 'build-loop', target: 'L2' })
    })
  })
})
