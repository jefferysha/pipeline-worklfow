/**
 * AutomationCard.test —— 「AFK 执行」卡（T21）：GET 真值渲染、dirty→保存钮真 POST、
 * 保存后 GET 回读、值域拒绝原文展示。fetch 打桩（组件测试），server 侧契约由 server.test.ts 钉住。
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { AutomationCard } from './AutomationCard'

const ROOT = '/tmp/proj-a'
const GET_URL = `/api/automation?root=${encodeURIComponent(ROOT)}`

let settings: { max_parallel: number; max_retries: number; default_opt_in: boolean; image: string }
let postCalls: Array<Record<string, unknown>>
let postResponse: () => Response
// v6 T9：单机资源两端点的可变桩(缺省 docker 可用+镜像就绪+凭证未配;用例按需改写)。
let imagesResponse: () => Response
let readinessResponse: () => Response
let readinessCalls: number
const READY_BODY = (over: Record<string, unknown> = {}) => ({
  ok: true,
  docker: { available: true },
  image: { configured: 'sandcastle:local', present: true, build_hint: 'bash tools/sandcastle/build.sh' },
  credentials: {
    'claude-code': { CLAUDE_CODE_OAUTH_TOKEN: { set: false } },
    codex: { OPENAI_API_KEY: { set: false }, CODEX_HOME: { set: false } },
  },
  ...over,
})

function renderCard() {
  render(
    <I18nProvider>
      <AutomationCard root={ROOT} />
    </I18nProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  settings = { max_parallel: 4, max_retries: 1, default_opt_in: false, image: '' }
  postCalls = []
  postResponse = () => new Response(JSON.stringify({ ok: true, settings }), { status: 200 })
  imagesResponse = () => new Response(JSON.stringify({ ok: true, available: true, images: ['node:22-slim', 'sandcastle:local'] }), { status: 200 })
  readinessResponse = () => new Response(JSON.stringify(READY_BODY()), { status: 200 })
  readinessCalls = 0
  global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
    if (url === GET_URL) {
      return new Response(JSON.stringify({ ok: true, settings }), { status: 200 })
    }
    if (url === '/api/automation' && opts?.method === 'POST') {
      postCalls.push(JSON.parse(String(opts.body)) as Record<string, unknown>)
      return postResponse()
    }
    if (url === '/api/docker/images') return imagesResponse()
    if (url.startsWith('/api/afk/readiness')) {
      readinessCalls += 1
      return readinessResponse()
    }
    throw new Error(`unexpected fetch ${url}`)
  }) as unknown as typeof fetch
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('AutomationCard —— 真值渲染', () => {
  it('GET 后两滑杆/开关/镜像输入显示 server 真值；副题一句人话在卡头', async () => {
    settings = { max_parallel: 6, max_retries: 3, default_opt_in: true, image: 'ghcr.io/a/b:v1' }
    renderCard()
    await waitFor(() => expect(screen.getByTestId('afk-sld-parallel')).toHaveValue('6'))
    expect(screen.getByTestId('afk-sld-retries')).toHaveValue('3')
    expect(screen.getByTestId('afk-opt-in')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('afk-image')).toHaveValue('ghcr.io/a/b:v1')
    expect(screen.getByText('这些参数作用于本项目全部 AFK 运行——并发几个沙箱、失败自动重试几次')).toBeInTheDocument()
  })

  it('并发沙箱上限滑杆下有一行说明（验收反馈②-④：讲清楚是整机上限）', async () => {
    renderCard()
    await waitFor(() => expect(screen.getByTestId('afk-sld-parallel')).toBeInTheDocument())
    expect(screen.getByText('这台机同时最多跑几个沙箱，全部任务共享')).toBeInTheDocument()
  })

  it('镜像输入 placeholder = sandcastle:local（空串 = 用内置镜像）', async () => {
    renderCard()
    await waitFor(() => expect(screen.getByTestId('afk-image')).toHaveAttribute('placeholder', 'sandcastle:local'))
    expect(screen.getByTestId('afk-image')).toHaveValue('')
  })

  it('GET 失败 → 卡内行内报错，不渲染控件（诚实占位）', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      return new Response(JSON.stringify({ ok: false, error: 'boom' }), { status: 500 })
    })
    renderCard()
    await waitFor(() => expect(screen.getByTestId('afk-load-error')).toBeInTheDocument())
    expect(screen.queryByTestId('afk-sld-parallel')).toBeNull()
  })
})

describe('AutomationCard —— dirty → 保存真写 → GET 回读', () => {
  it('初始无 dirty、保存钮禁用；拖滑杆出现 未保存 chip、保存钮可点', async () => {
    renderCard()
    await waitFor(() => expect(screen.getByTestId('afk-sld-parallel')).toBeInTheDocument())
    expect(screen.queryByTestId('afk-dirty')).toBeNull()
    expect(screen.getByTestId('afk-save')).toBeDisabled()
    fireEvent.change(screen.getByTestId('afk-sld-parallel'), { target: { value: '8' } })
    expect(screen.getByTestId('afk-dirty')).toBeInTheDocument()
    expect(screen.getByTestId('afk-save')).toBeEnabled()
  })

  it('保存 POST 带 root + 全字段；成功后再 GET 回读、显示 已保存、dirty 清除', async () => {
    renderCard()
    await waitFor(() => expect(screen.getByTestId('afk-sld-parallel')).toBeInTheDocument())
    fireEvent.change(screen.getByTestId('afk-sld-parallel'), { target: { value: '2' } })
    fireEvent.change(screen.getByTestId('afk-sld-retries'), { target: { value: '0' } })
    fireEvent.click(screen.getByTestId('afk-opt-in'))
    fireEvent.change(screen.getByTestId('afk-image'), { target: { value: 'sandcastle:v2' } })
    // 保存成功后组件会重新 GET——让 GET 返回「已写入」的新真值
    postResponse = () => {
      settings = { max_parallel: 2, max_retries: 0, default_opt_in: true, image: 'sandcastle:v2' }
      return new Response(JSON.stringify({ ok: true, settings }), { status: 200 })
    }
    fireEvent.click(screen.getByTestId('afk-save'))
    await waitFor(() => expect(screen.getByTestId('afk-save-ok')).toBeInTheDocument())
    expect(postCalls).toEqual([{ root: ROOT, max_parallel: 2, max_retries: 0, default_opt_in: true, image: 'sandcastle:v2' }])
    expect(screen.queryByTestId('afk-dirty')).toBeNull()
    expect(screen.getByTestId('afk-sld-parallel')).toHaveValue('2')
  })

  it('server 400 → 错误原文行内展示，dirty 保留（可改后重试）', async () => {
    renderCard()
    await waitFor(() => expect(screen.getByTestId('afk-sld-parallel')).toBeInTheDocument())
    fireEvent.change(screen.getByTestId('afk-sld-parallel'), { target: { value: '7' } })
    postResponse = () => new Response(JSON.stringify({ ok: false, error: 'max_parallel 须为 1-8 的整数' }), { status: 400 })
    fireEvent.click(screen.getByTestId('afk-save'))
    await waitFor(() => expect(screen.getByTestId('afk-save-error')).toHaveTextContent('max_parallel 须为 1-8 的整数'))
    expect(screen.getByTestId('afk-dirty')).toBeInTheDocument()
  })
})


/**
 * v6 T9：镜像 datalist(决策 B.3 原生降级语义)+ 就绪三灯(真探测真值,不轮询)。
 */
