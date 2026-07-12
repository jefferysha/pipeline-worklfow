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
 *
 * T7（loop 卡审阅面重构）追加：⑥空态终端引导（prompt 示例 + 复制按钮）；⑦15 个字段生产者
 * 徽章精确对齐 UX 分析文档 §2.1；⑧三方关系条（root 徽章 + change_prefix→匹配 changes 弹层，
 * 读 row 真值不随草稿重算 + phases→阶段 chips 纯展示）。
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
    // T7：三方关系条数据面（server LoopRow 契约形状同步）。
    matched_changes: ['rl-0142-migrate-card', 'rl-0201-nav-cleanup'],
    phases: ['build', 'verify'],
    // loop-init L4 契约：draft =「agent 草稿·待审阅」标记，默认 false（既有卡不受影响、零回归）。
    draft: false,
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
        // loop-init L4 契约镜像：任何含 status 键的写回，server 成功后自动清草稿标记——mock 同款，
        // 让 L5 批准/驳回后显式重拉能真见徽章消失（前端不自发清标记，只重拉）。
        if ('status' in patch) (next as Record<string, unknown>).draft = false
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

// 观察项②（决议#14① backlog 落地）：runner 非标准值 → 字段下软校验警告（纯提示，不拦截保存、
// 不改值、不清第三选项）。文案按 runnerFor.ts 真实归属语义：非 codex 值一律走 claude-code（缺省）
// 路径——它仍会执行，警告不得谎称「不会执行」。
describe('LoopCard runner 软校验警告（观察项②）', () => {
  it('非标准 runner（cron）→ 渲染软警告，文案含真实归属语义（非 codex 走 claude-code 路径），且不说「不会执行」', async () => {
    rows = [makeRow({ runner: 'cron' })]
    renderCard()
    await screen.findByTestId('lp-goal')
    const warn = screen.getByTestId('lp-runner-warn')
    expect(warn).toBeInTheDocument()
    // 真值可辨识 + 真实归属语义（非 codex → claude-code 路径），不臆造「不会执行」
    expect(warn).toHaveTextContent('cron')
    expect(warn).toHaveTextContent('claude-code')
    expect(warn).toHaveTextContent(/非 codex/)
    expect(warn.textContent ?? '').not.toContain('不会执行')
    // 第三选项不被警告清掉（软提示不改任何值）
    expect(screen.getByTestId('lp-runner')).toHaveValue('cron')
  })

  it('标准 runner（claude-code / codex）不渲染软警告', async () => {
    renderCard() // 默认 claude-code
    await screen.findByTestId('lp-goal')
    expect(screen.queryByTestId('lp-runner-warn')).toBeNull()
    // 切到 codex 仍不渲染（标准值）
    fireEvent.change(screen.getByTestId('lp-runner'), { target: { value: 'codex' } })
    expect(screen.queryByTestId('lp-runner-warn')).toBeNull()
  })

  it('软警告纯提示：存在时不改保存钮语义——有改动即可保存（不因警告 disabled）', async () => {
    rows = [makeRow({ runner: 'cron' })]
    renderCard()
    await screen.findByTestId('lp-goal')
    expect(screen.getByTestId('lp-runner-warn')).toBeInTheDocument()
    // 警告常驻，但一旦 dirty，保存钮照常可用（警告不参与 disabled 判定）
    fireEvent.change(screen.getByTestId('lp-goal'), { target: { value: '新目标' } })
    expect(screen.getByTestId('lp-save')).not.toBeDisabled()
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

describe('LoopCard 字段生产者徽章（T7，UX 分析文档 §2.1「应然生产者」列逐字段对齐）', () => {
  it('14 个字段徽章精确对齐 agent 生成/系统推导/人拍板三色分类', async () => {
    renderCard()
    await screen.findByTestId('lp-goal')
    const expectProv = (field: string, label: string): void => {
      expect(screen.getByTestId(`lp-prov-${field}`)).toHaveTextContent(label)
    }
    expectProv('status', '人拍板')
    expectProv('goal', 'agent 生成')
    expectProv('design_doc', 'agent 生成')
    expectProv('change_prefix', '系统推导')
    expectProv('risk', 'agent 生成')
    expectProv('runner', '系统推导')
    expectProv('cadence', 'agent 生成')
    expectProv('max_runs_per_day', '系统推导')
    expectProv('max_in_flight', '系统推导')
    expectProv('max_tokens_per_day', '系统推导')
    expectProv('on_exceed', '系统推导')
    expectProv('human_gates', 'agent 生成')
    expectProv('kill_criteria', '系统推导')
    expectProv('denylist', '系统推导')
  })

  it('红线：allowlist 零消费，不装成三色徽章之一，如实标「预留字段，当前无运行时效果」', async () => {
    renderCard()
    await screen.findByTestId('lp-goal')
    expect(screen.getByTestId('lp-prov-allowlist')).toHaveTextContent('预留字段,当前无运行时效果')
    // 不是三色徽章之一：不含 agent 生成/系统推导/人拍板 任一措辞
    const text = screen.getByTestId('lp-prov-allowlist').textContent ?? ''
    expect(['agent 生成', '系统推导', '人拍板']).not.toContain(text)
  })

  it('红线：denylist 真硬消费——徽章旁额外标注真实结算行为，措辞与 allowlist 的零消费不同', async () => {
    renderCard()
    await screen.findByTestId('lp-goal')
    expect(screen.getByTestId('lp-prov-denylist')).toHaveTextContent('系统推导')
    expect(screen.getByText(/真硬消费/)).toBeInTheDocument()
    expect(screen.getByText(/零消费/)).toBeInTheDocument()
    // 两条 disclaimer 文本不同（防止复制粘贴出的误导性重复）
    const denyNote = screen.getByText(/真硬消费/).closest('p')
    const allowNote = screen.getByText(/零消费/).closest('p')
    expect(denyNote?.textContent).not.toEqual(allowNote?.textContent)
  })
})

describe('LoopCard 三方关系条（T7，A2 决策：root 徽章 + change_prefix→匹配 changes 弹层 + phases→阶段 chips）', () => {
  it('root 徽章渲染 LoopRow.root；phases 渲染阶段 chips 纯展示（点击无副作用）', async () => {
    renderCard()
    await screen.findByTestId('lp-goal')
    expect(screen.getByTestId('lp-rel-root')).toHaveTextContent(ROOT)
    const chips = screen.getAllByTestId('lp-rel-phase-chip')
    expect(chips.map((c) => c.textContent)).toEqual(['build', 'verify'])
    expect(chips[0]!.tagName).toBe('SPAN') // 纯展示——不是按钮，无点击语义
    fireEvent.click(chips[0]!)
    expect(screen.queryByTestId('lp-rel-dialog')).toBeNull() // 点击阶段 chip 不触发任何弹层
  })

  it('点击 change_prefix 展开弹层显示 matched_changes 列表（真值）', async () => {
    renderCard()
    await screen.findByTestId('lp-goal')
    fireEvent.click(screen.getByTestId('lp-rel-prefix-btn'))
    const dialog = await screen.findByTestId('lp-rel-dialog')
    expect(within(dialog).getByText('rl-0142-migrate-card')).toBeInTheDocument()
    expect(within(dialog).getByText('rl-0201-nav-cleanup')).toBeInTheDocument()
  })

  it('弹层用已保存真值，不随草稿输入实时重算：编辑 change_prefix 草稿（不保存）后弹层内容不变，保存后才刷新', async () => {
    renderCard()
    await screen.findByTestId('lp-goal')
    // 编辑草稿但不保存
    fireEvent.change(screen.getByTestId('lp-prefix'), { target: { value: 'zz-' } })
    expect(screen.getByTestId('lp-dirty')).toBeInTheDocument()
    // 关系条按钮文案仍显示旧真值（rl-），不随草稿跳动
    expect(screen.getByTestId('lp-rel-prefix-btn')).toHaveTextContent('rl-')
    expect(screen.getByTestId('lp-rel-prefix-btn')).not.toHaveTextContent('zz-')
    fireEvent.click(screen.getByTestId('lp-rel-prefix-btn'))
    const dialog = await screen.findByTestId('lp-rel-dialog')
    // 弹层内容仍是旧真值的 matched_changes，未随未保存的草稿重算
    expect(within(dialog).getByText('rl-0142-migrate-card')).toBeInTheDocument()

    // 保存后：mock /api/loops/update 不改变 matched_changes（server 才是真源），
    // 但 reload 后卡片以新 row 渲染——本用例只断言保存流程本身不因关系条新增字段而回归破坏。
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    fireEvent.click(screen.getByTestId('lp-save'))
    await waitFor(() => expect(screen.getByTestId('lp-save-ok')).toBeInTheDocument())
  })

  it('弹层空匹配态：matched_changes 为空数组时如实显示空态文案', async () => {
    rows = [makeRow({ matched_changes: [] })]
    renderCard()
    await screen.findByTestId('lp-goal')
    fireEvent.click(screen.getByTestId('lp-rel-prefix-btn'))
    const dialog = await screen.findByTestId('lp-rel-dialog')
    expect(dialog).toHaveTextContent('暂无匹配的变更')
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

  // T7：空态从「裸 YAML 教学块」换成「去终端」引导——意图迁移（原断言 `.pipeline/loops.yaml`/
  // `max_runs_per_day: 24` 的 EMPTY_EXAMPLE pre 块字面量已随空态改版删除，见计划任务书
  // 「①空态区替换 EMPTY_EXAMPLE pre 块为引导卡+复制按钮」；标题文案原样保留，其余替换为
  // prompt 示例 + 复制按钮的新断言，不静默丢弃「不渲染任何编辑控件」的核心断言）。
  it('无 loop 的 root：空态换成「去终端」引导卡（prompt 示例 + 复制按钮），不渲染任何编辑控件', async () => {
    rows = []
    renderCard()
    const empty = await screen.findByTestId('lp-empty')
    expect(empty).toHaveTextContent('尚未配置自动运行')
    expect(screen.getByTestId('lp-empty-prompt')).toBeInTheDocument()
    expect(screen.getByTestId('lp-empty-copy')).toBeInTheDocument()
    expect(screen.queryByTestId('lp-goal')).toBeNull()
    expect(screen.queryByTestId('lp-save')).toBeNull()
  })

  it('空态复制按钮：点击写剪贴板（参数精确等于 prompt 示例文本），按钮文案切换为「已复制」', async () => {
    rows = []
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    renderCard()
    await screen.findByTestId('lp-empty')
    expect(screen.getByTestId('lp-empty-prompt')).toHaveTextContent(
      '帮我建一个 loop：盯着<你想让它盯的目录或改动范围>，每 2 小时跑一轮；连续 3 次没有改动，或者预算触顶，就停下来找我确认。',
    )
    fireEvent.click(screen.getByTestId('lp-empty-copy'))
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        '帮我建一个 loop：盯着<你想让它盯的目录或改动范围>，每 2 小时跑一轮；连续 3 次没有改动，或者预算触顶，就停下来找我确认。',
      ),
    )
    await waitFor(() => expect(screen.getByTestId('lp-empty-copy')).toHaveTextContent('已复制'))
  })

  it('快照加载失败：行内错误、不白屏', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: '磁盘只读' }), { status: 500 })) as unknown as typeof fetch
    renderCard()
    await waitFor(() => expect(screen.getByTestId('lp-load-error')).toBeInTheDocument())
    expect(screen.getByTestId('lp-load-error')).toHaveTextContent('磁盘只读')
  })
})

