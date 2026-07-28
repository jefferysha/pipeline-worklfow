# Host Target Plan Center 增量规格

## ADDED Requirements

### Requirement: 稳定且零副作用的宿主目标目录

系统 SHALL 以 `host-target-plan/v1` DTO 按 `TENON_HOSTS` 的既有顺序返回全部已注册宿主。每个目标 SHALL 包含稳定的 `id`、`kind`、`cli_flag`、`target_scope`、`supported_operations` 与受限能力 token，且生成目录不得读取项目、宿主安装状态、网络或环境。

#### Scenario: 获取完整目录

- **WHEN** 调用 `tenon host-target-plan --json`
- **THEN** 返回 `schema_version: "host-target-plan/v1"` 和按 `TENON_HOSTS` 顺序排列的目标
- **AND** Codex 与 Claude 标记为 `native`，其余已注册目标标记为 `adapter`
- **AND** 不产生文件、网络、环境或 setup/update 写副作用

#### Scenario: 不接受自定义目标

- **WHEN** 请求一个不在 `TENON_HOSTS` 中的宿主 ID
- **THEN** 命令以非零状态拒绝
- **AND** 不把任意 `.foo`、目录名或 project custom target 解释为宿主

### Requirement: 单目标 setup/update 计划

系统 SHALL 为恰好一个已注册宿主和一个 `setup|update` 操作生成 `HostTargetPlan`。计划 SHALL 包含 `side_effects: "none"`、目标元数据、可复制命令、有序步骤与 notices。native 步骤 SHALL 复用现有 install/update plan 真相；adapter 步骤仅描述稳定的 release adapter 外层流程，不执行或解析脚本。

#### Scenario: native setup 计划

- **WHEN** 调用 `tenon host-target-plan --host codex --operation setup --json`
- **THEN** 返回 Codex 目标、`tenon setup --codex` 命令与有序 native setup 步骤
- **AND** `side_effects` 等于 `none`
- **AND** 不调用真实 setup 路径

#### Scenario: adapter update 计划

- **WHEN** 为已注册 adapter 请求 update 计划
- **THEN** 返回 `tenon update --<host>` 命令和 project-scope adapter 步骤
- **AND** target 使用 `<project>` 语义占位，不接受调用方目录输入

#### Scenario: 非法操作

- **WHEN** operation 缺失或不等于 `setup|update`
- **THEN** 命令以非零状态拒绝且不生成部分计划

### Requirement: 严格只读 Dashboard API

server SHALL 暴露 `GET /api/host-targets` 和 `GET /api/host-target-plan`，通过 `PipelineCliRunner` 的 argv 数组调用稳定 CLI 契约，并严格解析 `host-target-plan/v1` 响应。所有输入 SHALL 在 runner 前完成白名单校验。

#### Scenario: 获取 catalog

- **WHEN** 对 `/api/host-targets` 发起无查询参数的合法 loopback GET
- **THEN** server 使用固定 argv `["host-target-plan", "--json"]`
- **AND** 仅在 CLI JSON 通过严格 DTO 校验后返回 `200`

#### Scenario: 获取单目标计划

- **WHEN** 对 `/api/host-target-plan?host=codex&operation=update` 发起合法 GET
- **THEN** server 使用固定 argv `["host-target-plan", "--host", "codex", "--operation", "update", "--json"]`
- **AND** 返回通过严格 DTO 校验的只读计划

#### Scenario: 查询参数失败关闭

- **WHEN** 查询存在缺失、空值、重复、多余、未知 host 或未知 operation
- **THEN** 返回 `400 HOST_TARGET_QUERY_INVALID`
- **AND** 不调用 `PipelineCliRunner`

#### Scenario: CLI 不可用

- **WHEN** server 未配置可用的 CLI runner
- **THEN** 返回 `503 HOST_TARGET_PLAN_UNAVAILABLE`

#### Scenario: CLI 或 DTO 无效

- **WHEN** CLI 非零退出、输出非 JSON 或 DTO 不满足 v1 契约
- **THEN** 返回 `502 HOST_TARGET_PLAN_INVALID`
- **AND** 不向客户端透传 stderr、路径或内部异常

#### Scenario: Host header 保护

- **WHEN** 请求未通过现有 loopback Host header 守卫
- **THEN** 在进入宿主计划路由前沿用统一拒绝行为

### Requirement: Dashboard 宿主计划中心

Dashboard SHALL 提供无需 project 上下文即可访问的 Host Plan 视图，展示目标卡、native/adapter、scope、能力、setup/update 选择和只读计划预览。所有用户可见文本 SHALL 同时提供中文与英文翻译，且不得提供执行入口。

#### Scenario: 初始加载与选择

- **WHEN** 用户进入 Host Plan 视图
- **THEN** 先显示可感知的 catalog loading 状态
- **AND** catalog 成功后显示可键盘操作的目标卡和具名 operation button group
- **AND** 在目标与操作同时选定前显示 awaiting-selection 空态

#### Scenario: 计划预览

- **WHEN** 用户选择目标和 setup 或 update
- **THEN** 显示 plan loading，随后展示命令、步骤、notice 与 `side_effects: none` 只读提示
- **AND** 只提供复制命令按钮，不提供 setup/update 执行按钮

#### Scenario: 空目录与恢复

- **WHEN** catalog 返回零目标
- **THEN** 显示明确 empty 状态与 retry 操作

#### Scenario: catalog 或 plan 错误

- **WHEN** 请求、HTTP 或 DTO decoder 失败
- **THEN** 显示局部错误与 retry 操作
- **AND** 不保留可能误导的陈旧计划

#### Scenario: 可访问的键盘交互

- **WHEN** 键盘用户依次聚焦目标、operation 与复制按钮并按 Enter 或 Space
- **THEN** 语义 button、可见 focus ring、选中状态和状态公告均可用

#### Scenario: 响应式布局

- **WHEN** 视口从桌面收窄到移动宽度
- **THEN** 目标网格与计划区域变为单列
- **AND** 长命令不会造成页面横向溢出

### Requirement: 向后兼容与许可边界

新增能力 SHALL 是 additive：现有 `setup`、`update`、host flags 与 API 行为保持不变，不增加外部运行时依赖。实现 SHALL 从 Tenon 当前代码与本规格独立推导，不复制 Comet 或受 AGPL-3.0 约束的 Trellis 源码、测试、文案或文件结构。

#### Scenario: 既有命令兼容

- **WHEN** 运行现有 setup/update 测试与 CLI bundle 门禁
- **THEN** 既有显式单宿主行为保持通过

#### Scenario: clean-room 审查

- **WHEN** 审阅本 Change 的实现与依赖
- **THEN** 只出现固定上游 URL/SHA 和独立设计结论
- **AND** 不引入 Comet/Trellis 代码或 AGPL 依赖
