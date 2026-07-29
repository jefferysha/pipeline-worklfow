# Dashboard Progress 待复核分诊 — Verify 报告

## 冻结基线

- Change：`dashboard-review-inbox-triage-20260729`
- Track：`frontend`
- Build SHA：`7332c76f25f6d17403db4341f70ccc6cf2ca9f7b`
- Base SHA：`7c59eecfba9e8652d69e25dae01058ae1df783be`
- 结果：**PASS**

这是首轮 Verify 失败后的第二轮完整验证。Reviewer、E2E、Codex CLI 与视觉轨均审查同一冻结
提交区间；不是只复查上轮 finding。各轨完成后 HEAD、产品源码、测试与生成资产均未漂移。

## 首轮缺陷回归

首轮 Codex CLI 轨发现 workflow 下拉已缩小画布，但摘要仍按全项目任务计数。第二轮冻结实现将
两类计数明确分开：

- 状态 tab badge 继续按全项目 `flatRows` 计算，保留既有全局计数契约。
- `filterSummary` 按 `effectiveWf` 作用域计算，再复用同一个 `deckMatch`。
- `release-train + run` 回归固定为全局 run badge `1`、当前画布摘要
  `匹配 0 个 · 上下文 1 个`。

回归结论：首轮 Medium 已关闭。

## 四轨结果

| 验证轨 | 覆盖 | 结论 |
| --- | --- | --- |
| Reviewer | 完整 87 个 committed changed files、当前治理增量、受影响 capability、调用方、源码/测试/dist | PASS；Critical/High/Medium 0 |
| E2E | 三份 Progress 组件/集成测试、组合筛选、键盘、禁用、零匹配与状态保留调用链 | PASS；84/84 |
| Codex CLI | 完整 88 个 no-rename 路径、规格、64 个 JSON、26 个 revision/mirror、7 个 transition、隔离 build/dist | PASS；Critical/High/Medium 0 |
| 视觉 | 真实 Dashboard 四桌面宽度、三主题、键盘/焦点、success/loading/error/empty/filtered-zero/disabled、reduced-motion | PASS；Critical/High/Medium 0 |

Codex CLI 自身的只读沙箱不能连接本机端口，并在 `serverIntegration` 监听
`127.0.0.1` 时得到 `EPERM`；它没有把未运行的浏览器检查标成通过。独立视觉轨在真实
`127.0.0.1:18831` Dashboard 上完成了本轮 fresh browser 验收，因此产品浏览器门没有降级。

## 聚合发现

### Critical / High / Medium

无。

### Low

1. 禁用、`aria-hidden` 的上下文卡仍低透明度显示“打开 / Open”及子级 hover 色。卡片实际不可点击、
   不可聚焦、不进入无障碍树且不会位移；不影响本批交互正确性，留给后续连贯 CTA 语义批次。
2. 测试未以显式 fetch spy 断言切换状态为零 API 调用，也未用动态 rerender 单测已有 Snapshot 下
   loading/error 保留当前选择。产品调用链、组件状态所有权与真实浏览器行为均正确；作为非阻断测试
   加固项保留。

## 命令与机器验证

- Progress 定向：
  `npx vitest run --config packages/dashboard-app/vitest.config.ts packages/dashboard-app/src/progress/ProgressToolbar.test.tsx packages/dashboard-app/src/progress/ProgressView.test.tsx packages/dashboard-app/src/progress/WorkflowCanvas.test.tsx`
  — 3 files / 84 tests PASS。
- `npm run typecheck:web` — PASS。
- `npm run test:web` — Build 冻结前同一产品内容为 68 files / 1205 tests PASS。
- `npm run build` — PASS；Dashboard `index-DGFcIgyE.js` 890.39 kB（gzip 276.60 kB），保留既有
  >500 kB chunk warning；CSS 为 `index-DXskrxa6.css`。
- Codex 冻结副本 `npm run build` — PASS；重建 Dashboard dist 与 committed dist 逐文件一致。
- `npm run check:comments` — PASS。
- `npm run check:architecture` — 665 production files，5 个既有 size-only exceptions，PASS。
- `npm run check:repository-hygiene` — 7 tests PASS。
- `git diff --check` — PASS。
- `openspec validate dashboard-review-inbox-triage-20260729 --strict` — PASS。

## 真实桌面浏览器验收

