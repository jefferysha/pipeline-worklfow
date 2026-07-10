import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { AFK_LOG_POLL_INTERVAL_MS } from '../afk/useAfkLog'
import { DEFAULT_RULES, rulesFromDef, rulesKey, type WorkflowRules } from '../model/workflowModel'
import { makeChange, makeProject, makeSnapshot } from '../testkit'
import type { Snapshot } from '../types'
import { ProgressView } from './ProgressView'

const ROOT_A = '/tmp/proj-a'
const ROOT_B = '/tmp/proj-b'

// T10 fixture：对照 design-demos/v5-progress-workbench.html 进度段的六行剧本——
// 等你确认(gate-demo·verify)/等 agent 补产出(triage-demo·spec 缺 plan)/执行中(afk-demo)/
// 排队(board-demo)/失败(hotfix-login ×3)/自定义 workflow 的复核门(changelog-cn·release-train)，
// 外加 1 条 archived（决议 #5：排除出行、组头尾缀计数）。
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

function makeFixture(): Snapshot {
  return makeSnapshot([
    makeProject(ROOT_A, [
      makeChange('gate-demo', 'verify', {
        track: 'backend',
        fields: { verify_result: 'pass', agent_review_result: 'pass', codex_review_result: 'pass' },
      }),
      makeChange('triage-demo', 'spec', { track: 'chat', fields: { design_doc: 'docs/design.md' } }),
      makeChange('afk-demo', 'build', {
        track: 'chat',
        fields: { automation: 'running', automation_current_phase: 'verify' },
      }),
      makeChange('board-demo', 'open', { track: 'frontend', fields: { automation: 'queued' } }),
      makeChange('hotfix-login', 'build', {
        track: 'backend',
        fields: { automation: 'failed', automation_attempts: '3' },
      }),
      makeChange('old-demo', 'archive', { archived: 'true' }),
    ]),
    makeProject(ROOT_B, [
      makeChange('changelog-cn', 'review', { track: 'chat', fields: { workflow: 'release-train' } }),
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

// ── T11 fetch 桩：history（TaskDetail 挂载即拉）/afk log（RunLogPane 轮询，内容逐拍递增）/
//    动作端点（缺省 200 {ok:true}；actionResponse 可按 URL 正则改写单端点；actionGate 可挂
//    手动结算的闸门制造「在途」窗口，验 busy 守卫）。fetchLog 记录 method+url+body 供断言。──
let fetchLog: string[] = []
let logSeq = 0
let actionResponse: { match: RegExp; status: number; body: unknown } | null = null
let actionGate: Promise<void> | null = null

beforeEach(() => {
  fetchLog = []
  logSeq = 0
  actionResponse = null
  actionGate = null
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
    if (actionGate) await actionGate
    if (actionResponse && actionResponse.match.test(url)) {
      return new Response(JSON.stringify(actionResponse.body), { status: actionResponse.status })
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }) as unknown as typeof fetch
})

/** 点行展开并等 TaskDetail 的 history 拉取落定（不等会刷 act 告警且断言时机不稳，同 TaskDetail.test 先例）。 */
async function expandRow(name: string): Promise<void> {
  fireEvent.click(screen.getByTestId(`prg-rowmain-${name}`))
  await waitFor(() => expect(screen.getByTestId('dt-hist-sec').getAttribute('data-settled')).toBe('true'))
}

/** 可控 matchMedia 桩（同 WorkbenchView.test.tsx 先例）：驱动 gsap.matchMedia 的
 *  reduce / no-preference 两分支——jsdom 原生 matchMedia 恒 false，两个条件都不命中时
 *  GSAP 回调不执行（等价「环境不支持」，静态 DOM 断言不受影响）。 */
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
})

describe('ProgressView 分组（验收①）', () => {
  it('项目×workflow 一组一张卡：组头含项目名/workflow 徽章/阶段与任务计数/归档尾缀', () => {
    renderView()
    const headA = screen.getByTestId('prg-ghead-proj-a-default')
    expect(headA.textContent).toContain('proj-a')
    expect(headA.textContent).toContain('default')
    expect(headA.textContent).toContain('7 阶段 · 5 个任务')
    expect(headA.textContent).toContain('· 1 已归档')
    const headB = screen.getByTestId('prg-ghead-proj-b-release-train')
    expect(headB.textContent).toContain('proj-b')
    expect(headB.textContent).toContain('release-train')
    expect(headB.textContent).toContain('3 阶段 · 1 个任务')
    expect(headB.textContent).not.toContain('已归档')
  })

  it('组头可折叠：aria-expanded 翻转、行区随折叠卸载', () => {
    renderView()
    const head = screen.getByTestId('prg-ghead-proj-a-default')
    expect(head).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('prg-row-gate-demo')).toBeInTheDocument()
    fireEvent.click(head)
    expect(head).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('prg-row-gate-demo')).toBeNull()
    fireEvent.click(head)
    expect(head).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('prg-row-gate-demo')).toBeInTheDocument()
  })

  it('archived 行不出现在任何组里（决议 #5）', () => {
    renderView()
    expect(screen.queryByTestId('prg-row-old-demo')).toBeNull()
  })
})

