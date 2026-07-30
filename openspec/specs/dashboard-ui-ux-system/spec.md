# dashboard-ui-ux-system Specification

## Purpose
定义 Tenon Dashboard 跨主题、跨视口的一致视觉语言、响应式信息架构、可访问反馈与可验证动效边界。
## Requirements
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

### Requirement: 统一一级页面层级

Projects、Progress、AFK、Workbench 和 Machine MUST 使用一致的一级页面标题层级，并 SHOULD
按标题、说明、状态、主要动作的顺序组织页面头。移动端 MUST 允许这些元素自然重排，不得通过
缩小正文或隐藏关键状态来强行保持桌面横排。在 1024–1920px 电脑端，长项目名或 Change 名 MUST
按定义规则换行、截断或提供完整 accessible name，不得挤掉状态、原因和下一步。

#### Scenario: 在一级页面间切换

- **WHEN** 用户依次进入任意两个一级页面
- **THEN** 两个页面都存在唯一 H1、清晰的一句用途说明和一致的标题尺度
- **AND** 当前页面与主要动作在首屏可定位

#### Scenario: 长标题与窄屏

- **WHEN** 项目名或 Change 名超过移动卡片的单行宽度
- **THEN** 名称按已定义规则换行或截断
- **AND** 状态、原因和下一步不被挤出可见信息顺序

#### Scenario: 长名称与 1024px 视口

- **WHEN** 项目名或 Change 名超过 1024px 内容区的单行可用宽度
- **THEN** 名称按已定义规则换行或截断，并可取得完整值
- **AND** 状态、原因和下一步保持可扫描

### Requirement: Progress 响应式任务流

Progress MUST 在桌面保留可横向理解的阶段画布，并 MUST 在移动端把 toolbar、状态筛选、
workflow 筛选、项目摘要、阶段轨和 Change 摘要按纵向任务顺序重排。状态 tabs 和阶段轨 MAY
在各自容器内横向滚动，但整个文档 MUST NOT 横向滚动。在 1024–1920px 电脑端，toolbar、
状态筛选、workflow 筛选、项目摘要、阶段轨和 Change 摘要 MUST 保持清晰任务顺序。

#### Scenario: 移动端查看当前 Change

- **WHEN** 用户在 390×844 视口打开包含七阶段 default workflow 的项目
- **THEN** 用户先看到当前状态、Change 名和缺失产出/待处理原因
- **AND** 可在独立阶段轨容器中查看后续阶段
- **AND** 项目名不会逐词挤压成不可扫描的窄列

#### Scenario: 1024px 查看当前 Change

- **WHEN** 用户在 1024×768 视口打开包含七阶段 default workflow 的项目
- **THEN** 当前状态、Change 名和缺失产出/待处理原因可定位
- **AND** 阶段轨明确提示可查看视口外阶段
- **AND** 项目名不会挤压成不可扫描的窄列

#### Scenario: 状态筛选超过可用宽度

- **WHEN** 全部状态 tabs 的总宽度超过移动视口
- **THEN** tabs 容器可水平滚动
- **AND** 选中态、计数和滚动边界保持可见

#### Scenario: 状态筛选超过桌面内容区

- **WHEN** 全部状态 tabs 的总宽度超过 1024–1920px 电脑端内容区
- **THEN** tabs 容器可水平滚动
- **AND** 选中态、计数和滚动边界保持可见

### Requirement: 有目的且可关闭的动效

Dashboard MUST 将 hover/press、列表进入、dialog/popover、drawer 和 toast 的动效限制在
120–280ms 的 ease-out 词汇内，并 MUST NOT 使用 bounce、`back.out` 或无状态含义的循环动画。
打开与关闭动效均 MUST 使用 ease-out。当用户偏好 reduced motion 时，所有共享 GSAP 动效 MUST
直接呈现可操作终态。

#### Scenario: 普通动效偏好

- **WHEN** 列表、dialog、drawer 或 toast 出现或关闭且用户未请求 reduced motion
- **THEN** 元素使用对应的短时 ease-out 淡入/位移动效
- **AND** 动效不延迟主要操作可用性

#### Scenario: 共享交互动效基线

- **WHEN** Dashboard 使用 Tailwind transition utility 呈现 hover 或 press 状态
- **THEN** 默认 transition timing token 使用 ease-out
- **AND** 项目切换 popover 的打开与关闭补间均使用 120–280ms 的 ease-out

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
- **AND** 该加载态文案不出现硬编码中文或缺失翻译 key

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

