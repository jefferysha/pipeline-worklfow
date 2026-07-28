# Dashboard UI/UX 基线审计

日期：2026-07-28

Change：`dashboard-ui-ux-overhaul-automation`

初始基线：`origin/main` (`2d103e330f847e003ff5909097d892f5722cca04`)

首切片复核基线：`origin/main` (`15fe619b`)

## 审计范围与方法

- 阅读 `packages/dashboard-app/src` 的 App、shell、progress、workbench、shared、solution、inbox、主题 token、动效工具、测试与 i18n。
- 运行 `npm ci` 后执行全仓 `npm run build`，以生成真实 workspace 类型产物和当前 Dashboard bundle。
- 在隔离的 `TENON_RUNTIME_HOME=/tmp/tenon-dashboard-ui-ux-9830` 与唯一端口 `18830` 启动当前 worktree 的 `packages/server/dist/dashboard.mjs`。
- 通过 Playwright 核验页面身份：标题为 `Tenon Dashboard`，URL 为 `http://127.0.0.1:18830/?view=progress`，正文包含 Tenon 项目/进度/自动运行/工作台/机器导航。
- 采集 1200×870 浅色桌面与 375×812 深色 reduced-motion 基线截图：
  - `docs/ux/shots/dashboard-ui-ux-overhaul-automation/baseline-desktop-light.png`
  - `docs/ux/shots/dashboard-ui-ux-overhaul-automation/baseline-mobile-dark-reduced.png`

## 现状地图

| 层级 | 现状 | 主要风险 |
| --- | --- | --- |
| 主题与 token | `index.css` 已有语义色、表面、边框、阴影、圆角和 Tailwind 映射 | primary 与成功色语义尚在并行 worktree 调整，本 Change 不重复修改 |
| 应用外壳 | 左侧 rail、设置浮层、项目上下文 AppHeader | 移动端 rail 占用横向空间；设置入口缺 accessible name；并行 worktree已处理 Nav |
| 状态反馈 | 各域自带 loading/error/empty/disabled，缺少统一原语 | 状态角色与 live region 不一致；并行 worktree已覆盖大量域组件 |
| 动效 | `shared/motion.ts`、`useGSAP`、CSS transition 并存 | reduced-motion 覆盖不完整；局部 `gsap.matchMedia()` 生命周期需明确 revert |
| UI primitives | Radix + CVA + `components/ui/*` 已存在，Button 有多个真实使用方 | 部分 primitive 未被采用；直接全局替换会扩大回归面 |
| i18n | 中英文资源集中管理 | 新可见文本必须双语；本轮首切片不新增文案 |

## 浏览器基线事实

- 桌面与 375px 移动视口均无根级水平溢出。
- 空项目页有一个 `main` 和一个 `nav` landmark，控制可键盘聚焦。
- 375px 下主导航按钮约 `40×34px`；WCAG 2.2 AA 的目标尺寸最低要求为 24×24 CSS px，但本产品的高频移动导航采用 44×44 的增强目标更稳妥。
- 设置触发按钮在可访问性快照中没有名称；视觉图标不能替代可访问名称。
- 模拟 `prefers-reduced-motion: reduce` 后仍检测到 7 个 150ms 导航 transition。Tailwind 官方建议用 `motion-reduce`/`motion-safe` 显式降级。
- 浅色/深色主题切换有效；`prefers-color-scheme: dark` 与显式主题状态能正确落到 `data-theme="dark"`。
- 控制台没有一般 warning，但一次 reload 周期记录到 `/api/stream` 的瞬时 `ERR_CONNECTION_REFUSED`；同期 `/api/snapshot` 返回 200。需要在后续真实状态验收中复核 SSE，而不能把该瞬时错误判成 UI 通过或失败。

## 并行变更冲突审计

本机另有 `/Users/a1234/.codex/worktrees/pipeline-worklfow-dashboard-ui-ux`，分支
`codex/dashboard-ui-ux-overhaul`，对应开放 PR #5；同时 PR #6–#8 分别覆盖 verification、
context bundle 与 host target plan。它们合计触及：

- `App.tsx`、`Nav.tsx`、`index.css`、`translations.ts`
- progress、workbench、machine、afk、shared 的大量组件
- `CreateChangeDialog.tsx` 的 live region 与错误角色

由于 automation memory、Change 与分支无法证明这些 PR 和本自动任务同源，本 Change 不复用它们。
已观察到的 Nav、全局 token、Create Change、progress、workbench 与 API 问题只登记为合并后复核项。

## 无冲突首切片

最初选择的 `shell/AppHeader.tsx` 经调用链复核只有定义和测试，没有任何生产消费者。继续实现不会产生
真实浏览器效果，因此以 `requirements-changed` 从 Build 回退 Spec，没有提交该死代码切片。

修订后的首切片选择生产可达的 `solution/SolutionView.tsx`：

- `App.tsx` 在 overview 分支直接渲染 `SolutionView`，Nav logo 可进入该页面。
- `solution/` 不在 PR #5–#8 的文件集合中，降低并行冲突风险。
- 390×844 深色 reduced-motion 基线页面高度为 8981px，七个主章节之间没有页内定位。
- 新导航只复用既有章节 eyebrow，不新增可见文案，因此无需修改并行 PR 已触及的 i18n。
- 原生锚点提供键盘与无 JavaScript 降级；44px 目标、横向滚动、稳定 id、`aria-labelledby`
  和 `motion-reduce:transition-none` 覆盖移动与辅助技术需求。

## 首切片浏览器验收

环境：当前 automation worktree 的生产构建，`http://127.0.0.1:18831/?view=overview`；
页面标题为 `Tenon Dashboard`。

- 桌面证据：`docs/ux/shots/dashboard-ui-ux-overhaul-automation/solution-section-nav-desktop-light.png`
- 移动证据：`docs/ux/shots/dashboard-ui-ux-overhaul-automation/solution-section-nav-mobile-dark-reduced.png`

| 场景 | 结果 |
| --- | --- |
| 1200×870 浅色桌面 | 7 个链接对应 7 个真实 section；导航宽 1076px，无根级水平溢出 |
| 桌面键盘 | Tab 焦点可见；Enter 到达 `#solution-community`；sticky top 为 8px |
| 390×844 深色移动 | 根宽 390px；导航 304px 可视宽、566px 内容宽；每个链接高 44px |
| 移动键盘 | 聚焦末项时横向滚动从 0 到 262.5，末项保持可见；Enter hash 正确 |
| reduced motion | `transition-property: none`，`scroll-behavior: auto` |
| 可访问性树 | 具名 navigation landmark；7 个 link href 与 7 个 section target 一一对应 |

第二轮浏览器审查未发现 Critical/High/Medium 问题。主动章节高亮保留为 LOW 后续候选，
首切片不引入 IntersectionObserver 与额外状态同步。

## 外部依据

- W3C WCAG 2.2 Target Size (Minimum)：https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- W3C WCAG 2.2 Target Size (Enhanced)：https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced
- GSAP `matchMedia()`：https://gsap.com/docs/v3/GSAP/gsap.matchMedia%28%29/
- Tailwind motion variants：https://tailwindcss.com/docs/hover-focus-and-other-states

## 开放问题

- 并行 worktree 的 Nav/token 变更最终是否进入 PR；进入后需重新跑同一移动与 reduced-motion 基线。
- 当前隔离 runtime 没有加载真实项目注册表；SolutionView 是静态产品概览，不依赖项目 fixture，
  因而首切片可在目标生产构建中直接验收。
- 全局 UI primitive 收敛留给后续切片，避免在第一批同时改变所有消费者。
