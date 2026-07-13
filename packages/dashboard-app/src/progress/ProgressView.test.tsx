import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { zh } from '../i18n/translations'
import { AFK_LOG_POLL_INTERVAL_MS } from './useAfkLog'
import { DEFAULT_RULES, rulesFromDef, rulesKey, type WorkflowRules } from '../model/workflowModel'
import { makeChange, makeProject, makeSnapshot } from '../testkit'
import type { Snapshot } from '../types'
import { ProgressView } from './ProgressView'

const ROOT_A = '/tmp/proj-a'
const ROOT_B = '/tmp/proj-b'
const ROOT_C = '/tmp/proj-c'

/**
 * v9-F1 fixture：对照 design-demos/v9-flowdeck.html 进度统一面剧本——单列表六行：
 * gate 全绿（gate-demo·verify 可以放行）/ 自定义门纯人判（changelog-cn·release-train 等你判断）/
 * 失败（hotfix-login ×3）/ 执行中（afk-demo）/ 等产出（triage-demo 缺 plan）/ 排队（board-demo），
 * 外加 1 条 archived（排除出行、列表尾缀计数）。updated_at 各不相同——钉「需操作行在前、
 * 组内 updated_at 倒序」的全序。
 */
const RELEASE_TRAIN_RULES = rulesFromDef({
  name: 'release-train',
  steps: [
    {
      id: 'draft', label: '起草', gate: null, skills: [], inputs: [],
      outputs: [{ field: 'draft_doc', type: 'file_path' }], guards: [],
      transitions: [{ event: 'submitted', to: 'review' }],
    },
    {
      id: 'review', label: '人工复核', gate: 'review', skills: [], inputs: [],
      outputs: [], guards: [],
      transitions: [{ event: 'approved', to: 'ship' }],
    },
    { id: 'ship', label: '发布', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
  ],
})

// 评审 P1-1 探针：自定义 workflow 的 review 相位挂 2 条前进边（ship-now→ship / fast-track→done）
// + 1 条回退边（send-back→triage）——「2+ 条同向出边一条不落」的行内/抽屉动作条量规。
const MULTI_EDGE_RULES = rulesFromDef({
  name: 'multi-edge',
  steps: [
    {
      id: 'triage', label: '分诊', gate: null, skills: [], inputs: [], outputs: [], guards: [],
      transitions: [{ event: 'triaged', to: 'review' }],
    },
    {
      id: 'review', label: '复核', gate: 'review', skills: [], inputs: [], outputs: [], guards: [],
      transitions: [
        { event: 'ship-now', to: 'ship' },
        { event: 'fast-track', to: 'done' },
        { event: 'send-back', to: 'triage' },
      ],
    },
    { id: 'ship', label: '发布', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [{ event: 'shipped', to: 'done' }] },
    { id: 'done', label: '完成', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
  ],
})

function makeFixture(): Snapshot {
  return makeSnapshot([
    makeProject(ROOT_A, [
      makeChange('gate-demo', 'verify', {
        track: 'backend',
        updated_at: '2026-07-12T10:00:00Z',
        fields: { verify_result: 'pass', agent_review_result: 'pass', codex_review_result: 'pass' },
      }),
      makeChange('triage-demo', 'spec', {
        track: 'chat',
        updated_at: '2026-07-12T09:00:00Z',
        fields: { design_doc: 'docs/design.md' },
      }),
      makeChange('afk-demo', 'build', {
        track: 'chat',
        updated_at: '2026-07-12T11:00:00Z',
        fields: { automation: 'running', automation_current_phase: 'verify' },
      }),
      makeChange('board-demo', 'open', {
        track: 'frontend',
        updated_at: '2026-07-12T08:00:00Z',
        fields: { automation: 'queued' },
      }),
      makeChange('hotfix-login', 'build', {
        track: 'backend',
        updated_at: '2026-07-11T10:00:00Z',
        fields: { automation: 'failed', automation_attempts: '3' },
      }),
      makeChange('old-demo', 'archive', { archived: 'true' }),
    ]),
    makeProject(ROOT_B, [
      makeChange('changelog-cn', 'review', {
        track: 'chat',
        updated_at: '2026-07-13T09:30:00Z',
        fields: { workflow: 'release-train' },
      }),
    ]),
  ])
}

function makeRules(): Map<string, WorkflowRules> {
  return new Map<string, WorkflowRules>([
    [rulesKey(ROOT_A, 'default'), DEFAULT_RULES],
    [rulesKey(ROOT_B, 'default'), DEFAULT_RULES],
    [rulesKey(ROOT_B, 'release-train'), RELEASE_TRAIN_RULES],
  ])
}

function renderView(over: Partial<Parameters<typeof ProgressView>[0]> = {}) {
  const onToast = vi.fn()
  const onRefresh = vi.fn()
  render(
    <I18nProvider>
      <ProgressView
        snapshot={makeFixture()}
        loading={false}
        error={null}
        currentRoot=""
        rulesByKey={makeRules()}
        onToast={onToast}
        onRefresh={onRefresh}
        {...over}
      />
    </I18nProvider>,
  )
  return { onToast, onRefresh }
}

// ── fetch 桩（沿 T11 姿势）：history（TaskDetail 挂载即拉）/afk log（RunLogPane 轮询，内容逐拍
//    递增）/动作端点（缺省 200 {ok:true}；actionResponse 可按 URL 正则改写单端点；actionGate 可挂
//    手动结算的闸门制造「在途」窗口，验 busy 守卫）。fetchLog 记录 method+url+body 供断言。──
let fetchLog: string[] = []
let logSeq = 0
let actionResponse: { match: RegExp; status: number; body: unknown } | null = null
let actionGate: Promise<void> | null = null
let automationSettings = { max_parallel: 4, max_retries: 1, default_opt_in: false, image: '' }
let automationFail = false
// v9-J：/api/mem/session-links 批量预取桩——缺省 { links: {} }（无命中，chip 落回静态命令）；
// 各用例改写此变量的 links 表来控制个别行的 session-link 命中结果（key=`${name}@${root}`）。
let sessionLinksResponse: { status: number; body: unknown } = { status: 200, body: { links: {} } }

beforeEach(() => {
  fetchLog = []
  logSeq = 0
  actionResponse = null
  actionGate = null
  automationSettings = { max_parallel: 4, max_retries: 1, default_opt_in: false, image: '' }
  automationFail = false
  sessionLinksResponse = { status: 200, body: { links: {} } }
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    fetchLog.push(`${init?.method ?? 'GET'} ${url}${typeof init?.body === 'string' ? ` ${init.body}` : ''}`)
    if (/\/api\/change\/[^/]+\/history\?root=/.test(url)) {
      return new Response(JSON.stringify({ entries: [] }), { status: 200 })
    }
    if (/\/api\/afk\/[^/]+\/log\?root=/.test(url)) {
      logSeq += 1
      return new Response(JSON.stringify({ log: `line ${logSeq}\n` }), { status: 200 })
    }
    if (/\/api\/automation\?root=/.test(url)) {
      if (automationFail) return new Response(JSON.stringify({ ok: false, error: 'boom' }), { status: 500 })
      return new Response(JSON.stringify({ ok: true, settings: automationSettings }), { status: 200 })
    }
    if (/\/api\/mem\/session-links\?/.test(url)) {
      return new Response(JSON.stringify(sessionLinksResponse.body), { status: sessionLinksResponse.status })
    }
    if (actionGate) await actionGate
    if (actionResponse && actionResponse.match.test(url)) {
      return new Response(JSON.stringify(actionResponse.body), { status: actionResponse.status })
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }) as unknown as typeof fetch
})

/** 点行名开抽屉并等 TaskDetail 的 history 拉取落定（不等会刷 act 告警且断言时机不稳）。 */
async function openDrawer(name: string): Promise<void> {
  fireEvent.click(screen.getByTestId(`prg9-name-${name}`))
  await waitFor(() => expect(screen.getByTestId('dt-hist-sec').getAttribute('data-settled')).toBe('true'))
}

/** 可控 matchMedia 桩（同 WorkbenchView.test.tsx 先例）：驱动 gsap.matchMedia 的
 *  reduce / no-preference 两分支——jsdom 无原生 matchMedia，未桩时组件走「环境不支持」静态路径。 */
function stubMatchMedia(reduceMatches: boolean): void {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: query.includes('prefers-reduced-motion: reduce')
      ? reduceMatches
      : query.includes('no-preference') && !reduceMatches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  })))
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.documentElement.classList.remove('prg9-lock')
})

