# GOAL — pipeline-worklfow

## 终态 v2.0（工作流自定义引擎 + dashboard 工作台，2026-07-07 brainstorming 定稿）

**v1.0（下方"终态 v1.0"章节）已达成收官——完整 TS 重写 + 与老仓 workflow-plugin 字节级行为
等价，那是上一阶段的目的。从这里开始是新阶段，`与老仓行为等价`不再是新功能的验收约束**
（golden-oracle 作为历史证据链保留，但只覆盖"默认 workflow 预设"，不覆盖本阶段新增的自定义
能力）。详细技术设计见
`docs/superpowers/specs/2026-07-07-workflow-customization-and-dashboard-workbench-design.md`。

**达成判定 = 下方清单 E/F 全部勾满。** 与 v1.0 相同的纪律延续：证据先于勾选、清单只增不删、
八门验证全绿才收编。

> **当前状态（2026-07-08）**：F 全绿（F1-F4 全勾）；E 尚未全绿——E1-E7 全勾，**E8（workflow
> 编辑器画布 UI）故意不做**（`workflow-customization-engine.md` 收尾说明的范围切分，需等这条
> 主线落地后再设计画布怎么读写它，见下方 E8 脚注）。**v2.0 尚未达成收官**，E8 是唯一剩余项，
> 留给后续一份独立计划；届时补上才满足本文件自己定义的"E/F 全部勾满"收官判据。

## 清单 E · Workflow 自定义引擎

> 2026-07-08 集成收尾勾选，证据源：`docs/superpowers/plans/2026-07-07-workflow-customization-engine.md`
> 11 个任务 + `.superpowers/sdd/progress.md`（已合并进 `feature/dashboard-workbench`，见
> `docs/loops/progress.md` iteration-35）。E1/E3/E6 与最初文字表述有真实的、已披露的实现
> 偏差，逐条见下方脚注，不是静默勾掉。

- [x] E1 workflow 定义文件格式：`.pipeline/workflows/<name>.yaml`（Task 5 `loadWorkflow`
      真读该路径），7 相位内置为 `default` workflow（`templates/workflows/default.yaml`，
      数据非写死类型）。**实现偏差**：state 文件只新增了 `workflow` 字段（Task 4），未新增
      设计文档 §2.2 例子里写的独立 `current_step` 字段——Task 8 改为直接复用既有 `phase`
      字段承载自定义 workflow 的当前 step id（`workflow==='default'` 时其值仍是旧 7 相位
      枚举，`workflow!=='default'` 时其值是任意合法 step id），单字段身兼两职、靠 `workflow`
      字段消歧，功能等价但字面上不是"新增 current_step 字段取代 phase"。
- [x] E2 skill DAG 依赖：`depends_on` 声明（同 step 内，`skillDag.ts`/Task 6），取代已否决的
      parallel/serial 分组方案；无依赖 skill 天然并行，多依赖精确表达交叉依赖关系
- [x] E3 inputs/outputs：step 级别持久字段契约（`parse.ts`/`types.ts`，Task 2）+ 保存时
      引用校验（Task 3/E5）+ `evaluateStepGuards`（Task 7）按 `outputs` 声明写回字段，
      取代 kernel 硬编码字段表这部分真落地。**已披露缺口**：未驱动现有相位 handoff 压缩机制
      （`packages/kernel/src/compress/handoff.ts` 的 `PHASE_DOCS` 仍是按 7 个固定相位名
      写死的映射表，未读取 step 的 `inputs`/`outputs`）——设计文档
      （`docs/superpowers/specs/2026-07-07-*-design.md`）本身通篇未提 handoff.ts，11 个
      任务也无一涉及，是设计阶段就遗漏的一处衔接，非实现偷工。影响面：`default` workflow
      的 handoff 压缩（B13 护城河功能）完全不受影响、一如既往工作；自定义 workflow 下
      `phase` 是任意 step id，与 `PHASE_DOCS` 键值不匹配，`phaseHandoffDocs()` 静默返回
      空列表——即自定义 workflow 目前拿不到 handoff 压缩这个优化，非崩溃、非误报，登记入
      `docs/TEST-REALITY.md`。
