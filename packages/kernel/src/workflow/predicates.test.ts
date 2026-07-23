/**
 * TrackPredicate 单测（2026-07-17 P0）——guard 层（flow/guard.ts 相位出口规则的 when= 条件）
 * 与 transition 层（flow/transition-table.ts 事件前置校验的 pm 豁免）共用的 track 判定原语。
 * 矩阵：kind × 命中/不命中 × 空 values 边界 + NON_PM 共享实例的语义锚。
 */
import { describe, expect, it } from 'vitest'
import { matchesTrackPredicate, NON_PM, type TrackPredicate } from './predicates.js'

describe('matchesTrackPredicate', () => {
  const IN_FE_BE: TrackPredicate = { kind: 'track-in', values: ['backend', 'frontend'] }
  const NOT_IN_FE_BE: TrackPredicate = { kind: 'track-not-in', values: ['backend', 'frontend'] }

  it('track-in：track 在 values 里才命中', () => {
    expect(matchesTrackPredicate(IN_FE_BE, 'backend')).toBe(true)
    expect(matchesTrackPredicate(IN_FE_BE, 'frontend')).toBe(true)
    expect(matchesTrackPredicate(IN_FE_BE, 'pm')).toBe(false)
    expect(matchesTrackPredicate(IN_FE_BE, 'chat')).toBe(false)
    expect(matchesTrackPredicate(IN_FE_BE, '')).toBe(false)
  })

  it('track-not-in：track 不在 values 里才命中', () => {
    expect(matchesTrackPredicate(NOT_IN_FE_BE, 'backend')).toBe(false)
    expect(matchesTrackPredicate(NOT_IN_FE_BE, 'frontend')).toBe(false)
    expect(matchesTrackPredicate(NOT_IN_FE_BE, 'pm')).toBe(true)
    expect(matchesTrackPredicate(NOT_IN_FE_BE, 'ml')).toBe(true)
    expect(matchesTrackPredicate(NOT_IN_FE_BE, '')).toBe(true)
  })

  it('空 values 边界：track-in 恒不命中；track-not-in 恒命中', () => {
    expect(matchesTrackPredicate({ kind: 'track-in', values: [] }, 'backend')).toBe(false)
    expect(matchesTrackPredicate({ kind: 'track-in', values: [] }, '')).toBe(false)
    expect(matchesTrackPredicate({ kind: 'track-not-in', values: [] }, 'backend')).toBe(true)
    expect(matchesTrackPredicate({ kind: 'track-not-in', values: [] }, '')).toBe(true)
  })

  it('NON_PM 共享实例：pm 不命中；其余 track（含 chat、未知 ml、空串）都命中', () => {
    expect(matchesTrackPredicate(NON_PM, 'pm')).toBe(false)
    for (const track of ['backend', 'frontend', 'chat', 'ml', '']) {
      expect(matchesTrackPredicate(NON_PM, track)).toBe(true)
    }
  })
})
