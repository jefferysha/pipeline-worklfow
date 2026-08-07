# dashboard-task-plan Verify 报告（第 1 轮）

## 结论

FAIL。冻结基线 `fe3a02d1fddbead4292e5429a2493a6c3dd04ba7` 的实现、浏览器行为和
OpenSpec 隔离应用演练均通过，但发现一个测试完整性阻塞项：
`packages/dashboard-app/src/taskPlan/taskPlanPresentation.test.ts` 不匹配 Dashboard Vitest 配置的
`src/**/*.test.tsx`，所以标准 `test:web` 不会执行该文件。本轮必须走 `verify-fail` 回到 Build，
让该测试进入仓库指定 suite 后重新冻结并全量复验。

本轮复杂性判断、代码审查、finding 分级和验收全部由主线程完成；没有把 review 委派给
`luna_worker` 或其他 subagent。后续仅把边界明确的测试接线修复交给 `luna_worker` 实施，主线程复核。

## 冻结基线与零漂移

- `build_sha`：`fe3a02d1fddbead4292e5429a2493a6c3dd04ba7`
- `git rev-parse HEAD`：同上。
- Verify 前后 `git diff --quiet <build_sha> -- openspec/specs`：PASS。
- Verify 前后排除 `openspec/changes/dashboard-task-plan/**` 的 tracked/untracked delivery diff：空。
- Verify 期间没有重建 tracked bundle；截图、浏览器状态和 OpenSpec 演练均位于仓库外。

## 主线程 findings

| Severity | Finding | 处置 |
| --- | --- | --- |
| Medium | `packages/dashboard-app/src/taskPlan/taskPlanPresentation.test.ts` 未被 `packages/dashboard-app/vitest.config.ts` 的 `src/**/*.test.tsx` 收集。显式执行返回 `No test files found`，因此此前 1735 项全量结果不包含该文件。 | 阻塞；回 Build 让测试进入标准 suite，再复跑窄测、`test:web`、typecheck 和 build。 |
| Low | 嵌套 WorkItem 详情打开时按一次 `Escape` 会连同外层 Change 详情一起关闭。 | 不阻塞；规格要求的纯键盘关闭按钮路径通过，关闭后焦点精确回到原 `task-plan-item-*` 行。按用户要求不为非验收路径扩大范围。 |
| Info | Workbench 请求未实现的 context-bundle preview 返回 501；真实无 TaskRun 时 GET 返回 404。 | 非本 Change 缺陷；前者由现有 UI 显示 unavailable，后者被 TaskRun client 正确映射成 intentional empty。 |

## 机器验证

### Build 阶段冻结前证据

- `npm run test:web -- --minWorkers=4 --maxWorkers=4`：96 files、1735/1735 通过。
- `npm test -- --minWorkers=4 --maxWorkers=4`：通过；真实 Codex 条件用例按仓库契约诚实 skip。
- `npm run typecheck:web`：通过。
- `npm run build`：通过，Dashboard release assets 已落入冻结提交。

这些结果对应冻结 SHA，但本轮 Verify 发现标准 suite 的收集配置漏掉一个 `.test.ts` 文件，因此不能据此放行。

### Verify 阶段只读复验

- 6 个收集到的定向文件、119/119 tests：通过。
- `npm run typecheck:web`：通过。
- `npx vitest run --config packages/dashboard-app/vitest.config.ts packages/dashboard-app/src/taskPlan/taskPlanPresentation.test.ts --minWorkers=4 --maxWorkers=4`：FAIL，
  `No test files found`；配置实际 include 为 `src/**/*.test.tsx`。

## 单一真实浏览器 owner 验收

- Runtime：`http://127.0.0.1:18795/`，Tenon 1.0.1，PID `84336`；使用已构建的
  `packages/server/dist/dashboard.mjs`，未占用用户的 18765 实例。
- Browser：同一个 Playwright owner/session 完成全部视口、状态、语言和键盘检查。
- `/api/health`、Dashboard root：200；真实 TaskPlan legacy DTO：200；真实无 TaskRun：404 并正确呈现 empty。
- 1920、1440、1280、1024px：`documentElement.scrollWidth === innerWidth`，无 document 横向溢出。
- 1024px 纯键盘路径：筛选到一个 WorkItem、Enter 打开、聚焦关闭按钮、Enter 关闭；焦点返回
  `task-plan-item-legacy-display-0005`，外层 Change 详情保持打开。
- zh/en：同一运行中 app 切换后，导航、TaskPlan、empty/error/stale、blocker、remediation 与 policy runtime
  标签切换；计划内用户内容保持原文。
- 真实状态：legacy/unknown relationships、no-run empty、WorkItem-scoped evidence empty、Change-scoped
  `tenon-build` evidence。
- 同 session 网络状态验收（明确只作为 UI state fixture，不冒充真实后端）：canonical identity、coverage、
  dependency cycle、resource conflict、projection drift、blocked admission、ordered waves、attempt、invalidation、
  validator；read-only TaskRun 即使 DTO 提供 retry/cancel/resume，渲染操作按钮数量仍为 0。