describe('ProgressView 单列表行体（v9-H：聚合语境项目分组 + 行体 v2 标题行内联）', () => {
  it('聚合语境按项目分组：组序=首行全局序（需动手/最新在前）；组内=需动手置前+updated_at 倒序；旧 v5 结构不回归', () => {
    renderView()
    // 旧 v5 的组头/筛选条结构不回归（v9-H 组头是 prg9g- 前缀新结构）
    expect(document.querySelector('[data-testid^="prg-ghead-"]')).toBeNull()
    expect(document.querySelector('[data-testid^="prg-chip-"]')).toBeNull()
    const order = Array.from(
      screen.getByTestId('prg9-stack').querySelectorAll('[data-testid^="prg9-row-"]'),
    ).map((el) => el.getAttribute('data-testid'))
    expect(order).toEqual([
      // proj-b 组先（其首行 changelog-cn 需动手且最新）：组内仅一行
      'prg9-row-changelog-cn',
      // proj-a 组随后：需操作（gate/failed）置前，各按 updated_at 倒序
      'prg9-row-gate-demo',
      'prg9-row-hotfix-login',
      'prg9-row-afk-demo',
      'prg9-row-triage-demo',
      'prg9-row-board-demo',
    ])
    const heads = Array.from(
      screen.getByTestId('prg9-stack').querySelectorAll('[data-testid^="prg9g-head-"]'),
    ).map((el) => el.getAttribute('data-testid'))
    expect(heads).toEqual(['prg9g-head-proj-b', 'prg9g-head-proj-a'])
  })

  it('行体 v2：标题行内联（名称+track/workflow/调度 chip+时间,右端判定徽章）；列车轨与动作同居第二行', () => {
    renderView()
    const row = screen.getByTestId('prg9-row-gate-demo')
    const top = row.querySelector<HTMLElement>('.prg9v2-top')
    expect(top).not.toBeNull()
    expect(within(top!).getByTestId('prg9-name-gate-demo').textContent).toBe('gate-demo')
    expect(within(top!).getByText('backend')).toBeInTheDocument()
    expect(within(top!).getByTestId('prg9s-wf-gate-demo')).toBeInTheDocument()
    expect(within(top!).getByTestId('prg9s-sched-gate-demo')).toBeInTheDocument()
    // 时间弱化 mono：只显时间，不再带「项目 ·」前缀（项目名归组头）
    expect(top!.querySelector('.prg9v2-time')?.textContent).toBe('07-12 10:00')
    expect(within(top!).getByTestId('prg9-badge-gate-demo')).toBeInTheDocument()
    // 旧 186px 三列结构退役：行内不再有 prg9-head/prg9-side
    expect(row.querySelector('.prg9-head')).toBeNull()
    expect(row.querySelector('.prg9-side')).toBeNull()
    // 第二行：列车轨在主列，动作区与轨道同排（.prg9v2-body 两列）
    const body = row.querySelector<HTMLElement>('.prg9v2-body')
    expect(body).not.toBeNull()
    expect(within(body!).getByTestId('prg9-rail-gate-demo')).toBeInTheDocument()
    expect(within(body!).getByTestId('prg9-pass-gate-demo')).toBeInTheDocument()
  })

  it('需操作行 ring 按语义分色（真机验收 G）：gate=绿（--need 无 tone 修饰）、失败=红（--need-fail）；观察行安静', () => {
    renderView()
    for (const name of ['changelog-cn', 'gate-demo', 'hotfix-login']) {
      expect(screen.getByTestId(`prg9-row-${name}`).className).toContain('prg9-row--need')
    }
    // 复核门保持绿框：不带任何 tone 修饰类
    for (const name of ['changelog-cn', 'gate-demo']) {
      const cls = screen.getByTestId(`prg9-row-${name}`).className
      expect(cls).not.toContain('prg9-row--need-fail')
      expect(cls).not.toContain('prg9-row--need-cxl')
    }
    // 失败（cause 非 cancelled）=红框
    const failCls = screen.getByTestId('prg9-row-hotfix-login').className
    expect(failCls).toContain('prg9-row--need-fail')
    expect(failCls).not.toContain('prg9-row--need-cxl')
    for (const name of ['afk-demo', 'triage-demo', 'board-demo']) {
      expect(screen.getByTestId(`prg9-row-${name}`).className).not.toContain('prg9-row--need')
    }
  })

  it('archived 行不出现在列表里；组尾缀「1 个已归档」（proj-a 组，old-demo 归属该项目）', () => {
    renderView()
    expect(screen.queryByTestId('prg9-row-old-demo')).toBeNull()
    expect(screen.getByTestId('prg9-fold-proj-a').textContent).toContain('1 个已归档')
  })
})

// ── #2「demo↔生产残余差异清单」：归档折叠行「展开」真交互——静态「N 个已归档」文案改可点击
//    toggle；展开出该 root 下的只读归档行（不可开抽屉/不可点动作/rail 无 run 流光门控）；再点
//    （文案变「收起」）→ 收起。聚合语境（currentRoot=''）按项目组分别展开；单项目语境列表尾部
//    单一入口。fixture 唯一的 archived 行=old-demo（归属 ROOT_A/proj-a）。──
describe('ProgressView 归档折叠行「展开」（#2 真交互）', () => {
  it('聚合语境：proj-a 组尾「1 个已归档 · 展开」可点；展开后归档行只读出现（无名字/动作按钮、rail 非 run 态）；再点变「收起」', () => {
    renderView()
    expect(screen.queryByTestId('prg9-archived-row-old-demo')).toBeNull()
    const toggle = screen.getByTestId('prg9-fold-toggle-proj-a')
    expect(toggle.textContent).toContain('1 个已归档')
    expect(toggle.textContent).toContain('展开')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(toggle)
    expect(toggle.textContent).toContain('收起')
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    const archivedRow = screen.getByTestId('prg9-archived-row-old-demo')
    expect(archivedRow).toBeInTheDocument()
    expect(archivedRow.className).toContain('prg9-row--archived')
    // 只读：行内零按钮（无名字钮开抽屉、无行内动作钮）
    expect(within(archivedRow).queryAllByRole('button')).toHaveLength(0)
    expect(within(archivedRow).queryByTestId('prg9-name-old-demo')).toBeNull()
    // rail 不落 run 门控（强制 idle，即便该行真值状态另有其它态）
    expect(within(archivedRow).getByTestId('prg9-rail-old-demo')).toHaveAttribute('data-mode', 'idle')
    // 点行体本身不开抽屉（负向：归档行没有可点开详情的入口）
    fireEvent.click(archivedRow)
    expect(screen.queryByTestId('prg9-drawer')).toBeNull()

    fireEvent.click(toggle)
    expect(toggle.textContent).toContain('展开')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByTestId('prg9-archived-row-old-demo')).toBeNull()
  })

  it('proj-b 组无归档行：不出现折叠入口', () => {
    renderView()
    expect(screen.queryByTestId('prg9-fold-proj-b')).toBeNull()
  })

  it('单项目语境（currentRoot=ROOT_A）：列表尾部单一入口，展开同样只读', async () => {
    renderView({ currentRoot: ROOT_A })
    expect(document.querySelector('[data-testid^="prg9g-head-"]')).toBeNull()
    const toggle = screen.getByTestId('prg9-fold-toggle-proj-a')
    fireEvent.click(toggle)
    const archivedRow = screen.getByTestId('prg9-archived-row-old-demo')
    expect(within(archivedRow).queryAllByRole('button')).toHaveLength(0)
    // 单 root fixture：冲掉并发上限探测请求落地（不冲会刷 act 告警）
    await act(async () => {})
  })

  it('聚合语境：全归档 root（零活跃行）仍渲染项目组头 + 归档折叠区可展开（P1 修复：demo↔生产残余差异清单 #2 边界补）', () => {
    renderView({
      snapshot: makeSnapshot([
        makeProject(ROOT_A, [makeChange('live-a', 'open')]),
        makeProject(ROOT_C, [
          makeChange('gone-1', 'archive', { archived: 'true' }),
          makeChange('gone-2', 'build', { archived: 'true', fields: { automation: 'failed' } }),
        ]),
      ]),
      rulesByKey: new Map<string, WorkflowRules>([
        [rulesKey(ROOT_A, 'default'), DEFAULT_RULES],
        [rulesKey(ROOT_C, 'default'), DEFAULT_RULES],
      ]),
    })
    const group = screen.getByTestId('prg9g-group-proj-c')
    expect(group).toBeInTheDocument()
    expect(screen.getByTestId('prg9g-head-proj-c')).toBeInTheDocument()
    // 零活跃行的诚实计数：不是特殊隐藏，是如实显示 0
    expect(screen.getByTestId('prg9g-n-proj-c').textContent).toBe('0')
    const toggle = within(group).getByTestId('prg9-fold-toggle-proj-c')
    expect(toggle.textContent).toContain('2 个已归档')
    fireEvent.click(toggle)
    expect(screen.getByTestId('prg9-archived-row-gone-1')).toBeInTheDocument()
    expect(screen.getByTestId('prg9-archived-row-gone-2')).toBeInTheDocument()
  })

  it('单项目语境（currentRoot=全归档 root）：归档折叠区同样可见（防回归——第一层修复已足够，无需本层改动）', async () => {
    renderView({
      snapshot: makeSnapshot([
        makeProject(ROOT_C, [makeChange('gone-1', 'archive', { archived: 'true' })]),
      ]),
      rulesByKey: new Map<string, WorkflowRules>([[rulesKey(ROOT_C, 'default'), DEFAULT_RULES]]),
      currentRoot: ROOT_C,
    })
    expect(document.querySelector('[data-testid^="prg9g-head-"]')).toBeNull()
    const toggle = screen.getByTestId('prg9-fold-toggle-proj-c')
    fireEvent.click(toggle)
    expect(screen.getByTestId('prg9-archived-row-gone-1')).toBeInTheDocument()
    // 单 root fixture：冲掉并发上限探测请求落地（不冲会刷 act 告警）
    await act(async () => {})
  })
})

