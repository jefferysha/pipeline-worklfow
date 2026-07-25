# Trellis 风格文档产品真相与中文生成研究

日期：2026-07-25  
范围：README、`docs/usage`、Dashboard Overview、package/CI、workflow templates、Skills、hooks、CLI，以及 proposal/design/tasks/spec/ADR/plan/report 的所有一方生成入口。  
结论类型：Explore 独立研究；本文只提出架构与验证方案，不修改运行时协议或已有文档。

## 结论摘要

当前“默认骨架是英文、后续文档语言不稳定”不是单点翻译遗漏，而是**生成职责分散**造成的系统性问题：

1. `pipeline init` 的最小 OpenSpec 继续点由 Kernel 内的 `default-openspec-scaffold.ts` 直接硬编码英文。
2. `pipeline scaffold` 的分层 spec stub 由另一套 Kernel 表生成，标题英文、摘要与 TODO 中文。
3. ADR、Superpowers design/plan、delta spec、verification report、applied spec 的正文不是状态机生成，而是 agent 按各个 Skill 的自然语言说明编写；这些 Skill 中英混杂，也没有统一 locale 输入。
4. README 中英文双份、Dashboard `zh/en` 字典、CLI/hooks 中文提示都只是各自的展示层，没有任何一处能约束文档生成语言。
5. 文档治理协议本身是正确的单一真相源：稳定 kind、phase、producer、path、SHA-256 和 read receipt。它不应承担翻译职责，也不应因中文化升级 schema。

推荐新增一个随插件打包、版本化、可校验的 **Document Presentation Registry**，统一管理“文档种类 → 路径规则 → 稳定章节语义 → locale 文案”，让 Kernel scaffold、CLI scaffold 和 phase Skills 都消费它；协议标识、文件路径、账本、历史归档保持不变。新 renderer 只创建缺失文件，绝不自动翻译、覆盖或重哈希既有 Change。

## 研究方法与可信度

本题的权威事实都在本仓，因此没有用公开网页替代一方源码。研究采用六条独立证据线交叉核对：

- CLI `init/scaffold` 到 Kernel repository/renderer 的真实调用链；
- default/simple/custom workflow 的文档能力与 contract；
- phase Skills 的产出路径、结构和 producer 约束；
- hooks/router 的注入与 Todo 投影；
- document ledger 的 digest、read receipt、历史兼容语义；
- README、usage guide、Dashboard i18n、package scripts 与 CI 的产品声明和漂移门禁。

置信度：对“现状与根因”为高；对“默认 locale 选择、标题是否全部中文化”为待产品决策。

## 一、现有产品真相

### 1. Default Workflow 的真实文档链

治理矩阵固定声明十类文档：

| 阶段 | 首次产出 | 后续必须读取 |
| --- | --- | --- |
| `open` | `proposal`、`openspec-design`、`tasks` | 无 |
| `explore` | `superpower-design`、`adr` | Open 三文档 |
| `spec` | `delta-spec`、`superpower-plan`、`plan` | Open + Explore |
| `build` | 可更新 `tasks` | 全部设计/计划 |
| `verify` | `verification-report`，可更新 `tasks` | 全部设计/计划 |
| `ship` | `applied-spec`，可更新 `tasks` | 设计/计划 + 验证报告 |
| `archive` | 可更新 `tasks` | 包括 applied spec 的全部前序文档 |

证据：`packages/kernel/src/workflow/document-contract.ts:10-29,47-72,83-131`。README 与 usage guide 对这条链的描述一致（`README.md:128-140`、`README.zh-CN.md:107-115`、`docs/usage/documents-skills-and-evidence.md:14-28`）。

重要边界：状态机只负责“要求什么、谁可写、后面谁必须读”，不负责生成有意义的产品正文。正文由当前 agent 执行真实 Skill 后编写并登记。最小 fallback scaffold 只是防止 state-first 或中断恢复时完全没有继续点，不能被描述成完整规格生成器。

