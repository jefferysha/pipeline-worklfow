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

  it('点行展开详情 + 点升档按钮 → 出确认 Dialog → 点确认 → 真 POST /api/loops/level（Task 13 意图迁移：升档不再直发）', async () => {
    renderLoops()
    await waitFor(() => expect(screen.getByText('build-loop')).toBeInTheDocument())
    fireEvent.click(screen.getByText('build-loop'))
    const upgradeBtn = await screen.findByRole('button', { name: /升档|Promote/i })
    fireEvent.click(upgradeBtn)
    fireEvent.click(await screen.findByTestId('loop-promote-confirm-submit'))
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
    fireEvent.click(await screen.findByTestId('loop-promote-confirm-submit'))
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
    fireEvent.click(await screen.findByTestId('loop-promote-confirm-submit'))
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
    fireEvent.click(await screen.findByTestId('loop-promote-confirm-submit'))
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

  it('G19②：L2 行展开有降档按钮，点击 → 真 POST /api/loops/level target=L1（kernel「降档总允许」，端点现成）', async () => {
    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === '/api/loops/snapshot') {
        return new Response(JSON.stringify({
          generated_at: '', rows: [{
            root: '/tmp/p', id: 'mid-loop', name: 'Mid', autonomy_level: 'L2', status: 'active',
            readiness: { score: 70, band: 'mostly-ready' }, budget: { breaker: 'ok', remaining: 1 },
          }],
        }), { status: 200 })
      }
      if (url === '/api/loops/level' && opts?.method === 'POST') {
        return new Response(JSON.stringify({ applied: true, errors: [], exitCode: 0 }), { status: 200 })
      }
      throw new Error(`unexpected fetch ${url}`)
    }) as unknown as typeof fetch
    renderLoops()
    await waitFor(() => expect(screen.getByText('mid-loop')).toBeInTheDocument())
    fireEvent.click(screen.getByText('mid-loop'))
    const demoteBtn = await screen.findByTestId('loop-demote-mid-loop')
    fireEvent.click(demoteBtn)
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
      const postCall = calls.find((c) => c[0] === '/api/loops/level')
      expect(postCall).toBeTruthy()
      expect(JSON.parse(postCall![1].body as string)).toEqual({ root: '/tmp/p', id: 'mid-loop', target: 'L1' })
    })
  })

  it('G19②：L1 行展开无降档按钮（已到底），L3 行有（降档钮与升档钮独立判定）', async () => {
    renderLoops() // 默认 SNAPSHOT 是 L1 的 build-loop
    await waitFor(() => expect(screen.getByText('build-loop')).toBeInTheDocument())
    fireEvent.click(screen.getByText('build-loop'))
    await screen.findByRole('button', { name: /升档|Promote/i })
    expect(screen.queryByTestId('loop-demote-build-loop')).toBeNull()
  })

  it('G19②：降档 POST 失败（400 + errors 信封）→ 行内显示具体拒绝文案（复用 loop-reject 位）', async () => {
    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === '/api/loops/snapshot') {
        return new Response(JSON.stringify({
          generated_at: '', rows: [{
            root: '/tmp/p', id: 'mid-loop', name: 'Mid', autonomy_level: 'L2', status: 'active',
            readiness: { score: 70, band: 'mostly-ready' }, budget: { breaker: 'ok', remaining: 1 },
          }],
        }), { status: 200 })
      }
      if (url === '/api/loops/level' && opts?.method === 'POST') {
        return new Response(JSON.stringify({ applied: false, errors: ['loops.yaml 写回失败'], exitCode: 3 }), { status: 400 })
      }
      throw new Error(`unexpected fetch ${url}`)
    }) as unknown as typeof fetch
    renderLoops()
    await waitFor(() => expect(screen.getByText('mid-loop')).toBeInTheDocument())
    fireEvent.click(screen.getByText('mid-loop'))
    fireEvent.click(await screen.findByTestId('loop-demote-mid-loop'))
    await waitFor(() => expect(screen.getByText(/loops\.yaml 写回失败/)).toBeInTheDocument())
  })

  it('G19②：降档成功后真重新拉快照（同升档的 refetch 纪律）', async () => {
    let snapshotCalls = 0
    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === '/api/loops/snapshot') {
        snapshotCalls += 1
        return new Response(JSON.stringify({
          generated_at: '', rows: [{
            root: '/tmp/p', id: 'mid-loop', name: 'Mid', autonomy_level: 'L2', status: 'active',
            readiness: { score: 70, band: 'mostly-ready' }, budget: { breaker: 'ok', remaining: 1 },
          }],
        }), { status: 200 })
      }
      if (url === '/api/loops/level' && opts?.method === 'POST') {
        return new Response(JSON.stringify({ applied: true, errors: [], exitCode: 0 }), { status: 200 })
      }
      throw new Error(`unexpected fetch ${url}`)
    }) as unknown as typeof fetch
    renderLoops()
    await waitFor(() => expect(screen.getByText('mid-loop')).toBeInTheDocument())
    expect(snapshotCalls).toBe(1)
    fireEvent.click(screen.getByText('mid-loop'))
    fireEvent.click(await screen.findByTestId('loop-demote-mid-loop'))
    await waitFor(() => expect(snapshotCalls).toBe(2))
  })

  it('档位徽章带人话副标签（L1 · 提案制）+ breaker 徽章无 emoji', async () => {
    renderLoops()
    await waitFor(() => expect(screen.getByText('build-loop')).toBeInTheDocument())
    expect(screen.getByText(/提案制/)).toBeInTheDocument()
    expect(screen.getByText(/正常/)).toBeInTheDocument()
    expect(screen.queryByText(/🟢/)).toBeNull()
  })
})

