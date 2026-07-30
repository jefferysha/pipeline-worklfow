# Review Handshake 可观察性上游调研

> 调研日期：2026-07-30（Asia/Shanghai）
> 研究问题：Tenon 如何在不复制状态机、不削弱 exact-event review receipt 的前提下，让用户在
> Dashboard 看清“尚未请求 / 已请求待确认 / 已批准待消费”的 Review Handshake 状态、精确出口与下一步？

## 结论

建议交付一个只读的纵向切片：由 kernel 根据 canonical state 生成最小
`reviewHandshake` DTO，server 把它放入现有 Change snapshot，Dashboard 在当前 Change 的详情/动作区
显示三态、exact phase/event、时间与下一步说明。前端不得读取或解释原始
`review_gate_*` 字段，不新增确认写端点，也不得把 `verify-pass` 与 `verify-fail` 合并成模糊的
“已确认”。

这不是对上游审批 UI 的复制。上游共同证明了三个可借鉴模式：

1. 状态、证据与下一步应由可恢复的 canonical contract 派生，而不是靠 agent 自述；
2. 人类交互要有清晰的状态、预条件、机器可读失败和可访问反馈；
3. Dashboard 应呈现事件/阶段/证据的因果上下文，而不是只显示一条泛化提醒。

Tenon 的独特价值仍是：receipt 同时绑定 exact Change、phase 和 transition event，批准在成功
transition 后即被消费，不能授权另一个出口或未来重入。五个上游仓库中未发现这一完整语义与
Dashboard 三态观察面的组合。

## 固定版本

以下均通过 GitHub 官方 REST API 和对应仓库的固定 SHA 页面核实。默认分支 SHA 与 release/tag
分别记录，二者不相同时不混写。

