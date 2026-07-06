# LOOP.md — 本仓 loop 治理

> 格式沿用老仓 LOOP.md 口径。本仓当前只有 1 条 loop。
> **真相源 = BACKLOG.md（队列）+ docs/loops/progress.md（流水）**，本文件是协议定义。

## Active Loops

### `loop-lite` — 轻量内核移植 loop

- **kind**：orchestrator（编排者：取项 → 移植 → 校验 → 收编）
- **cadence**：按需（在 Claude Code 会话中人工启动一轮；稳定后可切 `/loop 1h` 自驱）
- **goal**：按 BACKLOG.md 顺序把老内核日常子命令面移植为 TS 单语言实现，每项过
  golden-oracle + 回归门后收编，直至 v0.1 成功判据（见 GOAL.md）全绿。
- **change_prefix**：`lite-`
- **phases**（每轮协议五阶段）：
  ⓪ **裁决**——检查预算（在途 ≤1 项）与 kill 判据，超限/命中即跳过本轮只记录；
  ① **收编核对**——上轮项的测试是否仍绿、commit 是否落盘，红则本轮只修不取新项；
  ② **收尾**——修复①发现的回归，跑 `npm test` + oracle 双跑全绿；
  ③ **取项/发现**——BACKLOG 非空取队首项按 TDD 移植（先红后绿）；空则做一次收敛检查
  （对照 GOAL 成功判据找缺口，有则入队，无则计一次「空轮」）；
  ④ **记录**——append 一行到 `docs/loops/progress.md`（日期/项/结果/oracle diff 计数）。
- **human gates**：
  - `.pipeline.yaml` 字段序/格式契约的任何变更（破坏老内核兼容）→ 停下问人；
  - kernel 新增任何第三方运行时依赖 → 停下问人；
  - `git push` 到 GitHub → 人工触发（本机无 gh 认证）；
  - hook 热路径引入 node 进程 → 直接拒绝（红线，不是问人）。
- **state**：`docs/loops/progress.md`（append-only 流水）
- **budget**：同时在途 ≤1 个 backlog 项；单项预算 ≤1 天；一轮内 oracle 修复尝试 ≤3 次。
- **kill criteria**：
  - BACKLOG 连续 **2 轮空**且收敛检查无新缺口 → 宣告 v0.1 收敛，出收官报告进 progress，loop 终止；
  - 同一项 golden-diff 连续 **3 次红** → 暂停 loop，写坑单进 progress 等人工裁决；
  - 老内核 oracle 脚本不可独立运行（依赖缺失）→ 记录降级为「契约测试模式」（以
    docs/CONTRACT.md 钉死的行为表代替双跑），不阻塞 loop。
