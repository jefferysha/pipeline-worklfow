# Task DAG Scheduler 验证报告

## 结论

PASS。冻结基线 `bad884a3076886f8a25d6dcad7cdb3a651276b60` 相对 PR3 head
`b5c616f33a3d6806b18ffe0aef85ebab0062653f` 的完整变更已由主线程按 Standards 与 Spec 两轴复核；
未发现剩余 CRITICAL/HIGH/MEDIUM correctness、security、contract、可访问性或回归问题。

本次遵循项目子代理规则：Luna worker 只实施边界明确的修复；复杂性判断、finding 分级、完整 diff
review 与最终验收均由主线程完成，没有把 review 派给 worker。

## 冻结基线与完整性

- `build_sha`: `bad884a3076886f8a25d6dcad7cdb3a651276b60`
- 比较基线: PR3 head `b5c616f33a3d6806b18ffe0aef85ebab0062653f`
- `git diff --quiet bad884a3 -- packages/automation packages/kernel packages/server packages/dashboard-app packages/cli/dist/tenon.mjs`
  在冻结后定向测试、OpenSpec 演练和浏览器验收前后均 exit 0。
- 真实 `openspec/specs/**/spec.md` 聚合 digest 在隔离 archive 演练前后均为
  `1eb8d14c716bc10974d237be5d3219ce1cc7dfbf6d14c69516974ce6ac0c8459`。

## 主线程 review 结果

- Scheduler：波次仅由依赖与规范化写冲突推导；executor 只 claim 最早未完成 wave；环、缺失依赖与
  ambiguous claim 失败关闭。
- Read model：失败、重试失效、group/run validator、嵌套 group descendant ownership 与稳定排序均由
  服务端推导，Dashboard 不重算状态。
- Journal：同一 fd 读取/追加，`O_NOFOLLOW|O_NONBLOCK`、regular-file 与 dev/ino/size 身份检查、
  8 MiB 上限、完整尾行、单次完整写与 fsync 均已覆盖；损坏/竞态失败关闭。
- API：registered-root/inode anchor、change/path 校验、Host/token/content-type 顺序与 expected revision/state
  冲突语义保持；未准入 run 不暴露 allowed operation，也不会追加 journal fact。
- Dashboard：统一 decoder/client，404 为有意 empty；其他网络、decoder、409 与 5xx 保持 error/retry；
  zh/en、语义控件、焦点样式、pending/refetch 路径有测试。
- 未发现 secrets、意外公共契约复制或实现面漂移。

## Build 冻结前门禁

| 命令 | 结果 |
| --- | --- |
| `npm test -- --minWorkers=4 --maxWorkers=4` | PASS；374 files，6462 tests，14 个有明确环境原因的 skip |
| `npm run test:web -- --minWorkers=4 --maxWorkers=4` | PASS；92 files，1667 tests |
| `npm run typecheck:web` | PASS |
| `npm run build` | PASS；Dashboard/server/CLI 受跟踪 bundle 已稳定生成 |
| `npm run check:comments` | PASS |
| `npm run check:architecture` | PASS；801 production files |
| `npm run check:default-workflow-freshness` | PASS |
| `npm run check:openspec` | PASS；41 items |
| `bash tools/verify-skills.sh` | PASS |
| `bash tools/test-adapters.sh` | PASS；272 tests |
| `npm run test:hooks` | PASS；511 tests |

## Verify 冻结后证据

