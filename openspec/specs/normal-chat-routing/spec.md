# Normal-chat workflow routing

## Purpose

定义正常对话如何区分讨论与执行、如何选择 Track/Workflow，以及如何在不复用旧 Change 或隐式默认项目的前提下创建受治理的流水线现场。

## Requirements

### Requirement: normal chat preserves effective Track workflow bindings

For every enabled effective Track, the router's generated data contract SHALL carry the Track's
validated default workflow along with its id, label, priority, and routing pattern.

#### Scenario: custom Track is routed

- **WHEN** a project contains a routable custom Track whose default workflow is `catalog-flow`
- **AND WHEN** a new user prompt routes to that project
- **THEN** the normal-chat dispatch exposes `catalog-flow` as the recommended workflow for that
  Track rather than substituting `default`.

### Requirement: custom choices require explicit selection before Change creation

For a new objective in a project that has a custom routable Track or a non-default workflow
binding, the router SHALL mark its dispatch as selection-required and include valid candidate
Track/workflow pairs.

#### Scenario: user chooses between default and custom paths

- **WHEN** a prompt can be served by the recommended custom path and a built-in/default path
- **THEN** the root pipeline skill asks the user which pair to use before running `tenon init`
- **AND THEN** the new Change stores the selected pair through the canonical CLI/API path.

### Requirement: clean projects preserve default routing

A project whose effective routable Tracks are all built-in and bound to `default` SHALL continue
to dispatch the winning Track and default workflow without a selection question.

#### Scenario: built-in Track routes directly

- **GIVEN** a project only exposes built-in routable Tracks bound to `default`
- **WHEN** a new executable prompt has one highest-scoring Track
- **THEN** the router selects that Track with workflow `default`
- **AND** Change creation does not ask the user to choose an equivalent Track/workflow pair.

### Requirement: cache incompatibility fails closed

The hook SHALL reject a cache that lacks the workflow binding required by its current schema and
regenerate it on the cold path; it SHALL not guess or silently fall back to an old value.

#### Scenario: stale routing cache is regenerated

- **GIVEN** the cached Track payload predates the schema that requires a workflow binding
- **WHEN** the normal-chat hook reads that cache
- **THEN** the hook rejects the incompatible payload and regenerates it from canonical project data
- **AND** it does not substitute workflow `default` for the missing field.

### Requirement: Every Workflow SHALL have a neutral executable entry

The system SHALL expose a built-in `free` Track whose Workflow binding allows
every valid Workflow. The Track SHALL be available after setup and update
without a project-authored Track file.

The `free` Track SHALL add no PM, frontend, or backend coverage profile or skill
matrix. It SHALL not be automation-eligible and SHALL not participate in
content-based routing. The selected Workflow's own steps, skills, gates,
OpenSpec contract, documents, and transitions SHALL remain fully enforced.

#### Scenario: A project Workflow is executed without a domain Track overlay

- **GIVEN** a project defines Workflow `release-train`
- **WHEN** a user selects `track=free` and `workflow=release-train`
- **THEN** the canonical Change stores that exact pair
- **AND** execution follows only `release-train`'s declared graph and governance
- **AND** no PM/frontend/backend profile is injected.

#### Scenario: A future Workflow is automatically eligible

- **WHEN** a valid Workflow is added after installation
- **THEN** `free` may bind it without creating or updating a Track definition.

#### Scenario: Free executes the default Workflow to completion

- **GIVEN** a Change binds `track=free` and `workflow=default`
- **WHEN** each phase driver executes from Open through Archive
- **THEN** every phase has an explicit neutral instruction path
- **AND** OpenSpec, Superpowers documents, tasks, frozen verification, applied
  spec, review receipts, and archive gates remain enforced
- **AND** PM PRD and engineering double-review/PR URL fields are not required.

### Requirement: Discussion and free execution SHALL remain distinct

The existing `chat` identity SHALL continue to represent non-executing
discussion in normal conversation. A request to explain or discuss SHALL not
create a Change merely because the `free` Track exists.

#### Scenario: An explanation remains ordinary chat

- **WHEN** a user asks why a pipeline gate exists
- **THEN** the hook suppresses workflow execution
- **AND** neither `chat` nor `free` creates a Change.

### Requirement: Manual candidates SHALL be independent from routable scorers

The router's versioned data contract SHALL carry whether an effective Track is
eligible for content scoring. A non-routable Track MAY be exposed as a bounded
manual candidate, but SHALL never enter the score loop or win by score.

An explicit free-mode phrase SHALL be treated as a direct user choice rather
than as a routing score. If the exact Workflow is not yet selected, the root
pipeline skill SHALL validate and obtain an exact legal `free / workflow` pair
before Change creation.

#### Scenario: Free is visible but never auto-selected

