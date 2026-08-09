---
change: issue-68-dashboard-revision-fixture-remediation
design-doc: docs/superpowers/specs/2026-08-10-issue-68-dashboard-revision-fixture-remediation-design.md
---

# Issue #68 Dashboard revision fixture remediation · 实施计划

## 目标与边界

把四个 Dashboard 测试文件中原本代表“可信、可操作 Verify”的正向 fixture 对齐为生产
snapshot 的 `workflowExecution.readinessByTransition.verify` 形状，恢复既有 badge、Inbox、
ProjectsView need/attention 与 TaskDetail verdict 断言。只修改以下四个测试文件中的正向 fixture：

- `packages/dashboard-app/src/App.test.tsx`
- `packages/dashboard-app/src/inbox/inbox.test.tsx`
- `packages/dashboard-app/src/shell/ProjectsView.test.tsx`
- `packages/dashboard-app/src/shared/TaskDetail.test.tsx`

不得修改生产 projection、`makeChange` 默认行为、公共 DTO、kernel/server readiness 或任何缺失、
mismatch、drift、rollback、zero-mutation、privacy 负测。trusted fixture 只能显式提供既有
server-shaped readiness；不填写裸 SHA、不调用 assessor、不新增 ready 字段。

## 子阶段 1 · Tracer bullet：App fixture → model → shell

1. 保留精确六文件 RED 证据，并确认 App 的 SSE `needs-review` 与 currentRoot `a-verify` 是
   正向 Verify fixture；保留初始、不可达、普通 build 的默认输入。
2. 在 `App.test.tsx` 增加局部 `TRUSTED_VERIFY_EXECUTION`（或等价局部 helper），使用
   `progressModel.test.tsx` 已验证的 server-shaped readiness，并只给上述两个正向 fixture 注入。
3. 运行 App 单文件测试，确认徽标与显式 root 过滤从 RED 变 GREEN，且无生产文件变化。

验证：

```bash
npm run test:web -- --minWorkers=4 --maxWorkers=4 packages/dashboard-app/src/App.test.tsx
```

此处建议 `/clear`，再进入其余 fixture 窗口。

## 子阶段 2 · Inbox 与 ProjectsView 正向聚合

1. 在 `inbox.test.tsx` 将 `VERIFY_OK` 及其用于排序/聚合、可读 evidence 的正向 Verify 样本接入
   同一 trusted readiness helper；rules 缺失、automation running/queued 与不可达项目保持原样。
2. 在 `ProjectsView.test.tsx` 将 `EVIDENCE_OK` 及其 repository/worktree 正向变体接入同一
   server-shaped readiness；failed/open/empty/不可达样本不添加 ambient trust。
3. 扫描两文件的 `makeChange(..., 'verify', ...)`、verdict、need、attention fixture，确认
   没有遗漏陈旧正向样本，也没有把 helper 放入共享 `testkit.ts`。
4. 分别运行 Inbox、ProjectsView 单文件测试。

验证：

```bash
npm run test:web -- --minWorkers=4 --maxWorkers=4 packages/dashboard-app/src/inbox/inbox.test.tsx
npm run test:web -- --minWorkers=4 --maxWorkers=4 packages/dashboard-app/src/shell/ProjectsView.test.tsx
```

此处建议 `/clear`，再处理 TaskDetail 与聚焦矩阵。

## 子阶段 3 · TaskDetail verdict fixture

1. 在 `TaskDetail.test.tsx` 为默认 Verify detail 与三轨 fail detail 显式注入同形 readiness，
   保留 rules-missing、automation failed/running 与 revision 负向 fixture。
2. 确认 `verification_report` 缺失仍作为字段 miss，而 trusted readiness 仅表示 server assessor
   已完成；不得以字段补全或裸 revision token 修复断言。
3. 运行 TaskDetail 单文件测试并扫描其余 Verify fixture。

验证：

```bash
npm run test:web -- --minWorkers=4 --maxWorkers=4 packages/dashboard-app/src/shared/TaskDetail.test.tsx
```

## 子阶段 4 · 聚焦回归与 Build readiness

1. 运行六文件聚焦矩阵（App、Inbox、progressModel、ProgressView、TaskDetail、ProjectsView），
   记录从 4 files/17 failures/293 passes 到 6 files 全绿的精确计数。
2. 运行相关 view-model/API contract 测试，随后运行必要的 `typecheck:web` 与 `build:web`；不运行
   全仓 `test:web`，除非根代理另行授权。
3. 只更新本 Change 的 `tasks.md` 实现项、plan/coverage 文档及当前 phase ledger evidence；
   `tenon check` 通过后停在 Build readiness，不执行 `build-complete`、Verify、formal Review、
   push、PR 或 merge。

建议命令：

```bash
npm run test:web -- --minWorkers=4 --maxWorkers=4 \
  packages/dashboard-app/src/App.test.tsx \
  packages/dashboard-app/src/inbox/inbox.test.tsx \
  packages/dashboard-app/src/model/progressModel.test.tsx \
  packages/dashboard-app/src/progress/ProgressView.test.tsx \
  packages/dashboard-app/src/shared/TaskDetail.test.tsx \
  packages/dashboard-app/src/shell/ProjectsView.test.tsx
npm run typecheck:web
npm run build:web
```

## 验收与回滚

- 仅四个目标测试文件包含 fixture 变化；生产源码、公共 contract 与负向测试 diff 必须为空。
- 六文件聚焦矩阵达到 310/310 passed；相邻 model/view 回归、typecheck/build 结果逐项记录。
- 任一 fixture 修复后出现 production projection RED，立即停止并回报根代理，不越过边界修改生产代码。
- 回滚边界是恢复四个目标测试文件与本 Change 文档/ledger 的候选 commit；不改 `.pipeline/` 控制面，
  不删除用户数据或 named volume。

## 决策记录

- 不插入 prototype：精确 RED、生产调用链与既有 trusted fixture precedent 已消除状态机和数据模型
  unknown；一次性 fixture 注入可逆且足以验证行为。
- 不修改 `makeChange` 默认 readiness：默认 fail-closed 是本 Change 需要保留的回归保护。
- 不新增依赖或共享前后端契约：测试使用现有 server snapshot 形状，不复制 kernel assessor。
