# 设计

## 初始假设

- TraceStore 从 JSONL 尾部最多读取 8 MiB / 最近 200 条合法记录，并返回损坏、截断和计数不一致诊断。
- server 形成严格白名单的 metadata-only DTO；Dashboard 不再接收原始请求/响应正文。
- 保持 TraceStore 追加写、会话 sidecar、代理协议与旧 API 兼容，仅增加只读窗口和 timeline 路由。
- Traffic 面板使用现有视觉 token，提供会话选择、摘要、全部/失败/成功筛选、两层重试与 Escape 清除选择。

## 风险

- 不同供应商响应结构可能导致模型、token 等字段缺失，投影必须容错并明确 unknown/null。
- Trace 数据可能包含敏感内容，新端点不得返回 headers、prompt、response body 或 upstream URL。
- 单条超大 record 可能超过读取预算；此时返回 partial 而不是无界读取或伪装空会话。
- active session 的 JSONL append 与 sidecar rename 存在短暂计数竞态，需要显式 partial + retry。

## 待验证问题

- outcome 只表示 HTTP transport，不代表模型、工具或 Tenon Workflow 成功。
- model/usage 仅从固定 allowlist 读取，缺失不估算、不补零；第一版不承诺 tool call count。
- 详细契约、备选方案、状态机、红队结论见 `docs/superpowers/specs/trace-timeline-design.md` 与 `docs/adr/trace-timeline.md`。
