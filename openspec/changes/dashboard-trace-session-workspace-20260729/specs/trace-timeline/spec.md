# OpenSpec 增量规格

## MODIFIED Requirements

### Requirement: Dashboard 提供桌面主从 Trace 工作区

Dashboard SHALL 在 1024–1920px 电脑端让现有 Machine → Advanced → Traffic 入口使用稳定的 session
rail + timeline detail 主从布局。rail 宽度必须被限制在约 248–288px，detail 必须使用剩余宽度且
`min-width: 0`；四个目标视口的页面与工作区不得产生横向滚动。

rail 每个 session 必须按层级显示 client、状态、可辨识的 session id、proxy mode、记录数与短绝对
更新时间。完整 session id 必须通过 title 或等价可访问文本保留；不得从现有字段推断 agent、host、
cwd、uptime 或控制能力。

未选择 session 时，detail 必须保持稳定的选择提示且不得请求 timeline。选择后，detail 必须按
会话身份、调用/HTTP 失败/总耗时/实际 token 摘要、完整性提示、筛选和捕获顺序的 timeline 呈现。
较窄 detail 的摘要使用 2×2，足够宽时使用四列。timeline 必须使用同一容器内的紧凑分隔行，并
保留 turn/time、endpoint、status/outcome、duration/transport 以及存在时的 model/usage/stream count。

#### Scenario: 1024px 桌面保持会话与详情上下文

- **GIVEN** Machine 页的 Traffic 有多个 session 且视口为 1024×768
- **WHEN** 用户选择一个 session
- **THEN** rail 选中态与 detail 同时可辨识当前 session
- **AND** 页面和 Traffic 工作区没有横向滚动
- **AND** 摘要为可读的 2×2，不挤压 endpoint 主列

#### Scenario: 宽桌面保持 Tenon 身份

- **GIVEN** 视口为 1440×900 或 1920×1080
- **WHEN** 用户浏览 Trace 工作区
- **THEN** detail 使用可用桌面宽度且摘要可呈现为四列
- **AND** 选中、焦点、成功、失败与完整性使用 Tenon 现有 token 和文字语义
- **AND** 不出现 Chorus 品牌、色板、图标、字段、控制操作或移动 drill-down

#### Scenario: 未选择时不产生隐式 timeline 请求

- **GIVEN** sessions 已成功加载且非空
- **WHEN** 用户尚未选择 session，或通过 Escape 清除选择
- **THEN** detail 显示选择提示
- **AND** Dashboard 不请求任何 session timeline

### Requirement: Traffic 交互完整覆盖状态、i18n 与键盘

Traffic 交互 SHALL 让 session rail 与 timeline detail 分别拥有 loading、empty、error、retry 状态；
detail 还必须区分未选择、已知空 session、partial-window、filter-empty。所有新增及现存 Traffic
可见文案必须同时提供中文和英文。

Session、filter、retry、clear 操作必须使用原生可聚焦控件。Tab 可按 rail → detail 的视觉顺序遍历；
Enter/Space 可选择 session 与筛选；session 必须暴露 `aria-pressed`。焦点位于工作区时按 Escape
必须清除当前 session、取消旧响应的可见效力、重置筛选，并把焦点恢复到对应 session 按钮。快速切换
session 时，较早响应不得覆盖当前选择。

#### Scenario: rail 与 detail 独立恢复

- **GIVEN** sessions 成功且 timeline 请求失败
- **WHEN** 用户激活 detail 内的重试
- **THEN** rail 与当前 selection 保持可用
- **AND** 同一 session 重新进入 loading
- **AND** 成功后显示 timeline，不丢失当前 session

#### Scenario: Escape 返回 rail

- **GIVEN** 用户已选择 session 且焦点在 detail 控件内
- **WHEN** 用户按 Escape
- **THEN** detail 返回未选择提示，筛选恢复为全部
- **AND** 焦点回到刚才的 session 按钮
- **AND** 迟到的旧响应不能重新打开或覆盖 detail

#### Scenario: 状态不会互相冒充

- **GIVEN** Trace 数据分别处于 sessions empty、known-empty、partial-window 或 filter-empty
- **WHEN** Dashboard 渲染对应状态
- **THEN** 每个状态使用独立的中英文说明与正确重试/清除操作
- **AND** partial-window 不描述为会话为空，filter-empty 不描述为没有捕获记录
