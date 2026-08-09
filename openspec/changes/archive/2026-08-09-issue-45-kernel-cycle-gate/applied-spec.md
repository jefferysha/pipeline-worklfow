# 已应用规格

## 变更摘要

在 Ship 的唯一真实应用边界，将 issue #45 已验证的 4 条 `ADDED Requirements` 从 Change delta
幂等应用到 `repository-architecture-compliance` 主规格。未修改或删除既有 requirement，未发生 identity
冲突，也未调用历史 migration/reconciliation 工具。

## 已应用需求

| Delta source | Main spec target | Before SHA-256 | After SHA-256 | Result |
| --- | --- | --- | --- | --- |
| `openspec/changes/issue-45-kernel-cycle-gate/specs/repository-architecture-compliance/spec.md` | `openspec/specs/repository-architecture-compliance/spec.md` | `63d3fee2bdd48b47edb87b5d5ec1d321eeca45ab27aa3f1178d50d064b0797b5` | `14191a059c5ca574847e923ecd08128a355853f405d5bb84081bd5de88302867` | `changed` |

应用内容：

- `Kernel 生产运行时 import 图 SHALL 无环`
- `Runtime 与 type-only import SHALL 使用 AST 语义分类`
- `拆环 SHALL 保持文档与 TaskPlan 审计行为兼容`
- `Canonical architecture 命令 SHALL 在 CI 阻止 cycle 回归`

每条 requirement 与全部 scenario identity 均在应用前与现有主规格比对；主规格中不存在同名条目，故按
delta 原文追加。重复运行 identity 检查时这些条目均已存在，应保持 bytes 不变并记录 `no-op`，不得重复追加。

## 交付证据

- 日期：`2026-08-10`（Asia/Shanghai）
- `npx openspec validate repository-architecture-compliance --strict --json`：1/1 PASS。
- Verify clean clone 的官方 archive/apply 演练：4 added、42/42 strict validation PASS。
- 冲突处理：无。
- 剩余交付：登记本 receipt、提交并推送唯一分支、创建关联 `Closes #45` 的非草稿 PR、正式 Archive
  使用 `--skip-specs`，最后等待 PR exact-head CI；不合并、不发布版本。
