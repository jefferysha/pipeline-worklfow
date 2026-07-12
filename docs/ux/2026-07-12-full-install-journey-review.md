# 用户旅程体验审查：安装插件后全功能全量可用（含 codex 对等）——端到端 rubric + 断点清单（2026-07-12）

> **触发**：用户「从用户旅程出发，把所有体验交互都考虑到，全面分析」，并强调**终端交互与前端(dashboard)交互两条线平等、前端不是附属**。本文档为「安装 pipeline-lite 插件后全功能全量可用（含 codex 对等）」这个初创，产出**端到端体验 rubric + 断点/问题清单**，作为批 2/3 实施的建造标准与最终验收 QA 检查表。
>
> **事实底座**：设计 spec `docs/superpowers/specs/2026-07-12-full-install-experience-design.md`（三阶段 + 统一 `pipeline setup`）、既有旅程分析 `docs/ux/2026-07-11-config-experience-analysis.md`（§4 首跑旅程，本文档扩展到含新 `pipeline setup` 流 + 前端线）、技能源 `docs/research/2026-07-12-skill-install-sources.md`（Section 6 ECC/~53token/codex 对等）、批 1 已落地代码、v6 已交付面（就绪三灯/凭证卡/AFK 卡/Loop 审阅）。
>
> **方法**：全程只读走查代码/文档/设计，未执行任何安装、未改任何仓库文件（本审查文档除外）。凡结论带 `file:line` 出处；设计与现状有出入处以源码为准并标注。术语用「阶段」不「相位」（决议 #8）。
>
> **口径校准（重要，避免误读为「批 2/3 没做完 = bug」）**：批 1（Phase 1 地基）已交付；批 2（技能齐全）/批 3（运行时对等清单）**按设计尚未实施**。因此凡标「批 2/批 3」的断点，是**该批必须闭合的验收项**，不是回归缺陷——本文档的价值正是把这些「应然」钉成可勾的建造标准。凡标「即修/需新任务」的，是已交付代码里的现存问题或设计未覆盖的空白。

---

## 目录

1. 第一章 · 终端线端到端旅程表（install → setup → doctor → init → loops init → afk run，两 runner）
2. 第二章 · 前端线端到端旅程表（dashboard：项目切换器 / 流程带 / Loop 审阅 / AFK 卡三灯 / 凭证卡 / 进度 / 收件箱）
3. 第三章 · 两线分工与一致性专章（同一件事在终端 vs 前端；前端能否独立自足）
4. 第四章 · 问题清单（终端组 / 前端组 / 跨线组，P0/P1/P2）
5. 第五章 · 体验验收 rubric（功能齐全轴 + 交互体验轴[终端子轴 / 前端子轴]）
6. 第六章 · codex 对等专章（逐触点核）

---

## 第一章 · 终端线端到端旅程表

> 每环五列：①用户此刻想做什么 ②理想体验 ③现状/设计 ④断点/问题 ⑤codex 对等性。

### 环 T1 · 发现与安装插件

| 维度 | 内容 |
|---|---|
| **想做什么** | `claude plugin marketplace add jefferysha/pipeline-worklfow` + `claude plugin install pipeline-lite@pipeline-lite`，然后知道「装成功了、能用了」。 |
| **理想体验** | 装完有明确回执：skills/hooks/agents 生效、`pipeline` 命令可敲；下一步该干什么一目了然。 |
| **现状/设计** | marketplace.json 已就位（`.claude-plugin/marketplace.json:10-18`，`source:"./"`），CLI bundle 已 force-track 入包（`git ls-files packages/cli/dist/pipeline.mjs` 非空，批 1 F2）。装完普通会话由 `session-start.sh` 注入宪法 + 项目上下文 + openspec 提示（`hooks/session-start.sh:103-154`）。 |
| **断点/问题** | ① **README 无 plugin-install 承接**：`README.md:34-49`「上手（5 分钟）」仍是源码构建流（`npm i && npm run build` / `npx pipeline init`），**只字未提** `claude plugin marketplace add` / `install` / `pipeline setup`——按新初创安装的用户在 README 里找不到下一步（P2-X2）。② `pipeline` 命令上 PATH 靠 `pipeline setup` 首步软链（`setup.ts:84-111`），但**用户不知道要先跑 setup**；session-start 注入也没提 setup。③ hooks/skills 是否真生效**无即时回执**——`session-start.sh` 末尾只在 verify-skills 失败时报警（:166-170），成功静默。 |
| **codex 对等** | 本环与 runner 无关，对等（不涉及 codex）。 |

### 环 T2 · 首次 `pipeline setup`（核心新触点）

| 维度 | 内容 |
|---|---|
| **想做什么** | 一条命令把 manifest 点名的外部技能按名从上游装齐（~53/55），装前看清计划、确认、执行。 |
| **理想体验** | 计划可读：每条命令 + 官方/第三方标注 + 受影响全局目录 + 待装差集；15 条命令跨 3 套工具的进度/成败/失败项清晰；装到一半失败能续；`--yes`/`--dry-run` 语义清楚；幂等重跑跳过已装；ECC 按名装了哪 15 个看得见。 |
| **现状/设计** | 命令**已注册可达**（`program.ts:247-253`，`setup [sub]` + `--dry-run` + `-y/--yes`）。但**只有 PATH 软链是真的**（`setup.ts:84-111`，幂等/异源覆盖/best-effort WARN 都做了）；**技能安装段是空占位**（`setup.ts:145-149` 打印「待实现」exit 0）；计划骨架只有三行标题（`setup.ts:130-137`），**无官方/第三方标注、无受影响目录、无待装差集**。`templates/skill-sources.yaml`（设计 §2 唯一真相源）**尚不存在**。 |
| **断点/问题** | ① **无技能安装器**（P0-T1）：装完插件后 ~53 个外部技能没有任何一键装齐路径，`pipeline setup skills` 是 stub。② setup 在 `--help` 里**排在最末**，位于 `_gen-router-sh`/`internal-skill-gate`/`migrate-workflow` 这些 `[内部]`/`[一次性]` 命令**之后**（`program.ts:231-253`）——首要上手命令叙位最低（P2-T1）。③ 计划骨架当前无法验收「官方/第三方标注够醒目」「受影响全局目录列清」等设计要点（批 2 填）。 |
| **codex 对等** | 设计层对等（技能装齐惠及两 runner）；当前均未实现，无偏。 |

### 环 T3 · 技能齐全度可见（`pipeline doctor`）

