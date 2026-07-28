# Host Target Plan Center 主规格应用记录

- 日期：2026-07-28
- 结果：`changed`
- delta：
  `openspec/changes/host-target-plan-dashboard/specs/host-target-plan/spec.md`
- target：`openspec/specs/host-target-plan/spec.md`
- before：`absent`
- after SHA-256：
  `9d1605bed87e4bb8981edd9613b1c61371665268d523d87a60c46c9e4decb1ed`

## 应用效果

新增 `host-target-plan` durable capability，包含五个 requirements：

1. 稳定且零副作用的宿主目标目录；
2. 单目标 setup/update 计划；
3. 严格只读 Dashboard API；
4. Dashboard 宿主计划中心；
5. 向后兼容与许可边界。

应用过程保留 delta 的 requirement/scenario identity，并补充主规格所需的 `Purpose`。目标此前
不存在，因此不存在冲突或需要覆盖的无关内容。`npx openspec validate host-target-plan --type
spec --strict --no-color` 通过；重复应用时应识别为 byte-preserving `no-op`。
