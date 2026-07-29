---
change: dashboard-trace-session-workspace-20260729
design-doc: docs/superpowers/specs/2026-07-29-dashboard-trace-session-workspace-design.md
---

# Dashboard Trace 会话工作区实施计划

## 范围与原型决策

本计划只修改 1024–1920px 电脑端 TrafficPanel、测试、中英文文案与 Dashboard 构建产物。现有
Trace API、decoder、状态机、竞态保护和真实浏览器 fixture 已经跑通，没有“数据模型/状态机能否工作”
的不确定性；持续授权下采用保守默认，不插入一次性 prototype。

## 子阶段 1：Tracer bullet — 双栏骨架与稳定 detail

> 当前阶段贯穿组件 → session 状态 → timeline 渲染 → 单元测试，是纯前端最小纵向切片。

1. 在 `packages/dashboard-app/src/advanced/TrafficPanel.test.tsx` 先增加未选择占位、无隐式 timeline
   请求、1024px 双栏契约和 session/detail 可访问名称的失败测试。
2. 在 `packages/dashboard-app/src/advanced/TrafficPanel.tsx` 建立
   `clamp(248px, 28%, 288px) + minmax(0,1fr)` workspace，把现有 sessions 与 timeline 放入各自
   稳定区域；不改变 fetch 函数与 selection 状态机。
3. 在 `packages/dashboard-app/src/i18n/translations.ts` 增加 rail 标题、未选择提示和会话 identity
   的 zh/en 对称文案。
4. 运行：
   `npx vitest run --config packages/dashboard-app/vitest.config.ts packages/dashboard-app/src/advanced/TrafficPanel.test.tsx`
   与 `npm run typecheck:web`。

验证：非空 sessions 初次加载后没有 timeline 请求；选择后在同一 workspace 显示真实 timeline。

回滚：恢复 `TrafficPanel.tsx` 结构和新增 i18n/tests；API 与数据无迁移。

**此处建议 /clear**

## 子阶段 2：Rail 身份层级与紧凑时间线

1. 为 session rail 行加入 client/status、short id/proxy mode、record count/updated time，长值使用
   `min-w-0`、truncate 和完整 `title`。
2. 为 detail 增加当前 session identity header，严格使用 `TraceSessionRow` 已解码字段。
3. 把四项 summary 调整为 2×2/四列桌面规则，把 timeline card stack 改为单容器分隔行；保留
   partial/truncated、known-empty、filter-empty 与 error/retry 的现有语义。
4. 扩展 `TrafficPanel.test.tsx`：同 client 多 session 可区分、完整 id 可访问、zh/en 对称、快速切换、
   filter retry、Escape 还焦与旧响应不覆盖。
5. 运行定向 Vitest、`npm run test:web`、`npm run typecheck:web`、`npm run check:comments`。

验证：所有状态使用独立文字，按钮焦点/`aria-pressed`/Escape 契约保持，query/body 等敏感数据不进入 UI。

回滚：恢复行式布局与新增文案；无 schema、存储或 server 兼容负担。

**此处建议 /clear**

## 子阶段 3：构建与真实桌面浏览器验收

1. 运行 `npm run build:web`，确认 `packages/dashboard-app/dist/` 与源码一致。
2. 使用隔离的真实 TraceStore fixture 和生产 Dashboard server，在 1024×768、1200×870、
   1440×900、1920×1080 验收：
   - sessions loading/error/empty；
   - detail unselected/loading/error/known-empty/partial-window/filter-empty/ready；
   - all/error/success 筛选、重试、快速切换和 Escape 焦点恢复；
   - document/workspace 横向溢出为 0，1024 摘要 2×2，宽桌面摘要四列；
   - light/dark 与 reduced-motion；
   - console 无新增 error/warning。
3. 保存桌面截图与结构化测量到
   `docs/ux/shots/dashboard-trace-session-workspace-20260729/`，不创建手机截图。
4. 运行 `npm run test:web`、`npm run typecheck:web`、`npm run build:web` 和仓库级必要检查。

验证：测试、真实浏览器状态矩阵和构建产物同时通过。

回滚：PR 可整体回退；不涉及数据迁移、服务端契约或依赖回退。

**此处建议 /clear**
