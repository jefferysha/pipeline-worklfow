# UX 深度分析:配置体验的生产者错位与交互重构方案(2026-07-11)

> **触发**:用户验收反馈第 10 点原话——「这些让用户填,体验太差,怎么可能填得出来。深入分析如何做交互体验」。本文档是该点要求的正式分析,与两份可点击 demo 配套供用户拍板:`design-demos/v6-workbench-flow.html`(编排页信息架构,对应第 5/6/7 点)、`design-demos/v6-config-copilot.html`(配置生产者重构,对应第 8/9/10 点 + AFK 首跑引导)。
>
> **事实底座**:`scratchpad/maps/{loopafk,workbench,progress,decisions,skills}.md` 五份代码地图 + 本文档写作过程中补充核验的源码(`doctor.ts`/`session-start.sh`/`sdk.ts`/`container.ts`/`.gitignore` 等,均标注独立核实)。凡引用皆带 `file:line`;地图与源码有出入处以源码为准并明确标注差异,不凭空编数据。
>
> **命名约定**:下文用 `Demo1-A/B/C` 指 `v6-workbench-flow.html` 的「流程即真相/双层门架/检查站泳道」三方案,`Demo2-A/B/C` 指 `v6-config-copilot.html` 的「终端生成 UI 审阅/向导+推导/模板+微调」三方案——两份 demo 各自独立编号 A/B/C,提及时务必带 `Demo1-`/`Demo2-` 前缀,不单说「方案 A」以免混淆。
>
> **范围声明**:本文档只审计 Loop 卡(编排页「自动运行」)、AFK 执行卡(编排页「AFK 执行」)、workflow 编辑面(StepEditor 主体)三处用户当前需要手填的配置面,不重议已被决议#6 移出导航的 SettingsView/AdvancedPanel;也不重议决议#1-14 本身——凡新提议与既有决议冲突,一律在第七节登记「需重开决议」而非顺手改写。

---

## 一、核心矛盾陈述

用户原话的技术翻译:**配置的生产者应该是 agent/系统,不是人**。

用户日常的真实工作方式是在终端里和 agent 对话——讨论要做什么(`goal`)、agent 写产出文档(`design_doc`)、agent 判断变更范围有多大(`risk`)、agent 知道这个 change 会走哪些 workflow 阶段。这些信息在 agent 那一侧本来就是"已经产出"的状态。但 dashboard 编排页给用户看到的,是一张裸表单:15 个文本框/滑杆/chips 等着人从空白开始手填,而人此刻手里并没有 agent 已经拥有的那些上下文。

这不是"表单设计得不够精美"的问题,是**角色错位**:把本该由 agent/系统承担的"生产"工作,安在了本该只负责"审阅与拍板"的人身上。

现状空态本身就是这个错位最直接的物证——`LoopCard.tsx:311-330` 的 `EMPTY_EXAMPLE`:当 root 下一个 loop 都没有时,卡片展示的不是任何引导 UI,而是一整段可直接复制的 YAML 样板(与 schema 必填面完全对齐,详见第二节),教用户去 `.pipeline/loops.yaml` 里手写。连界面自己的空态设计都默认"这活儿是人在文本编辑器里干的",从未设想过"该弹一个向导"或"该等 agent 生成"。这与仓库里另一处真实存在的引导模式——`pipeline doctor`(`packages/cli/src/commands/doctor.ts`)11 项绿黄红灯 + 修复 hint——形成鲜明对照:doctor 模式已经证明了"系统检测 + 给可操作 hint"这条路在本仓是走得通的工程模式,只是从未被用在配置生产这件事上。

第二节的逐字段审计会把这个直觉钉成数字:Loop 卡 15 个草稿字段里,近半数字段填错了都不影响任何真实调度行为,只是喂给一个只有系统自己看的"就绪评分"——用户"怎么可能填得出来"的直觉,背后的技术真相是**这些字段本来就不该被当成"要填对"的东西来对待**。

已确立的能力面模型(`decisions.md` 二·能力面模型基线)早就定下"前端只读看进度,人的动作只有继续/打回/重试/终止+放弃"的纪律——这条纪律目前只覆盖了"跑起来之后"的交互,配置面(跑之前的裸表单)是这条纪律唯一还没覆盖到的死角。本文档第五节推荐的 `Demo2-A`,本质上就是把这条已有纪律延伸到配置面:人的动作从"打字生产内容"收窄成"批准/调整/驳回"——与四动作模型同源,不是另起一套新规则。

---

## 二、逐字段生产者审计表

方法论:对每个字段回答三个问题——①它在运行时真被谁读、读了会触发什么(消费等级,直接取自 `loopafk.md` 的逐字段审计,硬消费=填错真出事/软消费=只影响 warn 或评分/零消费=无运行时消费者);②它现在是谁在填、以什么方式填;③它本该是谁产出、系统有没有现成的推导来源。

### 2.1 Loop 卡:15 个草稿字段(`LoopCard.tsx:36-53` `LoopDraft` 接口逐字核对,与 `kernel/src/loops/update.ts` 可 patch 全集一致,`autonomy_level` 除外)

