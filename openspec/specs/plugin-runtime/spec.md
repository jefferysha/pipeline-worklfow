# Managed Plugin Runtime Specification

## Requirements

### Requirement: Native installation activates a verified managed release

For `tenon setup --codex` and `tenon setup --claude`, the system SHALL treat the native
host's reported plugin root as a candidate. It SHALL stage and verify that candidate before
publishing a managed runtime release, and it SHALL install only the selected native-host adapter.
All default-workflow skills distributed in the plugin SHALL remain available from the selected
release without a second workflow package or external skill install.

#### Scenario: First native installation succeeds

- **WHEN** a user runs `tenon setup --codex` and the host reports a complete plugin root
- **THEN** the system validates the candidate, publishes one managed release, writes stable
  `pipeline` and `tenon-hook` launchers, and reports the required Codex hook-trust step
- **AND** it does not modify Claude configuration.

#### Scenario: Candidate validation fails during setup

- **WHEN** the host reports a candidate with a missing bundle, malformed hook, invalid manifest,
  symlinked payload entry, or failed CLI smoke check
- **THEN** setup exits non-zero and does not change active release selection or either launcher
- **AND** it reports the specific verification failure.

### Requirement: Active runtime selection is atomic and recoverable

The system SHALL store releases in immutable content-addressed directories and SHALL atomically
replace a selection record containing an active release and optional previous verified release.
All setup, update, rollback, and retention mutations SHALL run under a cross-process lock and
append an audit record. The active and previous release SHALL never be pruned.

#### Scenario: Candidate update activates atomically

- **WHEN** `tenon update --claude` obtains and verifies a new candidate
- **THEN** the candidate is fully published before the active selection points to it
- **AND** the former active release becomes the previous verified release.

#### Scenario: Update is interrupted before selection publication

- **WHEN** staging or validation fails, or the process stops before selection publication
- **THEN** the previously active release remains selected and executable
- **AND** incomplete staging is not considered a managed release.

### Requirement: Host hooks use a stable bootstrap ABI

The distributed native host hook manifest SHALL invoke the stable `tenon-hook` launcher and
SHALL NOT execute a hook directly from `${PLUGIN_ROOT}` or `${CLAUDE_PLUGIN_ROOT}`. The bootstrap
SHALL set the selected release root when invoking its payload hook so child hooks cannot
accidentally resolve assets from the mutable marketplace checkout.

#### Scenario: Marketplace checkout changes after activation

- **WHEN** a host marketplace cache is refreshed or replaced after a release is active
- **THEN** an existing host hook dispatches through the managed active release
- **AND** it does not execute a hook from the changed cache path.

### Requirement: Runtime corruption has recovery-only authority

If the bootstrap cannot validate or load the active release, it SHALL distinguish that condition
from a valid payload policy denial. It SHALL deny normal write-capable project operations and
accept only the exact local command `tenon runtime repair --rollback`. That recovery operation
SHALL validate and select only the persisted previous verified release; it SHALL not accept a path,
download arbitrary code, delete project markers, or modify OpenSpec workflow state.

#### Scenario: Previous release repairs an invalid active release

- **WHEN** active release integrity validation fails and a valid previous release exists
- **THEN** `tenon runtime repair --rollback` atomically selects the previous release
- **AND** records a rollback audit event
- **AND** normal policy enforcement resumes from that release.

#### Scenario: No verified recovery release exists

- **WHEN** active release validation fails and there is no valid previous release
- **THEN** the recovery command exits non-zero with a reinstall instruction
- **AND** the bootstrap does not silently allow ordinary mutation.

### Requirement: Auto-update preserves the active runtime

The opt-in SessionStart auto-update path SHALL call the stable launcher, not a bundle located by
the host plugin root. A failed host refresh or candidate validation SHALL retain the active managed
release and write a diagnostic/audit record. A successful update SHALL affect a new host session
only.

