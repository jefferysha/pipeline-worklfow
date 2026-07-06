/**
 * 事件 → 转移边表 —— re-export kernel 单一真相源（BACKLOG #25b / GOAL B2 单一真相源原则）。
 *
 * 事件表 + 前置校验 + 副作用已上提到 @pipeline-lite/kernel（packages/kernel/src/flow/transition-table.ts），
 * cli 不再自持镜像（#25 报告点名的 cli/server 重复真相源已消除）。本文件仅为既有消费者
 * （commands/advance.ts 的 EVENTS 边遍历）保留稳定别名 —— EVENTS = kernel 的 TRANSITION_EVENTS。
 */
export { TRANSITION_EVENTS as EVENTS, eventEdge } from '@pipeline-lite/kernel'
export type { EventEdge, EventName } from '@pipeline-lite/kernel'
