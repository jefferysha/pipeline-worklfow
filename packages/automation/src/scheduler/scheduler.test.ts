import { describe, expect, it } from 'vitest'
import type { RunOutcome } from '../types.js'
import { createScheduler, sanitize, sanitizePath } from './scheduler.js'
import type { SchedulerDeps, StateWriter } from './scheduler.js'

/** 内存 StateWriter fake：真状态机语义（claim/CAS/attempts），无 fs。 */
const makeState = (init: Record<string, string> = {}) => {
  const auto = new Map<string, string>(Object.entries(init))
  const fields = new Map<string, Record<string, string>>()
  const failedSync: string[] = []
  const daemonOwned = new Set(['running', 'scheduled'])
  const state: StateWriter = {
    async claim(name) {
      if (auto.get(name) !== 'queued') return false
      auto.set(name, 'scheduled')
      return true
    },
    async setAutomation(name, s) {
      auto.set(name, s)
    },
    async setField(name, field, value) {
      fields.set(name, { ...(fields.get(name) ?? {}), [field]: value })
    },
    async incrAttempts(name, max) {
      const prev = Number(fields.get(name)?.automation_attempts ?? '0')
      const value = prev + 1
      await state.setField(name, 'automation_attempts', String(value))
      return { value, exhausted: value > max }
    },
    async getAutomation(name) {
      return auto.get(name) ?? ''
    },
    async setAutomationOwned(name, next) {
      const cur = auto.get(name)
      if (cur && daemonOwned.has(cur)) {
        auto.set(name, next)
        return true
      }
      return false
    },
    markFailedSync(name) {
      failedSync.push(name)
      auto.set(name, 'failed')
    },
  }
  return { state, auto, fields, failedSync }
}

const outcome = (over: Partial<RunOutcome> = {}): RunOutcome => ({
  commits: [{ sha: 'a'.repeat(40) }],
  verifyResult: 'pass',
  buildSha: 'a'.repeat(40),
  phaseEvent: 'verify-pass',
  ...over,
})

const noopShutdown = () => () => {}

