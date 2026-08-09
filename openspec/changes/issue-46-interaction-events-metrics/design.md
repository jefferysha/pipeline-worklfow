# 设计

## Explore 结论

- 将 interaction observability 作为 kernel 内独立纯领域边界；Node/fs 只放在 state projection adapter，canonical Change/RunRevision/TransitionRecord 继续是唯一 workflow 真相。
- 新增每 Change 的 `.pipeline-interactions.jsonl` append-only projection；所有真实 emitter 在既有 change lock 内追加，顺序与 canonical request/ack/effect/resume 成功切面一致。
- state hash 复用 `RunRevision.stateDigest`，workflow hash 复用冻结 plan fingerprint，step visit 复用 `runId + transitionSequence`，不从 YAML/history 文案猜测。
- 使用版本化字段闭集；不提供 raw/free-form payload 或任意 metadata。核心 event/result 稳定，reason/trigger/effect/outcome 通过受限 namespaced codes 兼容扩展。
- scorecard 与 fixture replay 是 kernel 纯函数；measurement 与 negative-control cohorts 分开，安全诊断永不折进加权总分。

## 风险

- canonical 写成功而事件投影失败时，既不能回滚或篡改 canonical 状态，也不能静默造成“完整”假象。
- 并发进程可能产生重复、乱序或错误 step-visit/state-hash 绑定；需要稳定 identity、序号与故障诊断。
- envelope 一旦被 #47/#54/#57 消费即成为公共兼容面，过早冻结错误字段会迫使后续 schema replacement。
- 事件字段或测试夹具可能意外包含 prompt、凭证、绝对 artifact 内容或其他敏感信息。

## 待验证问题

- Spec 需要把 v1 字段闭集、初始 code registry、允许的 event/result 组合与错误码逐项写成 requirement/scenario。
- Spec 需要固定 duration clock 注入、event file size/line 上限和 projection warning 的公开错误语义。
- Spec 需要决定 CLI scorecard 的精确 argv/JSON shape，并保证 fixture 路径只读、普通文件、非 symlink、确定性排序。
- 实现只真实证明 `interactive + default + built-in + cli`；完整矩阵由 contract/matrix tests 证明可表达，跨 surface/AFK/custom conformance 留给 #54。
