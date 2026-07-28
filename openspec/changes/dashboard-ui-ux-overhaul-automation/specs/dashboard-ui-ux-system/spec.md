# OpenSpec 增量规格

## ADDED Requirements

### Requirement: 一致的语义视觉层级

Dashboard MUST 使用语义 token 区分背景、表面、边框、文本、主动作与状态反馈；普通主动作 MUST NOT 复用 success/error 语义。

#### Scenario: 深浅主题保持一致语义

- **WHEN** 用户在浅色、深色或系统主题之间切换
- **THEN** 相同组件的层级、状态和主次关系保持一致，文本与非文本对比度可辨认

### Requirement: 响应式高频操作

Dashboard MUST 在 375px 至 1440px 的受支持视口内保持主要内容无根级水平溢出，并为移动端高频自定义控制提供至少 44×44 CSS px 的增强操作目标。

#### Scenario: 移动概览章节定位

- **WHEN** 用户在 375×812 视口浏览包含七个主要章节的 SolutionView
- **THEN** 页内导航可横向滚动、不会造成根级水平溢出，且每个章节链接高度至少 44 CSS px

### Requirement: 键盘与屏幕阅读器可操作

所有交互控件 MUST 具有可访问名称、正确角色和可见焦点；菜单与对话框 MUST 支持 Escape、Tab/Shift+Tab、焦点返回及状态通告。

#### Scenario: 键盘定位概览章节

- **WHEN** 用户仅使用键盘遍历 SolutionView 页内导航
- **THEN** 七个链接具有可理解名称、可见焦点和有效锚点，激活后目标章节可由标题识别

### Requirement: 有目的且可降级的动效

进入、退出和状态转换动画 MUST 服务空间关系、因果或反馈；`prefers-reduced-motion: reduce` 下 MUST 直接呈现终态，GSAP 动画 MUST 在媒体条件改变或组件卸载时清理。

#### Scenario: reduced-motion 下定位长页面章节

- **WHEN** 浏览器匹配 `prefers-reduced-motion: reduce`
- **THEN** 页内导航使用浏览器原生即时锚点定位，不引入平滑滚动、位移或残留 inline 样式

### Requirement: 完整状态反馈

表单、按钮、卡片、表格、对话框和提示区域 MUST 为可达的 loading、error、empty、disabled 与 success 分支提供一致视觉和语义反馈。

#### Scenario: 异步操作失败

- **WHEN** Dashboard 异步操作返回失败
- **THEN** 用户看到可理解的错误状态，辅助技术收到适当通告，重试或恢复路径在适用时可达

### Requirement: 可审查的增量交付

每个 UI/UX 切片 MUST 包含相邻测试、类型检查、生产构建和真实浏览器证据，并在修改前复核并行 worktree/PR 文件重叠。

#### Scenario: 并行 UI 改动存在

- **WHEN** 其他活跃分支正在修改同一 Dashboard 文件
- **THEN** 当前切片选择无冲突文件或等待，不复制实现、不强推覆盖
