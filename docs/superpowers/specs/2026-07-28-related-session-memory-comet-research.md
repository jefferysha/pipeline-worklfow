# Related Session Memory：Comet 一手来源调研

## 结论

Comet 对 Tenon `related-session-memory` 最有价值的启发，不是直接复用它的状态格式，而是把两个边界钉死：

1. **宿主目标必须显式且隔离。** Comet 在最新 `master` 为 `init` / `update` 增加了
   `--platform`，选中 Codex 时不会顺带改写 Claude 资产；自定义宿主只能在项目作用域创建，
   非法 id、全局自定义目标和 `--platform + --all-projects` 均失败关闭。
2. **工作流恢复状态不等于宿主会话记忆。** Comet 的 Native/Classic 状态可以从项目文件恢复，
   但 `.comet/current-change.json`、`run_id`、checkpoint 和可选 `sessionHash` 都不是可检索的
   Codex/Claude/OpenCode/Pi 会话目录，也没有表达“一个任务关联多个跨宿主历史会话”的契约。

因此，Tenon 应借鉴“显式宿主过滤 + 非目标宿主零副作用 + 歧义失败关闭”，但必须继续以自身
`packages/kernel/src/mem` 的真实宿主会话适配器为数据源。不得把 Comet `run_id`、current selection
或 `sessionHash` 当作相关会话搜索结果，也不应复制 Comet 对未知平台目录/Hook 格式的保守猜测。

## 调研范围与固定版本

读取日期：**2026-07-28**

