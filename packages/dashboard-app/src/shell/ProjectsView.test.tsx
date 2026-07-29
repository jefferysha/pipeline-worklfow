import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { I18nProvider } from '../i18n'
import { ProjectsView } from './ProjectsView'
import { DEFAULT_RULES, rulesKey, type WorkflowRules } from '../model/workflowModel'
import { makeChange, makeProject, makeSnapshot } from '../testkit'

beforeEach(() => {
  localStorage.clear()
})

// default workflow 的 gate 判定需 rulesByKey 命中 DEFAULT_RULES（否则 verify 门被判 agent，
// 「需你动手」恒 0）——测试按真实消费口径喂规则，与 App 的 useWorkflowRulesMulti 一致。
function rulesFor(...roots: string[]): ReadonlyMap<string, WorkflowRules> {
  return new Map(roots.map((r) => [rulesKey(r, 'default'), DEFAULT_RULES]))
}

const EVIDENCE_OK = { verify_result: 'pass', agent_review_result: 'pass', codex_review_result: 'pass' }

function renderView(over: Partial<Parameters<typeof ProjectsView>[0]> = {}) {
  const snapshot =
    over.snapshot ??
    makeSnapshot([
      // repo-a：一条证据齐的 verify 门（need=1）+ 一条 running（running=1）→ 归「需要你动手」分区。
      makeProject('/code/repo-a', [
        makeChange('c-gate', 'verify', { fields: { ...EVIDENCE_OK } }),
        makeChange('c-run', 'build', { fields: { automation: 'running' } }),
      ]),
      // repo-b：一条 open（need=0）→ 归「其余」分区。
      makeProject('/code/repo-b', [makeChange('b-open', 'open')]),
    ])
  const props = {
    snapshot,
    rulesByKey: over.rulesByKey ?? rulesFor('/code/repo-a', '/code/repo-b'),
    onOpenProject: over.onOpenProject ?? vi.fn(),
  }
  render(
    <I18nProvider>
      <ProjectsView {...props} />
    </I18nProvider>,
  )
  return props
}