#### Scenario: 1024px 工作台阶段可发现性

- **WHEN** 用户在 1024×768 视口打开包含七个阶段的 Workbench
- **THEN** 阶段导航明确提示可以横向滚动查看全部阶段
- **AND** 提示与阶段容器建立可访问描述关系
- **AND** 用户无需猜测即可发现视口外的 Ship 与 Archive 阶段

#### Scenario: 官方截图

- **WHEN** Progress 的布局和视觉语言发生变化
- **THEN** 官方进度页截图从通过身份校验的真实 Dashboard 重新生成
- **AND** 截图不再展示已移除的旧状态条样式

### Requirement: 可区分的桌面工作区身份

Projects MUST 在多个项目或 worktree 具有相同 basename 时提供可见且可访问的根路径身份，
并 MUST 使用稳定唯一的 React key、DOM id 与动画目标，避免同名项目复用错误状态。

#### Scenario: 同名 worktree 同时出现

- **WHEN** 电脑端 Projects 列表同时包含多个 basename 为 `pipeline-worklfow` 的根路径
- **THEN** 每行显示足以区分工作区的路径信息
- **AND** 每行 accessible name 包含完整 root
- **AND** 选择、进入和动画不会因重复 key/id 指向另一工作区

### Requirement: 非模态设置浮层键盘生命周期

Nav 设置浮层 MUST 保持非模态语义，打开时聚焦第一个设置控件，使用自然 Tab/Shift+Tab 顺序，
支持 Escape 关闭，并在关闭后把焦点归还设置入口。modal Dialog 的 Escape MUST NOT 被 Nav
设置浮层 listener 截获。

#### Scenario: 键盘打开并关闭设置

- **WHEN** 用户聚焦设置入口并按 Enter 打开浮层，再按 Escape
- **THEN** 浮层关闭
- **AND** 焦点返回设置入口
- **AND** 页面其他内容未被错误地当作模态焦点圈定

#### Scenario: modal Dialog 位于设置浮层之上

- **WHEN** 页面存在打开的 modal Dialog 且用户按 Escape
- **THEN** Dialog 按自身语义处理 Escape
- **AND** Nav 不抢先关闭设置或把焦点移出 Dialog

### Requirement: 电脑端长页面章节导航

Overview/SolutionView MUST 为七个主要章节提供由同一域配置生成的稳定 id 与语义页内导航。
导航 MUST 使用原生锚点，当前 hash MUST 通过 `aria-current` 表达，并 MUST 在
1024–1920px 电脑端保持可见焦点且不制造根级水平溢出。

#### Scenario: 1024px 电脑端定位章节

- **WHEN** 用户在 1024×768 视口打开 Overview 并通过键盘激活任一章节链接
- **THEN** 链接目标对应一个可识别的章节标题和稳定 id
- **AND** URL hash 与 `aria-current` 同步
- **AND** 页面根节点没有水平溢出

#### Scenario: reduced motion 下定位章节

- **WHEN** `prefers-reduced-motion: reduce` 生效且用户激活章节链接
- **THEN** 浏览器使用原生即时锚点定位
- **AND** 不创建平滑滚动、位移动画或残留 inline style

### Requirement: 冲突安全的主线整合

替代 PR MUST 以最新 main 为底，仅整合旧 PR 中仍有价值的增量，不得整文件回退 main
新增的 Dashboard 能力。tracked Dashboard、server、CLI 与 bootstrap 生成资产 MUST 来自最终
整合源码，MUST NOT 手工选择旧 `dist/` 产物。

#### Scenario: 旧提交与 main 同时修改 App

- **WHEN** 旧产品提交与 main 在 App、Nav、i18n、CSS、Onboarding 或 SolutionView 冲突
- **THEN** 冲突解决保留 main 新调用链
- **AND** 只加入由新测试或浏览器证据支持的旧 UI/UX 增量

#### Scenario: 最终生成资产

- **WHEN** 源码整合和测试完成
- **THEN** `npm run build` 从当前源码重新生成所有 tracked bundle
- **AND** 浏览器验收记录最终 asset hash，而非旧 PR 的 hash

### Requirement: 电脑端应用外壳

Dashboard MUST 面向本地开发者的电脑端工作流，在 1024px 至 1920px 的受支持视口内提供带可见
标签的左侧导航 rail，并 MUST 保持主要内容无根级水平溢出。本要求不声明或修改小于 1024px
视口的产品行为；已有窄屏要求属于主规格的既存能力，不属于本 Change 的设计、实现或验收范围。