describe('ProgressView 箭头带（验收③）', () => {
  it('段数=workflow 步数、past/cur/fut 三态类名、aria-label 含「第 N/M」与状态', () => {
    renderView()
    const flow = screen.getByTestId('prg-flow-gate-demo')
    const segs = flow.querySelectorAll('.prg-seg')
    expect(segs).toHaveLength(7)
    for (let i = 0; i < 4; i++) expect(segs[i]!.className).toContain('prg-seg--past')
    expect(segs[4]!.className).toContain('prg-seg--cur')
    expect(segs[5]!.className).toContain('prg-seg--fut')
    expect(segs[6]!.className).toContain('prg-seg--fut')
    const label = flow.getAttribute('aria-label') ?? ''
    expect(label).toContain('第 5 / 7')
    expect(label).toContain('等你确认')
  })

  it('未到达的复核门段带红点类（default：open 行的 explore/spec/verify 三处）', () => {
    renderView()
    const flow = screen.getByTestId('prg-flow-board-demo')
    expect(flow.querySelectorAll('.prg-seg--gate')).toHaveLength(3)
    expect(flow.querySelectorAll('.prg-seg')[0]!.className).toContain('prg-seg--cur')
  })

  it('失败行当前段为 fail 态；执行中行当前段带 run 态与光泽层', () => {
    renderView()
    const fail = screen.getByTestId('prg-flow-hotfix-login')
    expect(fail.querySelectorAll('.prg-seg')[3]!.className).toContain('prg-seg--fail')
    const run = screen.getByTestId('prg-flow-afk-demo')
    const cur = run.querySelectorAll('.prg-seg')[3]!
    expect(cur.className).toContain('prg-seg--run')
    expect(cur.querySelector('.prg-gloss')).not.toBeNull()
  })

  it('自定义 workflow：段数=自定义步数、aria-label 第 2 / 3', () => {
    renderView()
    const flow = screen.getByTestId('prg-flow-changelog-cn')
    expect(flow.querySelectorAll('.prg-seg')).toHaveLength(3)
    expect(flow.getAttribute('aria-label')).toContain('第 2 / 3')
  })
})

describe('ProgressView 行骨架（状态徽章 + 快捷钮占位）', () => {
  it('行含名字与 track 徽章；五态徽章文案各就其位', () => {
    renderView()
    const row = screen.getByTestId('prg-row-gate-demo')
    expect(within(row).getByText('gate-demo')).toBeInTheDocument()
    expect(within(row).getByText('backend')).toBeInTheDocument()
    expect(screen.getByTestId('prg-badge-gate-demo').textContent).toContain('等你确认')
    expect(screen.getByTestId('prg-badge-triage-demo').textContent).toContain('等 agent · 补产出 plan')
    expect(screen.getByTestId('prg-badge-afk-demo').textContent).toContain('执行中')
    expect(screen.getByTestId('prg-badge-board-demo').textContent).toContain('排队')
    expect(screen.getByTestId('prg-badge-hotfix-login').textContent).toContain('失败 ×3')
  })

  it('执行中行有终止钮、失败行有重试钮；其余状态行不渲染快捷钮（端点接线断言见 T11 组）', () => {
    renderView()
    expect(screen.getByTestId('prg-kill-afk-demo')).toBeInTheDocument()
    expect(screen.getByTestId('prg-retry-hotfix-login')).toBeInTheDocument()
    expect(screen.queryByTestId('prg-kill-gate-demo')).toBeNull()
    expect(screen.queryByTestId('prg-retry-board-demo')).toBeNull()
  })
})

