# Pipeline Control Room — 全量用户旅程与编排体验设计

> 状态：v3 前端重构的产品与交互真相源
> 日期：2026-07-19
> 目标：把现有“能看、能改部分配置”的 dashboard 升级为覆盖 Project、Change、Track、Workflow、Step、AFK、Loop、Verifier、Skill Bundle、Triage、Sync 与真实 Run 的完整控制台。

## 1. 产品定锚

### 1.1 主题、用户、单一任务

- **主题**：AI 软件交付流水线的铁路联锁控制台（Pipeline Interlocking Control Room）。
- **主要用户**：同时管理多个代码项目、多个自动化 change 和不同自治等级的工程负责人。
- **单一任务**：从全局风险发现一路下钻到具体 change，在不丢失上下文的情况下完成编排、启动、观察、拍板和审计。

系统内部有很多类型和事实，但用户只需要理解五个问题：

1. 哪个项目现在需要我？
2. 哪个 change 卡住了，为什么？
3. 这个 change 按哪条 Track / Workflow 跑？
4. 自动化现在被什么策略约束，实际做了什么？
5. 下一步我能安全地做什么？

### 1.2 设计原则

1. **风险先于统计**：首屏先回答“需要我处理什么”，不先展示漂亮但不可行动的大数字。
2. **上下文不丢失**：Project → Change → Track → Workflow → Step → Run 是一条持续可见的路径，不用靠返回按钮重新定位。
3. **配置与运行并置**：编辑 Workflow 时能看到它服务的 Track、Change 和 Loop；看 Run 时能回溯当时冻结的 policy、skill bundle 和 verifier。
4. **继承优先，局部覆写**：先显示值来自 Track、Workflow、Step 还是 Loop；用户只编辑真正需要覆写的部分。
5. **权威事实只有一个**：token、admission、in-flight、verification、snapshot 必须来自 durable ledger 或 canonical run，禁止拿旧 projection 冒充。
6. **失败必须给下一步**：错误、空态、只读态都给明确可执行动作，不只给说明。
7. **危险动作风险不对称**：降级、暂停容易；升到 L3、删除 Workflow、执行真实 Run 必须预览影响并二次确认。

## 2. 视觉方向

### 2.1 设计计划（第一轮）

#### Color

| Token | Hex | 语义 |
|---|---:|---|
| Rail Paper | `#F5F7FA` | 控制台底板，不做暖奶油色 |
| Signal Ink | `#172231` | 主文字、轨道骨架、关键按钮 |
| Route Cobalt | `#2563EB` | 当前上下文、可导航线路 |
| Proceed Green | `#16A34A` | 已放行、可信、可执行 |
| Hold Amber | `#A85D0B` | 等待、预算预警、人工闸门 |
| Stop Red | `#C92A2A` | 阻断、失败、危险动作 |

暗色不是“全黑 + 荧光绿”，而是低反差的蓝黑控制室：底板 `#121821`、面板 `#1B2430`、轨道 `#3C4858`，信号色保持语义不变。

#### Type

- **Display / page title**：`Barlow Condensed`，用于项目名、Workflow 名和运行编号；字面窄，像线路牌，但只在标题使用。
- **Body / controls**：`IBM Plex Sans`，用于表单、说明和导航；工程感明确且中文回退稳定。
- **Data / identifiers**：`IBM Plex Mono`，用于 path、SHA、Track ID、Step ID、token 与时间。
- 中文回退：`PingFang SC`, `Microsoft YaHei`, sans-serif；不让中文被强行压窄。

#### Layout

- 72px 左侧主导航只承载空间切换；项目上下文进入顶部路线条。
- 内容区采用“主任务 8/12 + 事实检查器 4/12”，不再把所有配置塞进 modal。
- 运行密集视图用表格/时间线；配置密集视图用约束式编排画布 + 固定 inspector。
- 移动端变为“路线条横滑 + 主任务单列 + inspector 全屏 sheet”。

#### Signature

**Interlocking Route Strip（联锁路线条）**：顶部持续显示 `Project / Change / Track / Workflow / Step / Run`，每一段既是 breadcrumb，也是实时信号块。绿色表示已验证，琥珀表示等待，红色表示阻断，蓝色表示当前编辑上下文。用户点击任一段即可回到相应层级。

