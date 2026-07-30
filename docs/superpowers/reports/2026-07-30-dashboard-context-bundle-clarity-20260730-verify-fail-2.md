# Dashboard Context Bundle Clarity — Verify 回退报告（第 2 轮）

- Change：`dashboard-context-bundle-clarity-20260730`
- 冻结 build SHA：`9ade47602aa0e0d3ca99ccdf9622fb71bcbfb2cc`
- 结论：**FAIL；先回 Build，再以 requirements-changed 回 Spec**
- 时间：2026-07-30 14:09 CST

## 聚合结论

E2E 与 Codex CLI 通过；Reviewer 发现 3 个 Medium，Visual 在补充 exact-SHA 截图后仍确认
canonical design 与实现不一致。任一 Medium 禁止 `verify-pass`。

连续自动化授权下选择最保守路径：不接受偏差。由于 `scaleX()` 修复改变了已登记设计文档仍冻结为
width transition 的实现语义，本轮先走 exact `verify-fail`，随后从 Build 以
`requirements-changed` 回到 Spec 修订、登记与重新 review；不得在 Build 静默覆盖旧设计 SHA。

## 四轨结果

| 轨道 | 结果 | 证据 |
| --- | --- | --- |
| Reviewer | FAIL，C0/H0/M3/L1 | 全量审查 stacked base `0a05e565` 到冻结 SHA；发现 loading 无限 pulse、policy-empty 缺语义 role、canonical design 与实现漂移。其余调用方、API、安全、i18n、生成资产和治理链无新增 C/H/M。 |
| E2E / 行为 | PASS | 隔离副本中定向 98/98、Context Bundle 18/18、API/安全 42/42、Dashboard 1228/1228、根全量 5781 passed / 14 skipped、类型与根构建通过；真实 macOS HTTP 安全返回 501。 |
| Codex CLI | PASS | `codex exec review --base 0a05e565` 在 read-only/ephemeral 模式完成；结论为实现符合容量、可访问性、本地化、顺序与 reduced-motion 规格，Dashboard 1228 与类型/diff 检查通过，无 severity finding。 |
| Visual / accessibility | FAIL，C0/H0/M1/L2 | 补拍后四视口、Light/Dark/System、success/loading/budget-error/501、focus、ARIA、contrast 与 motion 均闭环；唯一 Medium 为设计文档仍写 width。Low 为 64 行长滚动和 budget input 缺 name/autocomplete。 |

## Findings

1. **MEDIUM — loading 使用无限循环动画。**
   `ContextBundlePreviewParts.tsx` 的 `animate-pulse` 在生产 CSS 中为 2s infinite；delta spec
   禁止循环动画。删除 pulse，保留清晰、静态、有界 loading skeleton 与 `role=status` /
   `aria-busy`。
2. **MEDIUM — policy-empty 缺少对应语义 role。**
   `ContextBundlePreview.tsx` 的空态只有普通 `div`；祖先 `aria-live` 不替代规格要求的语义 role。
   增加 `role="status"` 并补测试。
3. **MEDIUM — canonical design 与实现漂移。**
   `docs/superpowers/specs/2026-07-30-dashboard-context-bundle-clarity-design.md` 第 82–83、90 行仍规定
   width/color transition 和 width 样式，冻结实现已改为 transform `scaleX()`；输入标题数量描述也与
   当前 count badge 位置不一致。必须回 Spec 修订并重新登记/read/review。
4. **LOW — 64 行有界列表形成长滚动。**
   服务端固定上限、单行简单且无横溢；继续记录，不在本批引入虚拟化。
5. **LOW — budget input 缺少 `name` 与 `autocomplete="off"`。**
   返工时一并补齐并以组件测试锁定。

`REVIEW.md` 还把容量条称为唯一新增运动，遗漏 loading pulse；最终 M0 结论随返工修正。

## 浏览器证据闭环

- `/tmp/dashboard-context-bundle-clarity-fixed-1024x768.png`：稳定 opacity=1、success 摘要与输入可见、overflow 0。
- `/tmp/dashboard-context-bundle-clarity-fixed-1200x870.png`：稳定 success 终态、overflow 0。
- `/tmp/dashboard-context-bundle-clarity-fixed-1440x900.png`、`...1920x1080.png`：success 与 560px drawer 稳定。
- `/tmp/dashboard-context-bundle-clarity-light-success-fixed-1440x900.png`、
  `...dark-success-fixed-1440x900.png`、`...system-success-fixed-1440x900.png`：三主题通过。
- `/tmp/dashboard-context-bundle-clarity-loading-fixed-1440x900.png`：loading 文案、骨架、disabled submit 可见。
- `/tmp/dashboard-context-bundle-clarity-budget-error-fixed-1440x900.png`：124%、精确 overage、满幅钳制、alert/retry。
- `/tmp/dashboard-context-bundle-clarity-501-error-fixed-1440x900.png`：真实 capability code、解释与 Linux 恢复路径。
- 正常运动为 0.2s transform；reduced motion 为 0s/none；控制台 0 warning/error。
- 只覆盖 1024–1920px 电脑端；未运行或声称手机端验收。

## 逐文件 spec 回读

| 文件范围 | 命中的 capability / contract | 结论 |
| --- | --- | --- |
| `ContextBundlePreview.tsx` | `context-bundle-budget-preview` | 请求与状态机保持不变；policy-empty role finding 待修。 |
| `ContextBundlePreviewParts.tsx` | 两份 delta spec | 容量、输入、ARIA 与 transform 正确；loading loop finding 待修。 |
| `ContextBundlePreview.test.tsx` | 两份 delta spec | 主要分支覆盖；当前错误锁定 pulse，需改为静态并补 empty role/name。 |
| `translations.ts` | `context-bundle-budget-preview` | 中英文键和值一致。 |
| `dist/**` | 两份 delta spec / release asset | 引用与 hash 一致；需在修复后重建。 |
| proposal/design/spec/plan/ADR/tasks/REVIEW | Change 治理契约 | canonical design 漂移，必须经 Spec 修订。 |
| `.pipeline-*` / revisions / transitions | Tenon canonical governance | JSON/JSONL 可解析、链连续；只允许官方 CLI 写入。 |

## 隔离 archive/apply 演练

- 隔离副本：`/tmp/dashboard-context-archive-rehearsal-v2.bUB73W/repo`，冻结 SHA `9ade4760`。
- `show --deltas-only`：2 deltas（modified 1、added 1）；Change strict 1/1。
- `archive --yes --json`：成功，specsUpdated=true；目标两个 applied specs 分别 strict 1/1。
- 真实工作区 28 份 main spec digest、7 个实现/生成资产 SHA 和 HEAD/index 前后完全一致。

## 下一轮

1. exact `verify-fail` 回 Build，再以 `requirements-changed` 回 Spec。
2. 修正文档为 200ms transform-only；loading 明确静态；输入数量位置与实现一致。
3. 完成 Spec exact-event review 后回 Build，TDD 删除 pulse、增加 empty role 和 budget input 属性。
4. 重建资产、重跑全部 Build 门禁并冻结新 SHA。
5. 重新执行完整 Reviewer、E2E、Codex 与 Visual 四轨。