### 2. Default、Simple 与 Custom 不能混成一种生成策略

- Default 或声明 `openspec_contract: required` 的 Workflow 使用完整 `legacy-full` 文档链。
- 内建 Simple Workflow 是 `change ⇄ verify → done`，没有 default OpenSpec 文档链。
- Custom Workflow 只有在 `document_contract.version: v1` 显式声明 slot/read 时才治理对应文档；无 contract 就没有文档治理。
- `document_contract:v1` 只允许 `version/slots/reads`，slot 只允许 `kind/owner_step/producers`；未知字段 fail-loud。把 `locale` 或 `template` 直接塞进 v1 会破坏既有 parser 契约。

证据：`packages/kernel/src/workflow/types.ts:141-169`、`packages/kernel/src/workflow/parse-document-contract.ts:29-123`、`docs/usage/documents-skills-and-evidence.md:98-107`、`templates/workflows/simple.yaml:1-54`。集成测试也明确断言 simple 不生成 proposal/tasks，而 default/free-default 会得到 fallback 文档（`packages/cli/src/init-workflow.integration.test.ts:101-148`）。

### 3. Todo 已具备双语标题适配，但协议 ID 仍应稳定

`tasks.md` 是 Default Workflow 的可编辑 Todo 真相源。投影器按实际 workflow 的 `stage.id` 或 `stage.label` 识别标题，因此 default YAML 中 `id=open,label=立项` 时，`## Open` 和 `## 立项` 都能归入同一阶段。未识别标题下的任务不会消失，而会留在当前阶段；未来阶段仍可见但不会提前阻断当前出口。

证据：`packages/kernel/src/workflow/todo-projection.ts:73-117,135-199`。

这说明 Todo 的中文化不需要翻译 `open` 这个 canonical ID；只需由模板生成本地化标题，同时继续用 workflow id/label 做结构识别。Custom Workflow 也必须从自己的 DAG 取标题，不能套 default 的七阶段中文表。

## 二、所有生成入口与语言边界审计

### 1. 直接写 Markdown 的生产代码

| 入口 | 真正写入者 | 当前骨架语言 | 行为与风险 |
| --- | --- | --- | --- |
| `pipeline init` default fallback | `packages/kernel/src/state/default-openspec-scaffold.ts:18-65` | 全英文 | 固定写 proposal/design/tasks；`wx`、0600、并发安全，只补缺失文件 |
| `pipeline scaffold` | `packages/kernel/src/scaffold/doc-scaffold.ts:59-103` + CLI | 标题英文，summary/TODO 中文 | web/cli/lib 三套分层 spec stub；与 default Change scaffold 完全独立 |

`WorkflowRunRepository.initChange` 只有在有效 workflow 的 document profile 为 `legacy-full` 时调用 default fallback；custom 不会被擅自注入 default 文件（`packages/kernel/src/state/workflow-run-repository.ts:82-104`）。CLI `init` 只是解析 track/workflow 并调用 repository，没有 locale 参数（`packages/cli/src/commands/init.ts:195-228`）。

结论：目前生产代码中只有这两套硬 renderer；“把一个文件翻译成中文”只能修一条路径，不能修复整个体系。

### 2. 由 Agent 按 Skill 说明编写的文档

