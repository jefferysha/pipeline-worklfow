/**
 * guard —— worker 只读事实 + spawn 预算裁决（纯决策核心）。
 * 老仓真相源：skills/pipeline/scripts/channel/guard.py。老仓单文件混装的 OS 扫描/SIGTERM 执行面，
 * 本仓按模块边界拆去同目录 liveness.ts（scanLiveWorkers:90 做四重**探测**——注意它会收录
 * supervisorVerified=false 的记录、只是打上标记，真正以 verified=true 为前提发 SIGTERM 的是
 * cleanupExpiredIdleWorkers:146→:161），guard.ts 只留不碰 OS 的纯谓词——故本测试零进程、零信号、零 fs。
 *
 * ★红线：guard 只读地为 barrier 提供 worker 事实，绝不触 barrier/三门/build_sha。
 */
import { describe, expect, test } from 'vitest'
import type { ChannelEvent, WorkerState } from './types.js'
import {
  formatBudgetOverflowError,
  isIdleCleanupEligible,
  liveWorkerCandidates,
  parseIsoMs,
  spawnBudgetVerdict,
} from './guard.js'
import { reduceWorkerRegistry } from './worker-state.js'

const ev = (o: Partial<ChannelEvent> & { seq: number; kind: string; by: string }): ChannelEvent => o as ChannelEvent

describe('liveWorkerCandidates（判定①：durable 投影非 terminal）', () => {
  test('剔除 terminal，保留活 worker', () => {
    const evs = [
      ev({ seq: 1, kind: 'spawned', by: 'sup', as: 'live', ts: 't1' }),
      ev({ seq: 2, kind: 'spawned', by: 'sup', as: 'dead', ts: 't2' }),
      ev({ seq: 3, kind: 'killed', by: 'sup', worker: 'dead', ts: 't3' }),
    ]
    const workers = reduceWorkerRegistry(evs).workers
    expect(liveWorkerCandidates(workers).map((w) => w.id)).toEqual(['live'])
  })
})

describe('parseIsoMs（guard.py:67）', () => {
  test('…Z → epoch ms', () => {
    expect(parseIsoMs('2026-07-07T00:00:00Z')).toBe(Date.parse('2026-07-07T00:00:00Z'))
  })
  test('解析失败 → undefined', () => {
    expect(parseIsoMs('not-a-date')).toBeUndefined()
    expect(parseIsoMs(undefined)).toBeUndefined()
  })
})

describe('isIdleCleanupEligible（guard.py:206：两条永不杀铁律）', () => {
  const base = (o: Partial<WorkerState>): WorkerState =>
    ({ id: 'w', lifecycle: 'running', activity: 'idle', terminal: false, ...o }) as WorkerState

  test('idleTimeoutMs<=0 禁用 → false', () => {
    expect(isIdleCleanupEligible({ state: base({ idleSince: '2026-01-01T00:00:00Z' }) }, 0, Date.now())).toBe(false)
  })
  test('mid-turn 永不杀', () => {
    const s = base({ activity: 'mid-turn', idleSince: '2026-01-01T00:00:00Z' })
    expect(isIdleCleanupEligible({ state: s }, 1000, Date.parse('2026-01-01T01:00:00Z'))).toBe(false)
  })
  test('无 idleSince 永不杀', () => {
    expect(isIdleCleanupEligible({ state: base({}) }, 1000, Date.now())).toBe(false)
  })
  test('idle 超时 → 可清理', () => {
    const s = base({ idleSince: '2026-01-01T00:00:00Z' })
    const now = Date.parse('2026-01-01T00:00:10Z')
    expect(isIdleCleanupEligible({ state: s }, 5000, now)).toBe(true)
  })
  test('idle 未超时 → 不清理', () => {
    const s = base({ idleSince: '2026-01-01T00:00:00Z' })
    const now = Date.parse('2026-01-01T00:00:03Z')
    expect(isIdleCleanupEligible({ state: s }, 5000, now)).toBe(false)
  })
  test('terminal → 不清理', () => {
    const s = base({ terminal: true, idleSince: '2026-01-01T00:00:00Z' })
    expect(isIdleCleanupEligible({ state: s }, 1000, Date.parse('2026-01-01T01:00:00Z'))).toBe(false)
  })
})

describe('spawnBudgetVerdict（guard.py:278：allowed 判定）', () => {
  test('maxLiveWorkers<=0 → 禁用预算，恒 allowed', () => {
    expect(spawnBudgetVerdict(99, 0).allowed).toBe(true)
    expect(spawnBudgetVerdict(99, -1).allowed).toBe(true)
  })
  test('live < max → allowed', () => {
    expect(spawnBudgetVerdict(1, 2).allowed).toBe(true)
  })
  test('live >= max → 拒（reject not guess）', () => {
    expect(spawnBudgetVerdict(2, 2).allowed).toBe(false)
    expect(spawnBudgetVerdict(3, 2).allowed).toBe(false)
  })
})

describe('formatBudgetOverflowError（guard.py:306：列活跃 + 三提示，绝不自动杀）', () => {
  test('含 header / 每 worker 一行 / kill 提示', () => {
    const live = [{ channel: 'chatty', workerId: 'w1', provider: 'echo', lifecycle: 'running', activity: 'idle', supervisorPid: 123 }]
    const msg = formatBudgetOverflowError('proj', live, 1)
    expect(msg).toContain("Live worker budget exhausted for project 'proj'")
    expect(msg).toContain("channel='chatty' worker='w1'")
    expect(msg).toContain('kill <channel> --as <worker>')
    // 绝不建议自动选一个杀
    expect(msg).not.toMatch(/auto.?kill|automatically kill/i)
  })
})