describe('scheduler round（真状态机写回 + 分级放权）', () => {
  it('未 claim 到（非 queued）→ 静默跳过，不跑 runChange', async () => {
    const { state, auto } = makeState({ c: 'running' })
    let ran = false
    const deps: SchedulerDeps = {
      state,
      runChange: async () => {
        ran = true
        return outcome()
      },
      registerShutdown: noopShutdown,
      config: { maxParallel: 2, maxRetries: 1, level: 'L1' },
    }
    await createScheduler(deps).runRoundOnce(['c'])
    expect(ran).toBe(false)
    expect(auto.get('c')).toBe('running') // 没被动
  })

  it('L1 report-only 成功 → paused（挂队跑完不自动 merge，安全默认）', async () => {
    const { state, auto } = makeState({ c: 'queued' })
    const deps: SchedulerDeps = {
      state,
      runChange: async () => outcome(),
      registerShutdown: noopShutdown,
      config: { maxParallel: 2, maxRetries: 1, level: 'L1' },
    }
    await createScheduler(deps).runRoundOnce(['c'])
    expect(auto.get('c')).toBe('paused')
  })

  it('L3 成功 → merged（无监管自动合并）', async () => {
    const { state, auto } = makeState({ c: 'queued' })
    const deps: SchedulerDeps = {
      state,
      runChange: async () => outcome(),
      registerShutdown: noopShutdown,
      config: { maxParallel: 2, maxRetries: 1, level: 'L3' },
    }
    await createScheduler(deps).runRoundOnce(['c'])
    expect(auto.get('c')).toBe('merged')
  })

  it('verify-fail：预算内 → queued 重试；耗尽 → failed；cause=verify-fail 与 last_error 同落（F-b）', async () => {
    // maxRetries=1：第一次失败 attempts 1<=1 → queued
    const s1 = makeState({ c: 'queued' })
    await createScheduler({
      state: s1.state,
      runChange: async () => outcome({ verifyResult: 'fail' }),
      registerShutdown: noopShutdown,
      config: { maxParallel: 1, maxRetries: 1, level: 'L3' },
    }).runRoundOnce(['c'])
    expect(s1.auto.get('c')).toBe('queued')
    expect(s1.fields.get('c')?.automation_last_error).toBe('verify-fail')
    expect(s1.fields.get('c')?.automation_cause).toBe('verify-fail')

    // attempts 已是 1：再失败 → 2>1 → failed
    const s2 = makeState({ c: 'queued' })
    s2.fields.set('c', { automation_attempts: '1' })
    await createScheduler({
      state: s2.state,
      runChange: async () => outcome({ verifyResult: 'fail' }),
      registerShutdown: noopShutdown,
      config: { maxParallel: 1, maxRetries: 1, level: 'L3' },
    }).runRoundOnce(['c'])
    expect(s2.auto.get('c')).toBe('failed')
  })

  it('runChange throw conflict 类 → conflict + 落 last_error/preserved_path + cause=conflict（F-b）', async () => {
    const { state, auto, fields } = makeState({ c: 'queued' })
    await createScheduler({
      state,
      runChange: async () => {
        throw { _tag: 'SyncError', message: 'merge conflict', preservedWorktreePath: '/wt/c' }
      },
      registerShutdown: noopShutdown,
      config: { maxParallel: 1, maxRetries: 1, level: 'L3' },
    }).runRoundOnce(['c'])
    expect(auto.get('c')).toBe('conflict')
    expect(fields.get('c')?.automation_preserved_path).toBe('/wt/c')
    expect(fields.get('c')?.automation_last_error).toBeTruthy()
    expect(fields.get('c')?.automation_cause).toBe('conflict')
  })

  it('F-b · dashboard 取消（CancelledRunError）→ conflict + cause=cancelled（读取端不再误判 unknown）', async () => {
    const { state, auto, fields } = makeState({ c: 'queued' })
    await createScheduler({
      state,
      runChange: async () => {
        throw { _tag: 'CancelledRunError', message: 'cancel requested via dashboard', preservedPath: '/wt/c' }
      },
      registerShutdown: noopShutdown,
      config: { maxParallel: 1, maxRetries: 1, level: 'L3' },
    }).runRoundOnce(['c'])
    expect(auto.get('c')).toBe('conflict')
    expect(fields.get('c')?.automation_cause).toBe('cancelled')
  })

  it('F-b · 未知错误（tag 不可干净判定）→ cause 同写空串，覆盖旧值（与 last_error 同写同清，防「消息换了成因还是旧的」撕裂）', async () => {
    const { state, fields } = makeState({ c: 'queued' })
    fields.set('c', { automation_cause: 'timeout', automation_last_error: 'agent idle timeout' }) // 上一轮残留
    await createScheduler({
      state,
      runChange: async () => {
        throw new Error('mystery infra boom')
      },
      registerShutdown: noopShutdown,
      config: { maxParallel: 1, maxRetries: 1, level: 'L3' },
    }).runRoundOnce(['c'])
    expect(fields.get('c')?.automation_last_error).toContain('mystery')
    expect(fields.get('c')?.automation_cause).toBe('') // 空串=未知，读取端 regex 兜底；绝不残留 timeout
  })

  it('并发 ≤ maxParallel（观察峰值）', async () => {
    const names = Array.from({ length: 8 }, (_, i) => `c${i}`)
    const init = Object.fromEntries(names.map((n) => [n, 'queued']))
    const { state } = makeState(init)
    let live = 0
    let peak = 0
    await createScheduler({
      state,
      runChange: async () => {
        live++
        peak = Math.max(peak, live)
        await new Promise((r) => setTimeout(r, 2))
        live--
        return outcome()
      },
      registerShutdown: noopShutdown,
      config: { maxParallel: 3, maxRetries: 1, level: 'L1' },
    }).runRoundOnce(names)
    expect(peak).toBeLessThanOrEqual(3)
  })

  it('allSettled：一个 change reject 不拖垮其余（其余照常 settle）', async () => {
    const { state, auto } = makeState({ good: 'queued', bad: 'queued' })
    await createScheduler({
      state,
      runChange: async (name) => {
        if (name === 'bad') throw new Error('boom-unhandled')
        return outcome()
      },
      registerShutdown: noopShutdown,
      config: { maxParallel: 2, maxRetries: 1, level: 'L3' },
    }).runRoundOnce(['good', 'bad'])
    expect(auto.get('good')).toBe('merged') // 未被 bad 连累
    expect(['queued', 'failed']).toContain(auto.get('bad')) // 分类为 retry
  })

  it('shutdown teardown 把 in-flight change 同步标 failed（kanban 不卡 running）', async () => {
    const { state, failedSync } = makeState({ c: 'queued' })
    let teardown: (() => void) | undefined
    const deps: SchedulerDeps = {
      state,
      runChange: async () => {
        // 运行到一半触发 shutdown：此刻 c 处于 in-flight(running)
        teardown?.()
        return outcome()
      },
      registerShutdown: (fn) => {
        teardown = fn
        return () => {}
      },
      config: { maxParallel: 1, maxRetries: 1, level: 'L3' },
    }
    await createScheduler(deps).runRoundOnce(['c'])
    expect(failedSync).toContain('c')
  })

  // B2（诚实核心）：noop 空跑（零 commit / buildSha 缺失，finalizeRunOutcome 打的诚实标志）即便
  // verify pass 也绝不落 merged——scan resolver 仅认 automation==merged 满足 dep，空跑落 merged =
  // 无产出解锁下游。settle 点（writeBackSuccess）必须消费 noop：落 paused，不解锁下游。
  it('B2 · noop 空跑在 L3 不落 merged（不空跑解锁下游）→ 落 paused + 诚实原因', async () => {
    const { state, auto, fields } = makeState({ c: 'queued' })
    await createScheduler({
      state,
      runChange: async () => outcome({ commits: [], buildSha: undefined, noop: true }),
      registerShutdown: noopShutdown,
      config: { maxParallel: 1, maxRetries: 1, level: 'L3' },
    }).runRoundOnce(['c'])
    expect(auto.get('c')).not.toBe('merged') // 关键：绝不空跑解锁下游
    expect(auto.get('c')).toBe('paused')
    expect(fields.get('c')?.automation_last_error).toBeTruthy() // 诚实原因可见
    expect(fields.get('c')?.automation_cause).toBe('no-op') // F-b：结构化成因与 last_error 同落
  })

  it('B2 · noop 空跑在 L1 仍落 paused（report-only 既有语义不回归）', async () => {
    const { state, auto } = makeState({ c: 'queued' })
    await createScheduler({
      state,
      runChange: async () => outcome({ commits: [], buildSha: undefined, noop: true }),
      registerShutdown: noopShutdown,
      config: { maxParallel: 1, maxRetries: 1, level: 'L1' },
    }).runRoundOnce(['c'])
    expect(auto.get('c')).toBe('paused')
  })

  it('B2 · 非 noop 真 run 在 L3 仍落 merged（正常解锁下游不回归）', async () => {
    const { state, auto } = makeState({ c: 'queued' })
    await createScheduler({
      state,
      runChange: async () => outcome({ noop: false }),
      registerShutdown: noopShutdown,
      config: { maxParallel: 1, maxRetries: 1, level: 'L3' },
    }).runRoundOnce(['c'])
    expect(auto.get('c')).toBe('merged')
  })

  // B5：claim 已把 queued→scheduled；setAutomation('running')（在 inFlight.add 前）若抛错，异常被
  // allSettled 吞掉，change 卡 scheduled 永不复捡（scanReady 只捡 queued）→ 孤儿。该段必须包错误处理，
  // 复位 queued（可复捡）或标 failed（耗尽），绝不留 scheduled 孤儿。
  it('B5 · setAutomation(running) 抛错 → 不留 scheduled 孤儿（复位 queued/failed），不跑 runChange', async () => {
    const { state, auto } = makeState({ c: 'queued' })
    const origSet = state.setAutomation
    state.setAutomation = async (name, s) => {
      if (s === 'running') throw new Error('store hiccup on running')
      return origSet(name, s)
    }
    let ran = false
    await createScheduler({
      state,
      runChange: async () => {
        ran = true
        return outcome()
      },
      registerShutdown: noopShutdown,
      config: { maxParallel: 1, maxRetries: 1, level: 'L3' },
    }).runRoundOnce(['c'])
    expect(auto.get('c')).not.toBe('scheduled') // 绝不卡 scheduled 孤儿
    expect(['queued', 'failed']).toContain(auto.get('c')) // 复位可复捡 / 标 failed
    expect(ran).toBe(false) // running 从没成功 → 不该起跑
  })

  it('B5 · setAutomation(running) 抛错不连累同轮其余 change（allSettled 收口）', async () => {
    const { state, auto } = makeState({ bad: 'queued', good: 'queued' })
    const origSet = state.setAutomation
    state.setAutomation = async (name, s) => {
      if (name === 'bad' && s === 'running') throw new Error('store hiccup')
      return origSet(name, s)
    }
    await createScheduler({
      state,
      runChange: async () => outcome(),
      registerShutdown: noopShutdown,
      config: { maxParallel: 2, maxRetries: 1, level: 'L3' },
    }).runRoundOnce(['bad', 'good'])
    expect(auto.get('good')).toBe('merged') // 未被 bad 连累
    expect(auto.get('bad')).not.toBe('scheduled') // bad 也不留孤儿
  })
})

