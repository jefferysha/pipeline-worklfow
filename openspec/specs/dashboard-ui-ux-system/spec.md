# dashboard-ui-ux-system Specification

## Purpose

定义 Tenon Dashboard 作为本地开发者电脑端控制台的语义视觉层级、可访问交互、状态反馈、
动效降级与增量交付要求。

## Requirements

### Requirement: 一致的语义视觉层级

Dashboard MUST 使用语义 token 区分背景、表面、边框、文本、主动作与状态反馈；普通主动作 MUST NOT 复用 success/error 语义。

#### Scenario: 深浅主题保持一致语义

- **WHEN** 用户在浅色、深色或系统主题之间切换
- **THEN** 相同组件的层级、状态和主次关系保持一致，文本与非文本对比度可辨认

### Requirement: 桌面工作区适配

Dashboard MUST 面向本地开发者的电脑端工作流，在 1024px 至 1920px 的受支持视口内保持主要内容无根级水平溢出，并让鼠标与键盘高频操作保持清晰、紧凑和可达。

#### Scenario: 桌面概览章节定位

- **WHEN** 用户在 1200×870 电脑端视口浏览包含七个主要章节的 SolutionView
- **THEN** 页内导航保持可见、不会造成根级水平溢出，并可用鼠标或键盘直接定位章节

### Requirement: 键盘与屏幕阅读器可操作

本 Change 修改的 Dashboard shell、共享交互原语、SolutionView 与 Onboarding 流程 MUST
提供可访问名称、正确角色和可见焦点。设置浮层为非模态浮层，MUST 在打开时聚焦首个控件、
保持浏览器自然 Tab/Shift+Tab 顺序、支持 Escape，并在关闭后把焦点返回设置入口；它 MUST NOT
模拟模态焦点圈定。

#### Scenario: 键盘定位概览章节

- **WHEN** 用户仅使用键盘遍历 SolutionView 页内导航
- **THEN** 七个链接具有可理解名称、可见焦点和有效锚点，激活后目标章节可由标题识别

### Requirement: 有目的且可降级的动效

进入、退出和状态转换动画 MUST 服务空间关系、因果或反馈；`prefers-reduced-motion: reduce` 下 MUST 直接呈现终态，GSAP 动画 MUST 在媒体条件改变或组件卸载时清理。

#### Scenario: reduced-motion 下定位长页面章节

- **WHEN** 浏览器匹配 `prefers-reduced-motion: reduce`
- **THEN** 页内导航使用浏览器原生即时锚点定位，不引入平滑滚动、位移或残留 inline 样式

### Requirement: 完整状态反馈

本 Change 触及的 App 快照加载/错误/闪现提示、Onboarding 空态，以及 Button、Input、Select、
Tabs、Dialog、DropdownMenu 等共享交互原语 MUST 为其实际可达的 loading、error、empty、
disabled 与 success 分支提供一致视觉和语义反馈。

#### Scenario: 异步操作失败

- **WHEN** App 快照不可用、快照流失败或本 Change 涉及的异步操作失败
- **THEN** 用户看到可理解的错误状态，辅助技术通过 alert 或适当 live region 收到通告，并可使用适用的重试或恢复路径

#### Scenario: 空项目进入 Onboarding

- **WHEN** Dashboard 成功加载但没有项目
- **THEN** Onboarding 页面具有唯一可识别的一级标题，每个复制命令按钮具有区分具体命令的可访问名称和至少 24px 的桌面点击高度

### Requirement: 可审查的增量交付

每个 UI/UX 切片 MUST 包含相邻测试、类型检查、生产构建和真实浏览器证据，并在修改前复核并行 worktree/PR 文件重叠。

#### Scenario: 并行 UI 改动存在

- **WHEN** 其他活跃分支正在修改同一 Dashboard 文件
- **THEN** 当前 Change 记录重叠 PR 与具体文件，保持独立提交、review 与 rebase 计划，不复制 canonical state、不复用对方提交且不强推覆盖
