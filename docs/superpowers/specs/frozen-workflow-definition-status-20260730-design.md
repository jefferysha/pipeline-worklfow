# Orchestration Graph 技术设计

## 用户结果与边界

用户在 Change 详情中直接理解 frozen workflow、当前 Change、阶段/转换、任务、受治理文档、
复核结果和活跃会话，并可过滤、搜索、选择节点查看详情。图是只读解释面：

- 不修改 canonical state、workflow、tasks、document ledger 或 review receipt；
- current workflow definition 只产生节点诊断，frozen plan 继续控制在途执行；
- 不返回文档绝对路径、workflow 正文、原始解析错误、凭证；
- 不假装未接入的 Agent、历史 Session/Turn、AcceptanceCriterion 或 task dependency 已存在。

## API 与数据模型

`GET /api/orchestration-graph?root=<root>&change=<name>` 返回：

```text
schema: tenon-orchestration-graph/v1
scope: { root, change }
coverage: { implemented[], deferred[] }
nodes: { id, kind, label, status, metadata[] }[]
edges: { id, kind, source, target, label }[]
```

节点种类闭集：`workflow | change | phase | task | document | review | session`。
边种类闭集：`governs | contains | transitions | produces | reviews | executes`。
metadata 是有序 `{key,value}` 字符串对；客户端仍逐字段、闭集、唯一 id 和边端点严格校验。

## 投影规则

1. workflow/change 节点恒存在；workflow node metadata 包含 execution model、frozen fingerprint、
   definition status/current fingerprint。
2. frozen `workflowRules.steps` 产生 phase nodes；transition entries 产生有向 transition edges。
3. `todo.stages[].tasks` 产生 task nodes和 phase contains task edges。
4. `documents.items` 只暴露 kind/status/producer count；依据 `outputsByStep` 连接 producing phase，
   不返回 paths。
5. `pre_verify_review_result`、`agent_review_result`、`codex_review_result` 非空时产生 review nodes，
   指向 verify phase。
6. fresh `terminalActivity` 产生 session node与 executes change 边；API 只暴露截断 id 和 lease 状态。
7. 节点与边最终按 id 排序；重复 id/悬空边在投影层视为实现错误，客户端再 fail closed。

## Dashboard 交互

- 请求状态：`loading → ready | unavailable(404) | error`，Retry 回 loading；scope change abort +
  generation 防迟到覆盖。
- visual graph 按 kind 分四层确定性布局并绘制有向连接，不使用 force/random。
- 类型 filter 与标题 search 共同决定 visible nodes；只保留两端均可见的 edges。
- 每个 node 是真实 button；ArrowLeft/Right、Home/End 移动焦点，Enter/Space 原生选择，Escape 清除。
- selection panel 显示 status/metadata 与相邻边；原生 `<details>` 内的节点/边列表提供等价阅读路径。
- `nodes=[]` 是真实空态；搜索/过滤后 `visible=[]` 是过滤空态；两者文案不同。
- coverage deferred 始终可读，说明后续能力而非宣称“全已实现”。

## Assumptions / Decision Log

- 选择独立 graph endpoint 而不是扩展 snapshot v2，避免破坏公共契约，并让图拥有独立失败恢复。
- 本轮复用 snapshot read model，不新建第二套 canonical parser。
- 不加入 graph SSE：现有 snapshot 轮询与 current workflow 文件的事件源不同；在专属 fingerprint
  设计前用显式 Retry，避免伪实时。
- 不使用 canvas-only 交互；Chorus canvas 的视觉能力保留，但 Tenon 同步提供原生语义列表。
- 不把“全部借鉴”解释为一个 PR 虚构所有实体；完整能力映射固化，foundation 只展示已有权威数据。

## 状态与错误

```text
mount/scope change -> loading
loading -> ready(non-empty | true-empty)
loading -> unavailable(404)
loading -> error(network | non-404 | malformed)
error --retry-> loading
ready --search/filter no match-> filtered-empty
ready --clear-> visible graph
```

## 安全、性能与兼容

- registered-root + change-name 双锚定；复用 snapshot StateStore 和安全 workflow reader。
- server 不返回 paths/stack/raw parse error；无写路由、无新依赖、无 schema/migration。
- 图大小与单 Change 的 frozen steps/tasks/doc evidence 有界；容器横向/纵向滚动。
- 旧 Server 404 中性 unavailable；未知 v1 字段/枚举/悬空边严格失败。
- 回滚只需删除 endpoint/client/component 与挂载；已有状态无需修复。

```coverage
touches:
L1_api:      filled -> #API-与数据模型
L2_data:     waive -> no persistence, schema, or migration change
L3_rules:    filled -> #投影规则
L4_state:    filled -> #状态与错误
L5_errors:   filled -> #状态与错误
L6_security: filled -> #安全-性能与兼容
L7_perf:     filled -> #安全-性能与兼容
L8_deps:     waive -> no dependency change
L10_terms:   filled -> #用户结果与边界
```

## 固定来源

完整 Chorus 源码证据与分阶段映射见
`docs/superpowers/specs/2026-07-30-chorus-orchestration-graph-research.md`。其他固定来源为 Trellis
`c94d6fc…` / tag fallback `v0.6.10`、Comet `92d418e…` / `0.3.9`、Maestro
`5375fb5…` / `v0.5.58`、claude-tap `6cfe45a…` / `v0.1.141`。
