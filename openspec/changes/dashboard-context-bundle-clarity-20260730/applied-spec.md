# 已应用规格

## 变更摘要

2026-07-30 在 Ship 唯一真实应用边界，将已验证的两份 Dashboard delta 同步到主规格。
两项目标均为 `changed`；未覆盖、重排或删除与本 Change 无关的既有 requirement/scenario，
没有冲突解决或例外。

## 已应用需求

| Delta source | Main spec target | Before SHA-256 | After SHA-256 | Result | 效果 |
| --- | --- | --- | --- | --- | --- |
| `openspec/changes/dashboard-context-bundle-clarity-20260730/specs/context-bundle-budget-preview/spec.md` | `openspec/specs/context-bundle-budget-preview/spec.md` | `a4f652280f566b17e6a028886de3c9e35e60860ade290ecc9f54f62870de0f1a` | `63b4ffdc73dac17b4063e0aadc7c063d2312633ef8da6e5941711ac885ac045d` | `changed` | 扩展完整预览状态：独立容量摘要、真实超限比例、静态 loading、输入顺序、键盘、错误恢复与中英文要求。 |
| `openspec/changes/dashboard-context-bundle-clarity-20260730/specs/dashboard-ui-ux-system/spec.md` | `openspec/specs/dashboard-ui-ux-system/spec.md` | `0ee286c69ef23ce0d0be201470471bb7a8bc17acc74bd669e81e16daa295f62c` | `184b2717ca7043e567ed8833244eaec47a4622aab6f9fcab9161f459628c7ad7` | `changed` | 新增 1024–1920px Context Bundle 容量层级、主题、键盘和 reduced-motion 桌面契约；未扩展手机端范围。 |

## 交付证据

- Verify 报告：
  `docs/superpowers/reports/2026-07-30-dashboard-context-bundle-clarity-20260730-verify.md`，
  冻结 Build SHA `b5750f0812eb15f99bfc1a2b635c55e5ab232f7f`，四轨结论 PASS。
- OpenSpec 1.6.0 隔离 archive/apply 演练在
  `/tmp/context-bundle-openspec-4.pNU5Ne/repo` 成功；真实应用前主规格聚合摘要保持不变。
- 真实应用后
  `openspec validate context-bundle-budget-preview --type spec --strict --json` 与
  `openspec validate dashboard-ui-ux-system --type spec --strict --json` 均 exit 0。
- `git diff --check` exit 0；应用只修改上述两份主规格和本 receipt。
