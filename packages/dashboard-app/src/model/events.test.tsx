import { describe, it, expect } from 'vitest'
import { legalTargets, plannedTransition } from './events'
import { DEFAULT_RULES, rulesFromDef, type StepDef } from './workflowModel'

/** 自定义三步 workflow：draft →(approved) review →(shipped) ship；review 还留一条回 draft 的返工边。 */
const REL_RULES = rulesFromDef({
  name: 'release-train',
  steps: [
    { id: 'draft', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [{ event: 'approved', to: 'review' }] },
    { id: 'review', label: '', gate: 'review', skills: [], inputs: [], outputs: [], guards: [], transitions: [{ event: 'shipped', to: 'ship' }, { event: 'rework', to: 'draft' }] },
    { id: 'ship', label: '', gate: null, skills: [], inputs: [], outputs: [], guards: [], transitions: [] },
  ] satisfies StepDef[],
})

describe('plannedTransition（default 规则下行为与旧常量版逐字一致）', () => {
  it('正向边逐条产出正确 event', () => {
    expect(plannedTransition(DEFAULT_RULES, 'open', 'explore')?.event).toBe('open-complete')
    expect(plannedTransition(DEFAULT_RULES, 'explore', 'spec')?.event).toBe('explore-complete')
    expect(plannedTransition(DEFAULT_RULES, 'spec', 'build')?.event).toBe('spec-complete')
    expect(plannedTransition(DEFAULT_RULES, 'build', 'verify')?.event).toBe('build-complete')
    expect(plannedTransition(DEFAULT_RULES, 'verify', 'ship')?.event).toBe('verify-pass')
    expect(plannedTransition(DEFAULT_RULES, 'ship', 'archive')?.event).toBe('ship-complete')
  })

  it('正向边 backward=false', () => {
    expect(plannedTransition(DEFAULT_RULES, 'build', 'verify')?.backward).toBe(false)
  })

  it('verify→build 是回退边 verify-fail（backward=true）', () => {
    const p = plannedTransition(DEFAULT_RULES, 'verify', 'build')
    expect(p?.event).toBe('verify-fail')
    expect(p?.backward).toBe(true)
  })

  it('build→spec 是需求变更回退 requirements-changed（backward=true）', () => {
    expect(plannedTransition(DEFAULT_RULES, 'build', 'spec')).toEqual({
      event: 'requirements-changed',
      from: 'build',
      to: 'spec',
      backward: true,
    })
  })

  it('非法跳跃（open→verify）→ null', () => {
    expect(plannedTransition(DEFAULT_RULES, 'open', 'verify')).toBeNull()
  })

  it('同阶段 → null（no-op 回弹）', () => {
    expect(plannedTransition(DEFAULT_RULES, 'build', 'build')).toBeNull()
  })

  it('未知阶段 → null', () => {
    expect(plannedTransition(DEFAULT_RULES, 'bogus', 'build')).toBeNull()
    expect(plannedTransition(DEFAULT_RULES, 'build', 'bogus')).toBeNull()
  })
})

describe('plannedTransition（自定义 workflow 规则，G17）', () => {
  it('自定义正向边产出自己的 event 名', () => {
    expect(plannedTransition(REL_RULES, 'draft', 'review')?.event).toBe('approved')
    expect(plannedTransition(REL_RULES, 'review', 'ship')?.event).toBe('shipped')
  })

  it('review→draft 是回退边（steps 序号倒退），backward=true', () => {
    const p = plannedTransition(REL_RULES, 'review', 'draft')
    expect(p?.event).toBe('rework')
    expect(p?.backward).toBe(true)
  })

  it('未声明的边（draft→ship 跳跃）→ null', () => {
    expect(plannedTransition(REL_RULES, 'draft', 'ship')).toBeNull()
  })
})

describe('legalTargets', () => {
  it('default：verify 可去 ship / build（双出口）', () => {
    expect(legalTargets(DEFAULT_RULES, 'verify')).toEqual(['ship', 'build'])
  })
  it('default：build 可去 verify，也可因需求变化回退 spec', () => {
    expect(legalTargets(DEFAULT_RULES, 'build')).toEqual(['verify', 'spec'])
  })
  it('自定义：review 可去 ship / draft；未知 step → 空数组', () => {
    expect(legalTargets(REL_RULES, 'review')).toEqual(['ship', 'draft'])
    expect(legalTargets(REL_RULES, 'bogus')).toEqual([])
  })
})
