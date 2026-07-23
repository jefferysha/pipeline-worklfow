import type { RunOutcome } from '../types.js'

/**
 * 进程内 lifecycle 产出凭据。该模块不从 package 根出口导出；只有真实 lifecycle 与 scheduler
 * 共享这份 WeakSet。普通公共 RunChange 即使构造出相同字段，也不能声明发生过物理 merge。
 */
const lifecycleOutcomes = new WeakSet<object>()

export function certifyLifecycleOutcome<T extends RunOutcome>(outcome: T): T {
  lifecycleOutcomes.add(outcome)
  return outcome
}

export function isCertifiedLifecycleOutcome(value: unknown): value is RunOutcome {
  return typeof value === 'object' && value !== null && lifecycleOutcomes.has(value)
}