// ── loop-init L5：草稿审阅闭环（徽章 + 批准/驳回动作行 + 空态提 CLI）。上游契约 L4：
//    WbLoopRow.draft:boolean；server 侧任何含 status 键的 update 成功后自动清标记，前端动作
//    后显式重拉（loops.reload，非轮询——G22）即见 draft 消失，不自发清标记。
//    命名两义（L4 评审点名）：row.draft 是「agent 草稿·待审阅」标记，与既有编辑态
//    LoopDraft/draft(dirty 草稿) 不是一回事——本组断言用 isPendingReview/审阅语义。──
describe('LoopCard 草稿审阅（loop-init L5：徽章 + 批准/驳回动作行）', () => {
  it('①draft:true → 卡头渲染草稿徽章 + 卡尾批准/驳回双钮（动作文案与 demo 逐字）', async () => {
    rows = [makeRow({ draft: true, status: 'paused' })]
    renderCard()
    await screen.findByTestId('lp-goal')
    const badge = screen.getByTestId('lp-draft-badge')
    expect(badge).toHaveTextContent('agent 草稿')
    expect(badge).toHaveTextContent('待你审阅')
    expect(screen.getByTestId('lp-draft-actions')).toBeInTheDocument()
    expect(screen.getByTestId('lp-draft-approve')).toHaveTextContent('批准并启用')
    const reject = screen.getByTestId('lp-draft-reject')
    expect(reject).toHaveTextContent('驳回')
    expect(reject).toHaveTextContent('现场保留')
  })

  it('①draft:false → 徽章与动作行都不渲染（既有卡零回归）', async () => {
    rows = [makeRow({ draft: false })]
    renderCard()
    await screen.findByTestId('lp-goal')
    expect(screen.queryByTestId('lp-draft-badge')).toBeNull()
    expect(screen.queryByTestId('lp-draft-actions')).toBeNull()
    expect(screen.queryByTestId('lp-draft-approve')).toBeNull()
    expect(screen.queryByTestId('lp-draft-reject')).toBeNull()
  })

  it('②批准 → POST /api/loops/update body {status:"active"}（与既有 update 同形），成功后显式重拉、徽章消失', async () => {
    rows = [makeRow({ draft: true, status: 'paused' })]
    renderCard()
    await screen.findByTestId('lp-draft-approve')
    const snapCalls = (): number =>
      (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === '/api/loops/snapshot').length
    const before = snapCalls()
    fireEvent.click(screen.getByTestId('lp-draft-approve'))
    // server 清标记 → 重拉后徽章与动作行消失
    await waitFor(() => expect(screen.queryByTestId('lp-draft-badge')).toBeNull())
    expect(screen.queryByTestId('lp-draft-actions')).toBeNull()
    // body 与既有保存链路同形 {root,id,patch}，patch 只带 status:'active'
    expect(lastPostBody('/api/loops/update')).toEqual({ root: ROOT, id: 'restyle-loop', patch: { status: 'active' } })
    // 显式重拉（非轮询 G22）：快照被再次请求
    expect(snapCalls()).toBeGreaterThan(before)
  })

  it('③驳回 → POST body {status:"paused"}，成功后重拉、徽章消失、现场（字段真值）保留', async () => {
    rows = [makeRow({ draft: true, status: 'paused' })]
    renderCard()
    await screen.findByTestId('lp-draft-reject')
    fireEvent.click(screen.getByTestId('lp-draft-reject'))
    await waitFor(() => expect(screen.queryByTestId('lp-draft-badge')).toBeNull())
    expect(lastPostBody('/api/loops/update')).toEqual({ root: ROOT, id: 'restyle-loop', patch: { status: 'paused' } })
    // 现场保留：goal 等字段真值仍在（驳回=转暂停不清现场）
    expect(screen.getByTestId('lp-goal')).toHaveValue('把旧版工单卡样式逐个迁移到 SaaS 卡片风')
  })

  it('④动作失败（server 拒）→ loop-reject 反馈条渲染 server 原文，徽章仍在（不清标记）', async () => {
    mockFetch({ updateStatus: 400, updateBody: { ok: false, error: '落盘失败：磁盘只读' } })
    rows = [makeRow({ draft: true, status: 'paused' })]
    renderCard()
    await screen.findByTestId('lp-draft-approve')
    fireEvent.click(screen.getByTestId('lp-draft-approve'))
    await waitFor(() => expect(screen.getByTestId('lp-draft-error')).toBeInTheDocument())
    expect(screen.getByTestId('lp-draft-error')).toHaveTextContent('落盘失败：磁盘只读')
    // loop-reject 反馈条底座复用（错误语义类名）
    expect(screen.getByTestId('lp-draft-error')).toHaveClass('loop-reject')
    // 失败不清徽章
    expect(screen.getByTestId('lp-draft-badge')).toBeInTheDocument()
  })

  it('⑤草稿态不禁用字段编辑：改 goal → dirty → 走既有保存链路（与批准/驳回互不干扰）', async () => {
    rows = [makeRow({ draft: true, status: 'paused' })]
    renderCard()
    await screen.findByTestId('lp-goal')
    // 字段照常可编辑（demo 语义：先调整后批准）
    expect(screen.getByTestId('lp-goal')).not.toBeDisabled()
    fireEvent.change(screen.getByTestId('lp-goal'), { target: { value: '调整后的目标文案' } })
    expect(screen.getByTestId('lp-dirty')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('lp-save'))
    await waitFor(() => expect(screen.getByTestId('lp-save-ok')).toBeInTheDocument())
    // 保存走既有 update：patch 只带 goal，不夹带 status（保存链路 ≠ 审阅动作）
    expect(lastPostBody('/api/loops/update')).toEqual({ root: ROOT, id: 'restyle-loop', patch: { goal: '调整后的目标文案' } })
    // 只改字段不含 status → 草稿标记不被清，徽章仍在（编辑不等于批准）
    expect(screen.getByTestId('lp-draft-badge')).toBeInTheDocument()
  })

  it('⑦busy 期间双钮 disabled（防双发，对齐既有 levelBusy 先例）', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/loops/snapshot') {
        return new Response(JSON.stringify({ generated_at: '2026-07-12T00:00:00Z', rows }), { status: 200 })
      }
      if (url === '/api/loops/update' && init?.method === 'POST') {
        await gate // 挂起 update，制造 busy 窗口
        const { id, patch } = JSON.parse(String(init.body)) as { id: string; patch: Record<string, unknown> }
        rows = rows.map((r) => (r.id === id ? { ...r, ...patch, draft: false } : r))
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      throw new Error(`unexpected fetch ${url}`)
    }) as unknown as typeof fetch
    rows = [makeRow({ draft: true, status: 'paused' })]
    renderCard()
    await screen.findByTestId('lp-draft-approve')
    fireEvent.click(screen.getByTestId('lp-draft-approve'))
    // pending 期间：批准 + 驳回 双双 disabled
    await waitFor(() => expect(screen.getByTestId('lp-draft-approve')).toBeDisabled())
    expect(screen.getByTestId('lp-draft-reject')).toBeDisabled()
    release()
    // 释放后：写回成功 → 重拉 → 徽章消失（busy 解除）
    await waitFor(() => expect(screen.queryByTestId('lp-draft-badge')).toBeNull())
  })

  it('⑥空态文案提 pipeline loop init（zh）——保留 agent 手写 .pipeline/loops.yaml 既有措辞', async () => {
    rows = []
    renderCard()
    const empty = await screen.findByTestId('lp-empty')
    expect(empty).toHaveTextContent('pipeline loop init')
    // 既有「agent 直接写 .pipeline/loops.yaml」措辞不被替换
    expect(empty).toHaveTextContent('.pipeline/loops.yaml')
  })
})
