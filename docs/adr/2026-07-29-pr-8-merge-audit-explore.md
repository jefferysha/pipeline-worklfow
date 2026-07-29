# ADR：PR #8 采用“合并当前主线后重新证明”的策略

## 背景

PR #8 基于 `main@15fe619b`，当前 `main@4c242b92` 已前进 55 个提交。预合并出现 4 个内容冲突，并且当前主线的 plugin distribution、managed runtime、Dashboard IA 与治理证据都已演进。原 PR 自带完整 Change 与验证报告，但它们不能证明当前主线组合。

## 决策

在 Build 使用普通 merge commit 把最新 `origin/main` 合入 PR #8 审计分支，逐项解决冲突并保留双方能力。Host Target Plan 继续采用 CLI 真相源、server 严格只读 adapter、Dashboard 功能域的三层边界；随后按当前规则以 TDD 修复全部语义漂移。Dashboard 强制执行 `design-taste-frontend` 和真实浏览器矩阵。

冻结要求前，不复用旧 verification pass。任何 capability 语义变化必须回 Spec；任何 Verify 失败必须回 Build 并重新冻结全部轨道。

## 备选方案

- 直接合并原 PR：拒绝，因为旧证据无法覆盖当前主线。
- 丢弃原 PR并重写：暂不采用，因为现有 capability、测试与文档可在严格审计下复用。
- 只保留 CLI、删除 Dashboard：拒绝，因为用户明确要求前后端与 Dashboard 全覆盖。

## 后果

- 合并与验证成本提高，但可审计地避免旧证据误用。
- 生成物冲突必须从最终源码重建，不能手工拼接。
- server/CLI/Dashboard 的重复 contract 真相必须被跨端测试或更窄共享边界约束。
- 归档治理提交可能在 PR 合并后产生，后续批量 release Change 必须把它带入 `main`。
