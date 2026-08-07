# Dashboard TaskPlan Verify 报告

## 结论

PASS。最终冻结基线 `1e45db9af1a3737ced608eac044d7a4facc1af9b` 的完整交付面经主线程
Standards + Spec 审查、测试、真实运行时浏览器验收和 OpenSpec 隔离应用演练后，无
Critical / High / Medium finding。第一轮 Verify 发现的 Vitest test discovery 缺口已按正式
`verify-fail -> build -> build-complete` 回路修复并在标准 suite 中复验。

用户明确要求 `luna_worker` 和其他自定义 worker 只负责实施；本报告中的任务拆解、复杂性判断、
代码 review、finding 分级和最终验收全部由主线程完成。Luna 仅在独立 worktree 中执行
`taskPlanPresentation.test.ts -> taskPlanPresentation.test.tsx` 的机械改名；主线程确认唯一 `R100`
且无内容变化后才接受。

## 冻结基线与审查范围

- PR base / PR4 merge commit：`285f042b4edb6edf4e866b4ce93d75a772d4d195`。
- `build_sha` / Git HEAD：`1e45db9af1a3737ced608eac044d7a4facc1af9b`，精确一致。
- 完整区间：111 files，4779 insertions、122 deletions；`git diff --check` 通过。
- Verify 前后排除 `openspec/changes/dashboard-task-plan/**` 的实现、配置、生成物和 release asset
  漂移为空；真实 `openspec/specs/**/spec.md` digest 保持不变。
- 逐文件检查涵盖 AGENTS 规则、Change 文档/ledger、严格 TaskPlan client、TaskPlan/WorkItem UI、
  Skill evidence、只读 TaskRun、TaskDetail 装配、Workflow policy runtime、i18n 与 dist release assets。
- 变更区间常见 secret pattern 扫描为空。

## 两轮 Verify

### 第 1 轮：FAIL

- 冻结 SHA `fe3a02d1fddbead4292e5429a2493a6c3dd04ba7`。
- 主线程发现 `taskPlanPresentation.test.ts` 不匹配 Dashboard Vitest 的 `src/**/*.test.tsx`，显式执行
  返回 `No test files found`；此前 96 files / 1735 tests 不包含该文件。
- 该问题按 Medium 测试完整性阻塞项处理，报告见
  `docs/superpowers/reports/2026-08-07-dashboard-task-plan-verify-fail-1.md`，并走真实 `verify-fail` 回 Build。

### 第 2 轮：PASS

- 修复是唯一 `R100` 改名，断言、配置、生产代码和协议均未变化。
- 定向：`npx vitest run --config packages/dashboard-app/vitest.config.ts
  src/taskPlan/taskPlanPresentation.test.tsx --minWorkers=4 --maxWorkers=4`：1 file、2/2 tests，exit 0。
- 冻结前 Dashboard 全量：97 files、1737/1737 tests，exit 0；新增文件已出现在标准收集清单。
- 冻结后 Dashboard 全量：97 files、1737/1737 tests，exit 0。
- `npm run typecheck:web`：冻结前后均 exit 0。
- `npm run build`：冻结前 exit 0；web/server/CLI bundle 成功，构建后工作树无产物漂移。
- `npm test -- --minWorkers=4 --maxWorkers=4`：冻结前 374 files、6462 passed、14 skipped，exit 0；
  skip 均是仓库声明的真实凭据/real-Codex 条件门。
- 冻结后 API 定向：TaskPlan、TaskRun、TaskRun operations、SkillInvocation routes 共 4 files、
  26/26 tests，exit 0。

最终冻结提交在这些机器验证后只增加 Change 治理证据与主线程 review 记录，没有改变生产或测试实现；
冻结后又重新运行 Dashboard 全量、typecheck 和 API 定向，证明测试 discovery 修复已进入当前 suite。

## 主线程完整 Review

- 严格 client：closed decoder、稳定错误码、节点/文本/数组预算、canonical/legacy 语义和未来状态
  fail-closed；37 项 client 测试通过。
- 状态与恢复：loading、ready、empty、filtered-empty、stale、error、unknown、retry 均有真实实现；
  refresh 尚未失败时不提前标 stale，失败后保留缓存并给出恢复路径。
- 权威边界：前端不计算 waves、resource serialization 或 operation availability；TaskRun read-only 视图
  即使 DTO 声明 retry/cancel/resume 也不渲染写操作、不发 POST。
- 详情与证据：WorkItem identity/relationships/coverage、Skill inputs/outputs、Question/Decision、artifacts、
  validators 使用结构化允许字段，不恢复 raw prompt/answer/output。
- Workbench：configured/frozen/effective/drift 为 snapshot 只读事实，不污染正交编辑 payload。
- i18n/a11y：新文案 zh/en 完整，语义控件、可见 focus、非颜色状态表达和焦点返回符合规格。
- release assets：最终源码在 Build 冻结前重建；Verify 不在真实工作区重写 tracked bundle。
- 复杂性：保留 396 行既有 `TaskDetail.tsx`，用 46 行单职责协调组件接线；不为行数偏好拆散同一
  closed wire contract，也不为非验收路径扩大范围。