它不是装饰：路线条编码了系统真实归属关系和状态，是整个产品的空间记忆。

### 2.2 自我批评与修订

第一轮若落成“左导航 + KPI 卡片 + 右侧抽屉”，会变成任何 DevOps SaaS 都能套用的模板。修订如下：

- 删除首屏大 KPI 卡，把数字嵌入“需要你处理 / 正在运行 / 健康”三段真实队列。
- 卡片只用于有边界的对象摘要；项目和 change 主体改用信号表、路线和事件序列。
- 不在每个角落散落动画，只保留一次有意义的动作：进入项目时，路线条从 Project 逐段锁定到当前 Change/Run；`prefers-reduced-motion` 下直接呈现终态。
- 不新增自由画布；Workflow 拓扑仍是约束式横向主脊，避免用户拖出模型不能表示的几何。

## 3. 信息架构

### 3.1 一级空间

| 空间 | 用户问题 | 主要对象 |
|---|---|---|
| **Overview** | 哪个项目/任务需要我？ | Project、Change、决策、故障 |
| **Delivery** | 当前 change 在哪里、下一步是什么？ | Change、WorkflowRun、Transition、Artifact、Verification |
| **Studio** | Track、Workflow、Step 应如何运行？ | Track Registry、Workflow IR、Step、Hook、Skill、Prompt |
| **Operations** | 自动化现在如何运行和受控？ | AFK、Loop、Ledger、Budget、Triage、Sync、Real Run |
| **Machine** | 这台机器是否具备执行条件？ | Credentials、Docker、Skills、Hooks、Traffic、Runtime |

### 3.2 路由与上下文

```text
/overview
/projects/:project
/projects/:project/changes/:change
/projects/:project/studio/tracks/:track
/projects/:project/studio/workflows/:workflow
/projects/:project/studio/workflows/:workflow/steps/:step
/projects/:project/operations/afk
/projects/:project/operations/loops/:loop
/projects/:project/operations/triage
/projects/:project/operations/sync
/machine
```

实现可以继续使用 React state，不强制引入 router；但 URL/可恢复状态是最终契约，刷新后必须回到同一 Project/Change/Workflow/Step。

### 3.3 桌面布局

```text
┌────────┬───────────────────────────────────────────────────────────────┐
│        │ Project ─ Change ─ Track ─ Workflow ─ Step ─ Run             │
│ 主导航 ├────────────────────────────────────────────┬──────────────────┤
│        │                                            │                  │
│ 概览   │              主任务区 8/12                 │ 事实检查器 4/12  │
│ 交付   │  列表 / 编排画布 / 事件时间线 / 表单       │ 策略 / 证据 /    │
│ 编排   │                                            │ 运行真相 / 预览  │
│ 运行   │                                            │                  │
│ 机器   ├────────────────────────────────────────────┴──────────────────┤
│        │ 状态/保存/校验/连接反馈                                      │
└────────┴───────────────────────────────────────────────────────────────┘
```

## 4. 完整用户旅程

### Journey 0 — 第一次进入与机器准备

**入口**：没有注册项目，或项目不可达。

1. 用户点击“添加项目”，选择或输入本地路径。
2. 系统在写入前预检：目录、git、pipeline state、server 权限。
3. 注册成功后进入项目准备清单：CLI bundle、hooks、skills、Docker image、Codex/Claude credentials。
4. 每个检查项显示“可用 / 降级 / 阻断”以及唯一修复动作。
5. 用户可直接在 UI 完成已有写端点支持的配置；必须终端执行的动作提供可复制命令和完成后的重新检测。
6. 全部关键项绿后，CTA 变为“创建第一个 change”。

**完成证据**：项目出现在 Overview；机器准备状态来自真实 readiness endpoint；刷新后仍存在。

### Journey 1 — 多项目晨检

**目标**：30 秒内知道今天先处理什么。

1. Overview 按“需要你处理”排序，而不是按注册顺序。
2. 每个项目行显示：阻断 change、待审批、AFK 失败、运行中、ledger degraded、预算预警。
3. 用户可按“需要我 / 运行中 / 健康 / 全部”筛选。
4. 点击项目后，联锁路线条锁定 Project；页面显示该项目的 change 队列和运行健康。
5. 点击风险数字直接进入已过滤的 change 列表，不要求用户再次筛选。