- [x] E4 guards 参数化：现有 guard 规则类型（tasks-at-least/nonempty-output 等，Task 1/7）
      保留为代码实现的可选用类型，"用在哪个 step、参数多少"变成数据；`tasks-at-least` 真实
      计数逻辑仍是 Task 7 标注的诚实 TODO（恒失败，已登记 `docs/TEST-REALITY.md` 缺口 1）
- [x] E5 保存时校验：无循环依赖 + inputs 必须对应更早 step 的 outputs，拒绝非法 workflow
      不等运行时报错（`validate.ts`，Task 3，75 例）
- [x] E6 gate.sh 动态解锁：读 workflow 定义 + 扫描"进入当前 step 以来"的历史记录判定
      skill 解锁状态（Task 9）。**已披露窄例外**：`workflow==='default'` 这条最高频路径
      仍是纯 bash 热路径、零 spawn，CONTRACT §5.4 红线对它的承诺不破；仅当活跃 change 声明
      非 default workflow 且本次调用是 `Skill` 工具时，才委托 `node ... internal-skill-gate`
      做真实 DAG 判定（自定义 workflow 依赖图不值得在 bash 里重新实现一遍）——已作为 CONTRACT
      §5.4 的显式披露例外回写，`tools/test-hooks.sh` 把 `gate.sh` 从"零 node"红线清单里
      单独摘出并改断言"仅此一处合法引用"，非静默破例
- [x] E7 旧格式迁移工具：`pipeline migrate-workflow`（Task 10），类比现有 `pipeline import`，
      一次性迁移，不做运行时双格式兼容
- [ ] E8 workflow 编辑器 UI：真画布节点连线图（step/skill 为可拖拽节点，`depends_on` 用
      拖线表达）——**完全不在本轮范围**，`workflow-customization-engine.md` 收尾说明明确写
      "画布 UI 不在本计划内……等这条主线落地、真有一个可读写的 workflow 文件格式之后再设计
      画布怎么读写它"，是故意的范围切分，不是遗漏；本轮不勾、留待后续独立计划

## 清单 F · Dashboard 工作台

> 2026-07-08 集成收尾勾选，证据源：三份 dashboard 计划的 `.superpowers/sdd/progress.md`
> （均 PLAN COMPLETE、任务逐一审核通过），见 `docs/loops/progress.md` iteration-35。

- [x] F1 导航：新增"工作台"下拉分组（`Nav.tsx` `WORKBENCH_VIEWS`），下辖 AFK 工作台 + loop
      设置，顶部恢复到 3 项（收件箱/看板/设置）+ 1 个分组触发按钮。workflow 编辑器（E8 画布
      UI）本轮未建、skill 编辑器本就是设置页内弹窗（非独立导航目的地），故两者不占此分组
- [x] F2 Skill 编辑器升级：`SkillTransferModal.tsx` 弹窗双栏穿梭框（左栏全部已注册 skill
      可搜索，右栏当前已选可拖拽排序），复用现有 `POST /api/config/mandatory-skills` 契约
      （skill-editor-transfer-modal 计划，4/4 任务）
- [x] F3 AFK 工作台：`AfkWorkbench.tsx` 列表+详情侧栏（左列表右详情：日志 tail/sandbox·
      worktree 路径/取消·重试操作），新增日志读取端点 + 取消/重试写端点（afk-workbench
      计划，8/8 任务）
- [x] F4 Loop 设置：`LoopsPanel.tsx` 单表视图（loop/就绪分/状态一行一个，点开详情含
      drift/就绪 band + 升降档操作），新增聚合读端点（snapshot）+ 升降档写端点（promote）
      （loop-settings-dashboard 计划，5/5 任务）

---

## 终态 v1.0（2026-07-06 用户指令定稿，已达成收官——历史参照，不再是验收约束）

**不是"把老仓代码搬过来"，而是交付一个行为等价、结构更优、质量有证据的完整替代品**：
老仓（workflow-plugin，本机 `/Users/a1234/Documents/code-manager/projects/workflow-plugin`）
全部核心功能在 TS 单语言内核上重建，且本次重构启动前诊断出的**每一个架构欠账、UI 病灶、
竞品缺口都在新仓被修复或实现**，每项收编都有机器可验证的质量门证据。

