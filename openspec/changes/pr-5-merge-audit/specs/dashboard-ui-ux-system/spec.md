# dashboard-ui-ux-system 增量规格

## MODIFIED Requirements

### Requirement: 自适应应用外壳

Dashboard MUST 在大于 720px 的视口提供带可见标签的左侧导航 rail，并 MUST 在不大于 720px
的视口改为带图标和短标签的底部导航。移动主内容、toast 和弹层 MUST 避让导航高度与
`safe-area-inset-bottom`，一级触控入口的目标尺寸 MUST 不小于 44×44px。共享的 720px
响应式变体 MUST 编译为包含 720px 的 media query，功能域不得各自定义不一致的边界语义。

#### Scenario: 桌面导航

- **WHEN** 视口宽度为 1440px
- **THEN** 左侧 rail 显示品牌、五个一级入口及设置
- **AND** 当前入口以 primary 语义、文字标签和非颜色线索标记

#### Scenario: 390px 移动导航

- **WHEN** 视口宽度为 390px
- **THEN** 左侧不再保留占宽 rail，一级入口在底部显示图标和文字标签
- **AND** 页面末尾、toast 与设置弹层不被底部导航或设备安全区遮挡
- **AND** 文档根节点没有横向溢出

#### Scenario: 720px 临界视口

- **WHEN** 视口宽度精确为 720px
- **THEN** 应用外壳和页面内容同时使用移动布局
- **AND** 构建 CSS 中对应 media query 包含该临界宽度

### Requirement: 有目的且可关闭的动效

Dashboard MUST 将 hover/press、列表进入、dialog/popover、drawer 和 toast 的动效限制在
120–280ms 的 ease-out 词汇内，并 MUST NOT 使用 bounce、`back.out` 或无状态含义的循环动画。
打开与关闭动效均 MUST 使用 ease-out。当用户偏好 reduced motion 时，所有共享 GSAP 动效 MUST
直接呈现可操作终态。

#### Scenario: 普通动效偏好

- **WHEN** 列表、dialog、drawer 或 toast 出现或关闭且用户未请求 reduced motion
- **THEN** 元素使用对应的短时 ease-out 淡入/位移动效
- **AND** 动效不延迟主要操作可用性

#### Scenario: reduced motion

- **WHEN** `prefers-reduced-motion: reduce` 生效
- **THEN** 列表、dialog、drawer 和 toast 直接处于最终可见或关闭位置
- **AND** 状态仍通过颜色、图标和文字表达

### Requirement: 可访问的反馈与恢复状态

Dashboard MUST 为正常、加载、空、离线、错误、成功和待处理状态提供可读文字与语义 role。
本 Change 新增的捕获记录加载态文案 MUST 通过成对的中英文翻译 key 提供。键盘用户 MUST
能到达一级导航、筛选、对话框和主要动作，focus ring MUST 清晰且不被裁切。正文与关键控件
在明暗主题下 MUST 满足 WCAG AA 对比要求。

#### Scenario: 离线恢复

- **WHEN** SSE 连接断开
- **THEN** 页面显示带 `role=status` 的离线说明和可聚焦重连动作
- **AND** 状态不只通过红色表达

#### Scenario: 键盘遍历主要页面

- **WHEN** 用户只使用键盘浏览一级导航、状态 tabs、筛选和主操作
- **THEN** 焦点顺序与视觉阅读顺序一致
- **AND** 每个焦点位置都有清晰可见的 focus ring

#### Scenario: 捕获记录正在加载

- **WHEN** 用户以中文或英文打开正在请求捕获记录的 Traffic 面板
- **THEN** 加载态使用当前语言对应的翻译文案
- **AND** 页面不出现硬编码中文或缺失翻译 key

### Requirement: 生产环境浏览器验收

UI/UX Change MUST 通过组件测试、前端类型检查、生产构建和真实生产 Dashboard 浏览器验收。
浏览器验收 MUST 核对 `Tenon Dashboard` 页面标题、目标 URL、独立 worktree root 与目标 Change，
并覆盖 Projects、Progress、AFK、Workbench、Machine 的明暗主题、桌面和移动关键状态。README
或官方文档引用的受影响页面截图 MUST 来自该真实验收目标，并与当前视觉语言一致。

#### Scenario: 验收目标身份

- **WHEN** 验收工具连接本地 Dashboard 端口
- **THEN** 验收记录确认页面标题、注册项目 root 和目标 Change 名均与本 Change 一致
- **AND** 其他应用占用同一常用端口不会被误判为通过

#### Scenario: 多视口回归

- **WHEN** 在 1440×900、1024×768、720×900 和 390×844 运行验收
- **THEN** 一级导航和主要内容可操作
- **AND** 720px 与 390px 使用移动外壳
- **AND** 移动视口文档根节点无横向溢出

#### Scenario: 官方截图

- **WHEN** Progress 的布局和视觉语言发生变化
- **THEN** 官方进度页截图从通过身份校验的真实 Dashboard 重新生成
- **AND** 截图不再展示已移除的旧状态条样式