#### Scenario: 1440px 桌面导航

- **WHEN** 视口宽度为 1440px
- **THEN** 左侧 rail 显示品牌、五个一级入口及设置
- **AND** 当前入口以 primary 语义、文字标签和非颜色线索标记

#### Scenario: 1024px 最小支持宽度

- **WHEN** 视口为 1024×768
- **THEN** 左侧 rail、主要内容和设置浮层均可操作
- **AND** 文档根节点没有水平溢出

### Requirement: 电脑端生产环境浏览器验收

本 UI/UX Change MUST 通过相邻组件测试、前端类型检查、前端全量测试、生产构建和真实生产
Dashboard 浏览器验收。浏览器验收 MUST 核对 `Tenon Dashboard` 页面标题、目标 URL、独立
worktree root、目标 Change 与最终 asset hash，并覆盖 1024×768、1200×870、1440×900、
1920×1080 电脑端视口的明暗/system 主题、键盘、关键状态和 reduced-motion。本要求不要求
新增、修改或验收手机端行为。

#### Scenario: 电脑端验收目标身份

- **WHEN** 验收工具连接本地 Dashboard 端口
- **THEN** 验收记录确认页面标题、注册项目 root、目标 Change 和最终 asset hash
- **AND** 其他应用占用常用端口不会被误判为通过

#### Scenario: 多桌面视口回归

- **WHEN** 在 1024×768、1200×870、1440×900 和 1920×1080 运行验收
- **THEN** 一级导航、主要内容、设置浮层和受影响功能域均可操作
- **AND** 文档根节点无水平溢出

#### Scenario: 电脑端状态与动效

- **WHEN** 验收 success、loading、error/retry、empty、disabled、offline/reconnect 与 reduced-motion
- **THEN** 状态通过文字、图标和语义 role 表达
- **AND** reduced-motion 直接呈现可操作终态

### Requirement: Progress 状态筛选交互一致性

Progress 的状态筛选 MUST 让视觉、指针、键盘与辅助技术得到同一个可交互任务集合，同时 MUST
保留 Workflow 阶段上下文。非 `all` 筛选下，不匹配任务 MAY 以弱化视觉保留原阶段位置，但 MUST
不可点击、不可聚焦且 MUST NOT 进入无障碍树。状态 tablist MUST 使用 roving tabindex，并 MUST
支持 `ArrowLeft`、`ArrowRight`、`Home` 与 `End`。筛选结果 MUST 以当前语言提供可见、polite 的
匹配数与上下文数反馈。

#### Scenario: 聚焦待复核任务

- **WHEN** 1024–1920px 电脑端用户选择“等你动手”，且 1 个任务匹配、3 个任务不匹配
- **THEN** 匹配任务保持可点击并可打开详情
- **AND** 3 个不匹配任务仅以弱化视觉保留 Workflow 阶段位置
- **AND** 不匹配任务不可点击、不可聚焦且不进入无障碍树
- **AND** 页面显示“1 个匹配 / 3 个上下文任务”的当前语言反馈

#### Scenario: 键盘切换状态

- **WHEN** 键盘用户聚焦当前状态 tab 并按 `ArrowRight`、`ArrowLeft`、`Home` 或 `End`
- **THEN** 焦点与选中状态按四个状态 tab 循环或跳转
- **AND** tablist 中只有当前 tab 处于普通 Tab 顺序
- **AND** 切换不会打开任务、改写 Snapshot 或触发服务端动作

#### Scenario: 筛选零结果

- **WHEN** 用户选择计数为 0 的状态
- **THEN** Workflow 画布仍可作为只读阶段上下文理解
- **AND** 所有不匹配任务不可交互
- **AND** polite 状态反馈明确报告 0 个匹配任务而非伪装为空白或加载

#### Scenario: reduced-motion 与主题

- **WHEN** Light、Dark 或 System 主题下启用 `prefers-reduced-motion: reduce` 并切换状态 tab
- **THEN** tab 墨线直接落到选中终态且筛选反馈仍通过文字、形态和计数表达
- **AND** 不新增循环、位移或依赖颜色单独表达的动效

### Requirement: Projects 电脑端检索与状态聚焦

