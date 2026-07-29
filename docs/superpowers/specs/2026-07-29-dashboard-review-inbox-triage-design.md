# Dashboard Progress 待复核分诊设计

## 用户结果

桌面用户在 Progress 中选择“等你动手”“运行中”或“等待中”后，视觉筛选、键盘焦点和屏幕阅读器
必须得到同一个结果，同时仍能看懂这些任务位于哪条 Workflow、哪个阶段。

## 约束与非目标

- 只覆盖 1024–1920px 桌面 Dashboard，不进行手机布局、截图或验收。
- 不恢复已退役的独立 Inbox 视图，不复制第二套待拍板判定。
- 不修改 API、Snapshot、Workflow 或安全边界，不新增依赖。
- 保留 Progress 画布、抽屉、乐观状态、现有 GSAP 墨线与 reduced-motion 终态。

## 现状与证据

### 代码事实

- `inbox/inbox.ts` 只保留同源待拍板选择器；`App.tsx` 用它生成导航徽章。
- 真实操作入口是 `ProgressView` 与 `TaskDetail`；旧 `InboxView` 已有明确退役注释。
- `buildCanvasGroups` 把不匹配任务标为 `dimmed`；`WorkflowCanvas` 只把按钮降到 30% 不透明度，
  没有禁用、`aria-hidden` 或 roving tab 语义。
- 状态页签使用 `role=tablist/tab`，但四个 tab 都在普通 Tab 顺序，且不响应 Arrow/Home/End。

### 真实浏览器基线

目标页面由本 worktree 的生产构建和 server 在 `127.0.0.1:18831` 提供；数据来自真实注册项目，
未执行任何写动作。

| 视口 | 文档横向溢出 | 画布内部滚动 | 待复核卡首屏 | 不匹配卡 |
| --- | ---: | ---: | --- | --- |
| 1024×768 | 0 | 778px | 可见 | 30% 透明，仍可聚焦 |
| 1200×870 | 0 | 602px | 可见 | 30% 透明，仍可聚焦 |
| 1440×900 | 0 | 578px | 可见 | 30% 透明，仍可聚焦 |
| 1920×1080 | 0 | 578px | 可见 | 30% 透明，仍可聚焦 |

基线在真实 “等你动手 1 / 其余 3” 场景中确认：未匹配按钮没有 `disabled`、`aria-hidden` 或
负 `tabIndex`。因此视觉上像已筛除，辅助技术和键盘却仍会进入它们。

## 方案比较

| 方案 | 优点 | 代价 | 结论 |
| --- | --- | --- | --- |
| 只渲染匹配卡 | 分诊最干净 | 阶段轨出现空洞，丢失 Workflow 上下文 | 不采用 |
| 恢复独立决策列表 | 扫描最快 | 重复已退役 Inbox，形成第二操作面 | 不采用 |
| 画布上下文 + 交互隔离 | 保留阶段语境，修复焦点与读屏不一致 | 仍会看到弱化的上下文卡 | 采用 |

## 决策

### 筛选状态

- `all`：所有任务保持当前交互。
- `need/run/queue`：匹配卡保持完整；不匹配卡仍占据原阶段位置，但设置 `disabled` 与
  `aria-hidden=true`，不能打开抽屉、不能进入 Tab 顺序。
- 筛选条下显示可见状态摘要，例如“聚焦 1 个需你处理的任务；3 个其他任务仅保留为流程上下文”。
  摘要使用 `role=status` 与 `aria-live=polite`；零匹配也必须诚实显示 0。

### 键盘模型

- 状态页签使用 roving `tabIndex`：当前 tab 为 0，其余为 -1。
- `ArrowRight`/`ArrowLeft` 循环切换，`Home`/`End` 跳到首尾；选择与焦点同步。
- 鼠标点击和受控 `onDeckTab` 语义保持不变。
- 切换筛选不会自动打开任务，也不会改写 URL、Snapshot 或 Change。

### 视觉与动效

- 摘要沿用 `bg-fill`、`text-text-2/3` 与 Lucide `ListFilter`，不新增颜色 token。
- 继续使用现有 GSAP tab 墨线；本批不新增循环或装饰动画。
- `prefers-reduced-motion` 仍由现有 `gsap.set` 直接落终态。

## 状态矩阵

| 状态 | 行为 |
| --- | --- |
| loading | 保留现有 polite status，不提前显示筛选摘要 |
| error | 保留现有 alert；已有 Snapshot 时仍按当前数据渲染 |
| empty | 保留现有空态，不显示空 tablist |
| filtered zero | 画布保留弱化上下文；摘要明确“聚焦 0 个” |
| disabled context | 不可点击、不在无障碍树和 Tab 顺序 |
| selected match | 可打开抽屉；Escape 后焦点回到触发卡 |

## Assumptions / Decision Log

- 假设：阶段位置是 Progress 的核心心智模型。证据是现有 v10c 设计注释明确“画布即操作面”，因此不
  再增加列表。
- 假设：不匹配卡的唯一目的变为视觉上下文。若仍允许打开，它就不是筛选后的上下文而是第二交互层；
  因此必须禁用并从辅助技术隐藏。
- 假设：用户没有要求自动跳到“等你动手”。为避免惊扰常用“全部”视图，本批不改变默认 tab。
- 决定：能力归入既有 `dashboard-ui-ux-system`，不新增虚假的 `review-inbox` capability。
- 原型决策：Explore 的真实浏览器和 DOM 基线已消除交互可行性未知，数据模型、API 与状态机均保持
  不变；持续授权下采用可逆的“不插入一次性 prototype”默认值，直接由红绿组件测试验证。

## Grill 自检

- 所有权：分类规则仍由 `progressModel` / `deckMatch` 拥有；Toolbar 只投影键盘和摘要。
- 证据：真实浏览器与 DOM 属性共同证明视觉/交互不一致，不依赖主观截图判断。
- 失败模式：若 `disabled` 未随 `dimmed` 同源，筛选会再次漂移；测试必须逐卡断言。
- 文档归属：交互要求进入 `dashboard-ui-ux-system` delta spec；实现细节留在本 RFC/ADR。
- 安全：无写端点、无新数据读取、无跨域或凭证变化。

## 验收重点

- 四个桌面宽度均无文档级横向溢出；既有画布内部滚动契约保留。
- 状态 tab 的 Arrow/Home/End 与 roving `tabIndex` 可验证。
- 非匹配卡同时具有 `data-dim=true`、`disabled`、`aria-hidden=true`，且点击不打开抽屉。
- 匹配卡仍可点击；Escape 后恢复焦点。
- Light/Dark/System、成功/加载/错误/空态、零匹配与 reduced-motion 均如实呈现。
- 中英文摘要完整，无手机验收声明。

```coverage
touches:
L1_api:      waived -> 不修改 HTTP/SSE/API
L2_data:     waived -> 仅消费现有 FlatRow/deckCounts，无 schema 或持久化
L3_rules:    filled -> #筛选状态
L4_state:    filled -> #状态矩阵
L5_errors:   filled -> #状态矩阵
L6_security: waived -> 不改变鉴权、权限、token 或本地信任边界
L7_perf:     waived -> 固定四个 tab 与既有有界任务投影，不新增无界工作
L8_deps:     waived -> 不新增或升级依赖
L10_terms:   filled -> openspec/changes/dashboard-review-inbox-triage-20260729/CONTEXT.md
```
