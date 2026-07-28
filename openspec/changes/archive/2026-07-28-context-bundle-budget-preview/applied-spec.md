# 已应用规格

- Change：`context-bundle-budget-preview`
- 应用日期：2026-07-28
- 结果：`changed`
- 冲突处置：无冲突；目标 capability 首次创建

## 变更摘要

将 Context Bundle 预算预览的 5 项已验证新增需求应用为持久主规格：共享 ledger-bound
编译服务、受 registered root 锚保护的只读 API、稳定 fail-closed 错误契约、Dashboard 完整状态
与中英文无持久化交互。

## 已应用需求

| Delta | 主规格目标 | Before digest | After digest | 结果 |
| --- | --- | --- | --- | --- |
| `openspec/changes/context-bundle-budget-preview/specs/context-bundle-budget-preview/spec.md` | `openspec/specs/context-bundle-budget-preview/spec.md` | `absent` | `sha256:f20d815f3db7f6e4cbd507ec4cfa51723c6172fe07ce04804d56c8b3d94397a1` | `changed` |

## 交付证据

- `openspec validate context-bundle-budget-preview --type spec --strict --no-interactive`：exit 0，
  `Specification 'context-bundle-budget-preview' is valid`。
- Verify 隔离演练已使用 `openspec archive context-bundle-budget-preview --yes --json` 证明
  5 项 requirement 可应用，且真实主规格直到 Ship 前保持不变。
- 本次 Ship 是唯一真实应用边界；Archive 必须使用 `--skip-specs`，不得再次合并 delta。
- 重复核对主规格 requirement/scenario identity 后无重复项；对当前目标再次应用为 byte-preserving
  `no-op`。
