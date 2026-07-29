# ADR：以有界 metadata-only 投影提供 Trace Timeline

## 状态

Accepted for Spec。

## 背景

Tenon 的 TraceStore 保存原始本地请求/响应，server 目前通过 `/api/traces/records` 把 `unknown[]`
原样交给 Dashboard。继续在浏览器端解析会扩大 prompt/body 的暴露面，也无法稳定表达截断、损坏行、
provider usage 缺失或 HTTP failure。

外部证据显示：

- claude-tap #398/#397/#376 证明压缩、flush、截断流和前序响应都会改变“单条记录是否完整”；
- maestro-flow #14/#17 证明失败未持久化和静默跳过会产生虚假健康；
- Trellis #477 与 Comet #228/#240 支持“有界、canonical 投影 + 显式 incomplete/failure”。

## 决策

1. 在 TraceStore 增加只读尾部窗口，最多返回最近 200 条合法记录，并把输入读取限制为 8 MiB。
2. 在 server 新增 `GET /api/traces/timeline?session=<id>`，把窗口映射成严格白名单 DTO。
3. 响应固定声明 `content: metadata-only`、`outbound: local-only`，并显式返回
   `truncated`、`integrity`、`warnings` 和 `skipped_count`。
4. Dashboard 的 TrafficPanel 改用 timeline API，保留旧 raw records API 兼容但不再默认消费。
5. outcome 仅表示 HTTP transport；usage 只采用 provider 实际数值，未知为 null。
6. Trace Timeline 始终是非权威诊断投影，不参与 Tenon phase、review、ledger 或 verify gate。

## 备选方案

- **浏览器聚合 raw records**：拒绝，因为原始 body 已越过 UI API 边界，provider 解析和限界也无法集中测试。
- **写入标准 span 并迁移存储**：本轮拒绝，因为会改变 capture/persistence，旧记录和迁移风险超过最小切片。
- **外接 OpenTelemetry/观测后端**：拒绝，因为新增依赖、配置与外发边界，不符合本地优先。
- **只在 server 最终 `.slice(200)`**：拒绝，因为输入读取仍无界，不能诚实声称有界时间线。

## 后果

正向：

- 用户无需打开 prompt/body 即可定位最近错误、慢请求和实际 usage。
- Store 输入、HTTP 响应和 DOM 行数都有硬边界。
- partial/truncated/unknown 变成可测试契约，不再通过空数组或零值静默掩盖。
- 旧 JSONL、session sidecar 和 raw API 不变，回滚可通过移除新路由/UI 实现。

代价：

- 新 projector 是 best-effort provider adapter；未识别字段必须保持 null。
- active session 可能短暂出现 `count-mismatch`/partial，用户需 retry 获取新快照。
- 8 MiB 内若最后一条记录本身过大，时间线可能返回 partial 空窗口；这比无界读取或假装完整更安全。
- 未来若需要实时 tail、工具调用完整性或跨会话搜索，应分别立项，不能扩张本 ADR。
