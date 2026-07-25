import type { ChangeSnapshot } from '../types'

/** Change 声明的 workflow；旧快照未落字段时保持 default 兼容。 */
export function changeWorkflow(change: ChangeSnapshot): string {
  const workflow = change.fields.workflow
  return typeof workflow === 'string' && workflow !== '' ? workflow : 'default'
}

/** 人工决策文案分类；自定义 step 不冒充 default 七阶段。 */
export function decisionKind(change: ChangeSnapshot): 'explore' | 'spec' | 'verify' | 'other' {
  if (changeWorkflow(change) !== 'default') return 'other'
  if (change.phase === 'explore' || change.phase === 'spec' || change.phase === 'verify') return change.phase
  return 'other'
}
