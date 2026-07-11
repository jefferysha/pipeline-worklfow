# 方案设计:Loop 三方关系可视化 + AFK Docker 镜像/凭证管理

> **状态**:待拍板,本轮不实现(纯设计文档)。
> **覆盖范围**:验收反馈第 8 点(loop 三方关系与字段来源不清)、第 9 点(docker 镜像下拉 + API key 凭证管理),并接线用户补充的「AFK 首跑就绪探测」需求。
> **写法约定**:每个决策点给「推荐方案 + 备选 + 理由」;事实引用一律 `file:line`,以本次通读代码得到的现状为准,不臆测。
> **红线复述**(违反 = 方案作废):key 绝不落仓库内文件(`.pipeline/` 在仓库内,凭证不能碰);凭证值不进日志;禁画布库(@xyflow 已移除);新色一律 color-mix 派生;loop 健康度环/台账/漂移检测/模板新建**全不做**——下文任何方案疑似触线会显式标注,不会绕过不提。
> **不在本文档范围**:不实现 `v6-config-copilot.html` demo 本身(demo 是独立的视觉/交互探索产出,本文档只钉住它需要的数据面/端点契约,不重复设计视觉);不做 Keychain 作为默认存储(只登记为可选增强);不改 loops.yaml schema 的必填面(涉及 kernel `validate.ts`/`registry.ts` 的字段级 required/minItems 松绑,若要做需单独拍板并评估兼容性)。

---

## 决策速览

| # | 决策点 | 推荐 | 备选(理由见正文) |
|---|---|---|---|
| A2 | loop 三方关系怎么呈现 | 卡头 root 徽章 + 卡内一条「关系条」(change_prefix→实时匹配 changes 弹层、phases→阶段 chips) | B 静态只读小节(不点开);C 独立关系图(激进,搁置) |
| A3 | 零消费字段(phases/allowlist/state)怎么处置 | 分别给「先补显示管道再重定位」「加免责声明」「转只读展示」三种不同处置,不能一刀切 | 维持现状不动(不推荐,不解决用户疑惑) |
| B1 | 镜像列表数据源 | server 直接 `execFile('docker', …)`,对齐 `afk.ts:257-259` 的 `docker kill` 先例 | 反向依赖 automation 包的 `dockerAvailable`(破坏 server 零依赖纪律,不推荐) |
| B2 | 新增 GET 端点鉴权 | 不要求 token(维持 GET 惯例),但补一道现有 GET 完全没有的 `isLocalHost` Host 头校验 | 零改动比照现有 GET;或反向比照 POST 强制 token(两者理由见正文) |
| B3 | AutomationCard 镜像输入交互 | 原生 `<input list>` + `<datalist>`,值域校验不变 | 自建 combobox 组件(增测试面,不推荐) |
| C2a | 凭证存储位置 | `~/.claude/pipeline-secrets.json`,0600 + tmp+rename 原子写 | macOS Keychain(登记为可选增强,非本轮) |
| C2b | `CODEX_HOME` 要不要进 secrets store | 不进——它是路径不是密钥,现有 host env 透传已工作,无接线缺口 | 也纳入当第三个键(需要为路径开一个"不截断显示"的特例,且极易被 host env 优先级架空,容易造成"改了没生效"的错觉) |
| C2c | `ANTHROPIC_API_KEY` 要不要现在加白名单 | 不加——全链零消费者,加了是摆设字段,违反"每个设置都真实起效" | 若判断有"直接 API key 免 OAuth 登录"的真实需求,与 `pipeline-afk-run.sh` 判断分支一起在同一实现批次做掉,不要分两轮 |
| C3 | `GET /api/secrets` 要不要鉴权 | 不要求 token(同 B2 加 Host 校验即可)——masked 值不可被当凭证使用,敏感度低于已无鉴权的 `/api/snapshot` | 要求 token(更保守,牺牲与其余 GET 的一致性,换取"凭证子系统一律更严"的心智) |
| C4 | 凭证注入优先级 | 宿主 env 显式 > secrets 文件(沿用 `sdk.ts:57` 装配惯例) | 无实质备选,方向业界惯例明确 |
| C5 | 凭证 UI 归属 | 独立「凭证」卡(机器级徽章),不塞进 AutomationCard | 并入 AutomationCard 分组(不推荐,dirty/保存语义会与逐键写入的凭证冲突) |
| D | AFK 首跑就绪探测 | 新端点 `GET /api/afk/readiness?root=`;`session-start.sh` 保持轻量静态提示,不做真探测 | `session-start.sh` 也做真 docker 探测(不推荐,两份探测逻辑易漂移出不一致口径) |

---

## A. 第 8 点:loop 三方关系

### A.1 现状问题

- Loop 登记在 `.pipeline/loops.yaml`,per-root 文件(`packages/kernel/src/loops/registry.ts:352`),无跨 root 结构;dashboard 的"全部 loop"视图是 server 对机器级注册表里每个 root 各跑一遍 `loadRegistry` 再拼扁平行(`packages/server/src/loops.ts:121-152`)。
- loop → change 的**唯一**关联机制是 `change_prefix` 字符串前缀匹配——`openspec/changes/` 下目录名 `startsWith(change_prefix)` 即归属该 loop,纯业务约定,不是外键,系统从不校验"这个前缀匹配到的 change 是不是真的该属于这个 loop"。消费方四处:
  - 在途计数 `countInFlight`(`packages/kernel/src/loops/enforce.ts:285-303`,配 R11 ship-barrier 对账 :306-309)
  - denylist 归属(`packages/automation/src/lifecycle/denylist.ts:68-72`)
  - runner 归属(`packages/automation/src/lifecycle/runnerFor.ts:23`)
  - readiness 评分里的 `change_prefix` 维度,非空得 5/100 分(`packages/kernel/src/loops/drift.ts` `computeReadiness`)
- `phases` 字段 schema 要求 `minItems:2`(`packages/kernel/src/loops/registry.ts:304`),但全仓零运行时消费者——这次通读进一步核实,它连**展示管道都没有**:
  - `packages/server/src/loops.ts` 的 `LoopRow` 接口(:25-48)完整字段清单里**没有 `phases`**,`buildLoopsSnapshot` 的推送对象(:129-149)也没有把 `loop.phases` 塞进去,尽管 kernel 侧 `LoopEntry.phases`(`packages/kernel/src/loops/types.ts:56`)确实存在这个字段、确实从 yaml 里解析出来了。
  - `packages/dashboard-app/src/workbench/LoopCard.tsx` 的编辑草稿 `LoopDraft`(:36-53)同样没有这个字段。
  - 全仓唯一出现 `phases` 三个字母的用户可见位置,是 `LoopCard.tsx:321` 空态教学文本里的示例 yaml 片段(`phases: [build, verify]`)——纯教人怎么写,写完之后这个值再没有任何代码路径读过它,dashboard 卡片上也永远看不到。
  - `state` 字段类似但不完全一样:它同样不在 `LoopRow`/`LoopDraft` 里(登记必填但卡内不可编辑),但它的值间接影响 readiness 的 observability 子分(`design_doc` 与 `state` 各贡献 5/10 分,drift.ts 的 `computeReadiness` 接收完整 `LoopEntry`,不是裁剪过的 `LoopRow`)——不过**实际读取 run-log 用的路径是硬编码常量** `.superpowers/loops/progress.md`(`packages/server/src/loops.ts:60-66`、`packages/cli/src/commands/loops.ts:96-101`),`state` 字段的具体字符串值从不被用来定位文件,只被用来"是否非空"这一件事打分。
