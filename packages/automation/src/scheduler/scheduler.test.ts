import { describe, expect, it } from 'vitest'
import type { RunOutcome } from '../types.js'
import { createScheduler } from './scheduler.js'
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

  it('verify-fail：预算内 → queued 重试；耗尽 → failed', async () => {
    // maxRetries=1：第一次失败 attempts 1<=1 → queued
    const s1 = makeState({ c: 'queued' })
    await createScheduler({
      state: s1.state,
      runChange: async () => outcome({ verifyResult: 'fail' }),
      registerShutdown: noopShutdown,
      config: { maxParallel: 1, maxRetries: 1, level: 'L3' },
    }).runRoundOnce(['c'])
    expect(s1.auto.get('c')).toBe('queued')

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

  it('runChange throw conflict 类 → conflict + 落 last_error/preserved_path', async () => {
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
})
