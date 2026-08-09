# Interaction Observability 增量规格

> 本 delta 继承 #46 冻结候选已经通过的完整 capability，并以 #66 修订 terminal replay 与 compatibility 边界；旧 #46 文档和 Review 2/2 证据保持只读。
>
> 治理记录：在任何实现写入和 worker 派发前，本 Change 已通过官方 `requirements-changed` 从 Build 回到 Spec；以下 terminal fence 与 fail-closed compatibility 边界是最终重登记契约，不是 Build 阶段的隐式漂移。

## ADDED Requirements

### Requirement: 系统必须提供版本化且隐私最小化的 InteractionEventV1

Kernel MUST 定义稳定的 `tenon-interaction-event/v1` envelope。每个事件 MUST 绑定 Change、run、冻结 workflow identity/hash、origin/current step visit、state-before/state-after hashes、actor category、surface、execution/workflow/track/pipeline/control dimensions、event、reason、trigger、effect、result、outcome、occurred time 与 non-negative duration。持久化字段 MUST 使用闭合 snake_case schema；TypeScript domain object 与 wire object MUST 通过显式 codec 转换。

`actor` MUST 只允许 `human | agent | automation | system`；envelope MUST NOT 包含 raw prompt、任意自由文本 payload/detail/metadata、credential、token、host session、绝对路径或 artifact content。未知顶层字段、非法时间/hash/duration/dimension 或不允许的 event/result 组合 MUST fail-closed。

#### Scenario: 完整合法事件被接受

- **WHEN** 调用方提供 Change、workflow hash、step visit、前后 state hash 和所有必需维度
- **THEN** codec 产生字段闭合的 `tenon-interaction-event/v1` wire event
- **AND** event id 由不含自身的 canonical event body 确定性计算

#### Scenario: 事件缺少 issue 要求的绑定字段

- **WHEN** 任一 Change、workflow hash、step visit、state-before/state-after、actor、surface、trigger、effect、result 或 duration 字段缺失或非法
- **THEN** decoder 拒绝整个事件并返回稳定 `event-schema-invalid` diagnostic
- **AND** 不得补写 `unknown` 占位后继续计分

#### Scenario: 敏感或无限制内容试图进入事件

- **WHEN** 输入带有 `prompt`、`token`、`credential`、`host_session`、`artifact`、`payload`、`detail`、`metadata` 或其他未知字段
- **THEN** 字段闭集校验拒绝输入
- **AND** 序列化输出不包含该内容的任何字节

### Requirement: v1 必须定义完整比较矩阵和稳定扩展代码

Contract MUST 能直接表达：

- execution：`interactive | afk`
- workflow mode：`default | custom`
- track kind：`built-in | free | custom`
- pipeline stage：`open | explore | spec | build | verify | ship | archive | custom`
- control stage：`assessment | admission | execution | verification | correction | revalidation | exact-resume`
- surface：`plugin-chat | cli | api-sse | dashboard`

Core `event` 与 `result` semantics MUST 保持稳定；`reason_code`、`trigger_code`、`effect_code` 与 `outcome_code` MUST 采用受限 namespaced grammar 和发布 registry。后续 issue MAY 增加合法 code 而无需替换 v1 envelope；未知扩展 code MUST round-trip，但 MUST NOT 被 completion、stale 或 safety metric 猜成已知成功语义。

#### Scenario: 初始 emitter 未覆盖全部矩阵

- **WHEN** #46 只真实运行 `interactive + default + built-in + cli`
- **THEN** contract/matrix tests 仍能构造并 round-trip 其余合法维度组合
- **AND** 不得声称 #54 的 AFK/custom/surface conformance 已完成

#### Scenario: 后续 issue 增加 reason code

- **WHEN** 一个符合 namespaced grammar、但不在初始 registry 的 reason/outcome code 被解码
- **THEN** codec 保留该 code
- **AND** scorecard 把它列入 `unclassified_codes`，而不是拒绝整个 v1 envelope或计成成功

### Requirement: Interaction log 必须是有序 append-only projection