| 文档 | 产出入口 | 当前结构来源 | 中文化缺口 |
| --- | --- | --- | --- |
| proposal/design/tasks | `openspec-propose` | Skill 要求固定三路径和七阶段标题 | Skill 英文，未读取 locale |
| Superpowers design | `brainstorming` / `pipeline-explore` | Skill 指定 `docs/superpowers/specs/...-design.md` | 产出语言跟随会话，无模板契约 |
| ADR | `pipeline-explore` | 写入 `docs/adr/...-explore.md`，要求 `Context / Decision / Alternatives / Consequences` | 中文 Skill 内嵌英文标题 |
| delta spec | `openspec-propose` / `pipeline-spec` | `openspec/changes/<change>/specs/<capability>/spec.md` | OpenSpec 操作词被 verify 合并流程显式依赖 |
| Superpowers plan / plan | `writing-plans` / `pipeline-spec` | `docs/superpowers/plans/...md` + `change`/`design-doc` 元数据 | Skill 只约束内容，不统一语言 |
| verification report | `verification-before-completion` / `pipeline-verify` | `docs/superpowers/reports/...-verify.md` | 中文流程描述，但无共享 section schema |
| applied spec | `openspec-apply-change` / `pipeline-ship` | `openspec/changes/<change>/applied-spec.md` | 英文 Skill，自行决定标题 |
| learned design/spec 段 | `learn-record` | `Problem/Root Cause/Solution/When to Apply/Lessons Learned` | 中文 Skill 内嵌英文 Markdown 模板 |

关键证据：

- `skills/openspec-propose/SKILL.md:32-77`
- `skills/pipeline-explore/SKILL.md:99-125,165-213`
- `skills/pipeline-spec/SKILL.md:75-133`
- `skills/pipeline-verify/SKILL.md:180-249`
- `skills/openspec-apply-change/SKILL.md:22-38`
- `skills/learn-record/SKILL.md:110-156`

结论：这些不是 Kernel 自动生成文件，而是 **Skill 驱动的 agent authoring**。统一中文化必须让 Skill 引用一个可执行、可验证的模板契约，不能继续在各 Skill 中复制 Markdown 标题。

### 3. Hooks、workflow templates 与 manifest

- `templates/workflows/default.yaml` 的 canonical step id 是英文，label 是中文；它声明 DAG、artifact 和 guard，不声明文档正文模板。
- `templates/workflows/simple.yaml` 使用自己的短 DAG，不能继承 default 文档模板。
- `templates/manifest.yaml` 的 breadcrumb 是中文运行说明，告诉 agent 在各阶段产出什么，但不是内容 renderer。
- `hooks/session-start.sh` 注入中文 OpenSpec 提示；`hooks/router.sh` 选择 new/resume/simple/free/custom，并给出 `todo_source`。它们不直接写 proposal/design/tasks/spec/ADR/plan/report。
- router 对 default new 只输出 `todo_source: pipeline-phase-template`；Change 创建后则切到真实 `openspec/changes/<change>/tasks.md`。因此“路由提示语言”与“文档生成语言”是两件事。

证据：`templates/workflows/default.yaml:1-106`、`templates/workflows/simple.yaml:1-54`、`templates/manifest.yaml:97-129`、`hooks/session-start.sh:227-230`、`hooks/router.sh:681-720,723-761`。

### 4. README、usage guide 与 Dashboard Overview

- `README.md` 是英文 landing；`README.zh-CN.md` 是独立中文对应稿。
- `docs/usage/README.md` 明确自称当前行为的 canonical task-oriented guide，但整个 usage guide 只有英文，没有中文镜像。
- Dashboard Overview 通过 `translations.ts` 提供 `zh/en` 同构字典，所有可见文案经 `t(...)` 消费；Dashboard 默认 `zh`，语言只保存在 `localStorage[pipeline-dashboard-lang]`。
- Dashboard locale 没有传给 CLI、hooks、Kernel 或 Skills，因此用户把 Overview 切成中文不会改变生成文档的语言。

证据：`docs/usage/README.md:1-48`、`packages/dashboard-app/src/i18n/index.tsx:4-63`、`packages/dashboard-app/src/i18n/translations.ts:1-4,12-109,1242-1325`、`packages/dashboard-app/src/solution/SolutionView.tsx:58-291`。

结论：README/Overview 应解释语言策略并链接配置，但不能成为 renderer 的真相源；否则 UI 文案变化会意外改变协议产物。

### 5. Package 与 CI

当前 package scripts 只有 default workflow codegen freshness；`check:docs` 检查 README 链接、命令、端口、workflow 顺序与产品声明，没有检查文档模板库存、locale parity 或生成 golden。CI 会 build/bundle、检查 release freshness、跑 docs/tests/hooks/adapters/skills/bundle/oracle，但没有 locale 生成矩阵。

