/**
 * @pipeline-lite/automation 公共出口（BACKLOG #29/#29b, GOAL A5/M5）。
 * 5 包语义盘点 + 队列生命周期状态机见 ./types.ts 顶注。默认 L1 report-only（不自动 merge）。
 */
export * from './types.js'
// queue：状态机 / cas 并发闸 / 扫描 / 门联动
export * from './queue/state-machine.js'
export * from './queue/claim.js'
export * from './queue/scan.js'
export * from './queue/gate.js'
// scheduler：信号量 / 失败分类 / 轮调度
export * from './scheduler/semaphore.js'
export * from './scheduler/classify.js'
export * from './scheduler/scheduler.js'
// lifecycle：沙箱生命周期编排 / build_sha barrier
export * from './lifecycle/barrier.js'
export * from './lifecycle/lifecycle.js'
// runner：结构化握手解析 / docker 探针
export * from './runner/runner.js'
export * from './runner/docker.js'
// sdk：对外编排 API
export * from './sdk/sdk.js'
