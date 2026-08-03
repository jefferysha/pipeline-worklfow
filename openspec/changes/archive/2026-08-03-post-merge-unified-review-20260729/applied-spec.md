# 已应用主规格（2026-08-03）

Change：`post-merge-unified-review-20260729`

## 应用结果

| Delta | 主规格目标 | Before SHA-256 | After SHA-256 | 结果 |
| --- | --- | --- | --- | --- |
| `openspec/changes/post-merge-unified-review-20260729/specs/dashboard-ui-ux-system/spec.md` | `openspec/specs/dashboard-ui-ux-system/spec.md` | `184b2717ca7043e567ed8833244eaec47a4622aab6f9fcab9161f459628c7ad7` | `17b9dc305a1af1c1baa5a01e0d8c40beefbf379b8b477e3bb06ce83b19ab1fc4` | `changed` |
| `openspec/changes/post-merge-unified-review-20260729/specs/repository-architecture-compliance/spec.md` | `openspec/specs/repository-architecture-compliance/spec.md` | `cf141f5b4ea0a673022ff7b071e1f16710f6affe6f6c198cc45f096a2a18a03e` | `63d3fee2bdd48b47edb87b5d5ec1d321eeca45ab27aa3f1178d50d064b0797b5` | `changed` |

## 摘要

- Dashboard 主规格新增双语一致性、项目级危险动作精确上下文绑定与 Governance
  升档确认稳定身份要求。
- 仓库架构主规格新增依赖安全门、OpenSpec 活跃树严格验证与聚合快照稳定
  `tasks.md` 读取要求。
- 保留两份主规格的既有要求，未删除或改写无关内容。
- `npx openspec validate --all --strict`：38/38 通过。
- 对已经出现的 requirement/scenario identity 再次应用时不再追加内容，结果为 byte-preserving
  `no-op`；真实 apply 仅发生在本次 Ship。
