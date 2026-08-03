# OpenSpec 增量规格

## ADDED Requirements

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

## MODIFIED Requirements

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
