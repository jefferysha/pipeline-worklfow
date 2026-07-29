# Dashboard Progress 待复核分诊 — Verify 失败报告

## 冻结基线

- Change：`dashboard-review-inbox-triage-20260729`
- Track：`frontend`
- Build SHA：`7ae8d73468714f6d4e7e6f26efcc708cf084e7fa`
- Base SHA：`7c59eecfba9e8652d69e25dae01058ae1df783be`
- 结果：**FAIL — 回退 Build**

四轨均读取同一冻结提交。Reviewer、E2E 与视觉轨通过；Codex CLI 轨发现一个 Medium
规格一致性缺陷，因此本轮不能进入 Ship。各轨结束后 HEAD 与 Dashboard 产品文件均未漂移。

## 聚合发现

### Medium

`ProgressView` 的画布先按 `effectiveWf` 过滤 workflow，但传给 `ProgressToolbar` 的
`deckCounts` 与 `rowCount` 仍按全项目 `flatRows` 计算。组合选择 workflow 与状态后，页签徽标按既有
契约保持全项目计数是正确的，但新增摘要会把不在当前画布中的任务计入匹配/上下文数。

复现：选择只有一个非运行任务的 `release-train`，再选择“运行中”。当前画布实际为
`匹配 0 / 上下文 1`，摘要却显示 `匹配 1 / 上下文 5`。

修复要求：

- 页签徽标继续使用全项目分类计数，不改变既有契约。
- 新摘要单独使用当前 workflow 画布范围的匹配数与上下文数。
- 先增加组合筛选失败测试，再做最小修复，并重新运行完整 Verify。

### Low

- 被禁用的上下文卡仍以低透明度保留“打开 / Open”文字与子级 hover 色；交互、焦点和无障碍隔离
  已完整，不阻断本批。
- 测试尚未用显式 spy 断言键盘切 tab 的 API 调用数为 0，也未单测已有 Snapshot 后后台
  loading/error 重渲染保持选中 tab；现有调用链审查和浏览器行为没有发现产品缺陷。

## 四轨结果

- Reviewer：PASS；60 个交付文件及 `dashboard-ui-ux-system` capability 全覆盖，Critical/High/Medium
  为 0。
- E2E：PASS；定向 `ProgressToolbar`、`WorkflowCanvas`、`ProgressView` 共 84/84 通过。
- 视觉：PASS；1024×768、1200×870、1440×900、1920×1080，三主题、键盘、状态、
  disabled、焦点归还与 reduced-motion 均无 Critical/High/Medium。
- Codex CLI：FAIL；完整 diff、生成资产、OpenSpec、ledger、i18n 与隔离构建已审，发现上述
  workflow + 状态组合计数 Medium。

## 命令与状态证据

- `npm run typecheck:web`：通过。
- `npm run test:web`：68 files / 1205 tests 通过。
- `npm run build`：通过；Dashboard JS 890.20 kB，保留既有大 chunk warning。
- `npm run check:comments`：通过。
- `npm run check:architecture`：665 production files，5 个既有 size-only exceptions，通过。
- `npm run check:repository-hygiene`：7 tests，通过。
- `git diff --check`：通过。
- Codex 隔离副本：全仓 build 与 committed Dashboard dist 字节比较通过；定向 88/88 通过。
  全量前端 1202 tests 通过，唯一 `serverIntegration` 因其只读沙箱禁止监听
  `127.0.0.1`（`EPERM`）未完成；真实工作区的完整 1205 tests 已通过。
- `openspec validate dashboard-review-inbox-triage-20260729 --strict`：通过。
- 隔离 archive/apply：成功，目标 `dashboard-ui-ux-system` 主规格 strict validate 通过；真实主规格
  digest 前后均为 `d87726785ca05a783d112475e692eb16caeb85259936d56c54bd2f930e5fd307`。

## 桌面浏览器证据

- 最终 bundle 标题为 `Tenon Dashboard`，目标 URL 与注册 root 已核对。
- 四个电脑端视口 document/main 横向溢出均为 0；未运行手机验收。
- “等你动手”显示 `匹配 1 个 · 上下文 3 个`，非匹配卡为
  `data-dim=true + disabled + aria-hidden=true`。
- ArrowLeft/Right/Home/End 同步焦点与选择，tablist 只有一个 `tabIndex=0`。
- Light/Dark/System、loading `role=status`、错误 `role=alert` + retry、真实空项目、不显示伪造摘要、
  reduced-motion 直接终态均通过。
- 截图与视觉轨证据仅存 `/private/tmp/dashboard-review-triage-after-*.png` 与
  `/private/tmp/dashboard-verify-*.png`，未写入仓库。

## 文件到规格回读

| 改动范围 | 对应规格 | 结论 |
| --- | --- | --- |
| `ProgressToolbar.tsx`、测试、i18n | `openspec/specs/dashboard-ui-ux-system/spec.md` | 组合筛选摘要 Medium，需返工 |
| `WorkflowCanvas.tsx` 与测试 | 同上 | disabled/aria-hidden/hover 隔离符合 |
| `ProgressView.test.tsx` | 同上 | 缺少 workflow + 状态组合摘要回归 |
| `packages/dashboard-app/dist/**` | 同上的生产构建契约 | 隔离重建字节一致 |
| Change / ADR / RFC / plan / tasks | delta spec 与 OpenSpec 文档契约 | digest、读取与 archive 演练通过 |

## 结论

本 Verify 周期失败。按 `verify-fail` 回退 Build，修复组合筛选摘要并重新冻结、全量审查。
