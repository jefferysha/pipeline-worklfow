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

## 验证

- [ ] 验证并发、坏行、中断、错绑、缺失提问、默认决策和 artifact 漂移。 (verify)
- [ ] 验证隐私 DTO 不暴露 prompt/answer/output/session/path/digest。 (verify)

## 交付

- [ ] 同步公共契约并创建 base=PR1 branch 的独立 PR。 (ship)

## 归档

- [ ] 归档 Change 并记录证据兼容策略。 (archive)
