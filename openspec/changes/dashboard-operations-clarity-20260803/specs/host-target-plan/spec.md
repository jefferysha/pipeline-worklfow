# OpenSpec 增量规格

## ADDED Requirements

### Requirement: Server SHALL 提供零副作用的 native 宿主检测

Server SHALL 暴露 `GET /api/host-target-detection`，返回严格
`host-target-detection/v1`：`detected_hosts`、`recommended_host`、`recommended_operation` 与闭集
`reason`。检测 SHALL 只查看 `hostHome` 下受支持 native host 与 Tenon plugin 的存在性，不读取凭证
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

### Requirement: Dashboard 宿主计划中心 SHALL 解释用途与用户动作

页面 SHALL 清楚说明 Host Plan 是 setup/update 的只读预览；计划生成不会安装或更新，只有用户复制并
在终端运行命令才会产生副作用。推荐宿主/操作 SHALL 与手动候选使用一致的整齐 master-detail 层级。

#### Scenario: 用户首次进入 Host Plan

- **WHEN** 页面开始加载 catalog 与 detection
- **THEN** 标题说明“自动检测并预览，不在页面执行”
- **AND** ready 后突出推荐上下文、为何推荐以及用户是否需要在终端运行命令。
