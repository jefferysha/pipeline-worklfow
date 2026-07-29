# 已应用规格

## 变更摘要

将 `related-session-memory` 的六项 delta requirement 合并为新的主规格
`openspec/specs/related-session-memory/spec.md`。目标规格此前不存在，因此本次为纯新增，
未覆盖或删除既有 requirement。

## 已应用需求

- 在 Dashboard 任务详情中提供项目级跨宿主 Related Sessions 查询。
- 仅允许当前项目的 Claude、Codex、OpenCode 与 Pi 会话参与候选集。
- 对发现、读取、候选数、返回数与时间实施硬预算，并显式返回 partial warning。
- 只从原始 user turn 生成公开 excerpt，保留 synthetic provenance 隔离。
- 通过受保护的 POST API、single-flight 和稳定错误码提供服务。
- 提供中英文加载、空、失败、partial、重试与键盘/IME 交互路径。

## 交付证据

- Source: `openspec/changes/related-session-memory/specs/related-session-memory/spec.md`
- Target: `openspec/specs/related-session-memory/spec.md`
- Source digest: `23761f73eb70f2005b43d1d1ec0188b54a9160735a802d9364fb8594df7b7dab`
- Target digest before apply: `MISSING`
- Target digest after apply: `a042452d29cdccbd84915cb671e44d559f1b342ec9a05699a776d7037abd0dfc`
- Result: `changed`（新增 6 项 requirement；无冲突）
- Applied at: `2026-07-28`
- Validation: `openspec validate related-session-memory --type spec --strict`
