# Host Target Plan Center 规格

## Purpose

为 Tenon 已注册宿主提供稳定、零副作用的 setup/update 计划契约，并通过严格只读 API 与
Dashboard 预览安全呈现目标、命令、步骤和状态。
## Requirements
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

系统 SHALL 为恰好一个已注册宿主和一个 `setup|update` 操作生成 `HostTargetPlan`。计划 SHALL 包含 `side_effects: "none"`、目标元数据、可复制命令、有序步骤与 notices。native 与 adapter 步骤 SHALL 分别与当前真实 setup/update 命令编排一致；adapter 仅描述稳定的 release adapter 外层流程，不执行或解析脚本。

#### Scenario: native setup 计划

- **WHEN** 调用 `tenon host-target-plan --host codex --operation setup --json`
- **THEN** 返回 Codex 目标、`tenon setup --codex` 命令与有序 native setup 步骤
- **AND** `side_effects` 等于 `none`
- **AND** 不调用真实 setup 路径

#### Scenario: native update 计划

- **WHEN** 为 Codex 或 Claude 请求 update 计划
- **THEN** 返回现有 `nativeUpdatePlan` 命令步骤并追加 `managed-runtime`
- **AND** 不包含仅由完整 setup 调用的 `bundled-skills` 或 `runtime-readiness`

#### Scenario: Codex 认证状态与引导

- **WHEN** 为 Codex 请求 setup 或手工 update 计划
- **THEN** 在 `managed-runtime` 后返回 `codex-auth-status` 步骤，命令为 `codex login status`
- **AND** setup 的 `bundled-skills` 与 `runtime-readiness` 位于该步骤之后
- **AND** 返回稳定的认证引导 notice，但计划生成不读取真实登录状态
- **AND** Claude 和 adapter 计划不包含 Codex 认证步骤或 notice

#### Scenario: adapter update 计划

- **WHEN** 为已注册 adapter 请求 update 计划
- **THEN** 返回 `tenon update --<host>` 命令和按 `package-assets`、`managed-runtime`、`adapter-deploy` 排列的 project-scope adapter 步骤
- **AND** 不包含仅由完整 setup 后续执行的 `bundled-skills` 或 `runtime-readiness`
- **AND** target 使用 `<project>` 语义占位，不接受调用方目录输入

#### Scenario: adapter setup 计划

- **WHEN** 为已注册 adapter 请求 setup 计划
- **THEN** 返回按 `package-assets`、`managed-runtime`、`adapter-deploy`、`bundled-skills`、`runtime-readiness` 排列的五个步骤
- **AND** 步骤顺序与真实 `cmdSetup` 在 adapter 部署后的 skills/readiness 编排一致

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

#### Scenario: CLI stdout 或 DTO 无效

- **WHEN** CLI 非零退出、trim 后的 stdout 不是恰好一个完整 JSON 文档，或 DTO 不满足 v1 契约
- **THEN** 返回 `502 HOST_TARGET_PLAN_INVALID`
- **AND** 不向客户端透传 stderr、路径或内部异常

#### Scenario: Host header 保护

- **WHEN** 请求未通过现有 loopback Host header 守卫
- **THEN** 在进入宿主计划路由前沿用统一拒绝行为

### Requirement: Dashboard 宿主计划中心

Dashboard SHALL 提供无需 project 上下文即可访问的 Host Plan 视图，展示目标卡、native/adapter、scope、能力、setup/update 选择和只读计划预览。所有用户可见文本 SHALL 同时提供中文与英文翻译，且不得提供执行入口。页面 SHALL 清楚说明 Host Plan 是 setup/update 的只读预览；计划生成不会安装或更新，只有用户复制并在终端运行命令才会产生副作用。推荐宿主/操作 SHALL 与手动候选使用一致的整齐 master-detail 层级。

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

#### Scenario: 用户首次进入 Host Plan

- **WHEN** 页面开始加载 catalog 与 detection
- **THEN** 标题说明“自动检测并预览，不在页面执行”
- **AND** ready 后突出推荐上下文、为何推荐以及用户是否需要在终端运行命令。

### Requirement: 电脑端高密度宿主选择与已选详情

Dashboard SHALL 在 1024–1920px 电脑端以稳定的 master-detail 布局呈现宿主目录和当前选择。目录 SHALL 为每个宿主持续展示名称、CLI flag、kind、scope 和可键盘操作的选择动作；完整 capabilities SHALL 在目标被选中后、选择 setup/update 前显示于详情区。系统 SHALL 保持 catalog 原始顺序、只读计划语义和既有 API 契约。

#### Scenario: 扫描宿主目录

- **WHEN** catalog 在 1024×768、1200×870、1440×900 或 1920×1080 电脑端视口成功加载
- **THEN** 页面无横向溢出，目录和详情不得重叠
- **AND** 每个目录项持续展示宿主名称、CLI flag、kind 与 scope
- **AND** 1024×768 视口在无需滚动目录时至少完整展示前 6 个宿主，显著高于变更前的 4 个

