# `fix-tenon-entry-skill-contract` 主规格应用收据

- 日期：2026-07-27
- 执行 Skill：`openspec-apply-change`
- 结论：五份 delta 的 14 条新增 requirement 已逐项应用；未覆盖或删除无关主规格内容。

## 应用清单

| Delta | Main spec | Before SHA-256 | After SHA-256 | 结果 |
| --- | --- | --- | --- | --- |
| `openspec/changes/fix-tenon-entry-skill-contract/specs/dashboard-project-selection/spec.md` | `openspec/specs/dashboard-project-selection/spec.md` | `absent` | `230bb6d0464cec7cc61fcf46b6875eb7f631e64a1ae7f8f18d41a0a2815cff63` | `changed` |
| `openspec/changes/fix-tenon-entry-skill-contract/specs/normal-chat-routing/spec.md` | `openspec/specs/normal-chat-routing/spec.md` | `227db3a45bc67efa5dd56f08fcafcca5286cbee1c12e017dc6ca9051c0b56068` | `dac78a398ff6ef3e6bb0e0d913f1bf9add08a7bc0e61fca1d300c8c6c289d7d6` | `changed` |
| `openspec/changes/fix-tenon-entry-skill-contract/specs/plugin-distribution/spec.md` | `openspec/specs/plugin-distribution/spec.md` | `346ac3a93a00032006fdd89b8911e528d7fb4edaebf182c09d581c688b3f458e` | `5e1469d4d21d8a9f7b4b8ba579fa133656662df164eecc4e74d5fdcb509e7bdf` | `changed` |
| `openspec/changes/fix-tenon-entry-skill-contract/specs/plugin-runtime/spec.md` | `openspec/specs/plugin-runtime/spec.md` | `6d06e77aba4edc047b61e4c72dfcc056a6a9f72dc31ac1eb48d67eb429d40f2c` | `501e9c1da7dbf1b54aca1819dd95c6e557f025d4f70614b7beced469e744cf1d` | `changed` |
| `openspec/changes/fix-tenon-entry-skill-contract/specs/tenon-product-identity/spec.md` | `openspec/specs/tenon-product-identity/spec.md` | `eb1180bf7fba8ca5b368f87ff4565368b8335a0102b0b2d51e52b37efd74e097` | `34158ae22b60d47809075cd5343e973fd3660e8c13a08ac47228df7deefd1555` | `changed` |

## 效果

- Dashboard 项目上下文只由有效 URL root 或用户显式选择产生，失效选择失败关闭。
- 正常开发对话统一到 `tenon:tenon`，持续授权绑定精确 Change 与 host session。
- 原生安装、宿主 inventory 对账、ADR living-document 更新和唯一入口契约成为 durable spec。
- managed runtime 的 WAL、Dashboard transaction ownership、Build→Verify 全量收敛、
  repo-zero-output 与一次性 Verify 聚合成为全局默认流程契约。
- 产品身份真相源、发行仓库名称卫生和根入口投影成为发布前硬门。

## 校验与已知基线

- `dashboard-project-selection`、`normal-chat-routing`、`plugin-distribution`、
  `tenon-product-identity` 均通过 OpenSpec 1.6.0 strict validate。
- `plugin-runtime` 的全部 delta 已应用且 requirement/scenario 身份与隔离演练一致；该主规格仍因
  本 Change 之前已经存在的 `Purpose` 缺失而无法 strict validate。根据本 Change 明确非目标，
  本次不顺带修改该基线债务；后续必须用独立 Change 修复。
- 本收据记录的是 Ship 的真实主规格变更；Verify 隔离副本没有修改真实主规格。