// ── v9-H：状态 sheet 页签（demo .deck-tabs/applyDeckFilter/updateDeckCounts 对位）——
//    默认全部；计数=各分类总数不随筛选变；分类口径=五态同源谓词（need=gate/failed 含
//    cancelled 不单列；run=running 态含 scheduled 折叠；queue=queued 态）；筛选后空组隐藏。──
describe('ProgressView 状态 sheet 页签（v9-H：默认全部/计数=分类总数/筛选联动空组隐藏）', () => {
  it('默认「全部」选中；四页签计数=分类总数（全部 6 / 等你动手 3 / 运行中 1 / 等待中 1）', () => {
    renderView()
    const all = screen.getByTestId('prg9t-tab-all')
    expect(all.getAttribute('aria-selected')).toBe('true')
    expect(all.textContent).toContain('全部')
    expect(all.querySelector('.prg9t-n')?.textContent).toBe('6')
    expect(screen.getByTestId('prg9t-tab-need').getAttribute('aria-selected')).toBe('false')
    expect(screen.getByTestId('prg9t-tab-need').querySelector('.prg9t-n')?.textContent).toBe('3')
    expect(screen.getByTestId('prg9t-tab-run').querySelector('.prg9t-n')?.textContent).toBe('1')
    expect(screen.getByTestId('prg9t-tab-queue').querySelector('.prg9t-n')?.textContent).toBe('1')
  })

  it('切「运行中」：只剩 running 行；无 running 行的项目组整组隐藏（组头不出）；组头件数=可见数；页签计数不随筛选变', () => {
    renderView()
    fireEvent.click(screen.getByTestId('prg9t-tab-run'))
    expect(screen.getByTestId('prg9t-tab-run').getAttribute('aria-selected')).toBe('true')
    expect(screen.getByTestId('prg9-row-afk-demo')).toBeInTheDocument()
    for (const name of ['gate-demo', 'hotfix-login', 'triage-demo', 'board-demo', 'changelog-cn']) {
      expect(screen.queryByTestId(`prg9-row-${name}`)).toBeNull()
    }
    // proj-b 无 running 行 → 空组隐藏（组头与组容器一并不出）
    expect(screen.queryByTestId('prg9g-head-proj-b')).toBeNull()
    expect(screen.queryByTestId('prg9g-group-proj-b')).toBeNull()
    expect(screen.getByTestId('prg9g-n-proj-a').textContent).toBe('1')
    // 页签计数=分类总数，不随当前筛选变（demo updateDeckCounts 口径）
    expect(screen.getByTestId('prg9t-tab-all').querySelector('.prg9t-n')?.textContent).toBe('6')
    expect(screen.getByTestId('prg9t-tab-need').querySelector('.prg9t-n')?.textContent).toBe('3')
  })

  it('「等你动手」=gate+failed（失败/取消归 need 不单列）；「等待中」=queued；切回「全部」还原 6 行', () => {
    renderView()
    fireEvent.click(screen.getByTestId('prg9t-tab-need'))
    for (const name of ['changelog-cn', 'gate-demo', 'hotfix-login']) {
      expect(screen.getByTestId(`prg9-row-${name}`)).toBeInTheDocument()
    }
    expect(screen.queryByTestId('prg9-row-afk-demo')).toBeNull()
    expect(screen.queryByTestId('prg9-row-board-demo')).toBeNull()
    fireEvent.click(screen.getByTestId('prg9t-tab-queue'))
    expect(screen.getByTestId('prg9-row-board-demo')).toBeInTheDocument()
    expect(screen.queryByTestId('prg9-row-changelog-cn')).toBeNull()
    fireEvent.click(screen.getByTestId('prg9t-tab-all'))
    expect(screen.getByTestId('prg9-stack').querySelectorAll('[data-testid^="prg9-row-"]')).toHaveLength(6)
  })

  it('scheduled 折叠进 running 态归「运行中」页签（同源谓词：不在视图层摸 automation 原始字段）', async () => {
    renderView({
      snapshot: makeSnapshot([
        makeProject(ROOT_A, [
          makeChange('sched-demo', 'build', { fields: { automation: 'scheduled' } }),
          makeChange('idle-demo', 'spec', {}),
        ]),
      ]),
    })
    fireEvent.click(screen.getByTestId('prg9t-tab-run'))
    expect(screen.getByTestId('prg9-row-sched-demo')).toBeInTheDocument()
    expect(screen.queryByTestId('prg9-row-idle-demo')).toBeNull()
    expect(screen.getByTestId('prg9t-tab-run').querySelector('.prg9t-n')?.textContent).toBe('1')
    // 单 root fixture：冲掉并发上限探测请求落地（不冲会刷 act 告警）
    await act(async () => {})
  })

  it('空列表不出页签条（空态照旧指向终端）', async () => {
    renderView({ snapshot: makeSnapshot([makeProject(ROOT_A, [])]) })
    expect(screen.queryByTestId('prg9t-tabs')).toBeNull()
    expect(screen.getByTestId('prg-empty')).toBeInTheDocument()
    await act(async () => {})
  })
})

// ── v9-H：项目分组（demo .pgroup/.pg-h 对位）——聚合语境组头=folder 图标+项目名 mono+
//    件数胶囊+右延细线；单项目语境（currentRoot 已选）不显组头，行直挂列表。──
describe('ProgressView 项目分组（v9-H：聚合语境组头/单 root 无组头）', () => {
  it('聚合语境（currentRoot=""）：组头=folder 图标+项目名+件数胶囊+右延细线；行归属正确', () => {
    renderView()
    const head = screen.getByTestId('prg9g-head-proj-a')
    expect(head.querySelector('svg')).not.toBeNull()
    expect(head.textContent).toContain('proj-a')
    expect(head.querySelector('.prg9g-rule')).not.toBeNull()
    expect(screen.getByTestId('prg9g-n-proj-a').textContent).toBe('5')
    expect(screen.getByTestId('prg9g-n-proj-b').textContent).toBe('1')
    const groupA = screen.getByTestId('prg9g-group-proj-a')
    expect(within(groupA).getByTestId('prg9-row-gate-demo')).toBeInTheDocument()
    expect(within(groupA).queryByTestId('prg9-row-changelog-cn')).toBeNull()
  })

  it('单 root 语境（currentRoot 已选）：不显组头，行直挂列表；页签仍在', async () => {
    renderView({ currentRoot: ROOT_A })
    expect(document.querySelector('[data-testid^="prg9g-head-"]')).toBeNull()
    expect(document.querySelector('[data-testid^="prg9g-group-"]')).toBeNull()
    expect(screen.getByTestId('prg9-stack').querySelectorAll('[data-testid^="prg9-row-"]')).toHaveLength(5)
    expect(screen.getByTestId('prg9t-tabs')).toBeInTheDocument()
    // 单 root：冲掉并发上限探测请求落地
    await act(async () => {})
  })
})

