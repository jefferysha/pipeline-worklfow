# OpenSpec 增量规格

## ADDED Requirements

### Requirement: 语义化视觉 token

Dashboard MUST 通过全局语义 token 区分页面、表面、主要动作、成功、注意、危险、编排和焦点状态，
并 MUST 在系统主题、显式浅色和显式深色三种主题解析路径中保持相同角色含义。主要动作色 MUST
与成功状态色分离；功能域组件 MUST NOT 引入绕过 token 的新品牌色。

#### Scenario: 主要动作与成功状态同时出现

- **WHEN** 页面同时渲染可执行主按钮和已通过/在线状态
- **THEN** 主按钮使用 primary/cobalt 角色，已通过/在线使用 success/green 角色
- **AND** 两者在浅色和深色主题下都能仅凭形态与文字继续区分

#### Scenario: 用户显式切换主题

- **WHEN** 用户在系统暗色偏好下显式选择浅色，或在系统浅色偏好下显式选择深色
- **THEN** 显式主题覆盖系统偏好
- **AND** 页面、表面、文字、边界、焦点和状态 token 均切换为对应主题值

### Requirement: 一致的图标语言

Dashboard MUST 使用 Lucide 作为唯一图标形状源。既有 `shared/Icon` 名称和尺寸 API MAY 保持兼容，
但其形状 MUST 映射到 Lucide，并以 `currentColor`、统一线宽和装饰性 `aria-hidden` 呈现。
只有图标而没有可见文字的操作 MUST 提供稳定的可访问名称。

#### Scenario: 共享图标在不同功能域使用

- **WHEN** Projects、Progress、Workbench 或任务详情渲染同一语义的共享图标
- **THEN** 图标来自 Lucide，继承调用方颜色并保持一致线宽
- **AND** 图标不会单独进入无障碍树

#### Scenario: 图标按钮

- **WHEN** 按钮只显示设置、关闭、复制或导航图标
- **THEN** 按钮提供 `aria-label`、可见 tooltip 或等价稳定名称

### Requirement: 自适应应用外壳

Dashboard MUST 在大于 720px 的视口提供带可见标签的左侧导航 rail，并 MUST 在不大于 720px
的视口改为带图标和短标签的底部导航。移动主内容、toast 和弹层 MUST 避让导航高度与
`safe-area-inset-bottom`，一级触控入口的目标尺寸 MUST 不小于 44×44px。

#### Scenario: 桌面导航

- **WHEN** 视口宽度为 1440px
- **THEN** 左侧 rail 显示品牌、五个一级入口及设置
- **AND** 当前入口以 primary 语义、文字标签和非颜色线索标记

#### Scenario: 390px 移动导航

- **WHEN** 视口宽度为 390px
- **THEN** 左侧不再保留占宽 rail，一级入口在底部显示图标和文字标签
- **AND** 页面末尾、toast 与设置弹层不被底部导航或设备安全区遮挡
- **AND** 文档根节点没有横向溢出

### Requirement: 统一一级页面层级

Projects、Progress、AFK、Workbench 和 Machine MUST 使用一致的一级页面标题层级，并 SHOULD
按标题、说明、状态、主要动作的顺序组织页面头。移动端 MUST 允许这些元素自然重排，不得通过
缩小正文或隐藏关键状态来强行保持桌面横排。

#### Scenario: 在一级页面间切换

- **WHEN** 用户依次进入任意两个一级页面
- **THEN** 两个页面都存在唯一 H1、清晰的一句用途说明和一致的标题尺度
- **AND** 当前页面与主要动作在首屏可定位

#### Scenario: 长标题与窄屏

- **WHEN** 项目名或 Change 名超过移动卡片的单行宽度
- **THEN** 名称按已定义规则换行或截断
- **AND** 状态、原因和下一步不被挤出可见信息顺序

### Requirement: Progress 响应式任务流

Progress MUST 在桌面保留可横向理解的阶段画布，并 MUST 在移动端把 toolbar、状态筛选、
workflow 筛选、项目摘要、阶段轨和 Change 摘要按纵向任务顺序重排。状态 tabs 和阶段轨 MAY
在各自容器内横向滚动，但整个文档 MUST NOT 横向滚动。

#### Scenario: 移动端查看当前 Change

- **WHEN** 用户在 390×844 视口打开包含七阶段 default workflow 的项目
- **THEN** 用户先看到当前状态、Change 名和缺失产出/待处理原因
- **AND** 可在独立阶段轨容器中查看后续阶段
- **AND** 项目名不会逐词挤压成不可扫描的窄列

#### Scenario: 状态筛选超过可用宽度

- **WHEN** 全部状态 tabs 的总宽度超过移动视口
- **THEN** tabs 容器可水平滚动
- **AND** 选中态、计数和滚动边界保持可见

### Requirement: 有目的且可关闭的动效

Dashboard MUST 将 hover/press、列表进入、dialog/popover、drawer 和 toast 的动效限制在
120–280ms 的 ease-out 词汇内，并 MUST NOT 使用 bounce、`back.out` 或无状态含义的循环动画。
当用户偏好 reduced motion 时，所有共享 GSAP 动效 MUST 直接呈现可操作终态。

#### Scenario: 普通动效偏好

- **WHEN** 列表、dialog 或 toast 首次出现且用户未请求 reduced motion
- **THEN** 元素使用对应的短时 ease-out 淡入/位移动效
- **AND** 动效不延迟主要操作可用性

#### Scenario: reduced motion

- **WHEN** `prefers-reduced-motion: reduce` 生效
- **THEN** 列表、dialog、drawer 和 toast 直接处于最终可见位置
- **AND** 状态仍通过颜色、图标和文字表达

### Requirement: 可访问的反馈与恢复状态

Dashboard MUST 为正常、加载、空、离线、错误、成功和待处理状态提供可读文字与语义 role。
键盘用户 MUST 能到达一级导航、筛选、对话框和主要动作，focus ring MUST 清晰且不被裁切。
正文与关键控件在明暗主题下 MUST 满足 WCAG AA 对比要求。

#### Scenario: 离线恢复

- **WHEN** SSE 连接断开
- **THEN** 页面显示带 `role=status` 的离线说明和可聚焦重连动作
- **AND** 状态不只通过红色表达

#### Scenario: 键盘遍历主要页面

- **WHEN** 用户只使用键盘浏览一级导航、状态 tabs、筛选和主操作
- **THEN** 焦点顺序与视觉阅读顺序一致
- **AND** 每个焦点位置都有清晰可见的 focus ring

### Requirement: 生产环境浏览器验收

UI/UX Change MUST 通过组件测试、前端类型检查、生产构建和真实生产 Dashboard 浏览器验收。
浏览器验收 MUST 核对 `Tenon Dashboard` 页面标题、目标 URL、独立 worktree root 与目标 Change，
并覆盖 Projects、Progress、AFK、Workbench、Machine 的明暗主题、桌面和移动关键状态。

#### Scenario: 验收目标身份

- **WHEN** 验收工具连接本地 Dashboard 端口
- **THEN** 验收记录确认页面标题、注册项目 root 和目标 Change 名均与本 Change 一致
- **AND** 其他应用占用同一常用端口不会被误判为通过

#### Scenario: 多视口回归

- **WHEN** 在 1440×900、1024×768 和 390×844 运行验收
- **THEN** 一级导航和主要内容可操作
- **AND** 390px 文档根节点无横向溢出
