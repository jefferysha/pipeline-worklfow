# ADR：以生产可达且无冲突的纵向切片分批优化 Dashboard

## 背景

目标是系统性优化整个 Dashboard，但本机已有一个无法由 automation memory、Change、分支和 PR
互证同源的 Dashboard worktree，且它正在修改全局 token、导航和多数功能域组件。直接继续同一批文件
会制造不可审查的重复改动和高概率冲突。

浏览器基线同时确认：主题与基本 reflow 可用，但导航 accessible name、移动目标尺寸和
reduced-motion 仍有缺口。并行 PR 已触及这些具体文件。原先选择的 `shell/AppHeader.tsx`
虽然文件无重叠，但仓库搜索确认它没有生产调用方；修改它不会产生可验收的 Dashboard 结果。

最新 `origin/main` 新增了生产可达的 `solution/SolutionView.tsx`。真实浏览器在
390×844、深色、reduced-motion 下确认页面无横向溢出，但完整高度为 8,981px，七个主要章节
只能线性滚动定位。该域的生产源码、model 与测试均不在 PR #5–#8 的改动集中。

## 决策

采用一个 Change/PR、分批交付：

1. 首批只修改 `solution/` 域内的 SolutionView、章节导航组件与相邻测试。
2. 为七个既有章节建立稳定锚点和页内导航，不新增文案、不修改共享 i18n 或 App/Nav 接线。
3. 导航在桌面保持清晰层级，在移动端横向滚动且每个链接至少 44px 高；焦点样式使用既有语义 token。
4. 不引入平滑滚动或非必要 GSAP；`prefers-reduced-motion` 下保持浏览器原生即时定位。
5. 保持 App/shell → 功能域 → model/state → api 的依赖方向，不改变 API 或业务规则。
6. 全局 token/Nav 与其他 PR 的功能改动只记录、后续重测，不在本 Change 复制实现。

## 备选方案

- 复用 PR #5：拒绝，因为它的 Change、分支、worktree 与 automation memory 不同源。
- 继续 AppHeader：拒绝，因为没有生产消费者，无法形成浏览器可见结果。
- 等待所有并行改动完成：拒绝，SolutionView 有明确、可独立验证的无冲突工作。
- 立刻统一全部 UI primitive：暂缓，消费者范围过大，不符合首批可审查目标。

## 后果

- 优点：低冲突、可回滚、浏览器与测试证据边界清楚。
- 代价：首批只解决概览长页面的定位与导航，需要后续自动运行持续扩展同一个 Change/PR。
- 后续每轮必须重查远端 PR、并行 worktree 与当前文件 overlap，再选下一批。

## 第一次 Verify 后的修订

冻结的 OpenSpec 使用 Dashboard-wide MUST，而首批只覆盖 SolutionView 与 Button，Reviewer 因此给出
High failure；E2E 同时发现移动 rail 34px 和无名设置按钮。Change 已按规则 Verify→Build 回退。

本轮决定在同一 Change 内增加最小系统基线：accent 主动作 token、system 主题、Nav/设置键盘语义、
共享交互原语、空态/错误恢复触控目标和全局 reduced-motion 终态。该修订不改变 API、业务规则或
依赖。它与 PR #5 存在已知文件重叠，但不复用对方 Change/state、不 force push，并保持整改为独立
提交，供合并时选择或回滚。

## 最终产品定位修订

用户明确指出 Dashboard 是本地开发者控制台，实际只在电脑端使用。此前自动任务中的移动布局与
移动验收要求被本次明确指令覆盖。最终支持范围收敛为 1024–1920px 电脑端；保留键盘、屏幕阅读器、
明暗/system 主题、状态反馈和 reduced-motion，但撤销 44px 移动触控专项规则及手机截图。此决策
减少无真实用户场景的实现、测试和长期维护成本。
