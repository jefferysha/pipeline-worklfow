# Dashboard UI/UX 系统化优化设计

## 已验证方向

- 继续使用现有 Radix、Tailwind CSS 4、CVA、Lucide 与 GSAP，不新增重复组件库。
- 设计 token 和共享原语应承载跨功能域的一致性，领域组件只表达本域状态。
- 动画仅服务空间关系、因果与反馈，并统一遵守 `prefers-reduced-motion`。
- 原首个实现候选 `shell/AppHeader.tsx` 经生产调用链复核为不可达死代码，已通过 `requirements-changed` 回退 Spec。
- 修订后的首个切片选择生产可达且不与 PR #5–#8 重叠的 `solution/SolutionView.tsx`，为七章节长页面增加页内定位和键盘焦点。
- 第一次 Verify 证明首切片不足以满足 Dashboard-wide MUST，并发现设置入口无
  accessible name、Button 消费者矩阵证据不足和设计文档生命周期漂移；Change 已按
  `verify-fail → build → requirements-changed → spec` 路径返回修订。
- 第二批以系统基线闭环：accent 主动作 token、system/light/dark 主题、Nav 与设置焦点语义、
  共享交互原语、空态/错误恢复触控目标和全局 reduced-motion 终态。
- 用户最终明确产品只服务电脑端本地开发工作流；1024–1920px 是受支持验收范围，移动触控目标、
  手机布局和手机截图不属于交付范围。
- 浏览器基线、方案比较和红队自检记录在 `docs/research/2026-07-28-dashboard-ui-ux-overhaul-automation-audit.md` 与 `docs/superpowers/specs/2026-07-28-dashboard-ui-ux-overhaul-automation-design.md`。

## 风险

- 全局 token 调整可能造成跨页面视觉回归。
- 1024px 笔记本宽度下高密度工作流可能发生信息截断或操作拥挤。
- PR #5–#8 已触及 App、Nav、i18n、progress、workbench、shared 与 API 等大量文件，存在合并冲突风险。
- 动效若缺少清理或降级可能影响性能与可访问性。
- SolutionView 是长页面；章节导航若缺少稳定锚点、当前状态和明确焦点，会降低桌面键盘用户的定位效率。
- system theme、hash 与 dialog keydown 各有一个受条件约束的 listener，必须在偏好变化、关闭或卸载时清理。

## 待验证问题

- PR #5–#8 的 review/CI/合并状态；后续每轮必须复核。
- PR #5 与 App/Nav/i18n/Solution 存在已知文件重叠；本 Change 不复用其 state 或提交、不 force push，
  并以独立整改提交保留可选合并/回滚边界。
- 第二次 Verify 必须重新覆盖完整 diff、1024/1200/1440px 桌面视口、真实 zero-project 空态、
  受控 snapshot/stream 故障恢复、system 主题变化、设置焦点圈定和 reduced-motion。