describe('ProjectsView 紧凑列表（v10 重设计：按需关注排序）', () => {
  it('渲染 projects-view + 每项目一行（testid=project-row-{basename}）', () => {
    renderView()
    expect(screen.getByTestId('projects-view')).toHaveAttribute('data-page-frame', 'standard')
    expect(screen.getByTestId('project-row-repo-a')).toBeInTheDocument()
    expect(screen.getByTestId('project-row-repo-b')).toBeInTheDocument()
  })

  it('行显示项目名（basename，title=全路径、不截断）', () => {
    renderView()
    const row = screen.getByTestId('project-row-repo-a')
    expect(row.textContent).toContain('repo-a')
    expect(within(row).getByTitle('/code/repo-a')).toBeInTheDocument()
  })

  it('同 basename 的电脑端 worktree 显示并朗读唯一 root，且行标识不冲突', () => {
    const firstRoot = '/Users/me/.codex/worktrees/alpha/pipeline-worklfow'
    const secondRoot = '/Users/me/.codex/worktrees/beta/pipeline-worklfow'
    renderView({
      snapshot: makeSnapshot([
        makeProject(firstRoot, [makeChange('alpha-change', 'build')]),
        makeProject(secondRoot, [makeChange('beta-change', 'build')]),
      ]),
      rulesByKey: rulesFor(firstRoot, secondRoot),
    })

    const first = screen.getByRole('button', {
      name: `打开项目 pipeline-worklfow（${firstRoot}）的进度`,
    })
    const second = screen.getByRole('button', {
      name: `打开项目 pipeline-worklfow（${secondRoot}）的进度`,
    })
    expect(within(first).getByText(firstRoot)).toBeInTheDocument()
    expect(within(second).getByText(secondRoot)).toBeInTheDocument()
    expect(first.dataset.testid).not.toBe(second.dataset.testid)
  })

  it('顶部摘要 count_summary：{n} 个项目 · {need} 个需你动手（repo-a 需动手、repo-b 不需 → 2 项/1 需）', () => {
    renderView()
    const summary = screen.getByTestId('projects-summary')
    expect(summary.textContent).toContain('2')
    expect(summary.textContent).toContain('1')
    expect(summary.textContent).toContain('个需你动手')
  })

  it('健康摘要口径：流程中=总数 / 动手=gate+failed / 运行=running（#3a 文案走 stat_wip=「流程中」）', () => {
    renderView()
    const row = screen.getByTestId('project-row-repo-a')
    // repo-a：2 个非归档 change（wip=2）；c-gate 证据齐=gate（need=1）；c-run automation=running（running=1）
    const wip = within(row).getByTestId('project-row-repo-a-stat-wip')
    expect(wip).toHaveAttribute('data-value', '2')
    // #3a：摘要文案走 t('projects.stat_wip')=「流程中」，不再硬编码「在制」
    expect(wip.textContent).toContain('流程中')
    expect(wip.textContent).not.toContain('在制')
    expect(within(row).getByTestId('project-row-repo-a-stat-need')).toHaveAttribute('data-value', '1')
    expect(within(row).getByTestId('project-row-repo-a-stat-running')).toHaveAttribute('data-value', '1')
  })

  it('电脑端项目行保留稳定的身份列、完整路径提示与单行摘要', () => {
    renderView()
    const row = screen.getByTestId('project-row-repo-a')
    const name = within(row).getByTitle('/code/repo-a')
    const summary = within(row).getByTestId('project-row-repo-a-summary')

    expect(row).toHaveClass('sm:flex', 'sm:flex-nowrap')
    expect(name).toHaveClass('truncate', 'font-mono')
    expect(name.parentElement).toHaveClass('sm:w-[240px]', 'sm:flex-none')
    expect(summary).toHaveClass('min-w-0', 'flex-wrap', 'sm:flex-nowrap')
  })

  it('need==0 的行不渲染「动手/运行」摘要项（只留在制）', () => {
    renderView()
    const row = screen.getByTestId('project-row-repo-b')
    expect(within(row).getByTestId('project-row-repo-b-stat-wip')).toHaveAttribute('data-value', '1')
    expect(within(row).queryByTestId('project-row-repo-b-stat-need')).toBeNull()
    expect(within(row).queryByTestId('project-row-repo-b-stat-running')).toBeNull()
  })

  it('failed 自动化计入「动手」并把项目顶进「需要你动手」分区', () => {
    const snapshot = makeSnapshot([
      makeProject('/code/repo-f', [makeChange('boom', 'build', { fields: { automation: 'failed' } })]),
    ])
    renderView({ snapshot, rulesByKey: rulesFor('/code/repo-f') })
    const row = screen.getByTestId('project-row-repo-f')
    expect(row).toHaveAttribute('data-need', 'true')
    expect(within(row).getByTestId('project-row-repo-f-stat-need')).toHaveAttribute('data-value', '1')
    expect(within(screen.getByTestId('section-need')).getByTestId('project-row-repo-f')).toBeInTheDocument()
  })

  it('分区：need>0 归 section-need（data-need=true），need==0 归 section-rest（data-need=false）', () => {
    renderView()
    const need = screen.getByTestId('section-need')
    const rest = screen.getByTestId('section-rest')
    expect(within(need).getByTestId('project-row-repo-a')).toBeInTheDocument()
    expect(within(rest).getByTestId('project-row-repo-b')).toBeInTheDocument()
    expect(screen.getByTestId('project-row-repo-a')).toHaveAttribute('data-need', 'true')
    expect(screen.getByTestId('project-row-repo-b')).toHaveAttribute('data-need', 'false')
  })

  it('迷你相位轨：落点相位 data-state=current 且 data-count>0，空相位 todo/done', () => {
    renderView()
    const track = screen.getByTestId('project-row-repo-a-track')
    const node = (phase: string) => track.querySelector(`[data-phase="${phase}"]`)
    // repo-a 有 build(1) 与 verify(1) 两落点
    expect(node('build')).toHaveAttribute('data-state', 'current')
    expect(node('build')).toHaveAttribute('data-count', '1')
    expect(node('verify')).toHaveAttribute('data-state', 'current')
    // open 落在 build 之前且无件 → done；ship 在 verify 之后 → todo
    expect(node('open')).toHaveAttribute('data-state', 'done')
    expect(node('ship')).toHaveAttribute('data-state', 'todo')
    // archive 不入轨（末端终态）
    expect(node('archive')).toBeNull()
  })

  it('迷你轨自解释（#3b）：主信息=「当前 {frontier 相位名}」文字（repo-a→当前 验证、repo-b→当前 立项）', () => {
    renderView()
    // repo-a 最靠后落点 = verify（build 也 current，但 frontier 取更靠后的 verify）→「当前 验证」
    const atA = screen.getByTestId('project-row-repo-a-at')
    expect(atA).toHaveAttribute('data-started', 'true')
    expect(atA.textContent).toBe('当前 验证')
    // repo-b 单条 open → frontier=立项
    expect(screen.getByTestId('project-row-repo-b-at').textContent).toBe('当前 立项')
  })

  it('点行回调 onOpenProject(root)', () => {
    const onOpenProject = vi.fn()
    renderView({ onOpenProject })
    fireEvent.click(screen.getByTestId('project-row-repo-b'))
    expect(onOpenProject).toHaveBeenCalledWith('/code/repo-b')
  })

  it('归档 change 不计入在制/相位轨', () => {
    const snapshot = makeSnapshot([
      makeProject('/code/repo-a', [makeChange('live', 'build'), makeChange('done', 'ship', { archived: 'true' })]),
    ])
    renderView({ snapshot, rulesByKey: rulesFor('/code/repo-a') })
    const row = screen.getByTestId('project-row-repo-a')
    expect(within(row).getByTestId('project-row-repo-a-stat-wip')).toHaveAttribute('data-value', '1')
    const track = screen.getByTestId('project-row-repo-a-track')
    // ship 只有归档件 → 不算落点（todo，count=0）
    expect(track.querySelector('[data-phase="ship"]')).toHaveAttribute('data-count', '0')
  })

  it('空项目（0 change）：迷你轨全 todo、显示「未开始」、在制 0、仍可点', () => {
    const onOpenProject = vi.fn()
    const snapshot = makeSnapshot([makeProject('/code/empty', [])])
    renderView({ snapshot, rulesByKey: rulesFor('/code/empty'), onOpenProject })
    const row = screen.getByTestId('project-row-empty')
    expect(within(row).getByTestId('project-row-empty-stat-wip')).toHaveAttribute('data-value', '0')
    // 无落点 → 主信息「未开始」（data-started=false），而非裸点让人猜
    const at = screen.getByTestId('project-row-empty-at')
    expect(at).toHaveAttribute('data-started', 'false')
    expect(at.textContent).toBe('未开始')
    const track = screen.getByTestId('project-row-empty-track')
    const nodes = track.querySelectorAll('[data-phase]')
    expect(nodes.length).toBeGreaterThan(0)
    for (const node of nodes) {
      expect(node).toHaveAttribute('data-state', 'todo')
    }
    fireEvent.click(row)
    expect(onOpenProject).toHaveBeenCalledWith('/code/empty')
  })
})

