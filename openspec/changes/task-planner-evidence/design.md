# 设计

## Explore 结论

新增 strict append-only Invocation evidence aggregate；Task Planner 只是声明输入输出 schema 的普通 Skill。事件绑定精确 WorkflowRun/StepVisit、TaskPlanRevision/WorkItem 与可选 attempt。QuestionEvent 证明版本化问题契约确实展示，DecisionEvent 证明用户选择或依据冻结 InteractionPolicy 未询问并采用推荐默认。

完整研究、设计和决策见：

- `docs/superpowers/specs/2026-08-03-task-planner-evidence-codebase-research.md`
- `docs/superpowers/specs/2026-08-03-task-planner-evidence-design.md`
- `docs/adr/2026-08-03-task-planner-evidence-explore.md`

## 风险

- 记录 Prompt/回答可能泄露敏感内容。
- 调用前后事件跨进程中断时可能留下不完整 Invocation。

## 已冻结方向

- 新结构化 ledger 是 v1 canonical evidence；history 仅作单向兼容投影。
- raw prompt/answer/output 不持久化；自由文本只保存分类和 keyed digest。
- hard-gate 永不默认；recommended default 必须引用精确 frozen policy rule。
- 当前 >128 transcript bug 已由 PR1 修复；pre-init bootstrap 是独立后续 hardening，不放宽本协议。