/**
 * 真机验收 P1（2026-07-11）：sanitize 的 slice(0,200) 只该管"错误消息别爆长"，绝不该管路径——
 * automation_worktree/automation_preserved_path 是要被 cancelAfkRun / 现场恢复按原样使用的真路径，
 * 深路径项目（>200 字符）被截断后 cancel 按残path写 .cancel-requested → ENOENT → 500。
 * 拆成两个导出：sanitizePath（四闸清洗、不截断）与 sanitize（同一清洗 + 200 字符截断，错误消息用）。
 */
describe('sanitize / sanitizePath —— 四闸消毒的截断纪律（深路径 P1）', () => {
  it('sanitizePath：>200 字符的深 worktree 全路径完整保留（不截断），干净路径原样返回', () => {
    const deep = `/Users/x/${'p'.repeat(220)}/.sandcastle/worktrees/sandcastle-pipeline-af-fix-thing`
    expect(deep.length).toBeGreaterThan(200)
    expect(sanitizePath(deep)).toBe(deep)
  })

  it('sanitizePath：仍做与 sanitize 同一份四闸清洗（换行 / ": " / " #" / 首引号）', () => {
    expect(sanitizePath('"a\nb: c #d')).toBe('a b; c d')
    expect(sanitizePath('')).toBe('error')
  })

  it('sanitize（错误消息用）：保持 ≤200 字符截断（automation_last_error 既有契约不回归）', () => {
    expect(sanitize('e'.repeat(500)).length).toBeLessThanOrEqual(200)
    expect(sanitize('x\ny: z #w')).toBe('x y; z w')
  })
})
