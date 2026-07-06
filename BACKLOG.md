# BACKLOG — loop-lite 队列

> loop-lite 每轮从队首取一项。完成 → 移入下方「已收编」。发现新缺口 → 按优先级插入。

## 队列（按序）

| # | 项 | 对应 plan 任务 | 预算 |
|---|---|---|---|
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
| 2026-07-06 | #7 history JSONL 收尾（iteration-2） | 收编：createHistoryWriter 进 kernel + set/cas/init 记账，vitest 214/214 |
| 2026-07-06 | #7b PIPELINE_AFK 逃生门（iteration-3） | 收编：hooks 47/47，仅字面 "1" 放行、不清 marker |
| 2026-07-06 | #8 esbuild 单文件分发（iteration-4） | 收编：pipeline.mjs 147KB 自足 bundle + npx 上手路径 + 冒烟 7/7 |
| 2026-07-06 | #9a `pipeline inbox` 数据端+人读表（iteration-5） | 收编：vitest 220/220，端到端真跑一屏 |
| 2026-07-06 | #9b `inbox --html` 静态单页（iteration-6） | 收编：自足零依赖单页 + 注入转义，vitest 223/223 |
