import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LOOP_RUNNERS as KERNEL_LOOP_RUNNERS } from '@pipeline-lite/kernel'
import { I18nProvider } from '../i18n'
import { LOOP_RUNNERS, LoopCard, useLoops } from './LoopCard'

/**
 * T16「自动运行(Loop)」卡（计划 2026-07-11-v5-interaction-rebuild）。
 * 验收对位：①快照读回显全参数+推荐值标注；②改参数→保存 patch body 精确（不夹带未改字段）；
 * ③升档走确认 Dialog、降档直发、server 拒绝原文展示；④status 开关=active/paused；
 * ⑤不渲染就绪环/台账/漂移（决议 #3 裁减）；另：多 loop 下拉（单 loop 隐藏）、无 loop 空态教学。
 */

const ROOT = '/tmp/proj-a'

// server LoopRow 契约形状（loops.ts::buildLoopsSnapshot），值对照 demo v5 wbLoopCard 示例
function makeRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    root: ROOT,
    id: 'restyle-loop',
    name: '样式迁移',
    autonomy_level: 'L1',
    status: 'active',
    cadence: '2h',
    goal: '把旧版工单卡样式逐个迁移到 SaaS 卡片风',
    design_doc: 'design/restyle.md',
    change_prefix: 'rl-',
    risk: 'low',
    runner: 'claude-code',
    human_gates: ['合并前'],
    kill_criteria: ['no-change-3'],
    allowlist: ['src/styles/**'],
    denylist: ['**/*.env'],
    budget_decl: { max_runs_per_day: 24, max_in_flight: 1, on_exceed: 'skip', max_tokens_per_day: 100000 },
    readiness: { score: 62, band: 'L2-ready' },
    budget: { breaker: 'ok', runsToday: 3, spentToday: 3000, remaining: 97000, hasBudget: true, maxTokensPerDay: 100000 },
    ...over,
  }
}

let rows: Record<string, unknown>[]

/** 快照 + 两写端点的可驱动 mock：update 真把 patch 应用到 rows（reload 读到新真值）。 */
function mockFetch(opts?: { updateStatus?: number; updateBody?: unknown; levelStatus?: number; levelBody?: unknown }): void {
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/loops/snapshot') {
      return new Response(JSON.stringify({ generated_at: '2026-07-11T00:00:00Z', rows }), { status: 200 })
    }
    if (url === '/api/loops/update' && init?.method === 'POST') {
      if (opts?.updateStatus) return new Response(JSON.stringify(opts.updateBody ?? { ok: false }), { status: opts.updateStatus })
      const { id, patch } = JSON.parse(String(init.body)) as { id: string; patch: Record<string, unknown> }
      rows = rows.map((r) => {
        if (r.id !== id) return r
        const next = { ...r, budget_decl: { ...(r.budget_decl as Record<string, unknown>) } }
        for (const [k, v] of Object.entries(patch)) {
          if (['max_runs_per_day', 'max_in_flight', 'max_tokens_per_day', 'on_exceed'].includes(k)) {
            ;(next.budget_decl as Record<string, unknown>)[k] = v
          } else {
            ;(next as Record<string, unknown>)[k] = v
          }
        }
        return next
      })
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }
    if (url === '/api/loops/level' && init?.method === 'POST') {
      if (opts?.levelStatus) return new Response(JSON.stringify(opts.levelBody ?? { errors: [] }), { status: opts.levelStatus })
      const { id, target } = JSON.parse(String(init.body)) as { id: string; target: string }
      rows = rows.map((r) => (r.id === id ? { ...r, autonomy_level: target } : r))
      return new Response(JSON.stringify({ applied: true, errors: [], exitCode: 0 }), { status: 200 })
    }
    throw new Error(`unexpected fetch ${url}`)
  }) as unknown as typeof fetch
}

/** 出货接线同款 harness：useLoops 住宿主、LoopCard 纯消费（WorkbenchView 的同一拓扑）。 */
function Harness(): JSX.Element {
  const loops = useLoops(ROOT)
  return <LoopCard root={ROOT} loops={loops} />
}

