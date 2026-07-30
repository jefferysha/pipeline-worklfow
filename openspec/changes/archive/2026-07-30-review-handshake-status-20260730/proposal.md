# 提案

## Why

Tenon 已能计算 transition guard 是否齐全，但 Dashboard 没有把 canonical exact-event review
receipt 的真实状态作为结构化信息展示。用户看到“等待确认”时，无法判断请求是否已经建立、绑定哪个
event，或只是仍在等待 agent 产出，容易误把风险信号当成硬门禁。

## What Changes

- 新增只读的 Review Handshake 快照契约，投影未请求、待确认、已批准三态及 exact event。
- 在 Dashboard 当前 Change 交互区域显示状态、下一步与可访问的状态说明。
- 覆盖加载、错误、无 review gate、待确认和已批准状态，并提供中英文文案。
- 非目标：不改变 review gate、acknowledge、transition、安全校验或 canonical state 写入语义。

## Capabilities

### New Capabilities

- `review-handshake-status`：让用户从 Dashboard 区分 guard readiness 与真实 review receipt。

### Modified Capabilities

- 无。

## Impact

Explore 已确认最小改动面：server 在现有 Change snapshot 投影三态判别联合；Dashboard 在滚动
兼容期可选解码，并在 Progress Drawer 当前阶段区显示只读状态卡。HTTP 与 SSE 复用同一 snapshot，
不新增依赖、端点或状态写入，不暴露 host session、token、authority 或本机敏感路径。

现有 transition readiness 与新的 receipt handshake 保持为两条状态轴；Dashboard direct
transition 的 host-bound 人工批准语义不变。
