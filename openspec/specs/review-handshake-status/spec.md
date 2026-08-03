# Review Handshake Status Specification

## Purpose

定义 Tenon 如何把 canonical exact-event review receipt 以失败关闭、滚动兼容的共享契约投影到
Dashboard，并在不替代 transition guards 或人工授权边界的前提下提供可访问的只读状态反馈。

## Requirements

### Requirement: Server 必须投影 canonical Review Handshake

Server MUST 在现有 `tenon-snapshot/v2` 的每个 `ChangeSnapshot` 中返回必有的
`reviewHandshake` 判别联合。该投影必须只从 `StateStore` 读取的 canonical Change state 与该
Change 冻结的 workflow plan 派生，不得解析 YAML 文本或由 Dashboard 解释 raw receipt fields。

#### Scenario: 尚未发起 review request

- **WHEN** canonical `review_gate_phase`、`review_gate_status`、`review_gate_event`、
  `review_requested_at` 与 `review_acknowledged_at` 全部为空
- **THEN** snapshot 必须返回 `{ status: "not-requested" }`

#### Scenario: exact-event request 等待确认

- **WHEN** canonical receipt 的 phase 等于当前 review-gated step、status 为 `pending`、event 属于
  当前冻结 plan 的真实出边、requested time 非空且 acknowledged time 为空
- **THEN** snapshot 必须返回 `pending`、原始 exact event 与 requested time

#### Scenario: exact-event receipt 已批准

- **WHEN** canonical receipt 满足当前 review-gated step 与真实出边，status 为 `approved`，且两个
  canonical 时间均非空
- **THEN** snapshot 必须返回 `approved`、同一 exact event、requested time 与 acknowledged time

#### Scenario: receipt 非法或漂移

- **WHEN** 任一 receipt 字段非空但形成半组、未知 status、phase 不匹配、当前 step 不是 review
  gate、event 为空或不属于当前冻结 plan 出边
- **THEN** snapshot 构建必须 fail-loud 并进入现有 Project/Change 错误面
- **AND** Server 不得把该状态降级成 `not-requested`、`pending` 或 `approved`

### Requirement: Snapshot 扩展必须保持滚动兼容且失败关闭

Server MUST 继续声明 `tenon-snapshot/v2`，同版本 HTTP 与 SSE 必须输出相同投影。Dashboard 在滚动
升级窗口内必须允许整个 `reviewHandshake` 属性缺失，但属性一旦出现就必须按判别联合和当前冻结
workflow 规则严格解码。

#### Scenario: 新 Server 被旧 Dashboard 消费

- **WHEN** 旧 Dashboard 收到含 `reviewHandshake` 的新 snapshot
- **THEN** 现有加法契约必须允许旧 Dashboard 忽略该未知顶层 Change 字段

#### Scenario: 新 Dashboard 被旧 Server 服务

- **WHEN** Change snapshot 缺少 `reviewHandshake`
- **THEN** Dashboard 必须保留该 Change 并把 handshake 视为 unavailable
- **AND** 不得从 `fields.review_gate_*` 回退推断状态

#### Scenario: 已出现的对象形状非法

- **WHEN** `reviewHandshake` 含未知 status、空/不可达 event、缺失或多余的分支字段，或时间不满足
  pending/approved 不变量
- **THEN** Decoder 必须拒绝该 snapshot/frame 并复用现有错误路径

#### Scenario: 敏感字段不进入投影

- **WHEN** Server 构造任意合法 Review Handshake DTO
- **THEN** DTO 不得包含 host session、delegated authority、marker、token、本机路径或原始 prompt

### Requirement: Progress Drawer 必须区分 readiness 与 receipt

Dashboard MUST 在当前 Change 的 Progress Drawer 当前阶段区显示只读 Review Handshake 状态卡，并
保持 transition guard readiness、canonical receipt 与 Dashboard direct transition 三种语义互不
替代。

#### Scenario: 当前 step 不要求 review

- **WHEN** 当前冻结 workflow 的 gate 为 `null` 或 `confirm`
- **THEN** Drawer 不得渲染 Review Handshake 状态卡或新增 Tab stop

#### Scenario: review step 的状态不可用

- **WHEN** 当前 step 是 review gate 但 snapshot 缺少 `reviewHandshake`
- **THEN** 状态卡必须显示中性的“当前服务未提供复核状态；操作仍由服务端校验”
- **AND** 不得显示“尚未请求”或批准状态

#### Scenario: 三种 canonical 状态

- **WHEN** 当前 review step 分别收到 `not-requested`、`pending` 或 `approved`
- **THEN** 状态卡必须分别显示尚未记录请求、等待明确确认或已记录 exact-event 确认的中英文事实状态与下一步
- **AND** 文案不得把 receipt 描述为 transition readiness；服务端 guards 仍是唯一 readiness 权威
- **AND** pending/approved 必须以不翻译的 monospace 原文展示 exact event
- **AND** not-requested 不得制造默认 event

#### Scenario: readiness 与 handshake 不一致

- **WHEN** guards 尚未满足但 receipt 是 pending/approved，或 guards 已满足但 receipt 是
  not-requested
- **THEN** Drawer 必须如实同时呈现现有 readiness 与 receipt 状态
- **AND** 不得合并为单个 `readyForReview` 布尔值

### Requirement: 现有动作、状态路径与可访问性必须保持

Review Handshake 状态卡 MUST 是只读、无独立 fetch、无本地 receipt 缓存的 snapshot 投影。它不得
改变现有 Dashboard transition 的 host-bound 人工批准、busy、回滚、键盘或焦点语义。

#### Scenario: 多出口 review step

- **WHEN** 当前 step 有多条合法 transition 且 receipt 只绑定其中一个 exact event
- **THEN** 状态卡只说明该 receipt 的 event
- **AND** 所有原有合法 Dashboard 出口仍保持可见和可选择

#### Scenario: SSE 更新与 transition 消费

- **WHEN** snapshot 从 `pending` 更新为 `approved`，或成功 transition 消费 receipt 并推进 phase
- **THEN** 打开的 Drawer 必须原位收敛到最新状态且不缓存旧 event
- **AND** 不得要求关闭重开 Drawer 或移动当前键盘焦点

#### Scenario: loading、error 与 empty

- **WHEN** Progress 处于初始 loading、无 snapshot error 或无在制 Change
- **THEN** 必须继续使用现有 `role=status`、`role=alert` 与 empty 路径，且不渲染虚假状态卡

#### Scenario: transition 失败

- **WHEN** 用户选择 Dashboard 出口但 Server 拒绝 transition
- **THEN** 现有乐观 phase patch 必须回滚，状态卡保留最新权威 snapshot 状态，用户可以重试

#### Scenario: 键盘与语言

- **WHEN** 用户以键盘打开或关闭 Drawer，或切换中文/英文
- **THEN** 现有 focus trap、Escape 与触发器焦点归还必须保持
- **AND** 状态变化必须通过 polite live region 可感知，状态卡本身不得新增可聚焦控件