**空态**：所有项目健康时显示最近成功和“创建 change”，不是空白庆祝页。

### Journey 2 — 查看具体 Change 并做决定

1. Change 详情页顶部显示当前 phase、Track、Workflow、automation/AFK 状态和下一动作。
2. 中部是 canonical WorkflowRun 时间线：每个 TransitionRecord、revision、artifact 和 gate 决定都有来源。
3. 右侧事实检查器分四组：
   - **Why now**：为什么需要用户；
   - **Run**：run/iteration/attempt/reservation 身份；
   - **Evidence**：verification issuer/verdict/evidence/subject/binding；
   - **Resources**：skill bundle digest、provider usage、worktree/container。
4. 用户可执行：批准、打回、停止、重新入队、接管现场、查看日志。
5. 每个危险动作先展示将发生的 phase、状态写入和是否产生真实执行。

**失败恢复**：保留现场时提供“打开 worktree / 恢复会话 / 重新验证 / 重新入队”四种明确路径。

### Journey 3 — 创建 Change 并选择运行路线

1. 用户点击“新建 change”。
2. 只输入名字和目标；Track 根据 router pattern 给推荐值，并解释为什么。
3. 选定 Track 后自动带出默认 Workflow、允许的 Workflow、policy profile 和 mandatory skills。
4. 用户可保持继承，也可显式选另一个允许的 Workflow。
5. 创建前展示首个 Step、review gate 和是否自动加入 AFK。
6. 创建后直接进入 Change 详情，而不是回列表。

### Journey 4 — 定义 Track

1. Studio 左栏展示 Track 列表，内建轨带锁，自定义轨可删。
2. 新建 Track 采用一页式向导：
   - Identity：ID、label、是否内建；
   - Routing：pattern、priority、enabled；
   - Workflow：default、allowed；
   - Policy：review seed、手动 AFK eligibility、`spec-complete` 后自动挂队（独立开关）、coverage profile、skill profile。
3. 右侧实时展示“哪些现有 change 会被这条规则命中”和冲突优先级。
4. 保存前校验 workflow 引用、路由冲突和 profile 引用。
5. 删除前列出受影响的 change、workflow 和 fallback，不允许产生 orphan。

自动挂队不是 runner 授权：它只在成功提交 `spec -> build` 后把 canonical `automation` 从 `off` 写为
`queued`。真正的 runner、Docker、外部副作用与 L1→L3 权限仍由 AFK 的独立 admission 与治理门控制；
因此普通 Track 的“可手动 AFK”不会被误解释为自动接管。

### Journey 5 — 创建或复制 Workflow

1. 用户从空白模板、default 副本或现有自定义 Workflow 复制。
2. 创建时必须选择至少一个允许使用它的 Track；未绑定可保存为 draft，但不能激活自动运行。
3. 主区显示约束式阶段脊；用户可新增、删除、重排 Step。
4. Inspector 始终显示当前 Step，不使用多层 modal。
5. 保存前运行完整编译验证；错误直接定位到 Step/字段/边。
6. 删除 Workflow 前列出 Track、Loop 和 Change 引用，提供迁移目标。

### Journey 6 — 定义 Step（全量能力）

Step inspector 固定为六个分区，顺序对应用户思考过程：

#### A. Intent

- Step ID、展示名、目标说明。
- `prompt`：给执行 agent 的具体任务上下文；支持继承自 Workflow/Track，并明确显示来源。
- 输入变量与可用上下文预览。

#### B. Skills

- Skill 候选来自 registry；显示 installed/source/version。
- 拖动表达顺序，连线表达 `depends_on`；循环依赖即时拒绝。
- 展示 effective skill slots、alternative 选择和运行时 Skill Bundle 快照预览。

#### C. Hooks

- 按 SessionStart / UserPromptSubmit / PreToolUse / PostToolUse 分组。
- 可配置 hook 使用真开关；required hook 使用锁定态；unsupported 明确说明缺少什么端点。
- 允许查看 hook 脚本、matcher 和生效范围，但不伪造新增能力。

#### D. Outputs & Artifacts

- Inputs、Outputs、类型、ArtifactDeclaration、producer policy、required_when。
- “注册产物”由结构化 UI 生成，与 `pipeline artifact register` 同一公共用例。
- 依赖下游的字段在删除前显示影响。

