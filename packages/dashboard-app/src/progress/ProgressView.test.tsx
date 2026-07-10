import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
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
      makeChange('afk-demo', 'build', { track: 'chat', fields: { automation: 'running' } }),
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
  const onAction = vi.fn()
  render(
    <I18nProvider>
      <ProgressView
        snapshot={makeFixture()}
        loading={false}
        error={null}
        currentRoot=""
        rulesByKey={makeRules()}
        onAction={onAction}
        {...over}
      />
    </I18nProvider>,
  )
  return { onAction }
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

  it('执行中行有终止钮、失败行有重试钮，点击回调 onAction（T11 接线契约）', () => {
    const { onAction } = renderView()
    fireEvent.click(screen.getByTestId('prg-kill-afk-demo'))
    expect(onAction).toHaveBeenCalledWith('kill', ROOT_A, 'afk-demo')
    fireEvent.click(screen.getByTestId('prg-retry-hotfix-login'))
    expect(onAction).toHaveBeenCalledWith('retry', ROOT_A, 'hotfix-login')
    // 其余状态行不渲染快捷钮
    expect(screen.queryByTestId('prg-kill-gate-demo')).toBeNull()
    expect(screen.queryByTestId('prg-retry-board-demo')).toBeNull()
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
