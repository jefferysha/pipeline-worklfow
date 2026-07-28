# Dashboard UI/UX Build 评修复记录

## 范围

- `packages/dashboard-app/src/solution/SolutionView.tsx`
- `packages/dashboard-app/src/solution/SolutionSectionNav.tsx`
- `packages/dashboard-app/src/solution/solutionModel.ts`
- `packages/dashboard-app/src/solution/SolutionView.test.tsx`
- `packages/dashboard-app/src/components/ui/button.tsx`
- `packages/dashboard-app/src/components/ui/button.test.tsx`

## 第 1 轮：基线问题

| Severity | 问题 | 用户影响 | 处置 |
| --- | --- | --- | --- |
| HIGH | 390×844 概览页高 8,981px，七个主要章节没有页内导航 | 移动和键盘用户只能长距离线性滚动，难以建立页面结构和快速定位 | 增加七章节语义导航与原生锚点 |
| MEDIUM | 根容器使用双轴 `overflow-hidden` | 新增 sticky 导航会被祖先滚动容器限制，无法在长页面持续可用 | 改为 `overflow-x-clip`，只裁剪横向溢出 |
| MEDIUM | 窄屏七章节标签无法同时容纳 | 若换行会形成高噪声按钮墙；若压缩会损害标签和触控目标 | 使用横向滚动、`min-w-max` 与每项至少 44px 高 |
| MEDIUM | 章节标题没有稳定 id/可访问关联 | 锚点可能失效，辅助技术无法从目标 section 得知对应标题 | 由 solution 域静态配置生成 section/heading id，并使用 `aria-labelledby` |

## 修复

- 新增域内 `SolutionSectionNav`，使用语义 `nav`、`ul` 与原生链接。
- 复用既有七个双语 eyebrow，不修改共享 i18n。
- 桌面保持一行紧凑索引；移动端横向滚动并保持 44px 高目标。
- 使用既有 border/card/fill/accent/ring token，未增加装饰色、依赖或全局状态。
- 不引入平滑滚动、observer 或 GSAP；reduced-motion 下直接保持原生即时定位。
- TDD 红灯确认导航缺失；实现后相邻测试 7/7 通过。

## 第 2 轮：运行态复评

环境：当前 automation worktree 的生产构建，`http://127.0.0.1:18831/?view=overview`，
页面标题 `Tenon Dashboard`。

- 1200×870 浅色：7 个链接、7 个真实目标、每项 44px；根级 `scrollWidth=1200`。
- 390×844 深色 + reduced-motion：导航 `clientWidth=304`、`scrollWidth=566`，
  根级 `scrollWidth=390`；每项 44px；7 个目标全部存在。
- 键盘聚焦第 7 项时导航自动从 `scrollLeft=0` 滚至 `262.5`，焦点保持可见；Enter 后
  `location.hash=#solution-community`，sticky 导航保持 `top=8`。
- reduced-motion：链接 `transition-property=none`，文档 `scroll-behavior=auto`。

复评结论：Critical / High / Medium = 0 / 0 / 0。

## 第 3 轮：共享原语与状态反馈

最新 overlap 复核确认 PR #5–#8 仍覆盖 App、Nav、i18n、progress、workbench、shared 与 API；
`components/ui/button.tsx` 和 `solution/` 未发生文件重叠。

| Severity | 问题 | 用户影响 | 处置 |
| --- | --- | --- | --- |
| MEDIUM | SolutionView 激活锚点后没有当前章节反馈 | 用户到达章节后仍需重新从内容推断位置，辅助技术也没有当前位置语义 | 使用 URL hash 驱动 `aria-current="location"` 与 token 化选中样式 |
| MEDIUM | 共享 Button 的 default/sm/lg/icon 移动尺寸为 32–40px | 高频移动操作低于本 Change 采用的 44px 增强目标 | 仅在 ≤720px 将常规和图标尺寸提升到 44px；保留明确紧凑的 xs 变体 |
| MEDIUM | Button 的通用 transition 未显式降级 | reduced-motion 用户仍会看到按钮状态过渡 | 原语统一添加 `motion-reduce:transition-none` |
| LOW | disabled Button 只有 50% opacity，且 pointer-events 使禁用光标反馈不可见 | 状态可辨认但反馈较弱 | 使用原生 disabled 阻断语义、60% opacity 与 `cursor-not-allowed` |

TDD 红灯：Button 两项与当前章节一项共 3 个断言按预期失败。最小实现后，定向测试
`10/10` 通过，`npm run typecheck:web` 与生产构建通过。

## 第 4 轮：运行态复评

环境：当前 automation worktree 的生产构建，`http://127.0.0.1:18832/?view=overview`，
页面标题 `Tenon Dashboard`。

- 1200×870 浅色：键盘激活“03 · 证明”后 hash 为 `#solution-evidence`，
  链接获得 `aria-current="location"`，焦点和选中层级清晰。
- 390×844 深色 + reduced-motion：根级无水平溢出；七个导航链接和两个概览 Button 均为
  44px 高；按钮与链接的 `transition-property=none`。
- 聚焦末项时横向导航滚动至 `262.5`，末项仍完整可见；激活后“07 · 社区”获得当前章节语义。
- 桌面证据：`docs/ux/shots/dashboard-ui-ux-overhaul-automation/solution-section-nav-active-desktop-light.png`
- 移动证据：`docs/ux/shots/dashboard-ui-ux-overhaul-automation/solution-section-nav-active-mobile-dark-reduced.png`

复评结论：Critical / High / Medium = 0 / 0 / 0。当前章节只跟随 URL hash，不引入
IntersectionObserver、滚动监听或 GSAP，避免高频观察器和额外清理负担。
