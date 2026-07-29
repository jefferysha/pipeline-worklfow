import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BUDGET_WARN_RATIO as KERNEL_BUDGET_WARN_RATIO,
  MIN_L2_RUNS_FOR_L3 as KERNEL_MIN_L2_RUNS_FOR_L3,
  READY_STRONG as KERNEL_READY_STRONG,
  READY_THRESHOLD as KERNEL_READY_THRESHOLD,
} from '@tenon/kernel'
import { I18nProvider } from '../i18n'
import { BUDGET_WARN_RATIO, GovernanceRail, MIN_L2_RUNS_FOR_L3, READY_STRONG, READY_THRESHOLD } from './GovernanceRail'
import { useLoops } from './LoopCard'

/**
 * GovernanceRail.test（P3 任务 B / 契约 scratchpad/p3-contract.md §4 第 9~12 条）——
 * 画布右侧常驻「治理轨 · Loop」三件套的独立单测。
 *
 * 本文件的最高优先守门项是**诚实门**，不是渲染细节。三条各自钉死（组件头注释 ①②③）：
 *   · 就绪分 = 📊 只读派生（8 维加权纯函数，无写端点）→ 该卡**零可写控件**。定稿 demo 那 4 个
 *     「勾底层字段抬分」的 checkbox 是演示用的假控件，复刻进来就是假交互；
 *   · 熔断态 ok/warn/tripped = 📊 只读派生（纯按当日 token 花费算）→ **无 arm/reset 钮**（无端点）；
 *   · 晋升门的裁决权在 server（kernel graduation.ts 吃五路输入，前端只拿得到其中两路）→
 *     **不 disable 任何级别按钮**，点了就真发，拒绝时把 server 原文摆出来。
 *
 * ⚠️ 反向断言（`queryBy…toBeNull()` / `toHaveLength(0)`）一律**配正向对照**：testid 拼错、
 * 功能压根没实现时，反向断言会全部假绿——对照组钉住「该长的确实长得出来」，守门才有牙。
 *
 * ⚠️ 预算滑杆是**去抖 350ms 后才落盘**（组件 BUDGET_COMMIT_MS：拖拽中原生 range 连发 change，
 * 逐拍直发等于对 loops.yaml 连做几十次文本手术 + CAS）。故 POST body 断言一律 `await waitFor(...)`，
 * 写同步断言必假红。
 */

const ROOT = '/tmp/proj-a'

/** server LoopRow 契约形状（loops.ts::buildLoopsSnapshot）——与 LoopCard.test.tsx:21-48 同源同形。 */
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
    readiness: { score: 62, band: 'mostly-ready' },
    budget: { breaker: 'ok', runsToday: 3, spentToday: 3000, remaining: 97000, hasBudget: true, maxTokensPerDay: 100000 },
    matched_changes: ['rl-0142-migrate-card'],
    phases: ['build', 'verify'],
    draft: false,
    template_id: 'ci-sweeper',
    template_version: 1,
    workflow_id: 'default',
    skill_bundle_id: 'backend',
    ledger: {
      health: 'ok',
      rejected_records: 0,
      admission_enforced: true,
      inflight_enforced: true,
      runs_today: 4,
      in_flight: 2,
      activated_in_flight: 1,
      settled_tokens_actual: 12000,
      settled_tokens_estimated: 3000,
      reserved_tokens: 5000,
      remaining_tokens: 80000,
      last_result: 'paused',
      last_finished_at: '2026-07-19T10:30:00.000Z',
    },
    graduation: {
      id: 'restyle-loop', current: 'L1', recommended: 'L1', enforcement: 'report-only', canGraduate: false,
      blockers: ['2 项活跃漂移未清', '连败中 fail_streak=1'], demotionReason: null, demotionSignals: ['2 项活跃漂移'],
      readinessScore: 62, readinessBand: 'mostly-ready', driftCount: 2, breaker: 'ok', failStreak: 1, runs: 3,
    },
    ...over,
  }
}

let rows: Record<string, unknown>[]

/**
 * 快照 + 两写端点的可驱动 mock（LoopCard.test.tsx:53-86 同款）：update/level 真把改动写回 rows，
 * 于是 loops.reload() 之后组件读到的是**新的 server 真值**——「写回后回显」才测得到，
 * 而不是测一个恒定 fixture。
 */
