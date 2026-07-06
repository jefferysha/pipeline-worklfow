import { describe, expect, it } from 'vitest'
import { AUTOMATION_STATES } from '../types.js'
import {
  IllegalAutomationTransitionError,
  LEGAL_AUTOMATION_TRANSITIONS,
  assertAutomationTransition,
  isLegalAutomationTransition,
  settleFailure,
  settleSuccess,
} from './state-machine.js'

describe('automation lifecycle state machine (老仓 state-fields.sh:110/154 八态)', () => {
  it('每个态都在转换表里且目标全是合法态', () => {
    for (const s of AUTOMATION_STATES) {
      expect(LEGAL_AUTOMATION_TRANSITIONS[s]).toBeDefined()
      for (const t of LEGAL_AUTOMATION_TRANSITIONS[s]) {
        expect(AUTOMATION_STATES).toContain(t)
      }
    }
  })

  it('核心生命周期转换合法（DESIGN §2 状态机）', () => {
    // off ─spec-complete+双开关ON─▶ queued ─claim─▶ scheduled ─起容器─▶ running
    expect(isLegalAutomationTransition('off', 'queued')).toBe(true)
    expect(isLegalAutomationTransition('queued', 'scheduled')).toBe(true)
    expect(isLegalAutomationTransition('scheduled', 'running')).toBe(true)
    // running 的四个出口
    expect(isLegalAutomationTransition('running', 'merged')).toBe(true)
    expect(isLegalAutomationTransition('running', 'queued')).toBe(true) // 重试
    expect(isLegalAutomationTransition('running', 'failed')).toBe(true)
    expect(isLegalAutomationTransition('running', 'conflict')).toBe(true)
    // L1 report-only: running → paused（挂队跑完不自动 merge，停给人工）
    expect(isLegalAutomationTransition('running', 'paused')).toBe(true)
    // 回归 / 人工重跑 / 恢复
    expect(isLegalAutomationTransition('merged', 'off')).toBe(true)
    expect(isLegalAutomationTransition('failed', 'queued')).toBe(true)
    expect(isLegalAutomationTransition('conflict', 'queued')).toBe(true)
    expect(isLegalAutomationTransition('paused', 'queued')).toBe(true) // resume
    expect(isLegalAutomationTransition('paused', 'merged')).toBe(true) // L2 人工放行合并
    // crash-reconcile：scheduled 卡死 → 重置回 queued
    expect(isLegalAutomationTransition('scheduled', 'queued')).toBe(true)
  })

  it('非法转换被拒（跳级 / 终态复活）', () => {
    expect(isLegalAutomationTransition('off', 'running')).toBe(false) // 跳过 queued/scheduled
    expect(isLegalAutomationTransition('queued', 'merged')).toBe(false) // 没跑就 merged
    expect(isLegalAutomationTransition('merged', 'running')).toBe(false) // 终态复活
    expect(isLegalAutomationTransition('off', 'off')).toBe(false) // 自环
  })

  it('assertAutomationTransition 非法 throw、合法不 throw', () => {
    expect(() => assertAutomationTransition('queued', 'scheduled')).not.toThrow()
    expect(() => assertAutomationTransition('off', 'running')).toThrow(IllegalAutomationTransitionError)
  })
})

describe('L1→L3 分级放权合体（GOAL B19 / A5 默认 report-only）', () => {
  it('settleSuccess：L1/L2 停 paused（不自动 merge），L3 才 merged', () => {
    expect(settleSuccess('L1')).toBe('paused') // report-only 默认，安全
    expect(settleSuccess('L2')).toBe('paused') // 人工门，跑完等放行
    expect(settleSuccess('L3')).toBe('merged') // allowlist 无监管自动合并
  })

  it('settleFailure：conflict 类不重试；retry 类看预算', () => {
    expect(settleFailure('conflict', 1, 1)).toBe('conflict')
    // attemptsAfterIncr <= maxRetries → 回 queued 重试
    expect(settleFailure('retry', 1, 1)).toBe('queued')
    // attemptsAfterIncr > maxRetries → 预算耗尽 → failed
    expect(settleFailure('retry', 2, 1)).toBe('failed')
  })
})