// ── v9-H：行标识——workflow 全称 chip（用户口径：不缩写,default 也显示）+ 调度标识
//    （▦ 沙箱=running/queued/failed 三桶,与调度灯同折叠口径；⌨ 终端=其余）。──
describe('ProgressView 行标识（v9-H：workflow 全称 chip + 调度 chip）', () => {
  it('每行 workflow chip 用全称：自定义显名（workflow: release-train），default 也显示（workflow: default）', () => {
    renderView()
    expect(screen.getByTestId('prg9s-wf-changelog-cn').textContent).toBe('workflow: release-train')
    expect(screen.getByTestId('prg9s-wf-gate-demo').textContent).toBe('workflow: default')
    // 全部 6 行都有 wf chip（不因观察行省略）
    expect(document.querySelectorAll('[data-testid^="prg9s-wf-"]')).toHaveLength(6)
  })

  it('调度 chip：running/queued/failed=▦ 沙箱（蓝 tint --sbx）；off/无=⌨ 终端（中性）', () => {
    renderView()
    for (const name of ['afk-demo', 'board-demo', 'hotfix-login']) {
      const chip = screen.getByTestId(`prg9s-sched-${name}`)
      expect(chip.textContent).toContain('沙箱')
      expect(chip.className).toContain('prg9s-schip--sbx')
    }
    for (const name of ['gate-demo', 'triage-demo', 'changelog-cn']) {
      const chip = screen.getByTestId(`prg9s-sched-${name}`)
      expect(chip.textContent).toContain('终端')
      expect(chip.className).not.toContain('prg9s-schip--sbx')
    }
  })

  it('scheduled/conflict 随调度灯同折叠口径归沙箱（running/failed 桶）', async () => {
    renderView({
      snapshot: makeSnapshot([
        makeProject(ROOT_A, [
          makeChange('sched-demo', 'build', { fields: { automation: 'scheduled' } }),
          makeChange('conflict-demo', 'build', { fields: { automation: 'conflict', automation_attempts: '1' } }),
        ]),
      ]),
    })
    expect(screen.getByTestId('prg9s-sched-sched-demo').className).toContain('prg9s-schip--sbx')
    expect(screen.getByTestId('prg9s-sched-conflict-demo').className).toContain('prg9s-schip--sbx')
    await act(async () => {})
  })
})

describe('ProgressView 判定徽章与导语（rowSemantics 自 InboxView 搬运，同源不漂移）', () => {
  it('gate 证据齐 → 绿「✓ 可以放行」+ verify 整句导语 + 行内三轨小证据 chip', () => {
    renderView()
    const badge = screen.getByTestId('prg9-badge-gate-demo')
    expect(badge.textContent).toContain('✓ 可以放行')
    expect(badge.className).toContain('badge--green')
    expect(screen.getByTestId('prg9-lead-gate-demo').textContent).toContain('确认无误就放行')
    for (const field of ['verify_result', 'agent_review_result', 'codex_review_result']) {
      expect(screen.getByTestId(`prg9-ev-gate-demo-${field}`).textContent).toBe(`${field}=pass`)
    }
    // 产物路径 chip（copyable/未产出占位）不进行内小 chip——归抽屉
    expect(screen.queryByTestId('prg9-ev-gate-demo-verification_report')).toBeNull()
  })

  it('自定义门无自动证据 → 红「等你判断」+ lead 点名 workflow；无小证据 chip', () => {
    renderView()
    const badge = screen.getByTestId('prg9-badge-changelog-cn')
    expect(badge.textContent).toContain('等你判断')
    expect(badge.className).toContain('badge--red')
    expect(screen.getByTestId('prg9-lead-changelog-cn').textContent).toContain('release-train')
  })

  it('失败行 → 红「失败 ×3 · 等你决定」+「拷命令回终端接管，或重新排队重跑」导语；running=蓝「{相位}运行中」；排队=中性；等产出点名缺的字段', () => {
    renderView()
    expect(screen.getByTestId('prg9-badge-hotfix-login').textContent).toContain('失败 ×3 · 等你决定')
    expect(screen.getByTestId('prg9-lead-hotfix-login').textContent).toContain('拷命令回终端接管，或重新排队重跑')
    const run = screen.getByTestId('prg9-badge-afk-demo')
    expect(run.textContent).toContain('实现运行中')
    expect(run.className).toContain('prg9-bdg--blue')
    const queued = screen.getByTestId('prg9-badge-board-demo')
    expect(queued.textContent).toContain('排队')
    expect(queued.className).toContain('prg9-bdg--neutral')
    expect(screen.getByTestId('prg9-badge-triage-demo').textContent).toContain('等产出 · 缺 plan')
    expect(screen.getByTestId('prg9-badge-triage-demo')).toHaveAttribute('title', expect.stringContaining('agent 在终端工作'))
    // 观察行无导语
    expect(screen.queryByTestId('prg9-lead-afk-demo')).toBeNull()
    expect(screen.queryByTestId('prg9-lead-board-demo')).toBeNull()
  })

  it('cancelled（人为终止）→ 琥珀「已取消」徽章 + 非故障导语 + cxl 轨；不再出短成因红字', async () => {
    renderView({
      snapshot: makeSnapshot([
        makeProject(ROOT_A, [
          makeChange('cancel-me', 'build', {
            fields: { automation: 'failed', automation_attempts: '1', automation_cause: 'cancelled' },
          }),
        ]),
      ]),
    })
    const badge = screen.getByTestId('prg9-badge-cancel-me')
    expect(badge.textContent).toContain('已取消')
    expect(badge.className).toContain('prg9-bdg--amb')
    expect(screen.getByTestId('prg9-lead-cancel-me').textContent).toContain('非故障')
    expect(screen.getByTestId('prg9-rail-cancel-me')).toHaveAttribute('data-mode', 'cxl')
    expect(screen.queryByTestId('prg9-cause-cancel-me')).toBeNull()
    // 真机验收 G：人为终止=土色（琥珀）框——tone 修饰 --need-cxl，不落 --need-fail 红框
    const rowCls = screen.getByTestId('prg9-row-cancel-me').className
    expect(rowCls).toContain('prg9-row--need')
    expect(rowCls).toContain('prg9-row--need-cxl')
    expect(rowCls).not.toContain('prg9-row--need-fail')
    // 单 root fixture：冲掉并发上限探测请求落地（不冲会刷 act 告警）
    await act(async () => {})
  })
})

describe('ProgressView 列车轨（PhaseRail 集成：相位来自各行 workflow 真实 steps）', () => {
  it('default 七相：7 段、gate 模式当前段红闸、aria 含相位名', () => {
    renderView()
    const rail = screen.getByTestId('prg9-rail-gate-demo')
    const phs = rail.querySelectorAll('.rl-ph')
    expect(phs).toHaveLength(7)
    expect(phs[3]!.className).toContain('rl-ph--done')
    expect(phs[4]!.className).toContain('rl-ph--gate')
    expect(phs[5]!.className).toContain('rl-ph--todo')
    expect(rail).toHaveAttribute('data-mode', 'gate')
    expect(rail.getAttribute('aria-label')).toContain('验证')
    expect(rail.getAttribute('aria-label')).toContain('复核门')
  })

  it('自定义 workflow：3 段、段名走用户 label（不泄露 step id）', () => {
    renderView()
    const rail = screen.getByTestId('prg9-rail-changelog-cn')
    expect(rail.querySelectorAll('.rl-ph')).toHaveLength(3)
    const names = Array.from(rail.querySelectorAll('.rl-name')).map((el) => el.textContent)
    expect(names).toEqual(['起草', '人工复核', '发布'])
    expect(rail.textContent).not.toContain('draft')
    expect(rail.textContent).not.toContain('review')
  })

  it('运行=run 轨（唯一带流光门控的 data-mode）；失败=fail 断轨；排队=queue 幽灵轨', () => {
    renderView()
    const run = screen.getByTestId('prg9-rail-afk-demo')
    expect(run).toHaveAttribute('data-mode', 'run')
    expect(run.querySelectorAll('.rl-ph')[3]!.className).toContain('rl-ph--cur')
    const fail = screen.getByTestId('prg9-rail-hotfix-login')
    expect(fail).toHaveAttribute('data-mode', 'fail')
    expect(fail.querySelectorAll('.rl-ph')[3]!.className).toContain('rl-ph--fail')
    const queue = screen.getByTestId('prg9-rail-board-demo')
    expect(queue).toHaveAttribute('data-mode', 'queue')
    expect(queue.querySelectorAll('.rl-ph')[0]!.className).toContain('rl-ph--queue')
    // 等产出=idle：列车头停靠但无 run 门控（观察行安静）
    expect(screen.getByTestId('prg9-rail-triage-demo')).toHaveAttribute('data-mode', 'idle')
  })

  it('rules 缺失 → 单相退化轨（G17 底线：卡不消失）', async () => {
    renderView({
      snapshot: makeSnapshot([
        makeProject(ROOT_A, [makeChange('x-demo', 'polish', { fields: { workflow: 'wf-unknown' } })]),
      ]),
      rulesByKey: new Map(),
    })
    const rail = screen.getByTestId('prg9-rail-x-demo')
    expect(rail.querySelectorAll('.rl-ph')).toHaveLength(1)
    expect(rail.querySelectorAll('.rl-ph')[0]!.className).toContain('rl-ph--cur')
    await act(async () => {})
  })
})

