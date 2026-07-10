import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { makeChange, makeProject, makeSnapshot } from '../testkit'
import { AfkWorkbench, type AfkWorkbenchProps } from './AfkWorkbench'

const SNAPSHOT = {
  generated_at: '2026-07-07T00:00:00Z',
  scheduler: { status: 'busy', queued: 0, running: 1, merged: 0, failed: 0, conflict: 0, paused: 1, total: 2, message: '' },
  lanes: {
    queued: [], merged: [], failed: [], conflict: [],
    running: [{ name: 'demo-2', root: '/tmp/a', path: '/tmp/a/openspec/changes/demo-2', phase: 'build', automation: 'running', lane: 'running', attempts: 0, queued_at: '', last_error: '', sandbox: 'sandcastle-abc', worktree: '/tmp/wt-2' }],
    paused: [{ name: 'demo-1', root: '/tmp/a', path: '/tmp/a/openspec/changes/demo-1', phase: 'build', automation: 'paused', lane: 'paused', attempts: 0, queued_at: '', last_error: '', sandbox: '', worktree: '' }],
  },
  cards: [],
}

function renderAfk(props: Partial<AfkWorkbenchProps> = {}) {
  return render(
    <I18nProvider>
      <AfkWorkbench {...props} />
    </I18nProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
    if (url === '/api/afk/snapshot') return new Response(JSON.stringify(SNAPSHOT), { status: 200 })
    if (url.startsWith('/api/afk/demo-2/log')) return new Response(JSON.stringify({ log: 'building...\n' }), { status: 200 })
    if (url.startsWith('/api/afk/demo-1/retry') && opts?.method === 'POST') return new Response(JSON.stringify({ ok: true }), { status: 200 })
    throw new Error(`unexpected ${url}`)
  }) as unknown as typeof fetch
})
afterEach(() => vi.restoreAllMocks())

