# 已应用主规格

## 应用结论

- Change：`pr-8-merge-audit`
- phase：`ship`
- verify result：`pass`
- 应用日期：`2026-08-08`
- OpenSpec 隔离演练版本：`1.8.0`（当前 latest）
- 结果：`changed`

## Delta → main spec

| Delta | Main spec | Delta SHA-256 | Before SHA-256 | After SHA-256 | 结果 |
| --- | --- | --- | --- | --- | --- |
| `openspec/changes/pr-8-merge-audit/specs/host-target-plan/spec.md` | `openspec/specs/host-target-plan/spec.md` | `b66e6c3b04df8cd31605dab397e6fed34c9359c5ff28d3b38a4ed974ae490c94` | `b8e44455a180d4a5353c04abfa2265449c2cc766fcb8f2b61e97e9f3663ca2c1` | `766a79430dfe97d5425884d01e78a56209a5abdf617a3e299c89d4ca08045869` | `changed` |

## 应用内容

- 五条 `MODIFIED` requirements 保留当前主规格对应的全部 23 个既有场景，并同步八个原 Change 已有、可逐项追溯的加强场景。
- 主规格的 8 个 requirements、33 个既有场景全部保留；应用后为 8 个 requirements、41 个场景。
- 已知场景“用户首次进入 Host Plan”及其正文完整保留。
- CLI/stdout/DTO 无效仍确定性映射到 `502 HOST_TARGET_PLAN_INVALID`；许可边界以身份中性表述禁止复制任何外部参考项目与 AGPL 受限内容，不弱化既有 clean-room 约束。

## 冲突与幂等

- 当前 OpenSpec CLI 1.8.0 与仓库固定 1.6.0 的真实隔离归档回放均为 `+0 / ~5 / -0`，两者产生逐字相同的规范内容。
- CLI 回放会在 EOF 增加一个空白行；真实应用将语义相同的输出规范为单一末尾 LF，因此 after SHA-256 为 `766a79430dfe97d5425884d01e78a56209a5abdf617a3e299c89d4ca08045869`。
- 再次应用必须识别上述 after digest 并保持 byte-preserving no-op。

## 校验

- `npx -y @fission-ai/openspec@latest validate pr-8-merge-audit --type change --strict --no-interactive` exit 0。
- `npx -y @fission-ai/openspec@1.6.0 validate pr-8-merge-audit --type change --strict --no-interactive` exit 0。
- 两个版本的真实隔离归档回放后，当前主规格全部 8/33 既有 requirement/scenario 均保留，且 `validate --all --strict --no-interactive` 均为 41/41 passed。
