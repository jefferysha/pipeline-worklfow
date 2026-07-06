import { describe, it, expect } from 'vitest'
import { decisionKind, isAwaitingDecision, projectName, selectInbox } from './inbox'
import { makeChange, makeProject, makeSnapshot } from '../testkit'

describe('isAwaitingDecision（三门/复核相位判据）', () => {
  it('explore/spec/verify 相位（未归档）都在等我决定', () => {
    for (const phase of ['explore', 'spec', 'verify']) {
      expect(isAwaitingDecision(makeChange('c', phase))).toBe(true)
    }
  })

  it('open/build/ship/archive 相位不在等我决定', () => {
    for (const phase of ['open', 'build', 'ship', 'archive']) {
      expect(isAwaitingDecision(makeChange('c', phase))).toBe(false)
    }
  })

  it('已归档（archived=true）即便处于复核相位也不入收件箱', () => {
    expect(isAwaitingDecision(makeChange('c', 'verify', { archived: 'true' }))).toBe(false)
  })
})

describe('selectInbox（跨项目摘出在等决定的 change）', () => {
  it('null snapshot → 空', () => {
    expect(selectInbox(null)).toEqual([])
  })

  it('只保留复核相位卡、跨多个项目聚合', () => {
    const snap = makeSnapshot([
      makeProject('/a', [makeChange('a-open', 'open'), makeChange('a-verify', 'verify')]),
      makeProject('/b', [makeChange('b-spec', 'spec'), makeChange('b-build', 'build')]),
    ])
    const items = selectInbox(snap)
    expect(items.map((i) => i.change.name).sort()).toEqual(['a-verify', 'b-spec'])
  })

  it('跳过 ok=false 的项目（不可达 project 不谎报待办）', () => {
    const snap = makeSnapshot([
      makeProject('/bad', [makeChange('x', 'verify')], { ok: false, error: 'unreachable' }),
    ])
    expect(selectInbox(snap)).toEqual([])
  })

  it('按 updated_at 倒序、并列按 name 升序', () => {
    const snap = makeSnapshot([
      makeProject('/a', [
        makeChange('old', 'verify', { updated_at: '2026-07-01T00:00:00Z' }),
        makeChange('new-b', 'spec', { updated_at: '2026-07-07T00:00:00Z' }),
        makeChange('new-a', 'explore', { updated_at: '2026-07-07T00:00:00Z' }),
      ]),
    ])
    expect(selectInbox(snap).map((i) => i.change.name)).toEqual(['new-a', 'new-b', 'old'])
  })
})

describe('decisionKind / projectName', () => {
  it('decisionKind 映射相位', () => {
    expect(decisionKind(makeChange('c', 'explore'))).toBe('explore')
    expect(decisionKind(makeChange('c', 'spec'))).toBe('spec')
    expect(decisionKind(makeChange('c', 'verify'))).toBe('verify')
    expect(decisionKind(makeChange('c', 'build'))).toBe('other')
  })

  it('projectName 取路径末段', () => {
    expect(projectName(makeProject('/Users/me/code/my-repo', []))).toBe('my-repo')
  })
})