describe('ProgressView 行内动作：放行/打回 = transition 管线', () => {
  it('gate 行放行钮带目标相位（放行进入 交付）→ POST transition（verify-pass）+ 乐观推进 + toast + onRefresh', async () => {
    const { onToast, onRefresh } = renderView()
    const pass = screen.getByTestId('prg9-pass-gate-demo')
    expect(pass.textContent).toContain('放行进入 交付')
    expect(pass.className).toContain('prg9-btn--go')
    fireEvent.click(pass)
    await waitFor(() => {
      expect(fetchLog.some((l) => l.startsWith('POST /api/change/gate-demo/transition') && l.includes('"event":"verify-pass"') && l.includes(ROOT_A))).toBe(true)
    })
    // 乐观更新：phase verify→ship，行离开「等你确认」变观察行（不等 SSE 快照）
    await waitFor(() => {
      expect(screen.getByTestId('prg9-badge-gate-demo').textContent).toContain('等产出')
    })
    expect(screen.getByTestId('prg9-row-gate-demo').className).not.toContain('prg9-row--need')
    await waitFor(() => expect(onRefresh).toHaveBeenCalled())
    expect(onToast).toHaveBeenCalledWith(expect.stringContaining('已提交'))
  })

  it('gate 行打回 → POST transition（verify-fail 回退边）+ 乐观回退', async () => {
    renderView()
    fireEvent.click(screen.getByTestId('prg9-reject-gate-demo'))
    await waitFor(() => {
      expect(fetchLog.some((l) => l.startsWith('POST /api/change/gate-demo/transition') && l.includes('"event":"verify-fail"'))).toBe(true)
    })
    await waitFor(() => {
      // 乐观 phase→build：badge 离开「可以放行」
      expect(screen.getByTestId('prg9-badge-gate-demo').textContent).not.toContain('可以放行')
    })
  })

  /** multi-edge fixture 的渲染（评审 P1-1 两用例共用）：单行 multi-demo 停在 review 复核门。 */
  function renderMultiEdge(): ReturnType<typeof renderView> {
    return renderView({
      snapshot: makeSnapshot([
        makeProject(ROOT_A, [makeChange('multi-demo', 'review', { fields: { workflow: 'multi-edge' } })]),
      ]),
      rulesByKey: new Map([[rulesKey(ROOT_A, 'multi-edge'), MULTI_EDGE_RULES]]),
    })
  }

  it('2+ 条同向出边一条不落（评审 P1-1）：首选前进边带目标相位，第 2 条以事件名可点、POST 事件正确', async () => {
    renderMultiEdge()
    // 首选前进边保持「放行进入 {目标相位}」；第 2 条前进边以事件名呈现，同为绿实底 --go
    expect(screen.getByTestId('prg9-pass-multi-demo').textContent).toContain('放行进入 发布')
    const second = screen.getByTestId('prg9-fw-fast-track-multi-demo')
    expect(second.textContent).toContain('fast-track')
    expect(second.className).toContain('prg9-btn--go')
    // 回退边带目标相位（inbox.act_backward——多回退边才分辨得出去处）
    expect(screen.getByTestId('prg9-reject-multi-demo').textContent).toContain('分诊')
    fireEvent.click(second)
    await waitFor(() => {
      expect(fetchLog.some((l) => l.startsWith('POST /api/change/multi-demo/transition') && l.includes('"event":"fast-track"'))).toBe(true)
    })
  })

  it('抽屉动作与行内同组（dw- 前缀）：第 2 条前进边同样可点且事件名正确', async () => {
    renderMultiEdge()
    await openDrawer('multi-demo')
    const second = screen.getByTestId('prg9-dw-fw-fast-track-multi-demo')
    expect(second.textContent).toContain('fast-track')
    fireEvent.click(second)
    await waitFor(() => {
      expect(fetchLog.some((l) => l.startsWith('POST /api/change/multi-demo/transition') && l.includes('"event":"fast-track"'))).toBe(true)
    })
  })

  it('transition 失败 → 失败 toast（透传 server error）+ 乐观更新回滚 + 不触发 onRefresh', async () => {
    actionResponse = { match: /\/transition$/, status: 400, body: { ok: false, error: 'guard 拒绝：verification_report 未产出' } }
    const { onToast, onRefresh } = renderView()
    fireEvent.click(screen.getByTestId('prg9-pass-gate-demo'))
    await waitFor(() => {
      expect(onToast).toHaveBeenCalledWith(expect.stringContaining('guard 拒绝'))
    })
    expect(screen.getByTestId('prg9-badge-gate-demo').textContent).toContain('✓ 可以放行')
    expect(onRefresh).not.toHaveBeenCalled()
  })
})

describe('ProgressView 行内动作：终止 = afk 端点（重试/放弃已回终端，见下一组）', () => {
  it('终止（running 行）→ POST /api/afk/:name/cancel（body 带 root）+ toast', async () => {
    const { onToast, onRefresh } = renderView()
    fireEvent.click(screen.getByTestId('prg9-kill-afk-demo'))
    await waitFor(() => {
      expect(fetchLog.some((l) => l.startsWith('POST /api/afk/afk-demo/cancel') && l.includes(ROOT_A))).toBe(true)
    })
    await waitFor(() => expect(onRefresh).toHaveBeenCalled())
    expect(onToast).toHaveBeenCalledWith(expect.stringContaining('已提交'))
  })

  it('终止钮仅 automation===running 可点：scheduled 渲染禁用态（cancel-gate 纪律）', async () => {
    renderView({
      snapshot: makeSnapshot([
        makeProject(ROOT_A, [makeChange('sched-demo', 'build', { fields: { automation: 'scheduled' } })]),
      ]),
    })
    expect(screen.getByTestId('prg9-kill-sched-demo')).toBeDisabled()
    await act(async () => {})
  })

  it('busy 守卫：请求在途时重复点击不再发第二次请求', async () => {
    let release!: () => void
    actionGate = new Promise<void>((res) => {
      release = res
    })
    renderView()
    fireEvent.click(screen.getByTestId('prg9-kill-afk-demo'))
    fireEvent.click(screen.getByTestId('prg9-kill-afk-demo'))
    release()
    await waitFor(() => {
      expect(fetchLog.filter((l) => l.includes('/api/afk/afk-demo/cancel')).length).toBe(1)
    })
  })

  it('排队/等产出行无任何行内动作（能力面之外不给按钮）', () => {
    renderView()
    for (const name of ['board-demo', 'triage-demo']) {
      const row = screen.getByTestId(`prg9-row-${name}`)
      // 唯一按钮=行名（开抽屉）
      expect(within(row).getAllByRole('button')).toHaveLength(1)
      expect(screen.queryByTestId(`prg9-pass-${name}`)).toBeNull()
      expect(screen.queryByTestId(`prg9-kill-${name}`)).toBeNull()
      expect(screen.queryByTestId(`prg9-cmd-${name}`)).toBeNull()
    }
  })
})

/**
 * 真机验收 G：「不应该直接在进度上点重试放弃。应该给用户命令,直接在终端连上这个会话进行操作」
 * ——fail/cxl 行的重试/放弃钮退役,改一枚可拷贝终端命令 chip(点击=拷贝+toast,不打任何端点);
 * 抽屉动作条改回终端引导文案(承接面=TaskDetail「自己上手修」命令卡,C 批已做)。
 */
