# Dashboard Onboarding Command Feedback — Verify 回退报告（第 1 轮）

- Change：`dashboard-onboarding-command-feedback-20260730`
- 冻结 build SHA：`1e0d2cbd0113f29d4f1697c1f2e4aa0184e2b1f2`
- 冻结 tree：`27d63a12c8044270be3723d6ccef11f6990d788b`
- 结论：**FAIL，回到 Build 修复**
- 时间：2026-07-30 11:43 CST

## 聚合结论

Reviewer 轨确认 1 个 Medium 规格违例：delta spec 明确要求不改变 `<1024px`
既有契约，但当前实现把 no-project 容器最大宽度从 620px 全局扩大到 920px，
并在所有视口启用新的步骤卡边框、背景和 padding。620–1023px 的既有布局与
视觉结构因此被改变。持续自主模式按最保守决策修复，不接受偏差。

同时修复两项低风险文档漂移：

1. 设计文档仍写 pending 使用原生 `disabled`，应改为
   `aria-disabled=true` 与状态机防重入。
2. `Onboarding.tsx` 顶部注释仍描述旧的 520px 宽度，应与当前契约一致。

## 四轨结果

| 轨道 | 结果 | 证据 |
| --- | --- | --- |
| Reviewer | FAIL | 完整审阅冻结 diff、调用方、测试、i18n、OpenSpec 与生成资产；确认上述 Medium。实现相对冻结 SHA 零漂移。 |
| E2E / build | PASS | 隔离副本 `npm ci`、根构建、`typecheck:web`、3 个相邻 Vitest 文件 65/65、production HTTP smoke 均通过；生成资产与冻结提交一致。 |
| Codex CLI | INCOMPLETE / FAIL | 首次完整 diff 超过 1,048,576-byte stdin 上限；第二次 scoped 审查已读取源码、规格与产物，但在 Reviewer 确认 Medium 后停止，未产出独立最终 PASS。 |
| Visual | INCOMPLETE / FAIL | 已确认 production asset、1440×900、Light/Dark/System、键盘 pending/success/reject/API 缺失、焦点保持与防重复提交；因已确认 Medium 回退而停止，四视口完整矩阵未完成。 |

任一 Medium 或证据不完整均禁止 `verify-pass`，因此本轮不设置任何 reviewer
pass 字段，也不运行成功出口的 `tenon check`。

## 冻结一致性

- Reviewer 前后 tree 均为 `27d63a12c8044270be3723d6ccef11f6990d788b`。
- E2E 隔离副本中的实现、测试、i18n、HTML、JS、CSS 与冻结 SHA 哈希一致。
- 真实工作树仅包含 Verify 治理状态与本报告；未在 Verify 修改实现、配置或生成物。

## 修复与下一轮回归

1. 用 `min-[1024px]` 门控新 920px 宽度及步骤卡视觉样式；1024px 继续满足新桌面规格，
   `<1024px` 保留旧契约。
2. 同步修正设计文档与源码注释。
3. 回到 Build 后先补充/调整断言，再重建生产资产并冻结新的 build SHA。
4. 下一轮 Verify 重新运行完整 Reviewer、隔离 E2E/build、Codex CLI 和 Visual 四轨，
   同时回归本轮 finding，不只做局部复查。

## 已知非阻塞信息

- `npm ci` 报告既有 7 个依赖 advisories；本批未修改依赖或 lockfile。
- Vite 保留既有 chunk-size warning。
- Codex CLI 启动时报告本地 model cache / logs SQLite 警告；不是本次 Dashboard 代码问题，
  但本轮也未将该轨计为通过。
- 未执行或声称任何手机端验收。
