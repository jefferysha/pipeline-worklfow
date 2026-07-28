# Loop 路径策略预检增量规格

## ADDED Requirements

### Requirement: 预检必须解释真实 Loop 路径策略

系统 SHALL 接受已登记项目中的真实 Loop 与一组有界的 canonical 项目相对路径，并使用
kernel `ConstraintPolicy` 与自动化执行面相同的 glob matcher 逐条解释 merge 路径策略。
判定 SHALL 依次采用 denylist、allowlist、允许；空 allowlist SHALL 表示零路径获准。

#### Scenario: 路径同时命中允许与禁止规则

- **WHEN** 用户预检的路径同时命中 Loop 的 allowlist 与 denylist
- **THEN** 该路径返回 `blocked` 与 `path-denied`
- **AND** `matched_pattern` 为声明顺序中的首个 denylist 命中

#### Scenario: 空 allowlist

- **WHEN** 用户为 allowlist 为空的 Loop 预检任意路径
- **THEN** 每条路径返回 `blocked` 与 `path-outside-allowlist`
- **AND** 结果不得把缺少授权解释成全放行

#### Scenario: 路径获准

- **WHEN** 路径未命中 denylist 且命中 allowlist
- **THEN** 该路径返回 `allowed`、`allowlist` 与首个命中的 allowlist pattern

### Requirement: 预检 API 必须有界、受保护且无副作用

`POST /api/loops/scope-preview` SHALL 复用 Dashboard 既有 Host、Bearer token、
JSON content-type 与 registered-root 信任锚。请求 SHALL 只允许 `root`、`loop_id`、
`paths`，并接受 1–100 条去重后保持首次出现顺序的路径。单路径 SHALL 不超过 1024
UTF-8 bytes，全部路径 SHALL 不超过 32768 UTF-8 bytes。服务端 SHALL 拒绝绝对路径、
反斜杠、NUL、`.`、`..`、空 segment、尾 `/` 或规范化会改变的路径，并且不得打开、
统计、执行或持久化用户提交的路径。

#### Scenario: 有效请求

- **WHEN** 已授权用户为已登记 root 中存在的 Loop 提交有效路径
- **THEN** 服务端返回 schema version、Loop 状态、自主级别、L3 生效提示、汇总与逐路径结果
- **AND** 响应只包含提交的相对路径和 Loop 已声明的路径 pattern
- **AND** 请求不修改 Loop registry、canonical state、文件或执行队列

#### Scenario: 非 canonical 或超额路径

- **WHEN** 请求包含未知字段、非 canonical 路径、超过数量或字节上限
- **THEN** 服务端返回 HTTP 400 与 `LOOP_SCOPE_REQUEST_INVALID`
- **AND** 不读取 Loop 路径指向的文件

#### Scenario: root 或 Loop 不存在

- **WHEN** root 未登记或 Loop id 不存在
- **THEN** 服务端分别返回 HTTP 404 与 `LOOP_SCOPE_ROOT_NOT_FOUND` 或 `LOOP_SCOPE_LOOP_NOT_FOUND`

#### Scenario: registry 无法形成可信策略

- **WHEN** Loop registry 损坏或不满足 schema
- **THEN** 服务端返回 HTTP 409 与 `LOOP_SCOPE_REGISTRY_INVALID`
- **AND** 不返回部分结果

#### Scenario: registry 子路径信任失效

- **WHEN** registered root、`.pipeline` 或 `loops.yaml` 是预置 symlink，或读取前后观测到目录项/inode 身份不一致
- **THEN** 服务端返回 HTTP 403 与 `LOOP_SCOPE_ROOT_UNTRUSTED`
- **AND** 不返回任何 Loop 策略结果

#### Scenario: 无 openat 平台的信任边界

- **WHEN** 运行平台不能把最终 child lookup 锚定到可信目录描述符
- **THEN** 系统仍使用 `O_NOFOLLOW` 文件描述符读取并在读取前后复核目录项与 inode 身份
- **AND** 安全契约沿用 registered project 不与不可信同 principal writer 共享写权限的既有边界
- **AND** 系统不得把预检描述成可替代真实执行 gate 的许可

