# Task Planner / Skill Evidence 代码库研究

> 日期：2026-08-03<br>
> Track：backend<br>
> 范围：只研究 `SkillInvocation` / `QuestionEvent` / `DecisionEvent` / `ArtifactBinding` 如何复用现有证据与 identity；不设计 Workflow 策略 UI，不扩展 DAG 调度。

## 结论摘要

**事实**：当前 Tenon 已有五组可复用原语，但尚没有一份能把它们串起来的通用 Invocation 证据协议：

1. Codex receipt bridge 能严格证明“受信 Skill 资产被某个宿主 session / turn / call 完整读取且调用成功”；
2. `.pipeline-history.jsonl` 把完成态降维成 `Skill:` / `CodexSkillRead:` 字符串，供 phase Skill gate 与 document producer gate 消费；
3. document ledger 对文档 digest、producer 和读取 visit 有强绑定；
4. canonical `WorkflowRun` 具有稳定 `runId + transitionSequence`，已经足以定义 `StepVisit`；
5. AFK ledger 具有 `attempt_id + reservation_id + workflow_run_id + workflow/step/track/coordinate_digest`，已经足以绑定自主执行。

**事实校准**：本次“PR1 首次登记被拒绝”的真实根因不是 pre-init bootstrap，而是 transcript discovery 只检查 128 个目录项；当前用户目录中合法 transcript 已超过该上限，最新 host-session 文件未进入候选。该问题已在 PR1 的治理前置修复中把合法 transcript 数量预算与既有 4096 元数据预算对齐，同时保留最新 32 候选、512 MiB 字节预算、精确 session/worktree 和 inode/mtime 防替换约束。安全门拒绝当时未发现的当前 phase 证据本身是正确行为。

**独立潜在缺口**：代码路径还表明“读取 Skill → init Change → 首次登记”的顺序无法产生可声明 receipt；这是另一个 bootstrap 绑定边界，不是本次事故根因。现有推荐编排已经是先 init/activate 再读取 producer Skill，因此本 Change 只把它记录为未来 adapter hardening 选项，不据此放宽 v1 gate。

**建议**：不要放宽 producer gate、不要允许任意 pre-init transcript。应新增通用 append-only invocation ledger，并让 bootstrap 读取先绑定一个 exact host-session/turn/call + planned Change 的一次性 intent，Change 原子创建后再 claim 到 `runId + transitionSequence=0`；或者调整 Open 编排顺序为“先原子创建 Change 并绑定 host session，再读取 phase producer Skill”。两条路线都必须保留现有 transcript、trust-root、worktree 与完整输出验证。

## 证据地图

### 1. Skill receipt：强宿主证明，弱领域投影

**事实**：pending receipt 已精确记录 `changeName`、`skillId`、受信 `skillPath`、host transcript、session、turn、tool-use identity；它本身明确不算完成证据，只有 transcript 验证成功后才向 history 追加 `CodexSkillRead`（`packages/cli/src/codexSkillReceipt.ts:27-43`, `packages/cli/src/codexSkillReceipt.ts:325-403`）。

**事实**：精确 transcript verifier 要求 session / turn / call 相等、调用 ABI 相等、目标项目或显式 sibling worktree 相等，并且存在唯一成功 output；损坏 JSON、重复 invocation/output、I/O 异常或读取中发生替换都会失败关闭（`packages/cli/src/codexTranscriptEvidence.ts:86-213`, `packages/cli/src/codexTranscriptEvidence.ts:215-248`）。受信 Skill 必须位于选定 cache、active release 或精确 development root，路径链不得含 symlink（`packages/cli/src/codexSkillTrust.ts:38-49`, `packages/cli/src/codexSkillTrust.ts:77-93`, `packages/cli/src/codexSkillTrust.ts:161-186`）；transcript 以 `O_NOFOLLOW` 打开并核对 dev/inode/size/mtime/ctime（`packages/cli/src/codexTranscriptDiscovery.ts:156-196`）。

**事实**：成功输出不是看见 `exit_code=0` 字样即可，而是解析对应 ABI 的完整 result envelope，再逐字比对所有完整 Skill 文件内容（`packages/cli/src/codexTrustedSkillRead.ts:46-60`, `packages/cli/src/codexTrustedSkillRead.ts:73-124`）。这些约束应该直接复用于 `SkillInvocation.completed` 的 Codex adapter，不应另写宽松 verifier。

**缺口**：完成后只落 `raw: "CodexSkillRead: <id>"`；history record 没有 invocation id、run id、visit id、attempt id、input/output contract 或 terminal outcome（`packages/kernel/src/types.ts:412-435`）。