/**
 * Task 13（评审 P1-6）：budget.remaining 取到即弃 / 熔断死胡同 / 升 L3 无确认，三条一起补。
 * server loops.ts 真实全量形状核对过（packages/kernel/src/loops/budget.ts computeBudgetStatus /
 * drift.ts computeReadiness）：BudgetStatus 含 hasBudget/maxTokensPerDay/spentToday/remaining/
 * usedRatio/breaker，ReadinessScore 含 dimensions[]（每项 {name,score,max,suggestion}）。
 * 本节固定几个真实形状的单行 fixture，逐条覆盖 brief Step 1 的 5 条红测试 + 2 条构成行补充覆盖。
 */
const HOT_ROW = {
  root: '/tmp/proj-a', id: 'hot-loop', name: 'Hot Loop', autonomy_level: 'L1', status: 'active',
  readiness: { id: 'hot-loop', score: 70, band: 'mostly-ready', dimensions: [], suggestions: [] },
  budget: {
    id: 'hot-loop', hasBudget: true, maxTokensPerDay: 10000, warnThreshold: 8000, spentToday: 8500,
    remaining: 1500, usedRatio: 0.85, runsToday: 3, breaker: 'warn', onExceed: 'skip',
    autonomyLevel: 'L1', reportOnly: true, reason: '',
  },
}

const TRIPPED_ROW = {
  root: '/tmp/proj-a', id: 'tripped-loop', name: 'Tripped Loop', autonomy_level: 'L2', status: 'active',
  readiness: { id: 'tripped-loop', score: 60, band: 'mostly-ready', dimensions: [], suggestions: [] },
  budget: {
    id: 'tripped-loop', hasBudget: true, maxTokensPerDay: 5000, warnThreshold: 4000, spentToday: 5200,
    remaining: 0, usedRatio: 1.04, runsToday: 5, breaker: 'tripped', onExceed: 'halt',
    autonomyLevel: 'L2', reportOnly: false, reason: '今日花费 5200 ≥ 预算 5000（circuit breaker 熔断触发）',
  },
}

const DIMS_ROW = {
  root: '/tmp/proj-a', id: 'dims-loop', name: 'Dims Loop', autonomy_level: 'L1', status: 'active',
  readiness: {
    id: 'dims-loop', score: 45, band: 'not-ready',
    dimensions: [
      { name: 'goal', score: 20, max: 20, suggestion: null },
      { name: 'kill_criteria', score: 0, max: 20, suggestion: '补充 kill/终止判据' },
      { name: 'human_gates', score: 12, max: 20, suggestion: '补充 human gate 人工门' },
    ],
    suggestions: ['[kill_criteria] 补充 kill/终止判据', '[human_gates] 补充 human gate 人工门'],
  },
  budget: {
    id: 'dims-loop', hasBudget: false, maxTokensPerDay: null, warnThreshold: null, spentToday: 0,
    remaining: null, usedRatio: null, runsToday: 0, breaker: 'ok', onExceed: 'skip',
    autonomyLevel: 'L1', reportOnly: true, reason: '未声明 max_tokens_per_day —— 无 token 预算/熔断',
  },
}

