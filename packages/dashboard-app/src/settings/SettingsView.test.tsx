import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nProvider } from '../i18n'
import { SettingsView } from './SettingsView'

/**
 * M3 config 写端点前端测试基座：真 fetch stub 喂 GET /api/config + POST /api/config/mandatory-skills
 * （形状逐字对齐 packages/server/src/server.ts 的真实响应），真 render + 真 fireEvent 驱动交互
 * （GOAL C9 真实渲染测试风格：非 shallow render，断言真实 DOM）。默认 capable:false，保持既存
 * 只读断言（本文件顶部既有测试）在新 useEffect 接入后行为不变——组件把「未探测/探测失败」都
 * 折叠为同一只读渲染路径，同步断言不受 fetch 异步时序影响。
 */
interface ConfigFetchOpts {
  capable?: boolean
  mandatorySkills?: Record<string, string[]>
  registrySkills?: string[]
  postResponse?: (body: { phase: string; track: string; skills: string[] }) => { status: number; body: unknown }
}

function stubConfigFetch(opts: ConfigFetchOpts = {}): ReturnType<typeof vi.fn> {
  const capable = opts.capable ?? false
  const mandatorySkills = opts.mandatorySkills ?? {}
  const registrySkills = opts.registrySkills ?? []
  const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url)
    const method = (init?.method ?? 'GET').toUpperCase()
    if (u === '/api/config' && method === 'GET') {
      if (!capable) {
        return { ok: false, status: 404, json: async () => ({ ok: false, error: 'config 数据端未装' }) } as unknown as Response
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, generated_at: '2026-07-07T00:00:00Z', mandatory_skills: mandatorySkills }),
      } as unknown as Response
    }
    // SkillTransferModal 挂载即真 fetch 全部已注册 skill（Task 2 只读端点）——默认给空列表，
    // 需要左栏有具体候选项的用例（拖拽穿梭）经 registrySkills 显式指定。
    if (u === '/api/skills/registry' && method === 'GET') {
      return { ok: true, status: 200, json: async () => ({ skills: registrySkills }) } as unknown as Response
    }
    if (u === '/api/config/mandatory-skills' && method === 'POST') {
      const parsed = JSON.parse(String(init?.body ?? '{}')) as { phase: string; track: string; skills: string[] }
      const custom = opts.postResponse?.(parsed)
      if (custom) {
        const ok = custom.status >= 200 && custom.status < 300
        return { ok, status: custom.status, json: async () => custom.body } as unknown as Response
      }
      return { ok: true, status: 200, json: async () => ({ ok: true, ...parsed }) } as unknown as Response
    }
    throw new Error(`unexpected fetch ${method} ${u}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** 真 HTML5 DnD 交互 stub（同 BoardView.test.tsx / SkillTransferModal.test.tsx 既有模式）。 */
function dragAndDrop(source: Element, target: Element): void {
  const data: Record<string, string> = {}
  const transfer = {
    setData: (k: string, v: string) => {
      data[k] = v
    },
    getData: (k: string) => data[k] ?? '',
  } as unknown as DataTransfer
  fireEvent.dragStart(source, { dataTransfer: transfer })
  fireEvent.dragOver(target, { dataTransfer: transfer })
  fireEvent.drop(target, { dataTransfer: transfer })
}

/**
 * 手动控制的 Promise：用于「保存请求挂起在途」类竞态测试——测试代码持有 resolve/reject，
 * 在断言完"取消/重复保存在途时的行为"之后，再手动让 POST 结算（成功或失败），而不是让
 * mock fetch 立即自动结算（那样就没有"在途窗口"可测）。
 */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  localStorage.clear()
  stubConfigFetch() // 默认 capability off（同旧 server 行为），既存只读测试据此保持通过
  ;(window as unknown as { __PIPELINE_DASHBOARD_TOKEN__?: string }).__PIPELINE_DASHBOARD_TOKEN__ = 'tok-settings'
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderSettings() {
  render(
    <I18nProvider>
      <SettingsView />
    </I18nProvider>,
  )
}

/**
 * 沖掉 SettingsView 挂载即触发的后台 GET /api/config 探测效应（真 Promise 链，非 fake timer）。
 * 既存的同步断言测试不关心探测结果，但若不等它落定就结束测试/卸载组件，React 会报 act() 警告
 * （state 更新发生在测试收尾之外）。真 setTimeout(0) 让出一个宏任务，此前排队的微任务链
 * （fetch → .then → res.json() → setState）保证已跑完——不改变这些测试的同步断言语义，只是
 * 让它们干净收尾。
 */
async function flushEffects(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe('SettingsView 相位轴（病灶①：配置从看板搬进设置）', () => {
  it('相位轴列出全部 7 相位', async () => {
    renderSettings()
    for (const phase of ['open', 'explore', 'spec', 'build', 'verify', 'ship', 'archive']) {
      expect(screen.getByTestId(`axis-${phase}`)).toBeInTheDocument()
    }
    await flushEffects()
  })

  it('复核门相位（explore/spec/verify）标复核门徽标，build 不标', async () => {
    renderSettings()
    expect(screen.getByTestId('axis-gate-explore')).toBeInTheDocument()
    expect(screen.getByTestId('axis-gate-spec')).toBeInTheDocument()
    expect(screen.getByTestId('axis-gate-verify')).toBeInTheDocument()
    expect(screen.queryByTestId('axis-gate-build')).toBeNull()
    expect(screen.queryByTestId('axis-gate-open')).toBeNull()
    await flushEffects()
  })

  it('verify 行显示双出口目标（交付 / 实现）', async () => {
    renderSettings()
    const row = screen.getByTestId('axis-verify')
    expect(row.textContent).toContain('交付')
    expect(row.textContent).toContain('实现')
    await flushEffects()
  })
})

describe('SettingsView 技能矩阵', () => {
  it('切到矩阵 tab 渲染 phase×track 表 + 只读提示', async () => {
    renderSettings()
    fireEvent.click(screen.getByTestId('settings-tab-matrix'))
    expect(screen.getByTestId('matrix-table')).toBeInTheDocument()
    expect(screen.getByTestId('matrix-readonly-note')).toBeInTheDocument()
    await flushEffects()
  })

  it('矩阵单元含 manifest 镜像的强制 skill（build.backend → TDD）', async () => {
    renderSettings()
    fireEvent.click(screen.getByTestId('settings-tab-matrix'))
    const cell = screen.getByTestId('matrix-cell-build-backend')
    expect(cell.textContent).toContain('superpowers:test-driven-development')
    await flushEffects()
  })

  it('open 行经 _all 兜底显示 propose skill', async () => {
    renderSettings()
    fireEvent.click(screen.getByTestId('settings-tab-matrix'))
    expect(screen.getByTestId('matrix-cell-open-backend').textContent).toContain('propose')
    await flushEffects()
  })
})

describe('SettingsView 矩阵 —— M3 config 写端点真接线（真 fetch + 真 fireEvent，非 mock 浅渲染）', () => {
  it('capabilities.config=false（旧 server / 探测失败）→ 保持只读提示，矩阵内无任何编辑按钮', async () => {
    stubConfigFetch({ capable: false })
    renderSettings()
    fireEvent.click(screen.getByTestId('settings-tab-matrix'))
    await waitFor(() => expect(screen.getByTestId('matrix-readonly-note')).toBeInTheDocument())
    expect(screen.queryByTestId('matrix-edit-build-backend')).toBeNull()
    expect(screen.queryByTestId('matrix-editable-note')).toBeNull()
  })

  it('capabilities.config=true → 真 fetch /api/config 渲染服务端实时数据（非静态镜像）+ 编辑按钮出现', async () => {
    stubConfigFetch({ capable: true, mandatorySkills: { 'build.backend': ['live-a', 'live-b'] } })
    renderSettings()
    fireEvent.click(screen.getByTestId('settings-tab-matrix'))
    expect(await screen.findByTestId('matrix-edit-build-backend')).toBeInTheDocument()
    const cell = screen.getByTestId('matrix-cell-build-backend')
    expect(cell.textContent).toContain('live-a')
    expect(cell.textContent).toContain('live-b')
    // 静态镜像的默认值（TDD skill）不应残留——证明确实切到了服务端实时值而非仍显示 data.ts 静态兜底
    expect(cell.textContent).not.toContain('superpowers:test-driven-development')
    expect(screen.getByTestId('matrix-editable-note')).toBeInTheDocument()
    expect(screen.queryByTestId('matrix-readonly-note')).toBeNull()
  })

  // 评审 P1-10：两处说明文字描述的是已不存在的交互/已完成的接线——「逗号分隔多个 skill」
  // 是 M4 已退役的原地文本框、「写回待 M3 后续接线」而 M3 早已接线。说明必须讲当前真相。
  it('矩阵说明文字与真实交互一致：不再提「逗号分隔」与「待 M3 接线」，可编辑提示描述穿梭框', async () => {
    stubConfigFetch({ capable: true, mandatorySkills: {} })
    renderSettings()
    fireEvent.click(screen.getByTestId('settings-tab-matrix'))
    const note = await screen.findByTestId('matrix-editable-note')
    expect(note.textContent).not.toContain('逗号分隔')
    expect(note.textContent).toContain('穿梭框')
    expect(screen.getByTestId('settings-matrix').textContent).not.toContain('待 M3')
  })

  it('点编辑 → 弹窗双栏穿梭框出现（不再是文本框）；取消 → 恢复只读且不发 POST', async () => {
    const fetchMock = stubConfigFetch({ capable: true, mandatorySkills: { 'spec.pm': ['a', 'b'] } })
    renderSettings()
    fireEvent.click(screen.getByTestId('settings-tab-matrix'))
    fireEvent.click(await screen.findByTestId('matrix-edit-spec-pm'))

    expect(await screen.findByTestId('skill-available')).toBeInTheDocument()
    const chosen = screen.getByTestId('skill-chosen')
    expect(chosen).toBeInTheDocument()
    expect(chosen.textContent).toContain('a')
    expect(chosen.textContent).toContain('b')

    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByTestId('skill-chosen')).toBeNull()
    expect(screen.getByTestId('matrix-edit-spec-pm')).toBeInTheDocument()
    // 只有初始 GET /api/config + modal 挂载时的 GET /api/skills/registry，取消不应触发任何 POST
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.some((args: unknown[]) => String(args[0]) === '/api/config/mandatory-skills')).toBe(false)
  })

  it('编辑 + 保存 → 真 POST 请求 url/method/Authorization Bearer/body 正确，成功后回显新值并退出编辑态', async () => {
    const fetchMock = stubConfigFetch({
      capable: true,
      mandatorySkills: { 'build.backend': ['old'] },
      registrySkills: ['old', 'x', 'y', 'z'],
    })
    renderSettings()
    fireEvent.click(screen.getByTestId('settings-tab-matrix'))
    fireEvent.click(await screen.findByTestId('matrix-edit-build-backend'))

    const chosen = await screen.findByTestId('skill-chosen')
    expect(chosen.textContent).toContain('old')

    // 弹窗双栏穿梭：把 old 拖回左栏移除，再依次把 x/y/z 从左栏拖进右栏（顺序即最终 skills 顺序）
    const available = screen.getByTestId('skill-available')
    dragAndDrop(screen.getByText('old'), available)
    dragAndDrop(await screen.findByText('x'), chosen)
    dragAndDrop(screen.getByText('y'), chosen)
    dragAndDrop(screen.getByText('z'), chosen)

    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(screen.queryByTestId('skill-chosen')).toBeNull())
    const cell = screen.getByTestId('matrix-cell-build-backend')
    expect(cell.textContent).toContain('x')
    expect(cell.textContent).toContain('y')
    expect(cell.textContent).toContain('z')
    expect(cell.textContent).not.toContain('old')

    const postCall = fetchMock.mock.calls.find((args: unknown[]) => String(args[0]) === '/api/config/mandatory-skills')
    expect(postCall).toBeDefined()
    const [, init] = postCall as [string, RequestInit]
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer tok-settings')
    expect(headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body as string)).toEqual({ phase: 'build', track: 'backend', skills: ['x', 'y', 'z'] })
  })

  it('保存失败（服务端 400）→ 显示错误文案且保留编辑态（弹窗不关闭，可重试）', async () => {
    stubConfigFetch({
      capable: true,
      mandatorySkills: { 'spec.pm': ['a'] },
      postResponse: () => ({ status: 400, body: { ok: false, error: '非法 skill token' } }),
    })
    renderSettings()
    fireEvent.click(screen.getByTestId('settings-tab-matrix'))
    fireEvent.click(await screen.findByTestId('matrix-edit-spec-pm'))
    await screen.findByTestId('skill-chosen')
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByTestId('matrix-save-error-spec-pm')).toHaveTextContent('非法 skill token')
    // 仍在编辑态（弹窗仍展示，用户可重试，不因失败被踢回只读视图）
    expect(screen.getByTestId('skill-chosen')).toBeInTheDocument()
  })

  it('网络异常（fetch 抛错）→ 呈现错误态而非崩溃，且保持编辑态', async () => {
    stubConfigFetch({ capable: true, mandatorySkills: { 'ship.backend': ['a'] } })
    renderSettings()
    fireEvent.click(screen.getByTestId('settings-tab-matrix'))
    fireEvent.click(await screen.findByTestId('matrix-edit-ship-backend'))
    await screen.findByTestId('skill-chosen')

    // 保存阶段临时切换 fetch 为抛错版本（模拟断网），组件必须 catch 住、不让测试崩溃
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByTestId('matrix-save-error-ship-backend')).toBeInTheDocument()
  })

  it('保存在途时点击取消 → no-op（不退出编辑态）；随后保存失败结算 → 错误仍可见，不被静默吞掉', async () => {
    // POST 挂起在 postGate 上，直到测试手动 resolve——制造出"取消发生在请求仍在途"的窗口。
    const postGate = deferred<Response>()
    const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
      const u = String(url)
      const method = (init?.method ?? 'GET').toUpperCase()
      if (u === '/api/config' && method === 'GET') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, mandatory_skills: { 'spec.pm': ['a'] } }),
        } as unknown as Response
      }
      if (u === '/api/skills/registry' && method === 'GET') {
        return { ok: true, status: 200, json: async () => ({ skills: [] }) } as unknown as Response
      }
      if (u === '/api/config/mandatory-skills' && method === 'POST') {
        return postGate.promise
      }
      throw new Error(`unexpected fetch ${method} ${u}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderSettings()
    fireEvent.click(screen.getByTestId('settings-tab-matrix'))
    fireEvent.click(await screen.findByTestId('matrix-edit-spec-pm'))
    await screen.findByTestId('skill-chosen')

    fireEvent.click(screen.getByRole('button', { name: '保存' })) // 保存发出，POST 挂起未结算
    fireEvent.click(screen.getByRole('button', { name: '取消' })) // 在途时点取消：必须 no-op

    // 取消必须 no-op：弹窗（编辑态）必须仍在，不能被踢回只读视图（等价于旧 disabled={saving}）
    expect(screen.getByTestId('skill-chosen')).toBeInTheDocument()
    expect(screen.queryByTestId('matrix-edit-spec-pm')).toBeNull()

    // 让挂起的保存以 400 失败结算
    await act(async () => {
      postGate.resolve({
        ok: false,
        status: 400,
        json: async () => ({ ok: false, error: '非法 skill token' }),
      } as unknown as Response)
    })

    // 核心断言：错误不能被静默吞掉。修复前，取消已经把 editingKey 清空、isEditing 分支不再
    // 渲染，error <p> 无处安放（state 设置了但 DOM 里找不到）；修复后取消是 no-op，仍在
    // isEditing 分支，错误与弹窗同级可见。
    expect(await screen.findByTestId('matrix-save-error-spec-pm')).toHaveTextContent('非法 skill token')
    // 仍保持编辑态（可直接重试，不必重新点"编辑"）
    expect(screen.getByTestId('skill-chosen')).toBeInTheDocument()
  })

  it('保存在途时重复点击"保存" → 不触发第二个并发 POST 请求', async () => {
    const fetchMock = stubConfigFetch({
      capable: true,
      mandatorySkills: { 'build.backend': ['old'] },
      registrySkills: ['old'],
    })
    renderSettings()
    fireEvent.click(screen.getByTestId('settings-tab-matrix'))
    fireEvent.click(await screen.findByTestId('matrix-edit-build-backend'))
    await screen.findByTestId('skill-chosen')

    // 连续两次点击"保存"，中间不 await 任何东西——模拟"第一个请求的 microtask 还没跑完
    // 就又点了一次"，正是重复点击在途保存被吞掉竞态发生的窗口。
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(screen.queryByTestId('skill-chosen')).toBeNull())

    const postCalls = fetchMock.mock.calls.filter((args: unknown[]) => String(args[0]) === '/api/config/mandatory-skills')
    expect(postCalls).toHaveLength(1)
  })
})
