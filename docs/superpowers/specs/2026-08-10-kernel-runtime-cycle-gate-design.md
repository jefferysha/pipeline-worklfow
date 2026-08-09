# Kernel 运行时 import 拆环与门禁设计

## 用户结果与范围

完成 issue #45 后，`packages/kernel/src` 的生产 TypeScript 模块不再包含运行时 value-import 强连通分量（SCC），且
CI 会在未来合并前确定性拒绝同类回归。文档 ledger、producer confirmation、Skill receipt、native task-plan 的外部
行为与持久化格式保持不变；type-only 依赖不作为运行时环失败，只在独立指标中报告。

本 Change 只处理 kernel 内部依赖方向、架构 checker、相邻测试、ADR 与受控生成物。它不重排无关模块，不修改
CLI/API/schema，不改 Dashboard，不发布版本，也不合并 PR。

## 已验证事实

- 编排冻结点与当前 `origin/main` 均为 `2283992375ae5fb74b2b1ed8e1234c11ef99a1c7`；issue #45 是
  P1、Wave 0、无前置 blocker，父路线图为 #41。
- 现有 `node tools/check-architecture.mjs` 扫描 845 个生产文件并通过，但没有构建 import 图或检查 SCC；根
  `check:architecture` 已被 canonical CI 与 release-candidate workflow 调用，因此扩展该命令即可成为合并门。
- 基于当前源码相对 import 的 Explore 基线为 218 个 kernel 生产文件、501 条 runtime 边、318 条 type-only 边。
  最终数值以实现后的 TypeScript AST checker 为准。
- 当前运行时图包含两个 SCC：

  1. 六文件 SCC：`state/document-ledger.ts`、`state/document-producer-invocation.ts`、
     `skill-invocation/document-confirmation.ts`、`skill-invocation/repository.ts`、
     `state/task-plan-store.ts`、`skill-invocation/native-task-plan.ts`。
  2. 两文件 SCC：`workflow/document-contract.ts` 与 `workflow/document-contract-validation.ts`。

- 六文件 SCC 的内部运行时边为：

  ```text
  document-ledger -> document-producer-invocation -> document-confirmation -> repository
         ^                                                                |
         +----------------------------------------------------------------+

  task-plan-store -> native-task-plan -> repository -> task-plan-store
  ```

- 工作流 SCC 由 `document-contract.ts` re-export validator、validator 反向 import contract 常量和 type guard 形成。
- `document-ledger.ts`（499/500）、`repository.ts`（485/500）、`task-plan-store.ts`（486/500）、
  `document-confirmation.ts`（434/450）均接近硬上限；方案必须抽离责任，不能靠 forwarding shell、动态 import 或
  新 exception 隐藏问题。
- 现有相邻测试覆盖 ledger、producer confirmation、Skill repository、task-plan store/跨进程发布、workflow
  validation 与 CLI document record；tracked CLI/server bundles 必须在源码稳定后重建并通过 freshness 检查。

## 必须保持的不变量

1. 文档登记继续从 canonical 当前 StepVisit 和真实 host confirmation 推导 `producerInvocation`；公共调用方不能
   注入、覆盖或省略该锚点来绕过 fail-closed 校验，`--backfill` 的既有边界不扩大。
2. CLI document record 继续在既有 SkillInvocation Change lock 内执行 confirmation 对账、ledger 写入和 canonical
   invocation 登记；新服务不得再次获取同一把锁。
3. task-plan 继续在 state lock 之前写 begin event，在原子 immutable/current/projection 提交之后写 complete event，
   异常时在锁外 best-effort 写 fail event。不得把 Skill ledger 写入放进 state lock 造成锁顺序反转。
4. task-plan 的 CAS、lineage、immutable revision、current pointer、projection 与错误类别保持不变；current pointer
   仍是发布提交点。
