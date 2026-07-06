/**
 * supervisor —— 生命周期编排子组件单测（EchoAdapter / ShutdownController 幂等漏斗 + kill ladder /
 * applyParseResult stdout 泵 / inboxEventEligible / IdleTimer 三重护栏）。用 fake child + 手动 scheduler
 * 精确验证信号梯与事件映射。真 fork worker 三循环桥接在 channel-process.integration.test.ts。
 */
import { describe, expect, test } from 'vitest'
import {
  applyParseResult,
  EchoAdapter,
  echoOnlyAdapters,
  IdleTimer,
  inboxEventEligible,
  ShutdownController,
  type Scheduler,
} from './supervisor.js'
import { TurnTracker } from './turns.js'
import type { WorkerProcess } from './process.js'
import type { EventPartial } from './types.js'

/** fake WorkerProcess：记 kill/closeStdin/write，exited 可控。 */
function fakeChild(): WorkerProcess & { kills: string[]; stdinClosed: boolean; writes: string[]; setExited: (v: boolean) => void } {
  let exited = false
  const kills: string[] = []
  const writes: string[] = []
  return {
    kills,
    writes,
    stdinClosed: false,
    get pid() { return 1234 },
    write(d) { writes.push(d) },
    closeStdin() { (this as { stdinClosed: boolean }).stdinClosed = true },
    onStdoutLine() {},
    onStderr() {},
    onSpawn() {},
    onError() {},
    onExit() {},
    exited: () => exited,
    kill: (sig = 'SIGTERM') => { kills.push(sig); return true },
    setExited: (v: boolean) => { exited = v },
  }
}

/** 手动 scheduler：捕获 (fn, ms)，测试显式步进。 */
function manualScheduler(): { schedule: Scheduler; steps: { fn: () => void; ms: number }[]; runAll: () => void } {
  const steps: { fn: () => void; ms: number }[] = []
  const schedule: Scheduler = (fn, ms) => {
    const entry = { fn, ms }
    steps.push(entry)
    return () => {
      const i = steps.indexOf(entry)
      if (i >= 0) steps.splice(i, 1)
    }
  }
  const runAll = (): void => {
    // 逐个跑（step2 会再排 step3）
    while (steps.length > 0) {
      const s = steps.shift()!
      s.fn()
    }
  }
  return { schedule, steps, runAll }
}

describe('EchoAdapter / echoOnlyAdapters', () => {
  test('encode 追换行；parseLine 回显 → done(text)；is_ready 恒 true', () => {
    const a = new EchoAdapter()
    expect(a.provider).toBe('cat')
    expect(a.buildArgs()).toEqual(['-u'])
    expect(a.encodeUserMessage('hi', a.createCtx())).toBe('hi\n')
    expect(a.isReady()).toBe(true)
    expect(a.parseLine('  echoed  ')).toEqual({ events: [{ kind: 'done', payload: { text: 'echoed' } }], side: null })
  })
  test('echoOnlyAdapters：echo/cat → EchoAdapter；其他 → 抛（本批仅 echo）', () => {
    expect(echoOnlyAdapters('echo')).toBeInstanceOf(EchoAdapter)
    expect(echoOnlyAdapters('cat')).toBeInstanceOf(EchoAdapter)
    expect(() => echoOnlyAdapters('claude')).toThrow(/仅 echo/)
  })
})