**达成判定 = 下方三张清单全部勾满。** loop-lite 的收敛检查（kill 判据）以本文件为唯一
对照物：任何一项未勾即存在缺口、循环不许收官；勾一项必须给出证据（测试名/oracle
报告/commit）。清单只增不删——发现新缺口就补进清单，绝不为收官降低标准。

> **✅ v1.0 收官（2026-07-07 iteration-28）**：四张清单全部达成（A 功能完备 / B 优化点 /
> C 质量保障含无伪测试 / D 竞品超越 9>·5≥·3 护城河）。8 里程碑全收编，~2040 断言全绿、
> golden-oracle 每轮 0 不一致、零伪测试。
>
> **✅ #29-wire / #34-wire 部署接线双双翻真跑（2026-07-07 iteration-30）**：拿到 docker 环境后，
> AFK docker 执行（`pipeline afk run` 真调 automation.runRound + 真容器 + 真 git worktree/merge-back
> + 真 barrier build_sha）与 tap daemon 启动器（`pipeline tap start` 真绑端口 + CA/TLS MITM +
> bedrock/ws 记录路径真接活）均已真跑验证，不再是 report-only 占位。
>
> **iteration-31（真 token 验证 full CC-in-sandbox）**：用户提供真 CLAUDE_CODE_OAUTH_TOKEN 并要求
> 必须走代理不直连，真跑全链路抓出并修复 3 个此前从未被真凭证触发过的死角（extraEnv 通道缺失、
> host.docker.internal 在本环境对宿主端口静默丢包故改容器内自起 tap、agent 分支缺
> `--dangerously-skip-permissions` 会挂死）。**tap 代理真实拦截+记录+转发了 4 条完整请求到真
> `api.anthropic.com`**（含真实 claude-cli User-Agent/系统提示词/Bearer 头，证明"走代理不直连"
> 约束真实成立）；该 token 被 Anthropic 真服务端拒绝（401，非本仓代码问题，未耗真实额度）——
> **agent 编码这一步本身仍待有效凭证验证**，如实登记不虚报为通过。详见 docs/superiority-matrix.md
> （逐维证据）+ docs/TEST-REALITY.md（真测审计）+ progress.md。
>
> **✅ iteration-32（G6 闭环：full CC-in-sandbox「agent 真编码成功」真跑验证通过）**：拿到有效
> `sk-ant-oat01-...` token 后真跑到底——agent 真读 design_doc、真建文件、真 git commit，`git show`
> 独立核验（非只信 agent 自报）；tap 记录 8 条真请求逐字确认 `upstream_base_url:
> https://api.anthropic.com` + 真 `anthropic-beta: oauth-2025-04-20` + `response.status: 200`。
> 真跑过程中抓出并修复 2 个此前从未被有效凭证触发过的沙箱环境真缺口（alpine 缺 bash/SHELL 未设
> 导致 Bash 工具报错、容器任意 host-uid 无 passwd 条目导致 HOME 解析成不可写的 `/`）——**唯一
> 剩余诚实缺口彻底清零**。详见 docs/TEST-REALITY.md G6 条目 + progress.md iteration-32。
>
> **✅ iteration-33（长尾挂账清零：G4/G5 + 5 长尾适配器 + dashboard config 端点 + CI + 镜像发布文档）**：
> 4 项并行 fan-out（文件互不相交）+ 主会话 CI/发布脚本收编。G4：新增真 e2e 驱动完整 7 相位 skill
> 编排（含变异测试自证非空转绿）。G5：`node:sqlite` 内建模块真读 OpenCode（零第三方依赖，19 真例，
> schema 经真跑官方包核对而非猜测）。5 长尾适配器（aider/continue/cline/amp/zed）全部真实现，
> continue/cline 经查证由目标档 B 升级为 A；conformance 125→224。Dashboard 配置写端点复用 B5
> 鉴权 + 手术式 manifest 写回 + kernel 回读校验。`.github/workflows/ci.yml` 补齐八门自动化；
> `tools/sandcastle/build.sh`+README 记录手动构建/发布步骤（registry 选择留给仓库所有者）。
> 八门全绿，无新增诚实缺口。详见 docs/TEST-REALITY.md 对应条目 + progress.md iteration-33。

---

## 清单 A · 功能完备（迁移面 → BACKLOG M1–M6）