证据：`package.json:12-27`、`.github/workflows/ci.yml:23-94`、`tools/check-docs.mjs:13-48,219-344`。

这意味着即使手工把某个骨架改成中文，也没有门禁阻止下一次从另一入口重新引入英文。

## 三、根因

### 根因 A：治理真相与展示模板没有分层

Document contract 已经是“什么必须存在”的真相源；但“长什么样、用什么语言”散落在 Kernel 常量和 Skills prose 中。两者没有显式的 presentation boundary。

### 根因 B：没有 Change 级的确定性 locale

CLI、Dashboard、会话语言各自可推断语言，但没有一个经过验证、在创建 Change 时确定的文档 locale。Agent 只能跟随当前上下文，导致同一 Change 的 proposal 中文、ADR 英文、plan 混排。

### 根因 C：模板内容无 schema、无版本、无 parity check

目前没有稳定 section key、placeholder contract 或 locale 完整性检查。翻译者无法知道哪些标题只是展示文本，哪些 token 会被 Todo/OpenSpec/coverage/frontmatter 解析。

### 根因 D：现有测试把英文表象当成契约

init 集成测试断言 `# Proposal`、`# Design`，验证的是当前硬编码，不是真正需要保护的行为。真正应该锁定的是：

- 正确路径与文档种类；
- 只补缺失、并发安全、绝不覆盖；
- 每个 locale 的结构等价；
- canonical ID、metadata、marker、digest/receipt 行为不变。

## 四、中文化的硬边界

### 绝不能翻译的协议层

| 类别 | 必须保持 |
| --- | --- |
| Workflow | step id、event id、track/workflow id、guard/type 字段 |
| Document contract | `DocumentKind`、`owner_step`、`producers`、`reads`、contract version |
| Ledger/history | JSON 字段、`version`、`contract`、producer id、phase id、SHA-256、path |
| 文件定位 | `proposal.md`、`design.md`、`tasks.md`、`spec.md`、`applied-spec.md` 及既有目录规则 |
| 可机读块 | frontmatter key、`change:`、`design-doc:`、`coverage` 字段、scaffold marker |
| OpenSpec 操作 | `ADDED Requirements`、`MODIFIED Requirements`、`REMOVED Requirements`，以及被 parser/merge 依赖的 requirement/scenario token |
| Skill 身份 | `openspec-propose`、`pipeline-explore`、`writing-plans` 等 producer 名 |

这些 token 是跨版本、跨语言、跨宿主的互操作协议。把它们翻译成中文会破坏 guard、合并、登记或读取，而不是“更好的本地化”。

### 可以本地化的展示层

- H1/H2 的读者可见标题，只要结构由稳定 section key 约束；
- TODO 提示、说明文字、示例描述和任务文案；
- ADR/plan/report 的叙述性章节名称；
- workflow 的可见 label；
- README/usage/Overview 的产品说明。

对于 `tasks.md`，模板可以显示 `## 立项`，因为 Todo 投影器按 workflow label 识别；但 canonical `open` 仍保留在 workflow state。对于 delta spec，首版应保留 OpenSpec 机器操作标题英文，只把 requirement 正文、解释和提示中文化。

## 五、推荐架构：Document Presentation Registry

### 设计原则

1. **治理与展示分离**：Document contract 决定必须产出/读取什么；Registry 决定新文档如何呈现。
2. **一个包内真相源**：模板随插件 release 打包，不依赖用户全局安装 OpenSpec 或在线服务。
3. **确定性渲染**：同一 template version + locale + 输入产生逐字节相同输出。
4. **只作用于新文件**：保留当前 `wx`/append/skip 语义，不触碰既有或归档文档。
5. **Skill 仍对正文负责**：renderer 提供结构与本地化提示，producer Skill 填入真实内容并登记证据；模板生成本身不伪造 Skill receipt。
6. **失败显式**：模板 schema、placeholder、locale parity 不合法时在构建/CI 失败，运行时对未知 locale 按明确策略回退。