describe('AfkWorkbench', () => {
  it('左列表显示两个 change，点击 running 的那个 → 右侧详情显示日志', async () => {
    renderAfk()
    await waitFor(() => expect(screen.getByText('demo-2')).toBeInTheDocument())
    fireEvent.click(screen.getByText('demo-2'))
    await waitFor(() => expect(screen.getByText(/building\.\.\./)).toBeInTheDocument())
  })

  it('详情区渲染 sandbox/worktree 路径（F3/design §4 要求，此前数据已 fetch 但从未渲染）', async () => {
    renderAfk()
    await waitFor(() => expect(screen.getByText('demo-2')).toBeInTheDocument())
    fireEvent.click(screen.getByText('demo-2'))
    await waitFor(() => expect(screen.getByText(/sandcastle-abc/)).toBeInTheDocument())
    expect(screen.getByText(/\/tmp\/wt-2/)).toBeInTheDocument()
  })

  it('sandbox/worktree 为空字符串（paused 卡）时不渲染对应行（不是渲染一行空内容）', async () => {
    renderAfk()
    await waitFor(() => expect(screen.getByText('demo-1')).toBeInTheDocument())
    fireEvent.click(screen.getByText('demo-1'))
    await waitFor(() => expect(screen.getByRole('button', { name: /重试|Retry/i })).toBeInTheDocument())
    expect(screen.queryByText(/沙箱|Sandbox/)).not.toBeInTheDocument()
    expect(screen.queryByText(/worktree|Worktree/)).not.toBeInTheDocument()
  })

  it('paused 的 change 点击后详情区有"重试"按钮，点击真 POST /retry，成功后真 refetch 快照', async () => {
    let snapshotCalls = 0
    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === '/api/afk/snapshot') {
        snapshotCalls += 1
        return new Response(JSON.stringify(SNAPSHOT), { status: 200 })
      }
      if (url.startsWith('/api/afk/demo-1/retry') && opts?.method === 'POST') return new Response(JSON.stringify({ ok: true }), { status: 200 })
      throw new Error(`unexpected ${url}`)
    }) as unknown as typeof fetch
    renderAfk()
    await waitFor(() => expect(screen.getByText('demo-1')).toBeInTheDocument())
    expect(snapshotCalls).toBe(1)
    fireEvent.click(screen.getByText('demo-1'))
    const retryBtn = await screen.findByRole('button', { name: /重试|Retry/i })
    fireEvent.click(retryBtn)
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
      expect(calls.some((c) => String(c[0]).includes('/retry'))).toBe(true)
    })
    await waitFor(() => expect(snapshotCalls).toBe(2))
  })

  it('快照 fetch 失败时显示错误信息，而不是一直卡在空白/加载状态', async () => {
    global.fetch = vi.fn(async (url: string) => {
      if (url === '/api/afk/snapshot') return new Response(JSON.stringify({ ok: false, error: 'boom' }), { status: 500 })
      throw new Error(`unexpected ${url}`)
    }) as unknown as typeof fetch
    renderAfk()
    await waitFor(() => expect(screen.getByText(/加载失败|错误|error|Error/i)).toBeInTheDocument())
  })

  it('选中 change 后日志 fetch 失败 → 详情区显示错误信息而不是空白', async () => {
    global.fetch = vi.fn(async (url: string) => {
      if (url === '/api/afk/snapshot') return new Response(JSON.stringify(SNAPSHOT), { status: 200 })
      if (url.startsWith('/api/afk/demo-2/log')) return new Response(JSON.stringify({ ok: false, error: 'log boom' }), { status: 500 })
      throw new Error(`unexpected ${url}`)
    }) as unknown as typeof fetch
    renderAfk()
    await waitFor(() => expect(screen.getByText('demo-2')).toBeInTheDocument())
    fireEvent.click(screen.getByText('demo-2'))
    await waitFor(() => expect(screen.getByText(/日志加载失败|加载失败|error|Error/i)).toBeInTheDocument())
  })

  it('取消操作失败（非 2xx）时显示错误信息（点「取消」先过确认框，确认后才真 POST）', async () => {
    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === '/api/afk/snapshot') return new Response(JSON.stringify(SNAPSHOT), { status: 200 })
      if (url.startsWith('/api/afk/demo-2/log')) return new Response(JSON.stringify({ log: 'building...\n' }), { status: 200 })
      if (url.startsWith('/api/afk/demo-2/cancel') && opts?.method === 'POST') {
        return new Response(JSON.stringify({ ok: false, error: 'cancel boom' }), { status: 400 })
      }
      throw new Error(`unexpected ${url}`)
    }) as unknown as typeof fetch
    renderAfk()
    await waitFor(() => expect(screen.getByText('demo-2')).toBeInTheDocument())
    fireEvent.click(screen.getByText('demo-2'))
    const cancelBtn = await screen.findByRole('button', { name: /取消|Cancel/i })
    fireEvent.click(cancelBtn)
    const confirmBtn = await screen.findByTestId('afk-cancel-confirm')
    fireEvent.click(confirmBtn)
    await waitFor(() => expect(screen.getByText(/取消失败|操作失败|error|Error/i)).toBeInTheDocument())
  })

  it('lane=running 但 automation=scheduled（已认领未起跑）时，详情区不应显示"取消"按钮', async () => {
    // 对应 server laneOf()：scheduled 和 running 都折叠进 running 泳道，但 cancelAfkRun 只认
    // automation==='running'，scheduled 传进去必 400。Cancel 门禁须用 automation 而非 lane 判断。
    const SCHEDULED_SNAPSHOT = {
      generated_at: '2026-07-07T00:00:00Z',
      scheduler: { status: 'busy', queued: 0, running: 1, merged: 0, failed: 0, conflict: 0, paused: 0, total: 1, message: '' },
      lanes: {
        queued: [], merged: [], failed: [], conflict: [], paused: [],
        running: [{ name: 'demo-scheduled', root: '/tmp/a', path: '/tmp/a/openspec/changes/demo-scheduled', phase: 'build', automation: 'scheduled', lane: 'running', attempts: 0, queued_at: '', last_error: '', sandbox: 'sandbox-xyz', worktree: '/tmp/wt-3' }],
      },
      cards: [],
    }
    global.fetch = vi.fn(async (url: string) => {
      if (url === '/api/afk/snapshot') return new Response(JSON.stringify(SCHEDULED_SNAPSHOT), { status: 200 })
      if (url.startsWith('/api/afk/demo-scheduled/log')) return new Response(JSON.stringify({ log: null }), { status: 200 })
      throw new Error(`unexpected ${url}`)
    }) as unknown as typeof fetch
    renderAfk()
    await waitFor(() => expect(screen.getByText('demo-scheduled')).toBeInTheDocument())
    fireEvent.click(screen.getByText('demo-scheduled'))
    await waitFor(() => expect(screen.getByText(/（无日志）/)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /取消|Cancel/i })).not.toBeInTheDocument()
  })

  it('重试操作失败（非 2xx）时显示错误信息', async () => {
    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === '/api/afk/snapshot') return new Response(JSON.stringify(SNAPSHOT), { status: 200 })
      if (url.startsWith('/api/afk/demo-1/log')) return new Response(JSON.stringify({ log: null }), { status: 200 })
      if (url.startsWith('/api/afk/demo-1/retry') && opts?.method === 'POST') {
        return new Response(JSON.stringify({ ok: false, error: 'retry boom' }), { status: 400 })
      }
      throw new Error(`unexpected ${url}`)
    }) as unknown as typeof fetch
    renderAfk()
    await waitFor(() => expect(screen.getByText('demo-1')).toBeInTheDocument())
    fireEvent.click(screen.getByText('demo-1'))
    const retryBtn = await screen.findByRole('button', { name: /重试|Retry/i })
    fireEvent.click(retryBtn)
    await waitFor(() => expect(screen.getByText(/重试失败|操作失败|error|Error/i)).toBeInTheDocument())
  })

  it('挂队表单：填 change 名点"挂队" → 真 POST /enqueue，成功后真 refetch 快照且清空输入框', async () => {
    let snapshotCalls = 0
    let enqueueBody: unknown = null
    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === '/api/afk/snapshot') {
        snapshotCalls += 1
        return new Response(JSON.stringify(SNAPSHOT), { status: 200 })
      }
      if (url === '/api/afk/new-change/enqueue' && opts?.method === 'POST') {
        enqueueBody = JSON.parse(opts.body as string)
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      throw new Error(`unexpected ${url}`)
    }) as unknown as typeof fetch
    // root 显式传具体项目（终审修复批：root===''是聚合语境，挂队区整体 disabled——本用例的
    // 意图是验证挂队提交流程本身，与聚合禁用是两个正交关注点，不依赖 renderAfk() 的默认 root）。
    renderAfk({ root: '/tmp/a' })
    await waitFor(() => expect(screen.getByText('demo-2')).toBeInTheDocument())
    expect(snapshotCalls).toBe(1)
    const input = screen.getByPlaceholderText(/change 名|change name/i)
    fireEvent.change(input, { target: { value: 'new-change' } })
    fireEvent.click(screen.getByRole('button', { name: /挂队|Enqueue/i }))
    await waitFor(() => expect(enqueueBody).toEqual({ root: expect.any(String) }))
    await waitFor(() => expect(snapshotCalls).toBe(2))
    expect((input as HTMLInputElement).value).toBe('')
  })

  it('挂队失败（非 2xx）→ 显示错误信息，不清空输入框', async () => {
    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === '/api/afk/snapshot') return new Response(JSON.stringify(SNAPSHOT), { status: 200 })
      if (url === '/api/afk/dup/enqueue' && opts?.method === 'POST') {
        return new Response(JSON.stringify({ ok: false, error: "automation 状态已是 'running'，无需重复挂队" }), { status: 400 })
      }
      throw new Error(`unexpected ${url}`)
    }) as unknown as typeof fetch
    // root 显式传具体项目（终审修复批：见上一条用例同款注释——聚合禁用与本用例意图正交）。
    renderAfk({ root: '/tmp/a' })
    await waitFor(() => expect(screen.getByText('demo-2')).toBeInTheDocument())
    const input = screen.getByPlaceholderText(/change 名|change name/i)
    fireEvent.change(input, { target: { value: 'dup' } })
    fireEvent.click(screen.getByRole('button', { name: /挂队|Enqueue/i }))
    await waitFor(() => expect(screen.getByText(/无需重复挂队|挂队失败|Enqueue failed/i)).toBeInTheDocument())
    expect((input as HTMLInputElement).value).toBe('dup')
  })

  it('输入框为空时挂队钮 disabled（不靠 server 兜底一个空字符串 name）；填字符后启用', async () => {
    const calls: string[] = []
    global.fetch = vi.fn(async (url: string) => {
      calls.push(url)
      if (url === '/api/afk/snapshot') return new Response(JSON.stringify(SNAPSHOT), { status: 200 })
      throw new Error(`unexpected ${url}`)
    }) as unknown as typeof fetch
    // root 显式传具体项目（终审修复批：本用例验证的是"空名 disabled"这条纪律，与聚合禁用是
    // 两个正交关注点——聚合语境下按钮恒 disabled，会掩盖"填字符后启用"这条断言本身）。
    renderAfk({ root: '/tmp/a' })
    await waitFor(() => expect(screen.getByText('demo-2')).toBeInTheDocument())
    const btn = screen.getByRole('button', { name: /挂队|Enqueue/i })
    expect(btn).toBeDisabled()
    fireEvent.click(btn)
    await waitFor(() => expect(calls).toEqual(['/api/afk/snapshot']))

    const input = screen.getByPlaceholderText(/change 名|change name/i)
    fireEvent.change(input, { target: { value: 'x' } })
    expect(btn).not.toBeDisabled()
  })

  it('中英切换：英文下渲染英文空态提示（此前面板完全不走 t()）', async () => {
    localStorage.setItem('pipeline-dashboard-lang', 'en')
    global.fetch = vi.fn(async (url: string) => {
      if (url === '/api/afk/snapshot') {
        return new Response(
          JSON.stringify({ generated_at: '', scheduler: { status: 'idle', queued: 0, running: 0, merged: 0, failed: 0, conflict: 0, paused: 0, total: 0, message: '' }, lanes: { queued: [], merged: [], failed: [], conflict: [], running: [], paused: [] }, cards: [] }),
          { status: 200 },
        )
      }
      throw new Error(`unexpected ${url}`)
    }) as unknown as typeof fetch
    renderAfk()
    await waitFor(() => expect(screen.getByText('Select a change to see details')).toBeInTheDocument())
  })

  // ── Task 12（评审 P0-3/P1-7）新增 ──────────────────────────────────────────────

  it('卡片带项目 root 徽章（root 尾段 mono）', async () => {
    renderAfk({ root: '' })
    await waitFor(() => expect(screen.getByText('demo-2')).toBeInTheDocument())
    expect(screen.getByTestId('afk-item-root-demo-2').textContent).toBe('a')
    expect(screen.getByTestId('afk-item-root-demo-1').textContent).toBe('a')
  })

  it('列表按 currentRoot 过滤（非空 root 只看该项目；重渲染成 "" 后聚合显示全部）', async () => {
    const MULTI_ROOT_SNAPSHOT = {
      generated_at: '2026-07-07T00:00:00Z',
      scheduler: { status: 'busy', queued: 0, running: 2, merged: 0, failed: 0, conflict: 0, paused: 0, total: 2, message: '' },
      lanes: {
        queued: [], merged: [], failed: [], conflict: [], paused: [],
        running: [
          { name: 'proj-a-task', root: '/tmp/a', path: '', phase: 'build', automation: 'running', lane: 'running', attempts: 0, queued_at: '', last_error: '', sandbox: '', worktree: '' },
          { name: 'proj-b-task', root: '/tmp/b', path: '', phase: 'build', automation: 'running', lane: 'running', attempts: 0, queued_at: '', last_error: '', sandbox: '', worktree: '' },
        ],
      },
      cards: [],
    }
    global.fetch = vi.fn(async (url: string) => {
      if (url === '/api/afk/snapshot') return new Response(JSON.stringify(MULTI_ROOT_SNAPSHOT), { status: 200 })
      throw new Error(`unexpected ${url}`)
    }) as unknown as typeof fetch
    const { rerender } = renderAfk({ root: '/tmp/a' })
    await waitFor(() => expect(screen.getByText('proj-a-task')).toBeInTheDocument())
    expect(screen.queryByText('proj-b-task')).not.toBeInTheDocument()

    rerender(
      <I18nProvider>
        <AfkWorkbench root="" />
      </I18nProvider>,
    )
    await waitFor(() => expect(screen.getByText('proj-b-task')).toBeInTheDocument())
    expect(screen.getByText('proj-a-task')).toBeInTheDocument()
  })

  it('挂队输入 datalist 选项来自主 snapshot 当前语境的 change「name（phase）」', async () => {
    const mainSnapshot = makeSnapshot([
      makeProject('/tmp/a', [makeChange('alpha', 'build'), makeChange('beta', 'spec')]),
      makeProject('/tmp/b', [makeChange('gamma', 'explore')]),
    ])
    const { container } = renderAfk({ root: '/tmp/a', snapshot: mainSnapshot })
    await waitFor(() => expect(screen.getByText('demo-2')).toBeInTheDocument())
    const options = Array.from(container.querySelectorAll('datalist option')) as HTMLOptionElement[]
    const values = options.map((o) => o.value)
    expect(values).toContain('alpha')
    expect(values).toContain('beta')
    expect(values).not.toContain('gamma') // 当前语境是 /tmp/a，/tmp/b 的 change 不该出现
    const alphaOption = options.find((o) => o.value === 'alpha')
    expect(alphaOption?.textContent).toBe('alpha（build）')
  })

  it('取消走 Dialog 二次确认：点「取消」先弹框、不立即发请求；确认后才真 POST /cancel', async () => {
    let cancelCalls = 0
    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === '/api/afk/snapshot') return new Response(JSON.stringify(SNAPSHOT), { status: 200 })
      if (url.startsWith('/api/afk/demo-2/log')) return new Response(JSON.stringify({ log: 'building...\n' }), { status: 200 })
      if (url.startsWith('/api/afk/demo-2/cancel') && opts?.method === 'POST') {
        cancelCalls += 1
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      throw new Error(`unexpected ${url}`)
    }) as unknown as typeof fetch
    renderAfk()
    await waitFor(() => expect(screen.getByText('demo-2')).toBeInTheDocument())
    fireEvent.click(screen.getByText('demo-2'))
    const cancelBtn = await screen.findByTestId('afk-cancel')
    fireEvent.click(cancelBtn)

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(cancelCalls).toBe(0) // 弹框阶段还没真发请求

    fireEvent.click(screen.getByTestId('afk-cancel-confirm'))
    await waitFor(() => expect(cancelCalls).toBe(1))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('取消确认框点「取消」（dismiss）→ 关闭弹框，不发请求', async () => {
    global.fetch = vi.fn(async (url: string) => {
      if (url === '/api/afk/snapshot') return new Response(JSON.stringify(SNAPSHOT), { status: 200 })
      if (url.startsWith('/api/afk/demo-2/log')) return new Response(JSON.stringify({ log: 'building...\n' }), { status: 200 })
      throw new Error(`unexpected ${url}`)
    }) as unknown as typeof fetch
    renderAfk()
    await waitFor(() => expect(screen.getByText('demo-2')).toBeInTheDocument())
    fireEvent.click(screen.getByText('demo-2'))
    fireEvent.click(await screen.findByTestId('afk-cancel'))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('afk-cancel-dismiss'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('详情区「查看 change →」点击调用 onOpenChange(root, name)', async () => {
    const onOpenChange = vi.fn()
    renderAfk({ onOpenChange })
    await waitFor(() => expect(screen.getByText('demo-2')).toBeInTheDocument())
    fireEvent.click(screen.getByText('demo-2'))
    await waitFor(() => expect(screen.getByText(/building\.\.\./)).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('afk-open-change'))
    expect(onOpenChange).toHaveBeenCalledWith('/tmp/a', 'demo-2')
  })

  it('未传 onOpenChange 时不渲染「查看 change →」按钮', async () => {
    renderAfk()
    await waitFor(() => expect(screen.getByText('demo-2')).toBeInTheDocument())
    fireEvent.click(screen.getByText('demo-2'))
    await waitFor(() => expect(screen.getByText(/building\.\.\./)).toBeInTheDocument())
    expect(screen.queryByTestId('afk-open-change')).not.toBeInTheDocument()
  })

  it('点击「↻ 刷新」→ 真实再拉一次日志', async () => {
    let logCalls = 0
    global.fetch = vi.fn(async (url: string) => {
      if (url === '/api/afk/snapshot') return new Response(JSON.stringify(SNAPSHOT), { status: 200 })
      if (url.startsWith('/api/afk/demo-2/log')) {
        logCalls += 1
        return new Response(JSON.stringify({ log: `building #${logCalls}...\n` }), { status: 200 })
      }
      throw new Error(`unexpected ${url}`)
    }) as unknown as typeof fetch
    renderAfk()
    await waitFor(() => expect(screen.getByText('demo-2')).toBeInTheDocument())
    fireEvent.click(screen.getByText('demo-2'))
    await waitFor(() => expect(logCalls).toBe(1))
    fireEvent.click(screen.getByTestId('afk-log-refresh'))
    await waitFor(() => expect(logCalls).toBe(2))
    await waitFor(() => expect(screen.getByText(/building #2/)).toBeInTheDocument())
  })

  it('「跟随尾部」switch 默认开启，点击可关闭', async () => {
    renderAfk()
    await waitFor(() => expect(screen.getByText('demo-2')).toBeInTheDocument())
    fireEvent.click(screen.getByText('demo-2'))
    await waitFor(() => expect(screen.getByText(/building\.\.\./)).toBeInTheDocument())
    const followSwitch = screen.getByTestId('afk-follow') as HTMLInputElement
    expect(followSwitch.checked).toBe(true)
    fireEvent.click(followSwitch)
    expect(followSwitch.checked).toBe(false)
  })
})

/**
 * 终审修复批：聚合语境（root===''）下挂队无法确定目标项目——contextChanges 在 root==='' 时会把
 * 全部 ok 项目的 change 混进候选列表（既无法替用户消歧，也无法安全拼一个具体 project root 去
 * POST /enqueue）。修复前挂队区在聚合语境下与单项目语境一视同仁地可用，是"看起来能挂队、
 * 实际会拼错 root"的陷阱。
 */
describe('AFK 挂队聚合禁用（终审修复批）', () => {
  it('聚合语境（root=""）→ 挂队输入框/按钮 disabled，datalist 无候选项', async () => {
    const mainSnapshot = makeSnapshot([makeProject('/tmp/a', [makeChange('alpha', 'build')])])
    const { container } = renderAfk({ root: '', snapshot: mainSnapshot })
    await waitFor(() => expect(screen.getByText('demo-2')).toBeInTheDocument())
    const input = screen.getByPlaceholderText(/change 名|change name/i)
    const btn = screen.getByRole('button', { name: /挂队|Enqueue/i })
    // 修复前：两者都不受 root 影响，本两条断言都会失败——这就是红。
    expect(input).toBeDisabled()
    expect(btn).toBeDisabled()
    expect(container.querySelectorAll('datalist option')).toHaveLength(0)
  })

  it('非聚合语境（root="/tmp/a"）→ 挂队输入框/按钮不因语境本身 disabled（仍受空名规则约束）', async () => {
    const mainSnapshot = makeSnapshot([makeProject('/tmp/a', [makeChange('alpha', 'build')])])
    renderAfk({ root: '/tmp/a', snapshot: mainSnapshot })
    await waitFor(() => expect(screen.getByText('demo-2')).toBeInTheDocument())
    const input = screen.getByPlaceholderText(/change 名|change name/i)
    expect(input).not.toBeDisabled()
  })
})