describe('ProgressView 失败/取消行：回终端命令 chip（重试/放弃退役）', () => {
  /** clipboard 桩（沿 TaskDetail.test 姿势）：jsdom 无原生 clipboard。 */
  function stubClipboard(): ReturnType<typeof vi.fn> {
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    return writeText
  }

  it('失败行（无 worktree）→ 无重试/放弃钮；chip=「重跑命令」，点击拷贝 pipeline afk run + toast，不打 afk 端点', async () => {
    const writeText = stubClipboard()
    const { onToast } = renderView()
    expect(screen.queryByTestId('prg9-retry-hotfix-login')).toBeNull()
    expect(screen.queryByTestId('prg9-dismiss-hotfix-login')).toBeNull()
    const chip = screen.getByTestId('prg9-cmd-hotfix-login')
    expect(chip.textContent).toContain('重跑命令')
    expect(chip.textContent).toContain('pipeline afk run hotfix-login')
    // title/aria 带完整命令
    expect(chip.getAttribute('title')).toBe('pipeline afk run hotfix-login')
    expect(chip.getAttribute('aria-label')).toContain('pipeline afk run hotfix-login')
    fireEvent.click(chip)
    expect(writeText).toHaveBeenCalledWith('pipeline afk run hotfix-login')
    await waitFor(() => {
      expect(onToast).toHaveBeenCalledWith(expect.stringContaining('pipeline afk run hotfix-login'))
    })
    // 点击=拷贝而非动作：不发任何 afk 请求
    expect(fetchLog.some((l) => l.includes('/api/afk/hotfix-login/'))).toBe(false)
  })

  it('失败行（有 worktree 现场）→ chip=「在终端接管」，拷贝值走 shellQuote（安全路径裸串；含空格单引号，codex P2-2 同族）', async () => {
    const writeText = stubClipboard()
    renderView({
      snapshot: makeSnapshot([
        makeProject(ROOT_A, [
          makeChange('wt-fail', 'build', {
            fields: { automation: 'failed', automation_attempts: '2', automation_worktree: '/tmp/wt/wt-fail' },
          }),
          makeChange('wt-sp', 'build', {
            fields: { automation: 'failed', automation_attempts: '1', automation_worktree: '/tmp/My Work/wt sp' },
          }),
        ]),
      ]),
    })
    const chip = screen.getByTestId('prg9-cmd-wt-fail')
    expect(chip.textContent).toContain('在终端接管')
    expect(chip.getAttribute('title')).toBe('cd /tmp/wt/wt-fail')
    fireEvent.click(chip)
    expect(writeText).toHaveBeenCalledWith('cd /tmp/wt/wt-fail')
    expect(screen.getByTestId('prg9-cmd-wt-sp').getAttribute('title')).toBe("cd '/tmp/My Work/wt sp'")
    // 单 root fixture：冲掉并发上限探测请求落地（不冲会刷 act 告警）
    await act(async () => {})
  })

  it('取消行（cause=cancelled）→ chip=「重新跑的命令」pipeline afk run（worktree 现场不参与）；无重试/放弃钮', async () => {
    const writeText = stubClipboard()
    renderView({
      snapshot: makeSnapshot([
        makeProject(ROOT_A, [
          makeChange('cancel-me', 'build', {
            fields: {
              automation: 'failed',
              automation_attempts: '1',
              automation_cause: 'cancelled',
              automation_worktree: '/tmp/wt/cancel-me',
            },
          }),
        ]),
      ]),
    })
    expect(screen.queryByTestId('prg9-retry-cancel-me')).toBeNull()
    expect(screen.queryByTestId('prg9-dismiss-cancel-me')).toBeNull()
    const chip = screen.getByTestId('prg9-cmd-cancel-me')
    expect(chip.textContent).toContain('重新跑的命令')
    fireEvent.click(chip)
    expect(writeText).toHaveBeenCalledWith('pipeline afk run cancel-me')
    await act(async () => {})
  })

  it('失败行抽屉：无 dw- 重试/放弃钮、chip 不双挂；动作条=回终端引导文案指向「自己上手修」', async () => {
    renderView()
    await openDrawer('hotfix-login')
    expect(screen.queryByTestId('prg9-dw-retry-hotfix-login')).toBeNull()
    expect(screen.queryByTestId('prg9-dw-dismiss-hotfix-login')).toBeNull()
    expect(screen.queryByTestId('prg9-dw-cmd-hotfix-login')).toBeNull()
    const note = screen.getByTestId('prg9-note-hotfix-login')
    expect(note.textContent).toContain('回终端')
    expect(note.textContent).toContain('自己上手修')
  })

  // ── v9-J：批量预取命中真恢复会话 → chip 优先显示真命令；未命中/查无 → 落回上面几条既有静态
  //    命令断言（不能回归）。sessionLinksResponse 桩挂在 beforeEach（缺省 { links: {} }）。──
  it('v9-J：session-link 批量命中真恢复命令 → chip 显示/拷贝真命令，不是 pipeline afk run 兜底', async () => {
    const writeText = stubClipboard()
    const resumeCmd = 'cd /tmp/wt/hotfix-login && claude --resume abcd-1234'
    sessionLinksResponse = {
      status: 200,
      body: { links: { [`hotfix-login@${ROOT_A}`]: { found: true, platform: 'claude', sessionId: 'abcd-1234', resumeCmd } } },
    }
    renderView()
    const chip = screen.getByTestId('prg9-cmd-hotfix-login')
    await waitFor(() => expect(chip.textContent).toContain(resumeCmd))
    expect(chip.textContent).toContain('恢复会话')
    expect(chip.textContent).not.toContain('pipeline afk run hotfix-login')
    expect(chip.getAttribute('title')).toBe(resumeCmd)
    fireEvent.click(chip)
    expect(writeText).toHaveBeenCalledWith(resumeCmd)
    await act(async () => {})
  })

  it('v9-J：session-link 查无（found:false）→ chip 落回现状静态命令（不能回归）', async () => {
    sessionLinksResponse = {
      status: 200,
      body: { links: { [`hotfix-login@${ROOT_A}`]: { found: false, reason: 'no-session' } } },
    }
    renderView()
    await act(async () => {})
    const chip = screen.getByTestId('prg9-cmd-hotfix-login')
    expect(chip.textContent).toContain('重跑命令')
    expect(chip.textContent).toContain('pipeline afk run hotfix-login')
  })

  it('v9-J：session-links 端点整体失败（非 2xx）→ fail-open，chip 仍落回现状静态命令（不炸视图）', async () => {
    sessionLinksResponse = { status: 500, body: { ok: false } }
    renderView()
    await act(async () => {})
    const chip = screen.getByTestId('prg9-cmd-hotfix-login')
    expect(chip.textContent).toContain('重跑命令')
    expect(chip.textContent).toContain('pipeline afk run hotfix-login')
  })
})

