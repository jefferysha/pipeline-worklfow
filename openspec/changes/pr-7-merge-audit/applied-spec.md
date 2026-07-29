# 已应用主规格

## 应用结论

- Change：`pr-7-merge-audit`
- phase：`ship`
- verify result：`pass`
- 应用日期：`2026-07-29`
- OpenSpec 隔离演练版本：`1.6.0`
- 结果：`changed`

## Delta → main spec

| Delta | Main spec | Delta SHA-256 | Before SHA-256 | After SHA-256 | 结果 |
| --- | --- | --- | --- | --- | --- |
| `openspec/changes/pr-7-merge-audit/specs/context-bundle-budget-preview/spec.md` | `openspec/specs/context-bundle-budget-preview/spec.md` | `9aad6411b28da1f895ab19a4e298dd40b64d521e32d642e4716d492de0c28ab5` | `24b7a3ef7c09384655f29d476472bde673a6a3b3eb25f38f08d19d24b23810b2` | `a4f652280f566b17e6a028886de3c9e35e60860ade290ecc9f54f62870de0f1a` | `changed` |

## 应用内容

- 将五条 `MODIFIED` requirements 的当前完整语义同步到主规格。
- 增加默认七阶段 workflow 标签随 Dashboard locale 切换的要求与场景。
- 保留 custom workflow 作者标签，不按字符或默认 phase id 猜测改写。
- 增加 Context Bundle preview 与 Verify evidence composer 共存要求及场景。
- 未删除或覆盖与该 capability 无关的主规格内容。

## 冲突与幂等

- 冲突：无。Verify 中的隔离 `openspec archive` 演练为 `+1 / ~5 / -0`，6 个 Requirement 标题唯一。
- 隔离 OpenSpec CLI 结果在文件末尾生成额外空白行，`git diff --check` 会将其报告为
  `new blank line at EOF`；真实应用保留完全相同的 requirement/scenario 内容并规范为单一末尾 LF，
  因此 after SHA-256 为 `a4f652280f566b17e6a028886de3c9e35e60860ade290ecc9f54f62870de0f1a`。
- 若目标已经是上述 after digest，再次执行应为 byte-preserving `no-op`，不得重复追加。

## 校验

- `npx --yes @fission-ai/openspec@1.6.0 validate context-bundle-budget-preview --type spec --strict --json`
  exit 0；1 个 spec passed，0 failed。
- 真实工作区应用前由 Verify 保持 canonical specs 指纹
  `08aef9037ae8b1053a6ed4b3a7ce98827289e0e3a5bbc234fcb9e370c25caf06`；
  Ship 是本 Change 唯一真实主规格写入边界。
