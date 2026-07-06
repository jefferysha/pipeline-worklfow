/**
 * mem/filter —— 项目/时间范围过滤原语（真逻辑）。since/until 为 epoch ms。
 * 对位老仓 skills/pipeline/scripts/mem/filter.py。
 */
import { describe, expect, test } from 'vitest'
import { inRange, inRangeOverlap, sameProject } from './filter.js'

const ms = (s: string): number => Date.parse(s)

describe('sameProject —— cwd 作用域（老仓 same_project:74）', () => {
  test('精确相等 → true', () => {
    expect(sameProject('/home/u/proj', '/home/u/proj')).toBe(true)
  })
  test('后代目录 → true', () => {
    expect(sameProject('/home/u/proj/sub', '/home/u/proj')).toBe(true)
  })
  test('前缀误匹配防护（/proj2 不属 /proj）→ false', () => {
    expect(sameProject('/home/u/proj2', '/home/u/proj')).toBe(false)
  })
  test('target 空 → 无作用域全过', () => {
    expect(sameProject('/x', null)).toBe(true)
  })
  test('作用域下未知 cwd → 丢弃', () => {
    expect(sameProject(null, '/x')).toBe(false)
  })
})

describe('inRangeOverlap —— 区间重叠（老仓 in_range_overlap:44）', () => {
  test('都空 → pass through', () => {
    expect(inRangeOverlap(null, null, {})).toBe(true)
  })
  test('end < since → false', () => {
    expect(inRangeOverlap('2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z', { since: ms('2026-02-01T00:00:00Z') })).toBe(false)
  })
  test('start > until → false', () => {
    expect(inRangeOverlap('2026-03-01T00:00:00Z', '2026-03-02T00:00:00Z', { until: ms('2026-02-01T00:00:00Z') })).toBe(false)
  })
  test('跨窗长会话（created 早于 since 但 end 在窗内）→ 存活', () => {
    expect(
      inRangeOverlap('2026-01-01T00:00:00Z', '2026-03-01T00:00:00Z', { since: ms('2026-02-01T00:00:00Z'), until: null }),
    ).toBe(true)
  })
})

describe('inRange —— 单点范围（老仓 in_range:29）', () => {
  test('缺失 iso → pass through', () => {
    expect(inRange(null, { since: ms('2026-01-01T00:00:00Z') })).toBe(true)
  })
  test('早于 since → false', () => {
    expect(inRange('2025-12-01T00:00:00Z', { since: ms('2026-01-01T00:00:00Z') })).toBe(false)
  })
  test('窗内 → true', () => {
    expect(inRange('2026-01-15T00:00:00Z', { since: ms('2026-01-01T00:00:00Z'), until: ms('2026-02-01T00:00:00Z') })).toBe(true)
  })
})