| 命令/检查 | 结果 |
| --- | --- |
| `npx vitest run packages/kernel/src/task-scheduler/compiler.test.ts packages/kernel/src/task-scheduler/read-model.test.ts packages/automation/src/task-plan-run/admission.test.ts packages/automation/src/task-plan-run/executor.test.ts packages/automation/src/task-plan-run/journal.test.ts packages/server/src/serverTaskRunRoutes.test.ts packages/server/src/serverTaskRunOperations.test.ts --minWorkers=4 --maxWorkers=4` | PASS；7 files，54 tests |
| `npm run test:web -- --run packages/dashboard-app/src/api/taskRunClient.test.tsx packages/dashboard-app/src/afk/TaskRunPanel.test.tsx --minWorkers=4 --maxWorkers=4` | PASS；2 files，13 tests |
| `npm run typecheck:web` | PASS |
| `openspec --version` | `1.6.0` |
| `openspec show task-dag-scheduler --json --deltas-only` | PASS；15187-byte JSON |
| `openspec validate task-dag-scheduler --strict` | PASS |
| 临时 detached worktree 内 `openspec archive task-dag-scheduler --yes --json` | PASS；`specsUpdated=true`，added=9 |
| 演练后 `openspec validate --all --strict` | PASS；41 passed，0 failed |

## 真实浏览器与 runtime 验收

- Runtime：冻结 bundle `packages/server/dist/dashboard.mjs`，隔离 `TENON_RUNTIME_HOME`，
  `http://127.0.0.1:19841/`；fixture 只写入临时 detached worktree，完成后已删除。
- Playwright 共享浏览器在 1024×900、1440×900、1920×1080 验证 AFK Task execution graph；无横向内容丢失，
  browser console 为 0 error / 0 warning。
- 中文与英文均实际切换并观察：plan/revision/fingerprint、admission blocked、remediation、两波次、failed
  attempt、blocked-upstream descendant、resource claims 和 run revision 均可读。
- `GET /api/task-runs/task-dag-scheduler?...` 返回 200 `task-run/v1`；浏览器 network log 记录 200 OK。
- 缺少 authoritative production admission 时，真实 `POST .../operations` 返回
  `409 TASK_RUN_OPERATION_CONFLICT`；随后 GET 的 `run_revision` 仍为 1、`allowed_operations=[]`，证明零 journal mutation。
- 真实 Change 无 canonical TaskPlan 时 GET 返回 404；组件测试确认 404 映射 intentional empty，而 409/5xx/decoder/network
  failure 映射 error/retry，不把缺失或错误显示成成功。

## 逐文件规格回读

主规格 `openspec/specs/task-plan-contract/spec.md` 与本 Change delta
`openspec/changes/task-dag-scheduler/specs/task-dag-scheduler/spec.md` 已全文回读。以下每个交付文件均已
按对应 capability 对照完整 diff；generated assets 与其 source capability 同步核对。

