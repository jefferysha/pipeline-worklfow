# Repository Architecture Compliance Specification

## Purpose

Define the enforceable repository architecture, package boundaries, generated-asset consistency,
and CI checks that keep Tenon aligned with its project rules as the codebase evolves.
## Requirements
### Requirement: Objective Agent Rules SHALL be checked in CI

The repository SHALL provide a deterministic architecture check that cites the
governing `AGENTS.md` or `.agent-rules` clause and fails for:

- production files above their responsibility-specific hard limit;
- frontend lower-layer imports from feature or shell layers;
- cross-workspace deep imports outside public package exports;
- configured domain-layer imports of Node/protocol/infrastructure APIs;
- explicit production `any`, non-null assertions, and configured unchecked
  boundary casts;
- historical Skill-cache enumeration;
- Workflow-name capability reconstruction outside explicit
  compiler/compatibility modules.

The checker SHALL use exact, reviewed exceptions only for generated,
configuration, schema, fixture, test snapshot, or protocol files. It SHALL NOT
accept a floating violation baseline.

#### Scenario: Oversized controller is introduced

- **WHEN** a production HTTP controller exceeds 400 lines and is not an exact
  rule-owned exception
- **THEN** `npm run check:architecture` fails with the file, measured size,
  limit, and BACKEND rule citation.

#### Scenario: Translation resource exceeds component limits

- **WHEN** an exact translation configuration resource exceeds 400 lines
- **THEN** the checker applies its documented configuration exception
- **AND** ordinary component files do not inherit that exception.

#### Scenario: Shared imports a feature

- **WHEN** a file under dashboard `shared`, `lib`, or lower model ownership
  imports from `inbox`, `workbench`, `progress`, `afk`, or `shell`
- **THEN** the check fails with the FRONTEND dependency rule.

### Requirement: Backend adapters SHALL decode DTOs and call application boundaries

HTTP、CLI 与 hooks SHALL 只负责输入及授权校验、DTO 转换、应用用例调用和公共错误映射。
产品路径、平台与环境映射 SHALL 在进程装配或 adapter 边界解析并显式注入应用服务。
已经接收路径或环境依赖的应用服务 SHALL NOT 再读取 `process.env`、重建平台优先级或从
宿主 home 推导机器状态目录。外部值 SHALL 以 `unknown` 进入并在状态变更前完成收窄。
Adapter SHALL NOT 实现私有持久化解析器或跨聚合写协议。

#### Scenario: Malformed Workflow request reaches the server

- **WHEN** a request body is not a valid Workflow DTO
- **THEN** a boundary decoder rejects it using the existing compatible client
  error shape
- **AND** no domain compile/save or state write occurs.

#### Scenario: Loop command reads Change state

- **WHEN** a loop command needs a Change-state projection
- **THEN** it uses the kernel/application repository or codec contract
- **AND** it does not parse `.pipeline.yaml` privately.

#### Scenario: 迁移服务在共享运行环境中执行

- **GIVEN** 进程环境包含共享 `TENON_RUNTIME_HOME` 或 XDG 根
- **AND** 迁移调用方显式提供空环境与独立临时 home
- **WHEN** 项目注册表迁移执行
- **THEN** 注册表、回执和目录锁只位于该临时 home 对应的产品路径
- **AND** 共享运行目录保持未修改。

#### Scenario: 新迁移调用方省略环境依赖

- **WHEN** 代码尝试在未提供环境映射的情况下调用项目注册表迁移
- **THEN** TypeScript 契约在编译期拒绝该调用
- **AND** 应用服务不以隐式 `process.env` 作为兜底。

#### Scenario: 现有路径协议保持兼容

- **WHEN** 调用方显式传入与当前进程等价的环境、home 与 platform
- **THEN** `TENON_RUNTIME_HOME`、`TENON_RUNTIME_ROOTS` 和 XDG 的优先级保持不变
- **AND** 注册表、密钥、回执与锁文件格式保持不变。

#### Scenario: managed runtime 回滚等待事务锁

- **GIVEN** runtime adapter 已提供 home、环境和平台作用域
- **WHEN** 回滚事务解析路径并等待作用域锁
- **THEN** 锁目录和锁内全部读写复用同一个不可变路径快照
- **AND** 后续环境变化不能让事务跨到另一个状态根。