- [x] **A1 内核深度（M1）✅ 收官 iteration-15**：guard 全量校验面(#12)、transition 全副作用(#14)、
      task lifecycle(#15)、living-spec(#16)、session(#17)、manifest 全派生面(#18)、门 TTL 分级(#13)——
      七项全收编，均带真 fs e2e + oracle 双跑 0 不一致
- [x] **A2 hooks/插件全保真（M2）✅ 收官 iteration-17**：router Track 识别 + breadcrumb(#19)、
      SessionStart 三注入(#20)、PostToolUse 全套(#21)、7 相位 SKILL + openspec 四命令 + learn-record(#22)、
      4 agents(#23)、sync/uninstall scrubber(#24)——全收编，热路径纯 bash 红线 + 真 fs/真 hook e2e
- [x] **A3 dashboard（M3）**：server(#25) + 前端(#26) + SPA 服务(#26c) + doctor(#26b) + transition 单源(#25b) + config 写端点（iteration-33，复用 B5 token 鉴权）——全收编
- [x] **A4 channel + mem（M4）✅**：mem 跨 runtime 检索(#28) + channel 事件模型(#27) + channel 进程层 supervisor/真fork/SIGTERM/OS-liveness(#27b)
- [x] **A5 automation / AFK Sandcastle（M5）✅**：队列+scheduler+lifecycle+L1→L3(#29) + server afk 数据端(#29d) + docker 全链真实现+真 git worktree/merge-back 冲突留现场(#29c) + **#29-wire 部署接线真跑**（iteration-30：`pipeline afk run` 真调 automation.runRound(createDockerRunChange) + 真容器 + 真 merge-back，sandcastle:test 镜像 e2e 验证）；full agent-in-sandbox 支线（含 CLAUDE_CODE_OAUTH_TOKEN 门控）已用有效凭证真跑验证通过（iteration-32）
- [x] **A6 竞品缺口（M6）✅**：上下文压缩(B13)+auto-transition(B14)+Cursor 转正(B15)+Trellis parity(B16)+npx 上手(B17) 全收编
- [x] **A7 tap 流量代理（M8）✅**：daemon+proxy+trace_store+护栏(#34) + traffic 数据端(#34d) + ws 重组/bedrock/本地 CA·TLS MITM(#34b，node v24 真跑) + 13 runtime clients(#34c) + **#34-wire 部署接线真跑**（iteration-30：daemon 接 CertificateAuthority.fromDir、launch.ts 真装配 detectTarget+env 注入、record 路径真接 bedrock 解码 + 全新 ws-proxy.ts 中继首次接活 ws-reconstruct、`pipeline tap start` 全新 CLI 入口）
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
- [x] B19 分级放权 L1→L3（#38 iteration-24）：毕业制 report→人工门→allowlist，逐级升(准入=就绪分)不跨级、降档安全优先，消费 #36/#37 零改核心
- [x] B20 token 预算与熔断（#36 iteration-22）：loop 级 token budget + circuit breaker（超阈值 tripped）
      + 成本估算（cadence×pattern），扩展 #35 loops、enforce 零改动
- [x] B21 漂移检测与就绪审计（#37）：7 维 drift 对账 + 0-100 loop-ready 评分

## 清单 D · 竞争超越判据（2026-07-06 用户指令：任何方面都超过 Trellis 与 Comet）

对两个对标项目的每个核心维度，本仓必须做到"≥ 且核心维度 >"。勾选需给出逐维对比证据
（docs/superiority-matrix.md，随里程碑更新）：

**vs Trellis（11.8k★）**
- [x] D1 规范持久化与自动注入（#20/#18）：SessionStart 三注入 + manifest 单源 ≥ Trellis
- [x] D2 任务/状态结构化：`.pipeline.yaml` 37 字段 + 7 相位 > Trellis task PRD 三态（v0.1）
- [x] D3 会话记忆/journal（#28/#7）：mem 跨 3 runtime 检索 + history JSONL ≥ Trellis workspace journal
- [x] D4 真实工具链验证（#12/#29c）：check/guard 46 规则全量面 + automation docker 沙箱 verify > trellis-check
- [x] D5 学习回写闭环（#22）：learn-record 三层回写 ≥ trellis-update-spec
- [x] D6 简单性：npx 一行上手 + 5 分钟心智模型 ≥ trellis init（iteration-4）
- [x] D7 多平台策略面（#39/#40/iteration-33）：适配器框架 + 224 conformance 断言 + 分档降级 A/B/C，active 12（claude/codex/cursor/gemini/copilot/pi/devin/aider/continue/cline/amp/zed，longtail 已清零）（conformance 机器校验 > Trellis 手工投影）
**vs Comet（2k★）**
- [x] D8 脚本守门状态机：三门 hook 硬拦 + guard 46 规则 + CAS/锁 > comet-guard（#12）
- [x] D9 dashboard（#25/#26/#26c）：全局 server + 收件箱默认视图 + token 鉴权 + 版本抢占 > comet 只读面板
- [x] D10 doctor 健康面（#26b/#34e）：11 项保障生效清单 + tap 敏感能力明示 > comet doctor 安装诊断
- [x] D11 上下文压缩（#30）：确定性压缩 45.4% > Comet 25-30%（且可 oracle）
- [x] D12 auto-transition（#31）：中间档 + HITL 红线三重证明 > Comet AUTO-TRANSITION
- [x] D13 可恢复工作流：断点恢复不依赖对话历史（.pipeline.yaml 真相源，v0.1 oracle 验证）
- [x] D14 平台广度（#39/#40/iteration-33）：可移植内核 + 填表式扩展经 9 平台实证（一次转 active 跨 A/B/C 档，含长尾 5 平台真实现，2 项经查证由目标档升级）；策略面 > Comet 手工 30（本仓 conformance 保证等价性）
**vs 两者皆无（差异化护城河）**
- [x] D15 golden-oracle 行为等价迁移法（双跑逐字 diff——两家都没有的质量证据链）
- [x] D16 loop-engineering 治理（#35/#36/#37/#38）✅闭环：registry+enforce R1-R11+L1→L3 毕业制+budget/circuit-breaker+drift/loop-ready 审计+graduation 执行面——两竞品都无此面（独有护城河）

## 清单 C · 质量保障（过程约束——任何一轮违反即不收编，没有例外）

- [x] C1 **五门全绿**方可收编：build / vitest / test-hooks / verify-skills / oracle 双跑
- [x] C2 **golden-oracle 行为等价**：与老内核逐字对齐，差异必须白名单化并文档说明（CONTRACT §3）
- [x] C3 **TDD 先红**：先红测试后实现（iteration-5 的瑕疵已记录在案，此后每轮流水注明先红证据）
- [x] C4 **skill/资产零悬空引用**：verify-skills 安装期硬校验（用户硬要求，CONTRACT §5.7）
- [x] C5 **热路径性能预算**：PreToolUse/statusline 纯 bash、零解释器 spawn（测试自证）
- [x] C6 **复杂度预算**：核心 kernel+cli 独立 workspace 包，channel/mem/automation/tap/server/dashboard 各自独立可选装（npm workspaces 分包）；npx 一行上手路径全程保持
- [x] C7 **契约实测回写**：文档口径与实测冲突时以实测为准并回写 CONTRACT，留审计记录
- [x] C8 **流水可审计**：每轮 progress.md 记录证据（测试计数/oracle 结果/commit hash），诚实记录瑕疵
- [x] **C9 无伪测试 · 真实且全量（2026-07-07 用户指令，向 Trellis 学习）✅**：任何功能不得
      仅以 mock 单测收编——每条 CLI 命令 / 每个子系统必须有**驱动真实实现、真实文件系统、
      真实子进程**的端到端测试（真跑 kernel createStateStore/createFlowEngine、真跑编译产物、
      真跑 hooks 脚本）。mock 单测可留作快速回归，但**收编门以真实 e2e 绿为准**。
      伪测试判据（命中即不算真测试）：① 断言的是 mock 的返回而非真实副作用；② 测试通过但
      真实路径从未执行；③ 跳过/伪造 pass 冒充绿（延续老仓「任何路径不为绿伪造」诚实门）。
      落地：packages/cli/src/integration.test.ts（真 fs 全命令）+ oracle 双跑 + bundle 冒烟，
      三者构成真实证据链；每新增命令/子系统必须进真实 e2e 面，audit 见 docs/TEST-REALITY.md。
- [x] **C10 覆盖全量 ✅**：真实 e2e 覆盖每条命令 happy path + 关键错误路径 + 跨命令串联
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
