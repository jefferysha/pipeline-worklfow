# 设计

## 初始假设

- 保持现有 `App/shell → 功能域 → model/state → api` 分层，在 `shared` 与全局主题 token 中承载
  已证明跨域复用的视觉原语。
- 先建立当前体验和组件覆盖面的证据基线，再在 Explore 确定统一视觉方向、信息密度和动效语言。
- 视觉改造应保持既有业务行为与 API 兼容，优先通过样式、共享组件和视图组合改善体验。

## Explore 结论

- 采用“统一视觉系统 + 关键任务流响应式重排”，不做逐页换肤或全应用业务 IA 重写。
- 视觉方向为 Calm Technical Cockpit：中性画布、清晰 surface、cobalt primary；
  green/amber/red 分别只承担成功、注意和危险状态。
- 2026-07-14 的 `design-demos/v10-design-spec.md` 比早期“工票车间”方案更新，且与当前目标一致；
  因此明确不使用工票/车间隐喻、渐变、霓虹或 emoji 图标。
- Lucide 成为唯一图标形状源；`shared/Icon` 保留 API 并映射到 Lucide，避免一次性改写调用方。
- 桌面保留左 rail；720px 以下改为带标签的底部导航，Progress 不再缩小桌面画布，而是按移动
  阅读顺序重排。
- 统一页面标题、状态、说明、动作层级与 120–280ms ease-out 动效；reduced-motion 直达终态。
- 所有已发现问题均可在前端解决，本 Change 不需要服务端或 API 契约变化。

## 风险

- 大范围视觉改造容易形成不可审查的重写，需拆成同一 Change 下的连贯任务并逐批验证。
- 全局 token 或共享组件变化可能造成跨页面回归，必须覆盖明暗主题、响应式和主要状态。
- 动效可能引入性能、清理或可访问性问题，必须支持 `prefers-reduced-motion`。
- 移动底栏可能遮挡 toast、对话框或页面末尾，主内容必须加入导航高度与 safe-area padding。
- 生产 bundle 已有大 chunk 警告，本轮不得引入新的大型依赖。

## 已验证问题

- 覆盖面包含全局外壳、Projects、Progress、AFK、Workbench、Machine、Solution、共享 UI、
  主题 token、图标和 motion；现有 React/Tailwind/Radix/Lucide/GSAP 足够承载改造。
- 最高优先级问题是移动纯图标左 rail、Progress 桌面画布的移动降级、primary/success 色彩
  混用、一级页面层级不一致和双图标系统。
- token、Icon、motion、PageHeader 与 App shell 属于共享层；各功能域的数据和操作编排继续
  保留在原目录。
- 浏览器矩阵覆盖五个一级视图、light/dark、1440×900/1024×768/390×844、键盘与
  reduced-motion，以及正常/空/加载/离线/错误/待处理状态。

## 设计与 ADR

- `docs/research/2026-07-28-dashboard-ui-ux-audit.md`
- `docs/superpowers/specs/2026-07-28-dashboard-ui-ux-overhaul-design.md`
- `docs/adr/2026-07-28-dashboard-ui-ux-overhaul.md`
