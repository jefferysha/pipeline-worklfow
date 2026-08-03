# 已应用规格

## 应用结果

- 日期：2026-07-29
- 结果：`changed`
- 来源：
  `openspec/changes/codex-skill-receipt-same-turn/specs/codex-skill-receipt-current-turn/spec.md`
- 目标：`openspec/specs/codex-skill-receipt-current-turn/spec.md`
- before digest：`absent`
- after digest：`a34d109298a3bdba3f0959bc9d59901c574e0ccc470dd365ee4b831089cc0cec`

## 效果

新增 4 项持久 requirement，固定 sibling worktree 项目身份、受限 custom tool-program、
完整结果/ABI 配对，以及当前 session/turn 与 transcript inode 完整性边界。隔离 archive/apply
演练和应用后的 capability strict validation 均通过；未修改其他主规格。

## 幂等性

再次应用相同 delta 时，若目标 digest 仍为
`a34d109298a3bdba3f0959bc9d59901c574e0ccc470dd365ee4b831089cc0cec`，结果必须为
`no-op`，不得重复追加 requirement 或 scenario。
