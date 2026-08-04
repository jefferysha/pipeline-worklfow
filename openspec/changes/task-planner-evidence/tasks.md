# 任务

## 立项

- [x] 确认通用 SkillInvocation 与 Task Planner 证据范围。

## 调研

- [x] 调研现有 Skill receipt、history、document ledger 与隐私边界。 (explore)

## 规格

- [x] 冻结 Invocation、QuestionEvent、DecisionEvent、ArtifactBinding、API 与隐私契约。 (spec)

## 实现

- [x] 以 tracer bullet 打通 Invocation repository、精确 subject 与真实只读 API。 (build)
- [x] 实现唯一 terminal、中断恢复、Question/Decision 与默认策略证明。 (build)
- [x] 实现 ArtifactBinding、validators、Codex/native/AFK adapters 和兼容投影。 (build)
- [x] 接入 trusted application command 与真实 Codex/native/Task Planner/AFK production lifecycle，移除公开 canonical binding bypass。 (build)
- [x] 修复全 ledger/budget、question/answer/default、artifact/output/validator 的 fail-closed 边界。 (build)
- [x] 补齐真实 persisted invocation API 集成、稳定 403/404、Dashboard validator/free-text 消费与 closed decoder。 (build)

## 验证

- [x] 验证并发、坏行、中断、错绑、缺失提问、默认决策和 artifact 漂移。 (verify)
- [x] 验证隐私 DTO 不暴露 prompt/answer/output/session/path/digest。 (verify)

## 交付

- [x] 同步公共契约并创建 base=PR1 branch 的独立 PR。 (ship)

## 归档

- [ ] 归档 Change 并记录证据兼容策略。 (archive)