每个 Change MAY 有 `.pipeline-interactions.jsonl`。它 MUST 是 canonical `RunRevision` / `TransitionRecord` / exact review receipt / session binding 的派生投影，MUST NOT 参与 guard、authorization、transition 或 canonical resume 决策。

事件 MUST 在同一 Change 内使用从 1 开始的连续 `sequence`，并通过 `previous_event_hash` 绑定上一行精确 UTF-8 bytes。真实 emitter MUST 在既有 change lock 内调用唯一 `appendUnderLock` adapter，使跨进程 request/ack/effect/resume 与 canonical 操作保持同一顺序。Reader MUST 区分 missing、valid 与 corrupt projection；MUST NOT 跳过坏行、静默截断或自动重写。

#### Scenario: 并发 writer 追加事件

- **WHEN** 两个进程竞争同一 Change 的 review/session 操作
- **THEN** canonical change lock 串行化操作及其 event append
- **AND** log sequence、previous hash 与 canonical state continuity 保持有序，无重复 sequence

#### Scenario: canonical 成功但 projection append 失败

- **WHEN** request、acknowledgement 或 transition 已完成 canonical commit，而 event append 发生 I/O 失败
- **THEN** canonical operation 的真实成功不得被回滚或伪装成未发生
- **AND** adapter 返回稳定 `interaction-projection-write-failed` warning
- **AND** 后续 validation 可通过 missing projection、sequence/hash gap 或 incomplete journey 报告缺口

#### Scenario: projection 文件损坏或被截断

- **WHEN** JSON 行无效、sequence 不连续、hash chain 不匹配、文件为 symlink/非普通文件或超过边界上限
- **THEN** reader fail-loud 并输出稳定 diagnostic
- **AND** scorecard 不得基于剩余“看起来正常”的行计算绿色结果

### Requirement: 现有 exact-event review journey 必须产生完整 trace

现有 `review request`、`review acknowledge`、approved transition effect 与 `session activate` valid resume MUST 投影到同一 `journey_id` 的有序事件：

1. `review.requested(success)`
2. `review.acknowledged(success)`
3. `review.effect-applied(success)`
4. `resume.validated(success)`

request/ack/effect MUST 绑定 review origin step visit；resume MUST 同时保留同一 journey identity 与恢复时 current step visit。state-before/state-after MUST 使用 canonical `RunRevision.stateDigest`；workflow hash MUST 使用 Change 冻结的 workflow plan fingerprint。缺少这些 canonical anchors 时 MUST warning 并拒绝写占位事件。

#### Scenario: exact review 正常完成并恢复

- **WHEN** 一个当前 review step 对 exact event request、确认、成功 transition，并在 effect 后重新 activate 同一 Change
- **THEN** event log 按上述四类事件排序
- **AND** acknowledgement.before 等于 request.after、effect.before 等于 acknowledgement.after、resume.before/after 等于 effect.after
- **AND** replay 把该 journey 计为 verified completion

#### Scenario: 同 state 重复 request

- **WHEN** `review request` 发现相同 phase/event 的 receipt 已 pending 且 state 未变化
- **THEN** canonical 幂等行为保持不变
- **AND** emitter 写 `review.prompt-suppressed(suppressed)`，不得再写第二个 `review.requested`
- **AND** Human Interruptions 与 same-state repeated prompt 都不增加

#### Scenario: stale acknowledgement 被拒绝

- **WHEN** decision 绑定的 state/event 已不是当前 canonical state/event
- **THEN** 不得产生 successful acknowledgement/effect
- **AND** 若该尝试被 fixture 或 adapter 观测，必须使用 `review.acknowledged(rejected)` 与 `decision.state-stale`
- **AND** accepted stale decisions 指标保持 0

#### Scenario: effect 失败

- **WHEN** approved journey 的 canonical transition 被 guard 或 I/O 拒绝且未提交 effect
- **THEN** trace 可以 `review.effect-applied(failure)` 或 `operation.failed(failure)` 结束
- **AND** 不得计为 governed completion 或 valid resume

#### Scenario: resume 绑定错误 state

