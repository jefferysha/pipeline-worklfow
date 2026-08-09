# ADR：以独立 append-only interaction projection 承载 #46 指标

## 背景

GitHub issue #46 要求为现有 exact-event review journey 建立版本化事件 envelope、隐私安全 scorecard 与可重放 fixtures，同时明确事件日志不能成为第二套 workflow truth。仓库已有 canonical `RunRevision` / `TransitionRecord`、legacy history 与正交 channel bus，但没有一个同时满足 request、acknowledgement、effect、resume、严格 schema 与指标重放的边界。

## 决策

新增 kernel-owned interaction observability domain 与每 Change 的 `.pipeline-interactions.jsonl` append-only projection：

- canonical state hashes、workflow fingerprint、run/step visit 全部引用现有 immutable state facts。
- request、ack、transition effect 与 session resume 在各自 canonical 成功切面、同一 change lock 内投影 typed event。
- replay/scorecard 只消费严格验证的 v1 event/fixture contract，绝不驱动 transition 或批准决策。
- schema 不提供 raw/free-form payload；后续扩展使用稳定维度与受限 namespaced codes。

## 备选方案

1. 扩展 `.pipeline-history.jsonl`：拒绝。其 `raw` 兼容面允许自由文本与敏感 session 信息，且旧行没有严格版本与完整顺序。
2. 复用 `packages/channel`：拒绝。channel 是 worker 协作 bounded context，重新接入 pipeline 会制造错误依赖方向。
3. 扩展 `TransitionRecord`：拒绝。request、ack 和 resume 不是 transition，会把派生观测升级为 canonical 状态模型。

## 后果

正面后果：

- #47/#54/#57 可复用同一个 envelope、matrix 和 scorecard，不需要各自发明 analytics truth。
- projection 可删除、可验证、未来可从 canonical facts 重建；损坏不会削弱 review/transition guards。
- 隐私边界可由字段闭集和 codec 测试证明，而不是依赖调用方“不要写敏感内容”的约定。

成本与风险：

- canonical commit 与 projection append 不是跨文件原子事务；必须把失败明确返回为 warning，并由 hash/order/completeness diagnostics 暴露。
- 新 JSON/JSONL 字段是公共兼容面，需要 contract、fixtures、bundle 和后续消费者做兼容评审。
- session resume 本身不修改 canonical state，必须以 exact Change binding 和当前 state hash 证明 valid resume，而不能伪造 transition。

## 兼容与恢复

旧 Change 没有 interaction file 时保持原行为；读端把“缺 projection”与“空但合法”分开报告。不得在启动时迁移或回写旧 history。损坏文件 fail-loud，不自动截断；未来 rebuild 命令若需要实现，必须显式、可审计，并从 canonical revisions 生成。