describe('ShutdownController 幂等漏斗 + kill ladder', () => {
  test('request 一次性：写 ONE killed(by=supervisor:) + kill ladder（closeStdin→SIGTERM→SIGKILL）', async () => {
    const appended: EventPartial[] = []
    const child = fakeChild()
    const m = manualScheduler()
    const sc = new ShutdownController({
      worker: 'w1',
      append: (p) => appended.push(p),
      child: () => child,
      graceMs: 100,
      schedule: m.schedule,
    })
    await sc.request('SIGTERM', 'explicit-kill')
    // killed 立即写（一次）
    expect(appended.filter((e) => e.kind === 'killed')).toHaveLength(1)
    expect(appended[0]).toMatchObject({ kind: 'killed', by: 'supervisor:w1', reason: 'explicit-kill', signal: 'SIGTERM' })
    expect(child.stdinClosed).toBe(true)
    // 步进 ladder：child 未退 → SIGTERM，再 SIGKILL
    m.runAll()
    expect(child.kills).toEqual(['SIGTERM', 'SIGKILL'])
    sc.dispose()
  })

  test('幂等：第二次 request 不再写 killed', async () => {
    const appended: EventPartial[] = []
    const child = fakeChild()
    const sc = new ShutdownController({ worker: 'w1', append: (p) => appended.push(p), child: () => child, graceMs: 5, schedule: () => () => {} })
    await sc.request('SIGTERM', 'explicit-kill')
    await sc.request('SIGINT', 'timeout')
    expect(appended.filter((e) => e.kind === 'killed')).toHaveLength(1)
    sc.dispose()
  })

  test('ladder：child 已退 → 不再发信号', async () => {
    const child = fakeChild()
    child.setExited(true)
    const m = manualScheduler()
    const sc = new ShutdownController({ worker: 'w1', append: () => {}, child: () => child, graceMs: 5, schedule: m.schedule })
    await sc.request('SIGTERM', 'explicit-kill')
    m.runAll()
    expect(child.kills).toEqual([])
    sc.dispose()
  })

  test('finalizeOnExit 冷退出合成：无 reason 且无 terminal → done(synthesized) code=0', async () => {
    const appended: EventPartial[] = []
    const child = fakeChild()
    const sc = new ShutdownController({ worker: 'w1', append: (p) => appended.push(p), child: () => child, schedule: () => () => {} })
    await sc.finalizeOnExit(0, null)
    expect(appended).toHaveLength(1)
    expect(appended[0]).toMatchObject({ kind: 'done', by: 'w1', synthesized: true, exit_code: 0 })
  })

  test('finalizeOnExit：非 0 退出 → error(synthesized) 携 exit_code/signal', async () => {
    const appended: EventPartial[] = []
    const child = fakeChild()
    const sc = new ShutdownController({ worker: 'w1', append: (p) => appended.push(p), child: () => child, schedule: () => () => {} })
    await sc.finalizeOnExit(1, 'SIGSEGV')
    expect(appended[0]).toMatchObject({ kind: 'error', by: 'w1', synthesized: true, exit_code: 1, exit_signal: 'SIGSEGV' })
  })

  test('finalizeOnExit：已 markTerminalEmitted → 不合成（防双 terminal）', async () => {
    const appended: EventPartial[] = []
    const child = fakeChild()
    const sc = new ShutdownController({ worker: 'w1', append: (p) => appended.push(p), child: () => child, schedule: () => () => {} })
    sc.markTerminalEmitted()
    await sc.finalizeOnExit(0, null)
    expect(appended).toHaveLength(0)
  })

  test('finalizeOnExit：有显式 shutdown reason → 不冷退出合成（killed 已 terminal）', async () => {
    const appended: EventPartial[] = []
    const child = fakeChild()
    const sc = new ShutdownController({ worker: 'w1', append: (p) => appended.push(p), child: () => child, graceMs: 5, schedule: () => () => {} })
    await sc.request('SIGTERM', 'explicit-kill') // reason set + killed 写
    appended.length = 0
    await sc.finalizeOnExit(0, null)
    expect(appended.filter((e) => e.kind === 'done')).toHaveLength(0)
    sc.dispose()
  })

  test('timeout reason 携 timeout_ms', async () => {
    const appended: EventPartial[] = []
    const child = fakeChild()
    const sc = new ShutdownController({ worker: 'w1', append: (p) => appended.push(p), child: () => child, timeoutMs: 5000, graceMs: 5, schedule: () => () => {} })
    await sc.request('SIGTERM', 'timeout')
    expect(appended[0]).toMatchObject({ kind: 'killed', reason: 'timeout', timeout_ms: 5000 })
    sc.dispose()
  })
})

describe('applyParseResult stdout 泵', () => {
  test('done 事件 → append done(by=worker) + turn_finished + markTerminalEmitted', () => {
    const appended: EventPartial[] = []
    const child = fakeChild()
    const sc = new ShutdownController({ worker: 'w1', append: () => {}, child: () => child, schedule: () => () => {} })
    const tt = new TurnTracker()
    tt.begin(5) // 有活 turn
    applyParseResult('w1', { events: [{ kind: 'done', payload: { text: 'ok' } }] }, child, sc, (p) => appended.push(p), () => {}, tt)
    expect(appended.map((e) => e.kind)).toEqual(['done', 'turn_finished'])
    expect(appended[0]).toMatchObject({ kind: 'done', by: 'w1', text: 'ok' })
    expect(appended[1]).toMatchObject({ kind: 'turn_finished', worker: 'w1', turnId: 'msg:5', outcome: 'done' })
    expect(sc.hasTerminalEvent()).toBe(true)
  })

  test('side.reply 回写 stdin；persistSessionId → persist 回调', () => {
    const child = fakeChild()
    const sc = new ShutdownController({ worker: 'w1', append: () => {}, child: () => child, schedule: () => () => {} })
    const persisted: [string, string][] = []
    applyParseResult('w1', { events: [], side: { reply: ['r1\n', 'r2\n'], persistSessionId: 'sess-9' } }, child, sc, () => {}, (s, v) => persisted.push([s, v]))
    expect(child.writes).toEqual(['r1\n', 'r2\n'])
    expect(persisted).toEqual([['session-id', 'sess-9']])
  })
})