describe('ProgressView 行展开详情（T11 验收①）', () => {
  it('点行展开阶段 sheet（TaskDetail tabs 形态）：aria-expanded 翻转、当前阶段 tab 高亮；再点收起', async () => {
    renderView()
    const main = screen.getByTestId('prg-rowmain-gate-demo')
    expect(main).toHaveAttribute('aria-expanded', 'false')
    await expandRow('gate-demo')
    expect(main).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('prg-detail-gate-demo')).toBeInTheDocument()
    expect(screen.getByTestId('task-detail')).toBeInTheDocument()
    // 形态 B（tabs）：verify 是当前阶段 tab，pane 跟随
    expect(screen.getByTestId('dt-tab-verify').className).toContain('dt-tab--cur')
    expect(screen.getByTestId('dt-pane-verify')).not.toHaveAttribute('hidden')
    fireEvent.click(main)
    expect(main).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('task-detail')).toBeNull()
  })

  it('Enter / Space 键盘展开与收起', async () => {
    renderView()
    const main = screen.getByTestId('prg-rowmain-gate-demo')
    fireEvent.keyDown(main, { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId('task-detail')).toBeInTheDocument())
    fireEvent.keyDown(main, { key: ' ' })
    expect(screen.queryByTestId('task-detail')).toBeNull()
  })

  it('点击行内快捷钮不触发展开（按钮点击≠行点击）', async () => {
    const { onRefresh } = renderView()
    fireEvent.click(screen.getByTestId('prg-kill-afk-demo'))
    expect(screen.queryByTestId('task-detail')).toBeNull()
    expect(screen.getByTestId('prg-rowmain-afk-demo')).toHaveAttribute('aria-expanded', 'false')
    // 等在途 cancel 结算（busy 释放的 setState 落在用例结束后会刷 act 告警）
    await waitFor(() => expect(onRefresh).toHaveBeenCalled())
  })
})

describe('ProgressView 动作接线：放行/打回 = transition（T11 验收②）', () => {
  it('gate 行放行 → POST transition（event=verify-pass）+ 乐观推进箭头带 + toast + onRefresh', async () => {
    const { onToast, onRefresh } = renderView()
    await expandRow('gate-demo')
    fireEvent.click(screen.getByTestId('prg-pass-gate-demo'))
    await waitFor(() => {
      expect(fetchLog.some((l) => l.startsWith('POST /api/change/gate-demo/transition') && l.includes('"event":"verify-pass"') && l.includes(ROOT_A))).toBe(true)
    })
    // 乐观更新：phase verify→ship（第 6 / 7），不等 SSE 快照
    await waitFor(() => {
      expect(screen.getByTestId('prg-flow-gate-demo').getAttribute('aria-label')).toContain('第 6 / 7')
    })
    await waitFor(() => expect(onRefresh).toHaveBeenCalled())
    expect(onToast).toHaveBeenCalledWith(expect.stringContaining('已提交'))
  })

  it('gate 行打回 → POST transition（event=verify-fail，回退边）+ 乐观回退箭头带', async () => {
    renderView()
    await expandRow('gate-demo')
    fireEvent.click(screen.getByTestId('prg-reject-gate-demo'))
    await waitFor(() => {
      expect(fetchLog.some((l) => l.startsWith('POST /api/change/gate-demo/transition') && l.includes('"event":"verify-fail"'))).toBe(true)
    })
    await waitFor(() => {
      expect(screen.getByTestId('prg-flow-gate-demo').getAttribute('aria-label')).toContain('第 4 / 7')
    })
  })

  it('transition 失败 → 失败 toast（透传 server error）+ 乐观更新回滚 + 不触发 onRefresh', async () => {
    actionResponse = { match: /\/transition$/, status: 400, body: { ok: false, error: 'guard 拒绝：verification_report 未产出' } }
    const { onToast, onRefresh } = renderView()
    await expandRow('gate-demo')
    fireEvent.click(screen.getByTestId('prg-pass-gate-demo'))
    await waitFor(() => {
      expect(onToast).toHaveBeenCalledWith(expect.stringContaining('guard 拒绝'))
    })
    expect(screen.getByTestId('prg-flow-gate-demo').getAttribute('aria-label')).toContain('第 5 / 7')
    expect(onRefresh).not.toHaveBeenCalled()
  })
})

