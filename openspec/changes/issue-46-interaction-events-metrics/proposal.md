# 提案

## Why

Tenon 目前没有一套稳定、隐私安全且可重放的交互事件词汇，因而无法端到端证明 exact-event review 的请求、确认、效果与恢复是否完整，也无法一致计算 #41 定义的治理完成与人工打断指标。GitHub issue #46 是 Wave 0 基础任务，并直接阻塞 #47 的交互 tracer 与 #57 的最终竞争力 scorecard。

## What Changes

- 建立版本化交互事件 envelope 及其 append-only 投影，覆盖一个现有 exact-event review journey。
- 提供隐私安全的本地 JSON scorecard 与可重放 benchmark fixtures，能够发现事件丢失、乱序、stale decision 与同状态重复提示。
- 定义可扩展的场景维度、reason/outcome codes，使后续 AFK、自定义 Workflow/Track、API/SSE 与 Dashboard 能复用同一契约。
- 非目标：不在本 Change 中实现 #47 的修复交互状态机，不新增独立 analytics 真相源，不发布版本或改造 Dashboard UI。

## Capabilities

### New Capabilities

- `interaction-observability`：稳定事件契约、review journey 投影、fixture replay、完整性诊断与本地指标计算。

### Modified Capabilities

无。现有 review 与 canonical state 行为保持兼容，仅增加派生的 append-only 观测投影。

## Impact

影响 kernel 的 interaction domain 与 state projection adapter、CLI 的 review/transition/session 成功切面和 scorecard 入口、测试 fixtures、公开导出、架构门与契约文档。JSON/JSONL 字段会成为后续任务消费的兼容面；持久化在现有 change lock 内原子追加，复用 canonical `RunRevision.stateDigest`、run/step visit 与冻结 workflow fingerprint，且不得记录 raw prompt、secret、credential、host session、绝对路径或 artifact 内容。旧 Change 缺 projection 时保持原行为，不做启动时迁移。