describe('ProgressView 详情抽屉（行名点击右滑；旧行内展开已退役）', () => {
  it('点行名开抽屉：scrim+drawer、TaskDetail timeline 形态、动作与行内同组（dw- 前缀）、滚动锁', async () => {
    renderView()
    await openDrawer('gate-demo')
    expect(screen.getByTestId('prg9-drawer')).toBeInTheDocument()
    expect(screen.getByTestId('prg9-scrim')).toBeInTheDocument()
    expect(screen.getByTestId('task-detail')).toBeInTheDocument()
    expect(screen.getByTestId('prg9-dw-badge').textContent).toContain('✓ 可以放行')
    expect(screen.getByTestId('prg9-dw-pass-gate-demo').textContent).toContain('放行进入 交付')
    expect(screen.getByTestId('prg9-dw-reject-gate-demo')).toBeInTheDocument()
    expect(document.documentElement.classList.contains('prg9-lock')).toBe(true)
  })

  it('抽屉三条退路：Esc / scrim / 关闭钮；关闭解除滚动锁', async () => {
    renderView()
    await openDrawer('gate-demo')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('prg9-drawer')).toBeNull()
    expect(document.documentElement.classList.contains('prg9-lock')).toBe(false)

    await openDrawer('gate-demo')
    fireEvent.click(screen.getByTestId('prg9-scrim'))
    expect(screen.queryByTestId('prg9-drawer')).toBeNull()

    await openDrawer('gate-demo')
    fireEvent.click(screen.getByTestId('detail-close'))
    expect(screen.queryByTestId('prg9-drawer')).toBeNull()
    expect(document.documentElement.classList.contains('prg9-lock')).toBe(false)
  })

  it('running 行抽屉：TaskDetail 之下挂日志区，2.5s 轮询；抽屉关闭即停（组件卸载）', async () => {
    vi.useFakeTimers()
    renderView()
    fireEvent.click(screen.getByTestId('prg9-name-afk-demo'))
    await act(async () => {}) // 冲掉 history + 首拉 log 的微任务
    const drawer = screen.getByTestId('prg9-drawer')
    expect(within(drawer).getByTestId('prg-log-afk-demo')).toBeInTheDocument()
    expect(screen.getByTestId('prg-logtext-afk-demo').textContent).toContain('line 1')
    await act(async () => {
      vi.advanceTimersByTime(AFK_LOG_POLL_INTERVAL_MS)
    })
    await act(async () => {})
    expect(screen.getByTestId('prg-logtext-afk-demo').textContent).toContain('line 2')
    // 关抽屉 → RunLogPane 卸载 → 不再有新的 log 请求
    fireEvent.keyDown(document, { key: 'Escape' })
    const logCalls = fetchLog.filter((l) => l.includes('/api/afk/afk-demo/log')).length
    await act(async () => {
      vi.advanceTimersByTime(AFK_LOG_POLL_INTERVAL_MS * 3)
    })
    await act(async () => {})
    expect(fetchLog.filter((l) => l.includes('/api/afk/afk-demo/log')).length).toBe(logCalls)
  })

  it('running 行抽屉日志区带「沙箱内阶段」行（automation_current_phase）', async () => {
    renderView()
    await openDrawer('afk-demo')
    const note = screen.getByTestId('prg-sandbox-phase-afk-demo')
    expect(note.textContent).toContain('沙箱内阶段')
    expect(note.textContent).toContain('verify')
  })

  it('非 running 行抽屉无日志区；排队/等产出抽屉动作区=一句说明', async () => {
    renderView()
    await openDrawer('board-demo')
    expect(screen.queryByTestId('prg-log-board-demo')).toBeNull()
    expect(screen.getByTestId('prg9-note-board-demo').textContent).toContain('排队中')
    fireEvent.keyDown(document, { key: 'Escape' })
    await openDrawer('triage-demo')
    const note = screen.getByTestId('prg9-note-triage-demo')
    expect(note.textContent).toContain('plan')
    expect(note.textContent).toContain('在终端让 agent 补齐')
  })

  it('负向：旧行内展开不存在——点行体不出现 TaskDetail，也没有 prg-rowmain/prg-detail 结构', () => {
    renderView()
    fireEvent.click(screen.getByTestId('prg9-row-gate-demo'))
    expect(screen.queryByTestId('task-detail')).toBeNull()
    expect(screen.queryByTestId('prg-rowmain-gate-demo')).toBeNull()
    expect(screen.queryByTestId('prg-detail-gate-demo')).toBeNull()
    expect(document.querySelector('.prg-detail')).toBeNull()
  })
})

/**
 * #3 抽屉焦点陷阱（评审 P3 登记项，无障碍）：打开即焦点移入关闭钮；Tab/Shift+Tab 在抽屉内
 * 可聚焦元素集合里循环；关闭（关闭钮/scrim/Esc，reduced-motion 与 no-preference 两分支）都要把
 * 焦点还给触发它的行名按钮。
 */
