# 提案

## Why

用户无法在 Dashboard 中按 Project、PipelineRun、TaskGroup、WorkItem 和 SkillInvocation 理解自动拆分结果，也看不到覆盖缺口、依赖、并行波次与阻断原因。

## What Changes

新增完整桌面治理视图，覆盖 TaskPlan/TaskGroup/WorkItem、Requirement/Acceptance 覆盖、SkillInvocation 输入输出、QuestionEvent/DecisionEvent、Workflow 拆分与互动策略、AFK admission、DAG 波次、资源冲突、重试/失效和硬阻断。范围包含只读 API 消费、Workflow 配置入口及完整 loading/error/empty/keyboard/i18n 状态，不在前端复制后端调度算法。

## Capabilities

### New Capabilities

`dashboard-task-plan`

### Modified Capabilities

无。

## Impact

影响 Dashboard API 客户端、Workflow 定义页、项目/运行/任务领域视图、导航与中英文文案；所有新增后端功能与状态都必须存在可发现 UI，不允许只暴露 JSON。只面向 1024–1920px 桌面，不增加移动验收。