function mockFetch(opts?: { snapshotStatus?: number; snapshotBody?: unknown; updateStatus?: number; updateBody?: unknown; levelStatus?: number; levelBody?: unknown }): void {
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/loops/snapshot') {
      if (opts?.snapshotStatus) return new Response(JSON.stringify(opts.snapshotBody ?? { error: '快照读取失败' }), { status: opts.snapshotStatus })
      return new Response(JSON.stringify({ generated_at: '2026-07-15T00:00:00Z', rows }), { status: 200 })
    }
    if (url === '/api/loops/update' && init?.method === 'POST') {
      if (opts?.updateStatus) return new Response(JSON.stringify(opts.updateBody ?? { ok: false }), { status: opts.updateStatus })
      const { id, patch } = JSON.parse(String(init.body)) as { id: string; patch: Record<string, unknown> }
      rows = rows.map((r) =>
        r.id === id ? { ...r, budget_decl: { ...(r.budget_decl as Record<string, unknown>), ...patch } } : r,
      )
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

/** 出货接线同款 harness：useLoops 住宿主（WorkbenchView 的同一拓扑），本轨纯消费 LoopsState。 */
function Harness(): JSX.Element {
  const loops = useLoops(ROOT)
  return <GovernanceRail root={ROOT} loops={loops} />
}

function renderRail(): void {
  render(
    <I18nProvider>
      <Harness />
    </I18nProvider>,
  )
}

async function openPromoteDialog(target: 'L2' | 'L3'): Promise<HTMLElement> {
  fireEvent.click(screen.getByTestId(`wb-gov-lv-${target}`))
  return screen.findByTestId('wb-gov-promote-confirm')
}

/** 某端点的全部 POST 调用。 */
function posts(url: string) {
  return (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
    (c) => c[0] === url && (c[1] as RequestInit | undefined)?.method === 'POST',
  )
}

/** 最近一次指定端点的 POST body（一发都没有 → null）。 */
function lastPostBody(url: string): unknown {
  const list = posts(url)
  const last = list[list.length - 1]
  return last ? JSON.parse(String((last[1] as RequestInit).body)) : null
}

/**
 * 跨过去抖窗口的**真实**等待。只用于反向断言（「不该发的没发」）：
 * waitFor 对「现在还没发」这种条件第一拍就满足，等于什么都没测——必须真的等过 350ms 窗口。
 */
const AFTER_DEBOUNCE_MS = 600
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, AFTER_DEBOUNCE_MS))

/**
 * 「可写控件」的全集选择器。诚实门的两条反向断言（就绪分零可写 / 熔断无 arm-reset）都靠它扫——
 * 只查 button 不够：checkbox/switch/range 都不是 button，漏一类就等于给假控件开后门。
 */
const WRITABLE_SEL =
  'button, input, select, textarea, [role="switch"], [role="checkbox"], [role="radio"], [role="slider"], [contenteditable="true"]'