#### Scenario: runtime 命令无法解析作用域

- **WHEN** runtime adapter 的 home 或环境提供器失败
- **THEN** CLI 将失败映射为稳定的非零退出码和命令错误
- **AND** 无效或不完整子命令不读取运行时作用域。

### Requirement: Frontend boundaries SHALL follow the declared dependency direction

Dashboard dependencies SHALL flow from App/shell to feature views to
model/state to API, with shared/lib/i18n available downward. Neutral evidence,
decision, and icon primitives SHALL live at the lowest stable ownership level.
API protocol parsing SHALL remain in bounded-context client modules exported
through a stable client facade.

#### Scenario: Feature views share evidence projection

- **WHEN** Inbox, Progress, and Task Detail need the same evidence chips
- **THEN** they import a neutral model projection
- **AND** model/shared code does not import Inbox.

#### Scenario: API returns malformed JSON

- **WHEN** a dashboard endpoint returns a structurally invalid response
- **THEN** the API client decoder maps it to the existing typed failure path
- **AND** no component receives an asserted domain shape.

### Requirement: Oversized production modules SHALL be decomposed by responsibility

Every current hard-limit production violation SHALL be split into cohesive
modules with stable public facades and focused tests. Empty forwarding shells,
generated line shuffling, or a broad exception SHALL not count as
decomposition.

#### Scenario: Server route composition is decomposed

- **WHEN** server routes are split by bounded context
- **THEN** shared Host/token/content-type/root protections execute for every
  write route
- **AND** existing status codes, response DTOs, SSE behavior, and tests remain
  compatible.

#### Scenario: Frontend page is decomposed

- **WHEN** a page or component is split
- **THEN** loading, empty, error, disabled, success, keyboard, responsive,
  theme, and i18n behavior remain covered at risk-appropriate levels.

### Requirement: Generated and installed assets SHALL track verified source

Schema/profile changes SHALL be represented consistently in source, tracked
CLI/server bundles, dashboard types, Skills, templates, tests, and immutable
release payloads. Bundle/freshness/install checks SHALL fail before activation
when any required projection is stale or a mandatory Skill is missing.

#### Scenario: Source supports a profile but bundle is stale

- **WHEN** the tracked CLI or server bundle does not contain the current
  profile behavior
- **THEN** freshness or bundle verification fails
- **AND** setup/update cannot activate that candidate.

### Requirement: 仓库 SHALL 区分正式资产与可再生验收产物

Git 当前树 SHALL 不跟踪 `design-demos/shots/`、根目录 QA 截图、Playwright 临时目录、E2E 运行态，
或不属于 Tenon 产品的历史测试项目、demo、OpenSpec 主规格、Change archive 和配套文档。
正式 Dashboard 文档图片 SHALL 只位于固定目录、使用稳定文件名，并进入显式 allowlist。
通用架构结论只有在改写为 Tenon 自有、中性表述且仍被现行规范引用时才可保留。

#### Scenario: 开发者生成浏览器验收截图

- **WHEN** Playwright 或人工验收把图片写入受禁截图目录
- **THEN** `.gitignore` 阻止其作为普通新文件进入提交
- **AND** repository hygiene 检查在文件已被强制跟踪时 fail-loud。

#### Scenario: 正式 Dashboard 图片更新

- **WHEN** 维护者更新 README/文档站引用的 allowlisted 图片
- **THEN** 检查验证格式、尺寸上限、引用和隐私扫描
- **AND** 不允许借 allowlist 提交同目录中的任意额外截图。

#### Scenario: 历史测试项目仍在当前树

- **WHEN** 当前 Git 树包含已完成验收后不再属于 Tenon 产品的测试项目资产
- **THEN** repository hygiene 检查失败并列出相对路径
- **AND** 对应 demo、文档、OpenSpec 主规格与 archive 必须作为一个完整资产族删除。

### Requirement: 发布包 SHALL 使用显式内容 allowlist

Marketplace payload、npm tarball 与 Pages artifact SHALL 分别由确定性 allowlist 控制。它们不得包含
设计 demo、旧验收截图、内部研究、OpenSpec Change/ledger、测试运行态、凭据或本机路径。
CLI/server/SPA 受控 bundle SHALL 由源码重建并通过 freshness 检查。

#### Scenario: npm tarball 包含内部研究

