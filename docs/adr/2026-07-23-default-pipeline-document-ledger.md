# ADR: Default pipeline 使用独立文档证据账本

- Status: Accepted
- Date: 2026-07-23
- Change: normal-chat-default-orchestration

## Context

OpenSpec proposal/design/tasks、delta specs、Superpowers 设计/计划和 ADR 都是文件，但旧实现只在
`.pipeline.yaml` 中保存少数路径字段。阶段转移无法得知其余文件是否存在，也无法防止后续阶段基于过期
文档执行。

## Decision

在每个 change 下新增 `.pipeline-documents.json`，独立保存文档 kind、相对路径、SHA-256、producer 和
按 phase 记录的 hash receipt。它由 `pipeline document` 命令和 transition/check 读取，受现有 change
锁与原子发布保护。

不向 `.pipeline.yaml` 增加自由路径字段；该文件是既有 CLI/API 的稳定公共契约，文档集合天然是一对多，
强行编码进标量字段会造成迁移和并发风险。

## Consequences

- default 的文档流程从指导性文字变为可验证的行为。
- 文档更新会自动让后续 read receipt 失效，需重新读取。
- 旧 custom workflow 默认保持兼容；只有显式 `openspec_contract: required` 的新 workflow 进入同一治理面。
- 需要在 CLI、server snapshot、Dashboard 和 Codex 安装器之间维护明确的证据 DTO，但不改变现有 `/api`
  路径或 `.pipeline.yaml` 解析格式。
