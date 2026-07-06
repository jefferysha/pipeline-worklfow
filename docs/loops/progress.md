# loop-lite progress（append-only 流水）

| 日期 | 轮 | 项 | 结果 |
|---|---|---|---|
| 2026-07-06 | iteration-0 | T1 契约与骨架 | 收编：GOAL/LOOP/BACKLOG/CONTRACT/plan + workspaces + types.ts |
| 2026-07-06 | iteration-5 | BACKLOG #9 切片 + #9a `pipeline inbox` | 收编：#9（2d）按 budget 切为 9a/9b。9a 落地：三门 marker（新鲜判定同 gate TTL）+ 复核相位停留 change 双源合并、等待时长降序、`--json` schema 稳定、同名去重 marker 优先；端到端真跑（init→transition→inbox 一屏）。五门全绿：vitest 220/220（+6）、hooks 47/47、bundle 7/7、verify-skills OK、oracle 0 不一致。诚实记录：本轮测试与实现同批落盘、未跑显式红（协议瑕疵，下轮回归先红纪律）。队首：#9b 静态 HTML 单页。 |
| 2026-07-06 | iteration-4 | BACKLOG #8 esbuild 单文件分发 | 收编：`npm run build` 产出自足 pipeline.mjs（147KB，commander/kernel 全内联、shebang 保留、chmod +x），bin 指向 bundle，`npx pipeline` 上手路径进 README。新增 tools/test-bundle.sh 冒烟 7/7（真跑 init→get→transition→history）。五门全绿：vitest 214/214、hooks 47/47、verify-skills OK、bundle 7/7、oracle 0 不一致。队首推进至 #9（收件箱 UI，2d 超单项预算，下轮按 LOOP budget 切片）。 |
| 2026-07-06 | iteration-3 | BACKLOG #7b PIPELINE_AFK=1 逃生门 | 收编：gate.sh 顶部显式 AFK 放行（仅字面 "1"，不清 marker）。TDD 先红 1 后绿；四门：hooks 47/47、vitest 214/214、verify-skills OK、oracle 0 不一致。队首推进至 #8（esbuild 单文件分发）。 |
| 2026-07-06 | iteration-2 | BACKLOG #7 history JSONL 收尾 | 收编：kernel 出 `createHistoryWriter`（fs appender 从 main.ts 收编进 kernel）；CLI set/set-many/cas/init 补 best-effort 记账（transition 已有，无双写）。TDD 先红 5 → 全绿；四门：build 零错、vitest 214/214、hooks 44/44 + verify-skills OK、oracle 双跑 0 不一致。队首推进至 #7b（AFK 逃生门）。 |
| 2026-07-06 | iteration-1 | T2–T7 五模块并行移植 + 集成回归门 | 收编：build 零错；vitest 207/207 + oracle 套件 9/9；test-hooks 44/44 + verify-skills OK；**oracle 双跑 0 不一致**（含 base64 历史区 PRESERVE）。契约表按实测回写（init/get/transition），有意差异白名单 4 项见 CONTRACT §3。遗留：kernel 侧 HistoryWriter 未实现（CLI transition 已记 JSONL，set/init 未记）；PIPELINE_AFK 逃生门未移植；chat track 无老内核对照。 |