- **WHEN** `npm pack --dry-run` 或 tarball audit 发现 `docs/superpowers`、`openspec/changes` 或截图目录
- **THEN** 发布检查失败并列出意外路径
- **AND** npm publish 不得执行。

#### Scenario: Marketplace 缺少运行资产

- **WHEN** allowlist 漏掉 CLI、Dashboard、Skill、hook、adapter、template 或 manifest
- **THEN** package verification 失败
- **AND** 候选不得激活。

### Requirement: 仓库优化 SHALL 不破坏审计历史

常规仓库卫生修复 SHALL 删除当前树无关资产并防止回归，但不得重写 Git 历史或改变 OpenSpec/ledger
历史 digest。若未来确需 history rewrite，必须作为独立破坏性迁移并重新评估 clone、tag、release 和审计影响。

#### Scenario: 当前树删除旧截图

- **WHEN** 本 Change 删除受跟踪的旧验收图片
- **THEN** 它们仍可从 Git 历史恢复
- **AND** 当前分支、发布包和后续提交不再携带这些工作树资产。

### Requirement: 当前树 SHALL 不包含外部参考项目身份

受 Git 管理的当前树 SHALL 在路径名和文本内容两个维度对外部参考项目身份保持零明文。相关调研、
演示、报告、Skill 说明和 OpenSpec 归档 SHALL 从当前树删除；仍有产品价值的通用结论 SHALL 改写为
Tenon 自有的中性架构表述。检查 SHALL 使用一份集中式禁止身份表、无路径豁免、无归档豁免，并在
CI、Marketplace、npm 与 Pages 发布前运行。Git 既有提交对象 SHALL 保留，不执行历史重写。

#### Scenario: 历史调研产物仍在当前树

- **WHEN** 受 Git 管理的任一路径或文本包含受禁参考身份
- **THEN** repository hygiene 检查失败并报告脱敏后的相对路径
- **AND** 构建、打包或发布不得继续。

#### Scenario: 维护者需要恢复被删除资料

- **WHEN** 维护者需要审计或恢复被清理的历史调研产物
- **THEN** 从 Git 既有提交对象中显式恢复
- **AND** 恢复内容在重新进入当前树前仍须通过参考身份门禁。

#### Scenario: 检查器自身保存禁止身份

- **WHEN** 维护者扩展禁止身份表
- **THEN** 禁止值以机器构造方式集中保存，检查器源码和测试不重新引入受禁明文
- **AND** 失败消息对命中身份脱敏。

### Requirement: 可发布主干 SHALL 通过依赖安全门

候选版本在干净 `npm ci` 后 SHALL 对完整 workspace 运行可复现的依赖审计与依赖树校验。
Critical 或 High 漏洞 SHALL 阻止发布；Moderate 漏洞 SHOULD 在存在兼容稳定修复时消除。若上游没有
稳定修复且必须接受 Moderate，证据 SHALL 记录 advisory、受影响路径、补偿控制、owner 和截止日期。
精确 override MAY 用于收敛间接依赖，但 SHALL 由 `npm ls`、全量测试、正式 build、文档 build 和
精确 head CI 共同证明，且不得依赖 `--force` 或 pre-release 工具链。

#### Scenario: 干净安装包含 Critical 或 High

- **WHEN** `npm audit --json` 在干净 workspace 报告任一 Critical 或 High
- **THEN** release verification 失败
- **AND** 版本、tag 和 GitHub Release 不得创建

#### Scenario: 安全稳定升级可消除 advisory

- **WHEN** 直接或间接依赖存在兼容的稳定安全版本
- **THEN** manifest 与 lockfile 作为同一原子变更升级
- **AND** 干净审计、依赖树、全量测试、正式 assets、docs build 和 CI 全部通过

#### Scenario: 使用 override 修复间接依赖

- **WHEN** stable 顶层工具尚未放宽其间接依赖声明，但隔离原型证明安全版本兼容
- **THEN** override 使用精确版本并在设计或 ADR 中记录原因和回滚边界
- **AND** `npm ls` 不报告 invalid/extraneous，正式文档与应用构建均通过

#### Scenario: 本 Change 的安全候选

- **WHEN** Vitest、Vite、AJV 与 VitePress 的本次安全组合安装完成
- **THEN** `npm audit --json` 报告 total 为 0
- **AND** 不引入 VitePress 2 alpha、Vite 8 或更高 Node engine 要求