### 2. 独立的 pre-init bootstrap 边界

**事实**：PreToolUse receipt hook 必须先解析 active Change；Change 尚未创建或尚未激活时直接退出，不留下 pending receipt（`hooks/codex-skill-receipt.sh:40-46`, `hooks/codex-skill-receipt.sh:55-69`）。

**事实**：Change 初始化完成后才追加 history `init`（`packages/cli/src/commands/init.ts:227-245`）。bridge 以最近 transition 或 initial `init` 的时间作为 current visit 起点（`packages/cli/src/codexSkillReceipt.ts:236-281`），并过滤早于这个时间的 pending receipt（`packages/cli/src/codexSkillReceipt.ts:346-365`）和 transcript response item（`packages/cli/src/codexTranscriptEvidence.ts:66-73`, `packages/cli/src/codexTranscriptEvidence.ts:381-389`）。

**事实**：因此顺序 `读取 phase Skill → init Change → 首次 document record` 必然丢失这次真实读取：读取时没有 Change 可登记；登记时读取又早于 visit 下界。现有 initial-step 回归只构造 `init@00:01 → Skill read@00:02` 并确认通过（`packages/cli/src/codexSkillReceipt.test.ts:1759-1779`），没有覆盖相反顺序。

**判定**：这是可复现的独立 bootstrap 绑定缺口，但不是本次 PR1 门禁拒绝的根因。`recordDocument` 在 history 未出现 current-phase producer 时失败关闭是正确的不变量（`packages/kernel/src/state/document-ledger.ts:360-363`）。任何后续修复都不得删除时间下界或接受任意旧 transcript。

**建议（优先）**：Open 编排先用入口 Skill 已决定的 Change identity 原子创建 Change、绑定 exact host session，再加载 `openspec-propose` / phase producer。这样现有 receipt 和 `runId + sequence=0` 自然成立，变更最小。

**建议（若必须 pre-init 读取）**：增加一次性 `BootstrapInvocationIntent`，至少绑定 `repo physical identity + planned changeName + hostSessionId + turnId + toolUseId + trusted skill asset digest + nonce + issuedAt`。`initChange` 成功后只能在同 session/turn 内 claim 一次到新 `runId + transitionSequence=0`；未 claim、跨 Change、跨 turn、重复 claim、时间倒退一律失败关闭。不要复用 repo-global `.pipeline-active` 或“最近 transcript”。

### 3. History 与 StepVisit

**事实**：custom workflow Skill gate 只扫描最近一次进入当前 step 后的 `Skill` / `CodexSkillRead` 字符串；malformed history line 被忽略（`packages/kernel/src/workflow/skill-evidence.ts:22-66`）。history writer 只是普通 `appendFile`，自身无 record id、codec、change lock 或关系校验（`packages/kernel/src/state/history.ts:1-18`）。它适合作为兼容投影，不适合作为新协议的 canonical ledger。

**事实**：canonical `WorkflowRun.id` 是稳定随机身份，`transitionSequence` 随每次 transition 单调推进（`packages/kernel/src/workflow/run-types.ts:21-49`）；init 把 run identity、workflow snapshot、ledger 与 state 一次性发布（`packages/kernel/src/state/workflow-run-repository.ts:85-147`），transition 则在同一 change lock 下先写不可变 record、再原子发布新 revision/head（`packages/kernel/src/state/workflow-run-repository.ts:289-369`）。

**事实**：document ledger 已把 current visit 定义为 `JSON.stringify([runId, transitionSequence])`（`packages/kernel/src/state/document-ledger.ts:136-143`）。

**建议**：把 `StepVisitId` 提升为共享值对象，而不是让 Skill bridge 用 history timestamp、document ledger 用 JSON tuple。新 Invocation subject 应至少是：

```text
subject = {
  change,
  workflowRunId,
  stepId,
  stepVisit: { runId, transitionSequence },
  attemptId?, reservationId?, iterationId?
}
```

`stepId` 便于查询，`runId + transitionSequence` 才是权威 visit identity；二者不一致时拒绝写入。

### 4. Document ledger 与 ArtifactBinding

**事实**：document record 已保存 safe project-relative path、SHA-256、producer、recordedAt 和 digest-bound reads（`packages/kernel/src/state/document-ledger.ts:43-64`, `packages/kernel/src/state/document-ledger.ts:107-134`）。内容 digest 改变会清空旧 reads（`packages/kernel/src/state/document-ledger.ts:365-372`），读取回执绑定 phase、digest 和 current visit（`packages/kernel/src/state/document-ledger.ts:450-493`）。稳定投影只在当前 digest/current visit 匹配时显示 read time，不泄露 digest/visit/session（`packages/kernel/src/state/document-evidence.ts:52-88`, `packages/kernel/src/state/document-evidence.ts:178-192`）。

