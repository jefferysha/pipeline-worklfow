# BACKLOG — loop-lite 队列

> loop-lite 每轮从队首取一项。完成 → 移入下方「已收编」。发现新缺口 → 按优先级插入。

## 队列（按序）

| # | 项 | 对应 plan 任务 | 预算 |
|---|---|---|---|
| 1 | kernel/state：`.pipeline.yaml` 读写 + 字段序 + 锁 + CAS | T2 | 1d |
| 2 | kernel/flow：manifest 装载 + 转换合法性 + guard-lite | T3 | 1d |
| 3 | cli：commander 装配 + status/list 渲染 | T4 | 0.5d |
| 4 | hooks：bash 薄 shim + 插件打包 | T5 | 0.5d |
| 5 | oracle：golden 双跑 harness + fixtures | T6 | 0.5d |
| 6 | 集成回归门：build + vitest + oracle 全绿 | T7 | 0.5d |
| 7 | history JSONL 侧文件 + 老仓 base64 历史区读容忍 | T8 | 0.5d |
| 8 | esbuild 单文件 bundle + `npx pipeline init` 上手路径 | v0.2 | 0.5d |
| 9 | 收件箱 UI：等三门决策的 change 一屏清单（老仓 UI 病灶 2 的解法） | v0.2 | 2d |
| 10 | statusline：当前 change \| 相位 \| 门状态 | v0.2 | 0.5d |
| 11 | 老仓库 change 导入工具（含 history 迁移） | v0.2 | 1d |

## 已收编

| 日期 | 项 | 结果 |
|---|---|---|
| 2026-07-06 | T1 契约与骨架（iteration-0） | 本文件所在 commit |