describe('AutomationCard v6 T9：镜像下拉 + 就绪三灯', () => {
  it('docker 可用 → input 带 list 且 datalist 渲染候选;available:false → 无 datalist 零行为差异', async () => {
    renderCard()
    await waitFor(() => expect(screen.getByTestId('afk-image')).toHaveAttribute('list', 'afk-image-list'))
    const dl = screen.getByTestId('afk-image-list')
    expect(Array.from(dl.querySelectorAll('option')).map((o) => o.getAttribute('value'))).toEqual([
      'node:22-slim',
      'sandcastle:local',
    ])
  })

  it('available:false / 接口失败 → 不渲染 datalist,输入框仍在(降级不阻塞)', async () => {
    imagesResponse = () => new Response(JSON.stringify({ ok: true, available: false, images: [] }), { status: 200 })
    renderCard()
    await waitFor(() => expect(screen.getByTestId('afk-image')).toBeInTheDocument())
    expect(screen.queryByTestId('afk-image-list')).toBeNull()
    expect(screen.getByTestId('afk-image')).not.toHaveAttribute('list')
  })

  it('三灯按 readiness 真值:镜像缺失亮黄且给 build_hint 复制;凭证未配显「未配置」', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { ...globalThis.navigator, clipboard: { writeText } })
    readinessResponse = () =>
      new Response(
        JSON.stringify(READY_BODY({ image: { configured: 'sandcastle:local', present: false, build_hint: 'bash tools/sandcastle/build.sh' } })),
        { status: 200 },
      )
    renderCard()
    const rd = await screen.findByTestId('afk-rd')
    expect(rd).toBeInTheDocument()
    expect(screen.getByTestId('afk-rd-image').textContent).toContain('未就绪')
    expect(screen.getByTestId('afk-rd-cred-claude').textContent).toContain('未配置')
    fireEvent.click(screen.getByTestId('afk-rd-build-copy'))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('bash tools/sandcastle/build.sh'))
  })

  it('readiness 接口失败 → 灯区整体不渲染(不谎报),其余控件不受影响', async () => {
    readinessResponse = () => new Response('boom', { status: 500 })
    renderCard()
    await waitFor(() => expect(screen.getByTestId('afk-image')).toBeInTheDocument())
    expect(screen.queryByTestId('afk-rd')).toBeNull()
  })

  it('refreshToken 变化 → readiness 重拉(显式信号,非轮询)', async () => {
    const { rerender } = render(
      <I18nProvider>
        <AutomationCard root={ROOT} refreshToken={0} />
      </I18nProvider>,
    )
    await waitFor(() => expect(readinessCalls).toBe(1))
    rerender(
      <I18nProvider>
        <AutomationCard root={ROOT} refreshToken={1} />
      </I18nProvider>,
    )
    await waitFor(() => expect(readinessCalls).toBe(2))
  })
})