### Requirement: 可发布仓库 SHALL 保持 OpenSpec 活跃树可严格验证

`openspec/changes/` SHALL 只包含具有真实 proposal、design、tasks 和 capability delta 的活跃
Change。已经结束且仅剩 Tenon 状态证据的历史目录 SHALL 通过 OpenSpec 官方 archive 操作完整迁移
到日期化 archive；不得删除历史证据、手改 canonical state，或补写虚假 delta 以骗过校验。

#### Scenario: 历史 state-only 目录滞留活跃树

- **WHEN** 一个目录不在 Tenon 活跃 Change 清单、phase 已为 `done` 或 `escalated`，且没有 proposal 或 delta
- **THEN** 使用精确枚举的 OpenSpec archive 操作保留其全部文件并移出活跃树
- **AND** 迁移前后的逐文件内容摘要和文件数量一致

#### Scenario: 发布候选执行全仓严格校验

- **WHEN** release candidate 运行 `openspec validate --all --strict --no-interactive`
- **THEN** 所有真实 active Change 和主规格均通过
- **AND** 不以忽略失败、删除证据或伪造 requirement 作为通过手段

### Requirement: 聚合快照 SHALL 只发布稳定的 tasks 内容

服务端读取受项目工作树控制的 `tasks.md` 时 SHALL 使用有界、nofollow 的普通文件 fd，并在读取前后
同时验证 fd 与 pathname 的文件身份和变化元数据。仅 dev/ino/size 相同不足以证明内容稳定；mtime 或
ctime 变化、fd/path 身份漂移、特殊文件、越界路径或超限输入均 SHALL fail closed，不发布该 tasks 投影。

#### Scenario: 同 inode同长度原地覆写

- **GIVEN** 服务端已经打开一个合法且有界的 `tasks.md`
- **WHEN** 文件在 fd 读取期间被原地覆写为相同字节长度，inode 与 size 均保持不变
- **THEN** fd 读前/读后或 pathname 元数据 fence 检出 mtime/ctime 变化
- **AND** 聚合快照省略该 tasks 内容，不发布 stale 或 torn bytes

### Requirement: Kernel 生产运行时 import 图 SHALL 无环

仓库 SHALL 从 `packages/kernel/src` 的生产 TypeScript 源码建立确定性项目相对 import 图。runtime 子图中
任何包含多个模块的强连通分量以及任何 runtime 自环 SHALL 使架构检查失败；可合并候选的 runtime SCC
数量 SHALL 为零。检查 SHALL 不接受浮动 baseline、cycle allowlist、dynamic-import 绕行或生成代码例外来
隐藏生产环。

生产源码集合 SHALL 排除声明文件、测试、测试 fixture 与测试 harness，并包含实际交付的 generated source。
项目相对 specifier SHALL 按固定候选顺序解析 TypeScript source；`.js/.jsx/.mjs/.cjs` SHALL 分别映射到
`.ts/.tsx/.mts/.cts`，无扩展名 SHALL 支持固定文件与 `index` 候选。仓库内 scoped 相对 import 无法唯一解析时
SHALL fail-loud，而不是漏掉图边。

#### Scenario: 真实 kernel 生产图通过

- **WHEN** `npm run check:architecture` 扫描当前 kernel 生产源码
- **THEN** 输出 SHALL 报告 runtime 文件数、边数与 `runtime SCC=0`
- **AND** 所有节点、边、SCC 成员和诊断 SHALL 使用排序后的仓库相对 POSIX 路径。

#### Scenario: Fixture 种入运行时环

- **GIVEN** 三个临时生产模块通过 static import、re-export 或 dynamic import 形成 runtime cycle
- **WHEN** graph checker 分析该 fixture
- **THEN** 检查 SHALL 非零失败并稳定列出 SCC 成员及内部 runtime 边
- **AND** 调整文件发现顺序或重复运行 SHALL 得到相同诊断。

#### Scenario: 相对 JavaScript specifier 指向 TypeScript source

- **GIVEN** 源码以 `.js` specifier 或无扩展名/index specifier 引用仓库内 TypeScript 模块
- **WHEN** checker 构建图
- **THEN** 边 SHALL 指向唯一的真实 TypeScript source
- **AND** 多解或无法解析 SHALL 明确失败。

