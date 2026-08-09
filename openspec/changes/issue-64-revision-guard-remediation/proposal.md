# 提案

## Why

GitHub Issue #42 的冻结候选 `f508fab726c62c10d4312fdd7d29f513d774dc66` 已耗尽 Review 预算 2/2，但仍有两个 P0 阻断：合法 custom Verify→Build rollback 会被 revision guard 卡死，arbitrary custom Verify-like step 的 `tenon check` 又可能漏评同一 guard。Issue #64 是独立、串行优先的缺陷修复，用于保留 #42 完整失败审计并产出新的可合并候选。

## What Changes

- 在新的 Change 与分支上修复 custom rollback 的恢复可达性，以及 custom `check`、transition、readiness 的 semantic revision 一致性。
- 同步两处已知 CLI integration fixture，使新 fail-closed 前置成立，同时保留不可信 revision 的负向断言与零写入证明。
- 以当前任务真实 receipt 登记新的 verification report，重建受控 dist，并完成风险匹配的 kernel/CLI/server/automation/Dashboard/OpenSpec 验证。
- 非目标：不重置、覆盖或发起 #42 第 3 次 Review；不改变 stable blocker code、隐私边界或无关 workflow；不 merge、不发布、不修改本机插件。

## Capabilities

### New Capabilities

- `trustworthy-build-revision`：以 #42 已实现但尚未应用到 main spec 的完整 revision trust 契约为基线，并纳入 #64 的 check/review/rollback 修复。旧 #42 Change 继续只读保留为失败审计，不作为本 Change 的可变依赖。

### Modified Capabilities

- `workflow-definition`：custom Verify-like rollback 与 success edge 的 revision lifecycle 语义。
- `workspace-verification-integrity`：所有进入/退出 Verify 的入口对可信物理绑定 revision 的一致判断与恢复路径。

## Impact

主要影响 `packages/kernel/src/workflow/` 的 lifecycle/guard 编排、`packages/cli/src/commands/check.ts` 与两处 CLI integration fixture；共享 kernel 投影会间接覆盖 API、SSE、Automation 与 Dashboard。可能同步相关 tests、受控 `dist/`、OpenSpec 与验证文档。不新增依赖，不暴露 repository/worktree 原始身份，不改变现有 typed blocker 兼容形状。

本 Change 的 delta spec 完整承接 #42 尚未应用的 durable requirements，再追加 #64 remediation 场景，确保归档 #64 后 main spec 与最终代码一致；这不会修改、删除、重置或归档旧 #42 Change 的任何审计文件。
