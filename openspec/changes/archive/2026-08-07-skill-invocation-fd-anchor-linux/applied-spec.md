# 已应用规格

## 变更摘要

将 `skill-invocation-evidence` 的 Linux directory-FD anchored read 安全契约同步到主规格。普通 symlink/path alias 拒绝保持不变；只有仍持有已验证目录 FD 且 dev/ino 精确匹配时允许读取可遍历 FD alias，任一身份或读取窗口变化均失败关闭。

## 已应用需求

- source delta：`openspec/changes/skill-invocation-fd-anchor-linux/specs/skill-invocation-evidence/spec.md`
- target main spec：`openspec/specs/skill-invocation-evidence/spec.md`
- requirement：`严格 append-only repository`
- result：`changed`
- before SHA-256：`4432dfe5c25a6b5e93aeb426b0340929733323e3df6608af538c98f781e47cc8`
- after SHA-256：`5a08c028776f49290b95ba3cfa4db03dbde34405b8e4e24884e05229b376d9c0`
- applied date：`2026-08-07`
- conflict resolution：无冲突；保留原并发与幂等 scenario，并追加普通 alias 拒绝、已验证 Linux FD alias 成功及身份/读取窗口变化失败关闭三个 scenario。

## 交付证据

- `openspec validate --specs --strict`：34 passed，0 failed。
- Verify 隔离副本 `openspec archive skill-invocation-fd-anchor-linux --yes --json`：`modified=1`、`specsUpdated=true`，归档后 34 specs strict validate 全部通过。
- 重复应用判定：目标 requirement 与 delta 文本、scenario identities 已对齐；再次执行应为 byte-preserving `no-op`，不得重复追加。
