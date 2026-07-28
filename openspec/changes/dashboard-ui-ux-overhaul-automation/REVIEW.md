# Dashboard UI/UX Build 评修复记录

## 范围

- `packages/dashboard-app/src/solution/SolutionView.tsx`
- `packages/dashboard-app/src/solution/SolutionSectionNav.tsx`
- `packages/dashboard-app/src/solution/solutionModel.ts`
- `packages/dashboard-app/src/solution/SolutionView.test.tsx`

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

## LOW / 后续观察

- 当前章节没有自动高亮。首切片不引入 IntersectionObserver 与状态同步，避免为简单定位扩大复杂度；
  若后续真实使用反馈表明需要，可在独立切片中设计 URL hash、滚动与返回行为。
