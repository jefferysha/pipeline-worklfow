# GOAL — pipeline-worklfow

## 终态（v1.0 的唯一定义，2026-07-06 用户指令定稿）

**不是"把老仓代码搬过来"，而是交付一个行为等价、结构更优、质量有证据的完整替代品**：
老仓（workflow-plugin，本机 `/Users/a1234/Documents/code-manager/projects/workflow-plugin`）
全部核心功能在 TS 单语言内核上重建，且本次重构启动前诊断出的**每一个架构欠账、UI 病灶、
竞品缺口都在新仓被修复或实现**，每项收编都有机器可验证的质量门证据。

**达成判定 = 下方三张清单全部勾满。** loop-lite 的收敛检查（kill 判据）以本文件为唯一
对照物：任何一项未勾即存在缺口、循环不许收官；勾一项必须给出证据（测试名/oracle
报告/commit）。清单只增不删——发现新缺口就补进清单，绝不为收官降低标准。

---

## 清单 A · 功能完备（迁移面 → BACKLOG M1–M6）

- [x] **A1 内核深度（M1）✅ 收官 iteration-15**：guard 全量校验面(#12)、transition 全副作用(#14)、
      task lifecycle(#15)、living-spec(#16)、session(#17)、manifest 全派生面(#18)、门 TTL 分级(#13)——
      七项全收编，均带真 fs e2e + oracle 双跑 0 不一致
- [x] **A2 hooks/插件全保真（M2）✅ 收官 iteration-17**：router Track 识别 + breadcrumb(#19)、
      SessionStart 三注入(#20)、PostToolUse 全套(#21)、7 相位 SKILL + openspec 四命令 + learn-record(#22)、
      4 agents(#23)、sync/uninstall scrubber(#24)——全收编，热路径纯 bash 红线 + 真 fs/真 hook e2e
- [~] **A3 dashboard（M3）**：TS 全局 server(#25)✅ + 前端信息架构重构(#26)✅ + server 服务 SPA(#26c)✅
      + doctor(#26b)✅；剩单源技术债 #25b、config 写端点
- [~] **A4 channel + mem（M4）**：mem 跨 runtime 检索(#28)✅ + channel 事件模型(#27)✅；channel 进程层 #27b 待补
- [~] **A5 automation / AFK Sandcastle（M5）**：队列状态机+scheduler+lifecycle+L1→L3(#29)✅；docker 全链 #29c / server afk 数据端 #29d / 毕业制 #29e 待补
- [ ] **A6 竞品缺口（M6）**：见清单 B 的 B13–B17
- [~] **A7 tap 流量代理（M8）**：daemon+capture/forward proxy+trace_store+安全护栏(#34)✅；ws/CA #34b / 多 runtime #34c / traffic 查看器 #34d 待补
- [x] **A0 7-phase 状态机 + 三门 + CLI + 单文件分发 + 导入工具**（v0.1，iteration-0~9，oracle 0 不一致）

## 清单 B · 修改与优化点（迁移 ≠ 平移——每条都是对老仓的改进承诺）

**架构**
- [x] B1 单语言 TS 内核：三读取器契约构造性消灭（iteration-1）
- [x] B2 manifest 单一真相源：引擎真读 review_phases，修老仓半接线欠账（flow.test 回归锚）
- [x] B3 历史存储去变形：JSONL 侧文件替代 base64 塞 YAML + `pipeline import` 迁移（iteration-2/8）
- [x] B4 全局 server 版本抢占（#25）：旧版本 SIGTERM 让位，真进程 e2e（修老仓欠账 #3）
- [x] B5 dashboard 写端点 token 鉴权（#25）：crypto 256-bit + 0600 握手 + 常量时间比较，POST 无 token 401（修老仓欠账 #4）
- [x] B6 构造级模块化（#25~#39）：kernel/server/dashboard/tap/automation 独立 workspace 包 + snapshot capability 声明、前端按声明渲染
- [x] B7 hook 热路径纯 bash 红线：制度化为测试自证（grep -c node = 0，iteration-1/7）
- [x] B8 降级可见（#26b/#34e）：`pipeline doctor` 11 项保障生效清单 + tap 敏感能力明示（补老仓 _pipeline_health 无统一面）
- [x] B9 注释考古不入代码：历史入 docs/进度流水，代码只留当前约束（全仓执行中）

**UI（老仓四病灶的解法）**
- [x] B10 收件箱：`pipeline inbox`/`--html`——默认回答"在等我什么决定"（iteration-5/6）；M3 里升级为 dashboard 默认落地页
- [x] B11 statusline：终端内零开销状态（iteration-7）
- [x] B12 操作与配置分离 + debug 降级（#26）：收件箱/看板/设置三视图 + Advanced 折叠，一级导航恰 3 项

**竞品缺口（Comet / Trellis 对标分析的全部遗留）**
- [x] B13 上下文压缩（#30 iteration-21）：phase handoff 确定性压缩（实测 45.4% > Comet 25-30%），零 LLM 可 oracle
- [x] B14 auto-transition 中间档（#31 iteration-21）：`pipeline advance` guard 全绿自动推进、复核相位+三门必停（HITL 红线三重证明，> Comet AUTO-TRANSITION）
- [x] B15 Cursor 适配器转正（#39 iteration-22）：spike→可发布，veto/track native + inject 降级 .cursor/rules，修「声明 track 却不写 history」病灶
- [x] B16 Trellis parity 收尾（#33 iteration-23）：8 partial + 1 missing 全处置（3 实现 + 1 忠实占位 + 5 诚实 N-A）
- [x] B17 npx 一行上手：5 分钟心智模型路径（iteration-4，Trellis 简单性教训的落实）

**loop-engineering 思想内建（2026-07-06 用户指令，对标 cobusgreyling/loop-engineering + 老仓 loops 子系统）**
- [x] B18 loop 治理子系统（#35 iteration-19）：loops registry（schema 校验的登记表）+ enforce 裁决
      （R1-R11 规则面 + budget/kill 判据）+ L1→L3 分级放权入 schema；执行流水审计 run-log 就绪
- [ ] B19 分级放权 L1→L3：report-only → 人工门放行 → allowlist 自动合并，AFK 自动化必须从 L1
      毕业制升级（上游 Phased Rollout 思想 × 老仓 human gates）→ M5 前置
- [x] B20 token 预算与熔断（#36 iteration-22）：loop 级 token budget + circuit breaker（超阈值 tripped）
      + 成本估算（cadence×pattern），扩展 #35 loops、enforce 零改动
- [~] B21 漂移检测与就绪审计：drift + loop-ready 评分 → 进行中 #37

## 清单 D · 竞争超越判据（2026-07-06 用户指令：任何方面都超过 Trellis 与 Comet）

对两个对标项目的每个核心维度，本仓必须做到"≥ 且核心维度 >"。勾选需给出逐维对比证据
（docs/superiority-matrix.md，随里程碑更新）：

**vs Trellis（11.8k★）**
- [x] D1 规范持久化与自动注入（#20/#18）：SessionStart 三注入 + manifest 单源 ≥ Trellis
- [x] D2 任务/状态结构化：`.pipeline.yaml` 37 字段 + 7 相位 > Trellis task PRD 三态（v0.1）
- [x] D3 会话记忆/journal（#28/#7）：mem 跨 3 runtime 检索 + history JSONL ≥ Trellis workspace journal
- [~] D4 真实工具链验证（#12）：check/guard 46 规则全量面 > trellis-check；三轨 verify 待 #29c 沙箱 verify
- [x] D5 学习回写闭环（#22）：learn-record 三层回写 ≥ trellis-update-spec
- [x] D6 简单性：npx 一行上手 + 5 分钟心智模型 ≥ trellis init（iteration-4）
- [x] D7 多平台策略面（#39）：适配器框架 + conformance + 分档降级，active 3/planned 4（填表可扩，> Trellis 手工）
**vs Comet（2k★）**
- [x] D8 脚本守门状态机：三门 hook 硬拦 + guard 46 规则 + CAS/锁 > comet-guard（#12）
- [x] D9 dashboard（#25/#26/#26c）：全局 server + 收件箱默认视图 + token 鉴权 + 版本抢占 > comet 只读面板
- [x] D10 doctor 健康面（#26b/#34e）：11 项保障生效清单 + tap 敏感能力明示 > comet doctor 安装诊断
- [x] D11 上下文压缩（#30）：确定性压缩 45.4% > Comet 25-30%（且可 oracle）
- [x] D12 auto-transition（#31）：中间档 + HITL 红线三重证明 > Comet AUTO-TRANSITION
- [x] D13 可恢复工作流：断点恢复不依赖对话历史（.pipeline.yaml 真相源，v0.1 oracle 验证）
- [~] D14 平台广度（#39）：可移植内核 + 填表式扩展策略就绪；铺到 ≥Comet 30 平台待 #40
**vs 两者皆无（差异化护城河）**
- [x] D15 golden-oracle 行为等价迁移法（双跑逐字 diff——两家都没有的质量证据链）
- [~] D16 loop-engineering 治理（#35/#36/#37）：registry+enforce R1-R11+L1→L3+budget/circuit-breaker+drift/loop-ready 审计；graduation 执行面待 #38（两竞品都无此面）

## 清单 C · 质量保障（过程约束——任何一轮违反即不收编，没有例外）

- [x] C1 **五门全绿**方可收编：build / vitest / test-hooks / verify-skills / oracle 双跑
- [x] C2 **golden-oracle 行为等价**：与老内核逐字对齐，差异必须白名单化并文档说明（CONTRACT §3）
- [x] C3 **TDD 先红**：先红测试后实现（iteration-5 的瑕疵已记录在案，此后每轮流水注明先红证据）
- [x] C4 **skill/资产零悬空引用**：verify-skills 安装期硬校验（用户硬要求，CONTRACT §5.7）
- [x] C5 **热路径性能预算**：PreToolUse/statusline 纯 bash、零解释器 spawn（测试自证）
- [ ] C6 **复杂度预算**：核心插件保持"5 分钟心智模型"——新增子系统必须可选装；每里程碑收编时复查上手路径仍 ≤5 分钟
- [x] C7 **契约实测回写**：文档口径与实测冲突时以实测为准并回写 CONTRACT，留审计记录
- [x] C8 **流水可审计**：每轮 progress.md 记录证据（测试计数/oracle 结果/commit hash），诚实记录瑕疵
- [ ] **C9 无伪测试 · 真实且全量（2026-07-07 用户指令，向 Trellis 学习）**：任何功能不得
      仅以 mock 单测收编——每条 CLI 命令 / 每个子系统必须有**驱动真实实现、真实文件系统、
      真实子进程**的端到端测试（真跑 kernel createStateStore/createFlowEngine、真跑编译产物、
      真跑 hooks 脚本）。mock 单测可留作快速回归，但**收编门以真实 e2e 绿为准**。
      伪测试判据（命中即不算真测试）：① 断言的是 mock 的返回而非真实副作用；② 测试通过但
      真实路径从未执行；③ 跳过/伪造 pass 冒充绿（延续老仓「任何路径不为绿伪造」诚实门）。
      落地：packages/cli/src/integration.test.ts（真 fs 全命令）+ oracle 双跑 + bundle 冒烟，
      三者构成真实证据链；每新增命令/子系统必须进真实 e2e 面，audit 见 docs/TEST-REALITY.md。
- [ ] **C10 覆盖全量**：真实 e2e 必须覆盖每条命令的 happy path + 关键错误路径 + 跨命令串联
      （init→…→archive 全程），不许只测子集；覆盖缺口在 TEST-REALITY.md 显式登记，不静默留白。

---

## 历史

**v0.1（轻量内核切片）**：四项判据 2026-07-06 iteration-9 收敛检查全部达成 ✅——
oracle 双跑 0 不一致；lite 写 → 老内核读交叉验证通过；vitest 232/232 + kernel 零运行时
依赖；单文件 bundle 全程 open→archive 七相位跑通。原范围定义见 git 历史（`0820771` 前）。

## 为什么（动机，2026-07-06 架构评审结论，保留）

1. 老内核 bash 7.2 万行已过维护经济性拐点，python3 已是关键路径硬依赖——"纯 bash 可移植"前提不再成立。
2. 三读取器契约靠纪律防漂移，单语言构造性消灭。
3. 竞品对照（comet 2k★ / Trellis 11.8k★）：赢用户靠"5 分钟建立心智模型"，不是功能面。
4. base64 历史塞 YAML 的存储变形 → JSONL 侧文件。
