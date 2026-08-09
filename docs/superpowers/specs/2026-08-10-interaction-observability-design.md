# Interaction Observability 事件、指标与基准夹具设计

## 状态与输入

- Change：`issue-46-interaction-events-metrics`
- GitHub Issue：`#46 Establish interaction events, metrics, and benchmark fixtures`
- 冻结基线：`2283992375ae5fb74b2b1ed8e1234c11ef99a1c7`
- Track / Workflow：`backend` / `default`
- 结论状态：Explore 推荐方案，待 Spec 固化字段闭集与测试矩阵

## 用户结果与硬边界

本 Change 要让一个现有 exact-event review journey 从 request、acknowledgement、effect 到 valid resume 形成完整、有序、隐私安全、可重放的事件轨迹，并从同一事件契约计算本地 JSON scorecard。它必须为 #47、#54、#57 提供稳定扩展点，但不得提前实现这些 issue 的修复状态机、Dashboard cockpit 或跨产品最终 benchmark。

硬边界：

1. canonical `RunRevision`、`TransitionRecord` 与 review receipt 仍是 workflow 唯一真相；事件日志只是可删除、可重建、可验证的 append-only projection。
2. 事件结构没有 raw prompt、自由文本 detail、credential、token、host session、绝对路径或 artifact body 的槽位。
3. canonical 操作成功后，projection 故障必须显式告警并可由 replay 诊断；不得把已经提交的状态伪装成失败，也不得反向用事件推进状态机。
4. 一次 issue 对应当前唯一 Change；本轮只 seed 较小 fixture 集，但完整比较矩阵和 code extension 机制必须在 v1 就存在。
5. 不引入 npm 依赖，不复用 `packages/channel`，不把 legacy `.pipeline-history.jsonl` 升格成新契约。

## 已验证的现状

### Canonical 状态与绑定信息

- `packages/kernel/src/state/run-revision-codec.ts` 已为每个不可变 `RunRevision` 生成 `stateDigest`，可直接作为 state-before/state-after hash，不需要再发明并行的状态序列化算法。
- `RunMetadata` 已提供 `runId`、`transitionSequence`、`workflowPlanFingerprint` 与冻结 workflow plan，可组成 Change、workflow hash 与 step visit 绑定。
- `packages/kernel/src/state/workflow-run-repository.ts` 在 change lock 内提交不可变 `TransitionRecord` 与新 revision；`TransitionApplication` 是 CLI/server 共用的唯一 transition 用例。

### Review 与 resume 切面

- `packages/cli/src/commands/review.ts` 的 request/acknowledge 都在 change lock 内验证 exact phase/event 并提交 canonical receipt；重复 request 已有 `alreadyPending` 幂等分支。
- `packages/kernel/src/workflow/transition-application.ts` 在同一 change lock 内消费 approved receipt、提交 transition，并把 history/breadcrumb 作为 best-effort projection 收尾。
- `packages/cli/src/commands/session.ts` 的 `activate --host-session` 是现有 exact session→Change 绑定与恢复入口；它不改变 workflow state。

### 不可复用的近似物

- `.pipeline-history.jsonl` 的 `raw` 是 legacy 兼容字段，现有行可包含 host session 或任意文本；它没有闭合 schema、hash chain 或场景维度，不能成为隐私安全指标源。
- `packages/channel` 是正交 worker event bus；把 pipeline interaction contract 放进去会重新引入 kernel/channel 语义耦合，并违反 channel 不驱动 pipeline 状态的既有边界。
- `TransitionRecord` 只表达 transition；request、acknowledgement 与 session resume 都不是 transition，把它们硬塞进去会污染 canonical 聚合。

## 方案比较

| 方案 | 优点 | 关键缺陷 | 结论 |
| --- | --- | --- | --- |
| 扩展 `.pipeline-history.jsonl` | 改动少、已有 writer | raw 字段不安全；旧行无版本；无法闭合校验；混淆 legacy 与指标真相 | 拒绝 |
| 复用 `packages/channel` | 已有 event/seq/store 原语 | worker bounded context 错位；增加反向依赖；channel 不是默认 runtime | 拒绝 |
| 扩展 `TransitionRecord` | 与 canonical commit 紧密 | 非 transition 事件无法表达；会让观测字段成为状态机真相 | 拒绝 |
| 新建 interaction domain + append-only projection | 契约闭合、隐私最小、可重放；可用 canonical hashes；后续 surface 共用 | 需要明确投影失败与并发顺序；新增公共 JSON 契约 | 采用 |