function renderCard(): void {
  render(
    <I18nProvider>
      <Harness />
    </I18nProvider>,
  )
}

/** 最近一次指定端点的 POST body。 */
function lastPostBody(url: string): unknown {
  const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
  const post = [...calls].reverse().find((c) => c[0] === url && (c[1] as RequestInit | undefined)?.method === 'POST')
  return post ? JSON.parse(String((post[1] as RequestInit).body)) : null
}

beforeEach(() => {
  localStorage.clear()
  rows = [makeRow()]
  mockFetch()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('LoopCard 读回显（验收①）', () => {
  it('快照读回显全参数：goal/doc/prefix/risk、四滑杆现值、超限 pill、L1 选中、四组 chips、运行中 pill', async () => {
    renderCard()
    expect(await screen.findByTestId('lp-goal')).toHaveValue('把旧版工单卡样式逐个迁移到 SaaS 卡片风')
    expect(screen.getByTestId('lp-doc')).toHaveValue('design/restyle.md')
    expect(screen.getByTestId('lp-prefix')).toHaveValue('rl-')
    expect(screen.getByTestId('lp-prefix-eg')).toHaveTextContent('rl-0142-migrate-card')
    expect(screen.getByTestId('lp-risk')).toHaveValue('low')
    // 四滑杆：现值显示 + 推荐刻度标注（demo 口径 2h/24/1/100k）
    expect(screen.getByTestId('lp-sld-cadence-val')).toHaveTextContent('2h')
    expect(screen.getByTestId('lp-sld-runs-val')).toHaveTextContent('24 次')
    expect(screen.getByTestId('lp-sld-inflight-val')).toHaveTextContent('1 个')
    expect(screen.getByTestId('lp-sld-tokens-val')).toHaveTextContent('100k')
    expect(screen.getByText('▽ 推荐 2h')).toBeInTheDocument()
    expect(screen.getByText('▽ 推荐 24')).toBeInTheDocument()
    expect(screen.getByText('▽ 推荐 1')).toBeInTheDocument()
    expect(screen.getByText('▽ 推荐 100k')).toBeInTheDocument()
    // 超限策略 pill 单选：skip 选中
    expect(screen.getByTestId('lp-exceed-skip')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('lp-exceed-pause')).toHaveAttribute('aria-checked', 'false')
    // 自主级别 segmented：L1 on
    expect(screen.getByTestId('lp-lv-L1')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('lp-lv-L3')).toHaveAttribute('aria-checked', 'false')
    // chips：闸门/终止（已知 id 带人话副标）/allowlist/denylist
    expect(screen.getByText('合并前')).toBeInTheDocument()
    expect(screen.getByText('no-change-3')).toBeInTheDocument()
    expect(screen.getByText('连续3次无改动')).toBeInTheDocument()
    expect(screen.getByText('src/styles/**')).toBeInTheDocument()
    expect(screen.getByText('**/*.env')).toBeInTheDocument()
    // 启用开关 + 运行中 pill
    expect(screen.getByTestId('lp-enable')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('lp-pill')).toHaveTextContent('运行中')
    // 未编辑：无未保存 chip、保存钮 disabled
    expect(screen.queryByTestId('lp-dirty')).toBeNull()
    expect(screen.getByTestId('lp-save')).toBeDisabled()
  })

  it('验收⑤：不渲染就绪环/台账/漂移（决议 #3 裁减口径）', async () => {
    renderCard()
    await screen.findByTestId('lp-goal')
    expect(screen.queryByText(/就绪/)).toBeNull()
    expect(screen.queryByText(/台账/)).toBeNull()
    expect(screen.queryByText(/漂移/)).toBeNull()
  })

  it('同时在跑上限滑杆下有一行说明（验收反馈②-④：讲清楚是本 loop 的软上限）', async () => {
    renderCard()
    await screen.findByTestId('lp-goal')
    expect(screen.getByText('本 loop 同时走自动化通道的任务数，超出只提醒不硬拦')).toBeInTheDocument()
  })
})

describe('LoopCard 编辑 → 保存（验收②）', () => {
  it('拖滑杆 → 未保存 chip；保存 body 只带被改字段；成功后 reload 清脏 + 已保存', async () => {
    renderCard()
    await screen.findByTestId('lp-goal')
    fireEvent.change(screen.getByTestId('lp-sld-runs'), { target: { value: '30' } })
    expect(screen.getByTestId('lp-sld-runs-val')).toHaveTextContent('30 次')
    expect(screen.getByTestId('lp-dirty')).toHaveTextContent('未保存')

    fireEvent.click(screen.getByTestId('lp-save'))
    await waitFor(() => expect(screen.getByTestId('lp-save-ok')).toHaveTextContent('已保存'))
    // patch 精确：只有 max_runs_per_day，不夹带未改字段
    expect(lastPostBody('/api/loops/update')).toEqual({ root: ROOT, id: 'restyle-loop', patch: { max_runs_per_day: 30 } })
    expect(screen.queryByTestId('lp-dirty')).toBeNull()
    expect(screen.getByTestId('lp-save')).toBeDisabled()
    // reload 后草稿以 server 新真值为基线（滑杆现值 = 30）
    expect(screen.getByTestId('lp-sld-runs-val')).toHaveTextContent('30 次')
  })

  it('节奏滑杆是离散档：拖到末档显示 1d，保存 patch {cadence:"1d"}', async () => {
    renderCard()
    await screen.findByTestId('lp-goal')
    fireEvent.change(screen.getByTestId('lp-sld-cadence'), { target: { value: '6' } })
    expect(screen.getByTestId('lp-sld-cadence-val')).toHaveTextContent('1d')
    fireEvent.click(screen.getByTestId('lp-save'))
    await waitFor(() => expect(screen.getByTestId('lp-save-ok')).toBeInTheDocument())
    expect(lastPostBody('/api/loops/update')).toEqual({ root: ROOT, id: 'restyle-loop', patch: { cadence: '1d' } })
  })

  it('验收④：启用开关 = status active/paused——关掉后 pill 变已暂停，保存 patch {status:"paused"}', async () => {
    renderCard()
    await screen.findByTestId('lp-goal')
    fireEvent.click(screen.getByTestId('lp-enable'))
    expect(screen.getByTestId('lp-enable')).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByTestId('lp-pill')).toHaveTextContent('已暂停')
    fireEvent.click(screen.getByTestId('lp-save'))
    await waitFor(() => expect(screen.getByTestId('lp-save-ok')).toBeInTheDocument())
    expect(lastPostBody('/api/loops/update')).toEqual({ root: ROOT, id: 'restyle-loop', patch: { status: 'paused' } })
  })

  it('超限策略 pill 单选 + chips 增删：一次保存合并为一个精确 patch', async () => {
    renderCard()
    await screen.findByTestId('lp-goal')
    fireEvent.click(screen.getByTestId('lp-exceed-pause'))
    expect(screen.getByTestId('lp-exceed-pause')).toHaveAttribute('aria-checked', 'true')
    // 删闸门 chip
    fireEvent.click(screen.getByRole('button', { name: '移除 合并前' }))
    expect(screen.queryByText('合并前')).toBeNull()
    // allowlist 就地添加（Enter 提交）
    fireEvent.click(screen.getByRole('button', { name: '新增允许路径' }))
    const input = screen.getByLabelText('新增允许路径')
    fireEvent.change(input, { target: { value: 'docs/**' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('docs/**')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('lp-save'))
    await waitFor(() => expect(screen.getByTestId('lp-save-ok')).toBeInTheDocument())
    expect(lastPostBody('/api/loops/update')).toEqual({
      root: ROOT,
      id: 'restyle-loop',
      patch: { on_exceed: 'pause', human_gates: [], allowlist: ['src/styles/**', 'docs/**'] },
    })
  })

  it('保存被 server 拒（400 error/errors 信封）→ 原文展示，编辑不丢、dirty 保持', async () => {
    mockFetch({ updateStatus: 400, updateBody: { ok: false, error: 'patch 后 schema 校验失败，未落盘', errors: ["loops[0].cadence: 不匹配 pattern '^\\d+(m|h|d)$'"] } })
    renderCard()
    await screen.findByTestId('lp-goal')
    fireEvent.change(screen.getByTestId('lp-goal'), { target: { value: '新目标' } })
    fireEvent.click(screen.getByTestId('lp-save'))
    await waitFor(() => expect(screen.getByTestId('lp-save-errors')).toBeInTheDocument())
    expect(screen.getByTestId('lp-save-errors')).toHaveTextContent("loops[0].cadence: 不匹配 pattern")
    expect(screen.getByTestId('lp-goal')).toHaveValue('新目标')
    expect(screen.getByTestId('lp-dirty')).toBeInTheDocument()
  })
})

describe('LoopCard runner 下拉（T17 补挂，计划决议#14：双选项 + POST /api/loops/update 落盘）', () => {
  it('单源守卫：dashboard LOOP_RUNNERS 镜像 == kernel 单源（transition-mirror 同款跨边界断言）', () => {
    expect([...LOOP_RUNNERS]).toEqual([...KERNEL_LOOP_RUNNERS])
  })

  it('下拉恰双选项且回显现值；切到 codex → 未保存 chip，保存 patch 只带 {runner:"codex"}', async () => {
    renderCard()
    await screen.findByTestId('lp-goal')
    const sel = screen.getByTestId('lp-runner')
    expect(sel).toHaveValue('claude-code')
    expect(within(sel).getAllByRole('option').map((o) => o.textContent)).toEqual(['claude-code', 'codex'])

    fireEvent.change(sel, { target: { value: 'codex' } })
    expect(screen.getByTestId('lp-dirty')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('lp-save'))
    await waitFor(() => expect(screen.getByTestId('lp-save-ok')).toBeInTheDocument())
    expect(lastPostBody('/api/loops/update')).toEqual({ root: ROOT, id: 'restyle-loop', patch: { runner: 'codex' } })
    // reload 后 server 新真值回显
    expect(screen.getByTestId('lp-runner')).toHaveValue('codex')
  })

  it('历史自由字符串 runner（cron）：真值补渲染为额外选项——回显不谎报为双选项之一', async () => {
    rows = [makeRow({ runner: 'cron' })]
    renderCard()
    await screen.findByTestId('lp-goal')
    const sel = screen.getByTestId('lp-runner')
    expect(sel).toHaveValue('cron')
    expect(within(sel).getAllByRole('option').map((o) => o.textContent)).toEqual(['cron', 'claude-code', 'codex'])
  })
})

describe('LoopCard 自主级别（验收③：升档确认、降档直发、拒绝原文）', () => {
  it('升档 L1→L2：先确认 Dialog（取消不发请求），确认后 POST /api/loops/level 并回显新档', async () => {
    renderCard()
    await screen.findByTestId('lp-goal')
    fireEvent.click(screen.getByTestId('lp-lv-L2'))
    expect(screen.getByTestId('lp-promote-confirm')).toBeInTheDocument()

    // 取消：不发请求、档位不变
    fireEvent.click(screen.getByTestId('lp-promote-cancel'))
    expect(lastPostBody('/api/loops/level')).toBeNull()
    expect(screen.getByTestId('lp-lv-L1')).toHaveAttribute('aria-checked', 'true')

    // 再点 + 确认：真 POST，reload 后 L2 选中
    fireEvent.click(screen.getByTestId('lp-lv-L2'))
    fireEvent.click(screen.getByTestId('lp-promote-submit'))
    await waitFor(() => expect(screen.getByTestId('lp-lv-L2')).toHaveAttribute('aria-checked', 'true'))
    expect(lastPostBody('/api/loops/level')).toEqual({ root: ROOT, id: 'restyle-loop', target: 'L2' })
  })

  it('降档直发（风险不对称纪律）：L2 → 点 L1 无确认框直接 POST', async () => {
    rows = [makeRow({ autonomy_level: 'L2' })]
    renderCard()
    await screen.findByTestId('lp-goal')
    fireEvent.click(screen.getByTestId('lp-lv-L1'))
    expect(screen.queryByTestId('lp-promote-confirm')).toBeNull()
    await waitFor(() => expect(screen.getByTestId('lp-lv-L1')).toHaveAttribute('aria-checked', 'true'))
    expect(lastPostBody('/api/loops/level')).toEqual({ root: ROOT, id: 'restyle-loop', target: 'L1' })
  })

  it('升档条件不满足：server 400 errors[] 原文展示（plan.reason + blockers）', async () => {
    mockFetch({ levelStatus: 400, levelBody: { errors: ['就绪度未达标：L1-only', '缺 kill_criteria 覆盖'] } })
    renderCard()
    await screen.findByTestId('lp-goal')
    fireEvent.click(screen.getByTestId('lp-lv-L2'))
    fireEvent.click(screen.getByTestId('lp-promote-submit'))
    await waitFor(() => expect(screen.getByTestId('lp-level-error')).toBeInTheDocument())
    expect(screen.getByTestId('lp-level-error')).toHaveTextContent('就绪度未达标：L1-only；缺 kill_criteria 覆盖')
    // 档位没动
    expect(screen.getByTestId('lp-lv-L1')).toHaveAttribute('aria-checked', 'true')
  })
})

describe('LoopCard 多 loop 下拉 / 空态', () => {
  it('多 loop：卡头下拉可切换（单 loop 时隐藏——见上组用例无此控件）；dirty 时禁切', async () => {
    rows = [makeRow(), makeRow({ id: 'docs-loop', goal: '文档巡检', autonomy_level: 'L2' })]
    renderCard()
    await screen.findByTestId('lp-goal')
    const sel = screen.getByTestId('lp-loop-select')
    expect(within(sel).getAllByRole('option').map((o) => o.textContent)).toEqual(['restyle-loop', 'docs-loop'])

    fireEvent.change(sel, { target: { value: 'docs-loop' } })
    expect(screen.getByTestId('lp-goal')).toHaveValue('文档巡检')
    expect(screen.getByTestId('lp-lv-L2')).toHaveAttribute('aria-checked', 'true')

    // dirty → 下拉禁用（切 loop 会重置草稿，先保存）
    fireEvent.change(screen.getByTestId('lp-goal'), { target: { value: '改了' } })
    expect(screen.getByTestId('lp-loop-select')).toBeDisabled()
  })

  it('单 loop：不渲染下拉', async () => {
    renderCard()
    await screen.findByTestId('lp-goal')
    expect(screen.queryByTestId('lp-loop-select')).toBeNull()
  })

  it('无 loop 的 root：空态教学文案（loops.yaml 最小登记示例），不渲染任何编辑控件', async () => {
    rows = []
    renderCard()
    const empty = await screen.findByTestId('lp-empty')
    expect(empty).toHaveTextContent('尚未配置自动运行')
    expect(empty).toHaveTextContent('.pipeline/loops.yaml')
    expect(empty).toHaveTextContent('max_runs_per_day: 24')
    expect(screen.queryByTestId('lp-goal')).toBeNull()
    expect(screen.queryByTestId('lp-save')).toBeNull()
  })

  it('快照加载失败：行内错误、不白屏', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: '磁盘只读' }), { status: 500 })) as unknown as typeof fetch
    renderCard()
    await waitFor(() => expect(screen.getByTestId('lp-load-error')).toBeInTheDocument())
    expect(screen.getByTestId('lp-load-error')).toHaveTextContent('磁盘只读')
  })
})
