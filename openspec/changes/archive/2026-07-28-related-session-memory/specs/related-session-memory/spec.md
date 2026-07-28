# OpenSpec 增量规格

## ADDED Requirements

### Requirement: 提供项目受限的相关会话检索

系统 SHALL 提供 `POST /api/mem/related-sessions/search`，只在请求的 `root` 是当前机器已注册且物理存在的项目、`name` 是安全 Change id 且该 Change 存在时，检索该项目实际 root 及后代目录中的宿主会话。端点 SHALL 复用 Dashboard POST 的 loopback Host、token、`application/json` 与 body-size 防护，不得把查询词放入 URL。

#### Scenario: 在已注册项目内检索

- **WHEN** 已认证用户为一个存在的 Change 提交合法 `root`、`name`、`query` 和 `platform`
- **THEN** 系统在该已注册项目范围内执行只读检索并返回 `tenon-related-session-memory/v1`

#### Scenario: 拒绝漂移或越界目标

- **WHEN** `root` 未注册、物理锚已消失，或 `name` 不安全或不存在
- **THEN** 系统返回稳定的 `404 project-or-change-not-found`，且不扫描任意路径

### Requirement: 检索在真实读取层受硬预算约束

系统 SHALL 把查询限制为 2–128 个字符且最多 8 个 token，并把单次检索限制为最近 100 个候选、最多 8 个结果、单文件最多 2 MiB、总读取最多 16 MiB。生产文件系统 SHALL 在读取层施加字节限制，不得先读取整个文件再截断。预算耗尽 SHALL 返回 HTTP 200、`partial=true` 与稳定 warning，而非声称结果完整。

#### Scenario: 文件超过单文件预算

- **WHEN** 候选会话文件超过 2 MiB
- **THEN** 系统不读取超出上限的字节，并返回带单文件预算 warning 的 partial 响应

#### Scenario: 请求达到总读取预算

- **WHEN** 已读取候选达到 16 MiB 总预算
- **THEN** 系统停止继续读取，保留预算内可证明的结果并返回 partial 响应

#### Scenario: 并发检索受限

- **WHEN** 同一 server 已有 related-session-memory 检索正在运行
- **THEN** 后续请求返回 `429 memory-search-busy`，且不会启动第二轮扫描

### Requirement: 结果只暴露有界的用户内容

每个结果 SHALL 只包含宿主、opaque session id、有界标题、更新时间、分数、命中数、最多 320 字符的一条 user excerpt，以及 OpenCode 后代合并数。结果 SHALL 排除 assistant 原文、thinking、工具调用、完整对话、宿主文件路径和 cwd；没有 user 命中的会话 SHALL 不进入结果。

#### Scenario: 助手文本独自命中

- **WHEN** 查询只命中 assistant、thinking 或工具内容而未命中任何 user message
- **THEN** 该会话不会出现在 related-session-memory 结果中

#### Scenario: OpenCode 子会话被合并

- **WHEN** OpenCode parent 与其 child session 在同一项目内形成一个命中
- **THEN** 系统返回一个父会话结果并通过 `descendants_merged` 说明合并数量

### Requirement: 宿主过滤是显式闭集

请求的 `platform` SHALL 只接受 `all|claude|codex|opencode|pi`。具体宿主值只调用对应 adapter；`all` 才调用全部四个 adapter。系统 SHALL 不根据目录名、安装状态或当前 binding 猜测宿主。

#### Scenario: 选择单一宿主

- **WHEN** 用户选择 `codex`
- **THEN** 系统只检索 Codex adapter 且其他宿主零扫描

#### Scenario: 未知宿主失败关闭

- **WHEN** 请求包含闭集外的 `platform`
- **THEN** 系统返回 `400 invalid-request` 且不执行任何 adapter

### Requirement: Dashboard 提供完整且可访问的交互状态

TaskDetail SHALL 为所有 Change 挂载独立 `RelatedSessionsSection`。组件 SHALL 由用户显式提交搜索，支持原生 form 的 Enter 键提交，并提供 `idle|loading|results|empty|error` 状态、中英文文案、partial warning 和重试。切换项目或 Change SHALL 清除旧结果；较旧请求的响应 SHALL 不覆盖较新的查询。

#### Scenario: 键盘提交并显示结果

- **WHEN** 用户在查询输入框按 Enter 提交合法查询
- **THEN** 组件进入带 `role=status` 的 loading 状态，并在成功后显示有界结果

#### Scenario: 空结果和错误

- **WHEN** API 分别返回空 matches 或 typed/network error
- **THEN** 组件分别显示独立空态或带 `role=alert` 的错误态，并允许用户重新提交

#### Scenario: Change 切换清除旧状态

- **WHEN** TaskDetail 的 `root` 或 `name` 变化
- **THEN** 组件回到 idle 且不显示上一个 Change 的结果

### Requirement: 检索保持只读并兼容现有恢复契约

相关会话检索 SHALL 不写 canonical state、OpenSpec、review receipt、session binding、宿主会话文件、Change 缓存或浏览器持久存储。现有 `/api/mem/session-link`、`/api/mem/session-links` 与 `tenon mem search` 的请求和响应语义 SHALL 保持兼容，V1 SHALL 不生成新的恢复命令。

#### Scenario: 搜索前后持久状态不变

- **WHEN** related-session-memory 搜索成功、partial、失败或被取消
- **THEN** Change revision、宿主会话文件和当前 session binding 均保持不变

#### Scenario: 旧调用方继续工作

- **WHEN** 现有调用方使用 session-link 或 CLI mem search
- **THEN** 其请求、响应和恢复命令行为不因本能力而变化
