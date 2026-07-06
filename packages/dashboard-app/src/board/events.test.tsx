import { describe, it, expect } from 'vitest'
import { legalTargets, plannedTransition } from './events'
import { makeChange } from '../testkit'

describe('plannedTransition（拖拽换列 → event，镜像 server transition 边表）', () => {
  it('正向边逐条产出正确 event', () => {
    expect(plannedTransition('open', 'explore')?.event).toBe('open-complete')
    expect(plannedTransition('explore', 'spec')?.event).toBe('explore-complete')
    expect(plannedTransition('spec', 'build')?.event).toBe('spec-complete')
    expect(plannedTransition('build', 'verify')?.event).toBe('build-complete')
    expect(plannedTransition('verify', 'ship')?.event).toBe('verify-pass')
    expect(plannedTransition('ship', 'archive')?.event).toBe('ship-complete')
  })

  it('正向边 backward=false', () => {
    expect(plannedTransition('build', 'verify')?.backward).toBe(false)
  })

  it('verify→build 是回退边 verify-fail（backward=true）', () => {
    const p = plannedTransition('verify', 'build')
    expect(p?.event).toBe('verify-fail')
    expect(p?.backward).toBe(true)
  })

  it('非法跳跃（open→verify）→ null', () => {
    expect(plannedTransition('open', 'verify')).toBeNull()
  })

  it('同相位 → null（no-op 回弹）', () => {
    expect(plannedTransition('build', 'build')).toBeNull()
  })

  it('未知相位 → null', () => {
    expect(plannedTransition('bogus', 'build')).toBeNull()
    expect(plannedTransition('build', 'bogus')).toBeNull()
  })
})

describe('legalTargets', () => {
  it('verify 可去 ship / build（双出口）', () => {
    expect(legalTargets(makeChange('c', 'verify'))).toEqual(['ship', 'build'])
  })
  it('build 可去 verify', () => {
    expect(legalTargets(makeChange('c', 'build'))).toEqual(['verify'])
  })
})