## 推荐架构

```text
canonical command/use case
  review request / acknowledge / transition / session activate
                 |
                 | 在同一 change lock 内捕获 canonical anchors
                 v
InteractionEventDraft (纯领域输入，无自由文本)
                 |
                 v
InteractionEventProjector ----append----> .pipeline-interactions.jsonl
                 |                              |
                 |                              v
                 +----------------------> strict replay validator
                                                |
                                                v
                                      InteractionScorecardV1 JSON
```

### 包与层级

- `packages/kernel/src/interaction/contract.ts`
  - v1 envelope、fixture、matrix、scorecard 类型。
  - 初始 event/reason/outcome code registry 和安全 extension-code grammar。
- `packages/kernel/src/interaction/codec.ts`
  - 对不可信 JSON 做字段闭集、类型、时间、hash、duration、dimension 校验。
  - 未知顶层字段和任何内容槽位 fail-closed。
- `packages/kernel/src/interaction/replay.ts`
  - 校验 sequence/hash chain、journey ordering、state continuity、stale acceptance、same-state repeated prompt、valid resume。
- `packages/kernel/src/interaction/scorecard.ts`
  - 从已验证 fixture 纯函数计算指标；negative controls 单独报告，不污染 measurement cohort。
- `packages/kernel/src/state/interaction-event-store.ts`
  - 唯一 Node/fs adapter；在调用方已持有 change lock 时读取/验证尾部并追加一行。
  - writer 自己不获取 change lock，避免不可重入；方法名和文档必须显式标记 `appendUnderLock`。
- `packages/cli/src/commands/interaction.ts`
  - `tenon interaction scorecard <fixture-dir> --json` 与只读 validation 入口。
  - CLI 只做路径/参数/错误映射，不复制 codec 或指标公式。
- 现有 `review.ts`、`transition-application.ts`、`session.ts`
  - 只在 canonical 成功切面构造 typed draft；不把指标算法写进 adapter。
- `tools/fixtures/interaction-events/v1/`
  - 正向、stale-decision、repeated-prompt、failure、resume 和两个 negative-control fixture。

## v1 Event Envelope

字段命名使用持久化 snake_case；TypeScript domain type 使用 camelCase，并由 codec 显式转换。建议持久化闭集：

```json
{
  "schema": "tenon-interaction-event/v1",
  "event_id": "sha256:<64-hex>",
  "sequence": 1,
  "previous_event_hash": null,
  "journey_id": "sha256:<64-hex>",
  "occurred_at": "2026-08-10T00:00:00.000Z",
  "change": "demo",
  "run_id": "run-id",
  "workflow": "default",
  "workflow_hash": "<stable fingerprint>",
  "step_visit": { "run_id": "run-id", "transition_sequence": 3 },
  "state_before_hash": "sha256:<64-hex>",
  "state_after_hash": "sha256:<64-hex>",
  "actor": "agent",
  "surface": "cli",
  "execution_mode": "interactive",
  "workflow_mode": "default",
  "track": "backend",
  "track_kind": "built-in",
  "pipeline_stage": "verify",
  "control_stage": "verification",
  "event": "review.requested",
  "reason_code": "review.required",
  "trigger_code": "review.exit-requested",
  "effect_code": "review-gate.pending",
  "result": "success",
  "outcome_code": "review.requested",
  "duration_ms": 12
}
```

### 身份与顺序

- `event_id` 是排除自身后的 canonical event body hash；不依赖随机数，fixture 与重放可复现。
- `previous_event_hash` 绑定上一行的精确 UTF-8 bytes；首行是 `null`。
- `sequence` 在同一 Change 内严格从 1 递增。所有真实 emitters 必须持有同一 change lock，因此跨进程也只有一个顺序。
- `journey_id` 由 `change + run_id + origin step_visit + exact review event + review_requested_at` 组成的最小 canonical facts 哈希产生；不得包含 prompt 或 host session。
- request、acknowledgement 与 effect 使用发起 review 的 origin `step_visit`。resume 仍沿用同一 `journey_id`，但 envelope 的 `step_visit` 记录 resume 当下的 visit，使“来源 visit”和“恢复位置”都可从 trace 判断。

### Actor 与隐私

