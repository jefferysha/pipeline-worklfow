# OpenSpec 增量规格

## ADDED Requirements

### Requirement: Server 必须投影受限且确定性的编排图

Server MUST 为已注册项目中的合法 Change 提供
`GET /api/orchestration-graph?root=<root>&change=<name>`。成功响应 MUST 使用
`tenon-orchestration-graph/v1`，包含 scope、coverage、nodes 和 edges；相同输入 MUST 产生稳定
排序和稳定 id。端点 MUST 只安全读取目标 Change，MUST NOT 通过全局 snapshot 扫描触发其他
Change 读取或 projection repair。

#### Scenario: 投影真实 Tenon 编排事实

- **WHEN** Change snapshot 包含 frozen workflow、todo、document evidence、review 字段或 fresh
  terminal activity
- **THEN** 图只投影这些可验证事实为 workflow/change/phase/task/document/review/session 节点
- **AND** 使用 `governs | contains | transitions | produces | reviews | executes` 闭集边连接它们
- **AND** 悬空边、未知类型和伪造 agent 节点不得出现

#### Scenario: 合法 workflow 的重复目标 transition

- **WHEN** 同一 source phase 的两个不同 event 指向同一 target phase
- **THEN** 两条 transition edge 都存在且各自具有稳定唯一 id
- **AND** strict Dashboard client 能完整解码图

#### Scenario: 合法 phase label 为空

- **WHEN** kernel 接受的 custom workflow phase label 是空字符串
- **THEN** Server 使用稳定 phase id 作为非空显示 fallback
- **AND** strict Dashboard client 能完整解码图

#### Scenario: 有效 Change 没有可选子资源

- **WHEN** Change 有 workflow/change/phase，但没有 task、document、review 或 active session
- **THEN** Server 返回 HTTP 200 的最小非空编排图
- **AND** 缺失的可选域由 coverage/deferred 解释，不伪装为请求错误

#### Scenario: root、Change 或 canonical state 无效

- **WHEN** root 缺失/未注册、change 名非法、Change 不存在或 canonical state 不可读
- **THEN** Server 使用稳定闭集 error code 的 4xx/5xx 错误并且不返回部分图
- **AND** 缺失 root 不得隐式解析为 server cwd
- **AND** endpoint unavailable 与 scope/corruption 错误可由 Dashboard 区分

### Requirement: Workflow 定义漂移必须只是图节点诊断

workflow 节点 MUST 携带 `current | changed | missing | invalid | unavailable` 闭集诊断和可用
fingerprint。current workflow MUST 通过 registered-root anchor、既有安全 reader 和 canonical
compiler 读取；不得把 current plan 传给 transition、readiness、document、Skill 或 review。

#### Scenario: 当前定义变化或损坏

- **WHEN** current fingerprint 与 frozen fingerprint 不同、缺失或无效
- **THEN** workflow node 投影相应诊断
- **AND** 图中的 frozen phase/transition、canonical Change 和 readiness 不改变
- **AND** 响应不含 workflow 正文、绝对路径、原始错误、stack 或凭证

### Requirement: Dashboard 必须严格解码并独立管理图请求

Dashboard MUST 严格验证 schema、节点/边/status 闭集、id 唯一性、edge endpoint 存在性和 coverage。
root/change 变化 MUST 取消旧请求并忽略迟到结果。

#### Scenario: loading、成功与旧 Server

- **WHEN** 用户打开 Change 详情
- **THEN** 图先显示本地化 loading，再显示真实服务端图
- **AND** 仅旧 Server 的 endpoint unavailable code/响应显示中性 unavailable，不伪装成空图
- **AND** 已识别 endpoint 返回的 scope/corruption 404 显示可恢复 error

#### Scenario: 网络、HTTP 或畸形响应失败

- **WHEN** 请求网络失败、非 404 失败，或 200 body 不符合严格图契约
- **THEN** 图显示本地化 error 与 Retry
- **AND** Retry 只提交当前 root/change

#### Scenario: scope 变化时旧响应迟到

- **WHEN** 用户从 Change A 切换到 Change B 且 A 响应迟到
- **THEN** 组件保持 B 的状态

### Requirement: 图必须支持桌面交互和等价的可访问阅读路径

Dashboard MUST 提供节点类型过滤、标题搜索、节点选择、节点详情、边详情以及同步的语义节点/边
列表。图交互 MUST 支持键盘且不依赖颜色、hover 或指针。

#### Scenario: 搜索与过滤

- **WHEN** 用户输入标题搜索或切换一个或多个类型过滤
- **THEN** 只显示匹配节点及端点均可见的边，并报告可见数量
- **AND** 无匹配时显示“过滤结果为空”，不与服务端真实空态混淆

#### Scenario: 键盘浏览与选择

- **WHEN** 焦点位于图节点并使用 ArrowLeft/ArrowRight/Home/End
- **THEN** 焦点按当前可见确定性顺序移动
- **WHEN** 用户按 Enter 选择节点或按 Escape 清除选择
- **THEN** 同步详情面板更新并保持可见焦点
- **AND** focus、selected 与 pressed filter 均有足够对比和非颜色状态提示

#### Scenario: 图形不可用或难以理解

- **WHEN** 用户展开可访问替代列表
- **THEN** 原生语义列表逐项显示相同节点和边关系，包括边类型、label/event 和可读端点标题
- **AND** 选中详情分别显示 incoming/outgoing 相邻边
- **AND** 键盘与屏幕阅读器无需操作画布即可获取等价信息

### Requirement: 中英文状态必须诚实表达实现覆盖

Dashboard MUST 为 heading、loading、error/retry、真实空、过滤空、unavailable、filters、search、
selection、node/edge kinds、phase/review label、status、metadata key 和 deferred coverage 提供
中英文文案；不得把 canonical snake_case/token 或另一语言的 phase label直接暴露给用户。

#### Scenario: 查看部分覆盖

- **WHEN** graph v1 声明 agent、历史 session/turn、acceptance criteria、写编排或实时刷新 deferred
- **THEN** UI 明确这些是后续能力
- **AND** 不显示假的数据、写按钮或“全部已完成”声明

### Requirement: 读取开销与兼容回滚必须有界

图端点 MUST 不新增运行时依赖、数据库/schema、canonical 写入或 Dashboard 写 API。移除端点、
client 和图组件 MUST 无需迁移或数据修复。

#### Scenario: 功能回滚

- **WHEN** revert 本 Change
- **THEN** 既有 snapshot、canonical state、workflow files、transition 和 review 行为保持可用