5. 根包现有 `recordDocument`、`publishTaskPlanRevision`、workflow validator 导出名称与参数/返回值保持兼容；
   `.pipeline-documents.json`、`.pipeline-task-plan/`、Skill JSONL 与 `tasks.md` 格式字节语义不变。
6. checker 只基于仓库内生产源码和显式规则得出结果，排序与诊断不依赖 cwd 遍历顺序、平台路径分隔符或缓存。

## 方案比较

| 方案 | 做法 | 优点 | 风险与结论 |
| --- | --- | --- | --- |
| A. 低层纯状态核心 + 外层应用服务 + 叶子 contract | 状态模块只做校验/持久化；外层服务编排 confirmation/lifecycle；共享常量和 parser 下沉到无副作用叶子 | 依赖方向显式，保留安全与锁顺序，可同步降低超限文件责任 | 有少量内部函数/测试迁移；采用 |
| B. 给现有 state API 注入可选 callback/port | 调用方传入 confirmation 或 lifecycle callback | diff 较小 | caller 可漏传/伪造，默认装配仍可能回环，弱化 canonical binding；拒绝 |
| C. 合并文件、动态 import 或 checker exception | 用初始化时延或大模块隐藏环 | 短期改动少 | 不形成稳定边界、增加初始化与文件上限风险、门禁无法证明结构；拒绝 |

## 选择的依赖方向

### 文档登记

将 `DocumentProducerInvocationAnchor` 的结构验证/解析移到无 Skill runtime 依赖的叶子模块。ledger 模块保留
document policy、路径、digest、读取回执和原子写入，只暴露给应用层的内部“已验证 anchor 写入”入口；该入口不从
公共根包导出。

新的 document recording 应用服务保留公共 `recordDocument(input)` 契约，在内部调用
`requiredDocumentProducerInvocation` 取得 canonical confirmation，再调用纯 ledger 写入。`state/index.ts`/根入口可做
兼容 re-export，但确认锚点不能出现在公共 input 中。于是运行时方向固定为：

```text
adapter -> document recording service -> confirmation service -> Skill repository
                                  |                    |
                                  v                    v
                          pure ledger store      read-only state views
```

`Skill repository` 读取 ledger 进行 artifact binding 时只触达不依赖 confirmation 的纯 ledger/parser 路径，无法再回到
document recording service。

### Native task-plan 发布

把 `publishTaskPlanRevision` 的生命周期编排移到 task-plan application service。state store 提供内部的
`publishTaskPlanStateRevision`：完成 DTO/domain validation、CAS、immutable/current/projection 原子提交，但不 import
Skill invocation。应用服务严格执行 `begin -> state publish -> complete`，catch 时在 state lock 之外写 fail，然后原样
抛出业务错误。根包继续以旧名称导出应用服务。

读模型继续由纯 state store 提供给 Skill repository 的 canonical binding；因为 store 不再反向 import
`native-task-plan`，依赖成为单向：

```text
task-plan application -> native lifecycle -> Skill repository -> pure task-plan store/read model
         |
         +-----------------------------------------------> pure task-plan store
```

### Workflow document contract

提取只含常量、types 和 type guard 的 leaf contract module。`document-contract-validation.ts` 只 import 该 leaf；
`document-contract.ts` 可继续 re-export validator 和公共 contract API。调用方导出不变，但 validator 不再反向 import
re-export 所在模块。

## Runtime import graph 语义

新增独立、可测试的 graph helper；`tools/check-architecture.mjs` 只负责生产扫描、现有规则聚合和结果渲染，避免让
441 行 checker 越过新的责任上限。实现复用仓库已有 `typescript` devDependency，不增加运行时或开发依赖。

### 输入与解析

- 扫描 `packages/kernel/src` 下 production TypeScript；排除 test、node-test、integration test、fixture 与声明文件，
  generated production source 仍纳入。路径统一为从仓库根开始的 POSIX 相对路径并排序。
