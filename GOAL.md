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

- [ ] **A1 内核深度（M1）**：guard 全量校验面、transition 全副作用、task lifecycle、
      living-spec、session、manifest 全派生面、门 TTL 分级（confirm 300s / review·interaction 1800s）
- [ ] **A2 hooks/插件全保真（M2）**：router Track 识别 + breadcrumb、SessionStart 三注入、
      PostToolUse 全套、7 相位 SKILL + openspec 四命令 + learn-record、4 agents、sync/uninstall scrubber
- [ ] **A3 dashboard（M3）**：TS 全局 server + 前端信息架构重构
- [ ] **A4 channel + mem（M4）**：worker 总线、跨 runtime 会话检索
- [ ] **A5 automation（M5）**：AFK 调度（评估先行，human gate）
- [ ] **A6 竞品缺口（M6）**：见清单 B 的 B13–B17
- [x] **A0 7-phase 状态机 + 三门 + CLI + 单文件分发 + 导入工具**（v0.1，iteration-0~9，oracle 0 不一致）

## 清单 B · 修改与优化点（迁移 ≠ 平移——每条都是对老仓的改进承诺）

**架构**
- [x] B1 单语言 TS 内核：三读取器契约构造性消灭（iteration-1）
- [x] B2 manifest 单一真相源：引擎真读 review_phases，修老仓半接线欠账（flow.test 回归锚）
- [x] B3 历史存储去变形：JSONL 侧文件替代 base64 塞 YAML + `pipeline import` 迁移（iteration-2/8）
- [ ] B4 全局 server 版本抢占：多项目多版本共存时新版本接管（老仓欠账 #3）→ M3
- [ ] B5 dashboard 写端点 token 鉴权：localhost 裸写回面封死（老仓欠账 #4）→ M3
- [ ] B6 构造级模块化：channel/mem/automation 独立可选包 + snapshot capability 声明、前端按声明渲染 → M3/M4
- [x] B7 hook 热路径纯 bash 红线：制度化为测试自证（grep -c node = 0，iteration-1/7）
- [ ] B8 降级可见：fail-open 不再静默——统一 `pipeline doctor` 健康面，列明"哪些保障此刻真的在生效/已降级"（对标 comet doctor + 老仓六灯，老仓 _pipeline_health 无统一面的补全）→ M3
- [x] B9 注释考古不入代码：历史入 docs/进度流水，代码只留当前约束（全仓执行中）

**UI（老仓四病灶的解法）**
- [x] B10 收件箱：`pipeline inbox`/`--html`——默认回答"在等我什么决定"（iteration-5/6）；M3 里升级为 dashboard 默认落地页
- [x] B11 statusline：终端内零开销状态（iteration-7）
- [ ] B12 操作与配置分离 + debug 降级：Kanban/Settings/Advanced 三层，一级导航 ≤3 项 → M3

**竞品缺口（Comet / Trellis 对标分析的全部遗留）**
- [ ] B13 上下文压缩：phase handoff 压缩（Comet CONTEXT-COMPRESSION 对标）→ M6
- [ ] B14 auto-transition 中间档：guard 全绿自动推进、仅三门停（HITL 与 AFK 之间）→ M6
- [ ] B15 Cursor 适配器转正 → M6
- [ ] B16 Trellis parity 收尾：8 partial + 1 missing → M6
- [x] B17 npx 一行上手：5 分钟心智模型路径（iteration-4，Trellis 简单性教训的落实）

**loop-engineering 思想内建（2026-07-06 用户指令，对标 cobusgreyling/loop-engineering + 老仓 loops 子系统）**
- [ ] B18 loop 治理子系统：loops registry（schema 校验的登记表）+ enforce 裁决（budget/kill 判据/
      规则面，老仓 R1-R11 移植起步）+ 执行流水审计（run-log）→ M-loop
- [ ] B19 分级放权 L1→L3：report-only → 人工门放行 → allowlist 自动合并，AFK 自动化必须从 L1
      毕业制升级（上游 Phased Rollout 思想 × 老仓 human gates）→ M5 前置