### Requirement: Runtime 与 type-only import SHALL 使用 AST 语义分类

checker SHALL 使用仓库已有 TypeScript compiler AST，而不是正则表达式，识别 static import/export、dynamic
`import()` 与 `ImportTypeNode`。`import type`、`export type`、全为 `type` 的 named specifier 与
`ImportTypeNode` SHALL 只产生 type-only 边；default、namespace、side-effect、export star、dynamic import 或
任何含 value binding 的 mixed 声明 SHALL 产生 runtime 边。

runtime SCC SHALL 作为阻断门；type-only 边与其 SCC SHALL 独立计数/报告且不使门禁失败。

#### Scenario: 只有 type-only 的双向依赖

- **GIVEN** 两个模块只通过 `import type` 或 `export type` 双向引用
- **WHEN** checker 分析该 fixture
- **THEN** runtime SCC SHALL 为零且命令成功
- **AND** type-only 指标 SHALL 报告这些边而不是静默丢弃。

#### Scenario: Mixed named import 伪装 runtime 边

- **GIVEN** 一个声明同时包含 `type A` 与 value binding `b`
- **WHEN** 该 value 边参与 cycle
- **THEN** checker SHALL 将模块关系计入 runtime 图并拒绝该 cycle。

### Requirement: 拆环 SHALL 保持文档与 TaskPlan 审计行为兼容

kernel SHALL 通过低层纯状态核心、外层应用服务和无副作用 contract 叶子形成单向依赖。公共
`recordDocument`、`publishTaskPlanRevision` 与 workflow validator 的名称、参数、返回值、错误映射和根包导出
SHALL 保持兼容；document ledger、Skill invocation JSONL、task-plan revision/current/projection 与 `tasks.md`
格式 SHALL 不改变。

#### Scenario: 文档登记缺少当前 StepVisit confirmation

- **WHEN** caller 登记文档但 canonical 当前 StepVisit 缺少精确 host producer confirmation
- **THEN** recording service SHALL 按既有错误失败关闭且不写 document ledger
- **AND** caller SHALL 无法通过公共 input 注入或覆盖 `producerInvocation` anchor。

#### Scenario: 文档登记在既有 Change lock 内完成

- **GIVEN** CLI 已持有 SkillInvocation Change lock 并完成当前 producer confirmation 对账
- **WHEN** 它调用公共 `recordDocument`
- **THEN** recording service SHALL 复用该时序且不再次获取同一把锁
- **AND** canonical ledger record 与 Skill artifact invocation SHALL 继续绑定同一 StepVisit。

#### Scenario: Native TaskPlan 发布成功

- **WHEN** 一个合法 frozen revision 通过 CAS、immutable/current 与 projection 提交
- **THEN** native Skill begin event SHALL 发生在 state lock 之前
- **AND** complete event SHALL 只在 state lock 释放且发布成功后发生。

#### Scenario: Native TaskPlan 发布失败或并发冲突

- **WHEN** validation、CAS、immutable publish、fault injection、current replace 或 projection 失败
- **THEN** complete event SHALL NOT 被写入，fail event SHALL 在 state lock 外 best-effort 记录
- **AND** 既有错误类别、current 提交点、跨进程锁与恢复语义 SHALL 保持不变。

### Requirement: Canonical architecture 命令 SHALL 在 CI 阻止 cycle 回归

根 `check:architecture` SHALL 同时运行 import graph 的 deterministic fixture tests 与真实仓库扫描。canonical CI
和 release-candidate workflow SHALL 继续调用该唯一根命令，使 seeded runtime cycle、真实 runtime SCC、解析歧义
或其他现有架构违规在合并/发行前失败。checker SHALL 复用现有 TypeScript devDependency，不增加产品运行时依赖。

#### Scenario: 开发者提交新的 kernel runtime cycle

- **WHEN** PR exact head 的 canonical CI 运行 `npm run check:architecture`
- **THEN** 新 cycle SHALL 使 job 失败并报告仓库相对成员/边
- **AND** type-only-only cycle SHALL 不产生误报失败。

#### Scenario: 受控 bundle 未同步

- **WHEN** kernel 公共导出源码已经改变但 tracked CLI/server bundle 仍陈旧
- **THEN** build/bundle freshness 验收 SHALL 失败
- **AND** 候选 SHALL NOT 被报告为 issue #45 完成。
