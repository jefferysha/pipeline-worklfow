---
change: task-dag-scheduler
design-doc: docs/superpowers/specs/2026-08-03-task-dag-scheduler-design.md
---

# Task DAG 与 AFK 调度实施计划

## 默认决策

- 不做 prototype：先用纯 compiler + 一个真实 subordinate run/API tracer bullet 验证接缝。
- 合法 exact write conflict 稳定序列化；ambiguous claim 阻断。
- 使用宿主已提供的专用 worktree，Build 采用 `direct + worktree`；任务共享类型和运行态高度耦合，不并发写同一契约。
- Dashboard 放在既有 AFK 功能域，只消费 `task-run/v1`；不复制 kernel/automation 规则。

## 子阶段 1：Tracer bullet — frozen plan 到 task-run API

1. 在 `packages/kernel/src/task-scheduler/` 新增领域模型、`compileTaskSchedule`、`deriveTaskRunReadModel` 与导出，先写 `compiler.test.ts` 的一条 depends_on 红测，再打通两个 wave。
2. 在 `packages/automation/src/task-plan-run/` 新增 `TaskPlanRun`、append-only attempt/operation journal port 与 subordinate executor，先写 `taskPlanRun.test.ts`，复用现有 prepared execution/admission ports 跑一个真实 item。
3. 新增 `packages/server/src/serverTaskRunRoutes.ts` 与测试，接入 `serverGetRoutes.ts`/`serverPostRoutes.ts`：`GET /api/task-runs/:change` 返回真实 `task-run/v1`，`POST /api/task-runs/:change/operations` 接受 expected-state guarded operation。
4. 新增 `packages/dashboard-app/src/api/taskRunClient.ts`、`afk/taskRunModel.ts` 与 `afk/TaskRunPanel.tsx`，在既有 AFK 视图挂载最小纵向切片，覆盖 loading/empty/error 与一次允许操作；新增组件/API 测试和 zh/en key。
5. 依次运行 kernel/automation/server/dashboard 定向测试、`npm run typecheck:web` 与受影响 workspace build；失败立即修复后重跑。

回滚：TaskPlan executor 默认未启用，现有 Change scheduler 路径不变。

**此处建议 /clear**

## 子阶段 2：完整 DAG、资源与传播

1. 扩展 `compiler.test.ts` 与实现 deterministic waves、cycle/missing target、resource serialization/ambiguous blocker，确认 group nesting 不成边。
2. 在 `packages/kernel/src/task-scheduler/derive-state.ts` 与测试完成 upstream failure、retry output digest invalidation、descendant readiness 和稳定 blocker/remediation code。
3. 在同一领域边界完成 parent/TaskGroup 与 integration validator derived completion，禁止直接写 completed。
4. 扩展 `TaskRunPanel` 展示波次、并行度、attempt、validators、invalidated 与 blockers；补 blocked/running/invalidated/completed、unknown enum 与 zh/en 测试。

验证：纯函数 property/table tests 与 stable DTO snapshots。

**此处建议 /clear**

## 子阶段 3：AFK admission 与 durable operations

1. 在 automation admission adapter 接入 frozen TaskPlan revision/fingerprint、PR2 evidence 与 PR3 interaction/effective-permission/hard-confirmation authoritative pre-claim checks。
2. 完成 attempt journal、retry/cancel/resume、marker-before-kill、owner CAS 与 restart recovery；所有 mutation 追加事实并拒绝 stale expected identity/state。
3. 验证 recommended-default 只处理有 DecisionEvent 的 routine decisions，缺权限、缺 evidence、policy 漂移和 hard confirmation 全部零 claim。
4. 完成 Dashboard operation pending/success/error/conflict refetch、禁用原因、键盘焦点与可访问名称测试。

验证：并发、crash windows、stale operations、hard blockers、outer lifecycle ownership 集成测试。

**此处建议 /clear**

## 子阶段 4：堆叠兼容与交付

1. fetch 并整合 `origin/codex/workflow-decomposition-policy-20260803` 最新 head，确认它传递包含 PR1/PR2，直接消费共享 contracts，不复制公共类型。
2. 运行 kernel/automation/server/cli/dashboard 定向与全包测试、`npm run test:web`、`npm run typecheck:web`、`npm run build`、comments/skills/hooks/adapters/bundle freshness。
3. 启动真实 Dashboard，在 1024–1920px 桌面视口验证 loading/empty/error/blocked/running/invalidated/completed、zh/en、键盘 retry/cancel/resume 与 network/refetch；截图/trace 写到仓库外临时目录。
4. 更新运行时契约，提交并推送当前分支，创建 base=`codex/workflow-decomposition-policy-20260803` 的非草稿 PR；检查 CI、mergeability 与 review threads，失败修复并重跑。

回滚：关闭 TaskPlan execution admission；durable attempt facts保留为审计记录。
