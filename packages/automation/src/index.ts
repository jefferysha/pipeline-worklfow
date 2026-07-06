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
// ─── BACKLOG #29c：docker 全链执行（真 docker / 真 git worktree / 真 merge-back）───
// runner：exec 注入面 / boundedTail 64KiB / git 双挂载 / 三路 race / docker 容器全链
export * from './runner/exec.js'
export * from './runner/boundedTail.js'
export * from './runner/gitMounts.js'
export * from './runner/race.js'
export * from './runner/container.js'
// lifecycle：真 git worktree / 真 merge-back 守卫 / 生产 LifecyclePorts 装配
export * from './lifecycle/worktree.js'
export * from './lifecycle/mergeback.js'
export * from './lifecycle/ports.js'