### 建议的真相源形态

```text
templates/documents/
├── registry.v1.yaml
├── locales/
│   ├── en.yaml
│   └── zh-CN.yaml
└── schemas/
    └── registry.v1.schema.json
```

`registry.v1.yaml` 只保存稳定语义：

```yaml
version: v1
templates:
  - id: openspec-proposal
    document_kind: proposal
    path: openspec/changes/{change}/proposal.md
    sections: [title, intent, scope, non_goals, acceptance]
    placeholders: [change]
    creation: missing-only
  - id: tasks-default
    document_kind: tasks
    path: openspec/changes/{change}/tasks.md
    sections: [title, workflow_steps]
    dynamic_source: workflow.steps
    creation: missing-only
```

`locales/*.yaml` 以 `template id + section key` 存放标题、提示和默认任务文案。两种 locale 必须拥有完全相同的 template/section/placeholder key；Registry 不复制协议路径和 kind。

相较于为每种语言复制整份 Markdown，这种“稳定结构 + locale 字典”更容易证明 parity，也避免翻译误改 frontmatter、marker、code fence 和 OpenSpec token。复杂示例可允许受 schema 约束的 Markdown fragment，但仍需禁止改变协议 token。

### 运行时分层

```text
validated registry + locale dictionaries
                 │
                 ▼
      pure DocumentTemplateRenderer
                 │
       ┌─────────┴─────────┐
       ▼                   ▼
default init scaffold   pipeline scaffold
       │                   │
       └─────────┬─────────┘
                 ▼
        phase Skill scaffold command
                 │
                 ▼
 agent fills content → document record → later document read
```

- Kernel 新增纯 renderer 与 registry validator，不读取 Dashboard 状态。
- CLI/application 层解析 locale，并把已解析 locale 作为**可选新增输入**传给创建入口。
- `WorkflowRunRepository` 保持只在 `legacy-full` 生成 default 三文档的能力判断；只是把硬编码 `FILES` 换成 renderer 结果。
- `pipeline scaffold` 复用同一个 renderer，不再维护第二套英文 title 表。
- 增加面向 Skills 的幂等入口，例如 `pipeline document scaffold <change> <kind> --locale <locale>`。该命令只建立结构，不做 `document record`。
- phase Skills 引用 template id/命令和“保持本 Change 已选语言”的规则，不再内嵌章节模板。

### Locale 解析与固定

建议优先级：

1. 本次命令显式参数；
2. 项目级 `documents.locale`；
3. 用户级 Pipeline 配置；
4. 明确接入的宿主语言信号；
5. 产品默认值。

Dashboard 的 `localStorage` 语言不能隐式成为 CLI locale；它是浏览器私有展示偏好。若以后要联动，必须通过明确 API/配置写入，而不是 renderer 去读浏览器状态。

为了避免同一 Change 中途换语言，创建时应解析一次并 pin 一个**非治理语义**的 `documentLocale`。可放入已有 run metadata 的版本化可选字段，或独立 generation metadata；不能加进 `document_contract:v1`，也没有必要升级 `.pipeline-documents.json`。locale 影响内容字节，ledger 仍只需记录真实 digest。

## 六、历史与协议兼容方案

### 必须保持不变

- `.pipeline-documents.json` 继续使用 ledger v1；record 仍只绑定 kind/path/digest/producer/reads。
- 已登记文件改字节后，旧 read receipt 失效；中文化不得绕过这一规则。
- 已有活跃 Change、归档目录、main specs 和历史报告一律不批量翻译。
- `ensureDefaultOpenSpecScaffold` 的 missing-only、`wx`、普通文件校验、并发竞争处理保持。
- Simple 与无 contract 的 Custom Workflow 不因安装中文模板而多出 default 文档。
- `document_contract:v1` 不新增未知字段；若未来 custom template mapping 必须成为独立、版本化 presentation contract。