| 字段 | 消费等级(loopafk.md §1) | 现生产者 | 应然生产者 | 推导来源 |
|---|---|---|---|---|
| `status` | **硬**——kernel enforce R1 kill-switch(`enforce.ts:186-187`,paused/retired 判 kill);drift `status-drift`(`drift.ts:252-258`) | 人手点开关(`LoopCard.tsx:447-453`) | 人拍板——**已是正确交互模型**(tap 不是打字),初始值系统给 `active` 即可 | 无需推导,维持现状 |
| `goal` | 软——readiness 20 分,≥30 字符满分(`drift.ts:299-301`) | 人手打字一段话(`:496-506`) | agent 生成 | agent 在终端对话/brainstorming 结论里已经产出过目标陈述,摘要即可,不必人从零打字 |
| `design_doc` | 软——readiness observability 5 分(`drift.ts:335-338`);纯声明无运行时读取 | 人手打字路径字符串(`:509-519`) | agent 生成 | agent 本来就是这份文档的作者,它知道自己刚写的文件存在哪;退一步系统可扫 change 目录下 `docs/*.md` 给候选下拉 |
| `change_prefix` | **硬**——① enforce 在途计数 `countInFlight`(`enforce.ts:285-303`)与 R11 ship-barrier 对账(`:306-309`)② denylist 归属(`denylist.ts:68-72`)③ runner 归属(`runnerFor.ts:23`)④ drift 前缀对账(`drift.ts:240-249`)⑤ readiness 额外 5 分(`drift.ts:329-331`) | 人手打字字符串,UI 给实时预览示例(`:522-537`) | 系统推导 + 人确认 | 从 loop `id` 派生默认建议值(如 `id=restyle-loop` → 建议 `rl-`),人确认或改,不必从空白输入框开始 |
| `risk` | 软——仅影响 cost 估算的 `PATTERN_TOKENS_PER_RUN[risk]` 预设常量(`budget.ts:31-32,181-183`),不触发任何 kill/warn 判据 | 人手选下拉(`:539-544`) | agent 生成 | agent 对该 loop 的变更范围本就有判断(它才是要跑这些 change 的一方) |
| `runner` | **硬**——`runnerForChange` → `buildAfkRunCommand`(仅 `'codex'` 注入 `PIPELINE_RUNNER=codex`,`runner.ts:119`)→ 沙箱脚本分流(`pipeline-afk-run.sh:38-65`);同时触发凭证白名单透传(见第四节) | 人手选下拉(`:550-564`,`LOOP_RUNNERS` 双选项) | 系统推导 + 人确认 | 结合第四节「就绪三灯」的凭证探测结果反向建议——只有凭证已配的 runner 才给"推荐"标记 |
| `cadence` | **硬**——enforce R9 停摆检测,超 2× cadence 判 warn(`enforce.ts:220-222`);readiness 额外 10 分(`drift.ts:321-327`) | 人手拖离散档滑杆 | agent 生成建议 + 人确认 | risk 档位 × kind(orchestrator/executor)的经验预设,或参照同 root 其它 loop 的 cadence |
| `budget.max_runs_per_day` | **硬**——enforce R2 kill / R3 80% 减速线(`enforce.ts:192-194`) | 人手拖滑杆 1-100 | 系统给安全默认 + 人拍板上限 | risk 档位映射经验默认(如 low→48/medium→24/high→8),人在默认值上调整而非凭空定数字——上限本身是风险容忍决策,理应人工,但起点不该是空白 |
| `budget.max_in_flight` | 软——R8 只出 warn,不在 `KILL_RULES {R1,R2,R4,R6}`(`enforce.ts:212-213,40`);L1 report-only 连自动停都不做(`loopafk.md §4`) | 人手拖滑杆 1-4 | 系统预填推荐值 + 人可调 | UI 已标注"推荐 1"(`loopafk.md §4`),该值直接预填而非留白 |
| `budget.max_tokens_per_day` | **硬**——token circuit breaker(`budget.ts:119`) | 人手拖滑杆 10k-500k,可选空 | 系统推导 + 人确认 | `risk` 档位对应的 `PATTERN_TOKENS_PER_RUN` × 每日预期 run 次数,算出建议熔断线供人确认,而非让人猜一个 5 位数 |
| `budget.on_exceed` | **零**——目前仅 budget 报表回显(CLI `loops.ts:273`),调度器不硬消费(`loopafk.md:25`) | 人手选 pill(skip/pause) | 系统给死默认,不作为决策项呈现 | 无——建议默认 `skip` 直接落值,折进"高级"而非平铺主表单占用决策带宽 |
| `human_gates` | 软——readiness 20 分(`drift.ts:309-312`);声明面 | 人手打字 chips 自由文本 | agent 生成候选 + 人勾选 | 从该 loop 关联 workflow 定义里 `gate: review` 的阶段列表反推候选(哪些阶段本来就设了复核门,系统能直接读出),不该让人凭空敲字 |
| `kill_criteria` | 软——readiness 20 分(`drift.ts:304-306`);**判据本体是 enforce 硬编码 R1-R11**(阈值常量 `enforce.ts:31-40`),字符串本身不被解析执行 | 人手打字 chips 自由文本(仅 `no-change-3`/`budget-burn-2d` 两个已知 id 有人话副标,`LoopCard.tsx:239-242`) | 系统给候选清单 + 人勾选 | enforce.ts 硬编码阈值的人话映射表做成勾选清单,而不是自由文本框——现状"填什么都不影响真实 kill 逻辑"的错觉本身就该被消除 |
| `allowlist` | **零**——仅存储侧,"执行面另落"(kernel `types.ts:65`),语义留给 L3 unattended 自动合并许可范围但无运行时消费者 | 人手打字 chips 路径 glob | 暂不呈现为需决策字段 | 当前无消费者,不该占用人的填写负担;待真正接线消费后再从常见目录系统推导候选 |
| `denylist` | **硬**——`resolveDenylist`(`afk.ts:133-134`)→ `dockerRunChange.ts:129-131` 每 run 现读 → 结算 `git diff --name-only` 对 glob 匹配,违规判 conflict 保留现场 | 人手打字 chips 路径 glob | 系统推导候选 + 人勾选/追加 | 常见敏感路径预置候选(`.env`/`secrets/**`/`.pipeline/**`/`node_modules` 等),人从候选里勾,而不是凭记忆手打 glob 语法 |

**关于 `on_exceed` 的核对说明**:brief-v6.md 摘要的"硬 8 / 软 6 / 零 3"三桶统计合计 17 项,未纳入 `on_exceed`。按 `loopafk.md §1` 原表("目前是声明面,调度器不硬消费")核对,15 个草稿字段的完整分布应为**硬 7 · 软 6 · 零 2**(`on_exceed` 与 `allowlist` 同属零消费)。

### 2.2 Loop 登记项(卡内不可编辑)与即时决策项

这三个字段不在 `LoopDraft` 里,但同样是"谁该产出"问题的一部分——`phases`/`state` 是 loops.yaml 里 schema 必填但 dashboard 不给编辑区的字段(只能手写文件),`autonomy_level` 是唯一一个不走草稿-保存流程、点击即发的字段。