#### Scenario: registry 读取故障

- **WHEN** 可信 `loops.yaml` 存在但发生非缺失 I/O 故障
- **THEN** 服务端返回 HTTP 500 与 `LOOP_SCOPE_REGISTRY_READ_FAILED`
- **AND** 不把 I/O 故障降级成 registry 不存在、损坏或部分结果

### Requirement: 预检不得成为执行许可

系统 SHALL 每次请求 fresh 读取 Loop registry 且不得缓存或持久化预检结果。
`enforced_for_unattended_merge` SHALL 只在当前 Loop 为 `active` 且自主级别为 `L3`
时为 true；真实运行 SHALL 继续重新执行既有约束 gate。

#### Scenario: 预检后策略变化

- **WHEN** 用户先得到允许结果，随后 Loop registry 发生变化
- **THEN** 旧结果不绕过后续运行的 fresh gate
- **AND** Dashboard 明确说明预检不是许可

#### Scenario: 非 L3 Loop 模拟策略

- **WHEN** paused、L1 或 L2 Loop 执行预检
- **THEN** 系统仍返回策略模拟结果
- **AND** `enforced_for_unattended_merge` 为 false

### Requirement: Workbench 必须提供完整且可访问的预检交互

Workbench SHALL 在 Loop 的“自主与安全”高级区提供路径预检 Dialog。用户 SHALL 能按每行
一个路径粘贴输入并以按钮或 `Ctrl/Cmd+Enter` 提交。界面 SHALL 覆盖空、输入无效、加载、
全部允许、部分/全部拒绝、服务端或解码失败以及保留输入的重试状态，并提供中文与英文文案。
成功响应 SHALL 绑定到原请求：Loop id 与路径序列 SHALL 逐项一致、items SHALL 不超过 100，
且 `enforced_for_unattended_merge` SHALL 与 `active && L3` 派生事实一致；任一不一致 SHALL
作为解码失败处理。

#### Scenario: 空输入与本地错误

- **WHEN** Dialog 刚打开或输入不含有效路径
- **THEN** 提交按钮禁用且界面显示格式与上限提示
- **AND** 不发出网络请求

#### Scenario: 加载与成功

- **WHEN** 用户提交有效路径
- **THEN** 输入与提交在请求期间禁用并显示加载状态
- **AND** 成功后显示允许/阻断汇总及每条路径的 reason 与匹配 pattern

#### Scenario: 请求失败后重试

- **WHEN** 网络、服务端或响应解码失败
- **THEN** Dialog 显示可理解的错误与重试操作
- **AND** 保留原始路径输入，重试重新发出完整请求

#### Scenario: 成功响应与请求不一致

- **WHEN** 服务端成功形状包含其他 Loop、不同路径顺序或集合、超过 100 项，或矛盾的 L3 生效值
- **THEN** Dashboard 拒绝渲染该结果并进入可重试错误状态
- **AND** 不把不一致响应解释为当前请求的许可

#### Scenario: 键盘与焦点返回

- **WHEN** 键盘用户打开 Dialog、按 Tab 或 Shift+Tab 导航、以快捷键提交并按 Escape 关闭
- **THEN** 焦点被限制在 Dialog 内且关闭后返回触发按钮

### Requirement: 既有路径约束行为必须兼容

新增逐路径解释投影 SHALL 不改变 `evaluateConstraintPolicy` 的 aggregate 决策。只要任一
路径命中 denylist，aggregate reason SHALL 继续为 `path-denied` 且只报告 denylist 命中；
仅在没有 denylist 命中时才报告 allowlist 外路径。

#### Scenario: 同批路径包含两类违规

- **WHEN** 一批路径中同时存在 denylist 命中与 allowlist 外路径
- **THEN** 既有 aggregate evaluator 仍返回 `path-denied`
- **AND** 新预检投影可以逐条解释两类结果而不改变运行时 gate
