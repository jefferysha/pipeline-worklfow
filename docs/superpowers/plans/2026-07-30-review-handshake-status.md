---
change: review-handshake-status-20260730
design-doc: docs/superpowers/specs/2026-07-30-review-handshake-status-design.md
---

# Review Handshake 状态实施计划

## 范围与回滚

本计划只增加 canonical receipt 的只读 snapshot 投影和 Progress Drawer 状态卡。它不新增写端点、
持久化字段、依赖或 authority，不修改 WorkflowCanvas/Toolbar/Inbox/Projects/AFK。回滚时可整体
删除 `reviewHandshake` 投影、decoder 分支和状态卡；canonical state 与 transition 行为不受影响。

原型决策：Explore 已用真实 kernel/server/decoder/Progress 调用链消除了数据模型与状态机未知，
且切片包含明确的纯 projector seam；持续自主模式选择不插入一次性 prototype，直接以 TDD
tracer bullet 验证。若首个红测暴露冻结 plan 无法提供所需不变量，则以 `requirements-changed`
返回 Spec，不在 Build 偷改契约。

## 子阶段 1：TDD tracer bullet，贯通 canonical state → Drawer

目标是在一个干净上下文窗口内先打通最小端到端链路，而不是按层横向堆积。

1. 在 `packages/server/src/snapshot.test.ts` 先增加 pending exact-event 的失败测试，并在
   `packages/server/src/types.ts`、`packages/server/src/snapshot.ts` 实现最小纯 projector，使
   Change snapshot 返回 `pending(event, requestedAt)`。
   - 验证：运行 server snapshot 定向 Vitest；红灯必须来自缺失投影，绿灯必须断言 exact event。
2. 在 `packages/dashboard-app/src/api/boundaryDecoders.test.tsx`（或现有 snapshot decoder 相邻测试）
   先写 pending 合法形状测试，再同步 `packages/dashboard-app/src/types.ts` 与
   `packages/dashboard-app/src/api/snapshotDecoder.ts`。
   - 验证：合法 pending 解码成功，不在出边中的 event 解码失败。
3. 新增 `packages/dashboard-app/src/progress/ReviewHandshakeStatus.tsx` 及测试，在
   `ProgressDrawer.tsx` 当前阶段区接入一个最小 pending 状态卡。
   - 验证：真实 `ChangeSnapshot` fixture 渲染 exact event，组件无按钮/Tab stop。

**Tracer bullet 出口：** 一个 server fixture 的 pending receipt 经 snapshot、strict decoder 与真实
Drawer 组件显示同一个 exact event；相关定向测试绿色。

**子阶段边界：此处建议 `/clear`。**

## 子阶段 2：收紧三态、非法状态和滚动兼容

1. 扩展 server 红测覆盖全空 `not-requested`、approved 两时间、`verify-pass`/`verify-fail`、
   半组、phase 漂移、非 review gate 与不可达 event；projector 对非法组合 fail-loud。
   - 验证：每个非法 fixture 都进入现有 Project error，而不是安全空态。
2. 扩展 decoder 红测覆盖缺属性兼容、三合法分支、exact keys、未知 status、空/不可达 event、
   pending/approved 时间不变量和敏感额外字段。
   - 验证：缺属性保留 Change 且返回 `undefined`；属性存在但非法时拒绝 frame。
3. 确认 GET snapshot 与 SSE 共用现有 decoder/build path，没有第二请求或本地 receipt state。
   - 验证：现有 snapshot client 测试与相关 SSE 测试通过。

**子阶段边界：此处建议 `/clear`。**

## 子阶段 3：完整 Dashboard 交互、i18n 与集成

1. 完成 `ReviewHandshakeStatus` 的 hidden、unavailable、not-requested、pending、approved 状态，
   使用现有 token、polite live region 和原文 monospace event。
   - 验证：组件测试逐态断言 zh/en、ARIA、无新增可聚焦控件。
2. 在 `packages/dashboard-app/src/i18n/translations.ts` 增加对称中英文 key，并运行 i18n 完整性测试。
3. 在 `packages/dashboard-app/src/progress/ProgressView.test.tsx` 增加 Drawer 集成：
   - guards 与 receipt 正交；
   - verify 多出口都保持可点击；
   - pending → approved rerender 不重开 Drawer、不丢焦点；
   - transition 成功/失败、Escape/focus trap/焦点归还不回归。
4. 不修改 `ProgressToolbar.tsx`、`WorkflowCanvas.tsx`、`progressCanvasModel.ts`、`inbox/`、
   `Projects` 或 `AFK` 文件；若实现被迫跨入这些范围，先回 Spec 说明需求变化。

**子阶段边界：此处建议 `/clear`。**

## 子阶段 4：验证、浏览器与交付

1. 运行受影响的定向测试、`typecheck:web`、`test:web`、`build:web`/`build`、`npm test` 及适用
   hooks/adapters/skills/bundle/oracle 门禁；代码失败必须修复并回到 Build。
2. 从本 worktree 的生产构建启动唯一、明确端口的 Dashboard，核实目标页身份后完成真实桌面验收：
   1024×768、1440×900、1920×1080；Light/Dark/System；三态、unavailable、非 review、
   loading/error/empty、双出口、键盘、SSE、reduced-motion。
3. 记录 server、decoder、UI、浏览器证据与外部 secret/CI 阻塞的区别；不得用 PR 代替验证。
4. 按 Tenon Verify → Ship → Archive 应用规格，提交本轮文件，推送唯一分支并创建非草稿 PR。

## 兼容、风险与停止条件

- 新 server/旧 Dashboard 依赖加法字段兼容；旧 server/新 Dashboard 依赖可选属性 unavailable。
- 最大风险是 readiness/receipt 混淆、多出口误授权与非法状态被美化；测试必须分别锁定。
- 不展示 authority、host session、token、marker、绝对路径或原始 prompt。
- 若 projector 无法只依靠 canonical state 与冻结 plan 失败关闭，或必须改变 Dashboard
  transition authority，立即以 `requirements-changed` 回到 Spec。