- loading；initial error → retry → ready；cached canonical → refresh failure → stale → retry → real legacy ready：通过。
- Workbench：configured/frozen fingerprint、decomposition/interaction、drift 与 effective-authority unavailable reason
  均来自真实 snapshot 并可见。
- 证据截图：`pr5-task-plan-1920.png`、`pr5-task-plan-1440.png`、`pr5-task-plan-1280.png`、
  `pr5-task-plan-1024.png`、`pr5-canonical-task-plan-1024-en.png`、`pr5-workbench-policy-1024-en.png`。

## 逐文件规范回读

| 改动文件 | 命中的 capability spec | 结论 |
| --- | --- | --- |
| `AGENTS.md` | 项目 agent rules；本 Change 的实施/验收分工 | 已回读；worker 仅实施、主线程 review。 |
| `docs/adr/2026-08-03-dashboard-task-plan-explore.md`、`docs/superpowers/plans/2026-08-03-dashboard-task-plan.md`、`docs/superpowers/specs/2026-08-03-dashboard-task-plan-codebase-research.md`、`docs/superpowers/specs/2026-08-03-dashboard-task-plan-design.md` | `openspec/changes/dashboard-task-plan/specs/dashboard-task-plan/spec.md` | 已回读；层级、只读边界、状态、i18n、桌面验收一致。 |
| `openspec/changes/dashboard-task-plan/**` | `dashboard-task-plan` delta 与 Tenon document/workflow evidence | 已回读；canonical state 仅由 CLI 产生，当前 Verify 文档证据待本报告登记。 |
| `packages/dashboard-app/src/api/taskPlanClient.ts`、`taskPlanClient.test.tsx` | `task-plan-contract`、`dashboard-task-plan` | closed decoder、预算、canonical/legacy、错误码一致；37 项测试通过。 |
| `packages/dashboard-app/src/taskPlan/TaskPlanPanel.tsx`、`TaskPlanPanel.test.tsx`、`TaskPlanContent.tsx`、`TaskPlanDiagnostics.tsx`、`WorkItemDetailPanel.tsx`、`taskPlanPresentation.ts`、`taskPlanPresentation.test.ts` | `dashboard-task-plan`、`task-plan-contract` | 行为符合；唯一阻塞是 presentation test 未被标准 suite 收集。 |
| `packages/dashboard-app/src/shared/TaskPlanEvidenceSection.tsx`、`TaskPlanEvidenceSection.test.tsx`、`TaskDetail.tsx`、`TaskDetail.test.tsx` | `dashboard-task-plan`、`dashboard-ui-ux-system` | 薄协调边界、scope reset、详情装配与焦点路径一致。 |
| `packages/dashboard-app/src/shared/SkillInvocationEvidenceCard.tsx`、`SkillInvocationEvidenceCard.test.tsx` | `skill-invocation-evidence`、`dashboard-task-plan` | WorkItem 范围、隐私最小化、问题/决策/产物/validator 展示一致。 |
| `packages/dashboard-app/src/afk/TaskRunPanel.tsx`、`TaskRunPanel.test.tsx` | `task-dag-scheduler`、`dashboard-task-plan` | 只消费服务端 waves/operations；TaskDetail 中 read-only，无 POST 控件。 |
| `packages/dashboard-app/src/workbench/WorkbenchView.tsx`、`WorkbenchView.test.tsx`、`WorkflowPolicyRuntimeSummary.tsx`、`WorkflowPolicyRuntimeSummary.test.tsx` | `workflow-decomposition-policy`、`frozen-workflow-definition-status`、`dashboard-task-plan` | configured/frozen/effective/drift 展示与正交编辑边界一致。 |
| `packages/dashboard-app/src/i18n/translations.ts` | `dashboard-task-plan`、`dashboard-ui-ux-system` | 新文案 zh/en 完整，运行时浏览器切换通过。 |
| `packages/dashboard-app/dist/index.html`、`packages/dashboard-app/dist/assets/**` | 上述 Dashboard source capabilities 的发布构建映射 | 冻结前从最终源码生成；引用闭合，真实 server 成功服务。 |

## OpenSpec 隔离应用演练

- CLI：OpenSpec `1.6.0`。
- 真实 worktree：`openspec show dashboard-task-plan --json --deltas-only` 产出 8 个 ADDED requirements；
  `openspec validate dashboard-task-plan --strict` 通过。
- 隔离副本：`/tmp/pr5-openspec-verify.gP3SOO/repo`，由冻结 SHA 的 `git archive` 创建。
- 副本内 `openspec archive dashboard-task-plan --yes --json`：成功，更新 main spec 8 项。
- 副本内 `openspec validate --all --strict`：42 passed、0 failed。
- 真实 `openspec/specs/**` 未变化。

## 未执行与剩余风险

- 按用户明确分工，没有启动 reviewer/design-reviewer subagent，也没有把 findings 分级交给 worker；
  对应代码、E2E、视觉和 Codex 关注面由主线程统一执行。本轮不把未运行的外部 reviewer 冒充 PASS。
- 修复测试收集后必须重新进入 Verify，重新跑完整冻结 diff、标准 suite、浏览器关键路径和 OpenSpec 演练；
  不能只复查该文件名。