describe('ProgressView 动作接线：终止/重试/放弃 = afk 端点（T11 验收②）', () => {
  it('终止（行内快捷钮）→ POST /api/afk/:name/cancel（body 带 root）+ toast', async () => {
    const { onToast, onRefresh } = renderView()
    fireEvent.click(screen.getByTestId('prg-kill-afk-demo'))
    await waitFor(() => {
      expect(fetchLog.some((l) => l.startsWith('POST /api/afk/afk-demo/cancel') && l.includes(ROOT_A))).toBe(true)
    })
    await waitFor(() => expect(onRefresh).toHaveBeenCalled())
    expect(onToast).toHaveBeenCalledWith(expect.stringContaining('已提交'))
  })

  it('终止钮仅 automation===running 可点：scheduled（同归执行中泳道）渲染禁用态（cancel-gate 纪律）', () => {
    renderView({
      snapshot: makeSnapshot([
        makeProject(ROOT_A, [makeChange('sched-demo', 'build', { fields: { automation: 'scheduled' } })]),
      ]),
    })
    expect(screen.getByTestId('prg-kill-sched-demo')).toBeDisabled()
  })

  it('重试（失败行）→ POST /api/afk/:name/retry + 乐观更新徽章「排队」', async () => {
    renderView()
    fireEvent.click(screen.getByTestId('prg-retry-hotfix-login'))
    await waitFor(() => {
      expect(fetchLog.some((l) => l.startsWith('POST /api/afk/hotfix-login/retry') && l.includes(ROOT_A))).toBe(true)
    })
    await waitFor(() => {
      expect(screen.getByTestId('prg-badge-hotfix-login').textContent).toContain('排队')
    })
  })

  it('放弃（失败行详情）→ POST /api/afk/:name/dismiss + 乐观退出失败态（automation=off）', async () => {
    renderView()
    await expandRow('hotfix-login')
    fireEvent.click(screen.getByTestId('prg-dismiss-hotfix-login'))
    await waitFor(() => {
      expect(fetchLog.some((l) => l.startsWith('POST /api/afk/hotfix-login/dismiss') && l.includes(ROOT_A))).toBe(true)
    })
    await waitFor(() => {
      expect(screen.getByTestId('prg-badge-hotfix-login').textContent).not.toContain('失败')
    })
  })

  it('放弃失败（CAS 落空）→ 失败 toast + 徽章回滚为「失败 ×3」', async () => {
    actionResponse = { match: /\/dismiss$/, status: 400, body: { ok: false, error: 'CAS 失败，状态在此期间被并发修改' } }
    const { onToast } = renderView()
    await expandRow('hotfix-login')
    fireEvent.click(screen.getByTestId('prg-dismiss-hotfix-login'))
    await waitFor(() => {
      expect(onToast).toHaveBeenCalledWith(expect.stringContaining('CAS 失败'))
    })
    expect(screen.getByTestId('prg-badge-hotfix-login').textContent).toContain('失败 ×3')
  })

  it('busy 守卫：请求在途时重复点击不再发第二次请求', async () => {
    let release!: () => void
    actionGate = new Promise<void>((res) => {
      release = res
    })
    renderView()
    fireEvent.click(screen.getByTestId('prg-kill-afk-demo'))
    fireEvent.click(screen.getByTestId('prg-kill-afk-demo'))
    release()
    await waitFor(() => {
      expect(fetchLog.filter((l) => l.includes('/api/afk/afk-demo/cancel')).length).toBe(1)
    })
  })
})

