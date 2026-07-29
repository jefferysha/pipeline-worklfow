# Dashboard UI/UX 主线整合增量规格

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: 自适应应用外壳

Dashboard MUST 面向本地开发者的电脑端工作流，在 1024px 至 1920px 的受支持视口内提供带可见
标签的左侧导航 rail，并 MUST 保持主要内容无根级水平溢出。已有小于 1024px 的 best-effort
布局 MAY 保留，但不属于本规格的产品支持、设计或验收范围。

#### Scenario: 1440px 桌面导航

- **WHEN** 视口宽度为 1440px
- **THEN** 左侧 rail 显示品牌、五个一级入口及设置
- **AND** 当前入口以 primary 语义、文字标签和非颜色线索标记

#### Scenario: 1024px 最小支持宽度

- **WHEN** 视口为 1024×768
- **THEN** 左侧 rail、主要内容和设置浮层均可操作
- **AND** 文档根节点没有水平溢出

### Requirement: 统一一级页面层级

Projects、Progress、AFK、Workbench 和 Machine MUST 在 1024–1920px 电脑端使用一致的唯一 H1，
并 SHOULD 按标题、说明、状态、主要动作的顺序组织页面头。长项目名或 Change 名 MUST 按定义
规则换行、截断或提供完整 accessible name，不得挤掉状态、原因和下一步。

#### Scenario: 在一级页面间切换

- **WHEN** 用户依次进入任意两个一级页面
- **THEN** 两个页面都存在唯一 H1、清晰的一句用途说明和一致的标题尺度
- **AND** 当前页面与主要动作在首屏可定位

#### Scenario: 长名称与 1024px 视口

- **WHEN** 项目名或 Change 名超过 1024px 内容区的单行可用宽度
- **THEN** 名称按已定义规则换行或截断，并可取得完整值
- **AND** 状态、原因和下一步保持可扫描

### Requirement: Progress 响应式任务流

Progress MUST 在 1024–1920px 电脑端保留可横向理解的阶段画布，并 MUST 让 toolbar、状态筛选、
workflow 筛选、项目摘要、阶段轨和 Change 摘要保持清晰任务顺序。局部 tabs 或阶段轨 MAY
在容器内横向滚动，但整个文档 MUST NOT 横向滚动。

#### Scenario: 1024px 查看当前 Change

- **WHEN** 用户在 1024×768 视口打开包含七阶段 default workflow 的项目
- **THEN** 当前状态、Change 名和缺失产出/待处理原因可定位
- **AND** 阶段轨明确提示可查看视口外阶段
- **AND** 项目名不会挤压成不可扫描的窄列

#### Scenario: 状态筛选超过可用宽度

- **WHEN** 全部状态 tabs 的总宽度超过桌面内容区
- **THEN** tabs 容器可水平滚动
- **AND** 选中态、计数和滚动边界保持可见

### Requirement: 生产环境浏览器验收

UI/UX Change MUST 通过相邻组件测试、前端类型检查、前端全量测试、生产构建和真实生产
Dashboard 浏览器验收。浏览器验收 MUST 核对 `Tenon Dashboard` 页面标题、目标 URL、独立
worktree root、目标 Change 与最终 asset hash，并覆盖 1024×768、1200×870、1440×900、
1920×1080 电脑端视口的明暗/system 主题、键盘、关键状态和 reduced-motion。

#### Scenario: 验收目标身份

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
