import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { SkillChain, invalidateMandatoryConfig } from './SkillChain'
import type { WbStepDef } from './WorkbenchView'

// T14 fixture：自定义 workflow 的 step（skills 由各用例覆盖）。
const BASE: WbStepDef = {
  id: 'build',
  label: '实现',
  gate: null,
  skills: [],
  inputs: [],
  outputs: [],
  guards: [],
  transitions: [],
}

// a ➝ b ➝ c 单链 + d/e 两个无依赖独立项——验收①「链渲染顺序 = 拓扑序、无依赖并列显示」的探针。
const CHAIN_SKILLS: WbStepDef['skills'] = [
  { id: 'skill-a' },
  { id: 'skill-b', depends_on: ['skill-a'] },
  { id: 'skill-c', depends_on: ['skill-b'] },
  { id: 'skill-d' },
  { id: 'skill-e' },
]

function renderChain(
  overrides: Partial<WbStepDef> = {},
  opts: { mode?: 'step-dag' | 'manifest-matrix'; readonly?: boolean; root?: string } = {},
) {
  const onChange = vi.fn()
  const step = { ...BASE, ...overrides }
  render(
    <I18nProvider>
      <SkillChain
        step={step}
        mode={opts.mode ?? 'step-dag'}
        readonly={opts.readonly}
        root={opts.root ?? '/repo/default'}
        onChange={onChange}
      />
    </I18nProvider>,
  )
  return { onChange, step }
}