`actor` 只记录 `human | agent | automation | system` 类别，不记录用户名、邮箱、token、session id 或原始输入。`surface` 只记录投影边界，不记录 URL、header 或页面内容。v1 不提供 `metadata`、`detail`、`payload` 或任意 key/value 扩展字段。

### 可扩展代码

- `event` 与 `result` 是指标依赖的稳定核心枚举；新增核心语义必须做兼容评审。
- `reason_code`、`trigger_code`、`effect_code`、`outcome_code` 使用受限 namespaced code grammar，v1 发布初始 registry，但 codec 允许安全的新 code。这样 #54/#57 可增加场景语义而无需替换 envelope schema。
- 未知 extension code 会保留并显示为 `unclassified` 聚合，不会被当成成功、stale 或 completion。

## 初始事件词汇

| event | 语义 | 允许结果 |
| --- | --- | --- |
| `review.requested` | 首次成功写入 exact pending receipt | `success` |
| `review.prompt-suppressed` | 同一 state/phase/event 已 pending，重复 prompt 未再次交付 | `suppressed` |
| `review.acknowledged` | exact decision 被接受或因 state/event stale 被拒绝 | `success`, `rejected` |
| `review.effect-applied` | approved receipt 对应 canonical transition 的 effect | `success`, `failure` |
| `resume.validated` | session 绑定后恢复到 effect 后可信 state | `success`, `rejected` |
| `operation.failed` | 已知 journey 内命令失败且没有越过 canonical guard | `failure` |

初始 reason/outcome codes 至少包含：

- `review.required`
- `review.same-state-repeat`
- `decision.accepted`
- `decision.state-stale`
- `effect.applied`
- `effect.failed`
- `resume.valid`
- `resume.state-mismatch`
- `projection.sequence-gap`
- `projection.hash-mismatch`
- `projection.malformed-order`

## 完整比较矩阵

每个 event 都必须携带下列维度，而不是让 Dashboard 或 benchmark 通过路径猜测：

| 维度 | v1 值 |
| --- | --- |
| execution | `interactive`, `afk` |
| workflow | `default`, `custom` |
| track kind | `built-in`, `free`, `custom` |
| pipeline stage | `open`, `explore`, `spec`, `build`, `verify`, `ship`, `archive`, `custom` |
| control stage | `assessment`, `admission`, `execution`, `verification`, `correction`, `revalidation`, `exact-resume` |
| surface | `plugin-chat`, `cli`, `api-sse`, `dashboard` |

本 Change 的真实 emitter 只证明 `interactive + default + built-in + cli` 的 exact review journey；fixture 可 seed 少量额外维度。其余值必须由 contract、matrix test 和未知组合 round-trip 证明可表达，实际 conformance 留给 #54。

## 事件状态机与诊断

```text
review.requested(success)
   |-- review.prompt-suppressed(suppressed) --回到 pending，不增加人工打断
   |-- review.acknowledged(rejected, state-stale) --安全终止
   `-- review.acknowledged(success)
          |-- review.effect-applied(failure) --失败终止
          `-- review.effect-applied(success)
                 `-- resume.validated(success) -- verified completion
