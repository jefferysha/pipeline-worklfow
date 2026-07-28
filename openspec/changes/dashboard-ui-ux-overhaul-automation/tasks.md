# 任务

## 立项

- [x] 从最新 `origin/main` 建立 automation 专用分支与独立 Change。
- [x] 记录目标、非目标、初始假设、并行冲突边界与七阶段任务。
- [x] 登记 Open 文档证据并通过 `tenon check`。

## 调研

- [x] 审计页面、功能域、共享组件、主题 token、图标、状态和动效实现。
- [x] 采集目标 Dashboard 的电脑端、明暗主题、键盘与 reduced-motion 浏览器基线。
- [x] 对照并行 worktree 的改动清单，选择无冲突首个切片。
- [x] 形成设计方向、ADR 与可访问性/动效决策。

## 规格

- [x] 记录 AppHeader 无生产消费者的需求变化，并以 `requirements-changed` 回退 Spec。
- [x] 复核 PR #5–#8 的 Dashboard 文件集合，选择生产可达且无重叠的 SolutionView。
- [x] 修订 `dashboard-ui-ux-system` delta spec、验收场景与可执行计划。
- [x] 根据第二次 Verify 将范围收敛到本 Change 修改的桌面 shell、共享原语与涉及流程。
- [x] 将 PR #5 重叠从“避开或等待”修订为可审计的独立提交、review 与 rebase 风险。

## 实现

- [x] SolutionView：先补失败测试，约束七章节页内导航、锚点目标与语义。
- [x] SolutionView：实现域内章节导航、可见焦点、锚点状态与 reduced-motion 兼容。
- [x] SolutionView：完成电脑端、明暗主题、键盘与 reduced-motion 浏览器验收。
- [x] 复核 PR #5–#8 overlap，并为多消费者 Button 原语补齐 disabled、focus 与 reduced-motion 状态。
- [x] 为 SolutionView 页内导航增加 URL hash 驱动的当前章节反馈与 `aria-current`。
- [x] 修复第一次 Verify：Nav/设置双语 accessible name、设置焦点圈定/Escape/返回。
- [x] 将主动作与 success 语义分离，并支持 system/light/dark 三态主题及系统偏好实时变化。
- [x] 统一高频共享原语、空态与恢复操作的 focus、disabled 和 reduced-motion 基线。
- [x] 补齐 Button 桌面尺寸、主题/导航生命周期与设计系统契约测试。
- [x] 按最终电脑端定位撤销移动触控专项规则、手机截图与对应测试声明。
- [x] 修复 App 加载、错误和 flash 的 live-region 语义，并为可恢复错误提供明确操作。
- [x] 将非模态设置浮层改为自然 Tab 顺序，保留初始焦点、Escape 与焦点返回，避免嵌套 Escape 双关闭。
- [x] 为 App 的 GSAP flash tween 增加卸载/更新清理，并补主题 listener 清理测试。
- [x] 为零项目 Onboarding 增加唯一 H1，为复制命令提供可区分名称和至少 24px 的桌面点击高度。
- [x] 修复第三次 Verify：真实共享模态 Dialog 的 Escape 不再穿透关闭非模态设置浮层。
- [x] 修复第三次 Verify：toast 在运行中切换 reduced-motion 时清理旧 tween 并直达终态。
- [x] 修复全量 pre-Verify：列表与 Dialog 入场动画在运行中切换 reduced-motion 时同步清理。

## 验证

- [ ] 运行定向 Vitest、`npm run typecheck:web`、`npm run test:web` 与 `npm run build:web`。
- [ ] 在真实 Dashboard 完成 1024/1200/1440px、明暗主题、键盘、状态与 reduced-motion 验收。
- [ ] 生成验证报告并处理所有可修复偏差。

## 交付

- [ ] 提交范围内文件并非强制推送 automation 分支。
- [ ] 创建或更新同一个非草稿 PR，附设计、Tenon、测试与浏览器证据。
- [ ] 检查 PR/CI，修复范围内失败并记录外部阻塞。

## 归档

- [ ] 应用 OpenSpec、完成归档并更新 automation memory。
- [ ] 归档后仅跟踪同一 PR 的 review/CI；合并后停止代码改动。