| 对象 | 固定版本 | 一手来源 | 说明 |
| --- | --- | --- | --- |
| `rpamis/comet` 默认分支 | `master` @ `2945693e4061c369be0d400ed2999a66fa87c680` | [commit](https://github.com/rpamis/comet/commit/2945693e4061c369be0d400ed2999a66fa87c680) · [tree](https://github.com/rpamis/comet/tree/2945693e4061c369be0d400ed2999a66fa87c680) | GitHub 仓库元数据确认默认分支为 `master`；该提交合并 PR #227。 |
| 最新已发布 GitHub Release | `0.4.0-beta.9` @ `84038b0d6b7c185b233f0f36b294ae74dd9121d0` | [release](https://github.com/rpamis/comet/releases/tag/0.4.0-beta.9) · [tag tree](https://github.com/rpamis/comet/tree/84038b0d6b7c185b233f0f36b294ae74dd9121d0) | GitHub Releases API 返回的 latest published release；不是 tag 回退。 |
| release → master 差异 | master ahead 3 commits | [compare](https://github.com/rpamis/comet/compare/0.4.0-beta.9...2945693e4061c369be0d400ed2999a66fa87c680) | 两个文档提交后，新增显式 platform targeting；master 包版本已是未发布的 `0.4.0-beta.10`。 |
| 需求与实现讨论 | Issue #217 / PR #227 | [issue](https://github.com/rpamis/comet/issues/217) · [PR](https://github.com/rpamis/comet/pull/227) | Issue 明确要求 `--platform`、workflow 联动和自定义项目目录；PR 记录实现与回归测试。 |

本调研只使用 Comet 仓库源码、README、GitHub Release、Issue 和 PR。没有使用二手文章，也没有复制
Comet 代码到 Tenon。

## release 后新增：显式 `--platform` targeting

### 能力事实

`0.4.0-beta.9` 的 README 尚未列出 `--platform`；固定 master 的 README 已明确：

- `comet init --platform <platform>` 只初始化指定平台；
- `comet update --platform <platform>` 只刷新指定平台；
- 合法但未注册的平台 id 在项目内安装到 `.<platform>/`；
- `--workflow native|classic|both` 仍决定写入的 workflow 资产。

来源：

- [master README：init targeting 与共享 Guard 描述](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/README.md#L212-L230)
- [master README：update targeting](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/README.md#L287-L301)
- [beta.9 README：init 无 `--platform`](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/README.md#L212-L229)
- [beta.9 README：update 无 `--platform`](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/README.md#L284-L298)

### 平台 id 与作用域边界

master 新增的 resolver 只接受小写字母、数字和单连字符分段；已注册 id 返回仓库定义的平台，
未知 id 只允许项目作用域，并被映射到 `.<id>`。全局自定义目标直接报错。自定义平台对象还默认
声明 Claude Code 风格 Hook 格式，因此它是“可落盘的保守资产目标”，不是对未知宿主协议已兼容的证明。

来源：

- [platform target resolver](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/platform/install/platform-targets.ts#L1-L43)
- [platform id validator](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/platform/install/platforms.ts#L41-L48)
- [resolver tests：registered/custom/invalid/global rejection](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/test/platform/platform-targets.test.ts#L1-L51)

### 宿主隔离证据

这里的“隔离”是**安装/更新资产的目标隔离**：

- `init --platform codex` 只创建 Codex 的 `.agents/skills`，并断言 `.claude/skills` 不存在；
- `update --platform codex` 即使发现一份陈旧 Claude Skill，也只刷新 Codex，并断言 Claude 文件原样保留；
- 自定义项目目标把 skill、runtime script、rule 和 Hook 配置收敛到自己的 `.<platform>/`；
- 自定义 global target 被拒绝；`update --platform` 不能和 `--all-projects` 合用。

来源：

- [init 单平台与自定义目标 E2E](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/test/app/init-e2e.test.ts#L658-L758)
- [update 不改写未选中的 Claude 资产](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/test/app/update.test.ts#L1766-L1800)
- [update 自定义目标与 global rejection](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/test/app/update.test.ts#L1802-L1881)
- [`--platform + --all-projects` rejection](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/app/commands/update.ts#L1888-L1900)

### 它没有隔离什么

`--platform` 没有为每个宿主创建一套独立的 workflow/change 状态。Comet 仍把项目配置和当前
change selection 放在共享 `.comet/` 中；Router 依据 current ownership 只把一次写入交给一个
Native 或 Classic Guard。换言之，platform 是“把插件资产装到哪里”，workflow/change 是“当前由谁治理”，
二者没有合并成宿主会话索引。

来源：

- [README：共享 `.comet/current-change.json` 与单 Guard 路由](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/README.md#L532-L561)
- [current selection schema 只有 workflow/change/branch](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/domains/comet-entry/current-selection.ts#L10-L31)

## 现有 Native/Classic 状态与“会话”能力

### 共同恢复入口

Comet 把 Native 与 Classic 定义为相互独立的需求工作流；`/comet` 只按 `.comet/config.yaml`
确定性路由，不按任务大小猜测，也不混用两边的 change、状态或目录。
`comet status` 分栏展示 Native/Classic 状态，`resume-probe` 只扫描配置选中的一侧；配置损坏时
停止恢复，不回退扫描另一套 workflow。

来源：

- [README：独立工作流与确定性入口](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/README.md#L41-L62)
- [status / resume-probe 契约](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/README.md#L234-L249)

这证明的是“任务状态可从磁盘恢复”，不是“能读取或关联宿主聊天记录”。

### Native

Native 的恢复事实包括：

- `comet-state.yaml`：phase、revision、approval、spec operation、evidence ref；
- `brief.md` / proposed specs / `verification.md`；
- `runtime/`：baseline、Run、trajectory、checkpoint、implementation scope、verification evidence；
- `.comet/current-change.json`：多个 active change 之间的当前 ownership selection。

缺失、过期或有歧义的 selection 会阻止 resume/write，要求显式选择；不会猜另一个 change 或切到
Classic。这一点值得 Tenon 的宿主过滤和项目注册表信任锚借鉴。

来源：

- [Native 状态与多 change 选择](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/README.md#L532-L548)
- [Native checkpoint、事务和 Guard 恢复](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/README.md#L552-L561)

Native workspace identity 类型确实预留了可选 `sessionHash`：调用方传入 `sessionId` 时，它会把
session id 与项目/Native root identity 一起做 SHA-256，原始 id 不落盘。但固定 master 的正常
change 创建路径调用 `writeNativeWorkspaceIdentity` 时**没有传 `sessionId`**。此外该字段既没有
platform，也没有时间、标题、摘要、父子关系或可恢复命令，且哈希不可反查。因此它至多是一个未接入
生产创建路径的隐私保护 identity primitive，不是 related-session-memory 数据源。

来源：

- [workspace identity 的 `sessionHash` 与哈希方式](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/domains/comet-native/native-workspace.ts#L13-L24)
- [`sessionId` 仅是可选 capture 参数](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/domains/comet-native/native-workspace.ts#L52-L58)
- [哈希绑定 project/native root，不保存原始 id](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/domains/comet-native/native-workspace.ts#L236-L270)
- [正常 create-change 调用未传 `sessionId`](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/domains/comet-native/native-change.ts#L671-L679)

### Classic

Classic 将状态拆分为：

- OpenSpec 生命周期；
- change 级 `.comet.yaml`（workflow phase、执行模式、验证状态）；
- change 内 `.comet/run-state.json`（Engine Run identity、current step、iteration、pending、status）；
- append-only `.comet/state-events.jsonl`。

`run_id` 只是 `.comet.yaml` 到 Engine Run 的外键。Engine 的 `RunState` 包含 skill/version/hash、
currentStep、iteration、pending refs、artifact/checkpoint refs、status 和 retries；它不包含宿主
platform 或宿主 session id。因此不能把 “Run” 翻译成 Codex/Claude 对话会话。

来源：

- [Classic 状态文件与 `run_id` 定义](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/README.md#L595-L619)
- [Classic `.comet.yaml` 字段](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/README.md#L623-L658)
- [Engine `RunState` 完整字段](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/domains/engine/types.ts#L1-L21)
- [持久化 Run codec 的闭合集合](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/domains/engine/storage-run.ts#L10-L44)

## `0.4.0-beta.9` 本身提供了什么

latest published release 的主要变化是 Native clarification、canonical evidence formatting、
large-repository snapshot budgets、global workflow selection、explicit Skill invocation、Classic archive
final state 和 race-safe file reads。它进一步加强了“状态/证据可恢复且文件读取失败关闭”，但 release
说明没有宣称跨宿主会话枚举、全文检索或任务—会话多重关联。

来源：

- [0.4.0-beta.9 release notes](https://github.com/rpamis/comet/releases/tag/0.4.0-beta.9)
- [beta.9 固定 README：Native/Classic 状态](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/README.md#L530-L658)

这也是为什么 `--platform` 必须明确记录为“release 后 master 差异”，不能写成 beta.9 已发布能力。

## 对 Tenon `related-session-memory` 的适用映射

| Comet 证据 | Tenon 可采用的设计原则 | 在本 Change 中的落点 |
| --- | --- | --- |
| `--platform` 只处理显式目标，Codex 更新不碰 Claude 文件 | 单宿主过滤必须只读该宿主；`all` 必须是显式值，而不是查询失败后的回退 | API 接受 `all` 或已支持宿主枚举；前后端保留用户选择 |
| 非法 id、global custom、歧义 selection 失败关闭 | 不接受任意目录名/路径当 platform；项目 root 必须先经机器级注册表校验 | server 在调用 mem 前校验 root、query、platform、limit |
| Native/Classic 状态目录彼此独立，Router 一次只选一个 Guard | 搜索结果必须带 `platform + session id` 复合身份；不同宿主同名 id 不合并 | response row 使用 platform 和 id，React key 同样包含二者 |
| workflow 恢复依赖正式磁盘 artifact，不依赖聊天记忆 | related sessions 只是只读辅助上下文，不能改变 canonical Change、phase、review 或恢复绑定 | 只读 GET；不写 session，不调用 transition，不自动恢复 |
| `sessionHash` 不落原始 session id | 隐私上应避免返回宿主会话文件路径，摘要和条数都要有界 | DTO 不暴露 `filePath`；只返回必要标题/时间/命中摘要 |
| `status` / `resume-probe` 明确空、歧义和损坏状态 | UI 必须把 loading、empty、validation error、read error 分开 | Task detail 提供显式提交、加载、空态、错误与重试 |
| custom platform 只允许 project scope | 未经 adapter 支持的宿主不能进入查询面 | 只开放 kernel 已有的 Claude/Codex/OpenCode/Pi 枚举 |

## 不适用映射与禁止类推

| Comet 能力/字段 | 为什么不适用 | Tenon 不应做什么 |
| --- | --- | --- |
| `--platform` | 它选择安装/更新资产，不读取宿主历史 | 不把 CLI 安装 selector 直接当会话查询数据源 |
| `.comet/current-change.json` | 只有一个 workflow/change/branch ownership；没有多会话列表和相关性 | 不用单 current selection 代替多结果搜索 |
| Classic/Native `run_id` | 是 Comet Engine Run 外键，不是宿主 conversation/thread id | 不生成 `codex resume <run_id>` 或 `claude --resume <run_id>` |
| Native `sessionHash` | 正常 change 创建未接入；不可反查；缺少 platform/摘要/时间 | 不把哈希展示给用户，也不按哈希扫描宿主文件 |
| 自定义 `.<platform>` target | 默认采用 Claude 风格 Hook，只证明资产可落盘，不证明未知宿主协议 | 不允许任意 platform 字符串触发目录发现或文件读取 |
| Comet Dashboard/status | 展示 workflow phase 与恢复诊断，不是相关聊天检索 | 不用状态卡假装完成跨宿主记忆功能 |
| Comet project/global install scope | 这是插件资产作用域，不等于 session search scope | 不提供全局历史搜索作为项目内功能的隐式后门 |

## 对当前 Tenon 方案的具体判断

当前 proposal 的四条安全边界与 Comet 证据一致：

- 项目内、显式触发；
- 只读；
- 有界结果；
- 不写入/迁移宿主会话历史，不自动发送查询。

Comet 进一步支持以下决策：

1. 平台过滤器应有明确 `all` 与四个受支持宿主；缺省值可以是 `all`，但响应必须保留每条来源平台。
2. 未知 platform 应返回稳定的 400 类错误，而不是按 Comet custom target 逻辑猜一个目录。
3. `filePath` 是 server/kernel 内部定位信息，不能进入 Dashboard DTO。
4. 搜索失败不能悄悄改用最近一次 session-link；“关键词相关结果”和“Change 最近恢复会话”是不同语义。
5. 不返回恢复命令更稳妥。若未来返回，必须由现有已验证的 session-link resolver 产出，不能根据
   platform 和 id 在新端点重新拼字符串。
6. 相关会话面板不应改变 `tenon session activate` 精确绑定；用户查看历史结果不等于选择当前执行会话。

## 开放问题

1. 第一版摘要是否只返回命中的 user excerpt，还是允许 assistant excerpt？Comet 没有对应会话搜索契约，
   该决策必须由 Tenon 的最小披露原则和现有 `SearchHit` 能力决定。
2. API 的 `limit`、单条 snippet 字符数、总响应字符数和扫描候选上限分别是多少？只限制最终条数不足以
   限制同步扫描成本。
3. `all` 模式下四个 adapter 某一个读取失败时，是整体稳定错误，还是返回 partial results +
   `warnings`？kernel 已有 warnings 形状，但 Dashboard 需要明确可见语义。
4. OpenCode 的 parent/child session 是否默认合并？若合并，结果需要显示 merged descendant 数，避免用户
   把一个聚合结果误认为单一会话。
5. 查询结果是否需要排除当前精确绑定会话，或以“当前”标记保留？这会影响用户判断哪些历史讨论真正是
   “related”，但不应改变 canonical session binding。