```

Replay 必须产生稳定 diagnostic codes：

- `sequence-gap`：非连续 sequence。
- `hash-chain-mismatch`：上一行 bytes 与 `previous_event_hash` 不匹配。
- `malformed-order`：ack/effect/resume 没有合法前驱或同一 journey 倒序。
- `state-discontinuity`：相邻因果事件的 before/after hash 不连续。
- `accepted-stale-decision`：state 已变化却记录成功 acknowledgement/effect。
- `same-state-repeated-prompt`：第二个实际 `review.requested` 在同 state 再次交付；`review.prompt-suppressed` 不计入。
- `invalid-resume`：没有成功 effect，或 resume state 不等于 effect 后 state。
- `incomplete-success-journey`：声明成功的 journey 缺 effect/resume。

## Scorecard 语义

输出 schema 为 `tenon-interaction-scorecard/v1`，按 fixture id 稳定排序，不写当前机器路径或非确定性生成时间。

1. Governed Completion Rate
   - 分母：measurement cohort 中出现首个 `review.requested(success)` 的 journey 数。
   - 分子：同一 journey 经过 successful acknowledgement、successful effect 和 `resume.validated(success)`，且 replay 无 error diagnostic 的数量。
2. Human Interruptions per Verified Completion
   - 分子：measurement cohort 中实际交付的 human-authority request 数，即 `review.requested(success)`；suppressed repeat 不计。
   - 分母：上述 verified completion 数；分母为 0 时输出 `null`，禁止用 0 掩盖失败。
3. Median Time to Valid Resume
   - 每个 verified completion 使用首个 request 的 `occurred_at` 到 valid resume 的 UTC 毫秒差。
   - 偶数样本取中间两值算术平均；无样本输出 `null`。

辅助 guardrail 同时输出：event completeness、accepted stale decisions、same-state repeated prompts、invalid resumes 和 diagnostic counts。Safety diagnostics 永不折进一个加权总分。

## Fixture 设计

`tools/fixtures/interaction-events/v1/manifest.json` 定义 schema、完整维度与 fixture 清单。每个 fixture 是一个闭合 JSON object：

- `mode: measurement | negative-control`
- `expected.valid`
- `expected.diagnostics`
- `events[]`

至少包含：

1. `positive.json`：request → ack → effect → resume。
2. `stale-decision.json`：stale acknowledgement 被拒绝，accepted stale 数仍为 0。
3. `repeated-prompt.json`：重复 request 被 `review.prompt-suppressed` 表达，实际重复 prompt 数为 0，之后正常完成。
4. `failure.json`：effect 明确失败，不算 governed completion。
5. `resume.json`：跨时间间隔后在同一 effect state valid resume。
6. `projection-loss.json`：negative control，sequence/hash-chain gap 被检测。
7. `malformed-order.json`：negative control，effect/ack 顺序错误被检测。

Negative controls 只证明检测器，不进入三项产品指标分子分母。

## 并发、失败与恢复

- request/acknowledge 已持有 change lock；event append 在 canonical write 后、释放锁前执行。
- transition event append 放在 `TransitionApplication` 的 `runRepo.transact` callback 内，紧跟 commit；CLI/server 共享同一顺序。
- session activate 成功完成 exact Change binding 后，显式取得 change lock，读取 current revision，再追加 resume event。
- event append 是 projection 收尾：失败返回结构化 warning，canonical 操作仍按真实结果返回。下次 replay 通过 sequence/hash/order/expected journey 诊断缺口。
- event file 解析必须有普通文件/非 symlink、单行与总字节上限；损坏时 fail-loud，禁止跳过坏行继续计分。
- 不自动修复、截断或重写 event log。若未来需要 rebuild，必须由独立显式 projector 从 canonical revisions 生成新文件，并保留诊断；不属于 #46。

## 文件所有权与 worker 边界

实现 worker 可修改：

- `packages/kernel/src/interaction/**`
- `packages/kernel/src/state/interaction-event-store.ts` 及对应测试
- `packages/kernel/src/index.ts`、`packages/kernel/src/state/index.ts`
- `tools/check-architecture.mjs`（把 `packages/kernel/src/interaction/` 纳入纯领域 Node-import 门）
- `packages/cli/src/commands/interaction.ts`、相关 `review.ts` / `transition.ts` / `session.ts`
- `packages/cli/src/deps.ts`、`main.ts`、`program.ts`、`integration-harness.ts` 及定向测试
- `tools/fixtures/interaction-events/v1/**`
- `docs/CONTRACT.md`、`docs/TEST-REALITY.md`、CLI usage 文档和受控 `packages/cli/dist/tenon.mjs`

非目标和禁止项：

- 不改 `packages/channel/**`、Dashboard UI、server API/SSE DTO、workflow manifest 或 review receipt canonical fields。
- 不引入依赖，不改发布 workflow，不安装/更新本机插件，不手改 dist。
- 不替根代理 review 自己的改动，不增加第三次 review 尝试。

## 验证策略

中途只跑定向测试：

- interaction codec/replay/scorecard 单元测试。
- event store 并发、损坏、projection failure 测试。
- review journey CLI integration test，证明 request/ack/effect/resume 四类事件顺序与 state hashes。
- scorecard CLI integration test，重放七个 fixture 并断言三项指标及 negative-control diagnostics。

实现稳定后只跑一次完整最终门：`npm test`、`npm run build`、`npm run check:architecture`、`npm run check:comments`、`npm run check:default-workflow-freshness`、`bash tools/test-bundle.sh`，以及受影响的 release/repository/docs freshness checks。无 UI 变更，因此不启动浏览器；Docker/AFK 真实运行不是本 Change 的 emitter 验收，明确 skip。

## Decision Log

1. 采用独立 interaction projection，而不是扩展 history/channel/TransitionRecord。
2. state hash 复用 canonical `RunRevision.stateDigest`，workflow hash 复用冻结 plan fingerprint。
3. 所有 emitter 在 change lock 内追加，顺序与 canonical 操作串行一致。
4. v1 不允许自由文本或任意 metadata；扩展通过受限 namespaced codes 与既有维度值完成。
5. repeated-prompt fixture 表达“尝试被抑制”，因此基准中的实际 same-state repeated prompts 保持 0。
6. negative controls 与 measurement cohort 分离，检测能力不会污染产品指标。

## Grill 红队问题与结论

1. **谁拥有事件语义，为什么不是 CLI？**
   - kernel interaction domain 拥有 envelope、ordering、metrics 与 diagnostics；CLI 只知道本次 adapter 的 actor/surface。证据是现有 `TransitionApplication` 已把 CLI/server 的状态用例下沉到 kernel，同一原则应继续维持。
2. **如果当前 Change 缺 `stateDigest` 或 workflow fingerprint 怎么办？**
   - 不写 `unknown` 占位，也不降级到 YAML hash；emitter 返回 projection warning，canonical 操作保持真实成功，scorecard 把该 journey 视为无可信事件。旧 Change 行为不被伪造升级。
3. **如果 event append 在 canonical commit 后失败怎么办？**
   - 不回滚已经提交的 canonical state，不返回虚假业务失败；保留稳定 warning，后续通过缺文件、sequence/hash chain 或 incomplete journey 诊断。事件永远不参与授权判断。
4. **如何检测首行、尾行或整文件丢失？**
   - 首行丢失会使后继无合法 predecessor；successful effect 的尾部 resume 丢失会形成 incomplete success journey；fixture manifest 缺文件或整文件缺失是显式 projection-unavailable。等待中的真实 request 不会被误报为 loss，只有声明 terminal/fixture expectation 时才判 incomplete。
5. **未知扩展 code 会不会被错误计成成功？**
   - 不会。只有稳定核心 `event + result` 组合进入 completion/stale/repeat 公式；未知 reason/outcome 只进入 `unclassified_codes`，不会提升任何成功指标。
6. **分母为零或时间异常怎么办？**
   - ratio/median 输出 `null`；逆序/非法 ISO 时间产生 diagnostic 并排除 completion，禁止用 0 或绝对值掩盖错误。
7. **negative controls 会不会拉低产品指标？**
   - 不会。manifest 明确 `mode`，measurement 与 negative-control 分开 replay；后者只校验 expected diagnostics。
8. **actor/surface 是否会泄露身份或由 benchmark 猜测？**
   - adapter 只能传受限类别，codec 不接收任意 identity/metadata。每个 event 必带 surface/dimensions，Dashboard 与 #57 不从命令名、文件路径或文案反推。
9. **新增 interaction domain 如何受架构门约束？**
   - `tools/check-architecture.mjs` 必须把该目录加入 `DOMAIN_DIRS`；Node/fs 仅允许在 `state/interaction-event-store.ts`，kernel domain 不得导入 CLI/server/channel。

## 自检结论

- 该设计没有改变 canonical transition/review/session 权威，只增加派生投影。
- kernel interaction domain 不依赖 CLI/server/channel；Node fs 只存在于 state adapter。
- CLI 只是入站 adapter，指标公式与不变量留在 kernel。
- 新公共 JSON/JSONL 契约需要 delta spec、旧/坏 fixture、bundle 与文档同步；不需要数据迁移，因为文件是新增可选 projection。

```coverage
touches:
L1_api:      filled -> #v1-Event-Envelope, #Scorecard-语义
L2_data:     filled -> #推荐架构, #Fixture-设计
L3_rules:    filled -> #事件状态机与诊断, #Scorecard-语义
L4_state:    filled -> #推荐架构, #并发失败与恢复
L5_errors:   filled -> #事件状态机与诊断, #并发失败与恢复
L6_security: filled -> #Actor-与隐私, #用户结果与硬边界
L7_perf:     filled -> #并发失败与恢复
L8_deps:     filled -> #方案比较, #包与层级
L10_terms:   filled -> #v1-Event-Envelope, #完整比较矩阵
```