beforeEach(() => {
  localStorage.clear()
  invalidateMandatoryConfig()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('SkillChain 自定义 workflow：依赖链可视化（验收①）', () => {
  it('a➝b➝c 渲染为一条依赖链（拓扑序），d/e 并列在「无依赖」行', () => {
    renderChain({ skills: CHAIN_SKILLS })
    const chains = screen.getAllByTestId('wb-sk-chain')
    expect(chains).toHaveLength(1)
    // 链内顺序 = 拓扑序：a 在 b 前、b 在 c 前
    const text = chains[0].textContent ?? ''
    expect(text.indexOf('skill-a')).toBeGreaterThan(-1)
    expect(text.indexOf('skill-a')).toBeLessThan(text.indexOf('skill-b'))
    expect(text.indexOf('skill-b')).toBeLessThan(text.indexOf('skill-c'))
    expect(within(chains[0]).queryByText('skill-d')).toBeNull()
    // 无依赖独立行：d、e 并列
    const solo = screen.getByTestId('wb-sk-solo')
    expect(within(solo).getByText('skill-d')).toBeInTheDocument()
    expect(within(solo).getByText('skill-e')).toBeInTheDocument()
  })

  it('skills 为空 → 「未声明技能」空态文案，无链行', () => {
    renderChain({ skills: [] })
    expect(screen.getByText(/未声明技能——全部技能可用/)).toBeInTheDocument()
    expect(screen.queryAllByTestId('wb-sk-chain')).toHaveLength(0)
  })

  it('悬空依赖（depends_on 指向 step 外）→ 依赖名以幽灵 chip 呈现在链头', () => {
    renderChain({ skills: [{ id: 'skill-f', depends_on: ['outside' ] }] })
    const chain = screen.getByTestId('wb-sk-chain')
    expect(within(chain).getByText('outside')).toHaveAttribute('data-ghost')
    expect(within(chain).getByText('skill-f')).toBeInTheDocument()
  })

  it('链 chip 带 [data-skn] 序号（=链内执行序 1..n）；solo 与幽灵 chip 不编号（评审 P2-10）', () => {
    renderChain({ skills: [...CHAIN_SKILLS, { id: 'skill-f', depends_on: ['outside'] }] })
    const chains = screen.getAllByTestId('wb-sk-chain')
    // a➝b➝c 链：序号恰为 1/2/3
    const abc = chains.find((c) => c.textContent?.includes('skill-a'))
    expect(abc).toBeDefined()
    expect(Array.from(abc!.querySelectorAll('[data-skn]')).map((n) => n.textContent)).toEqual(['1', '2', '3'])
    // 幽灵 chip（悬空依赖 outside）不参与编号
    const ghostChain = chains.find((c) => c.textContent?.includes('outside'))
    expect(ghostChain).toBeDefined()
    const ghost = within(ghostChain!).getByText('outside')
    expect(ghost).toHaveAttribute('data-ghost')
    expect(ghost.querySelector('[data-skn]')).toBeNull()
    // 无依赖 solo 行（d/e）整行无序号
    expect(screen.getByTestId('wb-sk-solo').querySelector('[data-skn]')).toBeNull()
  })

  it('说明文案明示「依赖顺序=解锁顺序，PreToolUse 门真实拦截」', () => {
    renderChain({ skills: CHAIN_SKILLS })
    expect(screen.getByText(/依赖顺序 = 解锁顺序/)).toBeInTheDocument()
    expect(screen.getByText(/PreToolUse 门真实拦截/)).toBeInTheDocument()
  })
})

describe('SkillChain 自定义 workflow：添加面板（验收②）', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async (url: string) => {
      if (url === '/api/skills/registry') {
        return new Response(JSON.stringify({ skills: [
          { name: 'skill-a', installed: true, source: 'local-plugin' },
          { name: 'new-skill', installed: false, source: 'user' },
          { name: 'another', installed: false, source: 'user' },
          { name: 'ext:plugin-skill', installed: false, source: 'external-marketplace', installCmd: 'claude plugin install ext' },
        ] }), { status: 200 })
      }
      throw new Error(`unexpected fetch ${url}`)
    }) as unknown as typeof fetch
  })

  it('「+ 添加」→ 面板列注册表技能（排除已在 step 的），选依赖后确认 → onChange 追加 depends_on', async () => {
    const { onChange, step } = renderChain({ skills: [{ id: 'skill-a' }] })
    fireEvent.click(screen.getByTestId('wb-sk-add'))
    // 已在 step 的 skill-a 不出现在候选里
    await waitFor(() => expect(screen.getByTestId('wb-sk-opt-new-skill')).toBeInTheDocument())
    expect(screen.queryByTestId('wb-sk-opt-skill-a')).toBeNull()
    // 未选候选时确认钮禁用
    expect(screen.getByTestId('wb-sk-confirm')).toBeDisabled()

    fireEvent.click(screen.getByTestId('wb-sk-opt-new-skill'))
    fireEvent.change(screen.getByTestId('wb-sk-dep'), { target: { value: 'skill-a' } })
    fireEvent.click(screen.getByTestId('wb-sk-confirm'))
    expect(onChange).toHaveBeenCalledWith({
      ...step,
      skills: [{ id: 'skill-a' }, { id: 'new-skill', depends_on: ['skill-a'] }],
    })
    // 确认后面板收起
    expect(screen.queryByTestId('wb-sk-panel')).toBeNull()
  })

  it('不选依赖（无依赖 · 立即解锁）→ 追加的 ref 不带 depends_on 键', async () => {
    const { onChange, step } = renderChain({ skills: [{ id: 'skill-a' }] })
    fireEvent.click(screen.getByTestId('wb-sk-add'))
    fireEvent.click(await screen.findByTestId('wb-sk-opt-another'))
    fireEvent.click(screen.getByTestId('wb-sk-confirm'))
    expect(onChange).toHaveBeenCalledWith({ ...step, skills: [{ id: 'skill-a' }, { id: 'another' }] })
  })

  it('含内核不接受字符的候选（如 ext:plugin-skill）禁用并带原因提示', async () => {
    renderChain({ skills: [] })
    fireEvent.click(screen.getByTestId('wb-sk-add'))
    const opt = await screen.findByTestId('wb-sk-opt-ext:plugin-skill')
    expect(opt).toBeDisabled()
    expect(opt).toHaveAttribute('title', expect.stringContaining('仅允许'))
  })

  it('注册表加载失败 → 行内错误文案，不白屏', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: false, error: '磁盘炸了' }), { status: 500 })) as unknown as typeof fetch
    renderChain({ skills: [] })
    fireEvent.click(screen.getByTestId('wb-sk-add'))
    await waitFor(() => expect(screen.getByText(/技能库获取失败：磁盘炸了/)).toBeInTheDocument())
  })

  it('取消 → 面板收起且不触发 onChange', async () => {
    const { onChange } = renderChain({ skills: [] })
    fireEvent.click(screen.getByTestId('wb-sk-add'))
    fireEvent.click(await screen.findByTestId('wb-sk-cancel'))
    expect(screen.queryByTestId('wb-sk-panel')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('SkillChain 自定义 workflow：移除级联（验收④）', () => {
  it('移除链中间技能 → 该技能消失且指向它的 depends_on 被清空（其余引用原样）', () => {
    const { onChange, step } = renderChain({ skills: CHAIN_SKILLS })
    fireEvent.click(screen.getByRole('button', { name: '移除技能 skill-a' }))
    expect(onChange).toHaveBeenCalledWith({
      ...step,
      skills: [
        { id: 'skill-b' }, // 原 depends_on: ['skill-a'] 被级联清空（空数组落为无键）
        { id: 'skill-c', depends_on: ['skill-b'] },
        { id: 'skill-d' },
        { id: 'skill-e' },
      ],
    })
  })

  it('readonly（自定义 workflow 只读镜像语境）→ 无移除 × 与「+ 添加」入口', () => {
    renderChain({ skills: CHAIN_SKILLS }, { readonly: true })
    expect(screen.queryByRole('button', { name: /移除技能/ })).toBeNull()
    expect(screen.queryByTestId('wb-sk-add')).toBeNull()
  })
})

// ── default workflow：轨道 tab × 当前阶段强制技能（决议 #6 穿梭框能力迁移）──

const CONFIG_BODY = {
  ok: true,
  generated_at: '2026-07-11T00:00:00Z',
  revision: 'skill-chain-r5',
  source: 'builtin-only',
  mandatory_skills_writable_profiles: ['pm', 'frontend', 'backend'],
  tracks: ['pm', 'frontend', 'backend'].map((id, index) => ({
    id,
    label: id === 'pm' ? 'Product' : id[0]!.toUpperCase() + id.slice(1),
    builtin: true,
    workflow: { default: 'default', allowed: '*' },
    policyProfile: {
      reviewSeed: id === 'pm' ? 'skipped' : 'pending',
      automationEligible: true,
      coverageProfile: id,
      routing: { enabled: true, pattern: id, priority: 100 + index },
      skills: { matrix: true, profile: id },
    },
  })),
  mandatory_skills: {
    'build._all': ['fallback-skill'],
    'build.frontend': ['skill-x', 'skill-y'],
  },
}

function mockDefaultFetch(overrides: Record<string, () => Response | Promise<Response>> = {}): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async (url: string, opts?: RequestInit) => {
    const normalizedUrl = url.startsWith('/api/config?root=') ? '/api/config' : url
    const key = opts?.method === 'POST' ? `POST ${normalizedUrl}` : normalizedUrl
    if (overrides[key]) return overrides[key]()
    if (normalizedUrl === '/api/config') return new Response(JSON.stringify(CONFIG_BODY), { status: 200 })
    if (url === '/api/skills/registry') {
      return new Response(JSON.stringify({ skills: [
        { name: 'skill-x', installed: true, source: 'local-plugin' },
        { name: 'skill-y', installed: true, source: 'local-plugin' },
        { name: 'skill-w', installed: false, source: 'user' },
      ] }), { status: 200 })
    }
    if (url === '/api/config/mandatory-skills' && opts?.method === 'POST') {
      const body = JSON.parse(String(opts.body)) as { phase: string; track: string; skills: string[] }
      return new Response(JSON.stringify({ ok: true, ...body }), { status: 200 })
    }
    throw new Error(`unexpected fetch ${url}`)
  })
  global.fetch = fn as unknown as typeof fetch
  return fn
}

describe('SkillChain default workflow：轨道 tab × 强制技能矩阵', () => {
  it('内置轨道用矢量锁图标标识，不把 emoji 混进名称', async () => {
    mockDefaultFetch()
    renderChain({}, { mode: 'manifest-matrix', readonly: true })
    const pm = await screen.findByTestId('wb-sk-track-pm')
    expect(pm).not.toHaveTextContent('🔒')
    expect(pm.querySelector('svg')).not.toBeNull()
  })

  it('项目 root 显式贯穿 GET、POST 与缓存，不保留空 root 的第二套旁路', async () => {
    const fetchMock = mockDefaultFetch()
    renderChain({}, { mode: 'manifest-matrix', readonly: true, root: '/repo with space' })
    await screen.findByTestId('wb-sk-tracks')
    expect(fetchMock).toHaveBeenCalledWith('/api/config?root=%2Frepo%20with%20space', {
      headers: { Accept: 'application/json' },
    })
    fireEvent.click(screen.getByTestId('wb-sk-track-frontend'))
    fireEvent.click(screen.getByTestId('wb-sk-edit'))
    fireEvent.click(await screen.findByRole('button', { name: '保存' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: '保存' })).toBeNull())
    const post = fetchMock.mock.calls.find((call) => (call[1] as RequestInit | undefined)?.method === 'POST')
    expect(JSON.parse(String((post?.[1] as RequestInit).body))).toMatchObject({ root: '/repo with space' })
  })

  it('探测 /api/config 成功 → 轨道 tab 渲染；pm 走 _all 兜底、frontend 显示 per-track 强制技能', async () => {
    mockDefaultFetch()
    const { onChange } = renderChain({}, { mode: 'manifest-matrix', readonly: true })
    await screen.findByTestId('wb-sk-tracks')
    // 默认 pm 轨道：build.pm 未声明 → _all 兜底
    expect(within(screen.getByTestId('wb-sk-mand')).getByText('fallback-skill')).toBeInTheDocument()
    // 切 frontend → per-track 列表
    fireEvent.click(screen.getByTestId('wb-sk-track-frontend'))
    const mand = screen.getByTestId('wb-sk-mand')
    expect(within(mand).getByText('skill-x')).toBeInTheDocument()
    expect(within(mand).getByText('skill-y')).toBeInTheDocument()
    // 可编辑：编辑钮存在；且 manifest 编辑不触碰 workflow def
    expect(screen.getByTestId('wb-sk-edit')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('编辑 → 穿梭框选入技能 → 保存 POST /api/config/mandatory-skills 真写回并联动刷新', async () => {
    const fetchMock = mockDefaultFetch()
    renderChain({}, { mode: 'manifest-matrix', readonly: true })
    await screen.findByTestId('wb-sk-tracks')
    fireEvent.click(screen.getByTestId('wb-sk-track-frontend'))
    fireEvent.click(screen.getByTestId('wb-sk-edit'))
    // 穿梭框（SkillTransferModal 能力迁移）：左栏点 skill-w 移入右栏
    fireEvent.click(await screen.findByRole('button', { name: 'skill-w' }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(screen.queryByRole('button', { name: '保存' })).toBeNull())
    const post = fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'POST')
    expect(post?.[0]).toBe('/api/config/mandatory-skills')
    expect(JSON.parse(String((post?.[1] as RequestInit).body))).toEqual({
      phase: 'build',
      track: 'frontend',
      skills: ['skill-x', 'skill-y', 'skill-w'],
      root: '/repo/default',
    })
    // 保存成功 → chips 联动刷新
    expect(within(screen.getByTestId('wb-sk-mand')).getByText('skill-w')).toBeInTheDocument()
  })

  it('保存失败（500 error 原文）→ 错误行内展示、穿梭框保持打开', async () => {
    mockDefaultFetch({
      'POST /api/config/mandatory-skills': () => new Response(JSON.stringify({ ok: false, error: 'manifest 只读' }), { status: 500 }),
    })
    renderChain({}, { mode: 'manifest-matrix', readonly: true })
    await screen.findByTestId('wb-sk-tracks')
    fireEvent.click(screen.getByTestId('wb-sk-track-frontend'))
    fireEvent.click(screen.getByTestId('wb-sk-edit'))
    fireEvent.click(await screen.findByRole('button', { name: 'skill-w' }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(screen.getByTestId('wb-sk-save-error')).toHaveTextContent('manifest 只读'))
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()
  })

  it('保存端 HTTP 200 但 ok:false → 保持编辑态并显示原文，不把本地草稿写进 cache', async () => {
    mockDefaultFetch({
      'POST /api/config/mandatory-skills': () =>
        new Response(JSON.stringify({ ok: false, error: 'revision 已变化' }), { status: 200 }),
    })
    renderChain({}, { mode: 'manifest-matrix', readonly: true })
    await screen.findByTestId('wb-sk-tracks')
    fireEvent.click(screen.getByTestId('wb-sk-track-frontend'))
    fireEvent.click(screen.getByTestId('wb-sk-edit'))
    fireEvent.click(await screen.findByRole('button', { name: '保存' }))
    await waitFor(() => expect(screen.getByTestId('wb-sk-save-error')).toHaveTextContent('revision 已变化'))
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()
  })

  it('root A 的 POST 晚到不覆盖 root B 的 legacy UI；成功只推进 A 项目 cache', async () => {
    let releaseA!: (response: Response) => void
    global.fetch = vi.fn((url: string, opts?: RequestInit) => {
      if (url === '/api/config?root=%2Frepo-a') return Promise.resolve(new Response(JSON.stringify(CONFIG_BODY), { status: 200 }))
      if (url === '/api/config?root=%2Frepo-b') {
        return Promise.resolve(new Response(JSON.stringify({
          ...CONFIG_BODY,
          mandatory_skills: { ...CONFIG_BODY.mandatory_skills, 'build.frontend': ['b-only'] },
        }), { status: 200 }))
      }
      if (url === '/api/skills/registry') {
        return Promise.resolve(new Response(JSON.stringify({ skills: [] }), { status: 200 }))
      }
      if (url === '/api/config/mandatory-skills' && opts?.method === 'POST') {
        return new Promise<Response>((resolve) => { releaseA = resolve })
      }
      throw new Error(`unexpected fetch ${url}`)
    }) as unknown as typeof fetch

    const onChange = vi.fn()
    const view = render(
      <I18nProvider>
        <SkillChain step={BASE} mode="manifest-matrix" readonly root="/repo-a" onChange={onChange} />
      </I18nProvider>,
    )
    await screen.findByTestId('wb-sk-tracks')
    fireEvent.click(screen.getByTestId('wb-sk-track-frontend'))
    fireEvent.click(screen.getByTestId('wb-sk-edit'))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    view.rerender(
      <I18nProvider>
        <SkillChain step={BASE} mode="manifest-matrix" readonly root="/repo-b" onChange={onChange} />
      </I18nProvider>,
    )
    const rootBMandatory = await screen.findByTestId('wb-sk-mand')
    await within(rootBMandatory).findByText('b-only')
    releaseA(new Response(JSON.stringify({ ok: true, skills: ['a-after-save'] }), { status: 200 }))
    await waitFor(() => expect(within(screen.getByTestId('wb-sk-mand')).getByText('b-only')).toBeInTheDocument())
    expect(screen.queryByText('a-after-save')).toBeNull()

    view.unmount()
    render(
      <I18nProvider>
        <SkillChain step={BASE} mode="manifest-matrix" readonly root="/repo-a" onChange={onChange} />
      </I18nProvider>,
    )
    fireEvent.click(await screen.findByTestId('wb-sk-track-frontend'))
    expect(await screen.findByText('a-after-save')).toBeInTheDocument()
  })

  it('探测不到 runtime config（GET /api/config 非 2xx）→ 不退回静态轨道/技能，无编辑钮', async () => {
    mockDefaultFetch({ '/api/config': () => new Response(JSON.stringify({ ok: false, error: 'config 数据端未装' }), { status: 404 }) })
    renderChain({}, { mode: 'manifest-matrix', readonly: true })
    await screen.findByText('没有可用于技能矩阵的轨道')
    expect(screen.getByTestId('wb-sk-cfg-ro')).toBeInTheDocument()
    expect(screen.queryByTestId('wb-sk-edit')).toBeNull()
    expect(screen.queryByTestId('wb-sk-track-pm')).toBeNull()
    expect(within(screen.getByTestId('wb-sk-mand')).getByText(/未强制技能/)).toBeInTheDocument()
  })

  it('archive 阶段：无强制技能约定 → 不给编辑钮（端点拒 archive）', async () => {
    mockDefaultFetch()
    renderChain({ id: 'archive' }, { mode: 'manifest-matrix', readonly: true })
    await screen.findByTestId('wb-sk-tracks')
    expect(screen.queryByTestId('wb-sk-edit')).toBeNull()
    expect(within(screen.getByTestId('wb-sk-mand')).getByText(/未强制技能/)).toBeInTheDocument()
  })
})

/**
 * v6 T10：未安装 badge(标注型提示,不做代码级拦截——gate 硬拦已拍板不做)+ manifest 缺失黄条。
 * registry 现改为挂载即拉(chips/黄条都要 installed 信息,不再等面板打开)。
 */
/** v6 T10 自定义模式 fetch 桩:registry 挂载即拉(eager),候选与已选 chip 的 installed 由此供给。 */
function mockCustomFetch(): void {
  global.fetch = vi.fn(async (url: string) => {
    if (url === '/api/skills/registry') {
      return new Response(
        JSON.stringify({
          skills: [
            { name: 'skill-a', installed: true, source: 'local-plugin' },
            { name: 'new-skill', installed: false, source: 'user' },
            { name: 'another', installed: false, source: 'user' },
            { name: 'ext-missing', installed: false, source: 'external-marketplace', installCmd: 'claude plugin install ext' },
          ],
        }),
        { status: 200 },
      )
    }
    throw new Error(`unexpected fetch ${url}`)
  }) as unknown as typeof fetch
}

describe('SkillChain v6 T10：未安装 badge(自定义模式)', () => {
  it('已选 chip:installed:false → data-uninstalled 态 + badge,title 含 installCmd,点 badge 复制', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { ...globalThis.navigator, clipboard: { writeText } })
    mockCustomFetch()
    renderChain({ skills: [{ id: 'ext-missing' }, { id: 'skill-a' }] })
    const badge = await screen.findByTestId('wb-sk-uninst-ext-missing')
    expect(badge.title).toContain('claude plugin install ext')
    const chip = badge.closest('[data-chip]')
    expect(chip).not.toBeNull()
    expect(chip).toHaveAttribute('data-uninstalled')
    fireEvent.click(badge)
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('claude plugin install ext'))
    // 已装的不带 badge
    expect(screen.queryByTestId('wb-sk-uninst-skill-a')).toBeNull()
  })

  it('候选面板:未安装项带视觉区分但仍可选中(不拦,呼应「gate 硬拦不做」)', async () => {
    mockCustomFetch()
    const { } = renderChain({ skills: [] })
    fireEvent.click(screen.getByTestId('wb-sk-add'))
    const opt = await screen.findByTestId('wb-sk-opt-new-skill')
    expect(opt).toHaveAttribute('data-uninstalled')
    expect(opt).toBeEnabled()
    fireEvent.click(opt)
    expect(opt).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('SkillChain v6 T10：manifest 缺失黄条(default 模式)', () => {
  const GHOST_CONFIG = () =>
    new Response(
      JSON.stringify({
        ...CONFIG_BODY,
        mandatory_skills: {
          'build._all': ['fallback-skill'],
          // ghost-a|ghost-b 两备选全部未装 → 该 token 触发黄条;skill-x 已装 → 不触发。
          'build.frontend': ['ghost-a|ghost-b', 'skill-x'],
        },
      }),
      { status: 200 },
    )
  const GHOST_REGISTRY = () =>
    new Response(
      JSON.stringify({
        skills: [
          { name: 'ghost-a', installed: false, source: 'external-marketplace', installCmd: 'claude plugin install ghost' },
          { name: 'ghost-b', installed: false, source: 'user' },
          { name: 'skill-x', installed: true, source: 'local-plugin' },
          { name: 'skill-y', installed: true, source: 'local-plugin' },
          { name: 'fallback-skill', installed: true, source: 'user' },
        ],
      }),
      { status: 200 },
    )

  it('当前阶段×轨道存在全备选未装的 token → 黄条渲染,复制钮给出安装命令', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { ...globalThis.navigator, clipboard: { writeText } })
    mockDefaultFetch({ '/api/config': GHOST_CONFIG, '/api/skills/registry': GHOST_REGISTRY })
    renderChain({}, { mode: 'manifest-matrix', readonly: true })
    await screen.findByTestId('wb-sk-tracks')
    fireEvent.click(screen.getByTestId('wb-sk-track-frontend'))
    const banner = await screen.findByTestId('wb-sk-banner')
    expect(banner.textContent).toContain('ghost-a')
    fireEvent.click(screen.getByTestId('wb-sk-banner-copy'))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('claude plugin install ghost'))
  })

  it('全部 token 都有已装备选 → 不渲染(部分已装即满足)', async () => {
    mockDefaultFetch({ '/api/skills/registry': GHOST_REGISTRY })
    renderChain({}, { mode: 'manifest-matrix', readonly: true })
    await screen.findByTestId('wb-sk-tracks')
    fireEvent.click(screen.getByTestId('wb-sk-track-frontend'))
    expect(screen.queryByTestId('wb-sk-banner')).toBeNull()
  })

  it('/api/config 探测失败(capable:false)→ 黄条不渲染(installed 不可判,保守不显示)', async () => {
    mockDefaultFetch({ '/api/config': () => new Response('boom', { status: 500 }) })
    renderChain({}, { mode: 'manifest-matrix', readonly: true })
    await screen.findByText('没有可用于技能矩阵的轨道')
    expect(screen.queryByTestId('wb-sk-banner')).toBeNull()
  })
})
