# 已应用规格

- Change：`issue-68-dashboard-revision-fixture-remediation`
- 应用日期：`2026-08-10`
- 结果：`changed`

## trustworthy-build-revision

- delta：`openspec/changes/issue-68-dashboard-revision-fixture-remediation/specs/trustworthy-build-revision/spec.md`
- delta digest：`sha256:d85ea47622518eee8b7b266a079c7e8e1f983e2c58daf8fcfe5c2d89801a42a9`
- target：`openspec/specs/trustworthy-build-revision/spec.md`
- before digest：`absent`
- after digest：`sha256:3ef807a8d8d3a2a98f8df6a0bb8270f80da0ac9bf4e9ae67e263dcf1ecf1a904`
- effect：新增 Dashboard 正向 Verify fixture 的可信 readiness 投影要求，并保留缺失、不可信与默认
  testkit 的 fail-closed 场景。
- conflict resolution：目标主规格此前不存在；按已验证 delta 创建规范化主规格，没有覆盖无关内容。

再次应用时若目标 digest 仍为上述 after digest，则结果应为 `no-op`，不得重复追加 requirement。