### 新旧版本行为

| 场景 | 推荐行为 |
| --- | --- |
| 新 default Change | 按解析并 pin 的 locale 生成三份最小骨架 |
| 旧 Change 缺一份 fallback 文件 | 只补该缺失文件；优先沿用 Change pin，无 pin 则按兼容默认 |
| 旧 Change 已有英文/混合文档 | 原样保留；Skill 更新正文时沿用现有文档语言 |
| 用户中途改全局 locale | 不重写当前 Change，只影响之后的新 Change |
| 用户明确要求翻译当前 Change | 独立显式操作；重新登记新 digest，并重新取得后续 read receipts/review |
| Archive | 永远不可由 update/setup 自动重写 |

### Custom Workflow 的模板扩展

首版只允许 Registry 覆盖已知 `DocumentKind`。Custom Workflow 仍用 `document_contract:v1` 声明治理 slot/read；presentation mapping 由项目级独立配置按 `kind` 选择已安装 template id。若需要项目自定义 arbitrary template，应有：

- 单独 schema/version；
- 路径必须落在允许作用域；
- template id 不影响 producer/owner/read；
- 缺模板 fail-loud 或退回“无 scaffold、由 Skill author”，不能偷偷套 default。

## 七、测试与 CI 清单

### A. Registry schema 与语言 parity

- [ ] 每个受支持 template 都有 `en` 与 `zh-CN`。
- [ ] 两种语言的 section key、顺序、placeholder 集完全一致。
- [ ] locale 字典不能覆盖 path、kind、phase/event、producer、metadata key、marker。
- [ ] 缺 key、多 key、未知 placeholder、非法 Markdown fragment 均 fail-loud。
- [ ] OpenSpec 保留词和 coverage/frontmatter key 有禁止翻译断言。

### B. Renderer 单元测试

- [ ] proposal/design/tasks/ADR/plan/report/delta/applied-spec 的 en/zh-CN golden。
- [ ] UTF-8、LF、末尾换行和 placeholder escaping 可复现。
- [ ] 未知 locale 按已决定的 fallback 行为处理并给出可诊断信息。
- [ ] tasks 的阶段标题来自实际 workflow id/label，不硬编码 default 到 custom。
- [ ] 同输入重复渲染逐字节相同。

### C. `init` / repository 集成

- [ ] default + `zh-CN` 创建中文可见标题，文件名与 DocumentKind 不变。
- [ ] default + `en` 保持英文输出。
- [ ] 既有文件逐字节保留；只补缺失文件。
- [ ] 两个并发 init 仍只有一个安全写入者。
- [ ] simple 不生成 proposal/tasks。
- [ ] custom 无 contract 不生成；声明 contract 只治理其 slot，不继承 default。
- [ ] free/default 仍是七阶段文档链，但不继承领域 Track 模板。

### D. `pipeline scaffold`

- [ ] web/cli/lib 的所有标题、摘要、TODO 从 Registry 渲染。
- [ ] `skip/append/overwrite` 三态与 marker 行为保持。
- [ ] 中文化不改变默认 spec 目录和相对路径。

### E. Skills、hooks 与端到端证据链

- [ ] 每个 phase Skill 引用存在的 template id 或 scaffold command；禁止再嵌入重复章节骨架。
- [ ] proposal → explore design/ADR → delta/plan → verification report → applied spec 在同一 Change 中沿用 locale。
- [ ] 每份文件仍由允许 producer 登记，后续 phase 对相同 digest 写 read receipt。
- [ ] renderer 不产生伪 Skill evidence；缺真实 Skill 时 gate 仍失败。
- [ ] router 的中文/英文提示不改变 workflow 选择和文档治理。
- [ ] Todo 用 `## Open` 和 `## 立项` 都正确投影；custom label 也正确。

### F. 历史兼容

