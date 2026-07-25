# Trellis 如何组织规格、Skills 与跨阶段文档交接

> 研究日期：2026-07-25
> 研究对象：[`mindfold-ai/Trellis`](https://github.com/mindfold-ai/Trellis)
> 固定版本：`v0.6.9`
> 固定提交：[`12e279a8af00456b1d0d4e3d0f7f59e7b702202e`](https://github.com/mindfold-ai/Trellis/tree/12e279a8af00456b1d0d4e3d0f7f59e7b702202e)
> 上游提交时间：2026-07-24T22:53:52+08:00
> 证据范围：仅使用固定提交中的官方源码、官方仓库内文档与官方站点；涉及当前 pipeline-lite 的结论只使用本隔离 worktree 的源码。

## 执行摘要

先澄清最重要的事实：

**Trellis v0.6.9 没有把 OpenSpec CLI 或 obra/superpowers 插件直接嵌入运行时。** 它在官方仓库中把 OpenSpec 和 Superpowers 作为竞品/灵感来源研究过，但实际交付的是 Trellis 自己的：

- `.trellis/spec/` 长期项目规范；
- task 目录中的 `prd.md`、`design.md`、`implement.md`；
- `implement.jsonl`、`check.jsonl` 角色上下文清单；
- `trellis-brainstorm`、`trellis-before-dev`、`trellis-check`、`trellis-update-spec` 等 Skills；
- `trellis-implement`、`trellis-check`、`trellis-research` 等角色 Agent；
- SessionStart、UserPromptSubmit、SubagentStart Hooks；
- session-scoped active task、archive 和 workspace journal。

因此，Trellis 的准确定位不是“OpenSpec + Superpowers 的集成器”，而是：

> **吸收了 OpenSpec 的文件化规格/归档思想和 Superpowers 的先设计、再计划、再执行/验证思想，随后将其重写成 Trellis 原生的三阶段工作流与上下文注入机制。**

Trellis 最值得当前 pipeline-lite 借鉴的，不是它较弱的状态机，而是它把“下一步到底读什么”做成了一个显式、角色化、可检查的上下文产品：

1. 规划阶段把长期规范和研究材料登记进 `implement.jsonl` / `check.jsonl`；
2. 启动实现 Agent 时，Hook 按固定顺序注入“清单文件 → PRD → Design → Implement”；
3. 下一角色不必重新扫描整个仓库，也不依赖上一段对话记忆；
4. session pointer 使同仓库并发会话不会互相抢“当前任务”；
5. updater 明确区分 Trellis 管理的模板与用户拥有的 task/spec/workspace 文档。

当前 pipeline-lite 在另外几个维度明显更强：

- 7 phase 与受控回退边是 canonical 状态，而不是粗粒度 `status` 投影；
- review receipt 绑定 exact transition event；
- document ledger 记录 `kind/path/sha256/producer`；
- 下一 phase 必须对当前内容摘要和当前 visit 留下 read receipt；
- mandatory Skill 是 guard 证据，不只是 prompt 约定；
- OpenSpec delta 的 apply/archive 有明确治理语义。

所以推荐方案不是“改成 Trellis”，而是：

> **保留 pipeline-lite 的状态、OpenSpec、Skill receipt、document ledger 和 review gate；在 ledger 之上新增一个由系统编译的、按 phase/role 切分的 Context Bundle。**

这个 Bundle 应让人和 Agent 都能回答：

- 下一步必须读哪些文档？
- 每份文档为什么要读？
- 当前摘要是否和 ledger SHA 一致？
- 哪些必须全文注入，哪些只给摘要/路径？
- 总上下文预算是多少？
- 哪一份缺失、过期、未读会阻断？

## 1. 身份、版本与“没有直接集成”的证据

包版本与依赖来自同一固定提交。依赖表中没有 OpenSpec 或 Superpowers 包：

证据（[`packages/cli/package.json:1-13`](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/package.json#L1-L13)）：

```json
{
  "name": "@mindfoldhq/trellis",
  "version": "0.6.9",
  "description": "AI capabilities grow like ivy — Trellis provides the structure to guide them along a disciplined path",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "bin": {
    "trellis": "./bin/trellis.js",
    "tl": "./bin/trellis.js"
  },
  "publishConfig": {
    "access": "public"
```

证据（[`packages/cli/package.json:54-62`](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/package.json#L54-L62)）：

```json
"dependencies": {
  "@mindfoldhq/trellis-core": "workspace:*",
  "chalk": "^5.3.0",
  "commander": "^12.1.0",
  "figlet": "^1.9.4",
  "giget": "^3.1.1",
  "inquirer": "^9.3.7",
  "undici": "^6.21.0",
  "zod": "^4.4.2"
},
```

更直接的历史证据是：Trellis 官方仓库把二者放在一个已归档任务的 `competitors/` 研究目录中。OpenSpec 文档把 `Propose → Apply → Archive` 列为“对 Trellis 的启示”，Superpowers 文档写明目的为“给 Trellis README 和 Use Case 提供借鉴”。

证据（[`competitors/openspec.md:226-236`](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/.trellis/tasks/archive/2026-01/01-19-readme-redesign-taosu/competitors/openspec.md#L226-L236)）：

```text
## 对 Trellis 的启示

1. **简洁入口 + 文档分离** - README 不追求完整，指向 thedocs.io
2. **25+ AI 工具集成** - 标准化支持，斜杠命令语法
3. **问题导向的营销** - 不卖产品，卖解决方案
4. **FAQ 设计** - 预判疑虑，诚实回答
5. **多语言域名** - openspec.dev / openspec.cn
6. **Spec-Driven Development** - 规范驱动开发理念
7. **三阶段工作流** - Propose → Apply → Archive
8. **具体效果量化** - "100x"、"seconds to review"
9. **Use Case 隐含在功能名称中** - Spec Delta、Quick Review 等自解释
```

证据（[`competitors/superpowers.md:1-8`](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/.trellis/tasks/archive/2026-01/01-19-readme-redesign-taosu/competitors/superpowers.md#L1-L8)）：

```text
# Superpowers Claude Code Plugin 深度研究报告

> 研究时间: 2026-01-20
> 目的: 为 Trellis 项目 README 和 Use Case 提供借鉴

## 概述

**Superpowers** 是由 Jesse Vincent ([@obra](https://github.com/obra)) 开发的 Claude Code 插件，目前在 GitHub 上有 **29.5k+ stars**。它是一个 agentic skills 框架，核心理念是：**让 AI 在写代码之前先思考和规划**。
```

这两份文件能证明“上游研究并借鉴过”，不能证明“当前运行时依赖”。当前运行时的真实契约仍应以 v0.6.9 的 `workflow.md`、Skills、Hooks 和 task scripts 为准。

## 2. 总体模型：三阶段叙事，粗粒度状态投影

Trellis 对用户呈现三个阶段：

```text
Plan → Execute → Finish
```

具体步骤是：

| 阶段 | 步骤 | 主要角色/Skill | 主要产物 |
|---|---|---|---|
| Plan | 1.0 创建任务 | `task.py create` | `task.json`、`prd.md`、JSONL seed |
| Plan | 1.1 需求探索 | `trellis-brainstorm` | `prd.md`；复杂任务再有 `design.md`、`implement.md` |
| Plan | 1.2 调研 | `trellis-research` | `research/*.md` |
| Plan | 1.3 配置上下文 | `task.py add-context` | `implement.jsonl`、`check.jsonl` |
| Plan | 1.4 人工复核后激活 | `task.py start` | `status: planning → in_progress` |
| Execute | 2.1 实现 | `trellis-implement` / `trellis-before-dev` | 代码、测试 |
| Execute | 2.2 检查 | `trellis-check` | 修复后的代码与验证结果 |
| Execute | 2.3 回退 | 回 Plan / 重做实现 / 补研究 | 修订后的任务文档 |
| Finish | 3.2 调试复盘 | `trellis-break-loop` | 原因/预防经验 |
| Finish | 3.3 更新长期规范 | `trellis-update-spec` | `.trellis/spec/**/*.md` 与 index |
| Finish | 3.4 提交 | 主会话 | work commits |
| Finish | 3.5 收尾 | `/trellis:finish-work` | archive commit、workspace journal commit |

官方工作流把阶段和规划文档边界写得很明确：

证据（[`workflow.md:144-164`](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/templates/trellis/workflow.md#L144-L164)）：

````text
## Phase Index

```
Phase 1: Plan    → classify, get task-creation consent, then write planning artifacts
Phase 2: Execute → implement only after task status is in_progress
Phase 3: Finish  → verify, update spec, commit, and wrap up
```

### Request Triage

- Simple conversation or small task: ask only whether this turn should create a Trellis task. If the user says no, skip Trellis for this session.
- Complex task: ask whether you may create a Trellis task and enter planning. If the user says no, do not do broad inline implementation; explain, clarify scope, or suggest a smaller split.
- User approval to create a task is not approval to start implementation. Planning still happens first.

### Planning Artifacts

- `prd.md` — requirements, constraints, and acceptance criteria. Do not put technical design or execution checklists here.
- `design.md` — technical design for complex tasks: boundaries, contracts, data flow, tradeoffs, compatibility, rollout / rollback shape.
- `implement.md` — execution plan for complex tasks: ordered checklist, validation commands, review gates, and rollback points.
- `implement.jsonl` / `check.jsonl` — spec and research manifests for sub-agent context. They do not replace `implement.md`.
- Lightweight tasks may be PRD-only. Complex tasks must have `prd.md`, `design.md`, and `implement.md` before `task.py start`.
````

但其 canonical task state 并不是一个细粒度三阶段状态机。实现主要依赖：

- `planning`
- `in_progress`
- `review`
- `completed` / `done`

证据（[`phase.ts:3-26`](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/core/src/task/phase.ts#L3-L26)，节选）：

```ts
/**
 * Coarse-grained Trellis task phase derived from task status.
 *
 * Phase is a projection of {@link TrellisTaskRecord.status} only. There is
 * no separate `current_phase` field stored on disk
 *
 *   planning            | plan
 *   in_progress         | implement
 *   review              | review
 *   completed | done    | completed
 */
```

而 `in_progress` 同时覆盖实现、检查、更新 spec 和提交。`workflow.md` 自己也标注 [`completed` breadcrumb 当前是 dead](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/templates/trellis/workflow.md#L660-L667)。换言之，步骤秩序主要由 prose、Skill 与 Hook breadcrumb 维持，而不是每一个 transition 都有独立 event、guard 和 receipt。

这和当前 pipeline-lite 的核心差异是：pipeline-lite 的 `open → explore → spec ⇄ build ⇄ verify → ship → archive` 是 manifest 声明的 canonical DAG，且 `explore/spec/verify` 离开时有 review gate（`templates/manifest.yaml:23-50`）。

## 3. 每一步怎样嵌入“规格方法”和“Superpowers 方法”

### 3.1 Session bootstrap：先注入最小地图，不注入全部知识

Trellis 的 SessionStart Hook 不会把 `.trellis/spec/`、所有 task 文档和 journal 全文塞入上下文。它注入：

- developer identity；
- git/workspace 简况；
- active task；
- 当前 task status；
- compact workflow overview；
- 关键入口路径；
- 任务文档读取顺序。

真正的详细阶段指导由 UserPromptSubmit Hook 每轮从 `workflow.md` 的 `[workflow-state:STATUS]` block 动态抽取。这样 `workflow.md` 是 breadcrumb 的单一真相源，脚本只是 parser。

证据（[`workflow.md:99-110`](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/templates/trellis/workflow.md#L99-L110)）：

```text
<!--
  WORKFLOW-STATE BREADCRUMB CONTRACT (read this before editing the tag blocks below)

  The [workflow-state:STATUS] blocks embedded in the ## Phase Index section
  below are the SINGLE source of truth for the per-turn `<workflow-state>`
  breadcrumb that every supported AI platform's UserPromptSubmit hook
  reads. inject-workflow-state.py (Python platforms) and
  inject-workflow-state.js (OpenCode plugin) only parse them — there is no
  fallback dict baked into the scripts after v0.5.0-rc.0.

  STATUS charset: [A-Za-z0-9_-]+. When the hook can't find a tag, it
```

这里很像 Superpowers 的 bootstrap 思路：先让模型知道“有哪些方法、何时必须加载”，再按需展开具体 Skill；区别是 Trellis 将触发条件和当前 task status 绑定。

### 3.2 Plan：把需求、设计、计划、研究分层写入文件

Trellis 的 Plan 不是一个文档，而是四种不同职责：

1. `prd.md`：WHAT、约束、验收标准；
2. `design.md`：复杂任务的架构、契约、数据流与取舍；
3. `implement.md`：有顺序的实现 checklist、验证命令和回退点；
4. `research/*.md`：外部/项目调研证据。

`trellis-brainstorm` 负责先理解项目和现有规范，再逐步澄清与收敛设计；只有用户确认后，复杂任务才进入实现。它保留了 Superpowers 的“brainstorm → design approval → plan”精神，但产物路径和阶段命名是 Trellis 自己的。

Trellis 的关键原则是“对话会压缩，文件不会”。官方工作流把研究落盘设为强原则：

证据（[`workflow.md:375-385`](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/templates/trellis/workflow.md#L375-L385)）：

```text
- Note relevant spec file paths you discovered for later reference

Brainstorm and research can interleave freely — pause to research a technical question, then return to talk with the user.

**Key principle**: Research output must be written to files, not left only in the chat. Conversations get compacted; files don't.

#### 1.3 Configure context `[required · once]`

[Claude Code, Cursor, OpenCode, codex-sub-agent, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi, Oh My Pi, ZCode, Snow, Reasonix, Trae, Grok, Kimi Code]

Curate `implement.jsonl` and `check.jsonl` so the Phase 2 sub-agents get the right spec/research context. These files were seeded on `task create` with a single self-describing `_example` line; your job here is to fill in real entries.
```

### 3.3 Configure context：提前编译“下一角色需要什么”

这是 Trellis 最有价值的设计。

在 Plan 结束前，主 Agent 不只是写计划，还要为下一步编辑两个 JSONL manifest：

```json
{"file": ".trellis/spec/my-package/backend/index.md", "reason": "实现前必须遵守该包后端规范"}
{"file": ".trellis/tasks/07-25-foo/research/api.md", "reason": "采用方案 B 的一手 API 约束"}
```

两份清单职责不同：

- `implement.jsonl`：实现 Agent 需要的规范与研究；
- `check.jsonl`：检查 Agent 需要的质量规范与研究。

它们不登记代码文件，不替代 `implement.md`，只回答“角色进入下一步前，应额外加载哪些知识，为什么”。

证据（[`workflow.md:385-403`](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/templates/trellis/workflow.md#L385-L403)）：

```text
Curate `implement.jsonl` and `check.jsonl` so the Phase 2 sub-agents get the right spec/research context. These files were seeded on `task create` with a single self-describing `_example` line; your job here is to fill in real entries.

**Location**: `{TASK_DIR}/implement.jsonl` and `{TASK_DIR}/check.jsonl` (already exist).

**Format**: one JSON object per line — `{"file": "<path>", "reason": "<why>"}`. Paths are repo-root relative.

**What to put in**:
- **Spec files** — `.trellis/spec/<package>/<layer>/index.md` and any specific guideline files (`error-handling.md`, `conventions.md`, etc.) relevant to this task
- **Research files** — `{TASK_DIR}/research/*.md` that the sub-agent will need to consult

**What NOT to put in**:
- Code files (`src/**`, `packages/**/*.ts`, etc.) — those are read by the sub-agent during implementation, not pre-registered here
- Files you're about to modify — same reason

**Split between the two files**:
- `implement.jsonl` → specs + research the implement sub-agent needs to write code correctly
- `check.jsonl` → specs for the check sub-agent (quality guidelines, check conventions, same research if needed)

These manifests do not replace `implement.md`. `implement.md` is the human-readable execution plan for a complex task; jsonl files only list context files to inject or load.
```

启动 gate 要求两个 JSONL 至少各有一条真实记录，seed `_example` 不算 ready；但兼容性 consumer 在缺失时只警告，并退化成仅注入 task artifacts。也就是说，它是“计划就绪规则强、运行时尽量降级继续”的策略，不是严格 fail-closed 的证据账本。

### 3.4 Execute：主会话调度，角色 Agent 按固定顺序读

默认路径中，主会话不直接实现：

1. dispatch `trellis-implement`；
2. Hook 给子 Agent 注入 `implement.jsonl` 指向的文件；
3. 再注入 `prd.md → design.md → implement.md`；
4. 实现 Agent 做代码、lint、type-check，但不得 commit/push；
5. 主会话 dispatch `trellis-check`；
6. check Agent 用 `check.jsonl` 和同一组 task artifacts 审查、直接修复、再验证；
7. 主会话继续 update-spec、commit、finish。

证据（[`workflow.md:223-240`](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/templates/trellis/workflow.md#L223-L240)）：

```text
Sub-agent dispatch protocol applies to all platforms and all sub-agents, including native Codex `SubagentStart` context injection with child-side pull fallback, class-2 Gemini/Qoder/Copilot/Reasonix/Trae/Grok/Kimi Code, hook-backed ZCode/Snow, and `trellis-research`: every dispatch prompt starts with `Active task: <task path from task.py current>` before role-specific instructions.

[workflow-state:in_progress]
Tools: `trellis-implement` / `trellis-research` are sub-agent types only (Task/Agent tool, NOT Skill; there is no skill by these names). `trellis-update-spec` is a skill. `trellis-check` exists as both; prefer the Agent form when verifying after code changes.
Flow: `trellis-implement` -> `trellis-check` -> `trellis-update-spec` -> commit (Phase 3.4) -> `/trellis:finish-work`.
Main-session default: dispatch implement/check sub-agents. Sub-agent self-exemption: if already running as `trellis-implement`, do NOT spawn another `trellis-implement` or `trellis-check`; if already running as `trellis-check`, do NOT spawn another `trellis-check` or `trellis-implement`. Dispatch is main session only.
Dispatch prompt starts with `Active task: <task path from task.py current>`. Read context: jsonl entries -> `prd.md` -> `design.md if present` -> `implement.md if present`.
[/workflow-state:in_progress]

[workflow-state:in_progress-inline]
Flow: `trellis-before-dev` -> edit -> `trellis-check` -> validation -> `trellis-update-spec` -> commit (Phase 3.4) -> `/trellis:finish-work`.
Do not dispatch implement/check sub-agents in inline mode.
Read context: `prd.md` -> `design.md if present` -> `implement.md if present`, plus relevant spec/research loaded by skills.
[/workflow-state:in_progress-inline]
```

在 Codex 上有两道保险：

- 原生 `SubagentStart` Hook 从父 session identity 解析 task，并注入角色上下文；
- 子 Agent profile 自己再以 pull 方式加载，作为 Hook 不可用时的 fallback。

这解决了“主会话知道当前任务，但子 Agent 不知道”的常见断链问题。

### 3.5 Check 与回退：能自修，但缺少独立、持久的验证事件

`trellis-check` 会：

- 读 diff；
- 对照 `.trellis/spec/`；
- 对照 `prd/design/implement`；
- 找到问题后直接修；
- 执行 lint/type-check/tests；
- 多包任务在最终检查时扩大到全影响范围。

如果 check 发现 PRD 缺陷，工作流要求回 Plan 修订；实现方向错误则重做 2.1；缺研究则写回 `research/`。这是一种清晰的人类/Agent操作协议。

但它不像 pipeline-lite 的 `verify-pass` / `verify-fail`：

- 没有独立的 verify phase visit；
- 没有绑定冻结 build SHA 的验证；
- 没有 exact-event review receipt；
- 默认没有一份 canonical verification report 文档；
- “修复后变绿”主要由 Agent 执行结果和对话/commit 承载。

因此 Trellis 的 check 更像 Superpowers 风格的执行内质量循环，而不是 pipeline-lite 的独立对抗式 Verify gate。

### 3.6 Finish：把稳定知识提升到长期 spec，再归档 task 与写 journal

Finish 有三个不同层次的写回：

1. 如果反复调试，`trellis-break-loop` 产出复盘；
2. `trellis-update-spec` 判断哪些稳定知识应从 task 提升到 `.trellis/spec/`；
3. `/trellis:finish-work` 归档 task，并把本次工作的摘要、commit、测试、下一步写入 developer workspace journal。

证据（[`workflow.md:567-593`](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/templates/trellis/workflow.md#L567-L593)）：

```text
## Phase 3: Finish

Goal: ensure code quality, capture lessons, record the work.

#### 3.2 Debug retrospective `[on demand]`

If this task involved repeated debugging (the same issue was fixed multiple times), load the `trellis-break-loop` skill to:
- Classify the root cause
- Explain why earlier fixes failed
- Propose prevention

The goal is to capture debugging lessons so the same class of issue doesn't recur.

#### 3.3 Spec update `[required · once]`

Load the `trellis-update-spec` skill and review whether this task produced new knowledge worth recording:
- Newly discovered patterns or conventions
- Pitfalls you hit
- New technical decisions

Update the docs under `.trellis/spec/` accordingly. Even if the conclusion is "nothing to update", walk through the judgment.

#### 3.4 Commit changes `[required · once]`

**Spec-sync preamble**: before drafting commits, ask: did this task fix a bug or surface non-obvious knowledge that should land in `.trellis/spec/` so future-you (or future-AI) doesn't repeat the mistake? If yes, return to Phase 3.3 first — spec writes belong in the same task's commit batch, not as a forgotten follow-up.
```

归档脚本把 `task.json.status` 改成 `completed`、写 `completedAt`、清理所有指向该 task 的 session pointer、移动到 `archive/{year-month}/`，随后进行窄范围自动提交。

证据（[`task_store.py:551-604`](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/templates/trellis/scripts/common/task_store.py#L551-L604)，节选）：

```python
# Update status before archiving
today = datetime.now().strftime("%Y-%m-%d")
modified_children: list[str] = []
if task_json_path.is_file():
    data = read_json(task_json_path)
    if data:
        data["status"] = "completed"
        data["completedAt"] = today
        write_json(task_json_path, data)

# Clear any session that still points at this task before the path moves.
from .active_task import clear_task_from_sessions
clear_task_from_sessions(str(task_dir), repo_root)

# Archive
result = archive_task_complete(task_dir, repo_root)
if "archived_to" in result:
    archive_dest = Path(result["archived_to"])
    year_month = archive_dest.parent.name
    print(colored(f"Archived: {dir_name} -> archive/{year_month}/", Colors.GREEN), file=sys.stderr)
```

## 4. 文档怎样分层、更新、索引和归档

Trellis 实际有四个文档平面。

### 4.1 产品管理平面：workflow、Skills、Hooks、Agents

典型位置：

- `.trellis/workflow.md`
- `.{platform}/skills/trellis-*/`
- `.{platform}/agents/trellis-*`
- `.{platform}/hooks*`
- `.trellis/scripts/`

这些是 Trellis CLI 安装/更新管理的模板。CLI 用 SHA256 记录模板原始状态，更新时保守判断用户是否修改；对 AGENTS 等混合文件只替换 managed block。

### 4.2 项目长期知识平面：`.trellis/spec/`

结构是：

```text
.trellis/spec/
  guides/index.md
  <package>/<layer>/index.md
  <package>/<layer>/<topic>.md
```

每个 layer 的 `index.md` 是入口，包含 Pre-Development Checklist 和 Quality Check；实际规则分散在其链接的 topic docs。实现前由 `trellis-before-dev` 先读 index，再读相关底层规范；收尾由 `trellis-update-spec` 更新 topic docs，并同步 index。

这相当于一个持续演进的“项目内 LLM wiki”，但它没有 OpenSpec delta → main spec 的正式 apply 语义，也没有内容 hash/read receipt。

### 4.3 Task 临时知识平面：`.trellis/tasks/<task>/`

典型结构：

```text
task.json
prd.md
design.md
implement.md
research/*.md
implement.jsonl
check.jsonl
```

它将 WHAT、技术设计、执行计划、研究证据和机器消费清单放在一个 task capsule 内。完成后整个目录原样移动到 archive，所以历史上下文不会因“主规格更新”而消失。

### 4.4 Developer workspace 平面：`.trellis/workspace/<developer>/`

包含：

- `index.md`：总 session 数、最近活跃 journal 等；
- `journal-N.md`：每次 session 的标题、日期、摘要、commit、测试、下一步。

journal 超过配置行数就轮转，默认文档说明是 2000 行。它主要服务跨 session 人类/Agent 恢复，不等价于 task 的下一步上下文输入。

### 4.5 所有权与更新边界

`trellis update` 明确保护 workspace、tasks、spec、developer identity，不触碰这些用户数据：

证据（[`update.ts:115-123`](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/commands/update.ts#L115-L123)）：

```ts
// Paths that should never be touched (true user data)
// spec/ is user-customized content created during init; update should never modify it
const PROTECTED_PATHS = [
  `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.WORKSPACE}`, // workspace/
  `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.TASKS}`, // tasks/
  `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.SPEC}`, // spec/
  `${DIR_NAMES.WORKFLOW}/.developer`,
  `${DIR_NAMES.WORKFLOW}/.current-task`,
];
```

模板 hash 也明确排除这些目录；没有旧 hash 时保守视为“用户已修改”。这比单纯覆盖插件文件更安全，也让“产品升级”和“项目知识演进”成为两条不同通道。

## 5. 文档如何真正喂给下一步

### 5.1 三条加载路径

Trellis 有三种上下文加载路径：

| 路径 | 触发时机 | 输入 | 输出 |
|---|---|---|---|
| SessionStart | 会话启动 | runtime/session/task/workspace | 最小恢复地图 |
| UserPromptSubmit | 每个用户 turn | active task status + `workflow.md` tag | 当前状态 breadcrumb |
| SubagentStart / profile pull | dispatch 角色 Agent | active task + role JSONL + task docs | 实现/检查专属上下文 |

这里的核心不是“把上一阶段全文复制到下一阶段”，而是：

1. task path 是稳定引用；
2. task artifacts 是共享、持久、可读文件；
3. JSONL 指定额外知识；
4. Hook 在角色启动边界按确定顺序物化；
5. journal 只承担跨 session 回忆，不能替代 task artifacts。

### 5.2 固定读取顺序

实现/检查角色都遵守：

```text
role.jsonl entries
→ prd.md
→ design.md（若有）
→ implement.md（若有）
```

顺序的含义是：先建立项目规范与研究约束，再读取这个任务的 WHAT、HOW、执行步骤。它避免 Agent 先被计划细节锚定，然后忽略仓库规范。

证据（[`inject-subagent-context.py:481-500`](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/templates/shared-hooks/inject-subagent-context.py#L481-L500)）：

```python
def get_implement_context(repo_root: str, task_dir: str) -> str:
    """
    Complete context for Implement Agent

    Read order:
    1. All files in implement.jsonl (spec/research manifests)
    2. prd.md (requirements)
    3. design.md if present (technical design)
    4. implement.md if present (execution plan)
    """
    limits = _get_limits(repo_root)
    budget = _Budget(limits["max_total_bytes"])
    context_parts = []

    # 1. Read implement.jsonl
    base_context = get_agent_context(repo_root, task_dir, "implement", limits, budget)
    if base_context:
        context_parts.append(base_context)
```

### 5.3 路径验证和上下文预算

JSONL consumer 会：

- 忽略没有 `file` 的 seed 行；
- 检查路径存在；
- 支持文件/目录；
- 记录 `reason`；
- 对空清单发 warning；
- 对单项/汇总注入做大小限制；
- 缺 manifest 时退化为 task artifacts。

这是一种“可解释的上下文清单”，但没有把每条输入绑定到内容摘要，所以文件在 Plan 后被修改时，下一角色看不到“清单仍指向同一路径、内容已经漂移”的差异。

### 5.4 Session-scoped active task

Trellis 把 active task 写在：

```text
.trellis/.runtime/sessions/<context_key>.json
```

解析顺序依赖 hook input、`TRELLIS_CONTEXT_ID` 和各平台原生 session env。没有 session identity 时不写共享全局 current-task；pull 子 Agent 只有在“恰好一个 session pointer”时才允许 fallback，0 个或多个都拒绝猜测。

证据（[`active_task.py:493-527`](https://github.com/mindfold-ai/Trellis/blob/12e279a8af00456b1d0d4e3d0f7f59e7b702202e/packages/cli/src/templates/trellis/scripts/common/active_task.py#L493-L527)，节选）：

```python
def resolve_active_task(
    repo_root: Path,
    platform_input: dict[str, Any] | None = None,
    platform: str | None = None,
    *,
    allow_single_session_fallback: bool = True,
    allow_environment_context: bool = True,
) -> ActiveTask:
    """Resolve the active task from session runtime state only.

    A stale session task is returned as stale. Missing context identity or a
    missing/empty session context falls back to single-session inference: if
    exactly one session file exists in the runtime, return its task with
    source_type="session-fallback" — covers pull-based platform sub-agents
    that don't inherit the parent's session id. ≥2 files or 0 files yield
    ActiveTask(None) — refuses to guess across windows.
    """
```

这是 Trellis 相对当前 pipeline-lite 的一个实质优势。当前 pipeline-lite 已经有严格的 host-session → Change 观测 sidecar，但 canonical 恢复候选 `.pipeline-active` 仍是 repo 级：

证据（当前仓 `packages/cli/src/commands/session.ts:11-19`）：

```ts
 * 与老仓的差异（诚实标注，GOAL C 精神——不臆造实现）：
 *   · activate 的持久化端在老仓委托 session_store.py（R20 per-session context-keyed 指针，解析
 *     CC session id / Cursor ticket / single-session fallback）；该 context_key 解析子系统本仓没有。
 *     本仓 activate 的真实副作用是「repo 级 .pipeline-active 平指针」（老仓 state-session.sh:18 记载的
 *     设计意图）：指针是 repo 粒度而非 session 粒度——同一 repo 多个并发 session 共享一个活跃指针，
 *     互相覆盖。因此 Hook 只把它作为「用户明确继续/点名 change」时的恢复候选，绝不自动把它注入新会话。
 *     换粒度的接缝是 SessionFs.bindPointer（注入面已就位，见下方 SessionFs）。可选的
 *     `--host-session <id>` 另写一个严格 session→Change 的非 canonical 观测投影；它只让
 *     dashboard 判断原生终端是否仍在执行，绝不参与恢复、guard 或状态转换。
```

pipeline-lite 已经通过“不自动从 `.pipeline-active` 恢复”规避串任务，但还没有把 per-session binding 提升为恢复/路由的 canonical 输入。

## 6. 与当前 pipeline-lite 的逐项对比

| 维度 | Trellis v0.6.9 | 当前 pipeline-lite | 判断 |
|---|---|---|---|
| 流程模型 | Plan / Execute / Finish；状态主要是 planning/in_progress/completed | 7 phase DAG，含 build→spec、verify→build 回退 | pipeline-lite 更强 |
| OpenSpec | 没有运行时集成；自有 PRD/design/spec wiki | OpenSpec proposal/design/delta/tasks/apply/archive | pipeline-lite 更强 |
| Superpowers | 没有外部依赖；自有 brainstorming/check/update-spec | mandatory skill matrix 真包含 brainstorming/writing-plans/TDD/verification 等 | pipeline-lite 更直接 |
| Skill 强制 | workflow prose + breadcrumb + agent profile | mandatory skill receipt + guard | pipeline-lite 更强 |
| 文档所有权 | task/spec/workspace 与 CLI 模板明确分离 | OpenSpec、Superpowers docs、ADR、ledger、pipeline state 分层 | Trellis 更容易理解 |
| 文档真实性 | 路径存在/内容可读/上下文大小；无内容摘要绑定 | SHA256、producer、current visit read receipt | pipeline-lite 更强 |
| 下一步输入 | implement/check JSONL，带 reason、按角色注入 | `pipeline document read` 按 kind/phase；常见路径偏“读全部必需文档” | Trellis 更精细 |
| 上下文预算 | consumer 有 size cap 和降级 | 尚无统一、用户可见的 phase/role budget contract | Trellis 更成熟 |
| 会话绑定 | per-session active task；拒绝多候选猜测 | repo 级恢复候选 + non-canonical host-session 观测绑定 | Trellis 更强 |
| Review | planning 人工复核是协议要求 | exact transition event receipt | pipeline-lite 更强 |
| Verify | 执行内 check、自修、验证 | 冻结 build 基线、独立 verify、pass/fail 回退 | pipeline-lite 更强 |
| 长期知识 | update-spec 写 `.trellis/spec/` wiki | OpenSpec main spec apply + ADR/learn-record | 两者目的不同；pipeline 更可审计 |
| 归档 | 整个 task capsule 移入 archive + journal | canonical archive、OpenSpec apply/archive、ledger/state 历史 | pipeline-lite 治理更强 |
| 跨 session 恢复 | task pointer + task capsule + developer journal | Change state + OpenSpec docs + ledger + terminal sidecar | pipeline 内容更真，Trellis 入口更直接 |

### 6.1 pipeline-lite 已经做对的事情

当前 manifest 把 phase、回退边和 review phase 作为单一真相源：

证据（当前仓 `templates/manifest.yaml:23-50`）：

```yaml
phases:
  - open
  - explore
  - spec
  - build
  - verify
  - ship
  - archive

transitions:
  open: [explore]
  explore: [spec]
  spec: [build]
  build: [verify, spec]
  verify: [ship, build]
  ship: [archive]
  archive: [archive]

review_phases: [explore, spec, verify]
```

Skill 也不是软推荐。phase × track 的 mandatory matrix 会被 guard 消费：

证据（当前仓 `templates/manifest.yaml:61-87`，节选）：

```yaml
mandatory_skills:
  open._all: [openspec-propose]
  explore.pm: [brainstorming, grill-with-docs]
  explore.frontend: [openspec-explore, brainstorming, grill-with-docs]
  explore.backend: [openspec-explore, brainstorming, grill-with-docs, improve-codebase-architecture]
  spec.pm: [openspec-propose, brainstorming, writing-plans, grill-with-docs]
  spec.frontend: [openspec-propose, writing-plans]
  build.frontend: [test-driven-development, frontend-design, web-design-guidelines, design-taste-frontend]
  build.backend: [writing-plans, test-driven-development]
  verify.frontend: [verification-before-completion, e2e-testing, browser-qa, web-design-guidelines, design-taste-frontend]
  verify.backend: [verification-before-completion]
  ship.frontend: [openspec-apply-change, openspec-archive-change, finishing-a-development-branch]
```

document ledger 记录的不只是路径，还包括内容摘要、producer 和每次读取：

证据（当前仓 `packages/kernel/src/state/document-ledger.ts:41-63`）：

```ts
export const DOCUMENT_LEDGER_FILE = '.pipeline-documents.json'
export interface DocumentReadReceipt {
  readonly phase: string
  readonly sha256: string
  readonly readAt: string
  readonly visitId?: string
}

export interface DocumentRecord {
  readonly kind: DocumentKind
  readonly path: string
  readonly sha256: string
  readonly producer: string
  readonly recordedAt: string
  readonly reads: readonly DocumentReadReceipt[]
}

export interface DocumentLedger {
  readonly version: 1
  readonly contract: 'openspec-v1'
  readonly createdAt: string
  readonly records: readonly DocumentRecord[]
}
```

guard 会检测当前文件摘要漂移，并要求当前 phase 的当前 visit 真正读取：

证据（当前仓 `packages/kernel/src/state/document-evidence.ts:156-176`）：

```ts
const digests = await Promise.all(records.map((record) => currentRecordDigest(repoRoot, record)))
if (records.some((record, index) => digests[index] !== record.sha256)) {
  blockers.push(`document '${kind}' 已缺失或内容变化；重新执行 pipeline document record 后再继续`)
  items.push(item(kind, 'stale', requiredRead, records))
  continue
}
if (requiredRead && (
  currentVisitId === undefined
  || records.some((record) => !record.reads.some(
    (receipt) => receiptMatchesVisit(receipt, phase, record.sha256, currentVisitId),
  ))
)) {
  if (currentVisitId !== undefined) {
    blockers.push(
      `document '${kind}' 尚未由 ${phase} 的当前 step visit 读取；执行 pipeline document read <change> ${kind}`,
    )
  }
  items.push(item(kind, 'unread', requiredRead, records))
  continue
}
```

这些都是 Trellis 不具备、且不应为了“更轻”而丢掉的能力。

### 6.2 pipeline-lite 当前的实际缺口

#### 缺口 A：ledger 回答“是否可信”，没有直接回答“下一角色该读什么”

当前 ledger 是治理账本。它擅长判断：

- 文档是否存在；
- producer 是否被允许；
- SHA 是否漂移；
- 当前 visit 是否读过。

但它还不是一个角色化的 context manifest。Agent 仍需要从 phase skill、document policy 和当前任务推导：

- 实现者应该读哪些研究文档；
- reviewer 与 e2e runner 是否需要不同输入；
- 哪些文档全文读，哪些只读摘要；
- 为什么某份文档属于这个角色。

Trellis 的 JSONL 正好补足“路由意图”，pipeline-lite 的 ledger 正好补足 Trellis 缺失的“真实性与审计”。

#### 缺口 B：文档分散且缺少统一的人类入口

当前一个 Change 的知识会分布在：

- `openspec/changes/<change>/proposal.md`
- `design.md`
- `tasks.md`
- `specs/**/spec.md`
- `docs/superpowers/specs/...`
- `docs/adr/...`
- verification report / review artifacts
- `.pipeline-documents.json`
- canonical state/history/review receipts

这种结构治理性强，但恢复时的认知入口比 Trellis task capsule 更复杂。问题不是文件多，而是缺少一个由系统生成的“本 Change 文档地图”。

#### 缺口 C：上下文预算与降级语义不够显式

当前 contract 关注必读与 evidence，却未形成统一的：

- 每 role 最大注入字节；
- 单文件上限；
- required 文档不可截断；
- optional research 超限时只保留摘要/路径；
- 被截断/未加载内容的机器可读标志；
- 展示给用户的预算诊断。

文档越来越长时，“全部读取”会从强约束变成上下文质量风险。

#### 缺口 D：恢复候选仍是 repo 粒度

pipeline-lite 已明确禁止自动从旧 `.pipeline-active` 猜任务，也已有 host-session sidecar；但真正供恢复/路由使用的 active pointer 仍是 repo 级。在同仓多会话时，安全性靠“不要自动使用”，不是靠“每会话天然隔离”。

## 7. 方案比较

### 方案 A：直接采用 Trellis task/spec 模型

做法：

- 用 task capsule 代替 OpenSpec change；
- 用 Plan/Execute/Finish 代替 7 phase；
- 用 JSONL + Hooks 代替 document ledger/read receipt；
- 用 update-spec 直接写长期 spec。

优点：

- 用户心智简单；
- 跨平台适配成熟；
- next-step context 很直观。

缺点：

- 丢失 exact-event review receipt；
- 丢失 producer/sha/current-visit read evidence；
- 丢失 build/verify barrier 和受控回退；
- 丢失 OpenSpec delta apply/archive；
- 很多硬 guard 退化为 prose 纪律。

结论：**不推荐。**

### 方案 B：保留治理内核，在 ledger 之上编译 Context Bundle

做法：

- canonical truth 仍是 effective workflow + document policy + document ledger；
- 每次进入 phase/step 或 dispatch role 前，系统编译 role-scoped bundle；
- bundle 只引用 ledger 中当前 SHA 的文档和显式批准的非 ledger 辅助材料；
- Hook/Skill 从 bundle 注入，不再各自重新推导；
- read receipt 在实际消费 bundle 时写入。

优点：

- 保留现有所有硬治理；
- 获得 Trellis 的下一步路由、reason 和上下文预算；
- 能给主 Agent、reviewer、e2e runner 不同输入；
- 能统一人类恢复入口与机器注入入口；
- 可以逐步上线。

缺点：

- 要定义 bundle 生命周期与失效规则；
- 要处理 optional research 是否进入 ledger；
- 需要避免生成新的第二真相源。

结论：**推荐。**

### 方案 C：只新增一个静态 CONTEXT.md

优点是实现快、便于人读；缺点是无法可靠驱动角色注入，也无法表达预算、摘要漂移和 required/optional。可作为方案 B 的人类投影，但不应单独作为核心方案。

## 8. 推荐目标设计

### 8.1 数据模型

建议新增一个可再生成的 context projection，例如：

```text
.pipeline/context/<visit-id>/
  build.implement.json
  verify.reviewer.json
  verify.e2e.json
  verify.exec.json
  ship.json
  CONTEXT.md
```

单项建议字段：

```json
{
  "kind": "design-doc",
  "path": "docs/superpowers/specs/foo-design.md",
  "sha256": "…",
  "producer": "brainstorming",
  "reason": "实现必须遵守已确认的边界和数据流",
  "required": true,
  "delivery": "full",
  "max_bytes": 40000,
  "owner_phase": "explore"
}
```

bundle 顶层还应包含：

- protocol/version；
- change；
- workflow id/version；
- phase / policy step / visit id；
- role；
- generated_at；
- effective plan fingerprint；
- total budget；
- truncation policy；
- item 列表；
- validation status 与 blockers。

### 8.2 真相源规则

1. Bundle 是投影，不是新的 canonical truth。
2. 每次生成都从 effective plan、document policy、ledger 和当前 visit 读取。
3. required ledger doc 的路径/SHA/producer 必须完全匹配，否则生成失败。
4. optional research 若不入 ledger，必须标记 `unverified_auxiliary`，不能满足任何 guard。
5. bundle 的 `visit_id` 改变即过期。
6. 任一被引用文件 SHA 改变即过期。
7. write receipt 发生在 consumer 实际加载后，不发生在“生成 bundle”时。

### 8.3 Role 路由

建议最低覆盖：

| Phase | Role | 必需输入 |
|---|---|---|
| Explore | researcher | proposal、已知约束、指定研究范围、已有 ADR |
| Spec | planner | proposal、exploration design、ADR、delta spec 上下文 |
| Build | implementer | delta spec、approved design、plan/tasks、相关长期 spec |
| Verify | reviewer | delta spec、design、tasks、build SHA、代码 diff |
| Verify | e2e runner | acceptance scenarios、运行方式、build SHA |
| Verify | independent exec | verification rubric、build SHA、已声明风险 |
| Ship | releaser | verify report、pass receipt、delta spec、apply/archive 指令 |

不要让三个 Verify 角色默认吃同一份“全部文档”；这正是角色化 bundle 的价值。

### 8.4 预算与截断

建议规则：

- machine contract（delta spec、state、review receipt 摘要）不可截断；
- required human docs 超限则阻断并要求拆分/重录摘要，不能静默裁剪；
- optional research 可以“摘要 + 路径 + SHA”；
- 每项明确标记 `full | summary | reference_only`；
- 输出 `used_bytes / budget_bytes`；
- 对未加载项显示原因；
- 上下文注入日志不得被当成 document read receipt，只有 consumer 成功确认后才记录。

### 8.5 CLI 与可观测性

建议新增：

```bash
pipeline context build <change> --step build --role implementer
pipeline context inspect <change> --step verify --role reviewer
pipeline context validate <change> --step verify --role e2e
pipeline context consume <change> --bundle <path>
```

`inspect` 应输出：

- 文件、kind、producer、SHA；
- reason；
- required/optional；
- delivery mode；
- bytes；
- stale/unread/missing；
- bundle 为什么失效。

Dashboard 可把它显示为“下一步将读取”而不是只显示“文档已登记”。

## 9. 分阶段改进路线

### P0：先做只读 Context Inspector

范围：

1. 从 effective plan + document policy + ledger 推导下一 step 的必需文档；
2. 按 role 展示路径、SHA、producer、reason；
3. 不改变 guard，不自动写 receipt；
4. 补 golden tests，确保 projection 与当前 document evidence 一致。

价值：先验证“角色化输入”的数据模型，不改变流程安全边界。

### P1：加入可再生成 Bundle 与预算验证

范围：

1. 生成 canonical JSON projection；
2. 增加 `required/full/summary/reference_only`；
3. 加单项/总预算；
4. 文件变化、visit 变化、effective plan 变化时判 stale；
5. 生成人类可读 `CONTEXT.md`，但标明 generated，不允许手改满足 gate。

### P2：接入 Agent dispatch 与 Hook

范围：

1. build/verify/ship role 从 bundle 注入；
2. consumer 成功加载后写 current-visit read receipts；
3. 主 Agent 不再手动“读 all”后把所有内容转述给子 Agent；
4. 保留 child-side pull fallback；
5. Hook 失败时 fail-closed 还是降级，按 required/optional 分开处理。

### P3：把 per-session Change binding 提升为真正恢复输入

范围：

1. `.pipeline/terminal-sessions/<host-session>.json` 从仅观测扩展成受约束的恢复映射；
2. 明确 canonical state 仍在 Change run store；
3. 0 个绑定则要求显式选择；
4. 1 个合法绑定可恢复；
5. 多个/冲突/过期绑定拒绝猜测；
6. `.pipeline-active` 保留兼容但降为 legacy recovery hint。

这个改动风险比 Context Inspector 高，应独立设计，不和 P0/P1 捆绑。

## 10. 不建议照搬的 Trellis 设计

1. **不要把 7 phase 压缩成 planning/in_progress/completed。**
   当前 pipeline 的受控回退和独立 Verify 是核心价值。

2. **不要用 prompt breadcrumb 代替 transition guard。**
   breadcrumb 适合引导，不能替代 canonical event 与 receipt。

3. **不要让 JSONL 路径存在性代替 SHA/producer/read evidence。**
   Trellis manifest 易用，但内容可在规划后漂移。

4. **不要用直接 update-spec 替代 OpenSpec delta apply。**
   长期规范的合并需要保留 change 边界与 archive 历史。

5. **不要把 check 自修当成独立 Verify。**
   实现者/检查者能修复很实用，但不能替代冻结产物上的对抗式验证。

6. **不要让 journal 成为下一步 SSOT。**
   journal 是恢复摘要，task/change artifacts 才是工作契约。

## 11. 可确认事实、推断与建议分离

### 可确认事实

- Trellis v0.6.9 的 npm 包依赖不含 OpenSpec/Superpowers。
- 官方仓库将二者放在已归档 competitor research 中。
- Trellis 的主工作流是 Plan/Execute/Finish。
- `workflow.md` tag 是 per-turn breadcrumb 单一真相源。
- task capsule 包含 PRD、可选 design/implement/research 和 role JSONL。
- subagent 注入顺序是 JSONL → PRD → design → implement。
- active task 是 session-scoped。
- task/spec/workspace 是 updater protected user data。
- archive 会改状态、清 session pointer、移动 task 目录。
- 当前 pipeline-lite 的文档 ledger 有 SHA、producer 和 current-visit read receipt。

### 分析推断

- Trellis 是对 OpenSpec/Superpowers 思想的原生重实现，而不是运行时集成。
- Trellis 的主要优势在上下文产品化和跨会话可操作性，不在流程治理强度。
- 当前 pipeline-lite 的最大改进机会是把 ledger 编译成 role-scoped context，而不是重写状态机。

### 推荐

- 选择方案 B：保留治理内核，新增可再生成 Context Bundle。
- 先做只读 inspector，再做预算与注入，最后单独升级 per-session 恢复。
- 把 Trellis 的 `file + reason + role` 与 pipeline 的 `kind + sha + producer + visit receipt` 合并，而不是二选一。

## 12. 未决问题

1. 辅助 research 文档是否全部纳入 document ledger，还是允许 `unverified_auxiliary`？
2. `reason` 由 workflow policy 声明、phase skill 生成，还是允许 Agent 自由填写？
3. required 文档超预算时，是强制拆分、生成受审计摘要，还是允许 reference-only？
4. Verify 三个角色的最小输入集合分别是什么，哪些内容必须隔离以保持独立性？
5. per-session binding 是否只用于恢复路由，还是也应参与 Skill/document receipt 的 host identity 校验？

## 13. 结论

Trellis 的“喂给下一步”不是靠一份万能大文档，而是靠四层组合：

```text
session pointer
  → workflow status breadcrumb
  → task artifacts
  → role-specific context manifest
  → SubagentStart / skill loader
```

当前 pipeline-lite 已经拥有更强的：

```text
canonical phase DAG
  → exact-event review
  → Skill evidence
  → document ledger
  → digest + producer + current-visit read receipt
```

最佳合并方向是：

```text
pipeline governance truth
  → compile role-scoped Context Bundle
  → validate hash / producer / visit / budget
  → inject only what the next role needs
  → record actual consumption
```

这能把 pipeline-lite 从“文档证据可靠”进一步推进到“文档证据可靠，而且下一步上下文明确、克制、可解释、可恢复”，同时不牺牲现有 OpenSpec、Superpowers、review 和 Verify 的硬治理优势。