- `PATCHABLE` 字段集合(`packages/kernel/src/loops/update.ts:25-29`)证实了同一件事:`phases`、`state` 都不在可 patch 清单里(标量:`cadence/goal/design_doc/change_prefix/risk/status/runner`;budget 四项;数组:`human_gates/kill_criteria/allowlist/denylist`),它们是"登记必填但卡内不可编辑"的注册面字段,连 UI 想做都做不了,除非先扩这个白名单(`phases` 该不该开放编辑是另一个问题,见 A.3)。
- LoopCard 挂在编排页(`WorkbenchView.tsx`,per-root workbench),与阶段编辑区、hook 配置矩阵版式相邻。这个页面此前(v5)刚做完大量「阶段」相关 IA 工作(自定义 workflow 编辑、阶段×hook 矩阵),用户在同一页面先编辑"这个项目的工作流有哪些阶段",往下滚就看到 loop 卡——版式上容易让人以为 loop 是"当前打开的这个 workflow"的附属品,但实际上:
  - loop 是 **per-root**,不是 per-workflow;一个 root 下可以有多个自定义 workflow(`GET /api/workflows?root=` 列出的非 default 集合,`packages/server/src/server.ts:464`),loop 的 `change_prefix` 匹配完全不检查某个 change 走的是哪个 workflow。
  - 一个 loop 可以在很长时间跨度里持续产出很多个 change(`cadence` 每次到点、`enqueue` 一次都可能是新 change),不是"一个 loop 对应一个 change"的一对一心智。

**结论**:用户"三方关系不清"精确对应三件没有在 UI 上出现的事——① loop 的作用范围是 root 级还是 workflow 级;② `change_prefix` 实际匹配到了哪些 change(会动态变化,现在完全看不到,想验证"这个 loop 有没有意外多吃/少吃 change"只能去翻文件系统);③ `phases` 字段的存在与其"零效力"的事实(填了跟没填一样,但用户不知道,还得受 schema `minItems:2` 强制填写)。

### A.2 IA 方案

三方案均需回应用户原话四要素:root 徽章 + 关系条(change_prefix→匹配 changes / phases→阶段 chips)+ 讲清"一个 loop 可产出多个 change、跨 workflow" + 与字段来源标注联动。

#### 方案 A(推荐)—— 卡头徽章 + 内嵌关系条

在 `LoopCard.tsx` 现有卡头(`wb-editor-head lp-head`,含标题/dirty 态/保存钮,:118-128)与编辑区之间,插入一条新的横向"关系条"(浅底色,类比 Trellis 卡片的 meta/breadcrumb 行,不是新组件类型,是现有卡片内的一个新分组,复用 `lp-policy`/`wb-ed-sec` 一类既有分组样式纪律):

```
[root: pipeline-worklfow]  ·  change_prefix "rl-" → 命中 3 个 change(点开清单)  ·  阶段: [build] [verify]
```

- **root 徽章**:纯前端渲染,数据来自 `LoopRow.root`(已存在,零新增)。多项目场景下告诉用户"这一整张卡片只对这一个项目生效"。
- **change_prefix → 匹配 changes**:点击展开一个列表(复用 `LoopCard.tsx:4` 已导入的 `Dialog` 组件——L3 升档确认已有先例用它,不新增交互组件类型),列出当前真实匹配该前缀的 change 名字。若 `change_prefix` 为显式 `null`(`LoopCard.tsx:81-83` 允许 null↔空串互转),关系条改显示"未设置 change_prefix——不归属任何 change,在途计数/denylist/runner 归属均不生效",直接把 `enforce.ts` 的"缺失后果"翻译成人话,呼应 A.1 里"填错真出事"的字段。
- **phases → 阶段 chips**:纯展示 chip,不做点击语义(跳转到编排页对应阶段属于加分项但不是本方案下限,原因见下方"数据管道")。
- 展示的是**已保存真值**的匹配结果,不随 `change_prefix` 编辑草稿实时重算——草稿可能是打字打到一半的半成品前缀,实时按草稿重算容易造成"数字疯狂跳动"的困惑;保存成功后随 `LoopRow` 整体刷新自然更新,与 `AutomationCard` 现有"draft vs settings 两态、保存后 GET 回读"模型(`AutomationCard.tsx:38-44,81-91`)完全一致,不需要新发明状态管理。