目标身份：标题 `Tenon Dashboard`；最终 JS 资产
`index-DGFcIgyE.js`；真实服务 `http://127.0.0.1:18831`。

| 视口 | document/main 横向溢出 | 画布内部滚动 | 结果 |
| --- | ---: | ---: | --- |
| 1024×768 | 0 | 778px | PASS |
| 1200×870 | 0 | 602px | PASS |
| 1440×900 | 0 | 578px | PASS |
| 1920×1080 | 0 | 578px | PASS |

- “等你动手”：`匹配 1 个 · 上下文 3 个`；英文为 `Matches 1 · Context 3`。
- “运行中”零匹配：`匹配 0 个 · 上下文 4 个`；四张上下文卡均为
  `data-dim + disabled + aria-hidden`，hover transform 为 `none`。
- ArrowLeft/Right、Home、End 同步选择与焦点；tablist 只有一个普通 Tab 停靠点。
- 匹配卡详情 Escape 关闭后焦点归还原卡，焦点轮廓为 `2px solid`。
- Light、Dark、System 均通过；浅色摘要对比度 5.11:1。
- loading：3 秒网络延迟下只显示 polite `role=status` 的“加载中…”。
- error：中断 snapshot 与 stream 后显示连接断开、`role=alert`、原因和重连/重试。
- empty：真实零活跃任务项目显示明确空态和下一步，不显示伪造筛选摘要。
- reduced-motion：卡片 transition/animation 为 `0s`，transform 为 `none`；随后恢复
  `no-preference`。
- 未运行或声称手机端布局、截图或验收。

截图只在仓库外：

- `/private/tmp/dashboard-verify-r2-{1024,1200,1440,1920}.png`
- `/private/tmp/dashboard-verify-r2-combined-filter-1440.png`
- `/private/tmp/dashboard-verify-r2-filtered-zero-1440.png`
- `/private/tmp/dashboard-verify-r2-dark-1440.png`
- `/private/tmp/dashboard-verify-r2-reduced-1440.png`
- `/private/tmp/dashboard-verify-r2-{loading,error,empty}-1440.png`

## OpenSpec 与文档纠偏

- `openspec` 版本：1.6.0。
- `show --deltas-only` 与 strict validate 通过。
- `git archive` 冻结副本中的 archive/apply 演练成功，应用后的
  `dashboard-ui-ux-system` strict validate 通过。
- 真实主规格 SHA-256 前后均为
  `d87726785ca05a783d112475e692eb16caeb85259936d56c54bd2f930e5fd307`；Verify 未写主规格。
- 并发调度加入但并非用户需求的三组文本已精确撤回：设计的原型决定一条、delta 的
  loading/error/empty Scenario、plan 的 prototype 段与两条验收条件。产品代码、测试、proposal、
  tasks 和其他规格正文未被顺带修改。

## 文件到规格回读

| 改动范围 | 对应能力与规范 | 结论 |
| --- | --- | --- |
| `ProgressToolbar.tsx`、测试、i18n | `dashboard-ui-ux-system`：双语 polite 摘要、roving tablist、Lucide/token | 符合 |
| `ProgressView.tsx` 与集成测试 | 同上：全局 badge 与 effective workflow 摘要分离、唯一分类规则 | 符合 |
| `WorkflowCanvas.tsx` 与测试 | 同上：上下文卡 disabled/aria-hidden、禁用 hover | 符合 |
| `packages/dashboard-app/dist/**` | Dashboard 生产构建契约 | 隔离重建一致 |
| ADR、RFC、plan、delta、tasks、REVIEW 与报告 | OpenSpec 文档契约与桌面验证矩阵 | digest/read receipt 完整 |
| `.pipeline-*`、revision、transition | Tenon canonical/ledger/history 契约 | CLI 生成且链路可解析 |

## 兼容性、风险与回滚

- 不改变 API、Snapshot、Workflow、分类规则、默认 `all`、安全边界或依赖。
- 仅支持 1024–1920px 桌面验收；既有小屏契约没有被主动重构。
- 剩余风险为上述两项 Low 与既有 890.39 kB JS chunk warning。
- 可整体回退三个提交恢复原 Toolbar/Canvas 行为；没有迁移、持久化或服务端数据需要回滚。

## 结论

冻结基线通过完整第二轮 Verify，可以进入 Ship。
