# Task Planner Skill Invocation Evidence Verify 失败报告（第二轮）

## 冻结基线与结论

- Change：`task-planner-evidence`
- PR base：`7a46dfdc511e20609a4a3c8a57a8487ff755a5b6`
- build SHA：`4cb81bfb77a81026551326cf4d30cad953616bec`
- 结论：**FAIL**。完整测试与浏览器消费证据均为绿色，但独立源码复核确认 2 Critical、2 High；不得以局部或全量测试通过代替这些生产语义缺口。

## 阻断发现

### Critical 1：shown hard-gate 未回答仍可 completed

`packages/kernel/src/skill-invocation/domain.ts` 只约束 terminal 唯一性，没有要求已记录的 shown hard-gate 必须存在非空 user-answer；`repository.ts` 的 completion verifier 也未补上该聚合不变量。独立复核用真实投影得到 `status=completed, questions=1, decisions=0`。

修复边界：terminal append 前要求每个 shown hard-gate 都有匹配的非空 user-answer；未显示的 routine/advisory 如采用默认，必须有匹配且通过冻结策略验证的 recommended-default；补 repository 负向回归。

### Critical 2：abort-aware runner 的 shutdown 被误记为 failed/retry

`packages/automation/src/scheduler/scheduler-execution.ts` 仅在 `runChange` 正常 resolve 后检查 `signal.aborted`。典型 abort-aware runner 会直接 reject，后置检查不可达；catch 对原始异常分类，最终 durable RunRecord 与 AFK SkillInvocation 走 failed/retry，而不是 interrupted。

修复边界：catch 在不可逆 merge 特例之后，优先按 controller signal 将 shutdown 规范化为 `SchedulerInterruptedError`；新增 rejecting runner 的 shutdown 测试，并同时断言 durable terminal 与 invocation 都是 interrupted。

### High 1：document record 误变为 Codex-only

`packages/cli/src/commands/document.ts` 注释声称 native PostToolUse 是 fast path，但实现无条件要求 `reconcileCodexSkillEvidence(...).confirmedSkillIds`。v2 confirmation 与 kernel document producer 又只接受 Codex receipt、`CodexSkillReadBinding`，因此 native/Claude 的 `Skill:` 证据永远不能登记文档。

修复边界：恢复 host-neutral 的 exact StepVisit confirmation 契约；Codex transcript adapter 与 native PostToolUse adapter 分别产出同一内部确认，document command 依赖该抽象而不是强制 Codex。

### High 2：QuestionEvent / DecisionEvent 没有生产 writer

非测试生产调用只覆盖 native-task-plan、AFK、document 的 started/terminal 与 document artifact；`question-recorded`、`decision-recorded` 只存在于 codec/domain/tests/fixture。实际提问与 AFK frozen default 因而无法持久化，Dashboard 的这些状态目前只能由 fixture 展示。

修复边界：把宿主 AskUserQuestion/request_user_input、AFK frozen-default 与 native producer 接到受信任 application command，绑定 invocation/StepVisit；保持 raw append 非公开且 fail closed。

## 已通过但不足以覆盖失败的证据

- 独立 focused E2E：15 files、97 pass、0 fail；261 skips 均为 `-t` 未选用例。
- 完整 root：348 files、6200 pass、26 honest skips、0 fail，exit 0；长尾为 `release-store.integration` 真实恢复/补偿测试（142.3s），不是句柄泄漏。
- Dashboard：89 files、1642 pass、0 fail，exit 0。
- OpenSpec isolated archive：strict validate 38 pass、0 fail；真实主规格在隔离操作前后未写入。
- 唯一 browser owner：production empty、loading、ready 四状态、error/retry、zh/en、1024/1440/1920、键盘/焦点与单请求行为 PASS；七张截图。既有 `ContextBundlePreview` 在 macOS 返回 `501 CONTEXT_BUNDLE_TRUSTED_READER_UNAVAILABLE`，如实保留，非本卡回归。
- Codex CLI 的直接 5.55 MB stdin 审查因 1 MiB 输入上限失败；改为只读仓库检查后确认上述缺陷，但在有界收尾时被中断，按 degraded/unavailable 记录，不冒充独立 PASS。

## 决策

按精确 `verify-fail` review event 登记并回 Build。先补四组 RED，再修复并跑定向 GREEN、必要全量、独立复审；随后重新冻结新 build SHA 并进入下一轮 Verify。
