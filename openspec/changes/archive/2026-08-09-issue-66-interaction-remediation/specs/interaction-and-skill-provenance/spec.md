# Interaction And Skill Provenance 增量规格

> 治理记录：在任何实现写入和 worker 派发前，本 Change 已通过官方 `requirements-changed` 从 Build 回到 Spec。本 delta 明确取代 #46 对 sidecar-less legacy receipt 的宽泛兼容假设；最终兼容路径是 fail closed 后发起 fresh exact request，而不是自动迁移或授权降级。

## ADDED Requirements

### Requirement: Canonical review authorization SHALL require a bounded physical decision-state binding

Canonical review request MUST 在 Change lock 下生成 `.pipeline-review-gate-binding.json`，并把 exact phase、event、`review_requested_at`、canonical decision-state digest 与可选 run id 绑定为 version 1 sidecar。Writer MUST 只产生字段闭合、单行 `JSON.stringify(binding) + "\n"` 的 canonical bytes，并通过既有 atomic replace 发布。

Authorization reader MUST 在物化内容前执行 16 KiB byte ceiling，并通过 `O_NOFOLLOW | O_NONBLOCK` 打开同一 target。Reader MUST 证明 parent directory realpath/identity 与 target/fd 的 `dev`、`ino`、`size`、`mtimeNs`、`ctimeNs` 在 proof/read 前后稳定，MUST 只接受严格 UTF-8 的普通文件，并 MUST 以 bounded `max + 1` fd read 检测增长。解析后的闭合 binding 重新编码后 MUST 与原始 bytes 完全一致；duplicate keys、字段重排、额外空白/trailing bytes 或其他多义编码 MUST fail closed。

`review acknowledge` 与 canonical transition MUST 只有在 sidecar 同时匹配当前 phase、event、requestedAt、decision-state digest 与 run id 时授权。Missing、non-regular、symlink、oversize、malformed、ambiguous、replaced、changed-during-read 或不匹配的 sidecar MUST NOT 授权，且错误不得回显 sidecar 内容。

Sidecar-less legacy pending/approved receipt MUST NOT 被当前 state 自动 backfill 或解释为已绑定 approval，因为 runtime 无法证明旧 request 时刻的 decision-state digest。恢复 MUST 通过相同 exact phase/event 的 fresh `review request` 写入新的有序 requestedAt、pending receipt 与 canonical sidecar，再重新 acknowledge；不得提供 compatibility bypass、启动时静默迁移或 interaction-projection fallback。

#### Scenario: canonical request/acknowledge/transition 正常闭环

- **WHEN** exact review request 在 Change lock 下写入 pending receipt 和 canonical sidecar
- **THEN** bounded reader 返回同一 version 1 binding
- **AND** acknowledgement 与 transition 只有在 phase/event/requestedAt/digest/run id 全部匹配时成功

#### Scenario: sidecar 不是稳定普通文件

- **WHEN** sidecar 是 symlink、目录或其他非普通文件，或 path/fd/parent 在读取期间被替换、消失或改为 symlink
- **THEN** reader fail closed
- **AND** acknowledgement 与 transition 都不得消费 receipt

#### Scenario: sidecar 超限或在读取期间增长

- **WHEN** sidecar 打开时超过 16 KiB，或在 fstat 后增长并使 bounded reader 读到第 16 KiB + 1 byte
- **THEN** reader 在解析前拒绝
- **AND** 不得物化攻击者控制的无界 tail

#### Scenario: sidecar 内容在 proof/read 窗口变化

- **WHEN** 同一 inode 被同尺寸改写，或 target 被新 inode 替换
- **THEN** size/mtime/ctime 或 dev/ino fence 检测变化并拒绝
- **AND** 不能使用 proof 来自旧文件、内容来自新文件的混合证据

#### Scenario: sidecar JSON malformed 或 ambiguous

- **WHEN** sidecar 不是严格 UTF-8/合法闭合 JSON，包含未知字段、duplicate keys、字段重排、额外空白或 trailing bytes
- **THEN** reader 产生稳定的 invalid/unreadable 结果且不泄露内容
- **AND** acknowledgement 与 transition fail closed

#### Scenario: legacy approved receipt 缺少 binding

- **WHEN** legacy pending/approved receipt 没有 `.pipeline-review-gate-binding.json`
- **THEN** acknowledgement 与 transition 都不得授权
- **AND** runtime 不得从当前 state 自动生成可消费的 approval binding

#### Scenario: fresh request 恢复 legacy receipt

- **GIVEN** legacy receipt 缺少、损坏或不匹配的 sidecar
- **WHEN** caller 对相同 exact phase/event 重新执行 `review request`
- **THEN** request 在 Change lock 下产生新的有序 requestedAt、pending receipt 与 canonical sidecar
- **AND** 后续新的 acknowledgement 与 exact transition 可以正常完成

#### Scenario: interaction projection 不参与授权

- **WHEN** `.pipeline-interactions.jsonl` 缺失或损坏，但 canonical receipt 与 sidecar 有效
- **THEN** canonical acknowledgement/transition 仍按 sidecar contract 决定
- **AND** projection 仅报告自身 warning/diagnostic，不得成为授权真相或 fallback
