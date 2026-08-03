# Dashboard Context Bundle Clarity — Verify 回退报告（第 1 轮）

- Change：`dashboard-context-bundle-clarity-20260730`
- 冻结 build SHA：`1d618b85b61b8c9f43bfa258583765f25927d2e5`
- 结论：**FAIL，回到 Build 修复**
- 时间：2026-07-30 13:44 CST

## 聚合结论

四条适用验证轨全部完成。E2E / 行为轨通过；Reviewer、Visual 与 Codex CLI 均独立复现
容量条反馈的问题。冻结实现使用 `duration-300`，超过 delta spec 允许的 120–280ms；
同时直接过渡 `width`，不满足本轮采用的视觉 Skill 仅动画 transform / opacity 的约束。
Visual 轨还确认 dark success、loading 骨架与 System success 的截图取景没有覆盖目标组件，
因此现有运行证据不足以闭环这些矩阵项。

任一 Medium 或适用证据不完整都禁止 `verify-pass`。连续自动化授权下采用最保守决定：
回到 Build 修复，不接受偏差。

## 四轨结果

| 轨道 | 结果 | 证据 |
| --- | --- | --- |
| Reviewer | FAIL，C0/H0/M1 | 完整复查冻结 diff、调用方、测试、Change、生成资产与 Tenon JSON/JSONL；确认 `.duration-300` 生成 `.3s`，违反 120–280ms delta spec。其余实现、i18n、状态与治理链无新增 C/H/M。 |
| E2E / 行为 | PASS | Context Bundle 18/18，相邻组件/API/主题/App 98/98，`typecheck:web` 与 `git diff --check` 通过；真实 macOS HTTP 返回安全的 501，无绝对路径泄露。审计前后 HEAD、index 与四个功能文件不变。 |
| Codex CLI | FAIL / 运行时降级 | 完整输入超过 CLI 1 MiB 上限后改用冻结文件清单、统计、全部人可读 diff 与生成资产 hash 的压缩输入；该轨独立确认源码 `duration-300`、生产 CSS `.3s` 与 spec 120–280ms 不一致。CLI 随后因内部协作等待和模型缓存错误无法自然结束，人工终止；不把该运行时异常记为通过。 |
| Visual / accessibility | FAIL，C0/H0/M2/L1 | 四个目标桌面视口、budget-error、focus、长 path 与主题 token 其余表现良好；发现直接动画 width，以及 dark/loading/System 截图未覆盖目标状态。64 项简单有界列表为 Low 长滚动风险。 |

## Findings

1. **MEDIUM — 过渡时长违反规格。**
   `ContextBundlePreviewParts.tsx` 使用 `duration-300`，而
   `dashboard-ui-ux-system` delta spec 只允许 120–280ms。
2. **MEDIUM — 直接过渡 width。**
   容量条使用 `transition-[width]`。改为 `origin-left` +
   `scaleX()` 的 transform 反馈，并在 reduced motion 下禁用 transition。
3. **MEDIUM — 运行截图证据不完整。**
   重新拍摄实际显示容量摘要的 Dark/System success，以及包含 loading 文案与骨架的 loading；
   仍只覆盖 1024–1920px 电脑端。
4. **LOW — 64 行上界可能产生长滚动。**
   服务端上限固定、每行结构简单且已有正常换行；本批不改变 API 或引入列表虚拟化，保留为有边界风险。

`REVIEW.md` 将 300ms 错误总结为零 Medium，必须随实现一并纠正。

## 逐文件 spec 回读

| 文件范围 | 对应规格与验证 |
| --- | --- |
| `packages/dashboard-app/src/progress/ContextBundlePreview.tsx` | `context-bundle-budget-preview`：状态、请求与恢复路径仍由既有 hook 管理；本轮只委托展示层。 |
| `packages/dashboard-app/src/progress/ContextBundlePreviewParts.tsx` | `context-bundle-budget-preview` + `dashboard-ui-ux-system`：容量摘要、顺序清单、loading、ARIA、Lucide、desktop hierarchy；本轮 finding 均定位于此。 |
| `packages/dashboard-app/src/progress/ContextBundlePreview.test.tsx` | 两份 delta spec 的 success、empty、budget-error、loading、键盘、双语与竞态行为；需补 transform/duration 契约断言。 |
| `packages/dashboard-app/src/i18n/translations.ts` | `context-bundle-budget-preview`：中英文容量、remaining/overage、输入标题一致。 |
| `packages/dashboard-app/dist/**` | 两份 delta spec 的生产构建映射；当前 CSS 独立复现 `.3s` 偏差，修复后必须重建。 |
| `openspec/changes/dashboard-context-bundle-clarity-20260730/**` | proposal/design/spec/plan/ADR/tasks/REVIEW 与 Tenon canonical 证据；不得手改 canonical state。 |

## 隔离 archive/apply 演练

- 在 `/tmp/dashboard-context-archive-rehearsal.N2mHvk/repo` 以冻结 SHA 建立保留 Git 对象的隔离副本。
- `openspec show --json --deltas-only` 返回 1 个 modified、1 个 added delta。
- Change strict validate：1/1 通过。
- 隔离 `openspec archive --yes --json` 成功：added 1、modified 1。
- 归档后的 `context-bundle-budget-preview` 与 `dashboard-ui-ux-system` 分别 strict validate 通过。
- 全库 specs strict 仍报告 8 个既有 Purpose 缺失；它们不在本 Change 的 delta 范围。
- 真实工作区 28 份 `openspec/specs/**/spec.md` 的 SHA-256 前后逐项一致，未被演练修改。

## Build 返工与完整回归

1. 先补红灯测试，要求容量 fill 使用 transform、200ms 且不含 width transition。
2. 改用 `origin-left` + `scaleX()` 与 `duration-200`，保持精确百分比、视觉钳制、ARIA 和
   `motion-reduce:transition-none`。
3. 更新 `REVIEW.md` 并重建生产资产，重跑定向/全量 Vitest、类型检查、根构建与静态门禁。
4. 由唯一 browser owner 重拍 Dark/System success 与 loading 组件证据，并复核正常动效 200ms、
   reduced motion 0s。
5. 冻结新 SHA 后重新执行完整 Reviewer、E2E、Codex CLI 与 Visual 四轨，不只复查本轮 findings。

## 范围与限定

- 只验收 1024×768、1200×870、1440×900、1920×1080 电脑端；未运行或声称手机端验收。
- 不修改 API、decoder、trusted reader、共享契约、依赖或生产环境。
- Vite chunk-size warning 与全库 8 个既有 OpenSpec Purpose 缺失保持为范围外信息。
