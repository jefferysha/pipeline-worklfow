import { describe, expect, it } from 'vitest'
import { type ChangeQueueEntry, readyCandidates } from './scan.js'

/** 简易 DepResolver：给定"已满足"集合。 */
const resolver = (satisfied: string[]) => ({ satisfied: (dep: string) => satisfied.includes(dep) })

const entry = (over: Partial<ChangeQueueEntry> & { name: string }): ChangeQueueEntry => ({
  phase: 'build',
  automation: 'queued',
  archived: 'false',
  automationQueuedAt: '',
  dependsOn: [],
  ...over,
})

describe('挂起队列扫描 + 拓扑/FIFO 排序（老仓 automation-queue.sh:1-110）', () => {
  it('候选过滤：仅 phase=build && automation=queued', () => {
    const entries = [
      entry({ name: 'a', automationQueuedAt: '2026-01-01T00:00:00Z' }),
      entry({ name: 'b', phase: 'verify', automationQueuedAt: '2026-01-01T00:00:01Z' }), // 相位不符
      entry({ name: 'c', automation: 'scheduled', automationQueuedAt: '2026-01-01T00:00:02Z' }), // 已被认领
      entry({ name: 'd', automation: 'off', automationQueuedAt: '2026-01-01T00:00:03Z' }),
      entry({ name: 'archived', archived: 'true', automationQueuedAt: '2026-01-01T00:00:04Z' }),
    ]
    expect(readyCandidates(entries, resolver([]))).toEqual(['a'])
  })

  it('depends_on 全满足才就绪；dep 未满足 → 排除（保守不放行）', () => {
    const entries = [
      entry({ name: 'a', dependsOn: ['x'], automationQueuedAt: '2026-01-01T00:00:00Z' }),
      entry({ name: 'b', dependsOn: ['x', 'y'], automationQueuedAt: '2026-01-01T00:00:01Z' }),
    ]
    // 只 x 满足：a 就绪，b（还差 y）不就绪
    expect(readyCandidates(entries, resolver(['x']))).toEqual(['a'])
  })

  it('无依赖（[] / null）直接就绪', () => {
    const entries = [
      entry({ name: 'a', dependsOn: [], automationQueuedAt: '2026-01-01T00:00:00Z' }),
      entry({ name: 'b', dependsOn: ['null'], automationQueuedAt: '2026-01-01T00:00:01Z' }),
    ]
    expect(readyCandidates(entries, resolver([]))).toEqual(['a', 'b'])
  })

  it('同层按 automation_queued_at FIFO（ISO8601 字典序 == 时间序）', () => {
    const entries = [
      entry({ name: 'late', automationQueuedAt: '2026-01-01T09:00:00Z' }),
      entry({ name: 'early', automationQueuedAt: '2026-01-01T08:00:00Z' }),
    ]
    expect(readyCandidates(entries, resolver([]))).toEqual(['early', 'late'])
  })

  it('空 queued_at 排最后（高位 ~ 兜底，不抢队首）', () => {
    const entries = [
      entry({ name: 'noqa', automationQueuedAt: '' }),
      entry({ name: 'hasqa', automationQueuedAt: '2026-01-01T08:00:00Z' }),
    ]
    expect(readyCandidates(entries, resolver([]))).toEqual(['hasqa', 'noqa'])
  })
})
