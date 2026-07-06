# BACKLOG — loop-lite 队列

> loop-lite 每轮从队首取一项。完成 → 移入下方「已收编」。发现新缺口 → 按优先级插入。

## 队列（按序）

| # | 项 | 对应 plan 任务 | 预算 |
|---|---|---|---|
| 7 | history JSONL 收尾：kernel 侧 HistoryWriter（set/init 记账；transition 已在 CLI 记）——base64 读容忍已随 T2 完成 | T8 | 0.5d |
| 7b | PIPELINE_AFK=1 逃生门移植进 gate.sh（headless 自动化前置） | 新增 | 0.2d |
| 8 | esbuild 单文件 bundle + `npx pipeline init` 上手路径 | v0.2 | 0.5d |
| 9 | 收件箱 UI：等三门决策的 change 一屏清单（老仓 UI 病灶 2 的解法） | v0.2 | 2d |
| 10 | statusline：当前 change \| 相位 \| 门状态 | v0.2 | 0.5d |
| 11 | 老仓库 change 导入工具（含 history 迁移） | v0.2 | 1d |

## 已收编

| 日期 | 项 | 结果 |
|---|---|---|
| 2026-07-06 | T1 契约与骨架（iteration-0） | 收编 |
| 2026-07-06 | T2 kernel/state 读写/锁/CAS | 收编：fixture 往返字节等价（现代 schema 59/59） |
| 2026-07-06 | T3 kernel/flow manifest/转换/guard | 收编：review_phases 单一真相源回归锚 |
| 2026-07-06 | T4 cli 九命令 + --json | 收编：契约表按 oracle 实测回写 |
| 2026-07-06 | T5 hooks 薄 shim + verify-skills | 收编：44 断言 + 零悬空引用校验（§5.7） |
| 2026-07-06 | T6 oracle 双跑 harness | 收编：3 fixture 全流程 |
| 2026-07-06 | T7 集成回归门（iteration-1） | 收编：四门全绿、双跑 0 不一致 |
