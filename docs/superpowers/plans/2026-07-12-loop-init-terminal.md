# 计划:2026-07-12 loop init 终端侧(CLI 向导 + 「agent 写草稿 → dashboard 审阅」协议)

> 交互真相源:`design-demos/v6-config-copilot.html` 方案 A(「终端生成,UI 审阅」,用户已拍板)——其「诚实说明」与「落地清单」是本计划协议设计的直接依据。落地建议来源:`docs/ux/2026-07-11-config-experience-analysis.md` §6.2。
> 授权:v6 计划 YAGNI 节第 1 行「CLI `pipeline loop init` 向导」的重开,由用户本轮点名执行。
> 推送红线不变:未经用户「推」,不 push。凭证红线不变(本计划不触碰凭证面)。术语纪律:用户可见文案一律「阶段」,不用「相位」(决议 #8)。

---

## 0. 前置声明

- 本会话同批先行落地了「观察项小修批」五项,其中观察项②(LoopCard runner enum 软校验 warning,决议 #14①)与本计划 L3 的向导 runner 提示是同一口径——CLI 侧 stderr 文案与 LoopCard 警告语义一致(非 codex 值一律走 claude-code 路径),不得两处各编一套。
- T7(v6)已交付 UI 审阅面:空态「去终端」引导 + 字段生产者徽章 + 三方关系条。本计划**不重做**这些,只补终端生产侧 + 草稿审阅闭环缺口。
- 交接文档假设草稿协议为独立文件 `.pipeline/loops.draft.yaml`(「如」字提案)。本计划**不采用**独立草稿文件,采用 Demo2-A 自己演示并「诚实说明」的更轻方案(见拍板登记 P1),差异依据在该节说明。

---

## 一、拍板登记(本计划的协议设计决策)

| # | 决策 | 内容 | 依据 |
|---|---|---|---|
| P1 | 草稿协议 = 「loops.yaml 就地 + `status: paused` 约定」,**不建独立草稿文件** | agent/向导起草的 loop 直接落 `.pipeline/loops.yaml`,但强制 `status: paused`;paused 在 kernel enforce R1 是 kill 判定,scheduler 不会跑——**这是硬 gate,不是事后追认**。批准 = PATCH `status: active`;驳回 = PATCH `status: paused`(现场保留)。复用既有 `POST /api/loops/update`,零新端点 | Demo2-A「诚实说明」原文:「除非约定 agent 起草时默认写 status: paused,否则 UI 上的『批准』只是事后追认」;落地清单原文:「驳回 = PATCH status: paused,复用现有 POST /api/loops/update,不需要新端点」「批准 = PATCH status: active,同上」。独立草稿文件会造第二份 loop 存储 + 新快照面 + 新端点,而 demo 已证明轻方案闭环 |
| P2 | 「待批」标记走 sidecar `.pipeline/loops.drafts.json`,纯展示元数据 | `{version:1, ids:[...]}`;向导/结构化通道起草时登记 id;dashboard 据此渲染「agent 草稿 · 待你审阅」徽章与批准/驳回动作行;**任何 status 写回**(批准或驳回)即视为「已审阅」,server 侧清标记。标记缺失只降级掉徽章,loop 本身照常可审可改 | demo 落地清单点名的存储位难题:`LOOPS_SCHEMA` 是 `additionalProperties:false`,不能往 loop 对象塞标记字段,「得另找存储位(如 sidecar 文件或注释约定)」——本计划取 sidecar。`.pipeline/` 在仓库内可提交,标记是非敏感元数据,不触凭证红线 |
| P3 | 结构化通道 = `pipeline loops init`(命令加 `.alias('loop')`,文档口径 `pipeline loop init` 同时可用) | 人走 TTY 交互向导(逐组问答,推导默认值回车即收);agent/CI 走非交互 flags(缺 TTY 或 `--yes` 时全默认 + 必填 flags 校验);`--json` 输出结果信封。agent 手写 YAML 的旧路照常可用(只是无徽章,降级登记见风险节) | UX §6.2 原文:agent「除了直接手写 loops.yaml 之外没有任何结构化通道」;`loops` 命令既有 `allowUnknownOption` + 自解析 flags 先例(`cmdLoops`→`parseArgs`),init 沿同款 |
| P4 | 向导不问 budget 数值,预算调整明确导向 dashboard 审阅面 | budget 按 risk 档推导落默认(见 L3 推导规则表),向导/输出文案指去 dashboard 拖滑杆——生产者错位的解法本来就是「系统推导 + 人审阅拍板」,CLI 不复制一套滑杆 | UX §2.1:budget 类字段「系统给安全默认 + 人拍板上限」;T7 审阅面滑杆已在线 |
| P5 | `autonomy_level` 不写入(载入派生 L1),升档只走毕业制 | 向导不提供 level 选项;输出文案说明「缺省 L1 报告模式,升档去 dashboard(毕业制)」 | kernel 注释「缺省 L1 由 loadRegistry 派生填充」;`level set --confirm`/`POST /api/loops/level` 是唯一升降档通道(update.ts 明示 autonomy_level 是「旁路禁区」) |
| P6 | kind 缺省 `orchestrator` | 盯 change_prefix、编排 AFK 轮次正是 orchestrator 语义;kind 无硬消费(cost/readiness 侧软用),可改;flag `--kind` | 现实 fixture(restyle-loop)即 orchestrator;字段消费等级见 UX §2.1 表 |

## 二、loops schema 必填面松绑评估(用户点名单独评估;结论:**不松绑,不改 schema**)

`LOOPS_SCHEMA`(kernel `registry.ts:277-333`)必填面事实:15 个 required 字段;`phases minItems:2`、`human_gates minItems:1`、`kill_criteria minItems:1`、`goal minLength:10`、`name minLength:3`、cadence 正则 `^([0-9]+[mhd](-[0-9]+[mhd])?|continuous)$`、id 正则 `^[a-z][a-z0-9-]*$`、registry 级 `loops minItems:1`。

- **不松绑的依据**:向导推导可以满足全部必填面——`phases` 默认 default workflow 七阶段全量(零消费声明字段,声明全程最不臆造)、`human_gates` 默认复核门阶段(≥1 满足)、`kill_criteria` 默认两个已知 id(≥1 满足)、`goal` 必填输入并按 minLength 校验。`loops minItems:1` 由「首个 loop 由 init 创建整个文件」满足,不存在空表态。
- **兼容性风险(若松绑)**:schema 收窄/放宽都要跑既有 `registry.test.ts` 全量 + 评估旧 loops.yaml 「载入即坏」风险(kernel 注释明示 runner 不收紧 enum 就是这个原因);`phases minItems:2` 若放宽,`validateSchema` 消费方(server `applyLoopsUpdate` 双门、cli list 定位错误)行为面都要重审。
- **登记待拍板(重开条件,照抄 v6 YAGNI 原文口径)**:「T7 上线后仍有用户反馈『必须填 ≥2 个 phases』体验差,且完成向后兼容评估」时重开。本轮向导默认值已让用户感知不到该约束,预期不触发。

---

## 三、任务分解(5 任务,两轨)

### A 轨(终端生产侧:kernel + cli)

#### L1 · kernel:loops.yaml 新建/追加纯函数原语

- **依赖**:无。
- **一句话目标**:`packages/kernel/src/loops/update.ts` 内新增 `createLoopsYamlText(entry)`(全新文件文本:`version: 1` + `loops:` + 单条目)与 `appendLoopToYamlText(before, entry)`(既有文本尾部追加条目,保留原文格式/注释;重复 id 返回 error),复用同文件既有 `formatString`/`formatScalar` 写回格式(与窄解析器 roundtrip 闭环),产出文本必须过 `parseLoopsYaml` + `validateSchema(LOOPS_SCHEMA)`(函数内自校验,失败返回 error 不返回文本)。纯函数 text-in/text-out,零 fs——fs 与 CAS 由调用方(L3)负责,对齐本文件头注释既有分工。
- **涉及文件**:`packages/kernel/src/loops/update.ts`(尾部追加区块)、`packages/kernel/src/loops/update.test.ts`、`packages/kernel/src/loops/index.ts`(导出,尾部追加)。
- **server-cli-kernel 是否涉及**:是(kernel 纯函数层)。
- **TDD 测试要求**:①`createLoopsYamlText` 产文过 `loadRegistry` 等价解析(parse+schema 全绿)且字段值 roundtrip 逐字一致;②`appendLoopToYamlText` 对带注释/带多 loop 的既有文本追加后:原文本区间逐字节不变、新条目可读回;③重复 id → error 且不产文;④goal/name 含 `"` 或控制字符 → error(窄解析器无转义语义,沿 `formatString` 既有拒绝路径);⑤entry 缺必填/违 minItems → error(schema 自校验兜底);⑥`change_prefix: null` 写回 `null` 裸字面量可读回。
- **验收判据(真机)**:L3 联测覆盖(本任务纯函数,单测即验收)。

#### L2 · kernel:草稿标记 sidecar 模块

- **依赖**:无(与 L1 并行;`loops/index.ts` 导出各自尾部追加,波末双保留合并)。
- **一句话目标**:新建 `packages/kernel/src/loops/drafts.ts`:`draftMarksPath(repoRoot)`(= `.pipeline/loops.drafts.json`)、`readDraftMarks(path): string[]`(缺失/坏 JSON → `[]`,fail-open)、`addDraftMark(path, id)`、`clearDraftMark(path, id)`(均幂等;原子写 tmp+rename + mkdir -p,对齐 `kernel/state/projectRegistry.ts` 先例;清最后一个标记后文件保留空 ids 数组,不删文件)。
- **涉及文件**:`packages/kernel/src/loops/drafts.ts`(新建)、`packages/kernel/src/loops/drafts.test.ts`(新建)、`packages/kernel/src/loops/index.ts`(导出,尾部追加)。
- **server-cli-kernel 是否涉及**:是(kernel 存储原语)。
- **TDD 测试要求**:①缺文件读 → `[]` 不抛;②坏 JSON/形状不符读 → `[]`(fail-open);③add→read 回显、重复 add 幂等(不重复);④clear 只删目标 id 其余保留、clear 不存在的 id 幂等无错;⑤写后同目录无 tmp 残留(原子写);⑥文件内容形状 `{"version":1,"ids":[...]}` + 尾换行逐字节断言。
- **验收判据(真机)**:L3/L4 联测覆盖。

#### L3 · cli:`pipeline loops init` 向导 + 非交互结构化通道

- **依赖**:L1、L2(kernel 导出;**先 build kernel 再跑 cli 测试**,踩坑#1 stale dist)。
- **一句话目标**:`cmdLoops` 新增 `init` 分支:TTY 下逐组交互问答(node:readline/promises,三组:目标/边界/节奏,每问展示推导默认值,回车即收);非 TTY 或 `--yes` 下全默认非交互(必填 `--id` `--goal`,缺失报错列明);组装 `LoopEntry` 强制 `status: 'paused'`(无开关,协议约定);文件缺失走 `createLoopsYamlText` + `writeFileSync {flag:'wx'}`(防并发创建),存在走读原文 → `appendLoopToYamlText` → 写前重读 CAS 比对(对齐 server `applyLoopsUpdate` 读-判-写先例);成功后 `addDraftMark`(best-effort,失败只 WARN 不回滚——对齐 init.ts「注册表任何故障只 WARN」铁律);stdout 输出登记结果 + 下一步指引(「已作为草稿(已暂停)登记;去 dashboard 工作台审阅批准启用;预算/自主级别在审阅面调整」);`--json` 输出 `{ok, id, path, draft:true}` 信封;`program.ts` 的 loops command 加 `.alias('loop')` 并更新 description。
- **推导规则表(唯一口径,写死在实现里并单测钉住)**:
  | 字段 | 默认来源 | flag |
  |---|---|---|
  | id | 必填(非交互 `--id`;交互首问);校验 `^[a-z][a-z0-9-]*$` + 查重 | `--id` |
  | name | = id | `--name` |
  | kind | `orchestrator`(P6) | `--kind` |
  | goal | 必填;≥10 字符即时校验 | `--goal` |
  | change_prefix | id 按 `-` 分段取首字母 + `-`(如 `restyle-loop`→`rl-`) | `--prefix`(`--prefix none` 显式落 null) |
  | risk | `low` | `--risk` |
  | runner | `claude-code`;非 `LOOP_RUNNERS` 值不拦,stderr 软警告(口径同观察项②:非 codex 一律按 claude-code 路径执行) | `--runner` |
  | cadence | risk 映射:low→`4h` / medium→`2h` / high→`1h`;pattern 校验 | `--cadence` |
  | phases | default workflow 七阶段全量(kernel `PHASES`,types.ts:28) | `--phases`(CSV) |
  | human_gates | 复核门阶段 `['explore','spec','verify']`(镜像 dashboard `types.ts:50 REVIEW_PHASES`,注释登记镜像来源——对齐 server/loops.ts listMatchedChanges 镜像先例;kernel 无此单源) | `--gates`(CSV) |
  | kill_criteria | `['no-change-3','budget-burn-2d']`(仅有的两个有人话副标的已知 id) | `--kill`(CSV) |
  | state | 死值 `.superpowers/loops/progress.md`(约定路径,不问不给 flag) | — |
  | design_doc | `docs/loops/<id>.md`(输出提示:该文档由 agent/人后续真写,init 不代写) | `--doc` |
  | budget | risk 映射 max_runs_per_day:low→48/medium→24/high→8;max_in_flight:1;on_exceed:`skip`;max_tokens_per_day:100000(P4:调整导向 dashboard) | —(P4 不开 flags) |
  | status | 恒 `paused`(协议约定,无 flag) | — |
- **涉及文件**:`packages/cli/src/commands/loops.ts`(init 分支 + 推导规则 + 向导;尾部追加区块)、`packages/cli/src/commands/loops.test.ts`、`packages/cli/src/program.ts`(alias + description 一行)、(若 init 需要 deps 注入面沿 `CliDeps` 既有 io 先例,不新增 dep 键)。
- **server-cli-kernel 是否涉及**:是(cli 消费 kernel)。
- **TDD 测试要求**:①非交互全默认:临时目录跑 init(`--yes --id x-loop --goal <≥10字>`)→ loops.yaml 生成、`loadRegistry` 读回全绿、`status==='paused'`、budget/推导字段逐字段等于规则表;②重复 id → exit 非零 + stderr 定位;③文件已存在(含注释的 fixture)→ 追加后原区间逐字节不变;④CAS:写前文件被并发改 → 如实拒绝 exit 非零;⑤`--prefix none` → `change_prefix: null`;⑥非 enum runner → stderr 含软警告且仍成功;⑦goal <10 字 → 拒;⑧drafts.json 出现该 id;标记写失败(注入坏路径)只 WARN 仍 exit 0;⑨`--json` 信封形状;⑩交互路径:readline 注入脚本化应答(全部回车收默认)等价于①(若 readline 不可注入,以「非 TTY 走默认」+ 向导函数单测替代,报告登记测法)。
- **验收判据(真机)**:临时项目 `pipeline init` 后跑 `pipeline loop init --yes --id demo-loop --goal ...`(注意用 alias 验证)→ `pipeline loops list` 读回该 loop 且 status=paused;`.pipeline/loops.drafts.json` 含 id;`pipeline loops enforce` 不把 paused 草稿当活 loop 跑判(kill 判定语义自然覆盖)。

### B 轨(dashboard 审阅协议侧:server + UI)

#### L4 · server:LoopRow.draft 透出 + status 写回清标记

- **依赖**:L2(kernel drafts 导出;先 build kernel)。与 L3 无文件交集,可并行。
- **一句话目标**:`buildLoopsSnapshot` 每 root 读一次 draft marks(kernel `readDraftMarks`——server 对 kernel 是既有依赖,不违「不依赖 cli/automation」纪律),`LoopRow` 加 `draft: boolean`(= id 在标记中);`applyLoopsUpdate` 成功落盘且 patch 含 `status` 键时 `clearDraftMark`(best-effort,清失败不影响 200——标记是展示元数据);`client.ts` `WbLoopRow` 镜像加 `draft`。
- **涉及文件**:`packages/server/src/loops.ts`、`packages/server/src/loops.test.ts`、`packages/server/src/server.test.ts`(若快照契约测试在此)、`packages/dashboard-app/src/api/client.ts`(类型镜像一行)。
- **server-cli-kernel 是否涉及**:是(server 消费 kernel 新导出)。
- **TDD 测试要求**:①标记中的 id → 该行 `draft:true`,未标记 → `false`;marks 文件缺失 → 全 `false`(fail-open);②marks 含 loops.yaml 里不存在的 id → 不产生幽灵行(仅现有行判 draft);③`applyLoopsUpdate` patch 含 `status`(值为 active **或** paused)→ 成功后标记被清;patch 不含 status(如只改 goal)→ 标记保留;④patch 失败(schema 拒/CAS 拒)→ 标记不动;⑤清标记抛错不影响 update 返回 `{ok:true}`。
- **验收判据(真机)**:与 L5 合并验收。

#### L5 · UI:LoopCard 草稿徽章 + 批准/驳回动作行 + 空态文案提 CLI

- **依赖**:L4(draft 字段契约)。
- **一句话目标**:`row.draft === true` 时:卡头渲染「agent 草稿 · 待你审阅」徽章(蓝,`color-mix` 派生,决议 #9)+ 卡尾动作行「✓ 批准并启用」(POST `/api/loops/update` `{status:'active'}`)与「✕ 驳回(转暂停,现场保留)」(同端点 `{status:'paused'}`),动作成功后显式重拉 loops 快照(nonce 模式对齐 T8 rdNonce 先例,**不轮询**,G22 纪律),失败复用既有 `loop-reject` 反馈条;草稿态不禁用既有字段编辑(demo 语义:先调整后批准);空态文案 `lp_empty_go`/`lp_empty_note` 补一句 `pipeline loop init` 提法(对齐 demo「提案注」,agent 手写 YAML 路径措辞保留)。动作文案与 demo 逐字对齐(「批准并启用」「驳回(转暂停,现场保留)」),是审阅面动作,不是四动作模型第五种(决议 #13 边界,T7 已登记)。
- **涉及文件**:`packages/dashboard-app/src/workbench/LoopCard.tsx`、`packages/dashboard-app/src/workbench/LoopCard.test.tsx`、`packages/dashboard-app/src/i18n/translations.ts`(尾部追加)、`packages/dashboard-app/src/styles.ts`(尾部追加)。
- **server-cli-kernel 是否涉及**:否(纯前端消费 L4 契约)。
- **TDD 测试要求**:①`draft:true` 渲染徽章+两动作钮,`draft:false` 双双不渲染(既有卡零回归);②批准点击 → fetch 断言 POST body `{id, status:'active'}` 形态(对齐既有 update 调用形状)→ 成功后重拉(fetch 调用次数);③驳回同款断言 body `{status:'paused'}`;④动作失败(fetch 拒)→ `loop-reject` 反馈渲染,不清徽章;⑤草稿态字段编辑+保存链路既有测试全绿(不禁用);⑥空态文案含 `pipeline loop init` 字样;⑦busy 期间双钮 disabled(防双发,对齐既有 levelBusy 先例)。
- **验收判据(真机)**:8799 演示环境播种一个草稿 loop(用 L3 的 CLI 真跑)→ 工作台 Loop 卡见徽章;点批准 → loops.yaml `status` 真变 `active`(cat 落盘验证)+ 徽章消失 + drafts.json 该 id 消失;再播种一个,点驳回 → 保持 paused、徽章消失、字段现场保留;无 loop 项目空态见 CLI 提法。

---

## 四、波次编排

三连门口径沿 v6:每波末 `npm run build && npm run build:web && npm run build:server` + `npm test` + `npm run test:web` + `npm run typecheck:web`(先 build 再测,踩坑#1)。

| 波次 | 任务 | 说明 |
|---|---|---|
| **Wave 1** | L1 ∥ L2 | kernel 两模块不同文件;`loops/index.ts` 导出各自尾部追加,波末双保留合并 |
| **Wave 2** | L3 ∥ L4 | 均依赖 Wave 1 的 kernel 导出(波首先 build kernel);L3 改 cli 两文件,L4 改 server 两文件 + client.ts 一行,零交集 |
| **Wave 3** | L5 | 依赖 L4 契约;translations/styles 本轮唯一写者,无合并冲突预期 |

**热点文件纪律**:`kernel/src/loops/index.ts`(L1/L2 尾部追加双保留);其余文件本计划内均单写者。`api/client.ts` 仅 L4 一行类型镜像。

---

## 五、红线复述

| 决议/纪律 | 对本计划的约束 |
|---|---|
| 决议 #3(模板新建全不做) | L3 推导规则表是**单一推导逻辑**不是模板库:无「选一个模板」交互,默认值全部由 risk/id/workflow 结构推导——不得演变成预置卡选择器(Demo2-C 红线);向导问答不得出现「套用示例配置」措辞 |
| 决议 #8(阶段/相位) | 向导问答、stdout 指引、LoopCard 新文案全用「阶段」 |
| 决议 #9(color-mix) | L5 草稿徽章蓝从既有 token 派生,禁新原色 |
| 决议 #13(四动作口径) | 批准/驳回是审阅面动作(T7 既有登记),不复用 TaskDetail 四动作插槽 |
| 决议 #14(runner 不收紧) | L3 非 enum runner 不拦不改,软警告口径与观察项②逐字一致语义 |
| autonomy_level 旁路禁区 | L1/L3 不写该字段;升降档唯毕业制(P5) |
| G22(不轮询) | L5 动作后显式重拉,禁 setInterval |
| init.ts WARN 铁律 | L3 标记写失败只 WARN 不让成功的登记失败 |
| 凭证红线 | 本计划不触碰凭证;drafts.json 只存 id 列表 |
| 推送红线 | 全程不 push |

---

## 六、范围外登记(YAGNI)

| 项目 | 为什么不做 | 重开条件 |
|---|---|---|
| loops schema 必填面松绑 | 第二节评估:向导推导满足全部必填面,松绑另有旧表兼容风险 | 照抄 v6 YAGNI:用户仍反馈体验差 + 完成向后兼容评估 |
| 收件箱收「loop 草稿待批」事项 | 能力面模型「收件箱只收能拍板的事」字面上覆盖,但收件箱现契约是 change 生命周期事项;扩到配置面事项是新语义,需拍板 | 用户看过 LoopCard 徽章审阅流后,仍要求草稿进收件箱聚合时,先拍板收件箱契约扩面 |
| agent 手写 YAML 的草稿自动识别 | 无标记则无徽章(降级:loop 照常显示、照常可审),推断「哪个 paused loop 是草稿」必然臆造 | 出现「agent 绕过 init 手写导致审阅遗漏」的真实反馈时,评估 SessionStart/hook 侧提示(不做运行时猜测) |
| runner 凭证探测反向建议(「只有凭证已配的 runner 给推荐标记」) | UX §2.1 的远期建议;向导侧引 readiness 探测会把 CLI 拖上 docker/secrets 依赖 | 用户在向导里选错 runner 造成真实返工时,复用 T4 readiness 端点数据(CLI 侧仍不依赖 automation) |
| Demo2-B 完整向导 UI(dashboard 内多步表单) | Demo2-B 是兜底方案,未拍板落地;终端向导已覆盖「无 agent 会话」场景 | 出现「完全不用终端」的用户角色(同 v6 YAGNI 原文条件) |
| `pipeline doctor` afk:*/loop:* 扩展 | 维持 v6 拍板(session-start 指向 dashboard,不扩 doctor) | 同 v6 YAGNI 原文 |
| init 代写 design_doc 文档骨架 | init 是登记动作不是内容生产;代写空骨架是假产出 | 用户反馈 design_doc 路径悬空造成困惑时,评估「提示 agent 补写」文案强化(仍不代写) |

---

## 七、风险与未决

- **窄 YAML 写回限制**:`formatString` 拒双引号/控制字符——goal 含 `"` 时 init 如实报错(与 update 端点同语义)。向导交互态在输入时即时校验提示,不留到落盘才炸。
- **drafts.json 与 loops.yaml 漂移**:人工删 loops.yaml 条目后标记残留——L4 已定「仅现有行判 draft」不产幽灵行;残留标记的惰性清理(snapshot 时顺手清)**不做**(写放大 + 快照读路径引入写副作用),登记观察。
- **`.alias('loop')` 命令面**:commander alias 与既有命令无冲突(全量命令名已核:无 `loop` 单数);help 文案里双名并存,以 `loops` 为主名。
- **并发 init**:两个终端同时 init 同 id——`wx` 创建互斥 + 追加路径 CAS 比对,双双如实拒绝;不做锁文件(YAGNI,CAS 已够)。
- **交互向导的测试面**:readline/promises 的注入测试若不稳,回退「向导函数纯逻辑单测 + 非 TTY 默认路径集成测试」组合(L3 任务书已写明替代口径,不算偏离)。
- **观察项②联动**:LoopCard runner 软警告(观察项②)与 L3 stderr 警告是同一语义两处呈现;若观察项②评审后文案调整,L3 实施时以当时已合入文案为口径对齐。
