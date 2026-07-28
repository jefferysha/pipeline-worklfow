# Dashboard UI/UX 系统化优化设计

## 已验证方向

- 继续使用现有 Radix、Tailwind CSS 4、CVA、Lucide 与 GSAP，不新增重复组件库。
- 设计 token 和共享原语应承载跨功能域的一致性，领域组件只表达本域状态。
- 动画仅服务空间关系、因果与反馈，并统一遵守 `prefers-reduced-motion`。
- 原首个实现候选 `shell/AppHeader.tsx` 经生产调用链复核为不可达死代码，已通过 `requirements-changed` 回退 Spec。
- 修订后的首个切片选择生产可达且不与 PR #5–#8 重叠的 `solution/SolutionView.tsx`，为七章节长页面增加页内定位、键盘焦点和移动触控体验。
- 浏览器基线、方案比较和红队自检记录在 `docs/research/2026-07-28-dashboard-ui-ux-overhaul-automation-audit.md` 与 `docs/superpowers/specs/2026-07-28-dashboard-ui-ux-overhaul-automation-design.md`。

## 风险

- 全局 token 调整可能造成跨页面视觉回归。
- 高密度工作流在移动端可能发生信息截断或操作拥挤。
- PR #5–#8 已触及 App、Nav、i18n、progress、workbench、shared 与 API 等大量文件，存在合并冲突风险。
- 动效若缺少清理或降级可能影响性能与可访问性。
- SolutionView 在移动视口形成接近九千像素的长页面；导航若不保持横向可滚动、44px 目标和明确焦点，可能把定位问题转化为新的可用性问题。

## 待验证问题

- PR #5–#8 的 review/CI/合并状态；后续每轮必须复核。
- SolutionView 首切片完成后，下一组无冲突 primitive/状态组件应由新的 overlap 与浏览器证据选择。
- `/api/stream` 在一次 reload 中出现瞬时连接拒绝，需在 Verify 复核是否为生命周期噪声或真实缺陷。