/**
 * full-install W1（批 4 Wave A）：凭证灯改 per-runner 双灯——claude-code 与 codex 同等可见
 * （各自灯色+文案,不靠 tooltip;去「(claude-code)」硬编码;加「服务进程视角,终端 doctor 为准」caveat）。
 * 旅程唯一真·不对等（P1-F1）：数据齐（WbAfkReadiness.credentials 含两 runner）,只是 UI 之前没渲染 codex。
 */
describe('AutomationCard full-install W1：凭证 per-runner 双灯 + caveat', () => {
  const CREDS = (over: Record<string, unknown> = {}) => ({
    credentials: {
      'claude-code': { CLAUDE_CODE_OAUTH_TOKEN: { set: false } },
      codex: { OPENAI_API_KEY: { set: false }, CODEX_HOME: { set: false } },
      ...over,
    },
  })

  it('① codex.OPENAI_API_KEY.set=true → codex 凭证灯可见绿+文案含 codex（不靠 hover）', async () => {
    readinessResponse = () =>
      new Response(
        JSON.stringify(
          READY_BODY(CREDS({ codex: { OPENAI_API_KEY: { set: true }, CODEX_HOME: { set: true } } })),
        ),
        { status: 200 },
      )
    renderCard()
    const codex = await screen.findByTestId('afk-rd-cred-codex')
    expect(codex.textContent).toContain('codex') // 可见文案含 runner 名,非 tooltip
    expect(codex.textContent).toContain('就绪') // 就绪态在可见文案里,不靠 hover
    expect(codex.previousElementSibling).toHaveClass('rd-dot', 'rd-dot--ok') // 绿灯
  })

  it('② claude 未配 + codex 已配 → 两灯各自态正确（不再只显 claude）', async () => {
    readinessResponse = () =>
      new Response(
        JSON.stringify(
          READY_BODY(
            CREDS({
              'claude-code': { CLAUDE_CODE_OAUTH_TOKEN: { set: false } },
              codex: { OPENAI_API_KEY: { set: true }, CODEX_HOME: { set: false } },
            }),
          ),
        ),
        { status: 200 },
      )
    renderCard()
    const claude = await screen.findByTestId('afk-rd-cred-claude')
    const codex = screen.getByTestId('afk-rd-cred-codex')
    expect(claude.textContent).toContain('未配置')
    expect(codex.textContent).toContain('就绪')
    expect(claude.previousElementSibling).toHaveClass('rd-dot--no')
    expect(codex.previousElementSibling).toHaveClass('rd-dot--ok')
  })

  it('③ 凭证文案无「(claude-code)」括号硬编码残留;claude-code 仅作 per-runner 标签', async () => {
    readinessResponse = () => new Response(JSON.stringify(READY_BODY(CREDS())), { status: 200 })
    renderCard()
    const rd = await screen.findByTestId('afk-rd')
    expect(rd.textContent).not.toContain('(claude-code)') // 括号硬编码已去
    // claude-code 仍出现,但作 per-runner 并列标签（凭证·claude-code）,非「唯一凭证=claude」的括号形式
    expect(screen.getByTestId('afk-rd-cred-claude').textContent).toContain('claude-code')
  })

  it('④ 凭证行渲染诚实 caveat（服务进程视角 / 终端 doctor 为准）', async () => {
    readinessResponse = () => new Response(JSON.stringify(READY_BODY(CREDS())), { status: 200 })
    renderCard()
    const caveat = await screen.findByTestId('afk-rd-cred-caveat')
    expect(caveat.textContent).toContain('服务进程')
    expect(caveat.textContent).toContain('doctor')
  })

  it('⑤ readiness 拉不到 → 双灯+caveat 随整区不渲染（回归 fail-open,不谎报）', async () => {
    readinessResponse = () => new Response('boom', { status: 500 })
    renderCard()
    await waitFor(() => expect(screen.getByTestId('afk-image')).toBeInTheDocument())
    expect(screen.queryByTestId('afk-rd')).toBeNull()
    expect(screen.queryByTestId('afk-rd-cred-claude')).toBeNull()
    expect(screen.queryByTestId('afk-rd-cred-codex')).toBeNull()
    expect(screen.queryByTestId('afk-rd-cred-caveat')).toBeNull()
  })

  it('⑥ 凭证双灯复用 color-mix 派生类名(rd-dot--ok/--no),不硬编码新原色(无内联 style)', async () => {
    readinessResponse = () =>
      new Response(
        JSON.stringify(
          READY_BODY(
            CREDS({
              'claude-code': { CLAUDE_CODE_OAUTH_TOKEN: { set: false } },
              codex: { OPENAI_API_KEY: { set: true }, CODEX_HOME: { set: false } },
            }),
          ),
        ),
        { status: 200 },
      )
    renderCard()
    const claudeDot = (await screen.findByTestId('afk-rd-cred-claude')).previousElementSibling
    const codexDot = screen.getByTestId('afk-rd-cred-codex').previousElementSibling
    // 未配→rd-dot--no(styles.ts: color-mix(in oklch,var(--red) 52%,var(--green)) 派生);已配→rd-dot--ok(var(--green) token)
    expect(claudeDot).toHaveClass('rd-dot', 'rd-dot--no')
    expect(codexDot).toHaveClass('rd-dot', 'rd-dot--ok')
    // 决议#9:不引入新原色——灯元素无内联硬编码色
    expect(claudeDot).not.toHaveAttribute('style')
    expect(codexDot).not.toHaveAttribute('style')
  })
})