**数据管道**(若拍板,预估改动面):
1. `matched_changes: string[]` 加进 `LoopRow`(`packages/server/src/loops.ts:25-48`),`buildLoopsSnapshot` 内对每个 loop 现读一次 `openspec/changes/` 目录。实现直接镜像 `packages/cli/src/commands/loops.ts:94-115` 的 `REAL_LOOPS_FS.listChanges`(`readdirSync` + 过滤目录名 `startsWith(prefix)` 且排除 `archive` + 排序),而不是跨包 import——对齐 `automationConfig.ts` 头注释定的"server 对其他包零运行时依赖,各自镜像小段逻辑"纪律(`packages/server/src/automationConfig.ts:15-19`)。按当前仓库现实规模(<50 change,决议 #11 认证的量级),每次 snapshot 请求现扫一次目录的成本可忽略,不需要缓存。
2. `phases: string[]` 加进 `LoopRow`,直接从 `loop.phases` 透传(kernel `LoopEntry` 早已有这个字段,只是没人接线)。不需要进 `LoopDraft`(phases 不可编辑,只读展示不需要草稿)。

**为什么不是别的方案**:改动面集中(`LoopCard.tsx` 一处 + `loops.ts` snapshot 扩展),不新增可视化组件类型,不违反决议 #1(画布库)也不越界决议 #3(健康度环等仍不做——关系条是"数据关系澄清",不是"健康度评分",两者性质不同);复用现有 `Dialog`,交互模式在本卡片已有先例,不增测试面。

#### 方案 B(备选)—— 静态只读小节

仿照卡片内现有 `lp-policy` 分组模式,新增一个只读小节"关联"(标题 + 三行:根项目/前缀匹配/阶段引用),匹配 changes 直接列出前 N 个名字 + "共 M 个",不做点开弹层。

- **优点**:实现最简单,不引入"点开"这类新增交互面,测试成本最低。
- **缺点**:changes 多起来(几十个)列不下;而且"点开看全部"恰好是用户会想要的诊断动作(验证"这个 loop 是不是意外匹配了不该匹配的 change"),不点开就只能靠猜——这正是当前问题的一部分,不点开等于没解决。

#### 方案 C(备选/搁置)—— 独立关系图

用 flex/inline-SVG(决议 #1 红线:不能用画布库)画一个三节点关系图:Loop → change_prefix(带匹配数气泡)→ workflow 阶段序列。

- **不推荐作为默认**:决议 #3 明确"健康度环/台账/漂移/模板新建全不做",关系图虽不完全等同"健康度环",但这类新可视化组件的实现/测试成本明显高于方案 A 的一条关系条,而用户第 8 点反馈的核心诉求是"讲清楚关系"而非"要一张图"。若 `v6-workbench-flow.html` 的"流程即真相"方向(顶部大流程带 + 真实计数点)最终拍板落地,这里可以直接复用其节点渲染逻辑做一个迷你版,不必现在重新设计——先用方案 A 验证"讲清关系"这个目标是否已经够用,不够用再升级。

**与 v6-config-copilot demo 联动**:关系条与"字段来源徽章"(见 A.3)是两个独立但呼应的 UI 元素——关系条讲"这个 loop 的产出范围",字段来源徽章讲"每个字段该找谁要值"。本文档 A.3 的表格给徽章内容定调(哪个字段该标"agent 生成"/"系统推导"/"人拍板"),具体视觉呈现(徽章长什么样、放在字段哪个位置)留给 demo 方案 A(终端生成、UI 审阅)选型决定,这里不重复设计。

### A.3 字段来源重定义表

消费层级定义:**硬消费**=填错/漏填会直接改变系统行为(kill/拦截/分流);**软消费**=只影响 readiness 评分或告警(warn),不阻断任何操作;**零消费**=当前无任何代码路径读取该值。

readiness 100 分的精确权重(`packages/kernel/src/loops/drift.ts` `computeReadiness`,供下表引用):goal 20(≥30 字符满分/10-29 得 12/>0 得 6/0 分)、kill_criteria 20(≥2 条满分/1 条 12/0 分)、human_gates 20(同 kill_criteria 计分规则)、budget 15(runs+in_flight 齐全 10 + 声明 token 上限再加 5)、cadence 10(有限值满分/continuous 得 6/缺失 0 分)、change_prefix 5(非空满分)、observability 10(design_doc 5 + state 5,各自 ≥2 字符满分)。

| 字段 | 消费层级 | 运行时消费方(file:line) | 推荐生产者 | 处置建议 |
|---|---|---|---|---|
| `status` | 硬 | kill-switch,`enforce.ts:186-187`(paused/retired 判 kill);`status-drift`(`drift.ts:252-258`) | 人拍板 | — |
| `change_prefix` | 硬 | 在途计数/ship-barrier(`enforce.ts:285-309`)、denylist 归属(`denylist.ts:68-72`)、runner 归属(`runnerFor.ts:23`)、readiness 5 分 | 系统推导默认值(如 `${id}-`),人可覆盖 | — |
| `runner` | 硬 | codex 分流入口(`runner/runner.ts:119`)、凭证白名单透传的判据(`dockerRunChange.ts:135-138`) | 人拍板(决定沙箱内跑哪个 agent、决定凭证边界) | — |
| `cadence` | 硬 | R9 停摆检测(`enforce.ts:220-222`)+ readiness 10 分 | agent 建议初值,人拍板 | — |
| `budget.max_runs_per_day` | 硬 | R2 kill / R3 80% 减速线(`enforce.ts:192-194`) | 人拍板(资源/成本控制,不该让 agent 给自己定额度上限) | — |
| `denylist` | 硬 | `cli afk.ts:133-134` `resolveDenylist` → `dockerRunChange.ts:129-131` 每 run 现读,结算时 `git diff --name-only` 匹配,违规判 conflict | agent 生成候选(它知道哪些文件敏感),人确认 | — |
| `autonomy_level` | 硬(独立端点) | `POST /api/loops/level` → `applyLevelChange`;调度器分级落态 `settleSuccess`(`scheduler.ts:132`) | 人拍板(唯一即时生效字段,风险最高;既有决议:升档确认 Dialog、降档直发) | — |
| `goal` | 软 | readiness 20/100 分 | agent 生成初稿,人审阅 | — |
| `human_gates` | 软 | readiness 20/100 分 | agent 生成候选,人拍板(人工介入点该由人确认) | — |
| `kill_criteria` | 软 | readiness 20/100 分;判据本体是 enforce 硬编码 R1-R11(阈值常量 `enforce.ts:31-40`),字符串本身不被解析执行 | agent 生成候选,人确认口径 | UI 显式提示"这是给人看的文档化判据,不是可执行规则"——现在没有任何地方讲这件事,容易让用户以为写了就真的会被拦 |
| `design_doc` | 软 | readiness observability 子分(5/10) | agent 生成(它本就在写这份文档) | — |
| `risk` | 软 | 仅 cost 估算预设(`kernel/src/loops/budget.ts:31-32,181-183`) | 人拍板(3 档单选,认知负担低) | — |
| `budget.max_in_flight` | 软(仅 warn,R8 不在 KILL_RULES) | `enforce.ts:212-213` | 系统推荐默认(1),人可调 | — |
| `budget.max_tokens_per_day` | 软(可选熔断) | `budget.ts:119` `computeBudgetStatus` | 系统按 risk 档推导默认,人可调 | — |
| `budget.on_exceed` | 声明面,调度器不硬消费,仅报表回显(`cli loops.ts:273`) | — | 系统默认(`skip`) | UI 加提示"当前只影响报表展示,不改变调度器行为",避免用户以为选了 `pause` 就真会暂停 |
| `allowlist` | 零(存储侧;语义 = L3 免审自动合并许可范围,`automation/src/types.ts:78`;kernel 侧注释"执行面另落",`kernel/src/loops/types.ts:65`) | 无 | — | 标注"预留字段,当前无运行时效果"disclaimer;执行面是新功能,超出本文档"讲清关系"范围,值得单独立项 |
| `phases` | 零(全仓无消费者,且现未透传进 dashboard) | 无 | agent/系统(workflow 阶段多选) | 优先补显示管道(见 A.2 数据管道),但先不要求它有运行时效力——定位为"文档性声明:该 loop 主要在哪些阶段活跃",不承诺拦截语义;是否收紧成"必须是该 root 某个 workflow 真实 step id"是后续可选的 kernel 校验升级,不在本文档拍板范围 |
| `state` | 零效力(登记必填,声明用;readiness 贡献 5 分,但字段**值**本身不被用于定位文件——实际读取路径硬编码 `.superpowers/loops/progress.md`,`server/loops.ts:60-66`、`cli loops.ts:96-101`) | 无(硬编码路径本身即唯一真值) | 系统固定值 | UI 改为只读展示"约定路径"文案,不再假装它是可编辑的自由字段 |
| `id` / `name` / `kind` | 登记面,仅 schema 校验(`registry.ts:296-298`) | — | 人/agent 命名 | — |

---

## B. 第 9 点:docker 镜像下拉

### B.1 端点设计——`GET /api/docker/images`

- **无需 `root` 参数**:docker 镜像是单机资源,不像其余大多数 GET 端点那样按项目 root 隔离——这是对现有"GET 均带 root 信任锚"惯例(`server.ts` 校验顺序注释,GET `/api/automation`/`/api/hooks` 等)的一处刻意偏离,原因是数据本身的作用域就不是 per-root 的,不是遗漏。副作用是天然更安全:端点不接受任何请求参数,没有输入校验面,也没有 root 信任锚 404 分支要写。
- **命令**:`docker images --format '{{.Repository}}:{{.Tag}}'`,过滤掉 repository 或 tag 为 `<none>` 的行(build 中间层产生的悬空镜像,不是可用的镜像引用,列出来只会让用户误选)。
- **实现**:server 直接 `execFile('docker', [...], { timeout: 5000 }, callback)`,对齐 `packages/server/src/afk.ts:257-259`(`cancelAfkRun` 里的 `execFile('docker', ['kill', sandbox], () => resolve())`)——这是全仓**唯一**现存的 server 端 docker 调用,证明"server 直接碰 docker 二进制"不是新模式,只是这次换成了一个只读子命令。`packages/server/src/afk.ts:15-19` 头注释明确"server 对 automation 包坚持零运行时依赖",所以本端点**不能**导入 `packages/automation` 的 `dockerAvailable`/`runMinimalContainer`(`packages/automation/src/runner/docker.ts:18-25`)——即便那边现成有一个语义几乎一样的探针,也要在 server 内新写几行 `execFile`,这是当前架构的既定代价,不是本方案引入的新负债。
- **超时**:5s(`execFile` 的 `timeout` 选项),超时/非零退出/spawn 失败(如本机压根没装 docker 命令)统一收敛为 `available:false`,不抛 500——"没装 docker"是环境的正常状态,不是服务器错误,这与 `readAutomationSettings` 缺文件/损坏时 fail-open 回默认值(`automationConfig.ts:54-72` 头注释"缺文件/损坏 → 全默认")是同一种设计姿态的延伸。
- **响应形状**:
  ```jsonc
  // 可用
  { "ok": true, "available": true, "images": ["sandcastle:local", "sandcastle:test", "node:20-alpine"] }
  // 不可用(docker 未装/daemon 未起/探测超时)
  { "ok": true, "available": false, "images": [] }
  ```
  `ok:true` 在不可用时依然成立(不是 4xx/5xx)——docker 可用性是环境事实,不是这次 HTTP 请求本身的失败;这个约定 UI 侧不需要走 `.catch` 错误分支,直接读 `available` 字段判断降级即可,和 `available` 字段的既有用法(`docker.ts:18` 已有同名概念)保持语义一致。

### B.2 鉴权归类

这是一个需要摊开讲的安全判断,因为它牵出一个现有代码里从未被讨论过的事实:

- **现有 GET 端点全部没有 DNS-rebinding Host 头校验**。`isLocalHost` 守卫(`server.ts:88-95`)目前只在 `handlePost`(`server.ts:505`)与 `handleDelete`(`server.ts:869`)里被调用;`handleGet`(`server.ts:301` 起)整个函数体内**零次**调用 `isLocalHost`。也就是说,任何能让受害者浏览器发出跨源 GET 请求的恶意网页,理论上已经可以"盲触发"(读不到响应体,因为 server 零 CORS 头,跨源读取会被浏览器同源策略挡住,但请求本身会真实发出并执行)现有全部 GET 端点,包括 `/api/snapshot`(吐出全部注册项目的完整 pipeline 状态)。这是既有架构的既定选择,不是本方案发现的漏洞——现有 GET 端点全部只读文件/内存状态,没有副作用,盲触发的实际危害趋近于零。
- **新增的两个 GET 端点(本节 + D 节)是全仓首批会从 GET 路径 `execFile` 本机二进制的端点**。虽然 `docker images`/`docker info`/`docker image inspect` 都是只读、无副作用的子命令,盲触发的实际危害同样趋近于零(不会修改任何状态,唯一"成本"是让本机 docker daemon 多响应一次查询),但"GET 触发子进程执行"在类别上确实比"GET 读一个 JSON 文件"多了一层机制,值得比照既有 GET 端点多一道防线,而不是简单地说"反正现有 GET 都没鉴权,这个也不用"。

**推荐**:两个新端点都不要求 Bearer token(维持 GET 一贯的免鉴权体验——dashboard 客户端现有 GET 封装,如 `fetchLoopsSnapshot`/`fetchAutomationSettings`,`packages/dashboard-app/src/api/client.ts:243,321`,均只带 `Accept` 头、不带 `Authorization`,新增一个要求 token 的 GET 需要专门给它绕开这层封装,徒增实现复杂度换来的安全收益也存疑),但补一道 `isLocalHost` Host 头校验(复用 `server.ts:88-95` 现成的函数,`handleGet` 分派到这两个新路径前多一行 if)。理由:响应内容本身不含敏感值(镜像标签列表、三个布尔就绪灯),泄露的严重度不高于已经无鉴权的 `/api/snapshot`;但既然要新开一个"会执行本机命令"的口子,顺手把 Host 校验补上成本几乎为零(几行代码),换来的是这两个新端点比其余纯读 GET 端点更不容易被跨源滥用,且**不破坏**"GET 不用管 401"的现有前端心智。

**备选 1**:完全比照现有 GET,零改动、不加 Host 校验。更简单,但会让"新端点比老端点更松"这个说法反过来成立(老端点至少是纯读无副作用,新端点是执行子进程),不推荐,除非用户认为这层区分没必要。

**备选 2**:要求 Bearer token,比照 POST 的严格度。最保守,彻底堵死盲触发,但会破坏当前"GET 免鉴权、POST 才要 token"这条贯穿全仓路由表的一致规则(`server.md` 路由表逐条印证),前端也要为这两个端点单独接入 token 逻辑(目前所有 GET 请求助手都没有这段代码)。仅当用户认为"哪怕是执行只读 docker 命令也不该被任何未认证请求触发"时才考虑。

### B.3 AutomationCard 集成

当前实现是纯文本框(`AutomationCard.tsx:180-194`):`<input>` 手输镜像名,`placeholder="sandcastle:local"`,值域校验走 `automationConfig.ts:42` 的 `IMAGE_RE = /^[a-zA-Z0-9._/:@-]+$/`(POST 时 server 侧强制校验,`automationConfig.ts:79-101`)。

**推荐**:给现有 `<input>` 加一个 `list="afk-image-options"` 属性,同时渲染一个 `<datalist id="afk-image-options">`,选项来自 `GET /api/docker/images` 返回的 `images` 数组(仅当 `available:true` 时渲染 datalist;`available:false` 时不渲染,`<input>` 退化回今天的纯文本框行为,零视觉/行为差异)。这是 HTML 原生的"下拉 + 手输兼容"控件——用户可以从下拉选,也可以无视下拉建议直接打字(镜像可能还没 build 出来,用户想先填个未来要用的 tag 名),原生 `<datalist>` 不会限制输入值必须在选项列表内,现有的 `IMAGE_RE` 校验逻辑完全不用动(不管值是选出来的还是打出来的,校验路径一样),后端 `automationConfig.ts` 零改动。

**为什么不是自建 combobox 组件**:原生 `<datalist>` 是零依赖、零新增测试面(不需要为下拉展开/收起/键盘导航/点击外部关闭这些行为单独写测试,浏览器原生实现);自建组件能做更多定制(比如给每个选项加图标标注"这是当前配置的镜像"),但这类定制属于锦上添花,不该成为默认方案的门槛。

**降级路径**:`GET /api/docker/images` 请求失败(网络错误/404/超时)或返回 `available:false`,AutomationCard 一律渲染当前样式的纯文本输入框,不阻塞卡片其余部分渲染——对齐 `AutomationCard.tsx` 头注释既有的"诚实占位,不谎报可配"纪律(:14)。

---

## C. 第 9 点:凭证管理

红线复述:**key 绝不落仓库内文件**(`.pipeline/` 在仓库内);**值不进日志**。

### C.1 现状缺口(已用代码验证)

- **claude-code 路径彻底没接线**。`CLAUDE_CODE_OAUTH_TOKEN` 的唯一注入通道是 `createDockerRunChange` 的 `extraEnv` 选项(`packages/automation/src/sdk/dockerRunChange.ts:48-49` 声明"真部署接线:CLAUDE_CODE_OAUTH_TOKEN / ANTHROPIC_BASE_URL 等"),而 `lifecycle.ts:202-204` 确认合并顺序是 `{ ...cfg.extraEnv, [PIPELINE_AFK_ENV]: '1' }`——`extraEnv` 可以塞任何键(除了 `PIPELINE_AFK` 本身不可覆盖,硬护栏优先)。但生产唯一调用点 `packages/cli/src/commands/afk.ts:139` 的 `createDockerRunChange({ hostRepoDir: deps.cwd, base, level, image, store: deps.store, resolveDenylist, resolveRunner })` **没有传 `extraEnv`/`hostEnv` 任何一个**——即便用户把 token 导出到了运行 `pipeline afk run` 的那个 shell 环境里,这个值也从来没有被读取、更没有被转发进容器。沙箱脚本(`tools/sandcastle/pipeline-afk-run.sh:66`)按 `[ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ] && command -v claude` 判空,拿不到就静默回落"确定性模式"(脚本头注释 :5-8 讲的两种模式)——不是报错,是悄悄降级成不跑真 agent,用户不容易第一时间发现。
- **codex 路径靠宿主 env 白名单,已经真实工作**。`dockerRunChange.ts:97-103` 的 `codexCredentialEnv` 只从 `hostEnv`(缺省 `process.env`,:94)挑 `OPENAI_API_KEY`/`CODEX_HOME` 两个键,且仅当该 change 解析出 `runner === 'codex'` 才透传(:135-138)。`CODEX_HOME` 不止进 env——`ports.ts:81-91` 按同一绝对路径把该 host 目录 `-v` 挂进容器(env 单独进去只是悬空路径,挂载才让容器内 codex 读到 `auth.json`;相对路径不挂)。这条链路今天只要用户在跑 `pipeline afk run` 的 shell 里 `export OPENAI_API_KEY=...`(或 `CODEX_HOME` 指向已 `codex login` 过的目录)就能工作,**没有接线缺口**。
- **`ANTHROPIC_API_KEY` 全链零引用**——grep 全仓 `packages/**/*.ts`/`*.sh`(排除 `dist/`)零命中,不是遗漏统计,是真的没有任何代码路径读取过这个变量名。
- 凭证值不落日志的纪律已有先例可以延续:`dockerRunChange.ts:90-93` 注释明确"凭证值只进 docker run 子进程 argv(`-e K=V`),不进任何日志/错误消息——错误面(scheduler sanitize / startContainer throw)只引用 stderr 片段,不回显 argv"。

### C.2 存储设计

**位置**:`~/.claude/pipeline-secrets.json`,机器级,与既有机器级文件同一目录——`~/.claude/pipeline-projects.json`(项目注册表)、`~/.claude/.pipeline-dashboard-token`(server token,0600)——都经 `resolveServerPaths()`(`packages/server/src/paths.ts:9-19`)统一解析,支持 `PIPELINE_DASHBOARD_HOME` 环境变量覆盖(仅供 hermetic 测试隔离,生产不设即原行为,:2-3 头注释)。推荐把新路径纳入同一个 `ServerPaths` 接口(`packages/server/src/types.ts:9-18`),加一行 `secretsPath: join(claudeDir, 'pipeline-secrets.json')`,天然复用测试隔离机制,不用另起一套路径解析。

**为什么不放 `.pipeline/`(仓库内)**:直接触红线——`.pipeline/loops.yaml`、`.pipeline/automation.json`、`.pipeline/hooks.json` 都是 per-root 配置,理论上可能被团队 commit 进仓库共享;一旦允许在这些文件里存 key,用户几乎必然会不小心 commit(即使 `.gitignore` 排除,历史上已有 worktree 场景绕过 gitignore 意外入库的真实先例——`.claude/settings.local.json` 曾随 `git add -A` 误入库,收录在本轮执行台账教训清单)。机器级路径在仓库物理边界之外,不存在这一整类风险。

**权限与写入**:
- 0600 权限对齐 token 文件既有先例——`types.ts:15` 注释里 `.pipeline-dashboard-token` 本就标注"B5 一次性 token 握手文件(0600)",实际写入用 `writeFile(tokenPath, payload, { encoding: 'utf8', mode: 0o600 })`(`packages/server/src/token.ts:21`)。
- 原子写对齐 `automationConfig.ts:107-121`/`kernel/src/state/store.ts:34-38` 已确立的"同目录 tmp+rename"范式,而不是 token.ts 那种一次性握手文件的直接写(secrets 文件会被反复读写,需要原子性防止进程崩溃在写一半时留下截断的 JSON)。
- 两者结合:`writeFileSync(tmp, data, { encoding: 'utf8', mode: 0o600 })` + `renameSync(tmp, file)`——POSIX 上 `rename` 保留源 inode 的 mode 位,tmp 文件建时给的 0600 会原样带到目标文件,不需要额外 `chmodSync`。

**schema**:`{ version: 1, keys: { CLAUDE_CODE_OAUTH_TOKEN?: string, OPENAI_API_KEY?: string } }`——白名单只列两个真正的密钥字符串,不是任意 key-value(防止手滑存了不该存的东西,也让 GET 端点能按已知键给出"per-runner 需要哪些键"的语义)。**`CODEX_HOME` 刻意不在此白名单**,理由见下方决策点 C.2b。

#### 决策点 C.2b:`CODEX_HOME` 要不要进 secrets store

**推荐:不进。** 它是目录路径,不是密钥字符串——语义完全不同:真正的密钥是 `CODEX_HOME` 指向的目录里那份 `auth.json`,由 codex CLI 自己的 `codex login` 流程管理,本工具从未也不该代为存储它;`CODEX_HOME` 只是"告诉容器去哪个目录找它"的一个指针。masked 显示(掐头去尾)对路径没有意义甚至有害——用户需要看到完整路径才能确认自己填对了,截断显示反而帮倒忙。更关键的是,这条链路今天**已经**通过纯 host env 透传工作(`dockerRunChange.ts:100-101`),没有接线缺口需要修。凭证卡对它只做只读探测展示("host 环境变量 `CODEX_HOME`:已设置/未设置",数据来自 D 节的 readiness 端点),不提供编辑入口。

**备选**:也纳入 secrets store 当第三个键,换取"两个 codex 相关配置在同一张卡里都能编辑"的一致体验。代价:masked 逻辑要为"路径类型"开一个不截断显示的特例;且这个设置本质上会被 C.4 的"host env 显式 > secrets 文件"优先级规则架空——用户日常 shell 里如果已经 `export CODEX_HOME=...`,UI 里存的值永远是摆设,容易让人误以为在 UI 里改了就生效。

#### 决策点 C.2c:`ANTHROPIC_API_KEY` 要不要现在加入白名单

**推荐:不加。** 全链零消费者(C.1 已验证),加了存储位但没有代码读它,是纯摆设字段,会让用户以为"我填了这个就该生效"却什么也不会发生——这类"填了没用"的配置面正是第 8 点反馈想根治的问题,不该在第 9 点重新制造一个。

**备选**:若判断"跳过 OAuth 登录、直接用 API key 认证 claude-code"是真实需求(claude CLI 本身确实同时认 `CLAUDE_CODE_OAUTH_TOKEN` 与 `ANTHROPIC_API_KEY` 两种环境变量作为等价认证来源),应该与 `tools/sandcastle/pipeline-afk-run.sh:66` 的判断分支一起在**同一实现批次**补齐(该行目前只判 `CLAUDE_CODE_OAUTH_TOKEN`,需要加一个接受 `ANTHROPIC_API_KEY` 的等价分支),不要分两轮——两轮做的话中间会有一轮"UI 能存但沙箱不认"的空窗期。

**macOS Keychain(登记为可选增强,非本轮)**:本仓已有 `security` CLI 调用先例——`packages/tap/src/certs.ts:430-432`(`macosLoginKeychainPath`)及周边的 `security verify-cert`/证书信任函数,证明 shell 出 `security` 二进制在本仓是已验证可行的模式,且该文件注释持"绝不自动写钥匙串,实际信任由上层显式发起"的克制姿态(:20)——与本方案"密钥写入必须是用户显式动作"的立场一致。若后续要做:用 `security add-generic-password -a $USER -s pipeline-lite-<KEY> -w <value>` / `security find-generic-password -a $USER -s pipeline-lite-<KEY> -w` 存取,好处是密钥不再以明文躺在磁盘 JSON 文件里(OS 级加密),坏处是非 macOS(Linux CI/远程机器)不可用,需要文件方案兜底,两套存储后端会让读取逻辑复杂化(先查 Keychain 再查文件?优先级怎么定?)。建议先用文件方案覆盖全平台把闭环打通,Keychain 作为 macOS 用户的"更安全"选项后续按需加,不阻塞本轮拍板。

### C.3 API 设计

三个端点全走既有 Host + token + JSON 三道纵深(`server.ts:503-517` 的 `handlePost` 头部 / `:867-` 的 `handleDelete` 头部)——这三个端点碰的是密钥值,不能比其余写端点更松。

**`POST /api/secrets`** —— 写(值只进文件)
- body:`{ key: 'CLAUDE_CODE_OAUTH_TOKEN' | 'OPENAI_API_KEY', value: string }`——每次只写一个键,不是整份表覆盖式写(不同于 `POST /api/automation` 的整份 config 覆盖模式)。理由:密钥是敏感值,"设置某个密钥"应该是一个精确、审计友好的独立动作,不该被"整份密钥表覆盖"这种容易带出意外副作用(比如顺手清空了另一个还没填完的键)的模式捆绑。
- 校验:`key` 必须在白名单内(拒绝任意字符串,同 `automationConfig.ts` 校验惯例先拒后写);`value` 非空字符串,给一个宽松的长度上限(如 4KB,纯防御,防止误粘贴大段文本膨胀文件)防御性校验,不对值做格式校验(不同 provider 的 token 格式不同且可能变化,不该在这里假设格式)。
- **不需要 `root` 参数**——机器级资源,这跟其余写端点"root 信任锚是第二道校验"的既定顺序(`server.ts` 注释里的"①name 格式→②root 信任锚→③业务校验→④真读写")不同,文档里需要显式标注这个差异,避免实现时机械套用四步顺序漏掉"这个端点根本没有 root 概念"这件事。

**`GET /api/secrets`** —— 只回掩码,永不回明文
- 响应:`{ ok: true, keys: { CLAUDE_CODE_OAUTH_TOKEN: { set: true, masked: 'sk-…7f3a' }, OPENAI_API_KEY: { set: false } } }`
- masked 规则:`value.length > 10` 时取 `${value.slice(0,3)}…${value.slice(-4)}`(与题面给出的示例 `sk-…7f3a` 逐字符对应:3 位前缀 + 省略号 + 4 位后缀);否则(异常短的值,理论不该发生但要防御)整体显示 `***`,不暴露短字符串的大部分内容。
- 未配置的键:`{ set: false }`,不带 `masked` 字段。

**`DELETE /api/secrets?key=OPENAI_API_KEY`** —— 删单键,同现有 DELETE 惯例(`DELETE /api/projects?root=`、`DELETE /api/workflows/:name?root=` 均用 query string 传参)。

#### 决策点 C.3:`GET /api/secrets` 要不要鉴权

这是本文档里最值得摊开讨论的一个judgement call,因为它触碰"凭证子系统"这个特殊类别,值得比 B.2 的镜像列表端点更谨慎地摆事实。

**推荐**:不要求 token,只加 `isLocalHost` Host 校验(同 B.2)。理由:
1. masked 值本身不可被用作凭证——即便被恶意页面盲触发并设法读到(需要绕过 CORS,现有架构下做不到),拿到的是"前 3 后 4"的片段,不能拿去认证任何服务。
2. 相对敏感度:`/api/snapshot` 已经无鉴权地吐出全部注册项目的完整 pipeline 状态(项目名、goal、change 详情等),`GET /api/secrets` 泄露的信号("这台机器配置了哪个 provider 的凭证")严重度明显更低,却要单独加码鉴权,是不一致的风险姿态。
3. 保持 GET 一贯免鉴权体验,dashboard 客户端不需要为这一个 GET 单独接入 token 逻辑。

**备选**:要求 Bearer token,与三个写端点同等严格。更保守——多数云控制台的"查看掩码密钥"操作本身也挂在登录态之后,不是完全公开的。若团队环境对"凭证子系统"有更高的合规心理预期(哪怕泄露的只是掩码),选这个更容易向使用者解释"这块我们全程都要 token"。代价是打破"GET 不用 token"这条贯穿全仓的一致规则,前端要为这一个端点单独接 `Authorization` 头。

这一条建议用户明确表态,而不是接受本文档的默认推荐——两种选择都站得住,取舍点在于"要不要为凭证子系统单独立一条更严的规矩"。

### C.4 注入链设计

**改动点**:`packages/cli/src/commands/afk.ts` 的 `case 'run':` 分支(当前 :139 调用 `createDockerRunChange` 缺 `extraEnv`/`hostEnv`)。

**责任边界要先讲清楚**:server 只管密钥存储的 CRUD(C.3)与只读探测(D 节),**从不直接经手密钥值流向容器**——server 自己甚至不起容器(全仓唯一 docker 调用是 `afk.ts:257` 的 `kill`,fire-and-forget)。真正的"密钥 → 容器"注入链路完全在 CLI 一侧(`pipeline afk run`,不论由用户手动触发还是外部 cron 触发),这是既有架构(密钥值只进 docker 子进程 argv、不进任何 HTTP 响应)的自然延伸,不是本方案新引入的边界。

**优先级**:宿主 env 显式 > secrets 文件,沿用 `sdk.ts:57` 装配惯例("T21 装配优先级:显式 deps.config > `<root>/.pipeline/automation.json` 的 image > SDK 内置",:61-62 代码印证)。具体到凭证:`afk run` 启动时合并一次 `hostEnv = { ...secretsAsEnv, ...process.env }`(注意展开顺序——JS 对象展开后写的键覆盖先写的,`process.env` 放后面,同名键时进程真实环境变量总是赢过 secrets 文件里的存档值),整个 `run` 调用生命周期内只合并一次,与 `process.env` 本身"读一次、贯穿进程生命周期"的既有语义一致,不引入新的"每次读取都可能不一样"的复杂度。

**修复 claude-code 路径的具体方式**:今天 `dockerRunChange.ts:97-103` 的 `codexCredentialEnv` 只处理 codex 一侧,把"credEnv 按 runner 条件性挑选"这个模式(:89 注释原话"凭证只随点名它的 runner 走")推广成一个覆盖两个 runner 的通用函数——新增 `claudeCredentialEnv` 与 `codexCredentialEnv` 同构,在 `runner !== 'codex'`(即 claude-code / 缺省路径)时从 `hostEnv` 挑 `CLAUDE_CODE_OAUTH_TOKEN`。这不是发明新架构,是把已经写在注释里的设计意图("凭证只随点名它的 runner 走")从"只对 codex 生效"补齐成"对两个 runner 对称生效"——**这正是任务要求的"修复 claude-code token 接线缺口"**。改动集中在 `dockerRunChange.ts` 一处(内部逻辑扩展)+ `cli/commands/afk.ts` 的 run 分支(补一次 secrets 读取 + 合并进 `hostEnv`)。

**值不落日志**:`afk.ts` 合并 `hostEnv` 之后的任何日志输出(比如 `run` 分支末尾现有的 `deps.io.out('AFK run: 跑完一轮...')` 汇总行,`afk.ts:141`)都不能带上凭证值——延续 `dockerRunChange.ts:90-93` 既有纪律("凭证值只进 docker run 子进程 argv,不进任何日志/错误消息"),这条纪律本身不需要新写,只需要新增的 secrets 读取代码不违反它(比如不要为了调试方便打一行 `console.log(hostEnv)`)。

**缺文件处理**:secrets 文件不存在时,`hostEnv` 合并结果等价于纯 `process.env`(即今天的行为,`afk run` 不因为没配置过 secrets 而报错或改变行为)——对齐 `automationConfig.ts` "缺文件 → 全默认"的 fail-open 姿态,这里的"默认"就是"什么都不额外注入"。

### C.5 UI 设计

**归属**:独立「凭证」卡,挂在 `AutomationCard` 之后,卡头标"机器级 · 对本机全部项目生效"(呼应 A.2 关系条里 root 徽章的设计语言,但这里反过来是"全局"徽章,而不是某个 root 的徽章)。

**为什么不塞进 `AutomationCard`**:
1. 交互模式本质不同——`AutomationCard` 是"数值参数,dirty 汇总 → 一次性保存"(`AutomationCard.tsx:74,81-98`),凭证是"逐 key 独立写入/删除"的动作型交互;混进同一张卡片会让"保存"按钮语义混乱(点保存钮时,数值参数走 `POST /api/automation`,但凭证的每个输入框其实该各自独立提交,不该被同一次保存捆绑,否则容易出现"改了并发数、顺手把还没填完的 key 也提交了"的意外)。
2. 凭证是机器级、`AutomationCard` 现有的一切都是 per-root——凭证卡混进 `AutomationCard` 会造成"这是这个项目的密钥还是全局的"的新一轮困惑,恰好是 A 节正在修复的那类"作用范围不清"问题的翻版,不该在新卡片上重新引入。

**UI 要素**:
- **掩码显示、write-only**:输入框默认展示 masked 值(只读态,取自 `GET /api/secrets`),旁边一个"更新"按钮切换成可输入的空白框——即便用户点了编辑,输入框也是空的等重新输入,绝不把已存的明文回填进去;提交成功后变回 masked 只读态(呼应任务描述"保存后 write-only")。
- **按 runner 提示需要哪些键**:凭证卡直接把 claude-code(`CLAUDE_CODE_OAUTH_TOKEN`)与 codex(`OPENAI_API_KEY` + 只读展示的 `CODEX_HOME` host env 状态)两组说明都摆出来,不做"只看当前 root 用到哪个 runner"的过滤——因为凭证是一次配置全局生效,若做过滤,用户切换项目时凭证卡内容会跟着跳动,反而不利于"这是全局设置,与我正在看哪个项目无关"的心智建立。
- **env 变量优先级说明**:卡片内一行小字提示"若你已经在 shell 里设置了同名环境变量,这里保存的值不会覆盖它"(直接讲清 C.4 的优先级规则,避免用户改了 UI 却不生效时排查无门)。
- **就绪灯联动**:凭证卡保存/删除成功后,前端在回调里触发一次 D 节 readiness 端点的重新拉取,让 AFK 执行卡/readiness 面板的"凭证已配"灯立刻反映最新状态,不需要用户手动刷新页面。

---

## D. AFK 首跑就绪探测

### D.1 端点设计——`GET /api/afk/readiness?root=`

三探测对应三灯,`root` 必填(同 `/api/automation`/`/api/hooks` 惯例,信任锚 404 校验)——虽然 docker 可用性与凭证本身是机器级、与 root 无关,但镜像检查需要知道"这个 root 配置的是哪个镜像"(读 `readAutomationSettings(root).image`),为了让端点调用形状与其余带 root 的 GET 保持一致(前端不用记"这一个端点特殊,可以不传 root"),仍要求传入。

**探测 1:docker 可用**——`execFile('docker', ['info'], { timeout: 5000 })`,退出码 0 记 `available:true`,任何异常(非零/超时/命令不存在)记 `false`。与 B.1 共享同一套 `execFile` 封装,不重复实现。

**探测 2:配置镜像存在**——`execFile('docker', ['image', 'inspect', configuredImage], { timeout: 5000 })`,退出码 0 记 `present:true`。`configuredImage` 取 `readAutomationSettings(root).image || 'sandcastle:local'`(空串走内置默认,同 `automationConfig.ts:36` 的既定语义;`'sandcastle:local'` 这个字面量目前已在 `cli/commands/afk.ts:29`、`automation/src/lifecycle/ports.ts:63` 等多处重复出现,这里再加一份同值常量是跟随现状,不需要借此重构成单一来源,超出本文档范围,可选登记为独立 backlog)。**探测 1 失败时短路**——不再浪费一次 5s 超时去跑注定失败的 `image inspect`,直接记 `present:false`。
- 缺失时给一键复制命令:`build_hint: 'bash tools/sandcastle/build.sh'`(`tools/sandcastle/build.sh` 默认 `VARIANT=local`,构建出正是 `sandcastle:local`,:16-21 确认)。

**探测 3:凭证已配(per-runner)**——不依赖 docker,可与探测 1 并行执行(纯文件 + env 读取,无子进程):
- claude-code:检查 `CLAUDE_CODE_OAUTH_TOKEN` 是否在 secrets 文件或 `process.env` 中已设置(不读值,只判空,来源标 `'secrets-file'` 或 `'host-env'`,两者都有时以实际生效的那个为准,即 C.4 的优先级规则)。
- codex:检查 `OPENAI_API_KEY`(同上,secrets 文件或 host env)+ `CODEX_HOME`(纯 host env,因为它不进 secrets store,见 C.2b)。

**响应形状**:
```jsonc
{
  "ok": true,
  "docker": { "available": true },
  "image": { "configured": "sandcastle:local", "present": false, "build_hint": "bash tools/sandcastle/build.sh" },
  "credentials": {
    "claude-code": { "CLAUDE_CODE_OAUTH_TOKEN": { "set": true, "source": "secrets-file" } },
    "codex": {
      "OPENAI_API_KEY": { "set": false },
      "CODEX_HOME": { "set": true, "source": "host-env" }
    }
  }
}
```
永不返回凭证的值本身,只返回 `set` 布尔 + `source` 标签——与 `GET /api/secrets` 的"永不回明文"红线是同一条纪律在两个端点上的一致体现。

**鉴权**:同 B.2 的推荐(不要求 token,加 `isLocalHost`)——理由完全相同,这里不重复展开。

### D.2 `session-start.sh` 的建议:保持轻量,不做真探测

**推荐**:`session-start.sh` 不新增任何 docker 探测逻辑,只在项目已经存在 AFK 相关状态时(如 `.pipeline/automation.json` 存在,或活跃 change 里有 `automation` 字段命中 queued/running)追加**一行静态文案**,提示"AFK 就绪状态见 dashboard",不做真探测。

**理由**:`session-start.sh` 现有纪律非常明确——头注释自陈"纯 bash(SessionStart 低频,但仍守 §5.4 红线:零解释器 spawn,yaml 只 grep 顶层键)"、"任何一步失败静默跳过、绝不阻断会话,exit 恒 0(fail-open——SessionStart 挂了会拖慢/卡死所有会话,宁可放行)"(:8-10)。`docker info` 在 daemon 未启动或正在启动时可能挂起数秒甚至更久,这与 SessionStart 必须又快又不可阻断的定位直接冲突;即便加 `timeout` 包一层,也是在一个刻意保持极简的 pure-bash 脚本里新增一整套探测逻辑,而这套逻辑注定会与 D.1 的 server 端实现出现口径漂移(以后 server 端探测条件改了,sh 版本没人记得同步改)。

**备选**:`session-start.sh` 也用 `timeout 1 docker info >/dev/null 2>&1` 之类的短超时探测做真判断。技术上可行(shell 出二进制不算"解释器 spawn",不字面违反 §5.4),但不推荐——维护两份探测逻辑(sh 一份、server 一份)天然容易漂移出不一致的"就绪"判断,而 SessionStart 的价值本就只是"简短引导",真正的诊断信息(哪个镜像缺、哪个 key 没配)展开需要交互式的 UI(点开 dashboard 看三灯 + build_hint),终端侧塞不下这么多信息,做了也是半成品。

**与 demo 的对应关系**:D.1 的三探测 API 直接对应 `v6-config-copilot.html` 规划中"AFK 就绪探测三灯"这件事的数据来源;D.2 的"终端只给一行静态提示、真正的就绪清单在 dashboard 展开"这个分工,对应该 demo 规划里"首跑旅程"要求明确画出的"终端侧提示与 dashboard 侧引导的分工"——本文档在这里把分工原则钉死为"终端不做真探测",避免 demo 阶段重新纠结这件事该不该在 sh 里做。

---

## 附录:若拍板,预估涉及文件面

仅供评估工作量,不是实现清单,不代表本文档已经在做实现决策之外的事。

**A(loop 三方关系)**:`packages/server/src/loops.ts`(`LoopRow` 加 `phases`/`matched_changes`,`buildLoopsSnapshot` 扩展)、`packages/dashboard-app/src/api/client.ts`(`WbLoopRow` 镜像同步跟进)、`packages/dashboard-app/src/workbench/LoopCard.tsx`(关系条渲染 + Dialog 复用)。

**B(docker 镜像下拉)**:`packages/server/src/server.ts`(新路由 `GET /api/docker/images`)、新文件如 `packages/server/src/dockerImages.ts`(镜像探测的独立小模块,对齐 `automationConfig.ts` 一类"业务逻辑独立同名模块"惯例)、`packages/dashboard-app/src/api/client.ts`(新 fetch helper)、`packages/dashboard-app/src/workbench/AutomationCard.tsx`(`<datalist>` 接入)。

**C(凭证管理)**:`packages/server/src/paths.ts` + `types.ts`(`secretsPath`)、新文件如 `packages/server/src/secrets.ts`(存储 + masking + 校验)、`packages/server/src/server.ts`(三个新路由)、`packages/cli/src/commands/afk.ts`(run 分支读 secrets 合并 `hostEnv`)、`packages/automation/src/sdk/dockerRunChange.ts`(`claudeCredentialEnv` 对称扩展)、`tools/sandcastle/pipeline-afk-run.sh`(若拍板做 C.2c 备选,追加 `ANTHROPIC_API_KEY` 判断分支)、新 UI 文件如 `packages/dashboard-app/src/workbench/SecretsCard.tsx`。

**D(就绪探测)**:`packages/server/src/server.ts`(新路由 `GET /api/afk/readiness`)、新文件或复用 B 的 `dockerImages.ts`/C 的 `secrets.ts`、`hooks/session-start.sh`(静态提示一行)。