describe('ProgressView running 行详情：日志区 + 沙箱内阶段（T11 验收③④）', () => {
  it('展开执行中行 → 日志区渲染，2.5s 轮询两拍内容变化；关掉跟随后不再轮询', async () => {
    vi.useFakeTimers()
    renderView()
    fireEvent.click(screen.getByTestId('prg-rowmain-afk-demo'))
    await act(async () => {}) // 冲掉 history + 首拉 log 的微任务
    expect(screen.getByTestId('prg-logtext-afk-demo').textContent).toContain('line 1')
    await act(async () => {
      vi.advanceTimersByTime(AFK_LOG_POLL_INTERVAL_MS)
    })
    await act(async () => {})
    expect(screen.getByTestId('prg-logtext-afk-demo').textContent).toContain('line 2')
    // 关掉跟随 → 轮询停（内容停在 line 2）
    fireEvent.click(screen.getByTestId('prg-follow-afk-demo'))
    expect(screen.getByTestId('prg-follow-afk-demo')).toHaveAttribute('aria-checked', 'false')
    await act(async () => {
      vi.advanceTimersByTime(AFK_LOG_POLL_INTERVAL_MS * 3)
    })
    await act(async () => {})
    expect(screen.getByTestId('prg-logtext-afk-demo').textContent).toContain('line 2')
  })

  it('沙箱内阶段行：渲染 automation_current_phase（T4 字段）', async () => {
    renderView()
    await expandRow('afk-demo')
    const note = screen.getByTestId('prg-sandbox-phase-afk-demo')
    expect(note.textContent).toContain('沙箱内阶段')
    expect(note.textContent).toContain('verify')
  })

  it('非 running 行（gate）详情内无日志区', async () => {
    renderView()
    await expandRow('gate-demo')
    expect(screen.queryByTestId('prg-log-gate-demo')).toBeNull()
  })
})

describe('ProgressView 等 agent / 排队行：无动作只有说明（T11 验收）', () => {
  it('等 agent 行详情：说明点名欠的产出 +「在终端继续」，无任何动作按钮', async () => {
    renderView()
    await expandRow('triage-demo')
    const note = screen.getByTestId('prg-note-triage-demo')
    expect(note.textContent).toContain('plan')
    expect(note.textContent).toContain('在终端继续')
    for (const tid of ['prg-pass-triage-demo', 'prg-reject-triage-demo', 'prg-dismiss-triage-demo', 'prg-dt-retry-triage-demo', 'prg-dt-kill-triage-demo']) {
      expect(screen.queryByTestId(tid)).toBeNull()
    }
  })

  it('排队行详情：说明「排队中，由调度器执行」，无动作按钮', async () => {
    renderView()
    await expandRow('board-demo')
    expect(screen.getByTestId('prg-note-board-demo').textContent).toContain('排队中')
    expect(screen.queryByTestId('prg-pass-board-demo')).toBeNull()
  })
})

