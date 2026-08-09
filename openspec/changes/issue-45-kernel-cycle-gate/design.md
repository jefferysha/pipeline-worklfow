# 设计

## Explore 结论

- 当前 kernel 生产图包含两个 runtime SCC：document/state/Skill/task-plan 六文件 SCC 与 workflow contract/
  validator 双文件 SCC；现有 architecture checker 未检查 import graph。
- 采用纯状态核心 + 外层应用服务 + 共享 contract 叶子：document confirmation 与 task-plan lifecycle 仍由库内
  高层服务强制装配，caller 不能注入/省略安全锚点；低层 state 不反向 import Skill runtime。
- graph gate 使用现有 TypeScript AST，确定性解析项目相对源码 import；runtime SCC 必须为零，type-only 边单独
  计数/报告，mixed/value binding 仍属于 runtime。
- 设计与完整验收矩阵：
  `docs/superpowers/specs/2026-08-10-kernel-runtime-cycle-gate-design.md`。
- 决策记录：`docs/adr/2026-08-10-issue-45-kernel-runtime-cycle-gate-explore.md`。

## 风险

- document recording facade 若允许 caller 提供 confirmation anchor，会弱化 exact current-StepVisit fail-closed 约束。
- task-plan lifecycle 若进入 state lock，会造成锁顺序反转并改变 begin/complete/fail 与提交点语义。
- resolver 若静默忽略 unresolved 相对源码、误判 mixed import 或依赖遍历顺序，会产生漏报/跨平台漂移。
- 公共 re-export 或 tracked CLI/server bundle 未同步，会形成源码通过但消费端/freshness 失败。

## 固定兼容边界

- 保持 `recordDocument`、`publishTaskPlanRevision` 与 workflow validator 的公共名称、签名、返回和错误语义。
- 保持 document ledger、Skill JSONL、task-plan revision/current/projection 与 `tasks.md` 格式不变。
- 保持 CLI document record 的单一 SkillInvocation Change lock，以及 task-plan begin-before-lock、complete/fail-after-lock。
- 根 `check:architecture` 是唯一 canonical 接入点；不新增浮动 baseline、cycle exception 或第三方依赖。
- 浏览器/E2E 因无用户可见改动明确不适用；unit/integration/cross-process/build/bundle/freshness/OpenSpec 为验收面。
