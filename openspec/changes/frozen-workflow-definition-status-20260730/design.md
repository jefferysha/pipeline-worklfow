# 设计

## 已验证设计

- Server 以现有 `ChangeSnapshot` 为唯一图源，纯函数投影稳定 node/edge id；路由只接受已注册 root
  和合法 Change，并复用现有 snapshot 构建与 workflow definition 安全比较。
- `tenon-orchestration-graph/v1` 是独立只读协议。节点闭集为
  `workflow | change | phase | task | document | review | session`，边闭集为
  `governs | contains | transitions | produces | reviews | executes`。
- workflow node 携带 frozen/current definition status；current definition 只用于诊断，frozen
  plan 仍是阶段、边、任务和 readiness 的执行真相。
- Dashboard 使用确定性分层布局，不使用随机 force simulation；搜索与类型过滤只改变可见集，
  不改变服务端图。节点选择显示元数据；边详情和语义列表提供图形之外的等价阅读路径。
- 协议显式声明 `implemented` 与 `deferred` 能力。`agent`、历史 session/turn、acceptance criteria、
  可写编排和实时 graph SSE 在本轮为 deferred，前端不得暗示已加载。

## 风险

- 图投影从不同时间读取 snapshot 和 current workflow，可能出现瞬时诊断差异；只把 definition
  status 标为诊断，不把它用于边或 readiness。
- 文档路径、错误原文或 session 标识可能泄露宿主信息；节点只保留文档 kind/status/producer，
  session id 只做截断展示，API 不返回文档绝对路径。
- 大量 task/document 节点可能挤压详情面板；本轮使用有界滚动、过滤与搜索，后续再做虚拟化。

## 待验证问题

- 浏览器验收必须覆盖真实 production Dashboard 身份、成功/加载/错误/真实空/过滤空、双语、
  1024/1440/1920 和完整键盘路径。
- Verify 必须证明图端点无写操作、非法 root/change fail closed、严格 decoder 拒绝未知节点/边/
  悬空边，definition drift 不改变 readiness。

## Explore 结论

- Chorus 资源图的“有类型节点 + 有类型边 + 确定性布局 + 搜索/过滤/选中/详情”可直接映射为
  Tenon-native read model；其公司/项目双重隔离对应 Tenon registered-root/change 双重锚定。
- Chorus Idea lineage、Proposal materialization/review、Task dependency、AgentInstance、
  AgentSession/DaemonSession/Turn 属于不同生命周期。Tenon 本轮只投影已有权威事实，完整映射作为
  后续阶段契约，绝不创造假的 Agent 或历史 Session。
- 当前 `ChangeSnapshot` 已包含 immutable workflow rules、todo stages、document evidence、
  review result fields 与 fresh terminal activity，足以形成真实完整的基础纵向切片。
