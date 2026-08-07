---
change: dashboard-task-plan
design-doc: docs/superpowers/specs/2026-08-03-dashboard-task-plan-design.md
---

# Dashboard TaskPlan 全栈 UI 实施计划

## 默认决策

- 不做一次性 prototype：现有 Progress/TaskDetail、Workbench、AFK、decoder 与 i18n 组件提供明确集成点；用组件 tracer bullet 和真实 browser 尽早验证。
- 不新增顶层页面，不引入无界 graph，不复制后端 scheduling/effective-permission 规则。

## 子阶段 1：Tracer bullet — API decoder 到可见 WorkItem

1. 在 `packages/dashboard-app/src/api/taskPlan*` 增加 PR1-4 DTO types/strict decoders/client 与 unknown enum 投影。
2. 在 Progress/TaskDetail 增加最小 TaskPlan revision + WorkItem list/detail，消费真实 server fixture/endpoint。
3. 增加 loading/empty/error/stale 与 zh/en 最小闭环、组件测试和 1024px keyboard smoke。
4. 运行 `npm run test:web -- <定向测试>`、`npm run typecheck:web`、`npm run build:web`。

回滚：组件按 optional DTO 特性显示；关闭入口保留现有 Progress。

**此处建议 /clear**

## 子阶段 2：覆盖、波次与 Skill evidence

1. 完成 coverage matrix、依赖、bounded waves、resource conflicts、legacy unknown 与大型计划筛选。
2. 完成 WorkItem attempts、Skill inputs/outputs、artifacts、validators、QuestionEvent/DecisionEvent 与 privacy-safe presentation。
3. 覆盖 ready/filtered-empty/unknown/future enum 和非颜色状态测试。

验证：100+ fixture 的组件/性能边界与 1024/1920 visual check。

**此处建议 /clear**

## 子阶段 3：Workflow policy 与 AFK operations

1. 在 Workbench 增加正交 policy fieldsets、limits/conditions、current/frozen/effective/drift 与 guarded save。
2. 在 AFK 增加 admission/current wave/waiting/hard-blocked/invalidated 和 server-authorized retry/cancel/resume。
3. 完成 mutation pending/success/validation/conflict/failure、unsaved draft 与 focus management。

验证：API integration、mutation race/stale、zh/en、keyboard/reduced-motion 测试。

**此处建议 /clear**

## 子阶段 4：真实桌面浏览器与交付

1. 先审计并复用唯一项目专用长期 Playwright/browser owner，记录 endpoint/PID/profile/session identity。
2. 在 1024、1280、1440、1920px 验收 ready/empty/error/stale/unknown/hard-blocked、完整键盘路径、focus return、无横向 overflow、zh/en。
3. 运行 `test:web`、`typecheck:web`、`build:web` 及最终堆叠全仓验证。
4. 安全衔接 PR4 head，提交并推送 base=PR4 branch 的 PR5。

回滚：前端入口可移除；后端 DTO 与历史证据保持只读可用。
