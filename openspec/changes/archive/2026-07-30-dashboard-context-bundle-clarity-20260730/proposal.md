# 提案

## Why

桌面 Dashboard 的 Context Bundle 预算预览已经能诚实呈现成功、空态与失败，但预算占用、目标阶段、
输入文档和恢复动作仍挤在连续文本中。用户在交付前快速判断“是否超预算、哪份文档占用最多、下一步
怎么处理”时需要反复阅读，缺少适合 1024–1920px 操作台的扫描层级。

## What Changes

- 在 Progress 详情抽屉内增加有界线性容量摘要、精确 remaining/overage 反馈与紧凑输入文档行。
- 保持只读 API、预算计算、目标阶段与 ledger 安全边界不变；同步中英文、键盘、主题与 reduced-motion。
- 仅验收 1024×768、1200×870、1440×900、1920×1080；不投入手机布局、截图、触控目标或验收。
- 本 Change 属于 frontend UI/UX 改进；不改变现有状态机、请求时机、输入顺序或 retry 路径。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `context-bundle-budget-preview`：改善现有 Dashboard 预算预览的可扫描性、状态反馈与桌面交互。
- `dashboard-ui-ux-system`：延续桌面操作台的一致视觉、主题、可访问性与克制动效契约。

## Impact

预计仅影响 `packages/dashboard-app/src/progress/ContextBundlePreview.tsx`、同功能域纯展示部件、相邻测试
和中英文翻译，以及对应 OpenSpec、设计与验证证据。不得修改 server/kernel/API 响应、磁盘状态、
依赖或手机契约；开放 PR #20/#23/#22/#24 的运行时代码范围不与本组件重叠。
