# 提案

## Why

Codex 定时任务在首次调度的同一轮已经完整读取当前 Tenon Skill，且 host transcript
已经记录对应的 `function_call` 与成功的 `function_call_output`，但
`tenon document record` 仍报告缺少当前 phase 的 Skill 调用证据。用户必须再发送一条
消息才能继续，使无人值守的自动化稳定卡在 Open/后续阶段边界。这既不是业务代码失败，
也不是缺少授权，而是可信 Skill receipt 桥接没有正确识别当前轮已完成的读取。

## What Changes

- 修复 Codex host transcript 到 Tenon Skill receipt 的同轮识别，使首次调度在读取完成后
  即可登记文档证据。
- 保留现有信任边界：必须匹配受信 Skill 路径、绑定的 host session、当前 turn/tool call
  以及成功完成的内部 exec result；不接受仅有调用、只转发 stdout、失败输出或伪造 producer。
- 固定 Codex custom wrapper：必须 `await` 顶层 `tools.exec_command`，并把同一变量的完整
  result 传给 `text(result)`，使内部 `exit_code` 可审计；`text(result.output)` 失败关闭。
- 增加基于真实 Codex transcript 形状的回归测试，并覆盖首次登记成功及不完整/不可信读取拒绝。
- 非目标：不删除 review marker，不放宽 confirm gate，不改变 canonical state 或
  `.pipeline.yaml`，不为旧文档 backfill 证据。

## Capabilities

### New Capabilities

- `codex-skill-receipt-current-turn`：从绑定的 Codex 当前轮 transcript 安全地确认已完成
  Skill 读取，并在首次文档登记时生成可审计 receipt。

### Modified Capabilities

无。

## Impact

影响 CLI 的 Codex transcript 证据解析、Skill receipt 桥接、内部 Skill gate 及其测试。
不改变公开 Dashboard/API、ledger schema、持久化格式或既有非 Codex host 行为。修复将随
CLI/bundle 交付，旧 transcript 仍须满足相同的信任与成功完成约束。
