# ADR：以纯状态核心和应用服务消除 kernel 运行时 import cycle

## Status

Accepted for Spec.

## Context

issue #45 要求 `packages/kernel/src` 生产运行时 import SCC 与从 main 可达的 cycle 同时归零，并在 CI 中阻止回归。
Explore 在冻结 main 上确认两个 SCC：document/state/Skill/task-plan 构成的六文件 SCC，以及 workflow document
contract/validator 构成的双文件 SCC。四个相关模块已接近文件硬上限。现有 architecture checker 已接入 CI，但尚不
解析 import graph。

拆环不能改变 document ledger 的 exact current-StepVisit confirmation、Skill receipt 的 fail-closed binding、task-plan
的 begin/complete/fail 时序、state lock/CAS/atomic publication 或任何公共持久化格式。

## Decision

采用“低层纯状态核心、外层应用服务、共享 contract 叶子”的依赖方向：

- document ledger 的 schema/parser/persistence 不依赖 Skill runtime；公共 recording service 在库内取得 canonical
  confirmation 后调用纯写入核心，不把 confirmation anchor 暴露给 caller。
- task-plan state store 不依赖 native Skill lifecycle；公共 publication service 在 state lock 外编排
  `begin -> publish -> complete/fail`，保持当前提交点和错误语义。
- workflow validator 与公共 contract facade 共同依赖只含常量/types/type guards 的叶子模块，消除反向 re-export 环。
- 新 architecture graph helper 使用仓库已有 TypeScript AST，确定性解析项目相对源码 import；runtime SCC 必须为零，
  type-only 边独立报告。根 `check:architecture` 同时运行 seeded-cycle 测试与真实树门禁，现有 CI 自动继承。

公共根导出名称、函数签名、错误、JSON/JSONL/目录和 projection 行为保持兼容；源码稳定后重建受控 CLI/server bundle。

## Consequences

- Skill repository 只依赖不反向触达 Skill service 的 state/read path，kernel 运行时图成为 DAG。
- 高层副作用顺序与低层持久化责任可以分别测试，接近硬上限的模块得到真实拆分。
- 内部函数和相邻测试需要迁移，但调用方无需修改公共用法。
- CI 增加一次 AST 扫描和 node fixture test；不增加第三方依赖，不维护浮动 baseline 或 cycle exception。
- type-only cycle 不阻断合并，但其分类语义和指标可审计；mixed/value import 无法借 type-only 伪装绕过。

## Rejected alternatives

- caller 注入可选 confirmation/lifecycle callback：会让关键安全与审计行为可被漏传或伪造。
- 直接把 SCC 文件合并：扩大已接近上限的模块，隐藏而非修复依赖方向。
- dynamic import、延迟加载或 checker exception：把结构问题转成初始化时序风险，并让门禁产生假阴性。
- 只用正则扫描 import：无法可靠区分 mixed/type-only、re-export、注释与 TypeScript source resolution。