**事实**：普通 `artifact register` 只把 path 写进 state；producer 只参与当次授权检查，明确“不持久化”，history 也只记普通 set（`packages/cli/src/commands/artifact.ts:15-17`, `packages/cli/src/commands/artifact.ts:108-121`）。这正是 `ArtifactBinding` 要补的缺口。

**建议**：

- 文档类 artifact 不复制文档事实；`ArtifactBinding` 引用 document record 的稳定键（kind + canonical relative path + sha256 + recordedAt），document ledger 仍是真相源。
- 非文档 file-path artifact 新增结构化 artifact ledger；至少保存 field、relative path、digest、invocationId、producer、subject、boundAt。不能继续只有 state path。
- binding 只能引用同一 subject 下已经 `completed` 的 invocation；invocation 未终局、failed/interrupted、visit/attempt 不同或当前文件 digest 不同都拒绝。
- 跨文件无法原子提交时使用同一 change lock 下的可恢复两段式记录：先 append intent，再提交 document/state，最后 append committed binding；只投影同时能回查到当前 digest/state 的 committed binding。孤儿 intent 是中断证据，不算成功。

### 5. AFK attempt / policy identity

**事实**：`ExecutionContext` 已携带 `attempt_id`、`reservation_id`、`loop_id`、change、可选 `workflow_run_id`/`iteration_id`、policy epoch 与冻结 AutomationPolicy（`packages/automation/src/admission/execution-context.ts:26-76`）。Skill bundle snapshot 进一步绑定 attempt/reservation/run/workflow/step/track/coordinate digest，但只证明“执行内容快照已物化”，不证明具体 Skill 被调用（`packages/kernel/src/loops/ledger-types.ts:109-159`）。

**事实**：reservation terminal 写入已有可复用的错误绑定与幂等原语：账本有坏行、未知/重复 reservation、重复 terminal 或 attempt/iteration/loop/change 不一致都会拒绝；第二次相同关闭返回 already-closed（`packages/kernel/src/loops/ledger-store.ts:253-295`）。

**建议**：AFK `SkillInvocation` 必须同时带 step visit 与 attempt identity。`workflow_run_id ?? attempt_id` 的兼容回退不适合新协议；新事件缺少真实 WorkflowRun 时应明确标为 legacy/non-loop subject，不能用 attempt id 冒充 run id。Invocation terminal 可复用 `closeReservationIfOpen` 的“唯一 terminal + owner fields 全匹配”规则，但不应复用 budget ledger 的 record union；二者是不同 bounded context。

**事实**：当前 AutomationPolicy 只冻结 admission/write/transition/merge、预算、kill policy、verifier 与 skill bundle，没有“哪些问题可默认、默认选项是什么”的策略维度（`packages/kernel/src/loops/automation-policy.ts:6-44`, `packages/kernel/src/loops/automation-policy.ts:121-172`）。continuous authority 只是 Change + host session 的严格投影；interactive hook 用自然语言要求把默认写入 Decision Log（`packages/cli/src/continuousAuthority.ts:1-22`, `hooks/interactive-skill-gate.sh:91-130`），还不是机器可验证的 Question/Decision policy。

### 6. QuestionEvent / DecisionEvent 与隐私最小化

**事实**：现有 question recorder 把问题和答案原文拼成 `raw="Q: ... | A: ..."`，fire-and-forget 写入 history；解析可截断转义引号，任何异常静默退出（`hooks/decision-recorder.sh:1-12`, `hooks/decision-recorder.sh:24-56`, `hooks/decision-recorder.sh:75-99`）。它既不满足隐私最小化，也不能证明 question、answer、decision 和 invocation 的关系。

**事实**：AFK 对交互 marker 有显式旁路且不清 marker（`hooks/gate.sh:26-29`）；continuous mode 也可合法抑制低风险提问（`hooks/interactive-skill-gate.sh:91-130`）。目前两条路径都没有结构化“原问题、抑制依据、采用默认值”的证据。

**建议**：新协议不保存 prompt、回答或 Skill 输出原文。建议最小字段：

```text
QuestionEvent {
  questionId, invocationId, subject,
  questionKey, questionSchemaDigest,
  optionIds, requiredness: "advisory" | "hard-gate",
  askedAt
}

DecisionEvent {
  decisionId, questionId, invocationId, subject,
  mode: "user-answer" | "recommended-default",
  selectedOptionIds,
  policyRef?: { policyId, policyVersion, ruleId },
  answerDigest?, decidedAt
}
```

