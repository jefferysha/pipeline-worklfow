# Dashboard UI/UX 主线整合设计

## 初始假设

- 最新 main 已包含另一轮 Dashboard UI/UX 工作，不能机械覆盖冲突文件。
- 以最新 main 为基础，按“主线实现优先、旧 PR 逐项取舍、相同行为不重复”的方式整合。
- 保持安静的桌面运维控制台视觉方向：中性表面、语义强调色、状态色只表达状态。
- 保持 light/dark/system、键盘与屏幕阅读器、状态反馈和 `prefers-reduced-motion`。
- 动效只表达层级、因果或反馈，并在媒体偏好变化或卸载时清理。
- 支持范围以 1024px 为硬下限；不新增手机端任务、断言、截图或验收结论，已有小屏代码仅作不承诺的 best-effort 保留。

## 风险

- PR #10 的大范围生成资产与治理文档会放大无意义差异；需要区分产品源码、验证证据与历史 Change。
- main 可能已采用不同但等价的组件结构，机械 cherry-pick 会回退主线改进或制造重复实现。
- 冲突解决后的行为与旧 Verify SHA 不同，必须完整重验。
- 替代 PR 创建前关闭旧 PR 会造成交付窗口中断，因此旧 PR 保留到 Ship 完成。

## 待验证问题

- 已验证：Projects 重复 basename、设置 Escape/焦点归还、Solution 长页章节导航仍未被 main 等价覆盖。
- 已验证：真实冲突集中在 App、Nav、Onboarding、SolutionView、i18n、全局 CSS、主规格与生成入口。
- 已验证：main 在 1024/1440 基线无根级水平溢出，现有视觉语言与新功能应保留。
- Spec 需冻结：如何把主规格从手机端 MUST 收敛为 1024–1920px 电脑端，并覆盖 loading、error、empty、disabled、键盘、明暗主题与 reduced-motion。

## Explore 决策

- 采用最新 main 为底、旧产品提交逐个移植、冲突文件人工增量合并。
- 不复制旧治理历史、归档、Verify 报告或 `dist/`；生成资产最终重建。
- 保留 main 已存在的手机 best-effort 代码，但不把手机端纳入产品承诺、实施投入或验收。
- 替代 PR 创建并可审查后再关闭 PR #10。
- Build 使用 `direct + worktree`：App、Nav、i18n、CSS 与 Solution 的冲突面高度重叠，需要在同一隔离分支按切片串行保持主线调用链；本次持续自动化授权覆盖该 direct override。

详细设计：`docs/superpowers/specs/2026-07-29-dashboard-ui-ux-overhaul-reconcile-design.md`

ADR：`docs/adr/2026-07-29-dashboard-ui-ux-overhaul-reconcile-explore.md`