describe('ProgressView 抽屉焦点陷阱（#3 无障碍）', () => {
  it('打开抽屉 → 焦点移入抽屉内关闭钮（detail-close）', async () => {
    renderView()
    await openDrawer('gate-demo')
    expect(document.activeElement).toBe(screen.getByTestId('detail-close'))
  })

  it('Tab 循环：在最后一个可聚焦元素上 Tab → 回到第一个；在第一个元素上 Shift+Tab → 到最后一个', async () => {
    renderView()
    await openDrawer('gate-demo')
    const drawerEl = screen.getByTestId('prg9-drawer')
    const focusables = drawerEl.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
    )
    expect(focusables.length).toBeGreaterThan(1)
    const first = focusables[0]!
    const last = focusables[focusables.length - 1]!
    expect(first).toBe(screen.getByTestId('detail-close'))

    last.focus()
    expect(document.activeElement).toBe(last)
    fireEvent.keyDown(drawerEl, { key: 'Tab' })
    expect(document.activeElement).toBe(first)

    first.focus()
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(drawerEl, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('reduce：关闭抽屉（关闭钮，同步卸载）后焦点归还触发它的行名按钮', async () => {
    stubMatchMedia(true)
    renderView()
    const trigger = screen.getByTestId('prg9-name-gate-demo')
    await openDrawer('gate-demo')
    expect(document.activeElement).toBe(screen.getByTestId('detail-close'))
    fireEvent.click(screen.getByTestId('detail-close'))
    expect(screen.queryByTestId('prg9-drawer')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('reduce：Esc 关闭同样归还焦点', async () => {
    stubMatchMedia(true)
    renderView()
    const trigger = screen.getByTestId('prg9-name-gate-demo')
    await openDrawer('gate-demo')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('prg9-drawer')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  // flaky 余量（demo↔生产差异清单 #8 同族）：GSAP 退场补间在高并发/满载环境下比本机单跑慢，
  // waitFor 内部预算放宽到 6000ms 的同时，it() 本身的 vitest 默认 5000ms 测试超时也要跟着放宽
  // （否则外层测试超时会先于内层 waitFor 预算触发，内层放宽形同虚设——本轮曾踩过这个坑）。
  it('no-preference：关闭抽屉（关闭钮，GSAP 退场补间完成后卸载）归还焦点', async () => {
    stubMatchMedia(false)
    renderView()
    const trigger = screen.getByTestId('prg9-name-gate-demo')
    await openDrawer('gate-demo')
    fireEvent.click(screen.getByTestId('detail-close'))
    await waitFor(() => expect(screen.queryByTestId('prg9-drawer')).toBeNull(), { timeout: 6000 })
    expect(document.activeElement).toBe(trigger)
  }, 9000)

  it('no-preference：scrim 点击关闭同样归还焦点（GSAP 退场分支）', async () => {
    stubMatchMedia(false)
    renderView()
    const trigger = screen.getByTestId('prg9-name-gate-demo')
    await openDrawer('gate-demo')
    fireEvent.click(screen.getByTestId('prg9-scrim'))
    await waitFor(() => expect(screen.queryByTestId('prg9-drawer')).toBeNull(), { timeout: 6000 })
    expect(document.activeElement).toBe(trigger)
  }, 9000)
})

describe('ProgressView GSAP 动效（gsap.matchMedia 全包；reduced-motion 守门等强度两分支）', () => {
  it('reduce：行与轨道名直达终态（opacity 1），无入场位移残留；流光门控只落在 running 行（data-mode=run）', () => {
    stubMatchMedia(true)
    renderView()
    for (const name of ['changelog-cn', 'gate-demo', 'afk-demo']) {
      expect(screen.getByTestId(`prg9-row-${name}`).style.opacity).toBe('1')
    }
    const names = screen.getByTestId('prg9-rail-afk-demo').querySelectorAll<HTMLElement>('.rl-name')
    for (const el of Array.from(names)) expect(el.style.opacity).toBe('1')
    // 「流光类不启动」的组件侧一半：CSS 流光选择器只认 [data-mode="run"]（styles.test 钉 reduce
    // 停帧与门控本体），DOM 侧保证观察行绝不落 run 门控。
    expect(screen.getByTestId('prg9-rail-afk-demo')).toHaveAttribute('data-mode', 'run')
    expect(screen.getByTestId('prg9-rail-gate-demo')).toHaveAttribute('data-mode', 'gate')
    expect(screen.getByTestId('prg9-rail-triage-demo')).toHaveAttribute('data-mode', 'idle')
  })

  // flaky 余量（#8）：waitFor 预算 8000ms 必须配一个 ≥ 它的 it() 测试超时（vitest 默认 5000ms
  // 会先于内层 waitFor 触发，放宽 waitFor 不放宽外层等于没放宽——本轮曾在高并发环境撞过）。
  it('no-preference：行入场 stagger + 轨道名浮现后到达同一终态（opacity 1）', async () => {
    stubMatchMedia(false)
    renderView()
    await waitFor(() => {
      for (const name of ['changelog-cn', 'gate-demo', 'board-demo']) {
        expect(screen.getByTestId(`prg9-row-${name}`).style.opacity).toBe('1')
      }
      for (const el of Array.from(screen.getByTestId('prg9-rail-changelog-cn').querySelectorAll<HTMLElement>('.rl-name'))) {
        expect(el.style.opacity).toBe('1')
      }
    }, { timeout: 8000 })
  }, 11000)

  // ── v9-H：状态 sheet 切换的两分支（demo applyDeckFilter 对位）——reduced 直切不编排，
  //    motion 切换后可见行轻入场并以 clearProps 收束到无 inline 残留（或被首屏入场补间以
  //    终态 1 收尾——两个合法终态都不遮行）。──
  it('reduce：切页签直切——被筛行即时消失，可见行直达终态无位移/遮蔽残留', () => {
    stubMatchMedia(true)
    renderView()
    fireEvent.click(screen.getByTestId('prg9t-tab-run'))
    expect(screen.queryByTestId('prg9-row-gate-demo')).toBeNull()
    const st = screen.getByTestId('prg9-row-afk-demo').style
    expect(st.opacity === '' || st.opacity === '1').toBe(true)
    expect(st.visibility === '' || st.visibility === 'inherit').toBe(true)
    fireEvent.click(screen.getByTestId('prg9t-tab-all'))
    expect(screen.getByTestId('prg9-stack').querySelectorAll('[data-testid^="prg9-row-"]')).toHaveLength(6)
  })

  it('no-preference：切页签后可见行入场编排收束到合法终态（opacity ∈ {""(clearProps 自清), "1"}）', async () => {
    stubMatchMedia(false)
    renderView()
    fireEvent.click(screen.getByTestId('prg9t-tab-need'))
    await waitFor(() => {
      for (const name of ['changelog-cn', 'gate-demo', 'hotfix-login']) {
        const st = screen.getByTestId(`prg9-row-${name}`).style
        expect(st.opacity === '' || st.opacity === '1').toBe(true)
        expect(st.visibility === '' || st.visibility === 'inherit').toBe(true)
      }
    }, { timeout: 8000 })
  }, 11000)
})

describe('ProgressView 失败行短成因（W3/F-b 沿用：automation_cause 直判优先，空串回落 regex）', () => {
  const fz = zh.failure as Record<string, string>

  it('失败行有 last_error → 徽章旁短成因（docker 类→「Docker 未运行」）+ title 透传原文', async () => {
    renderView({
      snapshot: makeSnapshot([
        makeProject(ROOT_A, [
          makeChange('dock-fail', 'build', {
            fields: {
              automation: 'failed',
              automation_attempts: '2',
              automation_last_error: 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock',
            },
          }),
        ]),
      ]),
    })
    const cause = screen.getByTestId('prg9-cause-dock-fail')
    expect(cause.textContent).toBe(fz['short_missing-docker'])
    expect(cause.getAttribute('title')).toContain('Docker daemon')
    await act(async () => {})
  })

  it('失败行无 last_error/cause（fixture hotfix-login）→ 不出成因提示，徽章仍带 ×3（不臆造成因）', () => {
    renderView()
    expect(screen.queryByTestId('prg9-cause-hotfix-login')).toBeNull()
    expect(screen.getByTestId('prg9-badge-hotfix-login').textContent).toContain('失败 ×3')
  })

  it('cause=verify-fail（原文 regex 只能 unknown）→「验证未通过」；只有 cause 没原文 → 仍出短成因且 title 不挂', async () => {
    renderView({
      snapshot: makeSnapshot([
        makeProject(ROOT_A, [
          makeChange('vf-fail', 'build', {
            fields: {
              automation: 'failed',
              automation_attempts: '1',
              automation_cause: 'verify-fail',
              automation_last_error: 'verify: 2 failed · auth.test.ts',
            },
          }),
          makeChange('vf-bare', 'build', {
            fields: { automation: 'failed', automation_attempts: '1', automation_cause: 'verify-fail' },
          }),
        ]),
      ]),
    })
    const cause = screen.getByTestId('prg9-cause-vf-fail')
    expect(cause.textContent).toBe(fz['short_verify-fail'])
    expect(cause.getAttribute('title')).toContain('auth.test.ts')
    const bare = screen.getByTestId('prg9-cause-vf-bare')
    expect(bare.textContent).toBe(fz['short_verify-fail'])
    expect(bare.getAttribute('title')).toBeNull()
    await act(async () => {})
  })
})

describe('ProgressView 调度器健康灯（沿现状：范围=沙箱三桶；单 root 才显并发上限）', () => {
  it('有失败 → attention 灯 + 聚合计数文案 + title 讲清统计范围', () => {
    renderView()
    const doctor = screen.getByTestId('prg-doctor')
    expect(doctor.textContent).toContain('沙箱调度:1 执行 · 1 排队 · 1 失败')
    expect(doctor.querySelector('.prg-doctor__d--attention')).not.toBeNull()
    expect(doctor).toHaveAttribute('title', expect.stringContaining('只统计自动化沙箱'))
  })

  it('单 root 语境（currentRoot 指定）→ GET /api/automation 取 max_parallel，灯尾「· 上限 6」', async () => {
    automationSettings = { max_parallel: 6, max_retries: 1, default_opt_in: false, image: '' }
    renderView({ currentRoot: ROOT_A })
    await waitFor(() => {
      expect(fetchLog.some((l) => l.startsWith(`GET /api/automation?root=${encodeURIComponent(ROOT_A)}`))).toBe(true)
    })
    await waitFor(() => {
      expect(screen.getByTestId('prg-doctor').textContent).toContain('· 上限 6')
    })
  })

  it('多 root 聚合不显上限也不发请求；接口失败 fail-open 静默', async () => {
    renderView()
    await act(async () => {})
    expect(screen.getByTestId('prg-doctor').textContent).not.toContain('上限')
    expect(fetchLog.some((l) => l.includes('/api/automation'))).toBe(false)
  })
})

describe('ProgressView 空态', () => {
  it('无在制任务 → prg-empty 指向终端 pipeline init', async () => {
    renderView({ snapshot: makeSnapshot([makeProject(ROOT_A, [])]) })
    expect(screen.getByTestId('prg-empty').textContent).toContain('pipeline init')
    await act(async () => {})
  })
})

/**
 * Bug4（沿用）：乐观 patch 按 change keyed，只清「已在 snapshot 落地（真值达目标，或已离开
 * 施加基线）」的那条，不被无关项目的 SSE 帧整清 → 不回弹。载具改 gate 放行的 phase patch
 * ——retry 的 fields patch 随「重试回终端」退役（真机验收 G），机制本身等强度保留。
 */
describe('ProgressView Bug4：乐观 patch 按 change 落地清除，不被无关帧整清', () => {
  function fixtureAt(phase: string): Snapshot {
    return makeSnapshot([
      makeProject(ROOT_A, [
        makeChange('gate-demo', phase, {
          track: 'backend',
          fields: { verify_result: 'pass', agent_review_result: 'pass', codex_review_result: 'pass' },
        }),
      ]),
      makeProject(ROOT_B, [makeChange('changelog-cn', 'review', { track: 'chat', fields: { workflow: 'release-train' } })]),
    ])
  }
  function viewAt(snapshot: Snapshot): JSX.Element {
    return (
      <I18nProvider>
        <ProgressView snapshot={snapshot} loading={false} error={null} currentRoot="" rulesByKey={makeRules()} onToast={vi.fn()} onRefresh={vi.fn()} />
      </I18nProvider>
    )
  }

  it('放行后无关帧到达 → 未落地 patch 保留（不回弹）；真落地后才清', async () => {
    const { rerender } = render(viewAt(fixtureAt('verify')))
    fireEvent.click(screen.getByTestId('prg9-pass-gate-demo'))
    // 乐观 phase verify→ship：徽章离开「可以放行」变「等产出」
    await waitFor(() => expect(screen.getByTestId('prg9-badge-gate-demo').textContent).toContain('等产出'))

    // 无关帧：新 snapshot 对象，gate-demo 仍停 verify（未反映本次放行）——patch 保留不回弹
    rerender(viewAt(fixtureAt('verify')))
    expect(screen.getByTestId('prg9-badge-gate-demo').textContent).toContain('等产出')
    expect(screen.getByTestId('prg9-badge-gate-demo').textContent).not.toContain('可以放行')

    // 真落地帧：真值 ship → patch 清除；随后回落 verify 的帧如实回显（证明已清）
    rerender(viewAt(fixtureAt('ship')))
    rerender(viewAt(fixtureAt('verify')))
    expect(screen.getByTestId('prg9-badge-gate-demo').textContent).toContain('可以放行')
  })
})
