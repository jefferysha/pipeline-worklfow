# BACKLOG — loop-lite 队列

> loop-lite 每轮从队首取一项。完成 → 移入下方「已收编」。发现新缺口 → 按优先级插入。

## 队列（按序）

| # | 项 | 对应 plan 任务 | 预算 |
|---|---|---|---|
| **M3** dashboard | | | |
| 25b | 【技术债/单源】把「transition 事件→边表 + 前置校验 + 副作用」上提进 kernel 收成单源——当前 cli events.ts/transition.ts 与 server transition.ts 逐条镜像（#25 发现），消除重复真相源 | M3 | 1d |
| 26c | server 服务 SPA：GET / 返回 dashboard-app dist/index.html + 注入 token + 静态路由 assets/*（#26 前端就绪，本项让 server 真上线前端） | M3 | 0.5d |
| **M4** channel + mem | | | |
| 27b | channel 进程管理层：supervisor 三循环 + 真 spawn 子进程 + inbox_watcher live-tail + OS-liveness guard + SIGTERM cleanup（#27 事件模型已就绪，本项补进程层） | M4 | 3d |
| **M5** automation / AFK Sandcastle（2026-07-07 用户确认全量迁移，human gate 已解） | | | |
| 29c | Docker 沙箱执行 + merge-back + 现场保留（automation_worktree/preserved_path）；**诚实门**：无 docker → IT skip 绝不伪绿（老仓纪律延续） | M5 | 3d |
| 29d | 调度器 doctor 灯 + dashboard AFK 指挥面数据端（M3 的 server 承接） | M5 | 1d |
| 29e | 与 L1→L3 分级放权（#38）合体：AFK 默认 L1 report-only，毕业制升 L2/L3 | M5 | 1d |
| **M6** 竞品缺口收尾 | | | |
| 30 | 上下文压缩（Comet CONTEXT-COMPRESSION 对标）：handoff 时压缩 | M6 | 2d |
| 31 | auto-transition 中间档：guard 全绿自动推进、仅三门处停（HITL 与 AFK 之间） | M6 | 1d |
| 32 | Cursor 适配器转正（老仓 spike → 可发布） | M6 | 3d |
| 33 | Trellis parity 收尾：8 partial + 1 missing（spec-template-scaffold、冲突 AskUserQuestion、workflow-template-resolution、KNOWN_UNTRACKED_ALLOWLIST） | M6 | 3d |
| **M-loop** loop-engineering 内建（GOAL B18–B21 / D16） | | | |
| 36 | token 预算与熔断：loop 级 budget 声明 + circuit breaker + 成本估算 | M-loop | 2d |
| 37 | 漂移检测 + loop-ready 审计：LOOP 声明 vs STATE 流水对账、就绪评分 | M-loop | 2d |
| 38 | 分级放权 L1→L3：AFK 自动化毕业制（report → 人工门 → allowlist 自动合并），M5 的前置件 | M-loop | 2d |
| **M7** 平台矩阵（GOAL D7/D14） | | | |
| 39 | 适配器框架 + 分档降级契约（老仓 adapters/contract.md 移植）+ conformance 测试 | M7 | 3d |
| 40 | 平台铺开：Codex/Cursor 先行，矩阵逐平台扩展至 ≥ 两竞品覆盖面 | M7 | 5d+ |
| 41 | docs/superiority-matrix.md：D1–D16 逐维对比证据表（随里程碑更新，收敛检查对照物） | 持续 | 0.5d |
| **M8** tap 流量代理（2026-07-07 用户确认进正式队列，human gate 解除） | | | |
| 34b | 协议面：ws_reconstruct（WebSocket 重组）+ bedrock 适配 + certs（本地 CA 生成/信任链） | M8 | 3d |
| 34c | 多 runtime 抓流：codex/kimi/openclaw/codebuddy/gemini 各端口绑定与转发 | M8 | 2d |
| 34d | dashboard traffic 查看器数据端（M3 server 承接：TraceRow/TraceDetail 消费 trace_store） | M8 | 1d |
| 34e | 安全护栏：默认 OFF；证书/抓包是敏感能力，doctor 明示「tap 正在拦截流量」红/黄灯；捕获数据本地不外发 | M8 | 1d |

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
| 2026-07-06 | #12 guard 全量校验面（iteration-10） | 收编：46 规则盘点 + 老 guard verdict 逐字一致，vitest 274/274 |
| 2026-07-07 | #20/#22/#23/#26b 批次1（iteration-11） | 收编：SessionStart 三注入 + 14 skills/4 agents + doctor 健康面，vitest 292/292 |
| 2026-07-07 | 真实测试层 C9/C10（iteration-12） | 收编：integration.test.ts 零 mock 真 fs，抓出 3 真实问题，vitest 311/311 |
| 2026-07-07 | #14 transition 全副作用（iteration-13） | 收编：老仓 case 块逐字 + 17 真 fs 例，oracle 0 不一致 |
| 2026-07-07 | #13 门 TTL 分级（iteration-13） | 收编：confirm 300/review·interaction 1800，5 处同步 + 7 真 fs 例 |
| 2026-07-07 | #15 task lifecycle（iteration-14） | 收编：依赖图/级联/canonical + 14 真 fs 例，vitest 432/432 |
| 2026-07-07 | #18 manifest 全派生面（iteration-14） | 收编：4 派生字段引擎真读 + 18 真派生例，就绪待 #19 消费 |
| 2026-07-07 | #16 living-spec（iteration-15） | 收编：specs/set-spec-scope/inject-jsonl + 14 真 fs 例 |
| 2026-07-07 | #17 session（iteration-15） | 收编：activate/route-context + 9 真 fs 例，占位诚实标注 |
| 2026-07-07 | **M1 内核深度里程碑收官** | 七项全收编（#12/#13/#14/#15/#16/#17/#18），vitest 541，oracle 0 不一致 |
| 2026-07-07 | #19 router hook（iteration-16） | 收编：Track 评分 + breadcrumb 注入 + 缓存零 spawn，test-hooks 116 |
| 2026-07-07 | #24 sync/uninstall（iteration-16） | 收编：所有权 hash scrubber + 16 真 fs 例，vitest 646 |
| 2026-07-07 | #21 PostToolUse 全套（iteration-17） | 收编：四 hook 纯 bash + JSON 转义硬测，test-hooks 180 |
| 2026-07-07 | #28 mem 会话检索（iteration-17） | 收编：Claude/Codex/Pi 三 runtime + 12 真 fs 例，vitest 741 |
| 2026-07-07 | #25 dashboard server（iteration-18） | 收编：版本抢占 + token 鉴权两欠账修复 + 17 真 HTTP，@pipeline-lite/server |
| 2026-07-07 | #27 channel 事件模型（iteration-18） | 收编：event-sourced 核心 + 143 测试 + barrier 隔离三重自证；进程层 →#27b |
| 2026-07-07 | **M2 hooks/插件全保真里程碑收官** | 六项全收编（#19/#20/#21/#22/#23/#24），vitest 741，hooks 180，oracle 0 不一致 |
| 2026-07-07 | #26 前端重构（iteration-19） | 收编：四病灶解法 + 71 真 render 测试（收件箱默认/导航≤3/Settings/Advanced） |
| 2026-07-07 | #26c server 服务 SPA（iteration-19） | 收编：GET / 真返 SPA+token 注入 + /assets/* + 穿越防护 |
| 2026-07-07 | #35 loop 治理（iteration-19） | 收编：registry schema + R1-R11 裁决 + L1-L3 分级放权 + 15 真 fs 例，vitest 994 |
| 2026-07-07 | #34 tap 核心+护栏（iteration-20） | 收编：MITM 守护+trace_store+安全护栏三条 + 13 真 socket |
| 2026-07-07 | #29 AFK Sandcastle（iteration-20） | 收编：队列状态机+scheduler+L1→L3 + 72 例 + docker honest-skip |