#### E. Gates & Transitions

- gate：none/review/confirm。
- step guards、edge guards、actions、事件和目标 Step。
- default/custom 的能力边界明确；不把 kernel 固定规则伪装成可编辑。

#### F. Automation

- 是否允许 AFK、runner、image、重试策略。
- Loop 归属/匹配、自治级继承、allowlist/denylist、人闸、budget。
- verifier binding 与 trusted issuer 要求。
- 运行前展示最终 Effective Policy，不让用户在六处猜继承结果。

### Journey 7 — 配置和启动 Loop

1. 用户从 7 个 starter pattern 选择，查看 goal/trigger/risk/推荐 workflow/skills。
2. 向导编译出 draft loop，展示 template/version、workflow binding、skill bundle wiring。
3. 未接线字段标红并保持 paused，不能用“保存成功”冒充可运行。
4. 用户执行 dry-run，看到候选 change、runner、level、image、budget settlement 和零写入保证。
5. 用户选择 `Run once` 或激活 cadence；L3 需要影响预览和二次确认。
6. 运行中显示 reservation→activation→usage→verification→merge intent→terminal 的完整 ledger 时间线。

### Journey 8 — AFK 运行与失败恢复

1. Operations / AFK 分为 queued、running、needs attention、completed。
2. 用户可从 change 或 AFK 页直接 enqueue，不再只复制终端命令。
3. 失败行显示结构化原因，不从自由文本猜测。
4. retry、dismiss、cancel 使用现有 server 公共用例；所有动作完成后立即刷新 canonical state。
5. 日志默认跟随尾部，可暂停、搜索、下载；显示 sandbox phase 与 host phase 的区别。

### Journey 9 — Triage 与 Sync

1. Triage 页面选择 source connector，预览 observation 和分类理由。
2. 用户确认后创建 0..N WorkflowRun；重复 observation 显示幂等结果。
3. Sync 页面先生成 ReconciliationPlan；每项显示 current、desired、风险和 CAS 前提。
4. 默认 dry-run，只有明确勾选项目才 apply；并发漂移时拒绝并要求重新生成计划。

### Journey 10 — 审计一次真实 Run

1. 从 Change 或 Loop 点击 Run ID。
2. 事实检查器显示 immutable policy、goal digest、iteration、attempt、reservation owner。
3. Ledger 时间线展示每条事实及原始 record ID。
4. Verification 面显示 issuer、trusted、verdict、subject revision、binding 和 evidence hash。
5. Skill 面显示 profile、resolved alternatives、concrete skill、tree digest、CAS path。
6. Usage 面拆分 input/output/cached/reasoning/total，并标 actual 或 reserved estimate。
7. 用户可以复制审计摘要，但不能修改历史事实。

## 5. 页面功能矩阵

| 领域 | Overview | Change | Studio | Operations | Machine |
|---|:---:|:---:|:---:|:---:|:---:|
| Projects / register | 主 | 辅 | — | — | 健康 |
| Change create / transition | 摘要 | 主 | 引用 | AFK 引用 | — |
| WorkflowRun / revision | 风险 | 主 | 运行叠加 | Run 详情 | — |
| Track Registry | 统计 | 归属 | 主 CRUD | policy 引用 | — |
| Workflow / Step IR | 统计 | 当前路线 | 主 CRUD | effective snapshot | — |
| Hooks / Skills / Artifacts | 健康 | evidence | 主编辑 | snapshot | 安装/注册表 |
| AFK | 失败数 | 动作 | step policy | 主 | readiness |
| Loop / ledger / budget | 风险 | 归属 | step policy | 主 | — |
| Verifier | 失败数 | 主 evidence | binding | run audit | 配置健康 |
| Triage / Sync | 摘要 | 来源 | — | 主 | — |
| Secrets / Docker / Traffic | 健康 | 降级原因 | runner 选择 | readiness | 主 |

## 6. 现有能力复用与新增后端契约

### 6.1 可直接复用

- `/api/snapshot`、SSE stream、project register/unregister。
- change create、transition、history。
- workflow list/get/post/delete。
- hooks、mandatory skills、automation settings、secrets、readiness、Docker images。
- loop snapshot/update/level。
- AFK cancel/retry/dismiss/enqueue、日志。
- traces 与 session links。