- 只为项目相对 specifier（`./`、`../`）建图；package/builtin import 不可能组成 kernel 内部 SCC，但仍由其他规则管理。
- 按 TypeScript 源文件 AST 读取 static import/export、dynamic `import()` 与 `ImportTypeNode`，不以正则猜测注释或字符串。
- `.js/.jsx/.mjs/.cjs` specifier 分别映射到 `.ts/.tsx/.mts/.cts` 源候选；无扩展名按固定候选序列解析文件及
  `index`。同一 specifier 多解或仓库内相对源码无法解析时 fail-loud，防止漏边。

### runtime 与 type-only 分类

- `import type`、`export type`、仅包含 `type` named specifier 的声明，以及 `ImportTypeNode` 产生 type-only 边。
- default、namespace、side-effect import、export star、任何含 value binding 的 mixed import/export，以及 dynamic
  `import()` 产生 runtime 边。mixed 声明中 type binding 不额外变成 runtime，但该模块对目标仍有 runtime 边。
- 门禁只对 runtime 子图运行 SCC 检测并要求零 SCC；type-only 子图单独计数/报告，不参与失败。语义写入 checker
  帮助和测试，避免“排除”变成沉默漏报。

### 确定性与失败输出

SCC 算法按排序后的节点和邻接表运行。自环也属于运行时 cycle。失败诊断按 SCC 最小路径排序，列出成员和 SCC
内部 runtime 边；相同源码在不同平台/遍历顺序得到相同输出。helper 导出纯 graph/resolve/analyze API，node test
使用临时 fixture 验证：种入的 runtime cycle 必须失败、type-only-only cycle 不失败且被独立报告、混合 import 被判为
runtime、`.js` 到 `.ts` 与 index resolution 确定一致。

根 `check:architecture` 先运行 graph 的 node tests，再运行 repository checker；现有 CI 无需复制新命令即可自动拒绝
回归。正常仓库输出至少包含扫描文件数、runtime edge 数、runtime SCC=0 与 type-only edge/SCC 指标。

## 文件所有权与实现边界

| 所有权 | 允许职责 | 禁止扩展 |
| --- | --- | --- |
| kernel document/state/skill-invocation | anchor 叶子、纯 ledger 写入、recording service、兼容 re-export、相邻测试 | public input 注入 confirmation、ledger/schema 改版、锁协议变化 |
| kernel task-plan/state/skill-invocation | pure publish core、lifecycle application service、兼容 re-export、相邻及跨进程测试 | CAS/atomic/current 语义变化、在 state lock 内写 Skill ledger |
| kernel workflow | contract leaf、validator 依赖改向、相邻 validation tests | workflow contract 行为或 producer policy 改造 |
| `tools/` + root scripts | AST import graph helper、seed tests、architecture gate 接入 | 新依赖、浮动 baseline、忽略 unresolved local import |
| tracked dist/docs/OpenSpec | 仅同步受控 bundle、ADR、delta/main spec 与 freshness evidence | 发布、无关重生成、用户 PNG |

实现只由一个 `luna_worker` 在当前指定 worktree 串行写入；根代理在 worker 停止后检查 diff，避免共享 checkout 并发写。

## 兼容、并发与失败风险

- 最大风险是把现有锁外 Skill lifecycle 移入 state lock。测试必须观测事件顺序与失败路径，并保留跨进程
  task-plan publication 测试。
- document recording facade 若接收 caller anchor 会形成安全降级；API/类型测试应证明公共 input 没有新 override。
- 抽取代码时错误类必须由原导出路径保持同一构造语义；CLI 稳定错误映射不得改变。
- AST resolver 若静默忽略无法解析的相对路径会产生假阴性；任何 scoped local resolution ambiguity/error 都失败。
- type-only 规则须覆盖 mixed named import/export，避免全声明二分造成假阴性或假阳性。
- tracked CLI/server bundles 可能因根 kernel export graph 改变而 freshness 漂移；仅在实现稳定后统一 build 并验证。

## 验收映射

