# trace-timeline Specification

## Purpose

为本地捕获会话提供安全、有界、可筛选且诚实披露完整性边界的 metadata-only Trace 时间线，使用户能在
Tenon Dashboard 中诊断 HTTP 错误、耗时、模型与实际 provider usage，而不暴露 prompt、正文、header、
query 或 upstream URL。
## Requirements
### Requirement: TraceStore 提供有界的最近记录窗口

TraceStore SHALL 在不改变现有 JSONL/sidecar 持久化格式的前提下，提供只读的最近记录窗口。窗口最多
返回 200 条合法记录，最多从文件尾部读取 8 MiB，并保持所返回记录的原始捕获顺序。

窗口必须返回 `total_count`、`returned_count`、`skipped_count`、`truncated`、`integrity` 与稳定
warning code。损坏行、字节预算造成的不完整首行或 sidecar/文件计数矛盾不得被静默解释为完整空数据。

#### Scenario: 长会话只读取最近窗口

- **GIVEN** 已知 session 含超过 200 条合法记录
- **WHEN** 调用有界窗口 reader
- **THEN** 最多读取并返回最近 200 条，结果按捕获顺序排列
- **AND** `truncated=true`

#### Scenario: 损坏行显式降级

- **GIVEN** 最近窗口包含无法解码的 JSONL 行
- **WHEN** reader 构造窗口
- **THEN** 跳过该行并增加 `skipped_count`
- **AND** `integrity=partial` 且 warnings 包含 `malformed-record`

#### Scenario: 单条超大记录越过读取预算

- **GIVEN** 文件尾部无法在 8 MiB 内形成完整 JSONL 记录
- **WHEN** reader 读取窗口
- **THEN** 不得继续无界读取
- **AND** 返回 `integrity=partial`、`truncated=true` 与 `byte-limit`

### Requirement: Server 输出 metadata-only Trace Timeline

server SHALL 新增 `GET /api/traces/timeline?session=<id>`。成功响应必须精确声明
`outbound: "local-only"` 与 `content: "metadata-only"`，且只能返回规格定义的 session、完整性、
summary 与 entry 白名单字段。

entry 允许：sequence、request id、turn、timestamp、duration、transport、method、去 query 的 path、
HTTP status/outcome、model、实际 input/output/cached token 与 stream event count。任何 headers、
request/response body、prompt/messages、tools/tool input/output、完整 query、upstream URL 或未知
record key 都不得进入响应。

#### Scenario: 原始敏感内容不跨过新 API

- **GIVEN** raw record 的 headers、body、prompt、messages、tools、query 与 upstream 包含唯一哨兵值
- **WHEN** 请求 timeline
- **THEN** 响应递归键和值均不包含这些原始字段或哨兵
- **AND** path 只保留 `?` 之前的部分

#### Scenario: 未知扩展字段不透传

- **GIVEN** raw record 含任意未知对象和数组
- **WHEN** projector 构造 entry
- **THEN** 只输出白名单字段

### Requirement: Timeline 诚实归一化结果与实际 usage

Timeline SHALL 把 HTTP status `200–399` 映射为 `success`，`>=400` 映射为 `error`，缺失、负数、超出 HTTP
范围或类型不符映射为 `unknown`。该 outcome 只能描述 transport，不得写回 Workflow 或表示模型、
工具、verification 成功。

model 与 usage 只能从明确支持的 Anthropic/OpenAI 响应路径读取；字符串必须有长度上限，数值必须是
非负 safe integer。缺失/非法字段必须为 `null`，不得估算或补零。summary 只累加实际值，并保留
unknown count。

#### Scenario: 缺失 usage 与真实零可区分

- **GIVEN** 一条记录没有 usage，另一条记录的实际 usage 为 0
- **WHEN** projector 归一化两条记录
- **THEN** 前者字段为 `null`，后者字段为 `0`

#### Scenario: HTTP 错误进入失败汇总

- **GIVEN** timeline 中分别有 200、429 与缺失 status 的记录
- **WHEN** projector 生成 summary
- **THEN** success/error/unknown count 分别为 1/1/1

### Requirement: Timeline HTTP 语义区分未知、空与失败

Timeline HTTP 语义 SHALL 让缺少 `session` 查询参数返回 400；未知 session 必须返回 404；已知但无记录的 session 必须返回
200 和空 entries；reader/projector 异常必须返回 500。新路由只允许 GET。旧 sessions/records 路由
及其响应必须保持兼容。

#### Scenario: 已知空 session

- **GIVEN** session sidecar 存在且 `record_count=0`
- **WHEN** 请求 timeline
- **THEN** 返回 200、`total_count=0` 和空 entries

#### Scenario: 未知 session

- **GIVEN** session sidecar 不存在
- **WHEN** 请求 timeline
- **THEN** 返回 404，而不是 `200 + []`

### Requirement: Dashboard 提供可筛选的 Trace Timeline

Dashboard SHALL 让现有 Advanced → Traffic 入口使用 timeline API。选中 session 后，界面必须显示调用、HTTP
失败、总耗时与实际 token 摘要，并按捕获顺序呈现 turn/time、endpoint、status/outcome、duration、
transport 以及存在时的 model/usage/stream count。

界面必须提供“全部 / 失败 / 成功”筛选。unknown 记录只在“全部”出现并由 summary 单独计数。
筛选后无匹配必须显示专用空态和清除筛选操作，不能与“session 无记录”混淆。

#### Scenario: 用户只查看失败请求

- **GIVEN** 选中的 timeline 含 success、error 与 unknown
- **WHEN** 用户激活“失败”筛选
- **THEN** 只显示 error entry
- **AND** summary 仍描述完整窗口

#### Scenario: 窗口不完整

- **GIVEN** 响应为 partial 或 truncated
- **WHEN** Dashboard 渲染 timeline
- **THEN** 使用文字提示完整性边界与可重试动作
- **AND** 不只用颜色表达

### Requirement: Traffic 交互完整覆盖状态、i18n 与键盘

Traffic 交互 SHALL 让 session rail 与 timeline detail 分别拥有 loading、empty、error、retry 状态；
detail 还必须区分未选择、已知空 session、partial-window、filter-empty。所有新增及现存 Traffic
可见文案必须同时提供中文和英文。

Session、filter、retry、clear 操作必须使用原生可聚焦控件。Tab 可按 rail → detail 的视觉顺序遍历；
Enter/Space 可选择 session 与筛选；session 必须暴露 `aria-pressed`。焦点位于工作区时按 Escape
必须清除当前 session、取消旧响应的可见效力、重置筛选，并把焦点恢复到对应 session 按钮。快速切换
session 时，较早响应不得覆盖当前选择。

#### Scenario: timeline 失败后重试

- **GIVEN** sessions 成功且 timeline 请求失败
- **WHEN** 用户激活 detail 内的重试
- **THEN** rail 与当前 selection 保持可用
- **AND** 同一 session 重新进入 loading
- **AND** 成功后显示 timeline，不丢失当前 session

#### Scenario: Escape 返回 session 列表

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