| 维度 | 内容 |
|---|---|
| **想做什么** | 查「强制技能装没装、缺了怎么修」；会话里被适度提醒但不烦。 |
| **理想体验** | 强制缺→红 + 可执行修复命令（阻断语义）；推荐缺→黄 WARN；manifest 声明与真实在位衔接（装了真能用）。 |
| **现状/设计** | doctor 有 11 项检查（`doctor.ts:199-211`：node/git/manifest/hooks/gate/statusline/tap/cwd/changes/markers/verify-skills），三色 + 每非绿灯带 `hint`（:236-239）——是本仓成熟的「检测 + 可操作 hint」模式。 |
| **断点/问题** | ① **零技能在位检查**（P0-T2）：11 项里**没有一项**查 `~/.claude/skills`/`~/.agents/skills` 的 mandatory/recommended 技能在位；② **manifest 技能表无消费者**：`manifest.yaml:67,88` 头注明「消费方：guard 强制 skill 校验面 / SessionStart 注入（**待 A1 后续接线**）。派生就绪待消费」——`mandatory_skills`/`recommended_skills` 表存在但没有任何代码读它判缺；③ **无代码硬拦**：`interactive-skill-gate.sh` / `internalSkillGate.ts` 均**不查安装在位**（grep 零命中），安装缺失只靠散文纪律降级（与研究 §1、config 分析 §4.1 结论一致）。→ 用户装完插件、一个外部技能没装，doctor 全绿、会话无提示、gate 不拦，**「全功能全量可用」这句承诺当前无任何触点兑现或体检**。④ session-start 的 AFK 提示**明确不指向 doctor**（见环 T5）。 |
| **codex 对等** | 技能齐全与 runner 无关，对等。 |

### 环 T4 · init 项目 + loops init

| 维度 | 内容 |
|---|---|
| **想做什么** | 初始化一个 change / 起草一个 loop；知道「先 setup 再 init」的先后。 |
| **理想体验** | init 向导化、默认值聪明；与全局 setup 关系清楚；新用户知道顺序。 |
| **现状/设计** | ① `pipeline init <name> --track --preset`（`init.ts:32-44`）：change 初始化，成功走 stderr `[INIT] <name>`（:95），注册表故障只 WARN（:88-94，铁律）。② `pipeline loops init`（`loops.ts:807-873`，`.alias('loop')` 故 `pipeline loop init` 亦可，`program.ts:208`）：**交互向导**（三组问答，每问带推导默认值回车即收，`loops.ts:770-793`）+ 非交互 flags（缺 TTY/`--yes` 走全默认，`loops.ts:630-652`）；起草的 loop 恒 `status:paused`（硬 gate，`loops.ts:679`），登记草稿标记 sidecar，输出「去 dashboard 审阅批准」（:869-870）——是 Demo2-A「终端生成→UI 审阅」协议的终端生产侧。 |
| **断点/问题** | ① **init 无向导、参数不友好**（P2-T3）：`pipeline init` 强制 `--track`/`--preset`，新用户不知填什么；doctor 的 hint（`doctor.ts:136`）给了 `pipeline init <name> --track --preset` 但不解释取值。仅 `loops init` 有向导——两个 init 体验不对称。② **与 setup 关系不显**：`init`/`loops init` 的输出都不提「先跑 pipeline setup 装齐技能/配运行时」；`setup` 骨架也不提 init。先后顺序全靠用户自悟。③ `loops init` 输出→dashboard 审阅的交接很好，但同样不提运行时前置（docker/凭证）。 |
| **codex 对等** | `loops init` runner 默认 `claude-code`（`loops.ts:644`），非标准 runner 软警告但放行（`loops.ts:862-863`，口径同 `lp_runner_warn`）；codex 是合法 runner 值，对等。 |

### 环 T5 · AFK 首跑（两 runner，terminal 侧）

| 维度 | 内容 |
|---|---|
| **想做什么** | `pipeline afk run` 真跑一轮；docker/镜像/凭证任一缺失时得到**可操作**提示。 |
| **理想体验** | 每个断点提示可操作（缺 docker 说去装、缺镜像给 build 命令、缺凭证说配哪个键）；claude-code 与 codex 两条路径体验真对等（失败都可见，不静默假 pass）。 |
| **现状/设计** | ① docker 探测：`afk.ts:111-115`，缺则 honest-gate stderr「run 需 docker daemon（未检测到）…不伪装 docker 就绪」——诚实但只在 run 这步才报。② 镜像：默认 `sandcastle:local`（`afk.ts:124`），镜像内**两 runner CLI 都在**（`Dockerfile:47-48` `ARG WITH_CODEX=${WITH_CLAUDE_CODE}` → 默认镜像同装 codex@0.144.1 + claude-code）。③ 凭证：`afk.ts:143-150` 把机器级 secrets（`readSecretsEnv`）与 `process.env` 合并成 `hostEnv`（宿主非空优先），传给 `createDockerRunChange`；后者按 runner 互斥透传——codex 拿 `OPENAI_API_KEY`/`CODEX_HOME`（`dockerRunChange.ts:98-103`），claude-code 拿 `CLAUDE_CODE_OAUTH_TOKEN`（`dockerRunChange.ts:111-117`，**v6 T2 新补，此前该路径零透传通道**）。 |
| **断点/问题** | ① **claude-code 静默确定性回落**（P1-T1）：沙箱脚本 `pipeline-afk-run.sh:75` 的 `elif [ -n "$CLAUDE_CODE_OAUTH_TOKEN" ] && command -v claude`——token 或 CLI 缺失时**两个分支都不进**，直落确定性 commit（:127-135）并打印 `verify_result:pass`（:135），**用户以为 agent 真跑了**，实为占位。而 codex 路径 CLI 缺失是硬错误 `exit 96`（:43-46）、认证失败经 `[AGENT_EXIT]` 回放可见（:72-74）——**两 runner 失败哲学不对称，且 claude-code 这条默认路径反而更不诚实**。② docker/镜像/凭证的断点提示**只在 `afk run` 这一步才冒**，前面 init/enqueue 无预警（沿 §4.1 旧断点）。③ **终端无就绪三灯等价**（P1-T2）：doctor 不含 docker/image/credential 检查，用户在终端无法「一眼看就绪」，只能靠 run 失败反推；设计 Phase 3 的 `setup runtime` 段本应补此（`setup.ts:155-159` 仍是 stub）。 |
| **codex 对等** | 镜像/凭证透传/runner 选择**对等**（见上 ②③）。**反向不对等**：`[AGENT_EXIT]` 可见度只给了 codex（`pipeline-afk-run.sh:72-74`）、claude-code 分支（:103-124）**无同款回放**——这是 codex 反而被照顾得更好（详见第六章）。 |

---

## 第二章 · 前端线端到端旅程表（dashboard）

