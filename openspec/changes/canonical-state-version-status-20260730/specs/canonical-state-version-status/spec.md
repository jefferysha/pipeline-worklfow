# Canonical State Version Status 增量规格

## ADDED Requirements

### Requirement: Kernel SHALL 区分明确的未来 canonical 版本与状态损坏

canonical revision decoder SHALL 导出当前支持版本和稳定 typed error。只有 JSON 根值是对象，且
`schemaVersion` 是大于当前支持版本的安全整数时，decoder SHALL 抛出包含 `foundVersion` 与
`supportedVersion` 的版本不兼容错误，并 SHALL 在读取 state、closed-schema、companion 或 digest
之前失败关闭。decoder MUST NOT 将该输入降级为当前 `PipelineState`、legacy YAML 或写入路径。

#### Scenario: 未来版本包含当前版本未知的顶层字段

- **WHEN** canonical JSON 根值为对象、`schemaVersion` 高于当前支持版本，并包含额外顶层字段
- **THEN** decoder 抛出稳定版本不兼容错误
- **AND** 错误报告发现版本与支持版本
- **AND** 不尝试把未来字段按当前 closed-schema、state 或 digest 读取

#### Scenario: 版本字段不能证明是未来版本

- **WHEN** canonical JSON 损坏，或 `schemaVersion` 缺失、为字符串、分数、不安全整数、低于或等于当前版本但其余内容非法
- **THEN** decoder 保持 `RunStateCorruptError`
- **AND** 不建议用户升级能够修复该状态

### Requirement: Snapshot SHALL 投影最小且无路径泄露的兼容问题

server SHALL 只捕获 kernel 的版本不兼容 typed error，并在 `ProjectSnapshot` 的 optional
`compatibilityIssues` 中投影稳定 `unsupported-canonical-version` issue。每项 SHALL 只包含非空
Change 名、安全整数的发现/支持版本和 `upgrade-runtime` action；MUST NOT 包含 canonical source
path、异常 message、原始 JSON 或未来 state 字段。issues SHALL 按 Change 名稳定排序，且每个 Change
至多一项。

#### Scenario: 项目同时包含可读与未来版本 Change

- **WHEN** server 扫描到一个可读 Change 和一个明确未来版本 Change
- **THEN** 项目 `ok` 为 false
- **AND** 可读 Change 继续出现在 `changes` 与 `change_count`
- **AND** 未来版本 Change 只出现在 `compatibilityIssues`
- **AND** snapshot 不包含该 Change 的 canonical source path 或原始异常 message

#### Scenario: 普通损坏与版本问题分流

- **WHEN** 一个 Change 抛出 `RunStateCorruptError`，另一个抛出版本不兼容 typed error
- **THEN** 普通损坏继续进入现有项目 `error`
- **AND** 版本问题只进入结构化 `compatibilityIssues`
- **AND** server 不通过解析错误字符串决定 issue kind

#### Scenario: 滚动升级响应

- **WHEN** 旧 server 省略 `compatibilityIssues`
- **THEN** 新 Dashboard 将其视为空数组
- **AND** `tenon-snapshot/v2` 协议保持不变

### Requirement: Dashboard SHALL 在 Progress 提供双语升级后恢复路径

Dashboard 边界 decoder SHALL 严格验证 optional `compatibilityIssues` 的字段闭集、枚举、非空 Change
名和安全整数。当前项目存在 issue 时，Progress SHALL 以可访问 alert 展示受影响 Change、发现版本、
支持版本和中英文升级说明，并 SHALL 提供调用现有 snapshot refresh 的“升级后刷新”动作。Dashboard
MUST NOT 自动执行更新或创建第二套请求通道。

#### Scenario: 兼容问题优先于 no-change 教学空态

- **WHEN** 当前项目没有可读 Change 但含一个 compatibility issue
- **THEN** App 渲染 Progress 的升级要求而不是 no-change Onboarding
- **AND** 用户能看到 Change 名、发现版本、支持版本和 `tenon update --codex` 指引

#### Scenario: 用户升级后刷新

- **WHEN** 用户仅用键盘聚焦并触发“升级后刷新”
- **THEN** Dashboard 调用现有 refresh
- **AND** 请求进行时按钮禁用并显示当前语言的加载状态
- **AND** 新 snapshot 不再包含 issue 时页面恢复正常 Progress 或真实 no-change 空态

#### Scenario: 空、错误与畸形响应

- **WHEN** issue 字段缺失或为空
- **THEN** 兼容 notice 不渲染且现有空态保持不变
- **WHEN** snapshot/网络失败
- **THEN** 现有错误和重试路径保持可用
- **WHEN** issue 含未知 kind/action、额外字段、空 Change 名或非法版本
- **THEN** Dashboard 拒绝整个不可信 snapshot，且不展示半可信升级建议

### Requirement: Compatibility status SHALL 通过真实边界与浏览器验证

实现 SHALL 具有 kernel、server、Dashboard decoder、component 与 App shell 测试，并 SHALL 通过
受影响的 typecheck、web test/build、repo build/test。真实浏览器验收 SHALL 核对 `Tenon Dashboard`
标题、目标 worktree root 与目标 Change，并在 1024–1920px 电脑端覆盖升级要求、加载/刷新、空/错误
和键盘路径。

#### Scenario: 真实 Dashboard 验收

- **WHEN** 从本 Change 的独立 worktree 启动生产 Dashboard
- **THEN** 1440×900 与 1024×768 均展示可扫描的升级状态且无横向溢出
- **AND** Tab/Shift+Tab/Enter 可完成刷新路径
- **AND** 目标身份、中文和英文状态均被记录