#### Scenario: Auto-update candidate fails verification

- **WHEN** an opted-in automatic update downloads an incomplete candidate
- **THEN** the current active release and stable launcher remain unchanged
- **AND** the failure is visible through runtime status or doctor diagnostics.

### Requirement: Workflow routing never revives an unrelated change

The router SHALL assign exactly one explicit workflow owner to a request. A new objective SHALL
produce a new change even when `.pipeline-active` or multiple unarchived changes exist. Only an
explicit resume request may bind to an eligible named or uniquely selectable change; modification
time SHALL NOT be used to bind a new request.

#### Scenario: New objective with stale active pointer

- **WHEN** an old active pointer exists and the user submits a new development objective
- **THEN** the router emits new-change intent and clears the old binding
- **AND** the pipeline creates a fresh change rather than reusing old tasks or phase state.

### Requirement: Managed release SHALL 以可对账 WAL 串联宿主与 runtime

setup/update SHALL 在同一逐 scope 跨进程锁和 durable WAL 内串联宿主 mutation、候选解析、
runtime 激活、Dashboard readiness 与 convergence evidence。宿主步骤的恢复 SHALL 依据 before
inventory 与 desired postcondition 对账，而不是依据外部命令是否曾返回。旧版 pending WAL 若缺少
足以证明 before/desired 的数据，SHALL 返回 indeterminate，MUST NOT 自动重放。

#### Scenario: 进程在宿主 mutation 返回后崩溃

- **GIVEN** WAL 已持久化步骤的 before inventory 与 desired postcondition
- **WHEN** 恢复观察到 desired state 已成立
- **THEN** 步骤被补记为 completed
- **AND** 后续候选解析从当前权威 inventory 继续
- **AND** 宿主 mutation 命令不再执行。

#### Scenario: 旧 WAL 无法证明安全重试

- **WHEN** pending host step 只有 `started` 而没有 before/desired 对账数据
- **THEN** runtime 返回可诊断的 indeterminate
- **AND** 不改变宿主 inventory、active release、launcher 或 Dashboard。

### Requirement: Dashboard 事务所有权 SHALL 使用 transaction id

release transaction 启动 Dashboard 时 SHALL 生成并传递当前 transaction id。Server 健康响应、
pidfile、WAL 与 managed Dashboard identity SHALL 保持该 id。inspect/adopt/stop SHALL 要求
`releaseId`、`stateScopeId`、`port`、`pid` 与 transaction id 全部精确匹配。普通 Dashboard
启动 SHALL 不携带 transaction id，且 MUST NOT 被 release transaction 收养或停止。

#### Scenario: 同 release 的普通 Dashboard 在两次探测间启动

- **GIVEN** release transaction 的 before probe 观察到端口为空
- **AND** 普通 Dashboard 在事务 start 前启动并报告相同 release/state scope
- **WHEN** 事务再次 inspect
- **THEN** 缺少当前 transaction id 的进程保持 preexisting
- **AND**事务不得 adopt 或 stop 该进程。

#### Scenario: 本事务进程在 journal 提交前已就绪

- **GIVEN** Dashboard 健康响应携带当前 transaction id
- **AND** 进程在 `dashboard-ready` WAL 写入前终止 coordinator
- **WHEN** 同一事务恢复
- **THEN** coordinator 通过精确 transaction id 收养真实 listener
- **AND** 后续失败时只停止该精确进程。

#### Scenario: 另一个事务启动同 release Dashboard

- **WHEN** 健康服务的 transaction id 与当前 WAL 不同
- **THEN** 当前事务返回 indeterminate 或 preexisting 诊断
- **AND** 不收养、不停止也不覆盖该服务。

### Requirement: Build→Verify SHALL 先全量收敛再独立复核

