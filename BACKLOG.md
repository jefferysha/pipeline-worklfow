# BACKLOG — loop-lite 队列

> loop-lite 每轮从队首取一项。完成 → 移入下方「已收编」。发现新缺口 → 按优先级插入。

## 队列（按序）

| # | 项 | 对应 plan 任务 | 预算 |
|---|---|---|---|
| **M3** dashboard | | | |
| **M4** channel + mem | | | |
| **M5** automation / AFK Sandcastle（2026-07-07 用户确认全量迁移，human gate 已解） | | | |
| **M6** 竞品缺口收尾 | | | |
| **M-loop** loop-engineering 内建（GOAL B18–B21 / D16） | | | |
| **M7** 平台矩阵（GOAL D7/D14） | | | |
| **M8** tap 流量代理（2026-07-07 用户确认进正式队列，human gate 解除） | | | |

队列空。#29-wire/#34-wire（iteration-30）+ G6 full agent-in-sandbox（iteration-32）+ G4/G5/长尾适配器/
dashboard config 端点（iteration-33）均已收编——**无任何登记在册的诚实缺口**。CI（`.github/workflows/ci.yml`）
已补齐；sandcastle 镜像发布仅停留在 `tools/sandcastle/build.sh`+README 记录手动步骤，实际推送到某
registry 待仓库所有者决定（非代码缺口，是运维决策）。

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
| 2026-07-07 | #30 上下文压缩（iteration-21） | 收编：确定性压缩 45.4%>Comet + 7 真 fs 例，D11 |
| 2026-07-07 | #31 auto-transition 中间档（iteration-21） | 收编：advance guard 自动推进+HITL 三重证明，D12 |
| 2026-07-07 | #39 适配器框架+Cursor 转正（iteration-22） | 收编：58 conformance 断言+变异测试，claude/codex/cursor active，D7 |
| 2026-07-07 | #36 loop 预算与熔断（iteration-22） | 收编：token budget+circuit breaker+成本估算 + 16 真 fs 例，D16 |
| 2026-07-07 | #41 超越矩阵 + #32 Cursor（iteration-22） | 收编：docs/superiority-matrix.md D1-D16 证据表；#32 已由 #39 完成 |
| 2026-07-07 | #33 Trellis parity 收尾（iteration-23） | 收编：8 partial+1 missing 全处置 + 14 真 fs 例，B16 |
| 2026-07-07 | #37 漂移检测+审计（iteration-23） | 收编：7 维 drift + loop-ready 评分 + 20 真 fs 例，B21 |
| 2026-07-07 | #25b transition 单源（iteration-24） | 收编：事件表上提 kernel，cli+server 删 303 行镜像，oracle 0 不一致 |
| 2026-07-07 | #38 L1→L3 毕业制（iteration-24） | 收编：升降档裁决+consume #36/#37 + 16 真 fs 例，D16 闭环 |
| 2026-07-07 | #27b channel 进程层（iteration-25） | 收编：supervisor+真fork+SIGTERM+OS-liveness + 11 真进程例，M4 完成 |
| 2026-07-07 | #29d/#34d server 数据端（iteration-25） | 收编：afk 泳道+调度器灯+traffic 查看器 + 14 真 HTTP + 13 真 render |
| 2026-07-07 | #34b/#34c tap 协议面（iteration-26） | 收编：ws重组+bedrock+本地CA·TLS MITM(node v24 真跑 0 skip)+13 runtime，60 测试 |
| 2026-07-07 | #29c automation docker 全链（iteration-26） | 收编：真容器执行+真 git worktree/merge-back 冲突留现场，111 测试 4 docker honest-skip |
| 2026-07-07 | #40 平台铺量（iteration-27） | 收编：4 平台转 active（跨 A/B/C）+ 125 conformance 断言 + 真文件变异测试，active 7+longtail 5，D7/D14 |
| 2026-07-07 | #29-wire docker 执行接线（iteration-30） | 收编：tools/sandcastle/ 真镜像（精简至仅需 git，apk 巨慢的 python3/jq/bash 全裁）+ createDockerRunChange 接 runChangeInSandbox + `pipeline afk run` 真调 automation.runRound（真容器/真 git worktree/真 barrier build_sha/真 L3 merge-back）；docker.integration.test.ts + container.integration.test.ts 的 2 处非 token 门控 honest-skip 翻真跑；新增 dockerRunChange.integration.test.ts(3) + afk-run.integration.test.ts(4，自足建镜像不依赖跨文件执行序) |
| 2026-07-07 | #34-wire tap daemon 启动器 + TLS 绑定（iteration-30） | 收编：daemon.ts 接 CertificateAuthority.fromDir→serveForward({ca})；launch.ts 用 detectTarget+reverseEnvMap/forwardEnvMap 真装配（forward 缺 ca 拒绝而非静默盲隧道）；record 路径真接 decodeBedrockEventstreamEvents（forward-proxy 响应解码）+ ws-proxy.ts 全新 wss:// 真中继（RFC6455 帧累加器+CONNECT/TLS-MITM 之后的 upgrade 透传+reconstructWsRequestBody/ResponseBody 首次接活路径）；security.ts InterceptEntry.tls 供 doctor「正在解密」披露；`pipeline tap start` 全新 CLI bin 入口（daemon 模式前台常驻+SIGINT 收尾 / `-- <command>` 模式真 spawn 注入 env）。副产品：发现并修复 commander 真 bug（variadic `[args...]` 里裸 `--` 若前一 token 是普通位置参数会被静默吞掉——main.ts 改为从原始 argv 手工切出 passthrough 段，绕开 commander 内部状态机缺陷）。38 新测试（daemon ca 2 + launch 7 + forward-proxy bedrock 1 + ws-proxy 7 + security tls 2 + tap CLI e2e 7 + afk-run e2e 3-4） |
| 2026-07-07 | 真 token 验证 full CC-in-sandbox，抓出 3 真缺口（iteration-31） | 收编：extraEnv 通道补齐 + 容器内自起 tap（host.docker.internal 静默丢包）+ `--dangerously-skip-permissions` 补齐；tap 真录 4 条含真 Bearer 头请求，token 被 Anthropic 判 401（非本仓问题）——agent 编码本身仍待验证 |
| 2026-07-07 | G6 闭环：有效 token 真跑 full CC-in-sandbox（iteration-32） | 收编：agent 真读 design_doc、真建文件、真 commit，`git show` 独立核验；tap 8 条真请求确认走代理；真跑抓出并修复 2 个沙箱环境真缺口（alpine 缺 bash/SHELL、容器任意 uid 无 passwd 条目致 HOME 解析成 `/`）——**无遗留诚实缺口** |
| 2026-07-07 | G4/G5 + 5 长尾适配器 + dashboard config 端点 + CI + 镜像发布文档（iteration-33） | 收编：4 agent 并行 fan-out（文件互不相交）+ 主会话集成。G4 真 e2e 驱动完整 7 相位 skill 编排；G5 `node:sqlite` 真读 OpenCode（零第三方依赖）；aider/continue/cline/amp/zed 全部真实现（continue/cline 经查证升档 B→A），conformance 125→224；dashboard config 写端点复用 B5 鉴权；`.github/workflows/ci.yml` + `tools/sandcastle/build.sh`/README。八门全绿 |
| 2026-07-07 | CI 首次真跑抓出 hooks 全仓 8 处 stat -f/-c 跨平台真 bug（iteration-34） | 收编：iteration-33 推送后 CI 首次真跑 ubuntu-latest 即抓红——gate.sh 等 8 处 mtime 读取写法在 GNU stat 下失效（`-f` 是文件系统状态模式非 mtime，"成功"吐垃圾文本致算术崩溃 exit 1）；本机从无 Linux 真跑记录，补 CI 当轮即真抓出。修复 8 处 + 真 Ubuntu 容器直接复现崩溃/验证修复（含真跑 gate.sh 新鲜/陈旧 marker 两条路径），CI 复跑真绿 |
