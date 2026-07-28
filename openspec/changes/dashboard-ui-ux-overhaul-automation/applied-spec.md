# 已应用规格

## 变更摘要

2026-07-28 在 Ship phase 将已通过第五次 Verify 的 Dashboard UI/UX 增量规格应用为持久主规格。
目标 capability 此前不存在，因此本次结果为 `changed`；未覆盖或修改其他 capability。

## 已应用需求

- 来源：`openspec/changes/dashboard-ui-ux-overhaul-automation/specs/dashboard-ui-ux-system/spec.md`
- 目标：`openspec/specs/dashboard-ui-ux-system/spec.md`
- before：`absent`
- after：`sha256:90c38d06378cc17b71d06883f09dd600c2e60fdebf948e087bc4d2455b3909c0`
- result：`changed`
- requirements：一致的语义视觉层级、桌面工作区适配、键盘与屏幕阅读器可操作、
  有目的且可降级的动效、完整状态反馈、可审查的增量交付。

## 交付证据

- Verify 隔离 archive/apply：exit 0，`specsUpdated=true`，added=6。
- 真实应用后 `/opt/homebrew/bin/openspec validate dashboard-ui-ux-system --type spec --strict`：
  `Specification 'dashboard-ui-ux-system' is valid`。
- 应用边界：真实主规格仅在 Ship 写入；Archive 必须使用 `--skip-specs`，避免重复合并。
- 幂等约束：若 after digest 已等于上述值，重复执行为 byte-preserving `no-op`。