default workflow 的 Build SHALL 在冻结候选前完成一次覆盖完整 diff、全部受影响 capability、
失败路径和发行门禁的 pre-Verify convergence review，并以 canonical
`pre_verify_review_result=pass` 留下机器可检查结果。`build-complete` SHALL 在该结果缺失、pending
或 fail 时拒绝。`spec-complete`、`requirements-changed` 和 `verify-fail` 进入新的实现 visit 时
SHALL 把结果重置为 pending，MUST NOT 继承旧候选的 pass。

Verify SHALL 保持独立冻结基线审查。Reviewer brief SHALL 覆盖完整 frozen diff 和所有已登记
capability，不得只审上一轮 findings；所有适用并行轨 SHALL 全部完成后，主流程才 MAY 汇总一次
severity findings 并选择 `verify-pass` 或 `verify-fail`。重试 SHALL 同时回归已知 findings 和
重新审查完整 diff。Build convergence 与 Verify 的代码、E2E、视觉轨都 SHALL 以
Critical/High/Medium 全部清零且证据完整为 pass 门槛，MUST NOT 以偏差批准把已知 Medium 带入
Verify 或 Ship。

对 in-place Change，Build SHALL 在冻结前完成所有会重写 tracked implementation、configuration、
generated artifact 或 release asset 的命令，并确认没有存活 writer。Verify SHALL 对真实工作区
执行 repo-zero-output：会产生仓库写入的复验只能在保留权限与 symlink 的隔离副本运行，截图、
snapshot、trace、coverage、各轨原始审查产物与日志 SHALL 写到仓库外。所有轨完成并一次性聚合
后，canonical `verification_report` SHALL 作为唯一例外写入 workflow 声明的仓库内治理路径并
登记 digest-bound 证据；它不得被某一轨边跑边写。每条适用验证轨 SHALL 在开始和结束时计算同一
workspace fingerprint；任一瞬时漂移 SHALL 使该轨失败，MUST NOT 通过删除或还原产物伪造稳定
结论。

#### Scenario: Build 只完成聚焦测试但未做全量收敛审查

- **GIVEN** 当前实现的聚焦测试通过
- **AND** `pre_verify_review_result` 不是 `pass`
- **WHEN** 尝试执行 `build-complete`
- **THEN** guard 拒绝冻结 `build_sha`
- **AND** Change 保持在 Build。

#### Scenario: Verify 某一轨提前发现 High

- **GIVEN** Reviewer、E2E 与 Codex 轨并行审查同一冻结基线
- **WHEN** Reviewer 先返回一个 High finding
- **THEN** 主流程继续等待其他适用轨完成
- **AND** verification report 一次性包含全部轨的 findings
- **AND** 之后才请求 exact `verify-fail` review。

#### Scenario: Verify-fail 修复后重试

- **WHEN** Change 因 findings 回到 Build
- **THEN** `pre_verify_review_result` 重置为 pending
- **AND** Build 修复全部已知 findings 后重新执行完整 convergence review
- **AND** 下一轮 Verify Reviewer 同时回归旧 findings 并审完整 frozen diff。

#### Scenario: 收敛审查仍有 Medium

- **GIVEN** 全量 Build reviewer 已聚合全部适用检查
- **AND** 仍存在一个 Medium finding
- **WHEN** 尝试把 `pre_verify_review_result` 置为 pass
- **THEN** Build 协议拒绝通过并先修复该 finding
- **AND** 不得以批准偏差把该 Medium 交给 Verify。

#### Scenario: Verify 命令会重写 tracked 生成物

- **GIVEN** in-place Change 已冻结 workspace fingerprint
- **WHEN** 某 Verify 轨需要运行会重写 tracked 生成物的命令
- **THEN** 该命令只在保留权限与 symlink 的隔离副本运行
- **AND** 日志与各轨原始 QA 产物写到仓库外
- **AND** 全部轨结束后才在治理路径写入并登记 canonical 聚合 `verification_report`
- **AND** 真实工作区在该轨前后的 fingerprint 精确一致。