describe('ProjectsView 读不到（ok=false）可折叠区', () => {
  it('默认折叠：只见「读不到 N」切换钮，不见项目行；展开后见只读列名（不可点、非 button）', () => {
    const snapshot = makeSnapshot([makeProject('/code/broken', [], { ok: false })])
    renderView({ snapshot, rulesByKey: rulesFor() })
    const section = screen.getByTestId('section-unreachable')
    const toggle = within(section).getByTestId('unreachable-toggle')
    // 折叠态：读不到计数在钮上，行尚未渲染
    expect(toggle.textContent).toContain('读不到')
    expect(toggle.textContent).toContain('1')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('project-row-broken')).toBeNull()
    // 展开
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const row = screen.getByTestId('project-row-broken')
    expect(row).toHaveAttribute('data-ok', 'false')
    expect(row).toHaveAttribute('aria-disabled', 'true')
    expect(row.tagName).not.toBe('BUTTON')
    expect(row.textContent).toContain('broken')
  })

  it('ok=false 项目不进 need/rest 分区', () => {
    const snapshot = makeSnapshot([
      makeProject('/code/live', [makeChange('x', 'open')]),
      makeProject('/code/broken', [], { ok: false }),
    ])
    renderView({ snapshot, rulesByKey: rulesFor('/code/live') })
    expect(screen.getByTestId('section-rest')).toBeInTheDocument()
    // broken 折叠不可见；不在 rest 里
    expect(within(screen.getByTestId('section-rest')).queryByTestId('project-row-broken')).toBeNull()
  })

  it('不可达项目的超长 basename 在窄屏行内截断，不与状态标签重叠', () => {
    const basename = 'this-is-a-very-long-unreachable-project-name-that-must-truncate'
    const root = `/code/${basename}`
    renderView({ snapshot: makeSnapshot([makeProject(root, [], { ok: false })]) })
    fireEvent.click(screen.getByTestId('unreachable-toggle'))
    const label = within(screen.getByTestId(`project-row-${basename}`)).getByTitle(root)
    expect(label).toHaveClass('truncate')
  })
})

describe('ProjectsView 加载态', () => {
  it('snapshot=null → 显示加载文案，不渲染任何行', () => {
    render(
      <I18nProvider>
        <ProjectsView snapshot={null} rulesByKey={new Map()} onOpenProject={vi.fn()} />
      </I18nProvider>,
    )
    expect(screen.getByTestId('projects-view')).toBeInTheDocument()
    expect(screen.queryByTestId('project-row-repo-a')).toBeNull()
  })
})
