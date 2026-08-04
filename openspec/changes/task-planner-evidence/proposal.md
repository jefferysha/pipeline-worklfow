# 提案

## Why

Skill 目前缺少通用、可验证的调用前后记录，任务拆分也无法证明输入来源、输出契约、要求提问以及回答如何改变计划。

## What Changes

新增通用 SkillInvocation/QuestionEvent/DecisionEvent/ArtifactBinding 协议、受信任的生产写入命令与稳定只读投影，并把 Codex document producer、native/Task Planner 和 AFK 执行生命周期接入同一证据边界；当 AFK 或 recommended-defaults 合法抑制提问时，也要证明原问题、策略依据和实际采用的默认值。范围限于调用与证据登记，不实现 Workflow 策略 UI 组件或 DAG 调度。

## Capabilities

### New Capabilities

`skill-invocation-evidence`

### Modified Capabilities

无。

## Impact

影响 skill governance、append-only evidence、CLI/hook/runner 接线与任务规划边界；所有记录必须绑定精确 Run、StepVisit 和 subject，由 repository 从 canonical state 派生身份，失败关闭且不记录敏感原文。