beforeEach(() => {
  localStorage.clear()
  rows = [makeRow()]
  mockFetch()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('GovernanceRail 单源守卫：四个 kernel 常量镜像 == kernel 真值', () => {
  /**
   * 组件把 70/90/5/0.8 抄成本地 const（dashboard 是浏览器 bundle，直接 import kernel 会拉进
   * node:fs 破坏构建——LoopCard::LOOP_RUNNERS 的既有纪律）。镜像一旦与 kernel 漂开，界面上那句
   * 「L1→L2 需就绪≥70」就成了**谎报**（它是插值出来的，不会自己报错）。故跨边界钉死
   * （LoopCard.test.tsx:287-288 的 transition-mirror 同款断言）。
   */
  it('READY_THRESHOLD / READY_STRONG / MIN_L2_RUNS_FOR_L3 / BUDGET_WARN_RATIO 四条逐个相等', () => {
    expect(READY_THRESHOLD).toBe(KERNEL_READY_THRESHOLD)
    expect(READY_STRONG).toBe(KERNEL_READY_STRONG)
    expect(MIN_L2_RUNS_FOR_L3).toBe(KERNEL_MIN_L2_RUNS_FOR_L3)
    expect(BUDGET_WARN_RATIO).toBe(KERNEL_BUDGET_WARN_RATIO)
  })

  it('门槛说明行的数字来自镜像插值，不是文案里写死的（改 kernel 而文案不跟 = 谎报）', async () => {
    renderRail()
    const note = await screen.findByTestId('wb-gov-grad-note')
    expect(note).toHaveTextContent(`L1→L2 需就绪≥${KERNEL_READY_THRESHOLD}`)
    expect(note).toHaveTextContent(`L2→L3 需就绪≥${KERNEL_READY_STRONG}`)
    expect(note).toHaveTextContent(`≥${KERNEL_MIN_L2_RUNS_FOR_L3} 次运行`)
    // 熔断说明行的 warn 线同理（0.8 → 80%）
    expect(screen.getByTestId('wb-gov-spent')).toHaveTextContent(`${Math.round(KERNEL_BUDGET_WARN_RATIO * 100)}% warn 线硬编码`)
  })
})

describe('GovernanceRail §4.9 自治级 L1/L2/L3（单选 / postLoopLevel body / server 原文）', () => {
  it('升档前直接展示 server 同源 graduation 全量输入与 blockers，不再只凭 readiness 单向猜测', async () => {
    renderRail()
    const preflight = await screen.findByTestId('wb-gov-graduation')
    expect(preflight).toHaveTextContent('2 项活跃漂移未清')
    expect(preflight).toHaveTextContent('fail_streak=1')
    expect(preflight).toHaveTextContent('runs 3')
    expect(preflight).toHaveTextContent('drift 2')
    expect(preflight).toHaveAttribute('data-can-graduate', 'false')
  })

  it('三档是一组 radio：当前档 aria-checked=true，其余 false；轨与三张卡都在', async () => {
    renderRail()
    await screen.findByTestId('wb-gov-level')
    expect(screen.getByTestId('wb-gov-rail')).toBeInTheDocument()
    expect(screen.getByTestId('wb-gov-readiness')).toBeInTheDocument()
    expect(screen.getByTestId('wb-gov-budget')).toBeInTheDocument()

    const group = screen.getByRole('radiogroup', { name: '自主级别' })
    expect(within(group).getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByTestId('wb-gov-lv-L1')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('wb-gov-lv-L2')).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByTestId('wb-gov-lv-L3')).toHaveAttribute('aria-checked', 'false')
  })

  /**
   * 风险不对称（LoopCard/LoopsPanel 既有纪律）：**升档过确认、降档直发**。
   * 这条不能因为「server 有晋升门兜底」而省——server 的门只拦不够格的；就绪分一旦够了，
   * 误点一下就直接进 L3 无人值守，此时 server 不会拦，「兜底」根本不成立。
   */
  it('升档 L1→L2：先出确认弹窗，**取消则一发 POST 都不发**，档位不动', async () => {
    renderRail()
    await screen.findByTestId('wb-gov-level')
    expect(await openPromoteDialog('L2')).toBeInTheDocument()
    // 弹窗只是问话，本身不许先斩后奏
    expect(posts('/api/loops/level')).toHaveLength(0)

    fireEvent.click(screen.getByTestId('wb-gov-promote-cancel'))
    expect(screen.queryByTestId('wb-gov-promote-confirm')).toBeNull()
    await settle()
    expect(posts('/api/loops/level')).toHaveLength(0)
    expect(screen.getByTestId('wb-gov-lv-L1')).toHaveAttribute('aria-checked', 'true')
  })

  it('升档 L1→L2：确认后才 POST /api/loops/level，body = {root,id,target}，reload 后回显 L2', async () => {
    renderRail()
    await screen.findByTestId('wb-gov-level')
    await openPromoteDialog('L2')
    fireEvent.click(screen.getByTestId('wb-gov-promote-ok'))
    await waitFor(() => expect(screen.getByTestId('wb-gov-lv-L2')).toHaveAttribute('aria-checked', 'true'))
    expect(posts('/api/loops/level')).toHaveLength(1)
    expect(lastPostBody('/api/loops/level')).toEqual({ root: ROOT, id: 'restyle-loop', target: 'L2' })
    // 确认即关窗
    expect(screen.queryByTestId('wb-gov-promote-confirm')).toBeNull()
    expect(screen.getByTestId('wb-gov-lv-L1')).toHaveAttribute('aria-checked', 'false')
  })

  it('降档 L2→L1：**不出弹窗**直接 POST（降档是降低风险，不该加摩擦）', async () => {
    rows = [makeRow({ autonomy_level: 'L2' })]
    renderRail()
    await screen.findByTestId('wb-gov-level')
    fireEvent.click(screen.getByTestId('wb-gov-lv-L1'))
    expect(screen.queryByTestId('wb-gov-promote-confirm')).toBeNull()
    await waitFor(() => expect(screen.getByTestId('wb-gov-lv-L1')).toHaveAttribute('aria-checked', 'true'))
    expect(lastPostBody('/api/loops/level')).toEqual({ root: ROOT, id: 'restyle-loop', target: 'L1' })
  })

  it('跨级降档 L3→L1 同样直发不确认；跨级升档 L1→L3 同样过确认（分流只看升/降，不看跨不跨）', async () => {
    rows = [makeRow({ autonomy_level: 'L3' })]
    renderRail()
    await screen.findByTestId('wb-gov-level')
    fireEvent.click(screen.getByTestId('wb-gov-lv-L1'))
    expect(screen.queryByTestId('wb-gov-promote-confirm')).toBeNull()
    await waitFor(() => expect(lastPostBody('/api/loops/level')).toEqual({ root: ROOT, id: 'restyle-loop', target: 'L1' }))

    // 现在停在 L1，跨级点 L3 → 仍是升档 → 仍要确认
    expect(await openPromoteDialog('L3')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('wb-gov-promote-ok'))
    await waitFor(() => expect(lastPostBody('/api/loops/level')).toEqual({ root: ROOT, id: 'restyle-loop', target: 'L3' }))
  })

  it('点当前档 = no-op：不弹窗、不发请求（不是「重发一遍当前值」）', async () => {
    renderRail()
    await screen.findByTestId('wb-gov-level')
    fireEvent.click(screen.getByTestId('wb-gov-lv-L1'))
    expect(screen.queryByTestId('wb-gov-promote-confirm')).toBeNull()
    await settle()
    expect(posts('/api/loops/level')).toHaveLength(0)
  })

  it('server 400 errors[] → wb-gov-level-error 展示**原文**（plan.reason + blockers），档位不动', async () => {
    mockFetch({ levelStatus: 400, levelBody: { errors: ['就绪度未达标：L1-only', '缺 kill_criteria 覆盖'] } })
    renderRail()
    await screen.findByTestId('wb-gov-level')
    await openPromoteDialog('L2')
    fireEvent.click(screen.getByTestId('wb-gov-promote-ok'))
    const err = await screen.findByTestId('wb-gov-level-error')
    // 不翻译、不改写、不吞并——server 的两条 blocker 一字不落
    expect(err).toHaveTextContent('就绪度未达标：L1-only')
    expect(err).toHaveTextContent('缺 kill_criteria 覆盖')
    expect(err).toHaveAttribute('data-tone', 'error')
    expect(screen.getByTestId('wb-gov-lv-L1')).toHaveAttribute('aria-checked', 'true')
  })

  /**
   * 诚实门③：真正的裁决是 kernel graduation.ts::decideGraduation，吃 readiness/drift/breaker/
   * failStreak/**runs** 五路输入，而 /api/loops/snapshot 只给了其中两路。前端 disable 掉「预计会被
   * 拒」的按钮 = **假装自己是权威**（而且必然误判：另外三路它根本不知道）。
   * 故：就绪分 30 分（远低于 L2 的 70 门）时，L2/L3 照样可点、点了照样真发——让 server 下判决。
   */
  it('就绪分远低于门槛 → 级别按钮**照样不 disable**，点了真发 POST（判决权在 server）', async () => {
    rows = [makeRow({ readiness: { score: 30, band: 'not-ready' } })]
    renderRail()
    await screen.findByTestId('wb-gov-level')
    expect(screen.getByTestId('wb-gov-lv-L2')).toBeEnabled()
    expect(screen.getByTestId('wb-gov-lv-L3')).toBeEnabled()
    await openPromoteDialog('L3')
    fireEvent.click(screen.getByTestId('wb-gov-promote-ok'))
    await waitFor(() => expect(lastPostBody('/api/loops/level')).toEqual({ root: ROOT, id: 'restyle-loop', target: 'L3' }))
  })

  /** 旧 server 缺 graduation 时才保留单向 readiness fallback，不把兼容回退当完整裁决。 */
  it('旧快照无 graduation 且就绪分低于门槛 → 出 amber 兼容提示，且只是提示不是判决', async () => {
    rows = [makeRow({ readiness: { score: 30, band: 'not-ready' }, graduation: null })]
    renderRail()
    const hint = await screen.findByTestId('wb-gov-level-hint')
    expect(hint).toHaveTextContent('当前就绪 30')
    expect(hint).toHaveTextContent(`升到 L2 需 ≥${READY_THRESHOLD}`)
    expect(hint).toHaveAttribute('data-tone', 'hint')
    // 提示 ≠ 拦截：按钮照样能点（上一条已钉住真发）
    expect(screen.getByTestId('wb-gov-lv-L2')).toBeEnabled()
  })

  /**
   * **永不反向断言「可以升」**（诚实门③）：drift/连败/runs 三路前端拿不到，说「条件已满足」就是
   * 谎报。故就绪分够了时，这里**一句话都不说**——不是换个绿色提示。
   */
  it('旧快照无 graduation、就绪分已达下一档门槛 → 预判提示不渲染（不谎称可以升）', async () => {
    rows = [makeRow({ autonomy_level: 'L2', readiness: { score: 95, band: 'ready' }, graduation: null })]
    renderRail()
    await screen.findByTestId('wb-gov-level')
    expect(screen.queryByTestId('wb-gov-level-hint')).toBeNull()
    // 反向断言的对照：上一条同 testid 在低分时确实会出现 → 这里的 null 是组件的选择
    const level = screen.getByTestId('wb-gov-level')
    expect(level.textContent).not.toContain('可以升')
    expect(level.textContent).not.toContain('条件已满足')
  })

  it('旧快照无 graduation、L3 顶档 → 无下一档兼容提示', async () => {
    rows = [makeRow({ autonomy_level: 'L3', readiness: { score: 10, band: 'not-ready' }, graduation: null })]
    renderRail()
    await screen.findByTestId('wb-gov-level')
    expect(screen.queryByTestId('wb-gov-level-hint')).toBeNull()
  })
})

describe('GovernanceRail §4.10 就绪分 / 熔断态：只读派生（零可写控件、零 arm-reset 钮）', () => {
  /**
   * 诚实门①：就绪分是 8 维加权纯函数（阈值/权重硬编码在 kernel/src/loops/drift.ts），**无写端点**。
   * 定稿 demo 里那 4 个「勾底层字段抬分」的 checkbox 是**演示用的假控件**（demo 的 readiness()
   * 是 sc=32 起步的捏造算式，压根不是后端那个函数）——复刻进来 = 勾了不落盘 = 假交互。
   */
  it('就绪分卡：一个可写控件都没有（button/input/checkbox/switch 全类扫）', async () => {
    renderRail()
    const rd = await screen.findByTestId('wb-gov-readiness')
    expect(rd.querySelectorAll(WRITABLE_SEL)).toHaveLength(0)
    // 只读读数照常齐全：分数 + 档位 chip + 「间接抬分」的指路说明
    expect(within(rd).getByTestId('wb-gov-readiness-score')).toHaveTextContent('62')
    expect(within(rd).getByTestId('wb-gov-readiness-band')).toHaveTextContent('大致就绪')
    expect(rd).toHaveTextContent('就绪分本身不可直接写')
    expect(rd).toHaveTextContent('改 goal / kill_criteria / 预算间接抬分')
  })

  /**
   * 诚实门②：熔断态 ok/warn/tripped 纯按当日 token 花费算（80% warn 线硬编码），
   * **无 arm/trip/reset 端点**——做了就是假按钮。可写的只有预算**阈值**。
   */
  it('熔断态：只读态灯 + 态名，**无 arm/reset 钮**（整个熔断块零控件）', async () => {
    renderRail()
    const breaker = await screen.findByTestId('wb-gov-breaker')
    expect(breaker.querySelectorAll(WRITABLE_SEL)).toHaveLength(0)
    expect(breaker).toHaveAttribute('data-breaker', 'ok')
    expect(within(breaker).getByTestId('wb-gov-breaker-state')).toHaveTextContent('ok')
    // 「派生」徽章把「为什么没有按钮」说出来（不给控件也不能沉默）
    expect(breaker).toHaveTextContent('派生')
    expect(breaker).not.toHaveTextContent('📊')
    expect(breaker.querySelector('svg')).not.toBeNull()
    expect(screen.getByTestId('wb-gov-spent')).toHaveTextContent('无 arm/reset 端点')
  })

  it('预算卡里唯一的可写控件 = 那根滑杆（一个 button 都没有 → arm/reset 无处藏身）', async () => {
    renderRail()
    const budget = await screen.findByTestId('wb-gov-budget')
    const writable = budget.querySelectorAll(WRITABLE_SEL)
    expect(writable).toHaveLength(1)
    expect(writable[0]).toBe(screen.getByTestId('wb-gov-budget-slider'))
    expect(within(budget).queryByRole('button')).toBeNull()
  })

  /**
   * 正向对照（**不可省**）：上面三条全是 toHaveLength(0)/queryBy→Null——若 WRITABLE_SEL 写错、
   * 或整个轨压根没渲染，它们会全部假绿。这条钉住同一次渲染里可写面确实长得出真控件。
   */
  it('对照组：整轨的可写控件恰好 = 3 个级别按钮 + 1 根预算滑杆（证明选择器有牙）', async () => {
    renderRail()
    await screen.findByTestId('wb-gov-level')
    const rail = screen.getByTestId('wb-gov-rail')
    const writable = Array.from(rail.querySelectorAll(WRITABLE_SEL))
    expect(writable).toHaveLength(4)
    expect(writable).toContain(screen.getByTestId('wb-gov-lv-L1'))
    expect(writable).toContain(screen.getByTestId('wb-gov-lv-L2'))
    expect(writable).toContain(screen.getByTestId('wb-gov-lv-L3'))
    expect(writable).toContain(screen.getByTestId('wb-gov-budget-slider'))
  })

  it('档位 chip 走 data-band + 人话文案；三档配色分支都认（ready/mostly-ready/not-ready）', async () => {
    for (const [band, text] of [
      ['ready', '就绪'],
      ['mostly-ready', '大致就绪'],
      ['not-ready', '未就绪'],
    ] as const) {
      rows = [makeRow({ readiness: { score: 80, band } })]
      mockFetch()
      const { unmount } = render(
        <I18nProvider>
          <Harness />
        </I18nProvider>,
      )
      const chip = await screen.findByTestId('wb-gov-readiness-band')
      expect(chip).toHaveAttribute('data-band', band)
      expect(chip).toHaveTextContent(text)
      unmount()
    }
  })

  /** server 给了没见过的档位 → **原样透传**，不装作认识（也不吞成 '—'——它是真数据，只是没见过）。 */
  it('未知档位（server 新枚举）→ 原样透传到 data-band 与文案，不谎报也不吞掉', async () => {
    rows = [makeRow({ readiness: { score: 62, band: 'L2-ready' } })]
    renderRail()
    const chip = await screen.findByTestId('wb-gov-readiness-band')
    expect(chip).toHaveAttribute('data-band', 'L2-ready')
    expect(chip).toHaveTextContent('L2-ready')
  })

  it('未知熔断态同理：原样透传到 data-breaker，不当作 ok', async () => {
    rows = [makeRow({ budget: { breaker: 'degraded', runsToday: 3, spentToday: 3000, remaining: 97000 } })]
    renderRail()
    const breaker = await screen.findByTestId('wb-gov-breaker')
    expect(breaker).toHaveAttribute('data-breaker', 'degraded')
    expect(within(breaker).getByTestId('wb-gov-breaker-state')).toHaveTextContent('degraded')
  })

  it('熔断 tripped/warn 也只是换态灯与读数，仍然没有任何复位入口', async () => {
    rows = [makeRow({ budget: { breaker: 'tripped', runsToday: 30, spentToday: 99000, remaining: 1000 } })]
    renderRail()
    const breaker = await screen.findByTestId('wb-gov-breaker')
    expect(breaker).toHaveAttribute('data-breaker', 'tripped')
    expect(breaker.querySelectorAll(WRITABLE_SEL)).toHaveLength(0)
    expect(within(screen.getByTestId('wb-gov-budget')).queryByRole('button')).toBeNull()
  })
})

describe('GovernanceRail §4.11 token 预算滑杆（postLoopUpdate body 精确 + 去抖）', () => {
  it('读回显：滑杆现值 = server 真值，步进 = 受控网格 10（与 LoopCard 同一张网格）', async () => {
    renderRail()
    const slider = await screen.findByTestId('wb-gov-budget-slider')
    expect(slider).toHaveValue('100')
    expect(slider).toHaveAttribute('step', '10')
    expect(slider).toHaveAttribute('min', '10')
    expect(slider).toHaveAttribute('max', '500')
    expect(screen.getByTestId('wb-gov-budget-slider-val')).toHaveTextContent('100k')
  })

  /** 值即时回显（不卡手）、落盘等停手（去抖 350ms）——两件事分开断言。 */
  it('拖动 → 显示**即时**变（同步断言），POST 则要等去抖窗口过（await waitFor）', async () => {
    renderRail()
    const slider = await screen.findByTestId('wb-gov-budget-slider')
    fireEvent.change(slider, { target: { value: '120' } })
    // 即时回显：同一拍就该变（这一条刻意写成同步断言——它测的正是「不卡手」）
    expect(screen.getByTestId('wb-gov-budget-slider-val')).toHaveTextContent('120k')

    await waitFor(() => expect(posts('/api/loops/update')).toHaveLength(1))
    expect(lastPostBody('/api/loops/update')).toEqual({
      root: ROOT,
      id: 'restyle-loop',
      patch: { max_tokens_per_day: 120000 },
    })
    // reload 后草稿丢弃、以 server 新真值回显（120k 不是弹回 100k）
    await waitFor(() => expect(screen.getByTestId('wb-gov-budget-slider')).toHaveValue('120'))
  })

  /**
   * 去抖的**真正理由**：原生 range 拖拽中连发 change，逐拍直发 = 对 loops.yaml 连做几十次
   * 「文本手术 + 整文档 schema 重校验 + CAS」。故连拖多拍**只落最后一发**。
   */
  it('连拖多拍 → 只发**一发** POST，且值 = 最后停手那一档（不是第一档、不是每档一发）', async () => {
    renderRail()
    const slider = await screen.findByTestId('wb-gov-budget-slider')
    for (const v of ['110', '120', '130', '140', '150']) fireEvent.change(slider, { target: { value: v } })
    expect(screen.getByTestId('wb-gov-budget-slider-val')).toHaveTextContent('150k')

    await waitFor(() => expect(posts('/api/loops/update')).toHaveLength(1))
    expect(lastPostBody('/api/loops/update')).toEqual({
      root: ROOT,
      id: 'restyle-loop',
      patch: { max_tokens_per_day: 150000 },
    })
    // 再多等一个窗口，也不会补发前面那几拍
    await settle()
    expect(posts('/api/loops/update')).toHaveLength(1)
  })

  /** patch 只带被改的那一键——不夹带未改字段（LoopCard computePatch 的同一条纪律）。 */
  it('patch 只含 max_tokens_per_day 一键，不夹带 cadence/runs/on_exceed 等未改字段', async () => {
    renderRail()
    fireEvent.change(await screen.findByTestId('wb-gov-budget-slider'), { target: { value: '200' } })
    await waitFor(() => expect(posts('/api/loops/update')).toHaveLength(1))
    const body = lastPostBody('/api/loops/update') as { patch: Record<string, unknown> }
    expect(Object.keys(body.patch)).toEqual(['max_tokens_per_day'])
  })

  /** 停手时的值 == server 真值 → 一发都不发（等值写回是纯噪音，还会白白转一次 CAS）。 */
  it('拖走又拖回原值 → 停手后一发 POST 都不发（等值不写回）', async () => {
    renderRail()
    const slider = await screen.findByTestId('wb-gov-budget-slider')
    fireEvent.change(slider, { target: { value: '130' } })
    fireEvent.change(slider, { target: { value: '100' } }) // 拖回 server 真值
    expect(screen.getByTestId('wb-gov-budget-slider-val')).toHaveTextContent('100k')
    await settle()
    expect(posts('/api/loops/update')).toHaveLength(0)
  })

  it('写回失败 → wb-gov-budget-error 展示 server 原文（静默吞错 = 谎报已保存）', async () => {
    mockFetch({ updateStatus: 400, updateBody: { ok: false, error: 'patch 后 schema 校验失败，未落盘' } })
    renderRail()
    fireEvent.change(await screen.findByTestId('wb-gov-budget-slider'), { target: { value: '120' } })
    const err = await screen.findByTestId('wb-gov-budget-error')
    expect(err).toHaveTextContent('patch 后 schema 校验失败，未落盘')
    expect(err).toHaveAttribute('data-tone', 'error')
  })

  /** 未声明预算：滑杆停在推荐位，但显示仍是「未设置」——**不拿推荐值冒充已设置的真值**。 */
  it('row 未声明 max_tokens_per_day → 显示「未设置」（滑杆停推荐位但不谎报已设置）', async () => {
    rows = [makeRow({ budget_decl: { max_runs_per_day: 24, max_in_flight: 1, on_exceed: 'skip', max_tokens_per_day: null } })]
    renderRail()
    await screen.findByTestId('wb-gov-budget-slider')
    expect(screen.getByTestId('wb-gov-budget-slider-val')).toHaveTextContent('未设置')
    expect(screen.getByTestId('wb-gov-budget-slider')).toHaveValue('100')
    // 一动就变成真值显示，并照常落盘
    fireEvent.change(screen.getByTestId('wb-gov-budget-slider'), { target: { value: '110' } })
    expect(screen.getByTestId('wb-gov-budget-slider-val')).toHaveTextContent('110k')
    await waitFor(() => expect(lastPostBody('/api/loops/update')).toEqual({
      root: ROOT,
      id: 'restyle-loop',
      patch: { max_tokens_per_day: 110000 },
    }))
  })
})

describe('Control Room · 权威运行事实与 starter wiring', () => {
  it('展示 ledger 真值，不再只显示 legacy budget 摘要', async () => {
    renderRail()

    const facts = await screen.findByTestId('wb-gov-ledger')
    expect(facts).toHaveAttribute('data-health', 'ok')
    expect(within(facts).getByTestId('wb-gov-ledger-inflight')).toHaveTextContent('1 / 2')
    expect(within(facts).getByTestId('wb-gov-ledger-usage')).toHaveTextContent('12k')
    expect(within(facts).getByTestId('wb-gov-ledger-usage')).toHaveTextContent('3k')
    expect(within(facts).getByTestId('wb-gov-ledger-reserved')).toHaveTextContent('5k')
    expect(within(facts).getByTestId('wb-gov-ledger-last')).toHaveTextContent('paused')
    expect(screen.getByTestId('wb-gov-spent')).toHaveTextContent('15k')
    expect(screen.getByTestId('wb-gov-spent')).not.toHaveTextContent('3k')
  })

  it('展示 template/workflow/skill bundle 接线；缺 bundle 时明确标为未接线', async () => {
    renderRail()
    const wiring = await screen.findByTestId('wb-gov-wiring')
    expect(wiring).toHaveTextContent('ci-sweeper')
    expect(wiring).toHaveTextContent('default')
    expect(wiring).toHaveTextContent('backend')

    rows = [makeRow({ skill_bundle_id: null })]
    mockFetch()
    renderRail()
    await waitFor(() => expect(screen.getAllByTestId('wb-gov-wiring')).toHaveLength(2))
    expect(screen.getAllByTestId('wb-gov-wiring')[1]).toHaveTextContent('未接线')
  })

  it('ledger degraded 时显示坏行数并且不把 enforcement 证据画成已生效', async () => {
    rows = [makeRow({
      ledger: {
        ...(makeRow().ledger as Record<string, unknown>),
        health: 'degraded',
        rejected_records: 2,
        admission_enforced: false,
        inflight_enforced: false,
      },
    })]
    renderRail()

    const facts = await screen.findByTestId('wb-gov-ledger')
    expect(facts).toHaveAttribute('data-health', 'degraded')
    expect(facts).toHaveTextContent('2 条坏记录')
    expect(within(facts).getByTestId('wb-gov-ledger-enforcement')).toHaveTextContent('未确认')
  })
})

describe('GovernanceRail §4.12 空态 / 数据未就绪（回落 —，不谎报数字）', () => {
  it('无 loop → 空态 + 「去终端生成」引导，三张卡一张都不渲染，零可写控件', async () => {
    rows = []
    renderRail()
    const empty = await screen.findByTestId('wb-gov-empty')
    expect(empty).toHaveTextContent('尚未配置自动运行')
    expect(empty).toHaveTextContent('打开终端，把目标告诉 agent')
    // 没有 loop 就没有可治理的对象——不许长出任何编辑面（假装可配 = 填完了不知道存哪儿）
    expect(screen.getByTestId('wb-gov-rail').querySelectorAll(WRITABLE_SEL)).toHaveLength(0)
    expect(screen.queryByTestId('wb-gov-level')).toBeNull()
    expect(screen.queryByTestId('wb-gov-readiness')).toBeNull()
    expect(screen.queryByTestId('wb-gov-budget')).toBeNull()
    // 轨头恒在（三分支位置不跳）
    expect(screen.getByTestId('wb-gov-rail')).toHaveTextContent('治理轨 · Loop')
  })

  /**
   * 正向对照（**不可省**）：上一条的 queryBy→Null 在「组件压根没实现三张卡」时也会绿。
   * 这条钉住有 loop 时三张卡确实都在（本文件多数用例已隐含依赖它，此处显式立牌）。
   */
  it('对照组：有 loop → 空态消失、三张卡都在', async () => {
    renderRail()
    await screen.findByTestId('wb-gov-level')
    expect(screen.queryByTestId('wb-gov-empty')).toBeNull()
    expect(screen.getByTestId('wb-gov-readiness')).toBeInTheDocument()
    expect(screen.getByTestId('wb-gov-budget')).toBeInTheDocument()
  })

  /**
   * **不拿 0 冒充没数据**（也不拿没数据冒充 0）：readiness 整段缺席 → 分数与档位都回落 '—'。
   * 组件的 finiteOrNull 只认有限数——'—' 说的是「我不知道」，0 说的是「我知道，是 0」。
   */
  it('readiness 缺席 → 分数与档位都回落「—」+ data-band="unknown"（不显示 0）', async () => {
    rows = [makeRow({ readiness: undefined })]
    renderRail()
    const score = await screen.findByTestId('wb-gov-readiness-score')
    expect(score).toHaveTextContent('—')
    expect(score.textContent).not.toBe('0')
    const chip = screen.getByTestId('wb-gov-readiness-band')
    expect(chip).toHaveTextContent('—')
    expect(chip).toHaveAttribute('data-band', 'unknown')
  })

  it('budget 缺席 → 熔断态「—」+ data-breaker="unknown"；当日已花回落「—」（不显示 0k）', async () => {
    // 无 ledger 的旧 server 才回退 legacy budget；有 ledger 时账本始终是权威真相源。
    rows = [makeRow({ budget: undefined, ledger: undefined })]
    renderRail()
    const breaker = await screen.findByTestId('wb-gov-breaker')
    expect(breaker).toHaveAttribute('data-breaker', 'unknown')
    expect(within(breaker).getByTestId('wb-gov-breaker-state')).toHaveTextContent('—')
    expect(screen.getByTestId('wb-gov-spent')).toHaveTextContent('当日已花 —')
    expect(screen.getByTestId('wb-gov-spent').textContent).not.toContain('0k')
  })

  it('score 非有限数（server 给了 null/NaN）→ 同样回落「—」，不渲染成 NaN', async () => {
    rows = [makeRow({ readiness: { score: null, band: 'not-ready' } })]
    renderRail()
    expect(await screen.findByTestId('wb-gov-readiness-score')).toHaveTextContent('—')
    expect(screen.getByTestId('wb-gov-readiness-score').textContent).not.toContain('NaN')
    // band 是真数据 → 照常人话显示（score 缺不该把 band 一起吞掉）
    expect(screen.getByTestId('wb-gov-readiness-band')).toHaveTextContent('未就绪')
  })

  /**
   * 正向对照（**不可省**）：'—' 的断言若因 finiteOrNull 写反而恒返回 null，上面几条照样绿。
   * 这条钉住**真的 0 分显示 0**——'—' 与 0 是两个不同的事实，绝不许互相冒充。
   */
  it('对照组：score 真的是 0 → 显示 "0" 而不是 "—"（0 与「没数据」是两回事）', async () => {
    rows = [makeRow({
      readiness: { score: 0, band: 'not-ready' },
      budget: { breaker: 'ok', runsToday: 0, spentToday: 0, remaining: 100000 },
      ledger: undefined,
    })]
    renderRail()
    const score = await screen.findByTestId('wb-gov-readiness-score')
    expect(score).toHaveTextContent('0')
    expect(score.textContent).not.toContain('—')
    // 当日真的花了 0 → '0k'，同样不是 '—'
    expect(screen.getByTestId('wb-gov-spent')).toHaveTextContent('当日已花 0k')
  })

  it('快照加载中 → 轨头在 + 「加载中」，不先画一堆空壳卡', async () => {
    // 永不 resolve 的快照：停在 rows === null 的加载态
    global.fetch = vi.fn(() => new Promise<Response>(() => {})) as unknown as typeof fetch
    renderRail()
    expect(screen.getByTestId('wb-gov-rail')).toHaveTextContent('治理轨 · Loop')
    expect(await screen.findByText('加载中…')).toBeInTheDocument()
    expect(screen.queryByTestId('wb-gov-level')).toBeNull()
    expect(screen.queryByTestId('wb-gov-empty')).toBeNull()
  })

  it('快照加载失败 → wb-gov-load-error 展示 server 原文，不静默留白', async () => {
    mockFetch({ snapshotStatus: 500, snapshotBody: { error: '磁盘只读，快照不可读' } })
    renderRail()
    const err = await screen.findByTestId('wb-gov-load-error')
    expect(err).toHaveTextContent('磁盘只读，快照不可读')
    expect(err).toHaveAttribute('data-tone', 'error')
    expect(screen.queryByTestId('wb-gov-level')).toBeNull()
  })
})