describe('inboxEventEligible 过滤（inbox_watcher）', () => {
  const worker = 'w1'
  test('自己发的 message → 不处理', () => {
    expect(inboxEventEligible({ seq: 1, ts: '', kind: 'message', by: 'w1', text: 'x' }, worker, 'explicitOnly')).toBe(false)
  })
  test('定向 message → 处理', () => {
    expect(inboxEventEligible({ seq: 1, ts: '', kind: 'message', by: 'a', to: 'w1', text: 'x' }, worker, 'explicitOnly')).toBe(true)
  })
  test('broadcast message：explicitOnly 不收 / broadcastAndExplicit 收', () => {
    const ev = { seq: 1, ts: '', kind: 'message', by: 'a', text: 'x' } as const
    expect(inboxEventEligible(ev, worker, 'explicitOnly')).toBe(false)
    expect(inboxEventEligible(ev, worker, 'broadcastAndExplicit')).toBe(true)
  })
  test('interrupt_requested worker==self → 处理；否则不', () => {
    expect(inboxEventEligible({ seq: 1, ts: '', kind: 'interrupt_requested', by: 'a', worker: 'w1', message: 'stop' }, worker, 'explicitOnly')).toBe(true)
    expect(inboxEventEligible({ seq: 1, ts: '', kind: 'interrupt_requested', by: 'a', worker: 'w2', message: 'stop' }, worker, 'explicitOnly')).toBe(false)
  })
  test('其他 kind（done/progress）→ 不处理', () => {
    expect(inboxEventEligible({ seq: 1, ts: '', kind: 'done', by: 'a' }, worker, 'explicitOnly')).toBe(false)
  })
})

describe('IdleTimer 三重护栏', () => {
  test('idleTimeoutMs<=0 → 从不 fire（禁用）', () => {
    const child = fakeChild()
    const sc = new ShutdownController({ worker: 'w1', append: () => {}, child: () => child, schedule: () => () => {} })
    const m = manualScheduler()
    new IdleTimer(0, sc, () => child.exited(), m.schedule)
    expect(m.steps).toHaveLength(0)
  })

  test('fire：正常 → request idle-timeout shutdown', async () => {
    const appended: EventPartial[] = []
    const child = fakeChild()
    const sc = new ShutdownController({ worker: 'w1', append: (p) => appended.push(p), child: () => child, idleTimeoutMs: 1000, graceMs: 5, schedule: () => () => {} })
    const m = manualScheduler()
    new IdleTimer(1000, sc, () => child.exited(), m.schedule)
    m.steps.shift()!.fn() // fire
    await Promise.resolve()
    expect(appended.some((e) => e.kind === 'killed' && e.reason === 'idle-timeout')).toBe(true)
  })

  test('fire 时 child 已退 → 护栏拦，不 request', () => {
    const appended: EventPartial[] = []
    const child = fakeChild()
    child.setExited(true)
    const sc = new ShutdownController({ worker: 'w1', append: (p) => appended.push(p), child: () => child, schedule: () => () => {} })
    const m = manualScheduler()
    new IdleTimer(1000, sc, () => child.exited(), m.schedule)
    m.steps.shift()!.fn()
    expect(appended).toHaveLength(0)
  })

  test('pause 后不再有排程；reset 重新排', () => {
    const child = fakeChild()
    const sc = new ShutdownController({ worker: 'w1', append: () => {}, child: () => child, schedule: () => () => {} })
    const m = manualScheduler()
    const t = new IdleTimer(1000, sc, () => child.exited(), m.schedule)
    expect(m.steps).toHaveLength(1)
    t.pause()
    expect(m.steps).toHaveLength(0)
    t.reset()
    expect(m.steps).toHaveLength(1)
    t.dispose()
  })
})
