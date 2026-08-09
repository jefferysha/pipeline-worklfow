# 提案

## Why

`packages/kernel` 当前在状态、文档生产、任务计划存储与 Skill 调用之间存在运行时 value-import 环，模糊了依赖方向，也让后续交互追踪器建立在不稳定的装配边界上。GitHub issue #45 将其列为 P1、Wave 0 的 refactor / architecture debt；父路线图为 #41，当前无前置 blocker。

## What Changes

- 消除 kernel 生产代码中的运行时 value-import 强连通分量，并保持既有文档 ledger、producer confirmation、Skill receipt 与 native task-plan 行为不变。
- 扩展架构检查：确定性解析项目相对 TypeScript import、拒绝种入的运行时环，并将 type-only 关系排除或独立报告。
- 将依赖方向决策、验证口径与 CI gate 写入可持久审计的架构文档和测试。
- 非目标：无关模块重排、公共行为重设计、Dashboard 改造、发布或合并。

## Capabilities

### New Capabilities

- 无。本 Change 扩展现有仓库架构合规 capability，不创建平行门禁概念。

### Modified Capabilities

- `repository-architecture-compliance`：增加 kernel 生产 runtime import SCC=0、确定性项目相对 TypeScript
  解析、seeded-cycle 拒绝与 type-only 独立口径；以纯状态核心、应用服务和 contract 叶子解开现有环。

## Impact

影响 `packages/kernel` 的 document/state/skill-invocation/task-plan/workflow 内部边界、`tools/check-architecture.mjs`
及新增 graph helper/node tests、根 `check:architecture` 入口、相邻测试、ADR、OpenSpec 与受控 CLI/server bundle。
不引入新依赖，不改变对外 CLI/API、错误契约或持久化格式；现有 CI 继续通过同一根命令执行新 gate。
