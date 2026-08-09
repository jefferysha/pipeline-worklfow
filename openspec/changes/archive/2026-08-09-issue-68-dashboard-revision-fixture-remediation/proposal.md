# 提案

## Why

GitHub Issue #64 的冻结候选 `d017e75c001dca4f109d905c872b5c5624324aef` 已耗尽 Review 预算 2/2；其 kernel、CLI、server revision guard 定向矩阵通过，但最终 Dashboard full gate 稳定暴露 4 个文件、17 个旧 fixture 失败。Issue #68 必须作为独立 remediation 保留 #42/#64 的失败审计，并让 Dashboard 正向 fixture 与 canonical revision readiness 契约重新一致。

## What Changes

- 复现并分类 `App.test.tsx`、`inbox.test.tsx`、`ProjectsView.test.tsx`、`TaskDetail.test.tsx` 的 17 个失败，扫描同类 verdict、attention、progress fixture。
- 让本意验证“可操作 Verify 卡”的正向 fixture 使用与生产 snapshot 相同的可信 revision/readiness 前置；只有隔离 RED 证明真实投影缺口时才修改必要展示逻辑。
- 增加 presentation/view-model 与 API contract 的聚焦回归，随后只对稳定产品候选运行一次完整门和一次 exact-head CI。
- 非目标：不伪造 trusted state、不弱化缺失/不可信物理绑定的 fail-closed 阻断，不修改本机插件，不启动 #42/#64 第 3 次 Review，不 merge 或发布。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `trustworthy-build-revision`：待 Explore/Spec 确认是否仅补 Dashboard fixture/coverage，或需要澄清现有投影场景；不改变 fail-closed 产品语义。

## Explore 结论

精确重跑确认 6 files / 310 tests 中 4 files / 17 failures（App 2、inbox 8、ProjectsView 6、TaskDetail 1）；`progressModel` 与 `ProgressView` 相邻回归通过。失败共同来自正向 Verify fixture 未携带服务端 canonical revision/readiness 投影，未发现 production projection RED。修复边界锁定四个测试文件的正向 fixture，显式注入 server-shaped trusted `workflowExecution.readinessByTransition.verify`；缺失/不可信/rollback/零 mutation/privacy 负测不变。

## Impact

预期主要影响 `packages/dashboard-app` 的测试 fixture 与相邻 presentation/view-model/API contract coverage；生产 Dashboard 代码只有在新 RED 证明必要时才进入范围。分支从 #64 精确冻结头开始，因此最终 PR 同时承接 #42/#64 已实现但未交付的 revision guard 变化；不新增依赖，不改变公共 blocker code、revision token 隐私或服务端持久化格式。
