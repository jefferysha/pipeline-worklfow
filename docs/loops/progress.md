# loop-lite progress（append-only 流水）

| 日期 | 轮 | 项 | 结果 |
|---|---|---|---|
| 2026-07-06 | iteration-0 | T1 契约与骨架 | 收编：GOAL/LOOP/BACKLOG/CONTRACT/plan + workspaces + types.ts |
| 2026-07-06 | iteration-3 | BACKLOG #7b PIPELINE_AFK=1 逃生门 | 收编：gate.sh 顶部显式 AFK 放行（仅字面 "1"，不清 marker）。TDD 先红 1 后绿；四门：hooks 47/47、vitest 214/214、verify-skills OK、oracle 0 不一致。队首推进至 #8（esbuild 单文件分发）。 |
| 2026-07-06 | iteration-2 | BACKLOG #7 history JSONL 收尾 | 收编：kernel 出 `createHistoryWriter`（fs appender 从 main.ts 收编进 kernel）；CLI set/set-many/cas/init 补 best-effort 记账（transition 已有，无双写）。TDD 先红 5 → 全绿；四门：build 零错、vitest 214/214、hooks 44/44 + verify-skills OK、oracle 双跑 0 不一致。队首推进至 #7b（AFK 逃生门）。 |
| 2026-07-06 | iteration-1 | T2–T7 五模块并行移植 + 集成回归门 | 收编：build 零错；vitest 207/207 + oracle 套件 9/9；test-hooks 44/44 + verify-skills OK；**oracle 双跑 0 不一致**（含 base64 历史区 PRESERVE）。契约表按实测回写（init/get/transition），有意差异白名单 4 项见 CONTRACT §3。遗留：kernel 侧 HistoryWriter 未实现（CLI transition 已记 JSONL，set/init 未记）；PIPELINE_AFK 逃生门未移植；chat track 无老内核对照。 |