主线程结论：Critical / High / Medium = 0。`agent_review_result` 与 `codex_review_result` 表示对应
review 关注面已由主线程完整覆盖，不声称运行了被用户禁止的 reviewer subagent 或外部 Codex review。

## 真实浏览器验收

- Runtime：`http://127.0.0.1:18795/`，Tenon `1.0.1`，PID `84336`；`/api/health` 返回 ok。
- 全部验收复用同一个项目专用 Playwright owner/session；未新建 per-check browser。
- 第 1 轮完整状态矩阵：真实 legacy/unknown 与 no-run empty；fixture 仅用于 UI 状态验收，覆盖 canonical
  identity/coverage、dependency cycle、resource conflict、projection drift、blocked admission、waves、attempt、
  invalidation、validator、loading、initial error retry、cached stale retry；fixture 不冒充后端证明。
- 第 2 轮清除 route fixtures 后重载真实后端：legacy projection 可见；1024/1280/1440/1920px 均满足
  `documentElement.scrollWidth === innerWidth`。
- 1024px 键盘路径：筛选“覆盖矩阵”后精确 1 项；焦点到 WorkItem 后 Enter 打开；焦点到关闭按钮后
  Enter 关闭；焦点精确回到 `task-plan-item-legacy-display-0005`，外层 Change 详情仍打开。
- zh/en：同一运行时从 English 切换中文后，导航与设置即时变为中文；计划中的用户内容保持原文。
- 截图：第 1 轮 `pr5-task-plan-1920.png`、`pr5-task-plan-1440.png`、`pr5-task-plan-1280.png`、
  `pr5-task-plan-1024.png`、`pr5-canonical-task-plan-1024-en.png`、`pr5-workbench-policy-1024-en.png`；
  第 2 轮 `pr5-r2-task-plan-1024-zh.png`。均位于仓库外的 Playwright 输出目录。

控制台的真实 501 context-bundle preview 是已知平台能力不可用，UI 显示安全 unavailable；真实无
TaskRun 的 404 被 client 映射为 intentional empty。历史 fixture 产生的 500 仅属于第 1 轮错误恢复
测试，不作为真实后端 finding。

## 逐文件规范回读

| 文件组 | capability / 规范 | 结果 |
| --- | --- | --- |
| `AGENTS.md`、Change workflow/ledger、proposal/design/tasks/REVIEW/report | 项目 agent 规则、`dashboard-task-plan`、document governance | 通过；worker 仅实施，主线程 review。 |
| `src/api/taskPlanClient*` | `task-plan-contract`、`dashboard-task-plan` | 通过；strict decoder 与预算完整。 |
| `src/taskPlan/**` | `dashboard-task-plan`、`task-plan-contract` | 通过；测试已被标准 suite 收集。 |
| `TaskPlanEvidenceSection*`、`TaskDetail*`、`SkillInvocationEvidenceCard*` | `dashboard-task-plan`、`skill-invocation-evidence` | 通过；scope、隐私与焦点路径一致。 |
| `TaskRunPanel*` | `task-dag-scheduler`、`dashboard-task-plan` | 通过；只读接线不复制调度。 |
| `WorkbenchView*`、`WorkflowPolicyRuntimeSummary*` | `workflow-decomposition-policy`、`frozen-workflow-definition-status` | 通过；runtime facts 与编辑边界正交。 |
| `translations.ts`、`dist/**` | `dashboard-ui-ux-system`、`dashboard-task-plan` | 通过；zh/en、状态与发布构建一致。 |

## OpenSpec 隔离应用演练

- OpenSpec CLI：`1.6.0`。
- 真实 worktree：`openspec show dashboard-task-plan --json --deltas-only` 成功，输出 12240 bytes；
  `openspec validate dashboard-task-plan --strict` 通过。
- 隔离副本：`/tmp/pr5-openspec-verify-r2.bzLlZG`，从最终冻结 SHA 的 `git archive` 创建。
- 副本 `openspec archive dashboard-task-plan --yes --json` 成功：8 added、0 modified/removed/renamed。
- 副本 `openspec validate --all --strict`：42 passed、0 failed。
- 真实 main spec digest 前后均为
  `83fc0ded7e0152a92b12e0c636b53422d28aaf6c50de97c79342e1fbde230ee1`，无 Verify 写入。

## 剩余风险

- 嵌套 WorkItem 详情打开时单次 Escape 会同时关闭外层 Change 详情；规格要求的关闭按钮纯键盘路径
  已通过，故保留为 Low、非阻塞，不按用户要求之外扩大改动范围。
- context-bundle preview 在当前 macOS trusted-reader 能力下返回 501；这是现有平台能力边界，不影响
  本 Change 的 TaskPlan/TaskRun/Skill evidence 只读功能。
- 未启动 reviewer/design-reviewer subagent，也未把复杂性与 finding 分级交给 Luna；这是用户明确的
  角色规则，不把未运行的外部 agent 冒充证据。