- `questionKey` 与 schema digest 证明“问的是哪个契约问题”；展示文案来自版本化模板，不进 event。
- 结构化选项只存稳定 option id；自由文本答案默认只存 keyed digest/存在性，不存正文。确需可读摘要时必须是显式 sanitized summary，并有长度/字符/敏感字段约束。
- `recommended-default` 必须引用冻结 policy 及具体 rule/default option；`hard-gate` 永远不允许 default。
- 只有 matching `QuestionEvent` 才能写 `DecisionEvent`；同一 question 多 terminal decision、跨 invocation/visit/attempt 回答或 policy version 漂移一律失败关闭。
- Dashboard/API 只投影 skill id、状态、时间、question key、decision mode、selected option id 与 artifact 状态；不得投影 transcript path、host session、absolute skill path、raw prompt/answer/output 或内部 digest。

## 推荐的聚合与事件状态机

**建议**：在 kernel 的 skill-governance bounded context 新建 `SkillInvocationEvidence` 聚合和严格 codec/repository；CLI/host adapter 只负责把原生 Skill 工具或 Codex transcript 转成受验证命令，automation adapter 只补 attempt subject，server 只生成最小只读 DTO。

```text
InvocationStarted
  -> QuestionAsked -> DecisionRecorded (0..N)
  -> InvocationCompleted | InvocationFailed | InvocationInterrupted (恰好一个 terminal)
  -> ArtifactBindingIntent -> ArtifactBound (0..N，仅 completed 可绑定)
```

核心不变量：

1. 全事件具有唯一 event id、invocation id、schema version、UTC recordedAt 和完整 subject；未知字段/版本拒绝。
2. `InvocationStarted` 唯一；terminal 恰好一次，重复同值幂等、不同值冲突。
3. 没有 terminal 的 started 是 `incomplete`，进程恢复可追加 `Interrupted`，但绝不能推断 completed。
4. native/Codex proof 只保留 provenance kind + local opaque proof reference/digest；具体 transcript/path 留在 host adapter 私有存储。
5. repository 使用 change lock、严格 JSONL codec、完整行 append + fsync；坏行使写操作 degraded/fail-closed，不能像 compatibility history 一样忽略后继续铸造完成证据。
6. 旧 `Skill:` / `CodexSkillRead:` history 保留为新 ledger 的兼容投影；新 guard 切换后不得反向从 raw history 铸造 v2 Invocation。

## 事实、假设与建议边界

- **事实**：现有 receipt verifier 的安全条件足够强，应该复用而不是重写。
- **事实**：document read 已有 canonical StepVisit；Skill evidence 尚未使用它。
- **事实**：artifact producer provenance 在普通 artifact 路径上未持久化。
- **事实**：question/answer 当前保存原文，AFK/default suppression 没有结构化证据。
- **假设**：`Task Planner` 是普通 Skill，而不是新的 workflow/automation 聚合；这与本 Change 初始设计一致，但仍需 Spec 冻结。
- **假设**：同一 invocation 可以跨进程恢复但不能跨 StepVisit；如果产品要求长时间 invocation 跨 transition，subject/state machine 需要另案定义。
- **建议**：把 history 降为兼容投影，把 invocation ledger 设为唯一完成态来源；在迁移期可双写，但 v2 gate 只读 v2。

## 开放问题

1. `StepVisitId` 是否正式冻结为 `{runId, transitionSequence}` 对象，并迁移 document ledger 当前的 JSON tuple 字符串，还是只在新协议中用对象、旧 ledger 保持兼容？
2. Open bootstrap 选择哪条修复路线：调整顺序为“先 init/bind 再读 producer Skill”，还是引入一次性 `BootstrapInvocationIntent`？前者更小，后者兼容必须先读 Skill 才知道如何 init 的宿主。
3. `recommended-defaults` 的可机器验证策略归属哪里：扩展 `AutomationPolicySnapshot`，还是建立独立、同样按 digest 冻结的 `InteractionPolicySnapshot`？哪些 question key 永远是 hard gate？
4. 普通 artifact 的 canonical provenance 是新 artifact ledger，还是把 artifact record 纳入 WorkflowRun revision？这决定 state path 与 binding 的崩溃原子性和旧版本兼容策略。
5. 自由文本回答是否允许保存用户明确授权的脱敏摘要，还是一律只保存 answer digest + classification/selected option？这会影响 Dashboard 可解释性与隐私边界。
