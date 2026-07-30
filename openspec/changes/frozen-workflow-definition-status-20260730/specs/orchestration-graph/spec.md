# OpenSpec 增量规格

## ADDED Requirements

### Requirement: Server 必须投影受限且确定性的编排图

Server MUST 为已注册项目中的合法 Change 提供
`GET /api/orchestration-graph?root=<root>&change=<name>`。成功响应 MUST 使用
`tenon-orchestration-graph/v1`，包含 scope、coverage、nodes 和 edges；相同输入 MUST 产生稳定
排序和稳定 id。

#### Scenario: 投影真实 Tenon 编排事实

- **WHEN** Change snapshot 包含 frozen workflow、todo、document evidence、review 字段或 fresh
  terminal activity
- **THEN** 图只投影这些可验证事实为 workflow/change/phase/task/document/review/session 节点
- **AND** 使用 `governs | contains | transitions | produces | reviews | executes` 闭集边连接它们
- **AND** 悬空边、未知类型和伪造 agent 节点不得出现

#### Scenario: 有效 Change 没有可选子资源

- **WHEN** Change 有 workflow/change/phase，但没有 task、document、review 或 active session
- **THEN** Server 返回 HTTP 200 的最小非空编排图
- **AND** 缺失的可选域由 coverage/deferred 解释，不伪装为请求错误

#### Scenario: root 或 Change 无效

- **WHEN** root 未注册、change 名非法、Change 不存在或 snapshot 不可读
- **THEN** Server 使用现有 4xx/5xx 错误语义并且不返回部分图

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

Dashboard MUST 严格验证 schema、节点/边闭集、id 唯一性、edge endpoint 存在性和 coverage。
root/change 变化 MUST 取消旧请求并忽略迟到结果。

#### Scenario: loading、成功与旧 Server

- **WHEN** 用户打开 Change 详情
- **THEN** 图先显示本地化 loading，再显示真实服务端图
- **AND** endpoint 404 显示中性 unavailable，不伪装成空图或故障

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

#### Scenario: 图形不可用或难以理解

- **WHEN** 用户展开可访问替代列表
- **THEN** 原生语义列表逐项显示相同节点和边关系
- **AND** 键盘与屏幕阅读器无需操作画布即可获取等价信息

### Requirement: 中英文状态必须诚实表达实现覆盖

Dashboard MUST 为 heading、loading、error/retry、真实空、过滤空、unavailable、filters、search、
selection、node/edge kinds、definition status 和 deferred coverage 提供中英文文案。

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