> dashboard 是「全机唯一 Global server」，聚合本机所有已注册项目（`README.md:53`）。前端触点逐一走查，与终端线同深度。

### 环 F0 · 打开 dashboard + 项目切换器（Nav）

| 维度 | 内容 |
|---|---|
| **想做什么** | 打开 dashboard、选到自己的项目、（若首次）把项目加进来。 |
| **理想体验** | 零项目时有教学式引导「怎么把项目加进来」；多项目有切换器；nav 能看出系统就绪与否。 |
| **现状/设计** | 三个主视图 `收件箱/进度/工作台`（`Nav.tsx:16` `PRIMARY_VIEWS`，:157-175）；收件箱带计数徽标（:168-172）。项目切换器仅 `projects.length>1` 才渲染下拉（`Nav.tsx:89`，含「全部项目」聚合项 :108-120）；恰 1 项目退化为不可点 label（:154-156）。nav 右侧只有一个 SSE 连接圆点（:177-183）+ 语言/主题切换。 |
| **断点/问题** | ① **无项目注册入口**：`Nav.tsx:53-55` 注释明示「注册项目入口已随 T17 删除…dashboard 侧不再提供注册 UI」——`registerProject`/`POST /api/projects` 仍在 client（`client.ts:97-111`）但 nav 无调用点。**纯 dashboard 新用户无法从 UI 加项目，只能回终端 `pipeline init`，且全程无引导**。② **切换器可见性割裂**：>1 项目才可交互，1 项目是静态 label，0 项目整块不渲染——新用户看不到任何项目语境。③ **唯一「健康」信号是 SSE 连接点**（传输层），**易被误读为「系统就绪」**；无「去跑 pipeline setup」、无安装/就绪指示、无 codex/runner 任何入口。（合并计入 P0-F1） |
| **codex 对等** | nav 不涉及 runner，对等（但也因此没有任何 runner 就绪线索）。 |

### 环 F1 · 工作台流程带（WorkbenchView + StepperRail）

| 维度 | 内容 |
|---|---|
| **想做什么** | 看这条 workflow 现在卡在哪个阶段、每阶段几个 change、真实流转。 |
| **理想体验** | 真实数据驱动的流转（真 change 计数 + running 脉冲 + 最近 transition），不是灯光秀。 |
| **现状/设计** | workflow 下拉切换（`WorkbenchView.tsx:274-290`）+ 线性 StepperRail 阶段卡（:16）+ **v6 T11 流程带真实计数/running 脉冲**（:91-152，按 `(root,workflow)` 对已加载 snapshot 二次分组统计每阶段真实 change 数，archived 排除，**不新增端点**）+ v6 T13 最近流转（:232-242）。此环回应了 config 分析 §7「假动画」批评的一部分（真计数已上）。 |
| **断点/问题** | 右栏仍有「流程预览/GSAP 预演」痕迹（:22 注释）——预演动画是否已被真数据取代，需在批 3 前核清，避免真计数与假动画并存的口径混乱（非本初创核心，轻记）。工作台流程带与「安装/就绪」无关，**不承接首启引导**。 |
| **codex 对等** | 不涉及 runner，对等。 |

### 环 F2 · Loop 审阅面（LoopCard，含刚交付的草稿徽章批准/驳回）

| 维度 | 内容 |
|---|---|
| **想做什么** | 审阅 agent 用 `pipeline loops init` 起草的 loop，批准/驳回；看清字段来源、三方关系。 |
| **理想体验** | 人只做「审阅/批准/调整/驳回」，不裸填；每字段标生产者；loop/change_prefix/phases 三方关系清楚。 |
| **现状/设计** | **Demo2-A 落地度很高**：① 字段生产者三色徽章（`LoopCard.tsx:98-138` `FIELD_PROV` + `ProvBadge`，goal/design_doc=agent、change_prefix/runner=sys、status=human…）；② **草稿待审阅徽章**（`row.draft===true` → `lp-draft-badge`，:523/:545-549）+ 批准/驳回动作（`reviewAction`，:459-469：批准=`status:'active'`、驳回=`status:'paused'` 现场保留，走 `postLoopUpdate` patch:{status}，成功后**显式重拉不轮询**，G22 纪律）；③ **三方关系条**（:588-619：root→change_prefix→匹配 changes 弹层 :621-642·phases chips，决议 #3 裁减为「数据关系澄清」不画健康环）；④ **空态「去终端」引导**（:500-515：给可复制 prompt + note，替代旧 YAML 样板）；⑤ runner 下拉双选项（`LOOP_RUNNERS`，:720-729）+ 升档过确认弹层/降档直发（:429-437）。 |
| **断点/问题** | ① **runner 生产者徽章过度承诺**（P2-F2）：徽章标 `sys`「结合就绪三灯凭证探测反向建议」（`FIELD_PROV:113`），但 runner 下拉（:720-729）**无任何 readiness 联动**，纯 select——徽章名不副实，用户选 codex 时得不到「你还没配 OPENAI_API_KEY」的反向提示。② 空态引导「去终端」很好，但指向的是**生成 loop**，不指向前置的 setup/凭证——与首启断链（P0-F1）同源。 |
| **codex 对等** | **runner 下拉 codex 是一等选项**（:720-729，LOOP_RUNNERS 双选项，历史自由值补渲染为第三项），对等良好。 |

### 环 F3 · AFK 执行卡（AutomationCard：三灯 + 镜像 datalist）