- **WHEN** session activate 后的 current state hash 不等于该 journey successful effect 的 state-after hash
- **THEN** replay 产生 `invalid-resume`
- **AND** 该 journey 不得计为 verified completion

### Requirement: Replay 必须检测 projection loss、乱序与安全回归

Kernel MUST 提供 deterministic replay validator，并至少产生下列稳定 diagnostics：`sequence-gap`、`hash-chain-mismatch`、`malformed-order`、`state-discontinuity`、`accepted-stale-decision`、`same-state-repeated-prompt`、`invalid-resume`、`incomplete-success-journey`、`projection-unavailable` 与 `event-schema-invalid`。

Validator MUST 在同一 fixture/journey 内校验 Change/run/workflow/step visit 与 state continuity。任何 error diagnostic MUST 阻止该 journey 计入 verified completion。

一旦 journey 因被拒绝的 acknowledgement、失败的 effect/operation 或首次合法 `resume.validated(success)` 进入 terminal，validator MUST 在通用 anchor/time continuity 校验之后建立 terminal fence。除 journey 已完成且 codes 全部已知的幂等 `resume.validated(success)` 外，terminal 后任何 core event MUST 同时产生全局和 journey-local `malformed-order`，MUST NOT 更新 request/ack/effect/resume 成功语义，并 MUST 使先前 valid completion 失效。unknown namespaced extension code MAY 继续进入 `unclassified_codes`，但 MUST NOT 绕过该 core-event ordering fence。允许的幂等 resume MUST 保留第一次 `validResumeAt`，不得增加 completion 或改变 scorecard。

#### Scenario: 中间事件丢失

- **WHEN** fixture 删除 acknowledgement 或制造 sequence gap
- **THEN** replay 同时检测 gap/缺前驱或 incomplete journey
- **AND** negative control 以 expected diagnostic 通过，而不是被误计为有效完成

#### Scenario: acknowledgement 与 effect 乱序

- **WHEN** effect 出现在 request 之前或 acknowledgement 之后关系不成立
- **THEN** replay 产生 `malformed-order`
- **AND** 不再继续推断 valid resume

#### Scenario: 成功标记接受了 stale state

- **WHEN** successful acknowledgement 的 state-before 不等于 request state-after
- **THEN** replay 产生 `accepted-stale-decision`
- **AND** safety failure 保持独立，不得被其他成功事件抵消

#### Scenario: terminal 后出现非法核心事件

- **GIVEN** journey 已因 rejected acknowledgement、failed effect/operation 或 valid resume 进入 terminal
- **WHEN** 后续出现 request、prompt-suppressed、acknowledgement、effect、非幂等 resume 或 operation failure
- **THEN** replay 同时产生全局和 journey-local `malformed-order`
- **AND** 不执行该事件的成功语义，不得保留或推断 verified completion

#### Scenario: unknown extension code 不得绕过 terminal fence

- **GIVEN** journey 已进入 terminal
- **WHEN** 后续 core event 携带合法 namespaced grammar 但未分类的 extension code
- **THEN** code 保留在 `unclassified_codes`
- **AND** core event 仍产生 `malformed-order` 并阻止 completion

#### Scenario: 幂等 valid resume 保持第一次完成

- **GIVEN** journey 已完成合法 request → acknowledgement → effect → valid resume
- **WHEN** 同一 journey/anchors/effect state 后再次出现 codes 全部已知的 `resume.validated(success)`
- **THEN** replay 不产生 `malformed-order`
- **AND** `validResumeAt` 保留第一次时间，completion 与 scorecard 不重复增加

### Requirement: 本地 JSON Scorecard 必须使用固定指标语义

`tenon interaction scorecard <fixture-dir> --json` MUST 只读加载普通、非 symlink、有界大小的 fixture manifest 与事件文件，按 fixture id 稳定排序，输出 `tenon-interaction-scorecard/v1`。输出不得包含当前机器绝对路径或非确定性生成时间。

Measurement cohort MUST 计算：