| Issue #45 Acceptance / Measurement | 证据 |
| --- | --- |
| kernel production value-import SCCs = 0 | 新 checker 对真实树输出 runtime SCC=0；无 exception/baseline |
| ledger、confirmation、receipt、task-plan 行为不变 | 定向 unit/integration/cross-process tests + public export/build/bundle checks |
| deterministic relative TS resolver；seeded cycle rejected | graph node tests 覆盖排序、扩展名/index、runtime seed 与重复运行输出 |
| type-only excluded or separate with documented semantics | AST 分类测试、独立指标与本文语义 |
| architecture/unit/integration/generated artifact checks pass | `check:architecture`、定向测试、完整 test/build、bundle/freshness/OpenSpec 门 |
| ADR | `docs/adr/2026-08-10-issue-45-kernel-runtime-cycle-gate-explore.md` |
| cycles reachable from main = 0 | exact-head CI 在包含冻结 main 的 PR head 上运行同一 canonical gate |

浏览器/E2E 不适用：本 Change 不改变任何用户可见页面或交互。该项将真实标记 skip，不以 UI 证据替代架构、集成和
生成物门禁。

## Assumptions / Decision Log

- 假设：项目相对 TypeScript import 是本 issue 的完整内部图边界；package/builtin specifier 不会回指 kernel 源文件。
- 决策：选择应用服务 + 纯持久化核心，而不是可选 callback port；canonical confirmation 与 lifecycle 仍由库内部装配。
- 决策：公共 API 按“名称、参数、返回、错误、持久化行为”兼容，内部深路径不是新增长期 contract，但现有相邻测试会
  随职责移动更新。
- 决策：type-only 边可形成独立 SCC，但只报告不阻断；任何含 value binding 的模块关系都进入 runtime 图。
- 决策：CI 复用根 `check:architecture`，避免开发者与 canonical workflow 使用两套命令。
- 决策：完整最终门只在实现和受控生成物稳定后运行一次；Build 期间只用定向测试反馈。
- 决策：本 issue 整体最多两次 root code-review attempt，不因换 Skill、agent 或修复轮次重置。
- 决策：无需一次性 prototype；图语义、状态机与公共 contract 已由 Explore 确定，seeded graph test 到根
  `check:architecture` 的 tracer bullet 能以更低成本暴露解析与 CI 接入未知量。

## 红队自检

- 用 `import { type A, valueB }` 包装 runtime 边，仍必须被 gate 捕获。
- 用 `export *`、side-effect import、dynamic import 或 `.js` specifier 形成环，仍必须被捕获。
- 只有 `import type` 的双向模块不得让 gate 失败，但必须出现在 type-only 指标中。
- 种入自环或三节点环时，诊断必须稳定列出成员/边；删除种子后真实树回到零 runtime SCC。
- document caller 伪造 confirmation id、旧 StepVisit 或跳过 host receipt，仍必须失败关闭。
- task-plan 在 immutable publish、fault injection、current replace 或 projection 任一点失败时，不得提前写 complete；锁不得遗留。
- 两个进程同时发布 revision 时，CAS/immutable/current 结果与改造前一致，Skill failure evidence 不改变提交结果。
- 只改 source 不更新 tracked CLI/server bundle 时，freshness/bundle gate 必须失败。

```coverage
touches: kernel-import-graph, document-evidence, skill-invocation, native-task-plan, workflow-contract
L1_api:      filled -> #必须保持的不变量
L2_data:     filled -> #必须保持的不变量
L3_rules:    filled -> #runtime-import-graph-语义
L4_state:    filled -> #兼容并发与失败风险
L5_errors:   filled -> #红队自检
L6_security: filled -> #必须保持的不变量
L7_perf:     waived -> CI 线性扫描与 SCC 算法足够；无新增运行时请求路径
L8_deps:     filled -> #选择的依赖方向
L10_terms:   filled -> #runtime-与-type-only-分类
```
