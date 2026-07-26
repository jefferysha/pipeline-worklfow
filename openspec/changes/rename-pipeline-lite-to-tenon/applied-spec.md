# Tenon 主规格应用收据

## 应用信息

- Change：`rename-pipeline-lite-to-tenon`
- 日期：`2026-07-26`
- 阶段：`ship`
- 结果：`changed`
- 验证：`openspec validate <capability> --type spec --strict`
- 隔离演练：`openspec archive rename-pipeline-lite-to-tenon --yes`

Ship 将 Verify 已通过隔离演练的 5 份 delta 应用到主规格。新建 capability 使用明确的中文
Purpose，未保留 OpenSpec 自动生成的 `TBD`；既有 capability 只追加本 Change 的 requirement
与 scenario，不覆盖无关内容。

## 逐规格结果

### dashboard-execution-provenance

- delta：`openspec/changes/rename-pipeline-lite-to-tenon/specs/dashboard-execution-provenance/spec.md`
- main：`openspec/specs/dashboard-execution-provenance/spec.md`
- before：`absent`
- after：`sha256:4e8063efbbbff8ff5145c5aa4ac3df8817545ef8996a443ffd03cda012d41337`
- effect：`changed`

### open-source-documentation-experience

- delta：`openspec/changes/rename-pipeline-lite-to-tenon/specs/open-source-documentation-experience/spec.md`
- main：`openspec/specs/open-source-documentation-experience/spec.md`
- before：`sha256:08f681c22d76a94ba6388f3b49100317d0db5e350e056a0a625eea688c255857`
- after：`sha256:5d8e53c7639f9c65aabecff01f785d215fd6c6ffe457481d0caf25f02cc00a72`
- effect：`changed`

### plugin-distribution

- delta：`openspec/changes/rename-pipeline-lite-to-tenon/specs/plugin-distribution/spec.md`
- main：`openspec/specs/plugin-distribution/spec.md`
- before：`sha256:e28a5d0580ee86a9e5db6380c331585e323086617e17dd28da77d492d666c87d`
- after：`sha256:6b29b18614e27d129b6e16a3d50c16afbf8f42cea78d6afcc27de71e24f399bb`
- effect：`changed`

### repository-architecture-compliance

- delta：`openspec/changes/rename-pipeline-lite-to-tenon/specs/repository-architecture-compliance/spec.md`
- main：`openspec/specs/repository-architecture-compliance/spec.md`
- before：`sha256:12860f1f4f7bbe56f3a7036d612f04606e9be8311f869cc7e2f3ed0ba8bf4ac8`
- after：`sha256:818f01ec93f325bd04d13750ce29bb7529dca531536db02a906865c79d6d29c0`
- effect：`changed`

### tenon-product-identity

- delta：`openspec/changes/rename-pipeline-lite-to-tenon/specs/tenon-product-identity/spec.md`
- main：`openspec/specs/tenon-product-identity/spec.md`
- before：`absent`
- after：`sha256:eb1180bf7fba8ca5b368f87ff4565368b8335a0102b0b2d51e52b37efd74e097`
- effect：`changed`

## 冲突与剩余工作

- 未发现 requirement 或 scenario 身份冲突。
- 5 份主规格均通过 strict validate。
- GitHub 仓库、Pages、Release 与正式 `18765` 的外部交付在本阶段后续步骤完成。
