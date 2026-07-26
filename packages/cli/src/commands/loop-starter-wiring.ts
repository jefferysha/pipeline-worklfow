/**
 * H11 CLI 兼容出口。binding/workflow/skill 的唯一实现位于 automation，server、scheduler 与
 * CLI 展示共用同一 evaluator；本文件不保留第二份判定逻辑。
 */
export {
  buildLoopStarterWiringReport,
  evaluateLoopExecutionWiring,
} from '@tenon/automation'
export type {
  CustomWorkflowRuntimeWiring,
  LoopExecutionWiringResult,
  LoopStarterBinding,
  LoopStarterWiring,
  LoopStarterWiringDeps,
  LoopStarterWiringReport,
  WorkflowWiring,
} from '@tenon/automation'
