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
  opts: { workflow?: string; readonly?: boolean } = {},
) {
  const onChange = vi.fn()
  const step = { ...BASE, ...overrides }
  render(
    <I18nProvider>
      <SkillChain step={step} workflow={opts.workflow ?? 'release-train'} readonly={opts.readonly} onChange={onChange} />
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
    expect(within(chain).getByText('outside')).toHaveClass('wb-chip--ghost')
    expect(within(chain).getByText('skill-f')).toBeInTheDocument()
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
        return new Response(JSON.stringify({ skills: ['skill-a', 'new-skill', 'another', 'ext:plugin-skill'] }), { status: 200 })
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
  mandatory_skills: {
    'build._all': ['fallback-skill'],
    'build.frontend': ['skill-x', 'skill-y'],
  },
}

function mockDefaultFetch(overrides: Record<string, () => Response | Promise<Response>> = {}): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async (url: string, opts?: RequestInit) => {
    const key = opts?.method === 'POST' ? `POST ${url}` : url
    if (overrides[key]) return overrides[key]()
    if (url === '/api/config') return new Response(JSON.stringify(CONFIG_BODY), { status: 200 })
    if (url === '/api/skills/registry') {
      return new Response(JSON.stringify({ skills: ['skill-x', 'skill-y', 'skill-w'] }), { status: 200 })
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
  it('探测 /api/config 成功 → 轨道 tab 渲染；pm 走 _all 兜底、frontend 显示 per-track 强制技能', async () => {
    mockDefaultFetch()
    const { onChange } = renderChain({}, { workflow: 'default', readonly: true })
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
    renderChain({}, { workflow: 'default', readonly: true })
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
    })
    // 保存成功 → chips 联动刷新
    expect(within(screen.getByTestId('wb-sk-mand')).getByText('skill-w')).toBeInTheDocument()
  })

  it('保存失败（500 error 原文）→ 错误行内展示、穿梭框保持打开', async () => {
    mockDefaultFetch({
      'POST /api/config/mandatory-skills': () => new Response(JSON.stringify({ ok: false, error: 'manifest 只读' }), { status: 500 }),
    })
    renderChain({}, { workflow: 'default', readonly: true })
    await screen.findByTestId('wb-sk-tracks')
    fireEvent.click(screen.getByTestId('wb-sk-edit'))
    fireEvent.click(await screen.findByRole('button', { name: 'skill-w' }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(screen.getByTestId('wb-sk-save-error')).toHaveTextContent('manifest 只读'))
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()
  })

  it('探测不到 config 写端点（GET /api/config 非 2xx）→ 只读预览：静态镜像 + 只读说明、无编辑钮', async () => {
    mockDefaultFetch({ '/api/config': () => new Response(JSON.stringify({ ok: false, error: 'config 数据端未装' }), { status: 404 }) })
    renderChain({}, { workflow: 'default', readonly: true })
    await screen.findByTestId('wb-sk-tracks')
    expect(screen.getByTestId('wb-sk-cfg-ro')).toBeInTheDocument()
    expect(screen.queryByTestId('wb-sk-edit')).toBeNull()
    // 静态镜像兜底（workbench/data.ts 的 MANDATORY_SKILLS：build.pm 首项 prototype|huashu-design）
    expect(within(screen.getByTestId('wb-sk-mand')).getByText('prototype|huashu-design')).toBeInTheDocument()
  })

  it('archive 阶段：无强制技能约定 → 不给编辑钮（端点拒 archive）', async () => {
    mockDefaultFetch()
    renderChain({ id: 'archive' }, { workflow: 'default', readonly: true })
    await screen.findByTestId('wb-sk-tracks')
    expect(screen.queryByTestId('wb-sk-edit')).toBeNull()
    expect(within(screen.getByTestId('wb-sk-mand')).getByText(/未强制技能/)).toBeInTheDocument()
  })
})