- [ ] B20 token 预算与熔断：loop 级 budget 声明 + 超支 circuit breaker + 成本估算（上游
      loop-cost/loop-context 思想）→ M-loop
- [ ] B21 漂移检测与就绪审计：声明意图（LOOP 定义）vs 实际状态（STATE/流水）自动对账 +
      loop-ready 评分（上游 loop-sync/loop-audit 思想；老仓 TestLoopMdMirror 的推广）→ M-loop

## 清单 D · 竞争超越判据（2026-07-06 用户指令：任何方面都超过 Trellis 与 Comet）

对两个对标项目的每个核心维度，本仓必须做到"≥ 且核心维度 >"。勾选需给出逐维对比证据
（docs/superiority-matrix.md，随里程碑更新）：

**vs Trellis（11.8k★）**
- [ ] D1 规范持久化与自动注入：spec 注入面 ≥ Trellis（SessionStart 三注入 + manifest 单源）→ M2
- [x] D2 任务/状态结构化：`.pipeline.yaml` 37 字段 + 7 相位 > Trellis task PRD 三态（v0.1）
- [ ] D3 会话记忆/journal：mem 检索 + history JSONL ≥ Trellis workspace journal → M4
- [ ] D4 真实工具链验证：check/guard 全量面 + 三轨 verify > trellis-check（#12 已过半）→ M1/M2
- [ ] D5 学习回写闭环：learn-record ≥ trellis-update-spec → M2
- [x] D6 简单性：npx 一行上手 + 5 分钟心智模型 ≥ trellis init（iteration-4）
- [ ] D7 多平台：适配器矩阵 ≥ Trellis 16 平台（可移植内核 + 分档降级策略）→ M7
**vs Comet（2k★）**
- [x] D8 脚本守门状态机：三门 hook 硬拦 + guard 46 规则 + CAS/锁 > comet-guard（#12）
- [ ] D9 dashboard：全局 server + 收件箱默认视图 + 鉴权 > comet 只读面板 → M3
- [ ] D10 doctor 健康面：降级可见 + 保障生效清单 > comet doctor 安装诊断 → M3
- [ ] D11 上下文压缩：handoff 压缩 ≥ Comet CONTEXT-COMPRESSION（beta）→ M6
- [ ] D12 auto-transition：中间档 + L1→L3 分级 > Comet AUTO-TRANSITION → M6
- [x] D13 可恢复工作流：断点恢复不依赖对话历史（.pipeline.yaml 真相源，v0.1 oracle 验证）
- [ ] D14 平台广度：≥ Comet 30 平台的策略面（内核可移植性已具备，矩阵铺开）→ M7
**vs 两者皆无（差异化护城河）**
- [x] D15 golden-oracle 行为等价迁移法（双跑逐字 diff——两家都没有的质量证据链）
- [ ] D16 loop-engineering 治理内建（B18–B21——两家都没有的 loop 安全面）

## 清单 C · 质量保障（过程约束——任何一轮违反即不收编，没有例外）

- [x] C1 **五门全绿**方可收编：build / vitest / test-hooks / verify-skills / oracle 双跑
- [x] C2 **golden-oracle 行为等价**：与老内核逐字对齐，差异必须白名单化并文档说明（CONTRACT §3）
- [x] C3 **TDD 先红**：先红测试后实现（iteration-5 的瑕疵已记录在案，此后每轮流水注明先红证据）
- [x] C4 **skill/资产零悬空引用**：verify-skills 安装期硬校验（用户硬要求，CONTRACT §5.7）
- [x] C5 **热路径性能预算**：PreToolUse/statusline 纯 bash、零解释器 spawn（测试自证）
- [ ] C6 **复杂度预算**：核心插件保持"5 分钟心智模型"——新增子系统必须可选装；每里程碑收编时复查上手路径仍 ≤5 分钟
- [x] C7 **契约实测回写**：文档口径与实测冲突时以实测为准并回写 CONTRACT，留审计记录
- [x] C8 **流水可审计**：每轮 progress.md 记录证据（测试计数/oracle 结果/commit hash），诚实记录瑕疵

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