function mockSnapshotOnly(row: unknown) {
  global.fetch = vi.fn(async (url: string) => {
    if (url === '/api/loops/snapshot') {
      return new Response(JSON.stringify({ generated_at: '', rows: [row] }), { status: 200 })
    }
    throw new Error(`unexpected fetch ${url}`)
  }) as unknown as typeof fetch
}

describe('LoopsPanel Task 13：预算/就绪构成/熔断说明 + 升档确认（评审 P1-6）', () => {
  it('展开区预算行渲染 spentToday/maxTokensPerDay · 剩 remaining（此前 remaining 取到即弃，未渲染）', async () => {
    renderLoops() // 默认 SNAPSHOT：build-loop spentToday=1000 maxTokensPerDay=100000 remaining=99000
    await waitFor(() => expect(screen.getByText('build-loop')).toBeInTheDocument())
    fireEvent.click(screen.getByText('build-loop'))
    const budgetEl = await screen.findByTestId('loop-budget-build-loop')
    expect(budgetEl).toHaveTextContent('1000')
    expect(budgetEl).toHaveTextContent('100000')
    expect(budgetEl).toHaveTextContent('99000')
  })

  it('usedRatio > 0.8 时预算进度条标红', async () => {
    mockSnapshotOnly(HOT_ROW)
    renderLoops()
    await waitFor(() => expect(screen.getByText('hot-loop')).toBeInTheDocument())
    fireEvent.click(screen.getByText('hot-loop'))
    const fill = await screen.findByTestId('loop-budget-fill-hot-loop')
    expect(fill).toHaveClass('loop-budget__fill--warn')
  })

  it('breaker===tripped 时红 tint 说明块出现（i18n loops.tripped_help，此前熔断是死胡同、无解释无出口）', async () => {
    mockSnapshotOnly(TRIPPED_ROW)
    renderLoops()
    await waitFor(() => expect(screen.getByText('tripped-loop')).toBeInTheDocument())
    fireEvent.click(screen.getByText('tripped-loop'))
    expect(await screen.findByText(/预算断路器已熔断/)).toBeInTheDocument()
  })

  it('点升档按钮先出确认 Dialog、不立即 POST；点确认才真 POST（此前升 L3 单击直发无确认）', async () => {
    renderLoops()
    await waitFor(() => expect(screen.getByText('build-loop')).toBeInTheDocument())
    fireEvent.click(screen.getByText('build-loop'))
    fireEvent.click(await screen.findByTestId('loop-promote-build-loop'))
    expect(await screen.findByTestId('loop-promote-confirm')).toBeInTheDocument()
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.some((c) => c[0] === '/api/loops/level')).toBe(false)
    fireEvent.click(screen.getByTestId('loop-promote-confirm-submit'))
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
      const postCall = calls.find((c) => c[0] === '/api/loops/level')
      expect(postCall).toBeTruthy()
      expect(JSON.parse(postCall![1].body as string)).toEqual({ root: '/tmp/proj-a', id: 'build-loop', target: 'L2' })
    })
  })

  it('确认 Dialog 点取消 → 关闭且不 POST', async () => {
    renderLoops()
    await waitFor(() => expect(screen.getByText('build-loop')).toBeInTheDocument())
    fireEvent.click(screen.getByText('build-loop'))
    fireEvent.click(await screen.findByTestId('loop-promote-build-loop'))
    fireEvent.click(await screen.findByTestId('loop-promote-confirm-cancel'))
    await waitFor(() => expect(screen.queryByTestId('loop-promote-confirm')).toBeNull())
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.some((c) => c[0] === '/api/loops/level')).toBe(false)
  })

  it('就绪构成行：readiness.dimensions[] 逐项渲染 ✓/✗', async () => {
    mockSnapshotOnly(DIMS_ROW)
    renderLoops()
    await waitFor(() => expect(screen.getByText('dims-loop')).toBeInTheDocument())
    fireEvent.click(screen.getByText('dims-loop'))
    const dims = await screen.findByTestId('loop-dims-dims-loop')
    expect(dims).toHaveTextContent('✓')
    expect(dims).toHaveTextContent('✗')
  })

  it('readiness.dimensions 为空数组时只显 band，不渲染构成行（兼容旧数据）', async () => {
    renderLoops() // 默认 SNAPSHOT：build-loop 的 dimensions 是 []
    await waitFor(() => expect(screen.getByText('build-loop')).toBeInTheDocument())
    fireEvent.click(screen.getByText('build-loop'))
    expect(await screen.findByText(/就绪分带/)).toBeInTheDocument()
    expect(screen.queryByTestId('loop-dims-build-loop')).toBeNull()
  })
})
