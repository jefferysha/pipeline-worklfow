# 已应用主规格

- Change：`dashboard-review-inbox-triage-20260729`
- 应用日期：`2026-07-29`
- 结果：`changed`

## dashboard-ui-ux-system

- Delta：
  `openspec/changes/dashboard-review-inbox-triage-20260729/specs/dashboard-ui-ux-system/spec.md`
- 主规格：`openspec/specs/dashboard-ui-ux-system/spec.md`
- Before SHA-256：
  `d87726785ca05a783d112475e692eb16caeb85259936d56c54bd2f930e5fd307`
- After SHA-256：
  `ac489b1f42b1ceaf65c8598ecd1fe5807b239ea71363bbf1dd2c96a713494581`
- 效果：新增 `Progress 状态筛选交互一致性` requirement 及聚焦待复核、键盘切换、筛选零结果、
  reduced-motion/主题四个场景；保留主规格中的其他 requirements 与既有小屏契约。
- 冲突处理：无。目标 requirement 在应用前不存在；按 requirement/scenario identity 单次追加。

## 校验

- `openspec validate dashboard-ui-ux-system --strict`：通过。
- `openspec validate dashboard-review-inbox-triage-20260729 --strict`：通过。
- 重复应用判定：主规格已包含唯一同名 requirement 时应为 byte-preserving `no-op`，不得重复追加。
