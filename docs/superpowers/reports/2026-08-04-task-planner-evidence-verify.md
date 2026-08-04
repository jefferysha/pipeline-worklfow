# Task Planner Skill Invocation Evidence 验证报告

## 冻结基线与结论

- Change：`task-planner-evidence`
- PR base：`codex/task-plan-contract-20260803`（起始 SHA `7a46dfdc511e20609a4a3c8a57a8487ff755a5b6`）
- build SHA：`82f3eb9ae6d6e51417648918ac7c241af4972795`
- 结论：**PASS**。完整冻结 diff 的独立复审为 Critical 0 / High 0 / Medium 0；root、Web、production build、五 fixture oracle、OpenSpec 与浏览器消费闭环均通过。

## 三轨聚合

### Reviewer 轨

独立 reviewer 对冻结 diff 做了多轮全量与增量复审。最终定向实跑 7 files / 105 tests PASS，并复核最后一个 Dashboard 真实服务夹具补丁 3/3 PASS；最终结论为 Critical 0 / High 0 / Medium 0。

复审确认：

- normal document write 必须有 exact current-visit host confirmation；caller 不能覆盖 canonical path/digest/StepVisit。
- native/Claude 与 Codex v2 receipt 均汇入 host-neutral confirmation，旧 visit、重放、错 digest、未完成 invocation 与坏 binding 均失败关闭。
- shown hard-gate 必须有非空用户答案；AFK recommended-default 必须引用精确冻结策略、默认值与理由；shutdown 由 durable terminal 证明 interrupted。
- CLI test-support/harness 不再编译或发布；package subpath import 返回 `ERR_PACKAGE_PATH_NOT_EXPORTED`，`npm pack --dry-run` 仅含 `dist/tenon.mjs` 与 `package.json`。

### E2E / 行为轨

- `npm test -- --minWorkers=4 --maxWorkers=4`：exit 0；356 files passed；6228 passed、26 honest skips、0 failed（6254 total）。跳过项仅为缺 Docker/真实 Codex 凭证的显式环境用例。
- `npm run test:web`：exit 0；89 files / 1642 tests PASS。
- `npm run build`：exit 0；kernel/channel/tap/automation/CLI/server TypeScript、Dashboard production Vite、server bundle 与 CLI bundle PASS。
- `npm run oracle`：exit 0；`backend-full`、`default-effects`、`default-guard-errors`、`frontend-quotegate`、`pm-history` 五 fixture，0 处不一致。
- `npm run check:openspec`：38/38 PASS；`npm run check:architecture`：771 production files PASS；`npm run check:comments` 与 `git diff --check` PASS。
- post-build package probe：四个 test-support/harness dist 入口均不存在；source subpath import 被 package exports 拒绝；pack entryCount=2。

### Codex 轨

Codex CLI 的整段 diff stdin 审查受 1 MiB 输入上限限制，按 degraded/unavailable 记录，不冒充独立 PASS。冻结 diff 由上述独立 reviewer 全量覆盖，并由真实 root/Web/oracle/production browser 证据补足；按 Verify Skill 的降级契约设置 `codex_review_result=pass`，本报告保留该限制。

## 规格逐文件回读

冻结改动逐文件按职责映射并回读以下主规格与本 Change delta；未发现未覆盖的生产文件：

| 改动面 | 对照规格 | 结果 |
|---|---|---|
| Invocation codec/domain/repository、trusted commands、document/AFK/native producers | `openspec/changes/task-planner-evidence/specs/skill-invocation-evidence/spec.md`、`openspec/specs/interaction-and-skill-provenance/spec.md` | PASS |
| TaskPlanRevision、WorkItem、StepVisit 与 transition binding | `openspec/specs/task-plan-contract/spec.md`、`openspec/specs/frozen-workflow-definition-status/spec.md` | PASS |
| document receipt、current-turn bridge、canonical record 与 artifact binding | `openspec/specs/document-evidence-contract/spec.md`、`openspec/specs/codex-skill-receipt-current-turn/spec.md`、`openspec/specs/declarative-document-governance/spec.md` | PASS |
| CLI/runtime bootstrap、package boundary、hooks 与架构约束 | `openspec/specs/plugin-runtime/spec.md`、`openspec/specs/plugin-distribution/spec.md`、`openspec/specs/repository-architecture-compliance/spec.md` | PASS |
| Server privacy DTO、stable 403/404、Dashboard closed decoder 与四状态消费 | `openspec/specs/dashboard-execution-provenance/spec.md`、`openspec/specs/dashboard-ui-ux-system/spec.md` | PASS |

## OpenSpec 隔离应用演练

- `npx openspec show task-planner-evidence --json --deltas-only`：exit 0，8 deltas。
- `npx openspec validate task-planner-evidence --strict`：exit 0。
- 使用 `git archive 82f3eb9a...` 建立保留 Git mode/symlink 语义的仓库外冻结副本：`/tmp/task-planner-evidence-verify.kAi33m`。
- 副本执行官方 `openspec archive task-planner-evidence --yes --json`：exit 0；`specsUpdated=true`，added=8。
- 副本执行 `openspec validate --all --strict`：38 passed、0 failed；生成的 `openspec/specs/skill-invocation-evidence/spec.md` digest 为 `c53766acb99829db879345de16b34a1eade868f1dacc106bbebc24f858e36ac4`。
- 真实工作区 `openspec/specs/**/spec.md` 的全部 digest 在演练前后完全一致；Verify 未提前应用主规格。

## Production browser acceptance

唯一 browser owner 复用同一 Playwright connector 与单 tab，未新增 Playwright/Chrome PID。production server `http://127.0.0.1:18772`（PID `16454`）完成：

- 真实 empty、8 秒 loading、ready 四状态（completed/incomplete/failed/interrupted）与 409→200 Retry。
- input/output、未显示 routine question、recommended default、frozen rule/rationale、实际 hard confirmation、用户回答、artifact/validator 均可消费。
- zh/en 与 1024×900、1440×1000、1920×1080 全部零横向溢出。
- native SUMMARY Enter/Space、Retry focus-visible、Escape 关闭并恢复触发卡焦点均通过。
- 每次显式 reload 恰一条 evidence GET；七张截图已留存于 browser owner 证据。

已知宿主限制：既有 ContextBundlePreview 在 macOS 返回 `501 CONTEXT_BUNDLE_TRUSTED_READER_UNAVAILABLE`，浏览器因此记录 resource error；这不是 Skill Invocation 回归，也不报告为 console 0。未见 PR2 JavaScript exception、warning 或非预期 evidence 请求失败。

## 剩余风险

- 本机缺 Docker，容器专项按测试内 `[HONEST SKIP]` 跳过；CI 应继续执行可用的 Docker/真实 Codex 环境作业。
- Codex CLI 大 diff 轨为 degraded，上述独立 reviewer 与完整行为门已覆盖冻结提交，但不将其描述为 Codex CLI PASS。
- macOS ContextBundlePreview 501 仍是既有宿主预览能力限制。
