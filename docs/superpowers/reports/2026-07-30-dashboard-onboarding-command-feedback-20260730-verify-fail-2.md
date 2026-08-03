# Dashboard Onboarding Command Feedback — Verify 回退报告（第 2 轮）

- Change：`dashboard-onboarding-command-feedback-20260730`
- 冻结 build SHA：`36b12921daf330998624e3496d4e04b8f42b0a33`
- 冻结 tree：`5c82fbee3b32f0c9526ebf3366a85c6e24f41678`
- 结论：**FAIL，回到 Build 修复**
- 时间：2026-07-30 11:57 CST

## 聚合结论

Reviewer、隔离 E2E/build 与 Visual 三轨均 PASS，但 Codex CLI 独立审查确认 1 个
P2 / Medium：`no-change` Onboarding 在 root 切换且 `CmdRow` 被 React 复用时，
旧命令尚未完成的 clipboard Promise 或反馈 timer 不会因 `cmd` 变化失效。新命令
可能暂时保持 `aria-disabled`，并随后显示属于旧命令的 success/error，违反诚实反馈
与迟到结果隔离契约。

持续自主模式按最保守决策修复，不接受偏差。

## 四轨结果

| 轨道 | 结果 | 证据 |
| --- | --- | --- |
| Reviewer | PASS | 完整重审 feature diff、调用方、Change、治理链与生成资产；旧 `<1024px` Medium 已修复，无 Critical/High/Medium，只有已记录的 Low 文档歧义。 |
| E2E / build | PASS | 隔离副本 `npm ci`、根构建、`typecheck:web`、相邻 Vitest 66/66、Onboarding 14/14、production HTTP smoke 与 1024 编译 CSS 契约均通过。 |
| Codex CLI | FAIL | 全量 base review 与 `test:web` 1225/1225 后确认 P2：`cmd` 变化未重置 generation/timer/state，旧 clipboard 结果可污染新命令。 |
| Visual | PASS | 仅四个桌面视口、双语、Light/Dark/System、键盘、四态、重复提交、overflow、reduced-motion 与 console 均通过；无 severity finding。 |

任一 Medium 禁止 `verify-pass`，因此本轮不设置 reviewer pass 字段，也不运行成功出口。

## 其他硬门证据

- OpenSpec 隔离副本 archive/apply 成功，新增 2 requirements；归档后主 spec strict validate 通过。
- 真实 `openspec/specs/dashboard-ui-ux-system/spec.md` 前后 digest 均为
  `781452bdf42a4436f271a822c87884a36c144cbd1acd323b3085b6f9b0c1d897`。
- 三轨前后冻结 tree 均为 `5c82fbee3b32f0c9526ebf3366a85c6e24f41678`，实现零漂移。
- 未运行或声称任何手机端验收。

## 修复与第三轮回归

1. 先新增测试：`no-change` 在旧命令 pending 时 rerender 到新 root，新命令必须回到 idle；
   旧 Promise 完成后不得写入新命令反馈。
2. 让命令身份变化触发 `CmdRow` 卸载/重建，复用既有 unmount generation 与 timer cleanup。
3. 重跑相邻与全量测试、类型、根构建和静态门禁，重建 production asset。
4. 冻结新 SHA 后重新运行完整 Reviewer、隔离 E2E/build、Codex CLI 与 Visual 四轨，
   不只复查本 finding。

## 非阻塞信息

- 已批准 Superpowers design 三处仍泛称 `disabled`；delta spec、实现、测试与 REVIEW
  已明确真实契约为 `aria-disabled=true` 加状态机防重入，留待合法 Spec 修订窗口统一。
- `npm ci` 仍报告既有 7 个 advisories；本批未修改依赖或 lockfile。
- Vite 保留既有 chunk-size warning。
