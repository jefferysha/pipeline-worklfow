import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import gsap from 'gsap'
import { I18nProvider } from '../i18n'
import { ProjectsView } from './ProjectsView'
import { DEFAULT_RULES, rulesKey, type WorkflowRules } from '../model/workflowModel'
import { makeChange, makeProject, makeSnapshot } from '../testkit'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
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
    const firstRoot = '/Users/me/.codex/worktrees/shared-prefix/alpha/pipeline-worklfow'
    const secondRoot = '/Users/me/.codex/worktrees/shared-prefix/beta/pipeline-worklfow'
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
    expect(within(first).getByText('…/alpha/pipeline-worklfow')).toHaveAttribute('title', firstRoot)
    expect(within(second).getByText('…/beta/pipeline-worklfow')).toHaveAttribute('title', secondRoot)
    expect(first.dataset.testid).not.toBe(second.dataset.testid)
    expect(first.id).toBe(`project-row-${encodeURIComponent(firstRoot)}`)
    expect(second.id).toBe(`project-row-${encodeURIComponent(secondRoot)}`)
    expect(first.id).not.toBe(second.id)
    expect(first.id).not.toMatch(/\s/)
    expect(second.id).not.toMatch(/\s/)
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

describe('ProjectsView 电脑端检索与状态聚焦', () => {
  it('按 basename 或完整 root 片段过滤，并用 live status 说明当前结果', () => {
    renderView()
    const search = screen.getByRole('searchbox', { name: '搜索项目' })
    const searchLabel = document.querySelector('label[for="projects-focus-search"]')

    expect(search).toHaveAttribute('id', 'projects-focus-search')
    expect(searchLabel).toBeInTheDocument()

    fireEvent.change(search, { target: { value: 'REPO-B' } })
    const clearQuery = screen.getByRole('button', { name: '清空项目搜索' })
    expect(searchLabel).not.toContainElement(clearQuery)
    expect(screen.queryByTestId('project-row-repo-a')).toBeNull()
    expect(screen.getByTestId('project-row-repo-b')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: '项目筛选结果' })).toHaveTextContent('全部 · 显示 1 / 2 个项目')

    fireEvent.change(search, { target: { value: 'code/repo-a' } })
    expect(screen.getByTestId('project-row-repo-a')).toBeInTheDocument()
    expect(screen.queryByTestId('project-row-repo-b')).toBeNull()
  })

  it('查询完整 root 时只保留同 basename worktree 的精确匹配身份', () => {
    const firstRoot = '/Users/me/.codex/worktrees/alpha/pipeline-worklfow'
    const secondRoot = '/Users/me/.codex/worktrees/beta/pipeline-worklfow'
    renderView({
      snapshot: makeSnapshot([
        makeProject(firstRoot, [makeChange('alpha', 'open')]),
        makeProject(secondRoot, [makeChange('beta', 'open')]),
      ]),
      rulesByKey: rulesFor(firstRoot, secondRoot),
    })

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索项目' }), { target: { value: '/beta/' } })
    expect(screen.queryByTestId(`project-row-pipeline-worklfow-${encodeURIComponent(firstRoot)}`)).toBeNull()
    expect(screen.getByTestId(`project-row-pipeline-worklfow-${encodeURIComponent(secondRoot)}`)).toBeInTheDocument()
  })

  it('四个状态 badge 保持全局计数，状态与查询共同缩小结果', () => {
    const snapshot = makeSnapshot([
      makeProject('/code/repo-a', [
        makeChange('c-gate', 'verify', { fields: { ...EVIDENCE_OK } }),
        makeChange('c-run', 'build', { fields: { automation: 'running' } }),
      ]),
      makeProject('/code/repo-b', [makeChange('b-open', 'open')]),
      makeProject('/code/broken', [], { ok: false }),
    ])
    renderView({ snapshot, rulesByKey: rulesFor('/code/repo-a', '/code/repo-b') })

    expect(screen.getByTestId('projects-focus-all')).toHaveTextContent('3')
    expect(screen.getByTestId('projects-focus-attention')).toHaveTextContent('1')
    expect(screen.getByTestId('projects-focus-running')).toHaveTextContent('1')
    expect(screen.getByTestId('projects-focus-unreachable')).toHaveTextContent('1')

    fireEvent.click(screen.getByTestId('projects-focus-running'))
    expect(screen.getByRole('status', { name: '项目筛选结果' })).toHaveTextContent('运行中 · 显示 1 / 3 个项目')
    expect(screen.getByTestId('project-row-repo-a')).toBeInTheDocument()
    expect(screen.queryByTestId('project-row-repo-b')).toBeNull()
    expect(screen.queryByTestId('project-row-broken')).toBeNull()

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索项目' }), { target: { value: 'missing' } })
    expect(screen.getByTestId('projects-focus-all')).toHaveTextContent('3')
    expect(screen.getByRole('status', { name: '项目筛选结果' })).toHaveTextContent('运行中 · 显示 0 / 3 个项目')
  })

  it('查询或不可达聚焦直接揭示匹配的不可达只读行，默认 all 仍保持折叠', () => {
    const onOpenProject = vi.fn()
    const snapshot = makeSnapshot([
      makeProject('/code/live', [makeChange('live', 'open')]),
      makeProject('/code/broken', [], { ok: false }),
    ])
    renderView({ snapshot, rulesByKey: rulesFor('/code/live'), onOpenProject })
    expect(screen.queryByTestId('project-row-broken')).toBeNull()

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索项目' }), { target: { value: 'broken' } })
    const broken = screen.getByTestId('project-row-broken')
    expect(broken).toHaveAttribute('aria-disabled', 'true')
    expect(broken).not.toHaveClass('opacity-70')

    fireEvent.click(screen.getByTestId('projects-focus-unreachable'))
    expect(screen.getByTestId('project-row-broken').tagName).not.toBe('BUTTON')
    expect(onOpenProject).not.toHaveBeenCalled()
  })

  it('状态 radiogroup 使用 aria-checked 与 roving focus，支持方向键循环与 Home/End', () => {
    renderView()
    const all = screen.getByTestId('projects-focus-all')
    const attention = screen.getByTestId('projects-focus-attention')
    const unreachable = screen.getByTestId('projects-focus-unreachable')

    expect(screen.getByRole('radiogroup', { name: '项目状态聚焦' })).toBeInTheDocument()
    expect(all).toHaveAttribute('role', 'radio')
    expect(all).toHaveAttribute('aria-checked', 'true')
    expect(all).not.toHaveAttribute('role', 'tab')

    all.focus()
    fireEvent.keyDown(all, { key: 'ArrowLeft' })
    expect(unreachable).toHaveFocus()
    expect(unreachable).toHaveAttribute('aria-checked', 'true')

    fireEvent.keyDown(unreachable, { key: 'ArrowRight' })
    expect(all).toHaveFocus()
    expect(all).toHaveAttribute('aria-checked', 'true')

    fireEvent.keyDown(all, { key: 'ArrowRight' })
    expect(attention).toHaveFocus()
    expect(attention).toHaveAttribute('aria-checked', 'true')
    expect(all).toHaveAttribute('tabindex', '-1')

    fireEvent.keyDown(attention, { key: 'End' })
    expect(unreachable).toHaveFocus()
    expect(unreachable).toHaveAttribute('aria-checked', 'true')

    fireEvent.keyDown(unreachable, { key: 'Home' })
    expect(all).toHaveFocus()
    expect(all).toHaveAttribute('aria-checked', 'true')
  })

  it('Escape 只清空查询；零结果清除恢复 all 并把焦点交还搜索框', () => {
    renderView()
    const search = screen.getByRole('searchbox', { name: '搜索项目' })
    const attention = screen.getByTestId('projects-focus-attention')
    fireEvent.click(attention)
    fireEvent.change(search, { target: { value: 'missing' } })

    fireEvent.keyDown(search, { key: 'Escape' })
    expect(search).toHaveValue('')
    expect(attention).toHaveAttribute('aria-checked', 'true')

    fireEvent.change(search, { target: { value: 'missing' } })
    expect(screen.getByRole('heading', { name: '没有符合当前条件的项目' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '清除条件' }))
    expect(search).toHaveValue('')
    expect(screen.getByTestId('projects-focus-all')).toHaveAttribute('aria-checked', 'true')
    expect(search).toHaveFocus()
  })

  it('rows 不变时查询与状态切换只过滤，不重复排序', () => {
    renderView()
    const search = screen.getByRole('searchbox', { name: '搜索项目' })
    const attention = screen.getByTestId('projects-focus-attention')
    const sort = vi.spyOn(Array.prototype, 'sort')

    fireEvent.change(search, { target: { value: 'repo' } })
    fireEvent.click(attention)

    expect(sort).not.toHaveBeenCalled()
    sort.mockRestore()
  })

  it('查询与状态切换不重播集合级 GSAP；reduced-motion 直接落终态', () => {
    const media = vi.fn((query: string) => ({
      matches: query.includes('prefers-reduced-motion: reduce'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    vi.stubGlobal('matchMedia', media)
    const set = vi.spyOn(gsap, 'set')
    const fromTo = vi.spyOn(gsap, 'fromTo')

    renderView()
    expect(media.mock.calls.some(([query]) => query.includes('prefers-reduced-motion: reduce'))).toBe(true)
    expect(set).toHaveBeenCalled()
    expect(fromTo).not.toHaveBeenCalled()
    const setCalls = set.mock.calls.length

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索项目' }), { target: { value: 'repo-b' } })
    fireEvent.click(screen.getByTestId('projects-focus-attention'))
    expect(set).toHaveBeenCalledTimes(setCalls)
    expect(fromTo).not.toHaveBeenCalled()
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

  it('两个不可达同 basename worktree 仍显示并朗读唯一身份，且 DOM/动画目标不冲突', () => {
    const firstRoot = '/Users/me/.codex/worktrees/alpha/pipeline-worklfow'
    const secondRoot = '/Users/me/.codex/worktrees/beta/pipeline-worklfow'
    renderView({
      snapshot: makeSnapshot([
        makeProject(firstRoot, [], { ok: false }),
        makeProject(secondRoot, [], { ok: false }),
      ]),
      rulesByKey: rulesFor(),
    })

    fireEvent.click(screen.getByTestId('unreachable-toggle'))

    const first = screen.getByRole('group', { name: `读不到项目 pipeline-worklfow（${firstRoot}）` })
    const second = screen.getByRole('group', { name: `读不到项目 pipeline-worklfow（${secondRoot}）` })
    expect(within(first).getByText('…/alpha/pipeline-worklfow')).toHaveAttribute('title', firstRoot)
    expect(within(second).getByText('…/beta/pipeline-worklfow')).toHaveAttribute('title', secondRoot)
    expect(first.id).toBe(`project-row-${encodeURIComponent(firstRoot)}`)
    expect(second.id).toBe(`project-row-${encodeURIComponent(secondRoot)}`)
    expect(first.id).not.toBe(second.id)
    expect(first).toHaveAttribute('data-anim', 'pv-item')
    expect(second).toHaveAttribute('data-anim', 'pv-item')
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
