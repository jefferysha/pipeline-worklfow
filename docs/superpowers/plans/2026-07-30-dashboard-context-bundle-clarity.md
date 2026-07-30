---
change: dashboard-context-bundle-clarity-20260730
design-doc: docs/superpowers/specs/2026-07-30-dashboard-context-bundle-clarity-design.md
---

# Dashboard Context Bundle 预算层级实施计划

## 交付边界

只修改 Progress 功能域展示、中英文翻译、相邻测试、生成的 Dashboard 资产和治理文档。API DTO、
decoder、`useContextBundlePreview`、server/kernel、安全 reader、依赖和手机契约保持不变。

## 原型决策

不插入一次性 prototype。Explore 已在真实 560px 抽屉和四个桌面视口测量了布局，并以协议合法的
只读浏览器响应验证全部展示输入；剩余未知是可由组件测试驱动的小型表现层实现。若 Build 发现必须
改变 hook/API/state 语义，立即以 `requirements-changed` 返回 Spec。

## 子阶段 1：Tracer bullet——预算结论贯通

目标：以现有 success 响应纵向贯通 `useContextBundlePreview` 输出 → 纯展示投影 → DOM/ARIA →
真实抽屉渲染，不先横向重写所有状态。

1. 在 `packages/dashboard-app/src/progress/ContextBundlePreview.test.tsx` 增加 success 红灯：
   - 断言本地化使用比例、used/max、remaining、document count。
   - 断言 progressbar 的 min/max/now 与有界视觉宽度。
   - 断言输入保持响应顺序且完整显示 path/kind/mode/source/materialized。
2. 新建 `packages/dashboard-app/src/progress/ContextBundlePreviewParts.tsx`：
   - 实现纯 `BudgetSummary` 与 `PreviewInputs`。
   - 以显式 Props 保持功能域边界，不读取 hook/API，不新增 state。
3. 在 `ContextBundlePreview.tsx` 接入 success 路径并补齐翻译。
4. 运行：
   `npx vitest run --config packages/dashboard-app/vitest.config.ts packages/dashboard-app/src/progress/ContextBundlePreview.test.tsx`

此处建议 `/clear`。

## 子阶段 2：失败、空、加载与双语闭环

1. 先补 budget-error 红灯：
   - 真实超限比例、overage、error progressbar 与安全输入摘要。
   - 视觉宽度不超过 100%，精确文本不被钳制。
2. 补 loading、policy-empty、stable error 与 reduced-motion 断言：
   - loading 为静态有界 skeleton，保留 `role=status`/`aria-busy` 且 submit disabled，不运行
     pulse 或循环动画。
   - empty 使用 `role=status` 且不渲染容量摘要。
   - error 保留 code、说明、恢复动作和原 retry 路径。
   - budget 输入保留可访问 label，并声明稳定 `name` 与 `autocomplete="off"`。
3. 在 `packages/dashboard-app/src/i18n/translations.ts` 成对增加 zh/en 容量、remaining、
   overage、document list 与 loading 文案。
4. 保持 target → budget → submit 的 DOM/Tab 顺序和 Enter submit；不得修改 hook。
5. 运行定向测试与 `npm run typecheck:web`。

此处建议 `/clear`。

## 子阶段 3：完整验证与 Build 固定点

1. 运行：
   - `npm run test:web`
   - `npm run typecheck:web`
   - `npm run build`
   - `npm run check:architecture`
   - `npm run check:comments`
   - `npm run check:repository-hygiene`
   - `git diff --check`
2. 真实生产 Dashboard 验收：
   - 精确 1024×768、1200×870、1440×900、1920×1080。
   - Light/Dark/System、success、loading、budget-error、policy-empty、真实 macOS 501、
     retry、Enter/Tab、focus、长 path、64 项边界、reduced-motion。
   - 核对 title、URL、worktree root、Change、最终 asset hash、console/network 与根级 overflow。
   - 不运行或声称手机端验收；截图只保存在仓库外 `/tmp`。
3. 复核完整 diff 与两项 capability delta；发现语义变化走 `requirements-changed`。
4. 提交实现固定点并登记 `build_sha`。

## Verify、交付与回滚

- Verify 对同一冻结 SHA 完成 Reviewer、真实 E2E/浏览器、Codex、视觉/可访问性四轨；任一范围内
  finding 返回 Build 修复并重新冻结。
- Ship 应用两项 main spec，普通 push，创建以 #24 为 base 的非草稿 stacked PR；说明依赖链、
  前后差异、浏览器矩阵、可访问性、动效与回滚。
- 回滚仅需撤销 Context Bundle 展示部件、翻译、测试和两项 applied spec；API、数据和持久化未变。
- 不 force push、不合并 main、不自动合并；标签仅在仓库提供时添加。