| 仓库 | 默认分支与固定 SHA | 最新稳定 release/tag | 固定证据与说明 |
| --- | --- | --- | --- |
| [mindfold-ai/Trellis](https://github.com/mindfold-ai/Trellis) | `main` · [`c94d6fc289b7a6fdd9480bdfae4d4639c9ac2d4c`](https://github.com/mindfold-ai/Trellis/commit/c94d6fc289b7a6fdd9480bdfae4d4639c9ac2d4c) | [`v0.6.10`](https://github.com/mindfold-ai/Trellis/tree/v0.6.10)，tag SHA 同为 `c94d6fc…` | [`releases/latest`](https://api.github.com/repos/mindfold-ai/Trellis/releases/latest) 返回 404；按约定回退 GitHub tags 中最新的稳定语义版本 tag。 |
| [rpamis/comet](https://github.com/rpamis/comet) | `master` · [`92d418eb93ce07c95b0855b2d36da4f6fdaea92d`](https://github.com/rpamis/comet/commit/92d418eb93ce07c95b0855b2d36da4f6fdaea92d) | GitHub latest release [`0.4.0-beta.11`](https://github.com/rpamis/comet/releases/tag/0.4.0-beta.11)，API 标记 `draft=false`、`prerelease=false` | 名称含 `beta`，但 GitHub 发布元数据把它当正式 latest release；若按严格 SemVer 排除预发布标识，则最新稳定 tag 是 [`0.3.9`](https://github.com/rpamis/comet/tree/0.3.9)，tag SHA `053f76d8…`。报告保留两种口径，避免伪称。 |
| [Chorus-AIDLC/Chorus](https://github.com/Chorus-AIDLC/Chorus) | `main` · [`d590b568f40fae51f71c9800841c587a3fe94b0b`](https://github.com/Chorus-AIDLC/Chorus/commit/d590b568f40fae51f71c9800841c587a3fe94b0b) | [`v0.14.5`](https://github.com/Chorus-AIDLC/Chorus/releases/tag/v0.14.5)，tag SHA `be647877…` | 最终 freshness 复查发现默认分支已在本轮内前进；下方具体源码证据固定在稳定 release SHA `be647877…`。Release 修复了 daemon 向 Claude/Codex/Kiro 子进程传递 `CHORUS_URL` / `CHORUS_API_KEY` 的会话归属，并对 Codex 缺 MCP 配置给出显式诊断。 |
| [catlog22/maestro-flow](https://github.com/catlog22/maestro-flow) | `master` · [`5375fb589f182c1c7e9cade69b4acd3ccd03bac1`](https://github.com/catlog22/maestro-flow/commit/5375fb589f182c1c7e9cade69b4acd3ccd03bac1) | [`v0.5.58`](https://github.com/catlog22/maestro-flow/releases/tag/v0.5.58)，tag SHA `be4cf1f8…` | 默认分支已在 release tag 之后；release 固定 Run 证据、知识曝光/消费、候选晋升、只读审计与可回滚剪枝闭环。 |
| [liaohch3/claude-tap](https://github.com/liaohch3/claude-tap) | `main` · [`6cfe45afd7b6d009e839b178dd59b9e338b10309`](https://github.com/liaohch3/claude-tap/commit/6cfe45afd7b6d009e839b178dd59b9e338b10309) | [`v0.1.141`](https://github.com/liaohch3/claude-tap/releases/tag/v0.1.141)，tag SHA `547925c9…` | 默认分支已在 release tag 之后；当前 README 仍以本地 trace、结构化 diff、搜索、键盘导航和可移植导出为核心。 |

## 上游证据与映射

### Trellis：把 review context 留在任务边界

固定 [README](https://github.com/mindfold-ai/Trellis/blob/c94d6fc289b7a6fdd9480bdfae4d4639c9ac2d4c/README.md)
将 PRD、实现上下文、review context 和任务状态保存在 `.trellis/tasks/`，并以
Plan → Implement → Verify → Finish 运行。Verify 会按 specs 检查 diff 并执行 lint、typecheck、tests。

对 Tenon 的启示：

- Review Handshake 应出现在当前 Change 上下文中，而不是另建全局页面；
- 状态旁应给出确切下一步，例如“先完成产物并发起 review”或“等待确认后重发 transition”；
- Trellis 的 review context 是任务资料，不是单次 transition 授权，因此不能替代或泛化 Tenon receipt。

### Comet：canonical status + 风险驱动 review

固定 [README](https://github.com/rpamis/comet/blob/92d418eb93ce07c95b0855b2d36da4f6fdaea92d/README.md)
说明 Native/Classic 共用配置、status、Guard 和 Dashboard 入口；`comet status` 显示 phase、approval、
verification 与 next-step，`comet dashboard` 展示 active changes、phase、task progress 和 archive history。
[`0.4.0-beta.11` release](https://github.com/rpamis/comet/releases/tag/0.4.0-beta.11)
进一步把 Native independent review 改为根据实际实现范围与风险触发，高风险验证仍 fail-closed。

对 Tenon 的启示：

- server 应输出已经解释好的状态与下一步，Dashboard 不应复制 guard/receipt 推导；
- 可以把 review 状态放进现有 snapshot 和 Progress 工作区，而不是增加第二轮询面；
- Comet 的 approval 是 workflow-level 可观察字段；Tenon 仍须突出 event identity 和单次消费语义。

### Chorus：后端/共享契约、Dashboard、交互路径与具体功能

Chorus 是本轮的重点交互参考，但只能提炼模式，不能复制业务模型。
以下具体文件固定在稳定 release `v0.14.5`（`be647877…`）；默认分支的最终读取点另按上表记录为
`d590b568…`，避免把 release 源码与最新 `main` 身份混写。

#### 后端与共享契约

- [`stage-advance.service.ts`](https://github.com/Chorus-AIDLC/Chorus/blob/be647877b4b56a61e480e939d6a6d31b3f84f7f9/src/services/stage-advance.service.ts)
  定义统一的 `StageAdvanceDefinition`、`StageAdvanceContext` 和机器可读
  `StageAdvanceErrorCode`。执行顺序固定为 human actor gate → company-scoped lookup →
  precondition → offline policy → optional transition → activity emit；任一失败不产生后续效果。
- [`stage-advance-actions.ts`](https://github.com/Chorus-AIDLC/Chorus/blob/be647877b4b56a61e480e939d6a6d31b3f84f7f9/src/app/%28dashboard%29/projects/%5Buuid%5D/ideas/%5BideaUuid%5D/stage-advance-actions.ts)
  把服务错误映射成有限错误码，原始错误文本不直接暴露给客户端。
- [`proposal approve API`](https://github.com/Chorus-AIDLC/Chorus/blob/be647877b4b56a61e480e939d6a6d31b3f84f7f9/src/app/api/proposals/%5Buuid%5D/approve/route.ts)
  做认证、权限、company scope、pending precondition，再原子地批准并记录 activity/review note。

映射：Tenon 应在 kernel 建一个纯派生 formatter，输出有限枚举和 nullable 字段；server 只负责安全
投影。与 Chorus 写路径不同，本轮不创建 Dashboard acknowledge API，避免形成 CLI 之外的第二 authority。

#### Dashboard 前端

- [`proposal-actions.tsx`](https://github.com/Chorus-AIDLC/Chorus/blob/be647877b4b56a61e480e939d6a6d31b3f84f7f9/src/app/%28dashboard%29/projects/%5Buuid%5D/proposals/%5BproposalUuid%5D/proposal-actions.tsx)
  根据 proposal 状态显示 submit/approve/reject/revoke，使用对话框、note/reason、pending 禁用和刷新。
- [`yolo-button.tsx`](https://github.com/Chorus-AIDLC/Chorus/blob/be647877b4b56a61e480e939d6a6d31b3f84f7f9/src/components/yolo-button.tsx)
  将 UI precondition 仅作为乐观提示，服务端重新权威校验；离线时保持按钮可见但禁用，并用可聚焦
  wrapper + tooltip 解释；提交时显示 loading，成功/失败有 toast，误触成本高的动作先确认。
- [`yolo-request.ts`](https://github.com/Chorus-AIDLC/Chorus/blob/be647877b4b56a61e480e939d6a6d31b3f84f7f9/src/lib/yolo-request.ts)
  让两个 Dashboard 表面复用同一个 enable predicate，防止交互漂移。

映射：Tenon 三态卡片要覆盖 loading、兼容空态和 request 失败态；状态说明与 exact event 都可由键盘
访问。前端可以根据 DTO 选择文案，但不能自己判断 receipt 是否匹配当前 phase/event。

#### 交互路径

Chorus 的 stage-advance 路径是：

`Dashboard action → server action/API → auth + tenant scope + precondition → canonical mutation →
activity → agent wake → UI refresh`

其
[`daemon-headless-interaction-guard spec`](https://github.com/Chorus-AIDLC/Chorus/blob/be647877b4b56a61e480e939d6a6d31b3f84f7f9/openspec/specs/daemon-headless-interaction-guard/spec.md)
还要求 headless agent 不阻塞等待终端人类，而是通过 Chorus comment/elaboration 异步交接，随后结束 turn。

Tenon 本轮应采用更窄路径：

`canonical receipt → kernel formatter → existing snapshot → decoder → Progress current Change card`

确认仍走既有 `tenon review acknowledge` / delegated receipt；Dashboard 只解释状态。这样既获得 Chorus
“状态可见、失败可辨、下一步明确”的交互优点，又不引入第二条审批写链。

#### 具体功能点

Chorus 的
[`code-review-gateway spec`](https://github.com/Chorus-AIDLC/Chorus/blob/be647877b4b56a61e480e939d6a6d31b3f84f7f9/openspec/specs/code-review-gateway/spec.md)
要求只读 reviewer 产生结构化 PASS / PASS WITH NOTES / FAIL verdict，最后任务验证时触发 review，
FAIL 后新增 fix tasks 并在有界轮次内复核，超限交还人类。其价值在于 review 状态、触发点和恢复动作
都显式化。

Tenon 不应复制 reviewer loop；应把已有的 receipt 事实显式化：

- `not_requested`：当前可能处于 review phase，但尚无匹配当前 phase 的 canonical request；
- `pending`：显示精确 event、requested time 和“等待确认”；
- `approved`：显示同一 exact event、acknowledged time 和“可重发该 transition”；
- legacy/不完整 receipt：稳定降级为空态，不猜测批准；
- 成功 transition 后 receipt 被消费，新 phase 不得沿用旧批准。

### Maestro Flow：receipt、证据与阶段时间线

固定
[`Session-Run 架构`](https://github.com/catlog22/maestro-flow/blob/5375fb589f182c1c7e9cade69b4acd3ccd03bac1/guide/session-run-architecture.md)
把 `session.json` / `run.json` / artifact registry 定义为 canonical authority，并用
`transition-request/1.0` + `transition-outcome/1.0` 记录 request ID、pre/post fence、result hash 与
applied/rejected outcome；projection 可重建，未知版本 fail-closed。Dashboard 的
[`PhaseTimelineView`](https://github.com/catlog22/maestro-flow/blob/5375fb589f182c1c7e9cade69b4acd3ccd03bac1/dashboard/src/client/components/workflow/PhaseTimelineView.tsx)
把阶段、当前状态、进度和 gap 放在同一键盘可访问行。
[`v0.5.58`](https://github.com/catlog22/maestro-flow/releases/tag/v0.5.58)
又把 Run 证据、知识曝光/消费、候选晋升、审计与回滚串成闭环。

对 Tenon 的启示：

- snapshot 是 projection，canonical receipt 仍是唯一 authority；
- phase/event/timestamp 应一起呈现，避免只有颜色或“等待中”；
- 本轮不要复制 Maestro Session/Run schema、知识治理或通用 timeline，只投影一个高价值 handshake。

### claude-tap：证据检查而非状态 authority

固定 [README](https://github.com/liaohch3/claude-tap/blob/6cfe45afd7b6d009e839b178dd59b9e338b10309/README.md)
把本地 API request/response、tool call、token usage 和相邻请求 structural diff 做成实时、可搜索、
可键盘导航且可导出的 trace viewer；常见 auth header 在记录前脱敏。

对 Tenon 的启示：

- exact event 和两个时间点适合用紧凑、可检索的事实行呈现；
- 可观察性信息必须有清晰来源，不能把 LLM trace 或 UI 文案当作 canonical approval；
- 不应把完整 pipeline state、marker、原始 prompt 或敏感审计字段发送给 Dashboard。

## Tenon 现状与独特性审计

固定基线：`origin/main` 为 `445aa141`。截至调研时开放 PR 只有
[#20](https://github.com/jefferysha/tenon/pull/20)（merged-main review baseline hardening）和
[#21](https://github.com/jefferysha/tenon/pull/21)（same-turn Codex Skill receipt），均不实现
Review Handshake snapshot。

当前 main 已有：

- kernel `review-gate.ts` 的 `pending` / `approved`、phase/event 精确匹配、request/approval patch
  与 transition 后 clear；
- CLI `review request|acknowledge` 和 delegated authority 审计；
- CLI Inbox 只在 canonical receipt 为 `pending` 时生成 `review-request` 项；
- Dashboard i18n 中只有 “Explore, Spec, and Verify exits require an exact review receipt” 的静态说明；
- PR #19 已合入 Inbox/Progress 的筛选、排序和 current-scope 交互，但不显示 receipt 三态、exact
  event 或 request/ack 时间。

因此本功能与现有 Inbox triage 的边界是：

| 能力 | 现有 main | 本轮最小切片 |
| --- | --- | --- |
| 找出 pending review 待办 | 已有 CLI/Inbox 能力 | 复用，不重复 |
| 显示尚未 request 的 review phase | 无 | `not_requested` 空态与下一步 |
| 显示 pending receipt 的 exact event/time | 无结构化 Dashboard DTO | `pending` 事实与下一步 |
| 显示 approved、尚未被 transition 消费 | 无 | `approved` 事实与下一步 |
| Dashboard 批准/拒绝写操作 | 无，且本轮不应新增 | 保持 CLI/host receipt authority |

独特性判断：**通过**。它不是文案、假数据或现有 Inbox 的重复包装，而是把已经影响真实 transition
的 canonical shared contract 安全投影到 Dashboard，并补齐三态、exact event 和兼容空态。

## 建议边界与开放问题

### 建议边界

- DTO 建议只含：`status`、`phase`、`event`、`requestedAt`、`acknowledgedAt`、`nextAction`；
  `status` 为有限枚举，时间和 identity 不成立时返回 `null`。
- formatter 在 kernel 完成 exact-match 与 legacy 归一化；server 不读 YAML 文本，Dashboard 不读取
  `review_gate_*`。
- 复用现有 snapshot、decoder、Progress 当前 Change 区域、SSE/刷新路径；不建新顶级页面或新轮询。
- loading / empty / malformed snapshot / request error 均有独立状态；中英文 i18n 保持 exact event
  原样，不能翻译后丢失 identity。
- UI 只读。若未来要从 Dashboard acknowledge，应另立安全 Change，重新审计 Host、token、
  content-type、root trust、CSRF/重放、host-session authority 和不可逆误触。

### 开放问题

1. `not_requested` 是否只在当前 step 为 review gate 时显示，还是所有 Change 都显示“本阶段无需
   review”？建议由 effective workflow plan 派生，非 review step 返回 `null`，避免虚假噪音。
2. receipt 存在但 phase 不匹配当前 step 时，DTO 是 `not_requested` 还是显式 `inconsistent`？
   安全上建议 formatter fail-loud 给 server 诊断，用户 DTO 返回稳定 error state，不能把残留 receipt
   解释为批准。
3. `approved` 通常在 transition 前短暂存在；SSE/刷新是否足以让用户看见？验收应能固定 snapshot
   fixture，不应为了延长可见性改变 receipt 消费规则。
4. `nextAction` 应是稳定枚举还是完整文案？建议用枚举（如 `finish_artifacts`、
   `await_acknowledgement`、`retry_transition`），由 Dashboard i18n 转成文案。

## 一手来源索引

- GitHub REST：各仓库的
  [`repository`](https://docs.github.com/rest/repos/repos#get-a-repository)、
  [`commit`](https://docs.github.com/rest/commits/commits#get-a-commit)、
  [`latest release`](https://docs.github.com/rest/releases/releases#get-the-latest-release) 与
  [`tags`](https://docs.github.com/rest/repos/repos#list-repository-tags) API。
- Trellis：[固定 README](https://github.com/mindfold-ai/Trellis/blob/c94d6fc289b7a6fdd9480bdfae4d4639c9ac2d4c/README.md)、
  [tag `v0.6.10`](https://github.com/mindfold-ai/Trellis/tree/v0.6.10)。
- Comet：[固定 README](https://github.com/rpamis/comet/blob/92d418eb93ce07c95b0855b2d36da4f6fdaea92d/README.md)、
  [release `0.4.0-beta.11`](https://github.com/rpamis/comet/releases/tag/0.4.0-beta.11)。
- Chorus：[固定 release](https://github.com/Chorus-AIDLC/Chorus/releases/tag/v0.14.5)、
  [code-review gateway](https://github.com/Chorus-AIDLC/Chorus/blob/be647877b4b56a61e480e939d6a6d31b3f84f7f9/openspec/specs/code-review-gateway/spec.md)、
  [headless interaction guard](https://github.com/Chorus-AIDLC/Chorus/blob/be647877b4b56a61e480e939d6a6d31b3f84f7f9/openspec/specs/daemon-headless-interaction-guard/spec.md)、
  [stage-advance service](https://github.com/Chorus-AIDLC/Chorus/blob/be647877b4b56a61e480e939d6a6d31b3f84f7f9/src/services/stage-advance.service.ts)、
  [Dashboard Yolo action](https://github.com/Chorus-AIDLC/Chorus/blob/be647877b4b56a61e480e939d6a6d31b3f84f7f9/src/components/yolo-button.tsx)。
- Maestro Flow：[fixed README](https://github.com/catlog22/maestro-flow/blob/5375fb589f182c1c7e9cade69b4acd3ccd03bac1/README.en.md)、
  [Session-Run architecture](https://github.com/catlog22/maestro-flow/blob/5375fb589f182c1c7e9cade69b4acd3ccd03bac1/guide/session-run-architecture.md)、
  [release `v0.5.58`](https://github.com/catlog22/maestro-flow/releases/tag/v0.5.58)。
- claude-tap：[固定 README](https://github.com/liaohch3/claude-tap/blob/6cfe45afd7b6d009e839b178dd59b9e338b10309/README.md)、
  [release `v0.1.141`](https://github.com/liaohch3/claude-tap/releases/tag/v0.1.141)。
