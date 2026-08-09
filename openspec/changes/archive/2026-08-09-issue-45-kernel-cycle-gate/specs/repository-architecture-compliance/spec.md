# OpenSpec 增量规格

## ADDED Requirements

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
