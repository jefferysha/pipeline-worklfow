# 已应用规格

- Change：`issue-67-afk-empty-queue-remediation`
- 应用日期：`2026-08-10`
- 结果：`changed`

## workflow-skill-enforcement

- delta：`openspec/changes/issue-67-afk-empty-queue-remediation/specs/workflow-skill-enforcement/spec.md`
- delta digest：`sha256:8d67563f1aa79b8dc2bfa53178b8e2d8359a07cea0c9831037aff45770b3ca1c`
- target：`openspec/specs/workflow-skill-enforcement/spec.md`
- before digest：`sha256:5351997f19c176ae4ce7cf2f6b2c112ba6e97078179a7e557727104579de7c83`
- after digest：`sha256:e9ddd31fba080072f1fe22844f82f99be4021ffff9a64c04efc2d789a55f455c`
- effect：扩展 AFK preparation 契约，明确 wiring-before-scan、空队列成功、Docker unavailable
  失败与 phase Skill 缺失失败关闭；保留主规格已有的 `Profile 存在但 phase Skill 缺失` 场景。
- conflict resolution：使用 Verify 第二次隔离 archive 演练已通过的完整 `MODIFIED` requirement 替换
  同名主规格 requirement，保留其余 requirements 与 scenarios 不变。

重复应用时若目标 digest 仍为上述 after digest，结果必须为 byte-preserving `no-op`，不得重复追加
requirement 或 scenario。

## 交付证据

- `openspec validate issue-67-afk-empty-queue-remediation --strict`：PASS。
- `openspec validate --all --strict`：`51/51` PASS。
- Verify 已在隔离副本完成 `specsUpdated=true` 的 archive/apply 演练；本次 Ship 只真实写入同一结果。