#### Scenario: 核对已选宿主上下文

- **WHEN** 用户以鼠标或键盘选择一个宿主
- **THEN** 目录项以 `aria-pressed`、可见 accent 边界和本地化已选文案表达当前选择
- **AND** 详情在 operation button group 之前展示该宿主的 CLI flag、kind、scope 与全部 capability
- **AND** 选择宿主本身不得请求计划、写文件或执行 setup/update

#### Scenario: 从宿主上下文进入计划

- **WHEN** 用户选择 Setup 或 Update
- **THEN** 详情按“宿主上下文 → 操作 → loading/error/ready → 只读计划”顺序呈现
- **AND** 切换宿主 SHALL 取消活动请求、清除旧 operation 与旧 plan，并显示新宿主的 awaiting-operation 状态
- **AND** light、dark、system 与 `prefers-reduced-motion` 下均不得依赖颜色或动画单独表达状态

#### Scenario: 保留失败与恢复路径

- **WHEN** catalog 或 plan 请求失败、catalog 为空、或复制命令失败
- **THEN** 既有本地化 error/empty/retry/copy feedback SHALL 保持可感知并可由键盘恢复
- **AND** 页面不得显示或调用真实执行入口

### Requirement: 向后兼容与许可边界

新增能力 SHALL 是 additive：现有 `setup`、`update`、host flags 与 API 行为保持不变，不增加外部运行时依赖。实现 SHALL 从 Tenon 当前代码与本规格独立推导，不复制 Comet 或受 AGPL-3.0 约束的 Trellis 源码、测试、文案或文件结构。

#### Scenario: 既有命令兼容

- **WHEN** 运行现有 setup/update 测试与 CLI bundle 门禁
- **THEN** 既有显式单宿主行为保持通过

#### Scenario: clean-room 审查

- **WHEN** 审阅本 Change 的实现与依赖
- **THEN** 只出现固定上游 URL/SHA 和独立设计结论
- **AND** 不引入 Comet/Trellis 代码或 AGPL 依赖

### Requirement: Server SHALL 提供零副作用的 native 宿主检测

Server SHALL 暴露 `GET /api/host-target-detection`，返回严格
`host-target-detection/v1`：`detected_hosts`、`recommended_host`、`recommended_operation` 与闭集
`reason`。检测 SHALL 只在 `hostHome` 下受限读取 native host 的活动插件清单/配置，并与 Tenon plugin 的非 symlink 缓存标记交叉验证；不得读取凭证
内容、不运行命令、不访问网络、不返回路径。已安装 Tenon 推荐 `update`；仅检测到宿主推荐 `setup`；
无检测返回 null 推荐。adapter 不得在缺少 project context 时伪装为自动检测。

#### Scenario: 本机已安装 Codex Tenon plugin

- **WHEN** Codex host 与 Tenon plugin 存在
- **THEN** detection 返回 `recommended_host: codex`、`recommended_operation: update`
- **AND** reason 为 `tenon-plugin-detected` 且响应不含本机路径或凭证。

#### Scenario: 只有 Claude host

- **WHEN** Claude host 存在但 Tenon plugin 未安装
- **THEN** detection 返回 `recommended_host: claude`、`recommended_operation: setup`
- **AND** reason 为 `host-detected`。

#### Scenario: 没有可检测 native host

- **WHEN** Codex/Claude host 与 Tenon plugin 均未检测到
- **THEN** detection 返回空 detected_hosts 与 null 推荐
- **AND** 不把任意 adapter 或当前 cwd 当作宿主。

### Requirement: Dashboard SHALL 自动加载推荐的只读宿主计划

Host Plan SHALL 并行加载 catalog 与 detection。推荐 host/operation 在 catalog 中有效时 SHALL 自动
选中并请求对应 `side_effects:none` 计划；用户仍可切换宿主或操作。自动行为只发 GET，不得执行
setup/update。detection endpoint 不可用或失败 SHALL 降级为明确的手动选择，不得阻断 catalog。

#### Scenario: 自动打开 Codex update 计划

- **WHEN** catalog 与 detection 成功且推荐 Codex update
- **THEN** 页面直接显示 Codex 已检测、Update 已选与只读命令/步骤
- **AND** 未执行命令、未写文件且用户可以改选 Claude 或 Setup。

#### Scenario: 旧 Server 没有 detection endpoint

- **WHEN** catalog 成功而 detection 返回 404 或无效响应
- **THEN** 页面显示无法自动检测并保留全部手动选择能力
- **AND** 不把第一项固定当成检测结果。

#### Scenario: 自动计划请求后切换宿主

- **WHEN** 推荐计划仍在途且用户切换到其他宿主
- **THEN** 旧请求被取消或 generation 失效
- **AND** 迟到结果不能覆盖新宿主上下文。