describe('ProgressView 筛选条（验收②）', () => {
  it('状态计数 chips：全部+五态各带计数，单选联动过滤，空组隐藏', () => {
    renderView()
    expect(screen.getByTestId('prg-chip-all').textContent).toContain('6')
    expect(screen.getByTestId('prg-chip-gate').textContent).toContain('2')
    expect(screen.getByTestId('prg-chip-agent').textContent).toContain('1')
    expect(screen.getByTestId('prg-chip-running').textContent).toContain('1')
    expect(screen.getByTestId('prg-chip-queued').textContent).toContain('1')
    expect(screen.getByTestId('prg-chip-failed').textContent).toContain('1')
    expect(screen.getByTestId('prg-chip-all')).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByTestId('prg-chip-failed'))
    expect(screen.getByTestId('prg-chip-failed')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('prg-chip-all')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('prg-row-hotfix-login')).toBeInTheDocument()
    expect(screen.queryByTestId('prg-row-gate-demo')).toBeNull()
    // proj-b 组无失败行 → 整组隐藏
    expect(screen.queryByTestId('prg-ghead-proj-b-release-train')).toBeNull()

    // 再点同一 chip = 取消单选回到全部
    fireEvent.click(screen.getByTestId('prg-chip-failed'))
    expect(screen.getByTestId('prg-chip-all')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('prg-row-gate-demo')).toBeInTheDocument()
  })

  it('项目下拉多选（空=全部）+ 清空；与状态 chips 计数联动', () => {
    renderView()
    const btn = screen.getByTestId('prg-proj-btn')
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(screen.getByRole('checkbox', { name: 'proj-b' }))
    expect(screen.queryByTestId('prg-ghead-proj-a-default')).toBeNull()
    expect(screen.getByTestId('prg-ghead-proj-b-release-train')).toBeInTheDocument()
    // chips 计数随项目范围收敛
    expect(screen.getByTestId('prg-chip-all').textContent).toContain('1')
    expect(screen.getByTestId('prg-chip-gate').textContent).toContain('1')

    fireEvent.click(screen.getByTestId('prg-proj-clear'))
    expect(screen.getByTestId('prg-ghead-proj-a-default')).toBeInTheDocument()
    expect(screen.getByTestId('prg-chip-all').textContent).toContain('6')
  })

  it('筛选全空时显示 prg-empty 空态', () => {
    renderView()
    fireEvent.click(screen.getByTestId('prg-proj-btn'))
    fireEvent.click(screen.getByRole('checkbox', { name: 'proj-b' }))
    fireEvent.click(screen.getByTestId('prg-chip-queued'))
    expect(screen.getByTestId('prg-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('prg-ghead-proj-b-release-train')).toBeNull()
  })
})

describe('ProgressView 调度器健康灯（验收④）', () => {
  it('有失败 → attention 灯 + 聚合计数文案「N 执行 N 排队 N 失败」', () => {
    renderView()
    const doctor = screen.getByTestId('prg-doctor')
    expect(doctor.textContent).toContain('1 执行 1 排队 1 失败')
    expect(doctor.querySelector('.prg-doctor__d--attention')).not.toBeNull()
  })

  it('无 automation 活动 → ok 灯，不带计数尾巴', () => {
    renderView({
      snapshot: makeSnapshot([
        makeProject(ROOT_A, [
          makeChange('gate-demo', 'verify', {
            fields: { verify_result: 'pass', agent_review_result: 'pass', codex_review_result: 'pass' },
          }),
        ]),
      ]),
    })
    const doctor = screen.getByTestId('prg-doctor')
    expect(doctor.querySelector('.prg-doctor__d--ok')).not.toBeNull()
    expect(doctor.textContent).not.toContain('执行')
  })
})

describe('ProgressView GSAP 动效（gsap.matchMedia 全包）', () => {
  it('reduced-motion：段直达终态（opacity 1）、光泽层保持透明', () => {
    stubMatchMedia(true)
    renderView()
    const flow = screen.getByTestId('prg-flow-afk-demo')
    const seg = flow.querySelector<HTMLElement>('.prg-seg')!
    expect(seg.style.opacity).toBe('1')
    const gloss = flow.querySelector<HTMLElement>('.prg-gloss')!
    expect(gloss.style.opacity).toBe('0')
  })

  it('no-preference：入场 stagger 后段到达终态 opacity 1', async () => {
    stubMatchMedia(false)
    renderView()
    const flow = screen.getByTestId('prg-flow-changelog-cn')
    await waitFor(() => {
      for (const seg of Array.from(flow.querySelectorAll<HTMLElement>('.prg-seg'))) {
        expect(seg.style.opacity).toBe('1')
      }
    }, { timeout: 4000 })
  })
})
