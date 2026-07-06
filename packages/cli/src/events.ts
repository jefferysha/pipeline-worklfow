/**
 * 事件 → 转移边表。语义参考老内核 manifest.py::_DEFAULT_TRANSITIONS（逐边一致）：
 * 前向 7 边 + verify-fail 回退边 + archive 终态自环。
 *
 * 注意（集成接缝）：types.ts 的 ManifestData 不含事件名，FlowEngine.transition 只收目标
 * Phase，故事件名→目标相位的映射由 cli 持有；转移「合法性」仍以 flow 引擎（manifest 单一
 * 真相源）为准——本表只做命名翻译 + 事件声明的 from 相位前置校验。
 */
import type { Phase } from '@pipeline-lite/kernel'

export interface EventEdge {
  from: Phase
  to: Phase
}

export const EVENTS = {
  'open-complete': { from: 'open', to: 'explore' },
  'explore-complete': { from: 'explore', to: 'spec' },
  'spec-complete': { from: 'spec', to: 'build' },
  'build-complete': { from: 'build', to: 'verify' },
  'verify-pass': { from: 'verify', to: 'ship' },
  'verify-fail': { from: 'verify', to: 'build' },
  'ship-complete': { from: 'ship', to: 'archive' },
  archived: { from: 'archive', to: 'archive' },
} as const satisfies Record<string, EventEdge>

export type EventName = keyof typeof EVENTS

export function eventEdge(event: string): EventEdge | undefined {
  return Object.prototype.hasOwnProperty.call(EVENTS, event)
    ? EVENTS[event as EventName]
    : undefined
}