| 字段 | 消费等级 | 现生产者 | 应然生产者 | 推导来源 |
|---|---|---|---|---|
| `phases` | **零**——schema 要求 `minItems:2`(`registry.ts:304`),但**全仓无任何运行时消费者**(grep 仅命中 `types.ts:56` 与 schema 两处),不与 workflow 定义做 join 校验(`loopafk.md:35`) | 人手写 YAML 数组(dashboard 不可编辑) | 系统推导——workflow 阶段多选 chips | 选中 workflow 定义的 `steps` 列表直接给多选,不该让人手打阶段名字符串还要求 ≥2 项 |
| `state` | 软(名义 5 分)/**零(实质)**——readiness observability 5 分(`drift.ts:336`),但**实际读取路径是硬编码** `.superpowers/loops/progress.md`(`server/loops.ts:60-66`、`cli loops.ts:96-101`),字段值本身不被用来定位文件 | 人手写 YAML 路径字符串 | 系统给死值,不呈现为可编辑项 | 硬编码约定路径本身;这是本表里最荒诞的一例——填什么路径都不影响真实读取,只要"填了非空"就加 5 分 |
| `autonomy_level` | **硬**——① `POST /api/loops/level` → kernel 毕业制裁决(`server.ts:608-628`)② scheduler 成功落态(L3→merged,L1/L2→paused,`scheduler.ts:132`)③ `autoMerge=level==='L3'`(`dockerRunChange.ts:127`) | 人点击 L1/L2/L3 tile,即时发送(`:649-665`,不在草稿) | 人拍板——**本表唯一"现状已经正确"的字段** | 无需推导;这本就该是治理毕业决策,tap 而非填表恰是正确模型的示范 |

综合以上,loop 相关全部 18 个字段(15 草稿 + 2 登记项 + 1 即时决策项)里,真正吃"填错真出事"级别消费的只有 **8 个**(含 `autonomy_level`),不到一半。用户"怎么可能填得出来"的直觉,背后是一半以上的字段填错也不会有任何后果——只是在给一个只有系统自己看的分数交作业。

### 2.3 AFK 执行卡:4 个字段(`AutomationCard.tsx`,存储 `.pipeline/automation.json`)

| 字段 | 消费等级(loopafk.md §3) | 现生产者 | 应然生产者 | 推导来源 |
|---|---|---|---|---|
| `max_parallel` | **硬**——`createScheduler` semaphore 并发闸,acquire 不到就排队(`scheduler.ts:101,177`) | 人手拖滑杆 1-8(`:142-152`) | 系统预填推荐值 4 + 人可调 | `automationConfig.ts:32-40` 既定推荐值,只欠"预填而非留白/留中间值"这一步 UI 动作 |
| `max_retries` | **硬**——scheduler 失败路 `incrAttempts`(`scheduler.ts:158-159`) | 人手拖滑杆 0-3(`:153-163`) | 系统预填默认值 1 + 人可调 | 同上,`automationConfig.ts` 既定默认 |
| `default_opt_in` | **硬**——enqueue 门 `shouldEnqueueOnSpecComplete`(`sdk.ts:71-77`) | 人手点开关(`:167-178`) | 系统预填默认 true + 人拍板要不要关 | SDK 内置默认(`sdk.ts:62`);是否自动入队是治理决策理应人工,但起始态不该空白 |
| `image` | **硬**——三级同源 `--image` 显式 > `automation.json` > `sandcastle:local`(`afk.ts:124`)→ `docker run <image>`(`container.ts:41-54`) | 人手打字自由文本框,占位符提示(`:180-194`) | 系统推导——真 `docker images` 下拉 | 见第四节「镜像下拉」:本机 `docker images` 枚举结果;docker 不可用降级回文本框,镜像缺失给一键复制的 `build.sh` 命令 |

**AFK 卡的特殊之处**:4 个字段**全部硬消费**,和 Loop 卡"近半数是作文"的问题完全不同——AFK 卡的用户困惑不是"填了没用",而是"没人告诉你该填多少、选哪个镜像"。这意味着 Loop 卡和 AFK 卡需要不同的解法着力点:Loop 卡的核心是"不该让人填的字段别再让人填";AFK 卡的核心是"真该人拍板的字段,把裸输入变成可枚举的裁决"(滑杆预填推荐值、`image` 从自由文本框换成真实枚举下拉)。两者共享同一个大方向(`Demo2-A`:终端/系统生产,人只审阅拍板),但具体到每个字段的"推导来源"设计不能一刀切。

### 2.4 workflow 编辑面主要字段(`StepEditor.tsx` + Hook 矩阵 + manifest 矩阵)

方法论说明:`loopafk.md` 的硬/软/零三级消费审计是专门针对 loop registry 字段的方法论,workbench.md 没有对 workflow 字段做同款分类。下表如实按 `workbench.md §3/§4` 的证据描述"运行时角色"(而非编造一个消费等级标签),其余三列(现生产者/应然生产者/推导来源)方法与 2.1-2.3 一致。

| 字段 | 归属 | 运行时角色(workbench.md) | 现生产者 | 应然生产者 | 推导来源 |
|---|---|---|---|---|---|
| 阶段名称 `step.label` | per-stage(`StepEditor.tsx:117-129`) | 渲染进阶段卡标题与摘要,存于 workflow def 该 step(`workbench.md:49`) | 人手打字 | 系统给默认 + 人可改 | 阶段 `id` → 常见中文映射预填(如 `open`→"开始"、`verify`→"验收") |
| 阶段 ID `step.id` | per-stage,只读(`:131-133`) | 系统生成的稳定标识 | 系统(已是只读) | 维持现状 | 无需改动——本表另一个"已经正确"的例子 |
| 复核门开关(gate `review`/`null`) | per-stage(`:134-149`,confirm 也显示为开,`:22-25`) | 决定该阶段是否需人复核 | 人点开关(已是 tap,交互模型正确) | 维持 tap 模型,初始建议态可推导 | 阶段语义(是否处于 workflow 末端/是否涉及合并)反推默认建议 |
| 技能链 `step.skills`(自定义 workflow) | per-stage(`SkillChain.tsx:67-107` 构建、`:210-226` 移除级联,候选 `GET /api/skills/registry:198`) | 依赖链可视化,候选清单**完全不检测已安装**(`skillsRegistry.ts:27-30`,`skills.md §4`) | 人手动拖拽/勾选 | agent 生成候选优先级 + 系统标注本机可用性 | `skills.md` 实测:manifest 点名 28 个技能 token,本机真实可用的仅 11 个(superpowers 系 5 个+grill-with-docs+huashu-design+improve-codebase-architecture+to-prd+to-issues+verify,不到四成),其余全靠 prose 纪律降级而非代码硬拦——UI 至少该给"未装"角标,而不是让用户选中一个实际不存在的技能 |
| manifest 强制技能矩阵(default workflow,轨道×阶段) | 全局(`SkillChain.tsx:290-349`,写 `templates/manifest.yaml`) | 跨 workflow 的组织级契约,`GET /api/config` 失败回落静态镜像 | 人手动穿梭框编辑 | **本表唯一"生产者本来就该是人"的反例**——维持人工 | 无需转生产者,但同样需要叠加本机可用性可见度(同上一行证据) |
| outputs chips(`step.outputs`,field+type) | per-stage(`:73-75` 移除、`:47/:91` FIELD_RE 校验) | 声明该阶段的具名产出物 | 人手动添加 | agent 生成 | agent 对自己将产出什么文件/字段有第一手认知("我这阶段会写 design_doc 这个 output") |
| 「产出非空方可推进」开关(`nonempty-output` guard) | per-stage(`:57/:64-71/:210-222`) | 决定是否挂该项 guard | 人点开关(tap 模型正确) | 维持 tap,初始建议值可推导 | 该阶段 outputs 是否非空——有则默认建议开 |
| `tasks-at-least` guard | per-stage(`:224-226`) | 只读中文说明,不可编辑 | 系统(已是只读展示) | 维持现状 | 不适用本表的填表焦虑,仅完整性收录 |
| Hook 开关矩阵(8 hook × 4 时机 × 阶段) | per-root(`HookTimeline.tsx`,矩阵键 `${hook}.${phase}`,`:89`) | 阶段×hook 开关,强制常开两项锁定(`decisions.md #2`) | 人逐格点开关 | 系统给预设组合一键套用 + 人只调例外 | 常见组合预设(标准/宽松/严格档,具体预设内容需产品另拍板);强制常开的 `gate`/`interactive-skill-gate` 维持锁定,**不可因"瘦身"误锁开**(决议#2 红线) |

### 2.5 审计结论

三张表的字段(Loop 18 个 + AFK 4 个 + workflow 编辑面 9 个,合计 31 个)里,只有 4 个字段的"现生产者"本来就是对的:`autonomy_level`(治理拍板,tap 模型)、`step.id`(系统生成只读)、复核门开关与 nonempty-output 开关(拍板型 tap,只是初始建议值可以更聪明)、manifest 矩阵(组织级契约,人工合理但缺可用性可见度)。其余绝大多数字段的现状都是"人手打字/拖滑杆/勾 chips",而应然生产者分布在 agent 生成(内容类:goal/design_doc/risk/human_gates 候选/outputs)、系统推导(结构类:change_prefix/phases/cadence/budget 默认值/image 下拉)、人拍板(治理类:budget 上限、要不要自动合并、要不要 opt-in)三条路径上——**没有一个字段的正确答案是"继续裸填"**。

---

## 三、三面问题清单:对照第 5/6/7/8/9/10 点

> 说明:本文档收到的原始材料只包含第 10 点的逐字原话与 brief-v6.md 对 Demo1/Demo2 各方案"必答题"的转述;第 5/6/7/8/9 点没有独立的逐字原文可引。下文对这五点的"现状"复原自 `brief-v6.md` 明确写出的方案分组与必答题(demo1 对应"(a)(b)(c)"三问 = 第 5/6/7 点;demo2 的"Loop 三方关系图"/"凭证面"= 第 8/9 点),如与用户原始措辞有出入,以用户原话为准。

### 第 5 点——hook 拦截点应内嵌进流程图,而不是埋在某阶段编辑区里

- **现状**:Hook 开关矩阵是 `StepEditor.tsx:157` 里的一个 per-stage 分区(`HookTimeline.tsx`),与右栏「流程预览」(`WorkbenchView.tsx:595-633`)物理分离。用户在预览轨道上完全看不到任何 hook 拦截点,要点开某个阶段编辑卡、切到 Hook 分区,才看到该阶段的 8 hook × 4 时机开关矩阵的其中一格。
- **问题本质**:hook 是真实运行时拦截点(`gate`/`interactive-skill-gate` 强制常开是安全边界,`decisions.md #2`),但 UI 把它当成"某阶段配置的一个折叠区块"埋起来,和用户想看的"起草 →(门:复核)→ 发布"因果链在视觉上完全断开。
- **对应方案解**:`Demo1-A`(顶部大流程带内嵌门徽章+hook 拦截点)、`Demo1-B`(阶段间插"门柱",hover 展开该关卡拦什么)、`Demo1-C`(下泳道 hook 时序对齐到阶段)——三方案都要求 hook 拦截点直接画在主流程图上,不再是切进某阶段才看得到的隐藏分区。

### 第 6 点——阶段编辑区要瘦身,分清"这阶段专属"与"全局"

- **现状**:`StepEditor.tsx` 单文件承载"基本/技能/Hook/产出物"四个分区(`:113-228`),技能区还分叉出"自定义 workflow 依赖链"与"default workflow 轨道×矩阵"两套完全不同的 UI(`SkillChain.tsx:290-349`);Hook 区是 8×4 矩阵的 slot 注入。per-stage 的字段(label/gate/skills/outputs/guards)与 per-root/全局的字段(hook 时序、manifest 矩阵)混在同一张点开即展开的卡片里。
- **问题本质**:信息架构没有区分作用域——用户点开一个阶段,看到的表单里有的字段只影响这一个阶段,有的字段(hook 时序、manifest 矩阵)其实影响全部阶段甚至全部 workflow,但视觉上毫无区分。认知负荷来自"不知道自己在改哪个作用域",不是字段数量本身。
- **对应方案解**:`Demo1-A/B/C` 三方案共同要求"per-stage 留编辑区(基本/技能/产出物),全局面挪右栏(hook 全局时序、安全门说明、manifest 矩阵入口)"(`brief-v6.md:45`)。

### 第 7 点——「流程预览+预演」是假动画,应换成真实数据驱动的流转

- **现状**:`WorkbenchView.tsx:285-350` 的 GSAP 预演——依次点亮节点、gate 停顿 0.6 秒示意——`workbench.md:37` 明确记录"动画是假的:纯脚本化的『依次点亮』演出,不对应任何真实运行/状态机执行"。这部分代码占了 110 行、约全文件 17%(`workbench.md:39`)。
- **问题本质**:节点数据是真的(来自 `def.steps`),但唯一的"动"是假的。用户想看的是"我这个流程现在卡在哪个阶段、每阶段有几个 change、上一次真实流转是什么时候",预演给的是与真实状态无关的灯光秀。
- **对应方案解**:`Demo1-C`(检查站泳道,changes 作为 token 在真实位置流动)最直接命中,`Demo1-A/B` 也都要求"真实数据驱动的流转"(每阶段真实 change 计数、running 脉冲、最近 transition 回放)。数据源已具备:`GET /api/change/:name/history`(G20/G21 已闭,`decisions.md` 四·未决登记详情)。

### 第 8 点——loop / change_prefix / workflow 阶段的三方关系讲不清楚

- **现状**:`change_prefix` 在 `LoopCard.tsx:522-537` 只是一个文本输入框,带一行实时预览(如 `rl-0142-migrate-card`);`phases` 是 schema 必填但卡内根本不可编辑的字段(2.2 节)。Loop 卡在 `WorkbenchView.tsx:105-112` 的布局位置紧跟在阶段编辑卡之后,容易让人误以为它是"这个 workflow 专属的自动运行配置"——但 loop 其实是 **root 级**的,不属于任何单个 workflow(`workbench.md:109` 注释明示)。
- **问题本质**:三个概念(loop 本身、`change_prefix` 实际匹配到的 changes、`phases` 声明的 workflow 阶段)之间没有一张图把关系画出来。更糟的是 `phases` 本身还是全仓零消费的纯声明(2.2 节),用户填了却不知道填了有没有用、对不对。
- **对应方案解**:`Demo2-A/B/C` 三方案共有的「Loop 三方关系图」——loop(root 级)→ `change_prefix` → 实际匹配的 changes 列表;`phases` → workflow 阶段 chips;明确画出"loop 不是 per-workflow 的"(`brief-v6.md:63`)。

### 第 9 点——凭证面:用户看不清自己配没配对

- **现状**:AFK 凭证目前**没有任何 dashboard UI 面板**——凭证只能靠宿主机 env 变量,而且两条 runner 路径接线程度不同:codex 路径靠 `OPENAI_API_KEY`+`CODEX_HOME` 白名单透传(`dockerRunChange.ts:97-103`,仅当 `runner==='codex'`);claude-code 路径的 `CLAUDE_CODE_OAUTH_TOKEN` 只能走 `extraEnv`,但 **`cli afk run` 的调用点根本没传**(`loopafk.md §5`)——沙箱脚本按 `[ -n "$CLAUDE_CODE_OAUTH_TOKEN" ]` 判空,**静默回落"确定性模式"**,不报错。缺凭证时唯一的反馈是容器跑起来之后才冒出的 stderr(见第四节现状旅程)。
- **问题本质**:凭证是启动 AFK 前必须成立的前置条件,但现状是"错误只在容器跑起来之后才知道",而不是"跑之前就告诉你缺什么";而且两个 runner 需要的凭证键完全不同,用户没有一个地方能看清"这两条路径分别要配什么、我现在配的是哪个"。
- **对应方案解**:`Demo2-A/B/C` 共有四件套之一「凭证面」——掩码显示、机器级存储(`~/.claude` 下,非仓库内)、write-only(保存后只显掩码)、env 变量优先级说明、per-runner 需要哪些键(`brief-v6.md:58`)。红线:key 绝不落仓库内文件、值不进日志(详见第四节的 `.gitignore` 核实与第七节登记)。

### 第 10 点——核心矛盾:配置生产者错位(总纲)

- **现状**:Loop 卡 15 个草稿字段 + AFK 卡 4 个字段,几乎全部是裸输入框/滑杆/chips,默认值多为空或 schema 允许的最小值,没有任何"这个值该怎么填"的引导,更没有"这个值其实是 agent/系统该知道的"的暗示。空态直接甩一段 YAML 样板教用户手写文件(`LoopCard.tsx:311-330`,见第一节)。
- **问题本质**:参见第二节全表——15 个 Loop 草稿字段里只有 7 个真硬消费,近半是"给 readiness 评分看的作文"。agent 在终端里已经知道 `goal`(brainstorming 结论)、`design_doc`(自己刚写的文档)、`risk`(自己对变更范围的判断),用户却要在 dashboard 里把这些 agent 已经知道的信息重新打一遍字;而用户真正该做的判断(要不要 L3 自动合并、要不要暂停这个 loop)反而目前做得还不错(`autonomy_level` 是 tap 不是填表——2.2 节)。
- **对应方案解**:`Demo2-A`「终端生成,UI 审阅」(主推,详见第五节)——loop 空态不再给裸表单,引导去终端生成,UI 变审阅面,人只批准/调整/驳回,每个字段标注生产者徽章。

---

## 四、初装用户首跑旅程

用户明确要求补充这一节:一个刚装好的用户,从 `pipeline init` 到第一次 AFK 真正跑通,中间要跨过哪些环节、每个环节现在断了会怎样提示、目标状态下终端和 dashboard 该怎么分工。

### 4.1 现状旅程:逐环断点

| # | 环节 | 现在的"提示方式" | 断点表现 |
|---|---|---|---|
| 1 | 安装 Claude Code 插件(pipeline-lite,含 skills/hooks/agents) | **无提示**——插件是否安装完全不影响 CLI 是否能跑 | `skills.md:29` 实测记录:即便在本仓自己的开发环境里,pipeline-lite 插件本身也**未安装**(`~/.claude/settings.json` enabledPlugins 只有 claude-hud/superpowers),skills/hooks 在普通会话中并未生效——这一步缺失是完全静默的,`skills.md` 结论段明确"整条链路上没有任何代码层『缺 skill 硬拦截』,安装缺失只靠 prose 纪律降级" |
| 2 | 安装/构建 CLI(`@pipeline-lite/cli`,`bin: pipeline`) | 标准 shell "command not found",非本产品特有断点 | 略 |
| 3 | `pipeline init <name>` | 成功走 history 记账;项目注册表登记失败**只 WARN 不阻断**(`init.ts:86-94` 注释:"铁律:注册表任何故障只 WARN,绝不让已成功的 init 失败") | 这一步现状总体 OK,有明确 CLI 输出 |
| 4 | Docker daemon 是否可用 | **只在 `pipeline afk run` 这一步才检测**,前面 init/enqueue 阶段完全不检测;`pipeline doctor` 的 11 项检查(`env:node/env:git/asset:manifest/asset:hooks/guard:gate/guard:statusline/security:tap/project:cwd/project:changes/project:markers/quality:verify-skills`,`doctor.ts:193-203`)**没有一项覆盖 docker/AFK**(已逐项核实,零命中) | 缺失时 stderr:`[AFK] run 需 docker daemon(未检测到)。就绪队列 N 项:...。当前环境不执行容器(诚实门:不伪装 docker 就绪)。`(`afk.ts:113`)——但用户往往在跑到这一步之前的三个环节都毫无预警 |
| 5 | sandcastle 镜像是否已构建 | **纯手动运维步骤**——`tools/sandcastle/build.sh` 不被 `init`/`doctor`/`afk` 任何命令自动调用或提示,脚本头注释自己承认"镜像未发布到任何 registry"(`build.sh:2-3`) | 镜像不存在时 `docker run` 直接抛原始错误:`` docker run ${opts.image} failed (exit ${r.exitCode}): ${r.stderr.slice(0,300)} ``(`container.ts:74`)——是一条 docker 原生报错字符串,**不会**告诉用户"去跑 `bash tools/sandcastle/build.sh local`" |
| 6 | 凭证是否已配置 | claude-code 路径:**静默回落**"确定性模式"(`pipeline-afk-run.sh` 按 `[ -n "$CLAUDE_CODE_OAUTH_TOKEN" ]` 判空,不报错,直接假装用确定性 commit 代替 agent 编码);codex 路径:打一条 stderr 提示但不短路——`未检测到 codex 凭证:宿主机需设 OPENAI_API_KEY 或挂载 CODEX_HOME(codex 将自行报认证错误)` | claude-code 路径是最隐蔽的断点:**不报错、不降级提示,用户会以为 agent 真的跑了**,实际上只落了一个占位 commit |
| 7 | `default_opt_in` / AFK enqueue | 已核实 `automation.enqueue(` **只被 `cli/commands/afk.ts` 调用**,server 端没有任何 transition 钩子在 spec-complete 时自动调它——即 change 到 spec-complete 之后**不会自动**进 AFK 队列,必须显式跑 `pipeline afk enqueue <name>`(手动 CLI 命令,eligible 时输出 `[AFK] name 已挂队...`,不 eligible 时输出 `[AFK] name 未挂队(非 spec-complete / PM 轨 / 已在队 / 未 opt-in)`,`afk.ts:65`) | 用户容易误以为"设了 `default_opt_in=true` 之后会自动跑",实际上还差一步显式 enqueue |
| 8 | `pipeline afk run` | 真正驱动一轮 | 以上任何一环断了,只能翻 CLI stderr 自己排查;**dashboard 侧完全没有"AFK 就绪度"这个概念的呈现**——`AutomationCard` 只管 4 个配置值,不做任何健康检查 |

**汇总**:8 个环节里,有明确 CLI 反馈的只有 3 个(3/4/8 的部分路径),1 个环节是完全静默的插件安装,1 个环节是静默降级的凭证判断,其余靠零散 stderr。`pipeline doctor` 这个"系统检测 + 给 hint"的现成模式,完全没有覆盖到 AFK 这条链路——不是没有可复用的架构先例,是这个先例从没往这个方向延伸过。

### 4.2 目标旅程:终端就绪清单 + dashboard 三灯 + 空态 checklist

目标状态不是发明一套新机制,是把 4.1 表格暴露的两类空白**分别接到已有的两个现成模式上**:

- **终端侧**:扩展 `pipeline doctor`(而不是发明新命令)——新增 `afk:docker` / `afk:image` / `afk:credential-claude-code` / `afk:credential-codex` 四个 check id,复用已有的 green/yellow/red 三色 + `hint` 文案格式(`doctor.ts` 的 `DoctorCheck`/`DoctorProbes` 装配模式已经是现成的可扩展探针接口,`doctor.ts:11` 注释"事实采集全部走 deps.doctor 探针……本模块只做裁决与渲染")。`session-start.sh` 可以在检测到 `openspec/` 存在时追加一行"AFK 就绪度:跑 `pipeline doctor` 查看"的轻量提示,不重复 doctor 的全部逻辑。
- **dashboard 侧**:AutomationCard/LoopCard 空态区新增「就绪三灯」——docker 可用 / 镜像存在 / 凭证已配(按 runner 分),数据来自一个新的只读端点(如 `GET /api/afk/readiness`)。这不是重新发明检测逻辑,是复用已有先例:`packages/server/src/afk.ts:257-259` 的 `cancelAfkRun` 已经直接 `execFile('docker', ['kill', sandbox])`——证明 server **可以**直接调 docker 二进制,只是不能 `import` `@pipeline-lite/automation` 包本身(零运行时依赖边界,`afk.ts:15-19` 头注释)。新端点应沿用"server 直接 execFile `docker info`/`docker images`"这条已有先例,而不是引入对 automation 包的依赖。
- **空态 checklist**:AutomationCard/LoopCard 首次打开、什么都没配置时,给出"你需要做 1/2/3"的清单,每条给可直接复制的命令(如镜像缺失时给 `bash tools/sandcastle/build.sh local` 这一行,而不是让用户自己去翻 `build.sh` 源码猜)。

### 4.3 明确回答:终端提示还是 dashboard 交互

两侧不是二选一,是按"谁离真相最近"分工;唯一需要格外小心的是凭证检测有一个结构性的"滞后"问题,必须诚实告知用户,不能假装两侧等价:

| 检查项 | 权威判定方 | dashboard 三灯的角色 | 理由 |
|---|---|---|---|
| docker daemon 可用 | 两侧对等 | 三灯之一,server 每次请求实时 `docker info` | docker daemon 状态是活的系统状态,随查随准,不受进程 env 快照问题影响 |
| 镜像是否存在 | 两侧对等 | 下拉列表数据源,server 实时 `docker images` | 同上;缺失时终端(`pipeline doctor` hint)和 dashboard(空态 checklist)给的复制命令必须来自同一份常量,不能两处各写一份走漂 |
| 凭证是否配置 | **终端侧权威**(`pipeline doctor` / 即将真正执行 `afk run` 的那个 shell) | 参考灯,UI 文案需诚实标注"这是服务进程看到的环境快照" | server 是长期运行的进程,它的 `process.env` 在**自己启动那一刻**就已冻结——用户之后在别的终端窗口 `export OPENAI_API_KEY=...`,server 进程永远看不到这个变化(Unix 进程 env 继承的结构性限制,不是可修的 bug)。dashboard 的凭证灯只能反映"server 启动时刻的环境",绿灯不保证 `pipeline afk run` 一定成功;红/黄灯则可信(至少此刻这个进程看到的是缺失)。真正权威的判断永远是"你即将敲 `pipeline afk run` 的那个 shell 自己跑一次 `pipeline doctor`" |
| enqueue / `default_opt_in` 等治理决策 | 人(不是探测,是决策) | 呈现现状 + 拍板入口 | 这不是"就绪"检测,是"要不要"的治理判断,不适用三灯语义,应走四动作模型的自然延伸(批准/调整) |

**结论**:docker/镜像两灯可以做成 dashboard 侧权威实时信号;凭证灯必须明确降级为"参考",终端侧 `pipeline doctor` 才是凭证判定的最终真相源——这一点必须写进 UI 文案本身,不能只是内部认知。

---

## 五、三方案对比与推荐(`Demo2-A/B/C`)

| 维度 | `Demo2-A` 终端生成,UI 审阅(主推) | `Demo2-B` 向导+推导(兜底) | `Demo2-C` 模板+微调 |
|---|---|---|---|
| 首跑成本 | 低——agent 在对话里顺手生成,用户只需批准三次点击;但依赖"用户确实经过了 agent 对话"这个前提,若用户从未对话直接打开 dashboard,审阅面无东西可审(需要空态给"去终端说……"的示例 prompt 或退到 B 兜底) | 中——分步向导比裸表单好,但仍要求人手输 `goal` 等核心语义字段(只是拆成小步);适合完全没有终端会话历史、只用 dashboard 的角色(如 PM/运维) | 最低——一键套用+改一句话 |
| 与终端工作流的贴合 | 高——完全顺着"用户在终端和 agent 对话,agent 知道 goal/design_doc"的核心矛盾陈述走(第一节),不额外发明 UI 交互模式 | 低——是独立于终端对话之外的新交互面,本质仍是"让人填",只是填得更有引导 | 低——完全绕开终端/agent,回到"选现成的"心智 |
| 实现代价 | 中——UI 侧是"审阅卡+字段来源徽章"(相对可控的前端工作);但需要新增"agent 生成协议"(agent 怎么把生成的草稿放到 UI 能读到的地方——这是新增机制,前端改造单独做不完,见第六节) | 中低——纯前端多步表单+推导规则(`change_prefix←id`、`state←`约定路径、`phases←workflow` 阶段多选、`kill_criteria←` 风险档预设),不需要 agent 协议或新 CLI 命令,是三方案里最快能独立于后端落地的 | 低——样式迁移/测试修绿/文档同步几张预置卡,纯前端 |
| 与既有决议冲突 | 无直接冲突;需小心不越界成"模板选择器"触碰决议#3 | 无 | **直接冲突决议#3**——决议#3 明文"loop 健康度/台账/漂移/**模板新建**全不做"(`decisions.md #3`),`brief-v6.md:33/62` 均显式标注这条红线 |

**推荐 `Demo2-A`,理由**:与第一节已确立的能力面模型(前端只读看进度,人的动作只有继续/打回/重试/终止+放弃)一脉相承——`Demo2-A` 把"填表"这个动作从人的职责列表里去掉,只留"审阅/批准/调整/驳回",本质是把已经生效的四动作纪律延伸到配置面,不是另起一套新规则。`Demo2-B` 作为无终端会话场景的兜底路径,与 `Demo2-A` 并非互斥(见第六节可以 A 主 B 辅并存);`Demo2-C` 需要用户先显式重开决议#3 才能进入讨论,本轮不排期。

---

## 六、分期落地建议

### 6.1 本轮可做(纯前端 + 复用现有只读探针模式,不需要新的持久化协议)

- **UI 审阅面骨架**:loop 空态改版为"引导去终端"+"待批卡"呈现。在 agent 生成协议(6.2)落地前,可以先只做 UI 骨架——数据源暂时仍是人工填的草稿,但叠加"生产者徽章",这一步本身就有独立价值:即使还没接上 agent 生成,先让用户看清"这字段真的没人管,别纠结"(如 `phases` 标零消费角标、`allowlist` 标无消费者角标),也能立刻降低当前的填表焦虑。
- **字段来源徽章**:三色徽章(agent 生成/系统推导/人拍板),第一版推导逻辑可以先是纯前端硬编码规则——`change_prefix` 默认建议值、`budget.max_in_flight`/`max_parallel`/`max_retries` 预填推荐值——这些都不需要 agent 接线,是纯前端改动。
- **就绪三灯(docker/镜像两灯)**:新增只读端点 `GET /api/afk/readiness`,复用 `afk.ts:257-259` 已有的 server 直接 `execFile('docker', ...)` 先例,不引入对 automation 包的依赖。
- **镜像下拉**:同一端点扩展 `docker images` 枚举,docker 不可用时降级回文本框(已是 `brief-v6.md` demo 交互要求)。
- **`pipeline doctor` 扩展**:新增 `afk:docker`/`afk:image`/`afk:credential-*` check id,是最贴合现有代码模式、风险最低的改动(装配接口 `DoctorProbes` 已是现成可扩展面)。

### 6.2 需要 CLI 新命令 / 新后端能力(UI 单独做不出来)

- **`pipeline loop init` 向导**:`loopafk.md §7` 已确认"没有 `loop init`/scaffold 命令——loops.ts 无 init 子命令,`init.ts` 也不生成 loops.yaml"。`Demo2-B` 的推导型字段填充要真正落地,需要这个命令产出 loops.yaml 草稿,或前端调用一个新写入端点。
- **agent 生成协议**(`Demo2-A` 的核心机制,目前完全不存在):agent 今天如果想"帮用户建一个 loop",除了直接手写 `loops.yaml` 文件之外没有任何结构化通道。需要设计"agent 写草稿 → dashboard 读草稿 → 人审阅 → `POST /api/loops/update` 确认"的链路,这需要新的草稿存储位置(如 `.pipeline/loops.draft.yaml` 或在现有 CAS 写入链路上加一个 draft 标记)。本轮 demo/文档只能提出方向,机制设计是下一步的独立任务。
- **凭证真正的 UI 配置面**:`brief-v6.md` 四件套第 4 项要求"机器级存储 `~/.claude` 下、write-only"——这需要全新的"读掩码+写凭证"两个 API,当前完全不存在。**存储位置红线已核实**:`.gitignore`(仓库根,`.gitignore:1-22`)里**没有任何一条规则覆盖 `.pipeline/`** 这个目录——`.pipeline/loops.yaml`/`.pipeline/automation.json`/`.pipeline/hooks.json` 若被提交,会被 git 正常跟踪。这意味着任何新增的凭证存储**绝不能**图省事塞进 `.pipeline/`(即便看起来像是"标准配置目录"),必须落在 `~/.claude` 或等价的机器级路径。这是全新的、需要谨慎设计的后端能力。
- **claude-code 路径凭证透传接线**:`loopafk.md §5` 指出 `cli afk run` 目前根本没有把 `extraEnv`/`hostEnv` 传给 `createDockerRunChange`(`afk.ts:139`)——即 claude-code 路径当前拿不到 `CLAUDE_CODE_OAUTH_TOKEN`。就绪三灯就算做出来,claude-code 路径的"凭证已配"灯永远只能是黄/红,因为下游根本没接住。这属于功能修复而非 UX 范畴,但必须在分期建议里点名——否则三灯会变成"灯说配了但其实用不上"的新一层假象。

### 6.3 需要重开决议才可讨论

- **`Demo2-C` 模板+微调**:与决议#3 冲突,见第五节。
- **loop 健康度可视化**(哪怕只是给 loop 卡加一个"最近 N 次 run 成功率"角标):同样触决议#3"健康度/台账/漂移……全不做"红线,本文档/demo 不做,仅登记为 backlog 供用户参考。

---

## 七、决议冲突登记表

| 涉及内容 | 冲突决议 | 冲突点 | 建议处理 |
|---|---|---|---|
| `Demo2-C` 模板+微调(样式迁移/测试修绿/文档同步预置卡) | 决议#3(`decisions.md #3`) | 决议#3 明文"模板新建……全不做" | 用户看过 demo 后若仍想要 `Demo2-C`,须显式重开决议#3 再排期,不可在本轮 UI 审阅面顺手加 |
| loop 健康度/成功率可视化 | 决议#3 | 决议#3"健康度/台账/漂移……全不做" | 本文档/demo 不做,仅登记 backlog |
| 就绪三灯/字段来源徽章的颜色实现 | 决议#9(`decisions.md #9`) | 色板纪律——禁硬编码新原色 | 三灯颜色须从既有 token `color-mix` 派生,参考进度视图 busy 黄的既有派生模式(`progress.md:16`:`color-mix(in oklch, var(--red) 52%, var(--green))`) |
| Hook 矩阵"预设一键套用"若覆盖到强制常开两项 | 决议#2(`decisions.md #2`) | `gate`/`interactive-skill-gate` 强制常开锁定,UI 呈锁定态,不可因反馈开放开关 | 6.1/2.4 节的"预设组合"功能范围必须显式排除这两项,渲染上继续保持锁定态,不可因"瘦身"或"一键套用"误将其纳入可配范围 |
| 凭证面若把 key 存进 `.pipeline/` | 凭证红线(`brief-v6.md`,经本文档 `.gitignore` 独立核实坐实) | key 绝不落仓库内文件;`.pipeline/` 目前不在 `.gitignore` 覆盖范围内 | 新增凭证端点设计时必须落 `~/.claude` 或等价机器级路径,决不能因为".pipeline/ 看起来是标准配置目录"就顺手塞进去(见 6.2 节) |
| 就绪三灯/审阅面新增展示字段若持久化进 `automation.json` | T21 决策登记(`decisions.md` 二·"刚拍板、不能反悔的") | `automation.json` 决策性排除 `enabled`/`level`,防双源 | 三灯的"已选 runner/镜像"等新展示字段若要持久化,必须走独立字段或不落盘(纯运行时探测结果),不可污染 `automation.json` 既有排除清单 |
| 四动作文案若因"审阅卡"新增第五种动作语义 | 决议#13(`decisions.md #13`,评审登记) | 两宿主动作文案与语义以 demo v5 为唯一口径,防两处漂移 | `Demo2-A` 的"批准/调整/驳回"是审阅面的动作,不是四动作模型本身的第五种——若未来要复用四动作组件承载审阅动作,必须先确认是否与 v5 口径冲突,不可自造语义 |

---

## 附:与两份 demo 的对照关系

- `design-demos/v6-workbench-flow.html`(`Demo1-A/B/C`):对应第三节第 5/6/7 点,回答"hook 如何内嵌进流程图"、"阶段编辑区如何瘦身"、"流程预览+预演换成真实数据"三道必答题,数据源见第三节引用。
- `design-demos/v6-config-copilot.html`(`Demo2-A/B/C`):对应第三节第 8/9/10 点 + 第四节首跑旅程,回答"就绪三灯"、"首跑旅程终端/dashboard 分工"、"镜像下拉"、"凭证面"四件套 + Loop 三方关系图,方案对比见第五节,推荐 `Demo2-A`,分期落地见第六节,决议边界见第七节。
