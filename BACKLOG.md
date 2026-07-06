# BACKLOG — loop-lite 队列

> loop-lite 每轮从队首取一项。完成 → 移入下方「已收编」。发现新缺口 → 按优先级插入。

## 队列（按序）

| # | 项 | 对应 plan 任务 | 预算 |
|---|---|---|---|
| **M1** 内核深度 | | | |
| 12 | guard 全量校验面：老仓 pipeline-guard.sh 逐相位出口规则全移植（lite 子集 → 全集，oracle 对齐 check） | M1 | 2d |
| 13 | 门 TTL 分级恢复：confirm 300s / review·interaction 1800s（gate.sh + statusline + inbox 三处同步，退 15min 统一简化） | M1 | 0.5d |
| 14 | transition 全副作用面：state-transition.sh case 块逐字盘点补齐（现仅 4 事件） | M1 | 1d |
| 15 | task lifecycle：add-dep/children/cascade/canonical | M1 | 2d |
| 16 | living-spec：specs/set-spec-scope/inject-jsonl | M1 | 2d |
| 17 | session：activate/route-context | M1 | 1d |
| 18 | manifest 全派生面：mandatory/recommended skills、router patterns、gen-router、breadcrumb prose | M1 | 2d |
| **M2** hooks/插件全保真 | | | |
| 19 | router hook：Track 识别评分正则（读 manifest 派生缓存）+ 每轮 breadcrumb 注入 | M2 | 2d |
| 20 | SessionStart 三注入：workflow 宪法 / pipeline-context / openspec | M2 | 1d |
| 21 | PostToolUse 全套：confirm-clear、decision-recorder（AskUserQuestion）、skill-tracker、interactive-skill-gate | M2 | 2d |
| 22 | 7 相位 SKILL.md + 主编排 Decision Core + openspec 四命令 + learn-record | M2 | 3d |
| 23 | 4 agents（builder/researcher/reviewer/design-reviewer）定义移植 | M2 | 1d |
| 24 | /pipeline-sync + /pipeline-uninstall（所有权 hash 追踪 scrubber，对标老仓 .pipeline-owned.json） | M2 | 2d |
| **M3** dashboard | | | |
| 25 | TS 全局 server：snapshot/SSE + **版本抢占**（老仓架构欠账 #3）+ **写端点 token 鉴权**（欠账 #4） | M3 | 3d |
| 26 | 前端信息架构重构：收件箱默认视图 / Kanban / Settings 分离 / debug 降级（UI 病灶 1-4 完整解法） | M3 | 3d |
| 26b | `pipeline doctor` 统一健康面：fail-open 降级可见、保障生效清单（GOAL B8，对标 comet doctor） | M3 | 1d |
| **M4** channel + mem | | | |
| 27 | channel：event-sourced worker 总线 TS 重写（supervisor/events/inbox/turns/guard） | M4 | 5d |
| 28 | mem：跨 runtime 会话检索（list/search/context/extract/projects） | M4 | 3d |
| **M5** automation | | | |
| 29 | AFK 调度评估：老仓 5 个 TS 包直接移植 vs 适配重写（评估报告先行，human gate 后动手） | M5 | 1d+ |
| **M6** 竞品缺口收尾 | | | |
| 30 | 上下文压缩（Comet CONTEXT-COMPRESSION 对标）：handoff 时压缩 | M6 | 2d |
| 31 | auto-transition 中间档：guard 全绿自动推进、仅三门处停（HITL 与 AFK 之间） | M6 | 1d |
| 32 | Cursor 适配器转正（老仓 spike → 可发布） | M6 | 3d |
| 33 | Trellis parity 收尾：8 partial + 1 missing（spec-template-scaffold、冲突 AskUserQuestion、workflow-template-resolution、KNOWN_UNTRACKED_ALLOWLIST） | M6 | 3d |
| **M-loop** loop-engineering 内建（GOAL B18–B21 / D16） | | | |
| 35 | loops 治理子系统：registry schema + enforce 裁决（老仓 R1-R11 起步）+ `pipeline loops` 命令 + 流水审计 | M-loop | 3d |
| 36 | token 预算与熔断：loop 级 budget 声明 + circuit breaker + 成本估算 | M-loop | 2d |
| 37 | 漂移检测 + loop-ready 审计：LOOP 声明 vs STATE 流水对账、就绪评分 | M-loop | 2d |
| 38 | 分级放权 L1→L3：AFK 自动化毕业制（report → 人工门 → allowlist 自动合并），M5 的前置件 | M-loop | 2d |
| **M7** 平台矩阵（GOAL D7/D14） | | | |
| 39 | 适配器框架 + 分档降级契约（老仓 adapters/contract.md 移植）+ conformance 测试 | M7 | 3d |
| 40 | 平台铺开：Codex/Cursor 先行，矩阵逐平台扩展至 ≥ 两竞品覆盖面 | M7 | 5d+ |
| 41 | docs/superiority-matrix.md：D1–D16 逐维对比证据表（随里程碑更新，收敛检查对照物） | 持续 | 0.5d |
| 34 | tap 流量代理：暂缓——迁移前与用户确认优先级（human gate） | 待定 | 5d+ |

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
| 2026-07-06 | #10 statusline（iteration-7） | 收编：纯 bash 零解释器，hooks 55/55 |
| 2026-07-06 | #11 老仓导入工具（iteration-8） | 收编：43 条真实历史迁移 + --strip 清理 + 幂等哨兵，vitest 232/232 |
