import type { WorkflowRules } from '../model/workflowModel'
import type { Snapshot } from '../types'

export interface ProgressViewProps {
  snapshot: Snapshot | null
  loading: boolean
  error: string | null
  /** 单项目进度页：App 保证 view='progress' 时 currentRoot 恒为真实项目 root（非空）——
   *  聚合与「全部项目」总览钻取归 ProjectsView，本视图不再处理空串聚合分支。 */
  currentRoot: string
  /** App 统一拉取的 workflow 规则集，键=rulesKey(root,wf)（useWorkflowRulesMulti 契约）。 */
  rulesByKey: ReadonlyMap<string, WorkflowRules>
  /** 动作结果 toast（成功/失败都走这里；App 注入 showFlash）。 */
  onToast?: (msg: string) => void
  /** 动作成功后 resync（App 注入 useSnapshot().refresh）。 */
  onRefresh?: () => void | Promise<void>
  /** URL 深链路选中的 change；undefined = 宿主不控制，null = 关闭。 */
  selectedChange?: string | null
  /** 抽屉开合回传给宿主，用于同步可复制 URL。 */
  onSelectedChange?: (name: string | null) => void
}