Projects MUST 在 1024–1920px 电脑端提供按项目 basename 或完整 root 的本地检索，以及
`all`、`attention`、`running`、`unreachable` 四种状态聚焦。状态 badge MUST 基于完整项目集合，
结果摘要 MUST 基于查询与状态共同筛选后的集合，并以可访问 live status 明确显示当前结果数与总数。

#### Scenario: 检索同名 worktree

- **WHEN** 用户输入项目 basename 或完整 root 的任意大小写片段，且多个 worktree 具有相同 basename
- **THEN** Projects 使用去除首尾空白且不区分大小写的 basename/root 匹配
- **AND** 每个结果继续显示并暴露完整 root 身份，不会因同名项目复用错误 key、DOM id 或状态

#### Scenario: 状态聚焦与全局计数

- **WHEN** 用户选择 `attention`、`running` 或 `unreachable`
- **THEN** 结果分别满足 `ok && need > 0`、`ok && running > 0` 或 `!ok`
- **AND** 四个 badge 的计数仍来自完整项目集合，不随查询或当前聚焦条件改变
- **AND** live summary 报告当前显示数量与完整项目总数

#### Scenario: 保留默认分区并揭示不可达结果

- **WHEN** 当前状态为 `all` 且查询为空
- **THEN** Projects 保留既有“需要你动手 / 其余 / 读不到”分区和不可达折叠语义
- **WHEN** 查询匹配不可达项目或当前状态为 `unreachable`
- **THEN** 匹配的不可达只读行直接可见并继续提供 `aria-disabled` 语义

#### Scenario: 键盘选择状态

- **WHEN** 焦点位于任一状态筛选按钮且用户按 ArrowLeft、ArrowRight、Home 或 End
- **THEN** 焦点和选择状态按 roving radio group 模型同步移动并支持首尾循环
- **AND** 选择器使用有名称的 `radiogroup`，每个选项使用 `radio` 与 `aria-checked` 暴露
  one-of-many 状态
- **AND** 每次只有选中的 radio 可通过常规 Tab 顺序到达

#### Scenario: 清除查询与零结果恢复

- **WHEN** 搜索框有内容且用户按 Escape
- **THEN** 仅清空查询并保留当前状态筛选
- **WHEN** 查询与状态共同产生零结果且用户执行清除条件
- **THEN** 查询恢复为空、状态恢复为 `all`，焦点回到搜索框
- **AND** 空态以文字说明原因，不只依靠颜色表达

#### Scenario: 高频筛选与 reduced motion

- **WHEN** 用户连续输入查询或切换状态筛选
- **THEN** Projects 只在完整 rows 事实集合变化时预排序一次；查询或状态切换仅执行 O(n) 本地过滤，
  不发起网络请求
- **AND** 不按每次查询或状态变化重播 GSAP 列表入场
- **AND** `prefers-reduced-motion: reduce` 下既有集合级动画继续直接呈现终态

#### Scenario: 确定性查询与状态朗读

- **WHEN** 项目路径包含 locale-sensitive casing，或用户改变状态聚焦
- **THEN** basename/root 以不依赖浏览器 locale 的小写归一规则匹配
- **AND** live summary 同时朗读当前状态名称、当前结果数量与完整项目总数

#### Scenario: 四档电脑端兼容性

- **WHEN** 用户在 1024×768、1200×870、1440×900 或 1920×1080 查看 Projects
- **THEN** 搜索、状态筛选按钮组、结果摘要、项目身份和恢复操作均可见且可操作
- **AND** 页面没有横向文档溢出
- **AND** 本 Change 不新增手机端布局、触控目标或验收要求

### Requirement: Onboarding 命令复制结果必须诚实且可恢复

Onboarding MUST 为每一条终端命令独立呈现 `idle`、`pending`、`success` 和 `error`
复制状态。应用 MUST 以真实 `Clipboard.writeText` 的结果决定成功或失败；Clipboard API
缺失、同步抛错和异步拒绝 MUST 统一进入错误状态，不得静默失败、伪造成功或产生未处理的
Promise rejection。失败状态 MUST 保留完整且可选择的命令，并以中英文可见文字说明用户可
手动复制。

#### Scenario: 键盘复制成功

- **WHEN** 电脑端键盘用户聚焦某条命令的复制按钮并按 Enter，且剪贴板写入成功
- **THEN** 该行立即呈现 pending 并禁用按钮，完成后呈现可见且 polite 宣读的成功状态
- **AND** 焦点保持在原按钮，另一条命令的状态不改变
- **AND** 成功状态约 2 秒后回到 idle