### 6.2 必须补齐

1. `/api/loops/snapshot` 透出 `template_id/template_version/workflow_id/skill_bundle_id`，前端消费现有 `ledger`。
2. `GET /api/change/:name/run-detail`：canonical WorkflowRun、TransitionRecord、关联 ledger、verification、skill snapshot、usage。
3. `GET/POST/PATCH/DELETE /api/tracks`：Track Registry 完整 CRUD 与引用影响预览。
4. Workflow API 接受并返回完整 IR 定义面：prompt、artifacts、edge guards/actions；若定义层尚无字段，先扩 kernel contract。
5. `POST /api/loops/init`、`POST /api/loops/:id/dry-run`、`POST /api/loops/:id/run`。
6. `POST /api/triage/preview|apply`。
7. `POST /api/sync/plan|apply`。
8. artifact register 的 HTTP 入口，复用 CLI 的同一 use case。

所有新增写端点继续使用本机 token、root trust anchor、schema validation、CAS/治理锁，不为 UI 另造较弱路径。

## 7. 简化编写操作的交互规则

1. **从对象开始，不从 YAML 开始**：用户选择 Track/Workflow/Step，表单只展示该层能控制的字段。
2. **默认继承**：新 Track 从现有 profile 复制；新 Workflow 默认复制；新 Step 从相邻 Step 推导 transition，但保存前明确展示。
3. **渐进展开**：常用字段常驻；高级 guards/actions/policy 在 inspector 分区内展开，不藏到全局设置。
4. **就地影响预览**：删除、改路由、换 workflow 时立即列出受影响对象。
5. **单一保存模型**：同一 Workflow 的编辑使用一个 dirty 状态、一个保存动作、一个错误列表；不让每个子卡各自保存。
6. **命令是降级，不是主流程**：后端已有写端点的能力必须给 UI；只有真正没有端点的能力才给终端命令。
7. **结构化错误优先**：reason code → 标题/解释/修复动作；自由文本只作为“详情”。

## 8. 测试 seam（用户请求“全量 E2E”即为确认）

TDD 只在以下公共 seam 写测试：

1. **HTTP seam**：真实 request/response、鉴权、root anchor、CAS、错误信封。
2. **UI seam**：用户能看到的文本、role、状态和动作；不断言私有 state 或 CSS 实现。
3. **Persistence seam**：通过公共 API 写入后再经公共 GET/CLI 读取，不直接调用内部 helper 证明成功。
4. **Binary seam**：真实 `packages/cli/dist/pipeline.mjs` 执行的 exit code 与落盘事实。
5. **Browser seam**：真实 server + 临时 git 项目 + 浏览器完成完整 Journey。

### 8.1 浏览器 E2E 必跑旅程

- E2E-01：注册项目 → readiness → 创建 change。
- E2E-02：Overview → 项目 → change → transition/approve。
- E2E-03：创建 Track → 创建 Workflow → 新增/重排 Step → 配 hook/skill/output/prompt → 保存刷新保持。
- E2E-04：从 starter 初始化 Loop → wiring → dry-run 零写 → real-run。
- E2E-05：AFK enqueue → running/log → cancel/retry/dismiss。
- E2E-06：故意 verifier fail → evidence 面显示真实 issuer/subject/reason。
- E2E-07：skill bundle 快照与 provider usage 审计。
- E2E-08：triage preview/apply 与 sync plan/apply/CAS 冲突。
- E2E-09：workflow/track 删除影响预览与迁移。
- E2E-10：窄屏、键盘、reduced-motion、明暗主题。

## 9. 完成定义

只有同时满足以下条件才算“全量功能全部实现”：

- 上述十条用户旅程均能从 UI 完成；明确的内部只读事实必须可观察。
- 任何后端已有写能力不得只给终端命令。
- durable ledger、structured verification、skill bundle snapshot、canonical run identity 均进入 UI。
- Track、Workflow、Step、Loop、AFK、Triage、Sync 具备真实创建/编辑/执行路径。
- 所有新增能力有 HTTP/UI/binary 对应 seam 测试。
- 前端单测、server 集成、全仓 build/test/oracle/honesty 全绿。
- 真实 Docker + Codex 浏览器 E2E 全绿；没有凭证的 provider 必须诚实报告外部阻断，不能 skip 后宣称通过。
