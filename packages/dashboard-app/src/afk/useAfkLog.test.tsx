/**
 * useAfkLog —— AFK 日志轮询 hook（Task 12，评审 P0-3「日志选中拉一次即永久冻结」修复）。
 *
 * fake timers 下一律用 `vi.waitFor`（不用 `@testing-library/react` 的 `waitFor`）——复刻
 * WorkflowCanvas.test.tsx Task 8 用例的既有踩坑记录：RTL 的 `waitFor` 内部轮询走的
 * `setTimeout` 会被 `vi.useFakeTimers()` 一并接管，从而永远等不到自己的下一次检查；
 * `vi.waitFor` 是计时器实现感知的，两者不可混用（同一份 fake-timers 作用域内只用后者）。
 *
 * 断言统一等 `result.current.log` 落到期望值，不单等 mock fetch 的调用计数——实测踩过一次坑：
 * `stubLogFetch()` 的 mock 函数体在第一个 `await` 之前就会同步执行到 `n += 1`，调用计数几乎
 * 立即变化，但 `fetchLog()` 内部还有 `await fetch(...)` → `await res.json()` 两跳微任务才会真正
 * 落到 `setLog(...)`；只等计数会在状态还没落定时就提前通过，等 `log` 内容本身则天然把这几跳
 * 微任务的结算也纳入了等待条件，不会出现"看起来轮询了但状态其实没变"的假阳性。
 */
import type { ReactNode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { AFK_LOG_POLL_INTERVAL_MS, useAfkLog } from './useAfkLog'

function wrapper({ children }: { children: ReactNode }): JSX.Element {
  return <I18nProvider>{children}</I18nProvider>
}

/** 打桩 /api/afk/demo/log；每次调用内容不同（`line N`），断言可以区分"没再拉"和"拉到了但内容没变"。 */
function stubLogFetch(): () => number {
  let n = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.startsWith('/api/afk/demo/log')) {
        n += 1
        return new Response(JSON.stringify({ log: `line ${n}\n` }), { status: 200 })
      }
      throw new Error(`unexpected fetch ${url}`)
    }),
  )
  return () => n
}

/**
 * 手动控制的 Promise：制造"两个请求同时在途、谁先落地谁后落地由测试摆布"的窗口——用于验证
 * 请求级乱序 guard（评审 Important B）。做法对齐 BoardView.test.tsx / SettingsView.test.tsx 的
 * 既有 deferred() 先例。
 */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useAfkLog', () => {
  it('status="running" 时每 AFK_LOG_POLL_INTERVAL_MS 自动再拉一次日志', async () => {
    const calls = stubLogFetch()
    const { result } = renderHook(() => useAfkLog('demo', 'running', '/tmp/a'), { wrapper })
    await vi.waitFor(() => expect(result.current.log).toBe('line 1\n'))
    expect(calls()).toBe(1)

    act(() => {
      vi.advanceTimersByTime(AFK_LOG_POLL_INTERVAL_MS)
    })
    await vi.waitFor(() => expect(result.current.log).toBe('line 2\n'))
    expect(calls()).toBe(2)

    act(() => {
      vi.advanceTimersByTime(AFK_LOG_POLL_INTERVAL_MS)
    })
    await vi.waitFor(() => expect(result.current.log).toBe('line 3\n'))
    expect(calls()).toBe(3)
  })

  it('follow=false 暂停自动轮询（首次选中那一次不受影响——既有行为保持）', async () => {
    const calls = stubLogFetch()
    const { result } = renderHook(() => useAfkLog('demo', 'running', '/tmp/a'), { wrapper })
    await vi.waitFor(() => expect(result.current.log).toBe('line 1\n'))

    act(() => {
      result.current.setFollow(false)
    })

    act(() => {
      vi.advanceTimersByTime(AFK_LOG_POLL_INTERVAL_MS * 3)
    })
    // follow=false 之后 setInterval 从未被建立（effect 早退），没有任何异步链可等——三个轮询
    // 周期的虚拟时间流逝后同步断言即可，不需要 vi.waitFor。
    expect(calls()).toBe(1)
    expect(result.current.log).toBe('line 1\n')
  })

  it('refresh() 手动拉一次，不受 follow/status 门禁限制', async () => {
    const calls = stubLogFetch()
    const { result } = renderHook(() => useAfkLog('demo', 'paused', '/tmp/a'), { wrapper })
    await vi.waitFor(() => expect(result.current.log).toBe('line 1\n'))

    await act(async () => {
      await result.current.refresh()
    })
    expect(calls()).toBe(2)
    expect(result.current.log).toBe('line 2\n')
  })

  it('status 非 running 时不建立轮询（首次选中仍拉一次，既有行为保持）', async () => {
    const calls = stubLogFetch()
    const { result } = renderHook(() => useAfkLog('demo', 'paused', '/tmp/a'), { wrapper })
    await vi.waitFor(() => expect(result.current.log).toBe('line 1\n'))

    act(() => {
      vi.advanceTimersByTime(AFK_LOG_POLL_INTERVAL_MS * 3)
    })
    expect(calls()).toBe(1)
    expect(result.current.log).toBe('line 1\n')
  })

  it('并发请求乱序防御：同一目标下先发起的请求晚落地，不能用旧内容覆盖后发起请求已写好的结果（评审 Important B）', async () => {
    // calls===1 是挂载自带的首次拉取，立即结算，与本用例要验证的乱序无关，先让它落定排除干扰；
    // calls===2/3 分别是下面两次显式 refresh() 触发的并发请求，各自挂在独立 gate 上手动摆布顺序。
    const gateA = deferred<Response>()
    const gateB = deferred<Response>()
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (!url.startsWith('/api/afk/demo/log')) throw new Error(`unexpected fetch ${url}`)
        calls += 1
        if (calls === 1) return new Response(JSON.stringify({ log: 'line 0\n' }), { status: 200 })
        return calls === 2 ? gateA.promise : gateB.promise
      }),
    )

    const { result } = renderHook(() => useAfkLog('demo', 'paused', '/tmp/a'), { wrapper })
    await vi.waitFor(() => expect(result.current.log).toBe('line 0\n'))

    let pA!: Promise<void>
    let pB!: Promise<void>
    act(() => {
      pA = result.current.refresh() // req A：先发起
    })
    act(() => {
      pB = result.current.refresh() // req B：后发起，此时 req A 仍未落地——同一目标真并发
    })
    expect(calls).toBe(3) // 两次 fetch 调用均已同步发出，都还没结算

    // 后发起的 req B 先落地
    await act(async () => {
      gateB.resolve(new Response(JSON.stringify({ log: 'req-B\n' }), { status: 200 }))
      await pB
    })
    expect(result.current.log).toBe('req-B\n')

    // 先发起的 req A 晚落地。旧的 requestKeyRef guard 只比较目标 key（root+name 未变，两次请求
    // key 相同，guard 拦不住），会用这份过期内容覆盖上面 req B 已经写好的结果——这里应保持
    // 'req-B\n' 不变（新的请求级序号 guard 识别出 req A 已经不是最新发起的一次，落地时丢弃）。
    await act(async () => {
      gateA.resolve(new Response(JSON.stringify({ log: 'req-A\n' }), { status: 200 }))
      await pA
    })
    expect(result.current.log).toBe('req-B\n')
  })
})
