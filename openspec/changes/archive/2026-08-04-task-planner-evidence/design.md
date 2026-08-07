# 设计

## Explore 结论

新增 strict append-only Invocation evidence aggregate；Task Planner 只是声明输入输出 schema 的普通 Skill。生产调用方通过受信任 application command 提交生命周期事实，repository 无条件从 canonical state 派生 WorkflowRun/StepVisit、TaskPlanRevision/WorkItem 与可选 attempt，raw event writer 不作为公共铸证入口。Codex document producer、native/Task Planner 和 AFK runner 至少各有明确接线点。QuestionEvent 由 host/runner receipt 证明版本化问题契约确实展示，DecisionEvent 证明用户选择或依据冻结 InteractionPolicy 未询问并采用推荐默认。

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
- 全 ledger 在任何 append 前都必须可投影；event/byte/question/artifact budget 在写入前拒绝越界。
- artifact intent 在公开前必须是 canonical document、项目相对路径或 bounded opaque ref；binding 必须引用 declared output 并取得 trusted validator verdict。
- Dashboard 必须消费字段与 artifact validator、privacy-safe free-text 分类，并保留 403/404 的稳定错误差异。
- 当前 >128 transcript bug 已由 PR1 修复；pre-init bootstrap 是独立后续 hardening，不放宽本协议。