| 改动文件 | capability spec | 已回读并比对 |
| --- | --- | --- |
| `packages/automation/src/index.ts` | `task-dag-scheduler` delta + `task-plan-contract` | ☑ |
| `packages/automation/src/task-plan-run/admission.ts`、`admission.test.ts` | `task-dag-scheduler` delta | ☑ |
| `packages/automation/src/task-plan-run/executor.ts`、`executor.test.ts` | `task-dag-scheduler` delta | ☑ |
| `packages/automation/src/task-plan-run/journal.ts`、`journal.test.ts` | `task-dag-scheduler` delta + `workspace-verification-integrity` | ☑ |
| `packages/kernel/src/index.ts` | `task-plan-contract` | ☑ |
| `packages/kernel/src/task-plan/read-model.ts`、`task-plan.test.ts`、`types.ts`、`validation.ts` | `task-plan-contract` | ☑ |
| `packages/kernel/src/task-scheduler/compiler.ts`、`compiler.test.ts` | `task-dag-scheduler` delta | ☑ |
| `packages/kernel/src/task-scheduler/read-model.ts`、`read-model.test.ts` | `task-dag-scheduler` delta | ☑ |
| `packages/kernel/src/task-scheduler/index.ts`、`run-types.ts`、`types.ts` | `task-dag-scheduler` delta | ☑ |
| `packages/server/src/serverGetRoutes.ts`、`serverPostExecutionRoutes.ts` | `task-dag-scheduler` delta | ☑ |
| `packages/server/src/serverTaskPlanRoutes.ts`、`serverTaskPlanRoutes.test.ts` | `task-plan-contract` | ☑ |
| `packages/server/src/serverTaskRunRoutes.ts`、`serverTaskRunRoutes.test.ts` | `task-dag-scheduler` delta | ☑ |
| `packages/server/src/serverTaskRunOperations.ts`、`serverTaskRunOperations.test.ts` | `task-dag-scheduler` delta | ☑ |
| `packages/dashboard-app/src/api/taskRunClient.ts`、`taskRunClient.test.tsx` | `task-dag-scheduler` delta | ☑ |
| `packages/dashboard-app/src/afk/taskRunModel.ts` | `task-dag-scheduler` delta | ☑ |
| `packages/dashboard-app/src/afk/TaskRunPanel.tsx`、`TaskRunPanel.test.tsx` | `task-dag-scheduler` delta + `dashboard-ui-ux-system` | ☑ |
| `packages/dashboard-app/src/afk/AfkView.tsx`、`AfkView.test.tsx` | `task-dag-scheduler` delta + `dashboard-ui-ux-system` | ☑ |
| `packages/dashboard-app/src/i18n/translations.ts` | `task-dag-scheduler` delta + `dashboard-ui-ux-system` | ☑ |
| `packages/server/dist/dashboard.mjs`、`packages/cli/dist/tenon.mjs` | 对应 server/CLI source capability | ☑ |
| `packages/dashboard-app/dist/index.html` | 对应 Dashboard source capability | ☑ |
| `packages/dashboard-app/dist/assets/AfkView-C2uIIIvs.js`、删除的 `AfkView-PW3ozuz3.js` | 对应 `AfkView`/`TaskRunPanel` source capability | ☑ |
| `packages/dashboard-app/dist/assets/HostTargetPlanView-BYFXpPGu.js`、`MachineView-Da1dSeEo.js`、`ProgressView-Bh-AzcWP.js` | generated Dashboard baseline | ☑ |
| `packages/dashboard-app/dist/assets/SolutionView-Cs9ZoTio.js`、删除的 `SolutionView-DwMsbzSo.js` | generated Dashboard baseline | ☑ |
| `packages/dashboard-app/dist/assets/WorkbenchView-CNAUILj7.js`、删除的 `WorkbenchView-CsR8xvsR.js` | generated Dashboard baseline | ☑ |
| `packages/dashboard-app/dist/assets/auditClient-BdS0QZK2.js`、`automationClient-DfWC58BI.js`、`loopsClient-CIK_Qg90.js` | generated Dashboard baseline | ☑ |
| `packages/dashboard-app/dist/assets/icons-vendor-ChP7U9fn.js` | generated Dashboard baseline | ☑ |
| `packages/dashboard-app/dist/assets/index-Dsvk-eDT.js`、`index-LA-7MFCA.css`、删除的 `index-DDFFwFsS.css` | generated Dashboard source/style capability | ☑ |
| `docs/adr/2026-08-03-task-dag-scheduler-explore.md` | `task-dag-scheduler` delta | ☑ |
| `docs/superpowers/plans/2026-08-03-task-dag-scheduler.md` | `task-dag-scheduler` delta | ☑ |
| `docs/superpowers/specs/2026-08-03-task-dag-scheduler-codebase-research.md`、`2026-08-03-task-dag-scheduler-design.md` | `task-dag-scheduler` delta | ☑ |
| `openspec/changes/task-dag-scheduler/proposal.md`、`design.md`、`tasks.md`、delta spec 与 canonical evidence files | `task-dag-scheduler` delta + document governance specs | ☑ |

## 剩余风险与边界

- 批准计划明确保持 TaskPlan executor 默认关闭；production server 当前没有把 authoritative admission
  注入 read route，因此 live retry/cancel/resume 不会出现。此边界按 fail-closed 处理，不是静默成功；本 PR
  验证 compiler/read model/journal/API/UI contract，未来启用 executor 时必须另做 admission 接线与 marker-before-kill
  的 live process 验收。
- 环境 skip 未伪装为通过：真实 Codex/Claude 外部凭证相关用例仍按项目既有规则诚实跳过。