- Governed Completion Rate = 无 error diagnostic 且完成 request→ack→effect→valid resume 的 journeys / 出现首个 successful request 的 journeys。
- Human Interruptions per Verified Completion = 实际交付的 `review.requested(success)` 数 / verified completions；suppressed repeat 不计。
- Median Time to Valid Resume = 每个 verified completion 的首个 request 到 valid resume 的 UTC 毫秒差的中位数；偶数样本取中间两值平均。

分母或样本为 0 时 ratio/median MUST 输出 `null`。Scorecard MUST 另外输出 event completeness、accepted stale decisions、same-state repeated prompts、invalid resumes、diagnostic counts 与 unclassified codes；MUST NOT 把 safety failures 藏进加权 composite score。

#### Scenario: 正向和失败 fixtures 一起计算

- **WHEN** measurement cohort 同时包含成功、stale-rejected、suppressed-repeat、effect-failure 与 delayed-resume journeys
- **THEN** scorecard 使用固定分子分母产生确定性 JSON
- **AND** stale rejection 与 effect failure 保留在 started denominator，但不进入 completion numerator

#### Scenario: 没有 verified completion

- **WHEN** 所有 measurement journeys 都失败或被安全拒绝
- **THEN** Governed Completion Rate 可为 0
- **AND** interruptions-per-completion 与 median-resume 输出 `null`

#### Scenario: negative controls 与产品指标隔离

- **WHEN** manifest 中的 projection-loss 和 malformed-order fixtures 标为 `negative-control`
- **THEN** 它们必须命中 expected diagnostics
- **AND** 不进入三项产品指标或 event completeness 的 measurement 分母

### Requirement: 仓库必须提供可重放 benchmark fixtures

`tools/fixtures/interaction-events/v1/` MUST 至少包含 positive、stale-decision、repeated-prompt、failure、resume、projection-loss 与 malformed-order fixtures。Manifest MUST 定义完整 comparison matrix、每个 fixture 的 mode、expected validity/diagnostics 与稳定文件顺序。

#### Scenario: 初始 fixture 集通过 conformance

- **WHEN** scorecard CLI 重放已跟踪 fixture 目录
- **THEN** positive/repeated/resume 可以完成，stale decision 被拒绝，failure 不完成
- **AND** accepted stale decisions 为 0
- **AND** same-state repeated prompts 为 0
- **AND** projection-loss 与 malformed-order negative controls 被准确检测

#### Scenario: fixture 含 prompt 或 secret-shaped 字段

- **WHEN** fixture 事件尝试增加 prompt、credential、token 或 artifact body
- **THEN** codec 在读取边界拒绝该 fixture
- **AND** scorecard 不输出该值

### Requirement: 公共契约、架构门和分发资产必须同步

Kernel public barrel MUST 导出 interaction contract/replay/scorecard/store ports；CLI bundle MUST 包含 `interaction scorecard` 命令。`tools/check-architecture.mjs` MUST 把 `packages/kernel/src/interaction/` 视为纯 domain，拒绝 Node API、CLI/server/channel 反向依赖和文件长度违规。

`docs/CONTRACT.md` MUST 记录 projection path、source-of-truth、wire schema、failure semantics 与 CLI JSON；`docs/TEST-REALITY.md` MUST 记录实际 fixture、unit/integration/concurrency/bundle coverage 和真实 skip。tracked `packages/cli/dist/tenon.mjs` MUST 只由 `npm run bundle` 生成并通过 freshness/smoke。

#### Scenario: 旧 Change 仅缺少 interaction projection

- **WHEN** 新 runtime 读取一个没有 `.pipeline-interactions.jsonl`、但 canonical review 证据按其独立契约验证的旧 Change
- **THEN** projection 的缺失本身不得参与 acknowledgement 或 transition 授权判断
- **AND** interaction reader 报 `projection-unavailable`，不得把 missing 当空且完整

#### Scenario: 架构检查扫描 interaction domain

- **WHEN** interaction contract/replay/scorecard 误导入 `node:*`、CLI、server 或 channel 内部实现
- **THEN** `npm run check:architecture` 失败