- **GIVEN** a normal implementation prompt does not explicitly request free mode
- **WHEN** routing scores enabled Tracks
- **THEN** `free` has no score and cannot win
- **AND** the applicable routable Track remains the recommendation.

#### Scenario: Explicit free mode creates a free Change

- **WHEN** a user explicitly says to use free mode for a new objective
- **THEN** the dispatch recommends `track=free`
- **AND** the root skill validates the selected Workflow before `tenon init`.

### Requirement: Router schema migration SHALL fail closed

A cache created before routability was part of the row schema SHALL be rejected
and regenerated. Project-controlled cache bytes SHALL remain bounded, data-only,
and never be sourced or evaluated as shell.

#### Scenario: An old cache cannot make free routable

- **WHEN** the hook reads a prior cache schema with no routability field
- **THEN** it discards the cache and regenerates the current schema
- **AND** it does not infer a default routability value.

#### Scenario: A builtin changes without a project Track edit

- **WHEN** a plugin release changes an effective builtin Track while
  `.pipeline/tracks.yaml` remains byte-identical
- **THEN** the release-owned router contract revision changes
- **AND** the hook compares that revision by content on every cache load
- **AND** the prior cache is regenerated even when its mtime is newer than
  the plugin files.

### Requirement: Custom Workflow archive terminals SHALL close canonical state

A custom Workflow that reaches a terminal step named `archive` SHALL support
the reserved `archived` completion event after that step's guards, skill DAG,
and document evidence pass. Completion SHALL set `phase_status=done`,
`archived=true`, and `archived_at` without requiring a cyclic transition in
the user-authored Workflow graph.

#### Scenario: Terminal archive no longer remains active forever

- **WHEN** a custom Workflow reaches `archive` with `transitions: []`
- **AND** its declared archive skills, guards, and document reads are complete
- **THEN** `tenon transition <change> archived` completes the canonical run
- **AND** the Change is no longer returned as an active recovery candidate.

### Requirement: 正常开发对话 SHALL 分派到真实存在的产品根入口

Codex 的生成式 Agent managed block SHALL 从产品身份真相源确定根入口 Skill，且正常开发对话的
静态指令 SHALL 调用完整引用 `tenon:tenon`。仓库根 `AGENTS.md` 与静态 adapter SHALL 消费同一
生成模板；任何漂移 SHALL 在构建、adapter 测试和发布前失败。

#### Scenario: 普通开发请求触发 default workflow

- **WHEN** UserPromptSubmit 路由一个新的开发目标到 default workflow
- **THEN** Agent 规则要求先调用 `tenon:tenon`
- **AND** 根入口创建或恢复精确 Change 后再分派当前 phase Skill
- **AND** Todo 一级项来自真实七阶段图而不是脱离流程的通用列表。

#### Scenario: 仓库规则被手工改坏

- **WHEN** `AGENTS.md` managed block 与生成模板不一致
- **THEN** 产品身份 freshness 检查失败并指出漂移
- **AND** 候选不得打包或发布。

#### Scenario: 静态 adapter 安装规则

- **WHEN** 无原生插件能力的 Codex 目标运行静态 adapter
- **THEN** adapter 读取同一生成模板写入 managed block
- **AND** 哨兵外用户内容保持不变
- **AND** 规则不引用不存在的 Skill 或已废弃 CLI。

### Requirement: 持续执行授权 SHALL 绑定精确 Change

正常对话 SHALL 只把共享 prompt classifier 识别出的显式持续执行意图写为 canonical authority。
authority SHALL 绑定精确 Change 与 host session、可撤销且不得跨 Change 继承。拒绝或修改意图
SHALL 优先于批准短语。持续授权 SHALL NOT 跳过 Skill、OpenSpec 文档读写收据、guard、
verification 或 exact phase/event review request；只有这些证据完整后，系统 MAY 为同一 Change
写入带授权来源和时间的 delegated review receipt。

#### Scenario: 用户授权当前 Change 自主完成

- **WHEN** 用户明确要求当前 Change 后续无需例行询问并执行完成
- **THEN** session activation 写入只属于该 Change 的版本化 authority
- **AND** 每个 review phase 仍先生成精确 event 的 request 与完整证据
- **AND** delegated acknowledgement 可引用该 authority 后推进。

#### Scenario: 新目标不继承旧授权

- **GIVEN** Change A 具有有效持续授权
- **WHEN** 用户提出独立目标并创建 Change B
- **THEN** Change B 使用普通交互模式
- **AND** A 的 authority 不能确认 B 的任何 review event。

#### Scenario: 用户撤销持续授权

- **WHEN** 用户要求恢复逐步确认或撤回自主执行
- **THEN** 当前 Change 的 authority 被规范化撤销
- **AND** 后续 review 恢复人工确认门。
