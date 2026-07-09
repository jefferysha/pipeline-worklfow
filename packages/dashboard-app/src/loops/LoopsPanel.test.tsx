import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
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

function renderLoops() {
  render(
    <I18nProvider>
      <LoopsPanel />
    </I18nProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
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
    renderLoops()
    await waitFor(() => expect(screen.getByText('build-loop')).toBeInTheDocument())
    expect(screen.getByText('L1')).toBeInTheDocument()
    expect(screen.getByText(/82/)).toBeInTheDocument()
  })

  it('点行展开详情 + 点升档按钮 → 真 POST /api/loops/level', async () => {
    renderLoops()
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

  it('快照 fetch 失败时显示错误信息而不是永远显示加载中', async () => {
    global.fetch = vi.fn(async (url: string) => {
      if (url === '/api/loops/snapshot') {
        return new Response('Server error', { status: 500 })
      }
      throw new Error(`unexpected fetch ${url}`)
    }) as unknown as typeof fetch
    renderLoops()
    await waitFor(() => expect(screen.getByText(/加载失败|加载出错|error|Error/i)).toBeInTheDocument())
  })

  it('升档 POST 失败时显示错误信息', async () => {
    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === '/api/loops/snapshot') {
        return new Response(JSON.stringify(SNAPSHOT), { status: 200 })
      }
      if (url === '/api/loops/level' && opts?.method === 'POST') {
        return new Response('Failed to promote', { status: 500 })
      }
      throw new Error(`unexpected fetch ${url}`)
    }) as unknown as typeof fetch
    renderLoops()
    await waitFor(() => expect(screen.getByText('build-loop')).toBeInTheDocument())
    fireEvent.click(screen.getByText('build-loop'))
    const upgradeBtn = await screen.findByRole('button', { name: /升档|Promote/i })
    fireEvent.click(upgradeBtn)
    await waitFor(() => expect(screen.getByText(/升档失败|操作失败|error|Error/i)).toBeInTheDocument())
  })

  it('whole-branch review 回归锚：快照 500 返回真实 server JSON 信封（{ok:false,error}）而非纯文本 → r.ok 检查真触发、真读出 error 文案（此前无 r.ok 检查时 r.json() 会 resolve 而不 reject，报错永远不出现，靠这条真实响应形状而非纯文本才能抓到）', async () => {
    global.fetch = vi.fn(async (url: string) => {
      if (url === '/api/loops/snapshot') {
        return new Response(JSON.stringify({ ok: false, error: '注册表读取失败' }), { status: 500 })
      }
      throw new Error(`unexpected fetch ${url}`)
    }) as unknown as typeof fetch
    renderLoops()
    await waitFor(() => expect(screen.getByText(/注册表读取失败/)).toBeInTheDocument())
  })

  it('graduation 逻辑拒绝（真实 400 + {applied:false,errors:[...]} 信封，对齐 server 修复后的真实形状）→ 显示 errors 里的具体文案，不是泛化的"升档失败"', async () => {
    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === '/api/loops/snapshot') {
        return new Response(JSON.stringify(SNAPSHOT), { status: 200 })
      }
      if (url === '/api/loops/level' && opts?.method === 'POST') {
        return new Response(
          JSON.stringify({ plan: null, verdict: null, applied: false, errors: ['一步跨两级不允许'], exitCode: 2 }),
          { status: 400 },
        )
      }
      throw new Error(`unexpected fetch ${url}`)
    }) as unknown as typeof fetch
    renderLoops()
    await waitFor(() => expect(screen.getByText('build-loop')).toBeInTheDocument())
    fireEvent.click(screen.getByText('build-loop'))
    const upgradeBtn = await screen.findByRole('button', { name: /升档|Promote/i })
    fireEvent.click(upgradeBtn)
    await waitFor(() => expect(screen.getByText(/一步跨两级不允许/)).toBeInTheDocument())
  })

  it('升档成功后真重新拉一次快照（Minor 回归：此前成功后不 refetch，界面停留在升档前的旧档位）', async () => {
    let snapshotCalls = 0
    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === '/api/loops/snapshot') {
        snapshotCalls += 1
        return new Response(JSON.stringify(SNAPSHOT), { status: 200 })
      }
      if (url === '/api/loops/level' && opts?.method === 'POST') {
        return new Response(JSON.stringify({ applied: true, errors: [], exitCode: 0 }), { status: 200 })
      }
      throw new Error(`unexpected fetch ${url}`)
    }) as unknown as typeof fetch
    renderLoops()
    await waitFor(() => expect(screen.getByText('build-loop')).toBeInTheDocument())
    expect(snapshotCalls).toBe(1)
    fireEvent.click(screen.getByText('build-loop'))
    const upgradeBtn = await screen.findByRole('button', { name: /升档|Promote/i })
    fireEvent.click(upgradeBtn)
    await waitFor(() => expect(snapshotCalls).toBe(2))
  })

  it('中英切换：英文下渲染英文空态（此前面板完全不走 t()，切到英文一级导航是英文但本视图仍是中文）', async () => {
    localStorage.setItem('pipeline-dashboard-lang', 'en')
    global.fetch = vi.fn(async (url: string) => {
      if (url === '/api/loops/snapshot') return new Response(JSON.stringify({ generated_at: '', rows: [] }), { status: 200 })
      throw new Error(`unexpected fetch ${url}`)
    }) as unknown as typeof fetch
    renderLoops()
    await waitFor(() => expect(screen.getByText('No loops registered')).toBeInTheDocument())
  })
})

describe('LoopsPanel 工票化新增行为', () => {
  it('L3 行展开后无升档按钮（已到顶）', async () => {
    global.fetch = vi.fn(async (url: string) => {
      if (url === '/api/loops/snapshot') {
        return new Response(JSON.stringify({
          generated_at: '', rows: [{
            root: '/tmp/p', id: 'top-loop', name: 'Top', autonomy_level: 'L3', status: 'active',
            readiness: { score: 99, band: 'ready' }, budget: { breaker: 'ok', remaining: 1 },
          }],
        }), { status: 200 })
      }
      throw new Error(`unexpected fetch ${url}`)
    }) as unknown as typeof fetch
    renderLoops()
    await waitFor(() => expect(screen.getByText('top-loop')).toBeInTheDocument())
    fireEvent.click(screen.getByText('top-loop'))
    expect(screen.queryByRole('button', { name: /升档|Promote/i })).toBeNull()
  })

  it('档位徽章带人话副标签（L1 · 提案制）+ breaker 徽章无 emoji', async () => {
    renderLoops()
    await waitFor(() => expect(screen.getByText('build-loop')).toBeInTheDocument())
    expect(screen.getByText(/提案制/)).toBeInTheDocument()
    expect(screen.getByText(/正常/)).toBeInTheDocument()
    expect(screen.queryByText(/🟢/)).toBeNull()
  })
})