| 维度 | 内容 |
|---|---|
| **想做什么** | 配 AFK 参数（并发/重试/入队/镜像），并一眼看 docker/镜像/凭证是否就绪。 |
| **理想体验** | 参数预填推荐值；镜像可枚举下拉；三灯对 docker/镜像/**两 runner 凭证**都点亮；缺镜像给一键 build。 |
| **现状/设计** | 滑杆预填推荐值（并发 4/重试 1，`AutomationCard.tsx:20-26`）+ 入队开关 + 镜像输入（原生 datalist 枚举 `docker images`，不可用降级纯文本框，:260-282）。**就绪三灯**（:170-210）：docker 灯（:173）、镜像灯 + 缺镜像时「复制 build_hint」按钮（:181-191，`bash tools/sandcastle/build.sh`）、凭证灯（:192-208）。真值来自 `GET /api/afk/readiness`（`server.ts:536-546` → `afkReadiness.ts`），失败整区不渲染不谎报。 |
| **断点/问题** | ① **凭证灯只认 claude-code**（P1-F1，见第六章）：灯色（:193）+ 可见文案（:204-208）**只读 `CLAUDE_CODE_OAUTH_TOKEN`**；codex 的 `OPENAI_API_KEY`/`CODEX_HOME` 仅进 hover `title` tooltip（:199-202），i18n `afk_rd_cred` 硬编码「凭证(claude-code)」（`translations.ts:447`）。② **凭证灯无诚实口径**（P1-F2）：i18n 无「服务进程视角/终端 doctor 为准」串（grep 零命中）；readiness 端点读 **server 进程 `process.env`**（`server.ts:546` 未传 hostEnv → `afkReadiness.ts:55` 默认 `process.env`），存在 config 分析 §4.3 的结构性滞后，但 UI 无一字 caveat——绿灯不保证 `afk run` 成功，用户会被误导。 |
| **codex 对等** | **唯一真·不对等点**（P1-F1）：docker/镜像灯对两 runner 共享（对等），但凭证灯把 codex 降级为 tooltip-only + 文案专属 claude-code，直接违反设计 §1「就绪三灯对两者都点亮」。 |

### 环 F4 · 独立凭证卡（SecretsCard）→ 三灯联动

| 维度 | 内容 |
|---|---|
| **想做什么** | 配 claude-code / codex 凭证，掩码显示，配完就绪灯亮。 |
| **理想体验** | write-only 不回填明文；per-runner 键清楚；保存后三灯即时刷新；优先级诚实。 |
| **现状/设计** | 独立「凭证」卡（`SecretsCard.tsx`，决策 C.5 与 AFK 卡分离）：两键**对称可编辑**（`EDITABLE_KEYS=['CLAUDE_CODE_OAUTH_TOKEN','OPENAI_API_KEY']`，:19），write-only（编辑框永远从空开始 :52，掩码显示 :107），`CODEX_HOME` 只读说明不做假输入（:151-155，决策 C2b）。保存/删除成功 → `onChanged` → 宿主 `rdNonce+1`（`WorkbenchView.tsx:229-232/722`）→ AutomationCard `refreshToken` 触发三灯重拉（`AutomationCard.tsx:66-78`），**显式动作触发不轮询**（G22）。优先级说明「宿主 env > 文件值」（`translations.ts:468`）。 |
| **断点/问题** | 凭证**写入面本身两 runner 对称、体验良好**。问题在下游三灯（环 F3 P1-F1/P1-F2）：写入卡诚实（说了优先级），但**读出灯不诚实**（只显 claude-code + 无进程快照 caveat）——同一件事（凭证）在同一张工作台里，写面对称、读面偏 claude-code，自相矛盾。 |
| **codex 对等** | **凭证写入对等良好**（两键对称，CODEX_HOME 诚实说明）；不对等只在读出的三灯（转 P1-F1）。 |

### 环 F5 · 进度页（ProgressView）——看 AFK 进度 + 四动作

| 维度 | 内容 |
|---|---|
| **想做什么** | 看所有 change 进度、AFK 跑批实时状态，并执行继续/打回/重试/终止。 |
| **理想体验** | 只读看进度 + 四动作拍板（能力面模型）；running 有实时日志；失败可诊断。 |
| **现状/设计** | 进度页承载四动作（文案以 demo v5 为唯一口径，决议 #13，`ProgressView.tsx:37-43`）：终止=`POST /api/afk/:name/cancel`（仅 running 可点）、重试=`/retry`（failed）、放弃=`/dismiss`（failed/conflict→off，决议 #4）、放行/打回=`POST transition`（gate 行）；afk 三动作乐观 patch（:288-306）。running 行内实时日志 `useAfkLog` **2.5s 轮询**（:189-196，仅 running 时轮询——live 日志的合理轮询，区别于就绪三灯的显式重拉）+ 「沙箱内阶段」行（`automation_current_phase`，:197/216-218）。 |
| **断点/问题** | ① **失败不做就绪归因、不标 runner**（P2-F1）：失败卡只透传 `automation_last_error` 原文（经 `shared/TaskDetail.tsx:212/256-259` 渲染 `last_error` 框），**不区分**缺凭证/缺镜像/缺 docker，也**不标是 codex 还是 claude-code 在跑**（grep 在 progress/inbox/shared 对 `runner|codex|claude-code` 零命中）——用户看到一段原始错误串，拿不到「去配 X」的可诊断下一步。② TaskDetail 有「在终端继续」命令区（`cmd=pipeline transition ...`，:208/452-462，带复制按钮）——**这是很好的前端→终端桥**，但**仅前进 transition 有**，`state==='failed'` 时 `cmd=null`（:208），失败态**不给**任何终端命令。 |
| **codex 对等** | 进度页**不显 runner 身份**——codex 与 claude-code 的 AFK 跑在进度/日志/失败框里**无法区分**（P2-F1）；`automation_last_error` 是唯一线索但要靠错误文本内容自己猜。 |

### 环 F6 · 收件箱（InboxView）——只收能拍板的事

| 维度 | 内容 |
|---|---|
| **想做什么** | 看现在就能拍板的 change，一键放行/打回，或处置 AFK 失败。 |
| **理想体验** | 只收能拍板的（缺产出归进度）；键盘巡检→一键拍板；失败可诊断；首次有引导。 |
| **现状/设计** | **严格只收能拍板的**（`inbox.ts:35-39` `isAwaitingDecision`，只 gate/failed 进，archived 一票否决；副标题复述口径 `translations.ts:42`）——**符合能力面模型**。动作：放行/打回=transition（`InboxView.tsx:314-337`，打回强制二次确认 :474-505）、重试/放弃=afk retry/dismiss（:284-301）；键盘 j/k/Enter/Esc 巡检（:198-225）。 |
| **断点/问题** | ① **拍板动作无键盘**（P2-F3）：`Enter` 只开合详情，放行/打回/重试/放弃**全靠鼠标**（:198-225），「j/k 巡检→一键拍板」的键盘流是断的。② **AFK 失败不区分成因/runner**（同 P2-F1）：失败卡只透传 `automation_last_error`（:70），失败 chip 仅显 `automation` 字段值（:431-436），不区分凭证/docker/codex。③ **首启零引导**（P0-F1）：空态（:349-360）是纯「无待办」语义，CTA「去进度」（`translations.ts:47`）——而零态用户进度**同样空**，形成死循环；**无「去创建项目 / 跑 pipeline init / 配凭证」任何可执行下一步**，也无终端交叉引用。④ loop 草稿**不进收件箱**（归工作台 LoopCard，符合分工，非缺陷，仅登记）。 |
| **codex 对等** | 收件箱不呈现 runner 身份；AFK 失败以泛化 `automation=failed` 冒头，codex/claude 不分（同 P2-F1）。 |

---

## 第三章 · 两线分工与一致性专章

### 3.1 同一件事，终端 vs 前端怎么做

| 事项 | 终端线 | 前端线 | 分工清楚？真相源打架？ |
|---|---|---|---|
| **装技能** | `pipeline setup [skills]`（批 2，现 stub `setup.ts:145`） | **无任何面**（工作台不含技能安装入口，grep `setup/doctor` 零命中） | ❌ **前端完全缺位**：技能安装是纯终端事，但 dashboard **既不做也不引导**「去终端跑 setup」。前端用户装不齐技能（P0-F1/P1-F3）。 |
| **查技能齐全** | `pipeline doctor`（批 2 补技能检查，现零技能项 `doctor.ts:199-211`） | 设置页有「相位×轨道强制技能矩阵」但**不检测已安装**（config 分析 §2.4 引 `skillsRegistry.ts:27-30`） | ❌ 两侧都不查在位；矩阵让人选中一个实际不存在的技能却无「未装」角标。 |
| **配凭证** | `afk run` 读 secrets+env 合并（`afk.ts:143-150`，**权威**） | 凭证卡写 `~/.claude/pipeline-secrets.json`（`SecretsCard.tsx`，两键对称） | ✅ 前端能独立配（写入对称、机器级、write-only）——**前端此项自足良好**。真相源：文件由两侧共读（`readSecrets`），不打架。 |
| **查就绪（docker/镜像/凭证）** | **无三灯等价**（doctor 不含；只 `afk run` 失败时 stderr `afk.ts:113`） | 就绪三灯（`AutomationCard.tsx:170-210`，server 实时探测） | ⚠️ **只前端有就绪总览**；终端用户无「一眼看就绪」（P1-T2）。且凭证灯读 **server 进程快照**（可能滞后），终端 `afk run` 用**当刻 shell 合并 env** 才权威——**真相源分裂**（P1-X1）：docker/镜像两侧可对齐（活状态随查随准），凭证两侧**不等价**且前端**未标注 caveat**（P1-F2）。 |
| **建镜像** | 手动 `bash tools/sandcastle/build.sh`（`afk run` 失败原始报错不给此命令，沿 §4.1） | 三灯缺镜像时「复制 build_hint」按钮（`AutomationCard.tsx:181-191`，常量 `afkReadiness.ts:14`） | ⚠️ **命令同源风险**（P1-X1）：`SANDCASTLE_BUILD_HINT` 常量目前**只在** `afkReadiness.ts:14`；终端侧（`setup runtime`/doctor）尚未落地，批 3 落地时**必须共用同一常量**，否则两处漂移。 |
| **看 AFK 进度** | `pipeline afk status`（泳道 `afk.ts:84-104`）/ `scan`（就绪队列） | 进度页 running 行 + 实时日志 + 取消/重试/放弃 + 沙箱阶段（`ProgressView.tsx:186-306`） | ✅ 前端更丰富（live 日志、逐 change 动作）；终端 `afk status` 是简版泳道。分工合理，但两侧**都不标 runner 身份**（P2-F1）。 |
| **起草/审阅 loop** | `pipeline loops init` 向导（`loops.ts:807`，起草 paused） | LoopCard 草稿徽章 + 批准/驳回（`LoopCard.tsx:459-469/545-549`） | ✅ **分工最清晰的一环**：终端生成→前端审阅，`status:paused` 硬 gate 串起两侧，真相源单一（`.pipeline/loops.yaml` + 草稿 sidecar）。 |
| **注册项目** | `pipeline init` best-effort 自动登记（`init.ts:88-94`） | **无 UI 入口**（决议 #7 删除，`Nav.tsx:53-55`） | ❌ 前端**不能独立注册项目**，也不引导回终端（P0-F1）。 |

### 3.2 关键结论：前端能否独立完成关键配置？

- **能独立**：配凭证（凭证卡）、审阅/批准 loop、调 AFK 参数、执行四动作、看进度。
- **不能独立、且无引导回终端**：① 注册项目（唯一入口在 `pipeline init`）；② 装技能（唯一入口在 `pipeline setup`，现 stub）；③ 查技能齐全（doctor，现无技能项）；④ 建镜像（虽给复制命令但要去终端粘贴执行）。
- **最大结构缺口**：`pipeline setup` **只有终端有**，dashboard **既无等价面、也无「去终端跑 setup」引导**。一个纯 dashboard 用户（config 分析 §5 设想的 PM/运维角色）**无法把系统带到全功能可用**，且**首启即撞死胡同**（空收件箱→空进度→无下一步，环 F0/F6）。→ 这是前端线的 P0-F1。

### 3.3 诚实口径是否贯穿

- ✅ 凭证**写入**面诚实（优先级说明 `translations.ts:468`；CODEX_HOME 只读说明 `sc_codex_home_note`）。
- ❌ 凭证**读出**三灯**不诚实**：无「服务进程视角，终端 doctor 为准」caveat（P1-F2），与 config 分析 §4.3「必须写进 UI 文案本身」的硬要求相悖。
- ⚠️ 官方/第三方标注（设计 §4）当前**无处呈现**（setup 计划骨架无标注、前端无技能安装面）——批 2 落地时须在 setup 计划 + （若前端做技能面）dashboard 同源。

---

## 第四章 · 问题清单

> 三组并列：**终端交互问题** / **前端交互问题** / **跨线一致性问题**。每条：触点 · 问题 · 影响 · 建议修法 · 归属批次。

### 4.1 终端交互问题

| 编号 | 触点 | 问题 | 影响 | 建议修法 | 归属 |
|---|---|---|---|---|---|
| **P0-T1** | `pipeline setup skills` | 技能安装段是空占位（`setup.ts:145-149`），`skill-sources.yaml` 不存在 | 装完插件 ~53 外部技能无一键装齐路径——「全功能全量可用」核心承诺无触点兑现 | 落 `templates/skill-sources.yaml`（设计 §2）+ 实装按 tool 分组选装器（claude-plugin/skills-cli --skill/npm/agents-inc）+ 装前 `--list` 核最新 + 幂等差集 + 失败不阻断末尾汇总 | 批 2 |
| **P0-T2** | `pipeline doctor` | 11 项检查零技能在位项（`doctor.ts:199-211`）；manifest 技能表无消费者（`manifest.yaml:67,88`）；无代码硬拦（interactive-skill-gate 不查安装） | 强制技能缺失时 doctor 全绿、会话无提示、gate 不拦——用户不知道自己缺技能 | doctor 新增技能在位检查（扫 `~/.claude/skills`+`~/.agents/skills`+plugins/cache，对齐老仓口径），mandatory 缺→红+「跑 pipeline setup」，recommended 缺→黄 | 批 2 |
| **P1-T1** | `pipeline-afk-run.sh`（claude-code 路径） | 无 token/无 claude CLI 时静默走确定性 commit 并报 `verify_result:pass`（:75→:127-135）；codex 路径反而硬错误+可见 | 用户以为 agent 真跑了，实为占位——默认 runner 反而最不诚实 | claude-code 路径补对称的可见度：token 缺失打可操作 stderr（不静默）、agent 非零退出补 `[AGENT_EXIT] claude` 回放（对齐 codex :72-74） | 需新任务（功能修复，非纯 UX） |
| **P1-T2** | 终端就绪总览 | doctor 不含 docker/image/credential；唯一就绪信号是 `afk run` 失败 stderr（`afk.ts:113`） | 终端用户无法「一眼看就绪」，只能靠 run 失败反推 | 实装 `pipeline setup runtime`（`setup.ts:155` stub）+ doctor 增 `afk:docker`/`afk:image`/`afk:credential-*` check id（设计 Phase 3） | 批 3 |
| **P2-T1** | `pipeline --help` | `setup` 注册在最末（`program.ts:246-253`），列于内部/一次性命令之后 | 首要上手命令叙位最低，新用户扫 help 先看到 `_gen-router-sh` 等 | 调整注册顺序把 `setup` 提到 `init` 附近，或 `addHelpText` 置顶「首次安装：pipeline setup」 | 批 2/打磨 |
| **P2-T2** | `session-start.sh` | AFK 提示只指 dashboard、明确注释不指 `pipeline doctor`（:156-161） | 与设计 Phase 2「session-start 加一行指向 doctor」相悖；批 2 doctor 长出技能/AFK 检查后此提示成孤岛 | 批 2 doctor 补检查后，回改 session-start 提示同源指向 `pipeline doctor` | 批 2 |
| **P2-T3** | `pipeline init` | change 初始化强制 `--track`/`--preset` 无向导（`init.ts:32-44`），仅 `loops init` 有向导 | 新用户不知填什么；两个 init 体验不对称 | 给 `pipeline init` 加交互向导（缺 TTY 回退 flags，对齐 `loops init` 先例）或在 doctor/setup 输出解释取值 | 批 2/3 或新任务 |
| **P2-T4** | `manifest.yaml` / SKILL 散文 | `to-prd`/`to-issues` 未改名（`manifest.yaml:82`）；`uiforge` 仍在散文（`EXTERNAL-SKILLS.md:58`、`pipeline-build/SKILL.md:141,289`） | 批 2 setup 按旧名装会失效（上游已改名 to-spec/to-tickets）；uiforge 真无源 | 批 2 随 skill-sources.yaml 一并：改名 + 删 uiforge（设计 §2/§8） | 批 2 |

### 4.2 前端交互问题

| 编号 | 触点 | 问题 | 影响 | 建议修法 | 归属 |
|---|---|---|---|---|---|
| **P0-F1** | Nav + InboxView + 工作台 | 前端不能独立起步也不被引导回终端：无项目注册入口（`Nav.tsx:53-55`）、切换器 >1 项目才现（:89）、无技能/setup 面、空收件箱 CTA「去进度」→ 进度也空成死循环（`InboxView.tsx:349-360`+`translations.ts:47`） | 纯 dashboard 新用户从「装完插件」到「首个 change 在飞」全程无承接——前端全功能不可达且不自知 | ① 首启引导页（零项目/零 change 时给「注册项目 / 跑 pipeline init / 跑 pipeline setup 配就绪」可执行 checklist + 可复制命令）；② nav 或工作台加「就绪总览 / 去终端跑 setup」入口；③ 空态 CTA 指向可执行下一步而非另一个空视图 | 需新任务（前端首启引导，设计未覆盖） |
| **P1-F1** | AutomationCard 就绪三灯 | 凭证灯灯色（:193）+ 文案（:204-208）只读 `CLAUDE_CODE_OAUTH_TOKEN`；codex 仅 hover tooltip（:199-202）；i18n `afk_rd_cred` 硬编码「凭证(claude-code)」（`translations.ts:447`） | **违反设计 §1「就绪三灯对两者都点亮」**——全仓唯一把 codex 当二等公民的具体代码点 | 凭证灯改为 per-runner 双灯（或一灯两态可见），codex 与 claude-code **同等可见**（灯色+文案，不靠 tooltip）；i18n 去掉「(claude-code)」硬编码 | 批 3 / 即修（已交付 v6 代码缺陷） |
| **P1-F2** | AutomationCard 就绪三灯 | 凭证灯无「服务进程视角/终端 doctor 为准」caveat；readiness 读 server 进程 `process.env`（`server.ts:546`+`afkReadiness.ts:55`），有结构性滞后 | 绿灯不保证 `afk run` 成功，用户被误导（config 分析 §4.3 明令「必须写进 UI 文案本身」） | 三灯凭证行加降级 caveat 文案；docker/镜像灯保持权威、凭证灯明标「参考·终端 doctor 为准」 | 批 3 |
| **P1-F3** | 工作台整体 | dashboard 无 setup/技能安装等价面，也无「去终端跑 setup」引导（grep `setup/doctor` 零命中） | 技能齐全这件「全功能」核心事，前端零覆盖零指引 | 至少加只读「技能齐全度」面（消费未来 doctor 的 JSON）+「去终端跑 pipeline setup」引导条 | 批 2/3 |
| **P2-F1** | ProgressView / InboxView / TaskDetail | AFK 失败只透传 `automation_last_error` 原文（`InboxView.tsx:70`、`TaskDetail.tsx:256-259`），不区分缺凭证/镜像/docker，不标 runner（progress/inbox/shared 对 `runner/codex` 零命中）；失败态 TaskDetail `cmd=null`（:208）不给终端命令 | 用户拿不到「去配 X」可诊断下一步；codex 失败与 claude 失败在 UI 无法区分 | 失败卡加成因归因（映射常见 last_error→「缺凭证/缺镜像」+ 修复命令）+ 显示该 change 的 runner 身份；失败态也给终端命令 | 批 3 |
| **P2-F2** | LoopCard runner 徽章 | 徽章标 `sys`「结合就绪三灯凭证探测反向建议」（`FIELD_PROV:113`），但 runner 下拉（:720-729）无 readiness 联动 | 徽章名不副实；选 codex 得不到「未配 OPENAI_API_KEY」反向提示 | 要么真接线（runner 下拉按已配凭证给「推荐」标记），要么徽章文案降级为不承诺反向建议 | 打磨 |
| **P2-F3** | InboxView 键盘 | j/k/Enter/Esc 只导航（:198-225），放行/打回/重试/放弃全靠鼠标 | 「巡检→一键拍板」键盘流断 | 给拍板动作加快捷键（如 Enter=放行焦点行、Backspace=打回，带二次确认） | 打磨 |

### 4.3 跨线一致性问题

| 编号 | 触点 | 问题 | 影响 | 建议修法 | 归属 |
|---|---|---|---|---|---|
| **P1-X1** | 就绪真相源 | 凭证：前端 server 进程快照（可能滞后）vs 终端 `afk run` 当刻合并 env（`afk.ts:143-150`，权威）——两侧不等价且前端未标注；`SANDCASTLE_BUILD_HINT` 常量只在 `afkReadiness.ts:14`，终端侧未落地 | 用户在两处看到不一致的就绪结论；批 3 终端落地若各写一份 build 命令即漂移 | 凭证灯明标降级参考（配 P1-F2）；批 3 的 setup runtime/doctor 与 server 共用同一 build_hint 常量 + 同一探测口径 | 批 3 |
| **P2-X1** | 文档端口 | `README.md:58` 写 dashboard `127.0.0.1:8765`，本轮工作/任务语境用 `8799` | 用户按 README 连不上或困惑 | 核对默认端口单一真相源，README 与实际对齐 | 打磨 |
| **P2-X2** | `README.md` | 「上手（5 分钟）」（:34-49）仍是源码构建流（npm/npx），无 `claude plugin marketplace add`/`install`/`pipeline setup` | 按新初创安装的用户在 README 无承接 | README 增「插件安装」段：marketplace add → install → `pipeline setup` → 打开 dashboard 注册项目 | 批 3 或新任务 |

**统计**：P0 × 3（T1、T2、F1）· P1 × 6（T1、T2、F1、F2、F3、X1）· P2 × 9（T1、T2、T3、T4、F1、F2、F3、X1、X2）= **18 条**。

---

## 第五章 · 体验验收 rubric（最终交付前必过，可逐条勾）

> 两轴：**A 功能齐全轴**（能不能端到端跑通）+ **B 交互体验轴**（体验够不够好），B 轴分**终端子轴**与**前端子轴**。

### A · 功能齐全轴（15 条）

- [ ] **A1** `claude plugin marketplace add jefferysha/pipeline-worklfow` + `install pipeline-lite@pipeline-lite` 真机走通，装后普通会话 `/pipeline-lite` skill 可见、session-start 触发、`pipeline` 命令可敲。
- [ ] **A2** `pipeline setup`（无 stub）读 `skill-sources.yaml`，把 mandatory/recommended 技能**按名从上游最新源装齐**（~53/55），无任何整装大仓。
- [ ] **A3** `pipeline setup --dry-run` 只打印计划、零全局副作用；`--yes` 非交互全装；幂等重跑已装跳过。
- [ ] **A4** ECC 15 个技能走 `npx skills add affaan-m/ECC --skill …` 按名装，装前 `--list` 核名（应对 to-prd→to-spec 类漂移）。
- [ ] **A5** `pipeline doctor` 对 manifest 每个 mandatory 技能报在位/缺（缺→红+修复命令），recommended 缺→黄。
- [ ] **A6** manifest 已删 `uiforge`、`to-prd→to-spec`/`to-issues→to-tickets` 改名落地。
- [ ] **A7** `pipeline init` / `pipeline loops init` 走通，`loops init` 起草 `status:paused` 草稿并可在 dashboard 审阅。
- [ ] **A8** docker 缺失/镜像缺失/凭证缺失三种断点，`afk run` 前（setup runtime / doctor）即给**可操作**提示（含 `bash tools/sandcastle/build.sh`）。
- [ ] **A9** 默认镜像 `sandcastle:local` 内 **claude-code 与 codex 两 CLI 都在**（`Dockerfile` `WITH_CODEX` 跟随）。
- [ ] **A10** claude-code 路径凭证从 secrets/env 真透传进沙箱（`CLAUDE_CODE_OAUTH_TOKEN`），token 缺失**不静默假 pass**。
- [ ] **A11** codex 路径凭证真透传（`OPENAI_API_KEY`/`CODEX_HOME`），CLI 缺失硬错误、认证失败可见。
- [ ] **A12** dashboard 凭证卡能独立配齐两 runner 凭证并即时联动三灯。
- [ ] **A13** 就绪三灯对 docker/镜像/**两 runner 凭证**都真探测真值。
- [ ] **A14** 纯 dashboard 用户有可执行路径把系统带到「全功能可用」，或有明确「去终端跑 X」引导（不撞死胡同）。
- [ ] **A15** 收件箱只收能拍板的、进度可看 AFK 实时、四动作（继续/打回/重试/终止）真接线端点。

### B · 交互体验轴

#### B-终端子轴（8 条）

- [ ] **BT1** `pipeline setup` 计划**可读**：每条命令 + **官方/第三方标注** + 受影响全局目录（`~/.claude`/`~/.agents`/全局 npm）+ 待装差集，确认后才写。
- [ ] **BT2** setup 15 条命令跨 3 套工具的**进度/成败/失败项**清晰呈现；装到一半失败**续跑**（幂等）、失败一条不阻断其余、末尾汇总（强制缺红字 + 手动命令）。
- [ ] **BT3** setup 装了哪些 ECC 技能**看得见**（不是黑箱）。
- [ ] **BT4** `pipeline doctor` 强制缺（红）/推荐缺（黄）文案给**可执行修复命令**；exit 语义（红→1）稳定。
- [ ] **BT5** `pipeline setup` 在 `--help` 位置醒目（不排在内部命令之后）；首次安装引导可发现。
- [ ] **BT6** `pipeline init` 有向导或清晰取值说明（不让新用户对着 `--track`/`--preset` 发懵）。
- [ ] **BT7** claude-code 与 codex 两 runner 的 AFK 失败**都可见、都不静默**（含 agent 非零退出回放对称）。
- [ ] **BT8** session-start 的就绪提示与 doctor **同源**（批 2 后指向 `pipeline doctor`）、轻量不烦、SessionStart 零 spawn。

#### B-前端子轴（11 条）

- [ ] **BF1** **首启不撞死胡同**：零项目/零 change 时有引导页给可执行下一步（注册项目 / init / setup）+ 可复制命令，不循环指向另一个空视图。
- [ ] **BF2** 项目切换器在**任意项目数**下都能看出项目语境（含 0/1 项目态）；有加项目的路径（UI 或明确引导回终端）。
- [ ] **BF3** **就绪三灯对 codex 与 claude-code 同等可见**（灯色 + 文案，不靠 hover tooltip）——codex 不是二等公民。
- [ ] **BF4** 凭证三灯带**诚实 caveat**（「服务进程视角，终端 doctor 为准」），绿灯不误导。
- [ ] **BF5** 凭证卡 write-only（不回填明文）、per-runner 键清楚、保存后三灯**显式重拉**（不轮询）。
- [ ] **BF6** Loop 审阅面：草稿徽章 + 批准/驳回 + 字段生产者徽章 + 三方关系条齐全；批准/驳回后徽章即时消失。
- [ ] **BF7** AFK 失败在收件箱/进度**可诊断**：区分缺凭证/镜像/docker 成因 + 显示 runner 身份 + 给可执行修复。
- [ ] **BF8** 进度页 AFK 实时日志 + 沙箱阶段可见；四动作文案与 demo v5 同源不漂移；running 才轮询（其余显式）。
- [ ] **BF9** 收件箱只收能拍板的（缺产出归进度）；键盘可完成巡检**且拍板**（不只导航）。
- [ ] **BF10** dashboard 有「技能齐全度 / 去终端跑 setup」的只读面或引导（前端不对技能安装完全失声）。
- [ ] **BF11** 官方/第三方标注、凭证优先级、镜像 build 命令等**与终端同源不漂移**。

---

## 第六章 · codex 对等专章

> 逐触点核 codex 是否被当二等公民。结论先行：**运行时/执行层对等扎实，唯一真·不对等是 dashboard 就绪三灯的凭证灯。**

| 触点 | claude-code | codex | 对等？ | 出处 |
|---|---|---|---|---|
| **镜像内 CLI** | 装 `@anthropic-ai/claude-code` | 装 `@openai/codex@0.144.1` | ✅ **对等**（默认镜像两者都在，`WITH_CODEX` 跟随 `WITH_CLAUDE_CODE`） | `Dockerfile:30/47-48` |
| **凭证透传（host→沙箱）** | `CLAUDE_CODE_OAUTH_TOKEN`（v6 T2 补齐） | `OPENAI_API_KEY`/`CODEX_HOME` | ✅ **对等**（互斥透传，各随点名它的 runner） | `dockerRunChange.ts:98-117`、`afk.ts:143-150` |
| **runner 选择** | 缺省路径 | loop `runner:codex` → `PIPELINE_RUNNER=codex` | ✅ **对等**（`runnerFor.ts` 单值归属；LoopCard 下拉双选项一等呈现） | `runnerFor.ts:23-30`、`LoopCard.tsx:720-729` |
| **凭证写入面（dashboard）** | `CLAUDE_CODE_OAUTH_TOKEN` 行 | `OPENAI_API_KEY` 行 + `CODEX_HOME` 只读说明 | ✅ **对等**（两键对称可编辑，write-only） | `SecretsCard.tsx:19/151-155` |
| **CLI 缺失失败** | 静默确定性回落（**更不诚实**） | 硬错误 `exit 96`（更诚实） | ⚠️ **不对等，但对 codex 有利**（claude 反而差） | `pipeline-afk-run.sh:43-46 vs :75/127` |
| **agent 非零退出可见度** | 无 `[AGENT_EXIT]` 回放 | 有 `[AGENT_EXIT] codex N` 回放 | ⚠️ **不对等，但对 codex 有利**（观察项③只修了 codex 侧） | `pipeline-afk-run.sh:72-74 vs 103-124` |
| **就绪三灯·凭证灯（dashboard）** | 灯色 + 可见文案「凭证(claude-code)」 | 仅 hover tooltip，无独立灯色/文案 | ❌ **真·不对等，codex 二等公民** | `AutomationCard.tsx:193/199-208`、`translations.ts:447/452` |
| **进度/收件箱 runner 身份** | 不显示 | 不显示 | ⚠️ 两者都不显（失败无法区分是谁在跑） | grep `runner/codex` 于 progress/inbox/shared 零命中 |
| **codex 版本 pin** | 不 pin（latest） | pin `@0.144.1` | ⚠️ 轻微不对称（可辩护：可复现构建，`Dockerfile:41-44` 已注明） | `Dockerfile:30 vs 48` |
| **build.sh 完成回执** | 不确认哪些 CLI 入镜像 | 同不确认 | ⚠️ 两者都不确认（`local` 变体注释只提 claude，:20） | `build.sh:20/47` |

### codex 对等结论

1. **运行时对等是真实且工程扎实的**：镜像双 CLI、凭证双向透传、runner 选择、凭证写入面——v5 T20/T22 + v6 T2 已把 codex 做成一等执行路径，**codex 未被系统性当二等公民**。
2. **唯一真·不对等 = dashboard 就绪三灯的凭证灯**（P1-F1）：灯色与文案只认 claude-code，codex 藏在 hover tooltip，直接违反设计 §1「就绪三灯对两者都点亮」。**这是修复优先级最高、也是最容易 claim 完整对等的一处**——改成 per-runner 双灯即可。
3. **两处「反向不对等」（codex 反而更好）**：CLI 缺失硬错误、`[AGENT_EXIT]` 可见度——建议顺手把 claude-code 侧补齐到同款诚实度（P1-T1），让两 runner 失败哲学一致。
4. **次要**：进度/收件箱不标 runner（P2-F1，两者都缺，非偏袒）、codex 版本 pin（可辩护）、build.sh 回执（两者都缺）。

---

## 附：本审查引用的关键出处索引

- 设计：`docs/superpowers/specs/2026-07-12-full-install-experience-design.md`（§1 成功判据、§2 registry、§3 三阶段、§4 约束、§5 边界、§8 分批）。
- 既有旅程：`docs/ux/2026-07-11-config-experience-analysis.md` §4（8 环断点、终端/dashboard 分工、§4.3 凭证滞后诚实口径）。
- 技能源：`docs/research/2026-07-12-skill-install-sources.md` §6（ECC 按名选装、~53/55、禁整装 §6.5）。
- 终端：`packages/cli/src/commands/setup.ts`、`doctor.ts`、`loops.ts`、`init.ts`、`afk.ts`、`program.ts`、`main.ts`、`hooks/session-start.sh`、`templates/manifest.yaml`。
- 运行时：`tools/sandcastle/Dockerfile`、`build.sh`、`pipeline-afk-run.sh`、`packages/automation/src/sdk/dockerRunChange.ts`、`lifecycle/runnerFor.ts`、`packages/server/src/afkReadiness.ts`、`secrets.ts`、`server.ts`。
- 前端：`packages/dashboard-app/src/workbench/{AutomationCard,SecretsCard,LoopCard,WorkbenchView}.tsx`、`progress/ProgressView.tsx`、`inbox/InboxView.tsx`、`shared/TaskDetail.tsx`、`shell/Nav.tsx`、`i18n/translations.ts`。
