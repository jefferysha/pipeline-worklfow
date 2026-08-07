# Task Planner Skill Invocation Evidence Verify 失败报告（第一轮）

## 冻结基线与结论

- Change：`task-planner-evidence`
- build SHA：`46ea5d92c1d126765dba2602836b344a460a707a`
- PR base：`codex/task-plan-contract-20260803`
- 结论：**FAIL**。现有库、只读 API、Dashboard 与 fixture 不能代替生产写入闭环；按精确
  `verify-fail` review receipt 回退，并以 `requirements-changed` 进入 Spec 修订后重建。

## 硬门失败

### 1. 生产调用证据未接线（Critical）

`appendSkillInvocationEvent` 仅由定义与测试引用；CLI、hook、scheduler、native runner 和 AFK
生产路径均未调用。Codex adapter 也未接入 CLI 生产入口。因此真实运行不会创建
`.pipeline-skill-invocations.jsonl`，生产 API 只能诚实返回 empty，不能满足“所有 Skill 自动证明
输入、输出、实际提问、决策、产物与 validator”的交付目标。Task Planner 当前也只有契约、测试
和浏览器 fixture，没有真实 persisted invocation。

### 2. canonical binding 可被调用者绕过（Critical）

公开的 `AppendSkillInvocationEventOptions.binding` 允许调用者提供任意 Project、WorkflowRun、
StepVisit、TaskPlanRevision、WorkItem 和 attempt；append 路径优先采用该注入值。现有 repository
测试也依赖该旁路。生产导出必须无条件从 canonical state 派生 binding，测试 seam 不能出现在公开
写 API。

### 3. 写入命令尚不能证明声明为真实（High）

started input、shown question、user answer、字段 validator 和 artifact validator 仍是 caller 声明。
completed verifier 只收到 terminal event，无法核对 started Skill/schema/input；Codex receipt verifier
证明的是精确 `SKILL.md` 读取成功，不证明 Skill 的真实业务输出。需要受信任 application command
把 started/current aggregate、host question/answer receipt、声明 schema、validator result 和 terminal
一次性核验后再写事实；raw event append 不能作为生产铸证入口。

### 4. repository fail-closed 不完整（High/Medium）

- append 只投影当前 invocation；另一个 codec-valid 但 aggregate-invalid 的 invocation 不会阻断写入。
- recommended-default verifier 未收到匹配 QuestionEvent、subject 或 started context，无法证明冻结规则
  属于原问题。
- `user-answer` 可同时没有 option 和 free-text digest，hard-gate 因而可能被“空回答”满足。
- event/ledger byte 上限只在 append 前检查，边界 append 会把 ledger 写成下一次不可读。
- question 数量未在 aggregate 约束，server 可返回 Dashboard decoder 必然拒绝的 129+ questions。
- artifact intent 未先验证安全 ref，会在 bind 前通过公共投影泄露绝对路径或私密文本。
- ArtifactBinding 没有证明 `output_id` 属于 declared output，validator 只比对 ID 是否出现，不证明
  唯一性或 pass verdict。

### 5. 规格与消费闭环不完整（High/Medium）

- `openspec validate task-planner-evidence --strict` exit 1：ADDED requirement
  “ArtifactBinding 与 validator”正文缺少 `MUST`/`SHALL`。
- Dashboard 只显示 input/output 数量和 artifact 状态，没有展示字段 classification/validator verdict、
  artifact validator 或 privacy-safe free-text 回答分类。
- server 将 Change capture 的 path-forbidden/symlink 403 错误统一折叠成 404，破坏稳定错误语义。
- Dashboard closed decoder 未复核 `step_visit.run_id === workflow_run_id`。

## 并行验证证据

- Reviewer Agent：**FAIL**；2 Critical、3 High、4 Medium、1 Low。覆盖 kernel、automation、CLI、
  server、Dashboard、OpenSpec、公共 contract、TEST-REALITY、oracle 与 bundle 可达性；未修改代码，
  未启动浏览器。
- Codex CLI frozen-commit review：**FAIL**；确认无生产写入、全 ledger corruption 未阻断、预算边界、
  question 上限、unsafe artifact ref、default/question 脱钩及空 user-answer。审查过程中其定向
  18/18 tests、`npm run typecheck:web` 与 `npm run build` 均通过；Codex 本地 logs DB/model-cache
  warning 如实保留，不影响上述源代码 finding。
- 独立 E2E（无浏览器）：backend 5/5 files、18/18 tests；frontend 3/3 files、49/49 tests，均 exit 0，
  前后 worktree implementation diff 未变化。这些通过项没有覆盖生产 caller 与 canonical bypass。
- OpenSpec：deltas-only show exit 0；strict validate exit 1，错误见上。

## 已通过但不足以覆盖失败的 Build/浏览器证据

- Repository 全量：345 files / 6180 passed / 26 honest skips；Dashboard：89 files / 1640 passed；
  root build、oracle（0 divergence）、architecture、comments、repository hygiene、docs、deps、skills、
  hooks、adapters、freshness 与 bundle 均已通过。
- 唯一 browser owner 在 production server `http://127.0.0.1:18772` 完成真实 empty、8 秒 loading、
  ready fixture 四状态、409→200 retry、zh/en、1024/1440/1920 无横向溢出、SUMMARY Enter/Space、
  Escape focus restoration 与每次 reload 单一 evidence GET；七张截图记录在 `REVIEW.md`。
- 浏览器发现的 macOS `501 CONTEXT_BUNDLE_TRUSTED_READER_UNAVAILABLE` 来自既有
  `ContextBundlePreview`，不是 Skill Invocation API；不能伪报 console 0，但也不是本轮核心失败。

## 决策

拒绝以空生产 API、fixture 或局部绿色测试代替真实证据闭环。下一轮先在 Spec 明确 trusted
application command、真实 producer 生命周期、canonical-only binding、question/answer 与 validator
receipt、artifact/output 关系和隐私投影，再在 Build 接入至少一条 interactive/Codex 与 AFK 生产路径，
用真实 persisted invocation 验收 API/Dashboard，并修复上述 fail-closed 边界后重新冻结 Verify。