#### Scenario: 剪贴板能力缺失或拒绝

- **WHEN** Clipboard API 缺失、同步抛错或异步拒绝写入
- **THEN** 该行呈现带文字和非颜色线索的错误状态，并约 4 秒后回到 idle
- **AND** 错误文案只描述浏览器复制未完成及手动恢复，不暗示 Tenon、项目或服务器失败
- **AND** 完整命令保持可见、可选择且未被应用自动重试

#### Scenario: pending 防止重复提交

- **WHEN** 某条命令的剪贴板 Promise 尚未完成
- **THEN** 该行复制按钮以 `aria-disabled=true` 表达不可用，状态机不能发起第二次写入
- **AND** 键盘焦点保持在原按钮，不因原生 disabled 行为丢失
- **AND** pending 状态通过当前语言的可见文案表达，不只依赖旋转或颜色

#### Scenario: 迟到结果不污染当前界面

- **WHEN** 组件在剪贴板 Promise 完成前卸载，或旧操作已被新的有效 generation 取代
- **THEN** 迟到的 resolve 或 reject 不再更新界面或创建重置计时器
- **AND** 已存在的成功或失败重置计时器在卸载与新操作开始时被清理

### Requirement: Onboarding 桌面步骤层级

Onboarding MUST 在 1024–1920px 电脑端把初始化与诊断命令呈现为有序、可扫描的步骤卡片。
1024px 视口 MUST 保持单列顺序；1200px、1440px 和 1920px 视口 SHOULD 使用两列步骤布局。
布局 MUST 使用既有主题 token，并 MUST NOT 制造根级水平溢出或改变既有小于 1024px 契约。

#### Scenario: 最小电脑端视口

- **WHEN** 用户在 1024×768 打开无项目的 Dashboard
- **THEN** 两个步骤按初始化后诊断的顺序单列呈现，命令与反馈均完整可操作
- **AND** 文档根节点没有水平溢出

#### Scenario: 宽电脑端视口

- **WHEN** 用户在 1200×870、1440×900 或 1920×1080 打开无项目的 Dashboard
- **THEN** 两个步骤以等宽双列呈现，并保持标题、说明、命令与反馈的统一层级
- **AND** Light、Dark 与 System 主题中的边界、文字、成功、错误和 focus ring 保持同一语义

#### Scenario: reduced motion

- **WHEN** `prefers-reduced-motion: reduce` 生效
- **THEN** Onboarding 复制状态仍提供完整文字、图标和语义 role
- **AND** 控件过渡被取消，复制状态时序与可操作性不受影响

### Requirement: Context Bundle SHALL 提供电脑端容量层级

Progress 详情抽屉中的 Context Bundle 预览 MUST 在 1024–1920px 电脑端以
“目标与预算控制 → 容量结论 → 输入文档或恢复状态”的顺序呈现。容量结论 MUST 使用现有
semantic token、文字、精确数字和非颜色线索；文档行 MUST 保持 path 的主要层级，并让 kind、
mode、reason 与 byte metadata 可扫描但不争夺焦点。

容量变化 MAY 使用 120–280ms 的短 CSS transition 表达反馈，但 MUST NOT 使用循环、弹跳或纯装饰
动画；reduced-motion MUST 直接呈现终态。实现 MUST 使用 Lucide 作为图标形状源，装饰图标 MUST
退出无障碍树。该要求不新增或修改手机端产品行为。

#### Scenario: 1024px 最小电脑端宽度

- **WHEN** 用户在 1024×768 打开包含成功预览的 Progress 详情抽屉
- **THEN** 控制、容量摘要和文档行均可操作且无根级水平溢出
- **AND** 长 path 换行或截断策略不会遮挡 kind、mode 与 byte metadata。

#### Scenario: 电脑端主题与信息层级

- **WHEN** 用户在 1200×870、1440×900 或 1920×1080 使用 Light、Dark 或 System 主题
- **THEN** 容量、warning、danger、focus 和表面角色保持一致语义
- **AND** 用户无需仅凭颜色即可区分 success、budget-error 与其他 error。

#### Scenario: 键盘与 reduced motion

- **WHEN** 用户只使用键盘操作 target、budget 和 submit
- **THEN** focus 顺序与视觉阅读顺序一致且焦点环不被裁切
- **WHEN** 用户请求 reduced motion
- **THEN** 容量与 loading 反馈直接处于最终状态并保留全部文字和语义。
