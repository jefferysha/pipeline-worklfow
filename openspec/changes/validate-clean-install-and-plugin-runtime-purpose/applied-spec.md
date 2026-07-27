# 已应用规格

## 变更摘要

2026-07-28 在 Ship 唯一真实应用边界，将本 Change 的 `plugin-distribution` ADDED
requirement 应用到 durable main spec。`plugin-runtime` 不含 Change delta；其既有基线债务已按
用户约束直接补充 Purpose，`## Requirements` 后内容保持逐字一致。

## 已应用需求

- source:
  `openspec/changes/validate-clean-install-and-plugin-runtime-purpose/specs/plugin-distribution/spec.md`
- target: `openspec/specs/plugin-distribution/spec.md`
- result: `changed`
- requirement: `公开 Codex 首装 SHALL 通过真实干净宿主验收`
- before SHA-256:
  `5e1469d4d21d8a9f7b4b8ba579fa133656662df164eecc4e74d5fdcb509e7bdf`
- after SHA-256:
  `6c4438aff1087f55a1911e84447c2c04d0686b96af7a0655b11856d2c173695a`

## 交付证据

- `openspec validate plugin-distribution --strict`: PASS。
- `openspec validate plugin-runtime --strict`: PASS。
- 真实公网 exact-ref
  `776027084caca02adce7bed018689f2d94881489` clean install：PASS。
- main spec 中该 requirement 仅出现一次；Archive 将使用 `--skip-specs`，避免再次合并。
