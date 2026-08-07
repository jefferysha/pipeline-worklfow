# 设计

## Explore 结论

采用列表/详情主从布局、覆盖矩阵和有界执行波次，不使用无界节点图。Progress/TaskDetail 承载 Run 与 TaskPlan，Workbench 承载正交策略配置，AFK 承载 admission、运行与操作；WorkItem 详情展示覆盖、依赖、Skill 输入输出、提问/默认决策、产物、validators 和 blockers。所有调度结论只消费后端 DTO。

完整研究、设计和决策见：

- `docs/superpowers/specs/2026-08-03-dashboard-task-plan-codebase-research.md`
- `docs/superpowers/specs/2026-08-03-dashboard-task-plan-design.md`
- `docs/adr/2026-08-03-dashboard-task-plan-explore.md`

## 风险

- 大型计划若直接绘制全图会失去可读性和键盘可达性。
- 后端结构化契约尚在独立 PR 中演进，需要隔离客户端适配边界。
- 自动默认决策若没有清晰理由和来源，会让用户误以为系统跳过了必要确认。

## 已冻结方向

- Progress/TaskDetail、Workbench、AFK 分别承接 inspection、configuration、operations，不新增顶层应用。
- 100+ WorkItem 使用可筛选列表和有界波次，1024–1920px 提供语义列表等价视图。
- waiting、defaulted、hard-blocked 使用不同文字、图标/形状和解除路径；未知枚举显式降级为 unknown。
- loading/error/empty/stale/unknown/retry 与 zh/en、键盘焦点均进入组件和浏览器验收矩阵。