- [ ] 读取旧 ledger v1、旧英文和混合语言文档。
- [ ] update/setup 后所有 archive 文件与 digest 保持。
- [ ] 全局 locale 切换不重写现有 Change。
- [ ] 明确翻译后旧 reads 被清空，必须重新读取，不得保留 stale receipt。
- [ ] 旧 init 测试从“必须出现 `# Proposal`”改为按 locale 验证结构与兼容行为。

### G. README、usage 与 Dashboard

- [ ] README 英/中都准确说明“状态机不生成有意义正文、模板只给结构”。
- [ ] usage guide 新增 locale 配置、稳定 token 和中途切换行为。
- [ ] Overview `zh/en` 都说明 Dashboard 语言与文档 locale 的边界。
- [ ] i18n key parity 测试继续保证 Overview 双语完整。
- [ ] `check:docs` 从 Registry 自动校验文档种类/命令/配置声明，避免手写列表漂移。

### H. Package、release 与 CI

- [ ] 新增 `check:document-templates`：schema、parity、golden、禁止翻译 token。
- [ ] 若 Registry codegen 为 TS 常量，增加 freshness check，模式对齐 default workflow codegen。
- [ ] 完整 bundle/install smoke 证明 locale 资源随插件发版，不依赖源码仓。
- [ ] Codex/Claude/其他适配器安装后都能解析同一 template release。
- [ ] CI 跑 `en × zh-CN × default/simple/custom` 最小矩阵。
- [ ] 自动更新只替换插件模板版本，不修改任何项目内既有/归档文档。

## 八、推荐实施顺序

1. 先冻结协议边界并建立 Registry schema/parity/golden 测试。
2. 把两套 Kernel scaffold 迁到同一 renderer，保持 `wx` 与三态策略。
3. 为 Change 增加确定性的 locale 解析/pin，但不改 document contract/ledger。
4. 增加 Skill 可调用的幂等 document scaffold 入口。
5. 逐个改 openspec-propose、pipeline-explore/spec/verify/ship/learn-record，移除重复章节模板。
6. 更新 README、usage、Overview 和 docs drift checker。
7. 最后加 clean-install、update、不改 archive 的发行验收。

这样每一步都可独立验证；任何阶段失败都不会迫使迁移历史文档或放宽证据链。

## 九、开放问题

1. **产品默认 locale 是什么？** 保持 `en` 作为跨宿主稳定默认，还是中文会话/中文系统首次创建时默认 `zh-CN`？无论选择什么，显式项目配置都应优先。
2. **中文标题的边界到哪里？** proposal/design/tasks/ADR/plan/report 的读者标题可完全中文化；delta spec 的 `ADDED/MODIFIED/REMOVED Requirements` 是否明确规定永远保持英文机器 token？
3. **locale 是否必须 pin 到 Change？** 推荐 pin，避免跨会话混排；需要决定放进可选 run metadata 还是独立 generation metadata。
4. **首版覆盖范围？** 一次覆盖十类治理文档和 learn-record，还是先统一 default 三骨架 + ADR/plan/report，再扩展 delta/applied spec？
5. **usage guide 的中文产品面？** 保持英文 canonical manual + 中文 README，还是生成/维护完整 `docs/usage/zh-CN` 镜像？这与文档产物 locale 是两个独立决策。

## 十、最终判断

最优修复不是“把 `# Proposal` 改成 `# 提案`”，也不是让每个 Skill 自己判断用户说中文就写中文。正确边界是：

- **Document contract/ledger 是治理单一真相源；**
- **Document Presentation Registry 是结构与语言单一真相源；**
- **Workflow 决定需要哪些文档；**
- **Change pin 决定新文档使用什么 locale；**
- **Skill 负责有意义的正文和真实 producer 证据；**
- **Digest/read/review 继续证明后续步骤读了确切版本；**
- **历史与归档永不被安装、更新或 locale 切换自动重写。**

只有按这一分层落地，中文生成、英文生成、短 Workflow、自定义 Workflow、自动更新和审计证据才能同时成立，而不会互相污染。
