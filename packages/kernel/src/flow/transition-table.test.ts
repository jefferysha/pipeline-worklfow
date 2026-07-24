/**
 * transition 事件边表单测（BACKLOG #25b / GOAL B2）——事件名 → 转移边 + eventEdge 查表的回归锚
 * （cli/server 曾各持一份逐条镜像，#25 点名的重复真相源；此处上提为唯一真相源）。
 * 真相源 = 老仓 skills/pipeline/scripts/manifest.py::_DEFAULT_TRANSITIONS。
 *
 * default 轨的事件前置 guard / 状态副作用已 G2 P3 迁到 DefaultEventPolicy（typed guard/action
 * handler）——其逐字特征化不在本文件：前置校验文案见 flow/default-event-policy.test.ts、副作用
 * 见 workflow/action-handlers.test.ts（均逐字对齐老仓 state-transition.sh cmd_transition case 块）。
 */
import { describe, expect, test } from 'vitest'
import { eventEdge, TRANSITION_EVENTS } from './transition-table.js'

describe('事件 → 转移边表（default workflow 单一真相源）', () => {
  test('9 条边逐字（含 Build 发现规格漂移后的受控回退）', () => {
    expect(TRANSITION_EVENTS).toEqual({
      'open-complete': { from: 'open', to: 'explore' },
      'explore-complete': { from: 'explore', to: 'spec' },
      'spec-complete': { from: 'spec', to: 'build' },
      'build-complete': { from: 'build', to: 'verify' },
      'requirements-changed': { from: 'build', to: 'spec' },
      'verify-pass': { from: 'verify', to: 'ship' },
      'verify-fail': { from: 'verify', to: 'build' },
      'ship-complete': { from: 'ship', to: 'archive' },
      archived: { from: 'archive', to: 'archive' },
    })
  })

  test('eventEdge 命中已知事件', () => {
    expect(eventEdge('build-complete')).toEqual({ from: 'build', to: 'verify' })
    expect(eventEdge('requirements-changed')).toEqual({ from: 'build', to: 'spec' })
    expect(eventEdge('verify-fail')).toEqual({ from: 'verify', to: 'build' })
    expect(eventEdge('archived')).toEqual({ from: 'archive', to: 'archive' })
  })

  test('eventEdge 未知事件 → undefined（含原型链属性名不误判）', () => {
    expect(eventEdge('warp-speed')).toBeUndefined()
    expect(eventEdge('toString')).toBeUndefined()
    expect(eventEdge('constructor')).toBeUndefined()
    expect(eventEdge('')).toBeUndefined()
  })
})
