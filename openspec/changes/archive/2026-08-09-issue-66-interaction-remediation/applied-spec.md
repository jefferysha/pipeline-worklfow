# 已应用规格

## 变更摘要

- Change：`issue-66-interaction-remediation`
- 应用日期：`2026-08-10`
- 结果：两份 delta 均为 `changed`
- 冲突处理：无语义冲突。既有 provenance 主规格保留全部无关需求并追加本 Change 的 canonical review binding 要求；observability 主规格此前不存在，按已验证 delta 新建。

## 已应用需求

| delta | main spec | before SHA-256 | after SHA-256 | 结果 | 摘要 |
| --- | --- | --- | --- | --- | --- |
| `openspec/changes/issue-66-interaction-remediation/specs/interaction-and-skill-provenance/spec.md` | `openspec/specs/interaction-and-skill-provenance/spec.md` | `85599755d2374f12ec4232b234b16c5717fe5b216afb631ba3d3114f32a128c6` | `3d4b96afa40986a443e0a5349505cc8d4b8040b00194a5d6433c64613be4fd2b` | `changed` | 新增 bounded physical decision-state binding、canonical bytes、race fence、legacy fail-closed 与 fresh exact request recovery。 |
| `openspec/changes/issue-66-interaction-remediation/specs/interaction-observability/spec.md` | `openspec/specs/interaction-observability/spec.md` | `absent` | `f5decc970c7938931db27f9d7eee01d6ffb6fd6b9b5c1a0badb8235e3fb02d1f` | `changed` | 新建 InteractionEventV1、append-only projection、replay terminal fence、scorecard 与 fixture/distribution 契约。 |

## 交付证据

- `npx openspec validate interaction-and-skill-provenance --type spec --strict --no-interactive`：PASS。
- `npx openspec validate interaction-observability --type spec --strict --no-interactive`：PASS。
- 应用前已在 Verify 的隔离副本完成 archive rehearsal；本次 Ship 只把同一已验证结果真实写入主规格。
- 重复应用判据：两份主规格与上表 after digest 相等时必须保持 byte-preserving `no-op`，不得重复追加 requirement。
