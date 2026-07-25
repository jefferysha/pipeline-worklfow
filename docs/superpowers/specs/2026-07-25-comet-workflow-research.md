# Comet 如何嵌入 OpenSpec 与 Superpowers：工作流、产物治理与跨阶段交接

> 研究日期：2026-07-25
> 研究对象：[`rpamis/comet`](https://github.com/rpamis/comet)
> 固定版本：`0.4.0-beta.9`
> 固定提交：[`84038b0d6b7c185b233f0f36b294ae74dd9121d0`](https://github.com/rpamis/comet/tree/84038b0d6b7c185b233f0f36b294ae74dd9121d0)
> 上游提交时间：2026-07-25T00:47:10+08:00
> 证据原则：仅使用该固定提交中的官方源码、官方 Skill 与官方文档；正文中的短节选用于就近解释，附录 A 提供每段 5–40 行的连续逐字源码证据。

## 执行摘要

用户所说的 Comet 可由本仓既有引用唯一确认成 `rpamis/comet`。需要进一步限定的是：**只有 Comet Classic 把 OpenSpec 与 Superpowers 组合进流程；Comet Native 明确是自包含工作流，不依赖二者。**

Comet Classic 的核心不是把两个框架简单顺序调用，而是建立三层结构：

1. **OpenSpec 管 WHAT**：change、proposal、high-level design、delta spec、tasks、main spec 与 archive。
2. **Superpowers 管 HOW**：brainstorming、深技术 Design Doc、implementation plan、TDD、执行、debug、review、verification 方法。
3. **Comet 管 WHEN / WHO / WHETHER**：五个宏观 phase、`.comet.yaml`、Run/trajectory/checkpoint、phase guard、写入 Hook、当前 change 选择、自动转场和恢复。

它的最强做法是：

- 把每个阶段要真正触发的 OpenSpec/Superpowers Skill 写成强命令式协议；
- 用脚本生成、带源路径与 SHA256 的 OpenSpec → Superpowers handoff；
- 用状态字段记录 Design Doc、Plan、Verification Report 的路径；
- 用 phase guard 校验文档存在、结构、任务完成度、handoff 新鲜度、真实 build/verify 证据；
- 用 `.comet/subagent-progress.md`、Run context、artifact index、trajectory 和 checkpoint 支持压缩后恢复；
- 归档时调用 OpenSpec delta merge，将 change 移入 archive，并给 Superpowers 文档加归档元数据。

它的关键局限也很明确：

- “必须触发 nested Skill”主要由 Skill 文本约束；Classic guard 没有证明某次 host Skill 调用真实发生的 producer/read receipt。
- 人工确认多数存在于 prompt 协议，而不是与 exact transition 绑定的持久 receipt；`archive_confirmation` 是明显例外。
- `context_compression` 官方运维文档已经与当前实现漂移：文档说 beta 只保留 Spec hash，当前代码实际逐字投影 delta specs，并只对 supporting artifacts 做 hash 引用。
- Build 的计划子任务明确读取 Design Doc 与 `tasks.md`，却没有硬性要求读取前一步的 handoff context；handoff 主要服务 Design 阶段把 OpenSpec 喂给 brainstorming，名称“Design → Build handoff”容易造成误解。
- Verify 的 light 模式明确跳过 spec scenario coverage、Design Doc 深比较和 drift detection；只有 full 模式调用 OpenSpec verify。

这些特征意味着：Comet 的优势主要是**流程脚本化、上下文打包和恢复可操作性**；若要在当前 pipeline-lite 上借鉴，应吸收其 deterministic handoff、分层文档、subagent checkpoint 和 Skill snapshot，同时保留 pipeline-lite 更强的 phase-owned producer/read receipt、exact-event review receipt 与 canonical document ledger。

## 1. 精确身份与研究边界

Comet 官方 README 将 Native 与 Classic 定义为彼此独立的工作流：Native 只依赖 Comet runtime；Classic 才保留 OpenSpec + Superpowers 的完整阶段治理。因此，本报告分析对象是 **Comet Classic full workflow**，并把 hotfix/tweak 作为旁路说明；Native 只用于划清边界。

证据（[`README-zh.md:41-62`](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/README-zh.md#L41-L62)）：

```text
41 **Comet 是一个面向Coding的可恢复长程任务工作流与 Skill 平台。**
42
43 它提供两套彼此独立的需求工作流：面向强模型、只依赖 Comet 原生 runtime 的 Native，以及保留 OpenSpec + Superpowers 完整阶段治理的 Classic；同时覆盖 Skill 创建、评估与发布。
44
45 让你可以用一个工具链处理需求到归档、中断后恢复，将任意Skill组合得像Comet一样，基于科学的**Rubric**、**Pass@k**、**Pass^k**评分演进你的Skill
46
47 > [!IMPORTANT]
48 > **0.4.0-beta.7** — 新增**面向强模型、原生且可恢复**的 Native 工作流，Native 与 Classic 通过统一配置、状态、Guard、Dashboard 及 Eval 入口实现独立协作。
49 >
50 > **0.4.0-beta.1** — Comet 升级为纯 Node runtime（不再依赖 Bash/WSL）
51 >
52 > **0.3.9** — `review_mode: off|standard|thorough` 控制 Build/Verify 自动代码审查并支持项目级默认
53 >
54 > 详见官网 [Changelog](https://docs.comet.rpamis.com/zh/changelog)。
55
56 > Native 与 Classic 不是轻重档位，也不会互相升级。Native 服务于能够自主规划和验证的强模型；Classic 服务于需要完整阶段方法与强约束的场景。
57
58 ## 为什么需要 Comet
59
60 - **面向强模型的 Native 工作流** — `/comet-native` 用详细 brief、完整目标规格、状态检查和可恢复归档约束结果
61 - **长程任务稳定的核心**— Comet 的 Classic Spec 模式结合 OpenSpec 和 Superpowers，用状态机、阶段检查与脚本串联五阶段流程
62 - **配置驱动的统一入口** — `/comet` 只读取项目的 `.comet/config.yaml`，确定性转发到 `/comet-native` 或 `/comet-classic`
```

安装器也把这条边界落实到代码：只有选中 Classic 时才检查并安装 OpenSpec 与 Superpowers。

证据（[`app/commands/init.ts:545-565`](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/app/commands/init.ts#L545-L565)）：

```ts
for (const platform of selectedPlatforms) {
  const hasOS = includesWorkflow(workflowSelection, 'classic')
    ? await hasSkills(baseDir, platform, 'openspec', selectedPlatforms, scope)
    : false;
  const hasSP = includesWorkflow(workflowSelection, 'classic')
    ? await hasSkills(baseDir, platform, 'superpowers', selectedPlatforms, scope)
    : false;
  const hasCM = await hasSkills(baseDir, platform, 'comet', selectedPlatforms, scope, {
    includeGlobalFallback: false,
  });

  let osAction = includesWorkflow(workflowSelection, 'classic')
    ? resolveAction(hasOS, options)
    : 'skip';
  let spAction = includesWorkflow(workflowSelection, 'classic')
    ? resolveAction(hasSP, options)
    : 'skip';
  let cmAction =
    workflowSelection === 'classic'
      ? resolveCometAction(hasCM, options)
      : resolveAction(hasCM, options);
```

## 2. 总体模型：五个 phase，多个内部步骤

Classic 对用户呈现五个宏观 phase：

```text
open → design → build ⇄ verify → archive
```

- full：五阶段完整执行；
- hotfix/tweak：`open → build ⇄ verify → archive`，跳过 deep design；
- `verify-fail` 回 build；
- preset 发现实质升级时可 `preset-escalate` 回 design。

在实现内部，五阶段会被进一步展开。Design 被拆成 handoff 与 document；Build 被拆成 plan、plan-ready、configure、execute、complete；Verify 被拆成 run 与 branch；Archive 被拆成 confirm 与 execute。也就是说，**“五阶段”是用户心智模型，不是最细执行图。**

证据（[`domains/comet-classic/classic-runtime-run.ts:87-155`](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/domains/comet-classic/classic-runtime-run.ts#L87-L155)，节选）：

```ts
orchestration: {
  mode: 'deterministic',
  entry: 'full.open',
  steps: [
    {
      id: 'full.open',
      action: { type: 'invoke_skill', ref: 'comet-open' },
      next: 'full.design.handoff',
    },
    {
      id: 'full.design.handoff',
      action: { type: 'invoke_skill', ref: 'comet-design' },
      next: 'full.design.document',
    },
    {
      id: 'full.design.document',
      action: { type: 'invoke_skill', ref: 'comet-design' },
      next: 'full.build.plan',
    },
    {
      id: 'full.build.plan',
      action: { type: 'invoke_skill', ref: 'comet-build' },
      next: 'full.build.plan-ready',
    },
    {
      id: 'full.build.plan-ready',
      action: { type: 'invoke_skill', ref: 'comet-build' },
      next: 'full.build.configure',
    },
    {
      id: 'full.build.configure',
      action: { type: 'invoke_skill', ref: 'comet-build' },
      next: 'full.build.execute',
    },
    {
      id: 'full.build.execute',
      action: { type: 'invoke_skill', ref: 'comet-build' },
      next: 'full.build.complete',
    },
```

状态机事件是代码级定义，不依赖 Agent 自行改 phase：

证据（[`domains/comet-classic/classic-transitions.ts:35-90`](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/domains/comet-classic/classic-transitions.ts#L35-L90)，节选）：

```ts
export const CLASSIC_TRANSITION_TABLE: Record<ClassicTransitionEvent, ClassicTransitionDefinition> =
  {
    'open-complete': {
      event: 'open-complete',
      from: 'open',
      guardRefs: ['open-artifacts-present'],
    },
    'design-complete': {
      event: 'design-complete',
      from: 'design',
      guardRefs: ['design-evidence-present'],
    },
    'build-complete': {
      event: 'build-complete',
      from: 'build',
      guardRefs: ['build-decisions-selected'],
    },
    'verify-pass': {
      event: 'verify-pass',
      from: 'verify',
      guardRefs: ['verification-report-present'],
    },
    'verify-fail': {
      event: 'verify-fail',
      from: 'verify',
      guardRefs: ['verification-failed'],
    },
    'archive-confirm': {
      event: 'archive-confirm',
      from: 'archive',
      guardRefs: ['archive-final-confirmation'],
    },
    archived: {
      event: 'archived',
      from: 'archive',
      guardRefs: ['verify-result-pass', 'archive-confirmed'],
    },
  };
```

## 3. 每一步如何嵌入 OpenSpec 与 Superpowers

### 3.1 Open：OpenSpec 负责澄清、change 与 WHAT 文档

Open 并非直接调用一个“一次性 propose”然后结束。full workflow 默认顺序是：

1. 强制加载 `openspec-explore`，持续澄清 goals、non-goals、scope、unknowns 与 acceptance scenarios；
2. 对大 PRD 先做人类 split 决策；
3. 强制加载 `openspec-new-change` 创建 change skeleton；
4. 立即初始化 `.comet.yaml` 并绑定 current change；
5. 以 `openspec status --json` 和 `openspec instructions <artifact-id> --json` 驱动 artifact DAG；
6. 对每个 ready artifact 读取其 dependency、template、instruction、context、rules，再写 `resolvedOutputPath`；
7. 所有 `applyRequires` 完成后，用户确认整批文档；
8. `comet guard <name> open --apply` 才进入 design。

Comet 明确避免硬编码 `proposal → design → tasks` 的生成顺序，而是消费 OpenSpec 返回的 artifact dependency graph。

证据（[`assets/skills/comet-open/SKILL.md:148-170`](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/assets/skills/comet-open/SKILL.md#L148-L170)）：

```text
After preflight, generate the implementation-required artifacts from the OpenSpec schema and dependency graph:

**OpenSpec status-driven artifact loop**:

1. Run `openspec status --change "<name>" --json` and parse the complete JSON.
2. Exit when every item in `applyRequires` is `done`; record `isComplete` as diagnostic only and do not use it as a phase blocker.
3. From unfinished `ready` artifacts, prioritize items that advance the `applyRequires` dependency closure and process them in CLI-returned order. Must not hard-code generation order or assume the schema contains only proposal/design/tasks.
4. Fetch current instructions for each ready `<artifact-id>`:

   `openspec instructions <artifact-id> --change "<name>" --json`

5. For the returned JSON instruction payload, you must:
   - Read every completed dependency artifact listed in `dependencies`
   - Use `template` as the artifact structure
   - Follow `instruction` guidance
   - Apply `context` and `rules` as constraints — **must not copy them into artifact content**
   - Write to `resolvedOutputPath`; for wildcard outputs, create each concrete file required by the instruction
   - Verify the concrete output files returned by the CLI exist and are non-empty
6. Re-run status after creating each artifact and revalidate `changeRoot`, core ids, and `applyRequires`.
```

Open 的默认产物为：

- `proposal.md`：why / what；
- `design.md`：high-level solution framework；
- `specs/<capability>/spec.md`：delta requirements 与 scenarios；
- `tasks.md`：任务边界；
- `.comet.yaml`：Comet 状态；
- `.openspec.yaml`：OpenSpec change metadata。

这里 `design.md` 不是 Superpowers Design Doc。前者是 OpenSpec 的高层架构方向，后者在下一个 phase 深化为具体实现设计。

### 3.2 Design：脚本化 handoff 把 OpenSpec 喂给 Superpowers brainstorming

Design 是 Comet 组合两套方法论最关键的位置：

1. `comet handoff <name> design --write` 从 OpenSpec 文档生成 deterministic context pack；
2. 强制加载 Superpowers `brainstorming`；
3. brainstorming 使用 handoff，而不是要求模型凭对话回忆 OpenSpec；
4. 用户确认技术方案；
5. 持久化 `brainstorm-summary.md`；
6. 创建 `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`；
7. 若 brainstorming 发现 delta spec 缺口，只允许做受限 Spec Patch；
8. 记录 `design_doc`；若 delta spec 改过，重建 handoff/hash；
9. design guard 检查路径、frontmatter、handoff 新鲜度与 traceability。

证据（[`assets/skills/comet-design/SKILL.md:30-81`](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/assets/skills/comet-design/SKILL.md#L30-L81)，节选）：

```text
### 1a. Generate OpenSpec → Superpowers Handoff Package

**Must be generated by script. Agent writing summaries on the fly is not allowed.**

`comet handoff <change-name> design --write`

Default `context_compression: off` generates:

openspec/changes/<name>/.comet/handoff/design-context.json
openspec/changes/<name>/.comet/handoff/design-context.md

Beta mode generates:

openspec/changes/<name>/.comet/handoff/spec-context.json
openspec/changes/<name>/.comet/handoff/spec-context.md

And writes to `.comet.yaml`:

handoff_context: openspec/changes/<name>/.comet/handoff/design-context.json
handoff_hash: <sha256>

Handoff package sources come from OpenSpec open phase artifacts:
- `proposal.md`: goals, motivation, scope, non-goals
- `design.md`: high-level architecture decisions, approach constraints
- `tasks.md`: initial task boundaries
- `specs/*/spec.md`: delta capability specs
```

随后才真正触发 Superpowers：

证据（[`assets/skills/comet-design/SKILL.md:83-121`](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/assets/skills/comet-design/SKILL.md#L83-L121)，节选）：

```text
### 1b. Execute Brainstorming (with Context)

**Immediately execute:** Use the Skill tool to load the Superpowers `brainstorming` skill. Skipping this step is prohibited.

After the skill loads, follow its guidance and use the following context:

Change: <change-name>
OpenSpec Context Pack: openspec/changes/<name>/.comet/handoff/design-context.md
Machine handoff: openspec/changes/<name>/.comet/handoff/design-context.json

If context_compression is beta, use:
OpenSpec Context Pack: openspec/changes/<name>/.comet/handoff/spec-context.md
Machine handoff: openspec/changes/<name>/.comet/handoff/spec-context.json

OpenSpec artifacts are the upstream source of truth, but you must not weaken the Superpowers `brainstorming` clarification flow by "skipping redundant context exploration".
Do not rewrite proposal/spec; if you find OpenSpec delta spec missing acceptance scenarios, you may only propose Spec Patches and write them back to OpenSpec delta spec.

Design Doc frontmatter must be minimal, containing only:
---
comet_change: <change-name>
role: technical-design
canonical_spec: openspec
---

Proceed through the original `brainstorming` skill flow: clarifying questions, 2-3 approaches, and step-by-step design confirmation.
```

这套设计有一个很清晰的 ownership 规则：OpenSpec delta spec 是 canonical requirement；Superpowers Design Doc 是技术深化，不得复制出第二套 requirements truth。

### 3.3 Build：Superpowers 负责计划、执行、TDD、debug 与 review

Build 把多个 Superpowers Skill 嵌入不同决策点：

| Build 子步骤 | 嵌入 Skill | 输入 | 产物/状态 |
| --- | --- | --- | --- |
| Plan | `writing-plans` | Design Doc + OpenSpec `tasks.md` | `docs/superpowers/plans/*.md`，记录 `plan` |
| Isolation | `using-git-worktrees`（若选 worktree） | plan + repo | worktree/branch binding |
| Execution | `executing-plans` 或 `subagent-driven-development` | plan | code commits + task checkoff |
| TDD | `test-driven-development`（若 `tdd_mode=tdd`） | 单任务 | RED/GREEN evidence |
| Debug | `systematic-debugging`（异常时） | failure evidence | root-cause/fix evidence |
| Review | `requesting-code-review`（由 `review_mode` 控制） | diff + task + tests | review findings/rationale |
| Spec change | `brainstorming`（中型语义变化） | implementation finding | Design Doc + delta spec 更新 |

Plan 的 producer 被刻意放到 subagent，避免占满主会话；失败时才 inline fallback。

证据（[`assets/skills/comet-build/SKILL.md:30-68`](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/assets/skills/comet-build/SKILL.md#L30-L68)）：

```text
### 1. Create Plan (Subagent Offload)

Create the implementation plan through a subagent, avoiding planning skill occupying main session context.

**Subagent instructions**:

1. **Immediately execute:** Use the Skill tool to load the Superpowers `writing-plans` skill. Skipping this step is prohibited.
2. Read the Design Doc (technical design document under `docs/superpowers/specs/`)
3. Read `openspec/changes/<name>/tasks.md` (task boundaries)
4. Follow the skill's guidance to create the plan

Plan requirements:
- Save to `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`
- Reference design document, break down into executable tasks
- **Plan file header must contain associated metadata**:

---
change: <openspec-change-name>
design-doc: docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md
base-ref: <git rev-parse HEAD before implementation>
---

**Execute subagent**: Use the current platform's subagent dispatch mechanism to send the above task.
```

执行阶段由用户在一个 joint decision 中选择 isolation、execution method、TDD mode、review mode。选择后，Comet 才加载实际 execution Skill，并按模式追加 TDD/review 约束。

证据（[`assets/skills/comet-build/SKILL.md:224-250`](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/assets/skills/comet-build/SKILL.md#L224-L250)）：

```text
**Execute plan**: Must handle execution according to the actual runtime of `build_mode`.

- `build_mode: executing-plans`: **Immediately execute:** Use the Skill tool to load the Superpowers `executing-plans` skill.
- `build_mode: subagent-driven-development`: The main session only coordinates and must not write implementation code directly. **Immediately execute:** Use the Skill tool to load the Superpowers `subagent-driven-development` skill.

**TDD Mode Execution Constraints**:

If `tdd_mode: tdd`:
- `build_mode: executing-plans`: ... load the Superpowers `test-driven-development` skill once ... follow the loaded TDD Red-Green-Refactor cycle for each task.
- `build_mode: subagent-driven-development`: ... every background implementer and fix agent must use the Skill tool to load the Superpowers `test-driven-development` skill.

**`executing-plans` review gate**:

- **`review_mode: off`**: No automatic code review.
- **`review_mode: standard`**: ... load the Superpowers `requesting-code-review` skill once and request one lightweight code review.
- **`review_mode: thorough`**: In addition to the single final review, request one segmented code review per task segment.
```

Build 中发现需求不完整时，不允许一律“顺手修”：

- small：可直接补 delta spec + `design.md` + `tasks.md`；
- medium：用户确认后，必须重新调用 `brainstorming` 更新 Design Doc + delta spec；
- large：用户决定是否拆新 change；
- 新任务超过原始 tasks 数量 50% 时，强制 scope decision。

这相当于把 requirements feedback loop 放在 Build 内部，但主 spec 仍不提前同步，统一留到 Archive。

### 3.4 Verify：Superpowers 做方法门，OpenSpec 只在 full verification 参与

Verify 首先按任务数、delta capability 数和文件数决定 light/full：

- 任一条件成立即 full：tasks > 3、delta specs > 1、changed files > 8；
- 两种模式都强制加载 `verification-before-completion`；
- light 做 6 项实用验证，但明确不做完整 spec coverage 和 drift；
- full 再强制加载 `openspec-verify-change`，对 proposal、OpenSpec design、Design Doc、delta scenarios 和实现一致性做深比较；
- 生成 Verification Report，并把路径写进 `.comet.yaml`；
- guard 运行真实 verify command 或消费单独登记的 command evidence；
- 前 3 次明确可修失败自动 `verify-fail → build`；第 4 次才要求用户选择。

证据（[`assets/skills/comet-verify/SKILL.md:92-121`](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/assets/skills/comet-verify/SKILL.md#L92-L121)）：

```text
### 2. Artifact Context Loading (Hash On-Demand Read)

When verification needs to read OpenSpec artifacts, first check whether they have changed since the design phase:

comet state get <change-name> handoff_hash
comet handoff <change-name> --hash-only

- If they match ... `tasks.md` does not need to be re-read in full; parse its checkboxes to confirm none remain unchecked. proposal.md, design.md, and delta specs must still be read for comparison checks.
- If `RECORDED_HASH` is empty ... or differs from `CURRENT_HASH`: artifacts have changed ... Read all required files in full normally.

**Immediately execute:** Use the Skill tool to load the Superpowers `verification-before-completion` skill. Skipping this step is prohibited.

### 2a. Lightweight Verification (Small Changes)

1. All tasks.md tasks completed `[x]`
2. Changed files match tasks.md descriptions
3. Build passes
4. Related tests pass
5. No obvious security issues
6. Code review strategy: when `review_mode: standard` or `thorough`, ... load ... `requesting-code-review`
```

full 模式的 OpenSpec 校验范围：

证据（[`assets/skills/comet-verify/SKILL.md:149-162`](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/assets/skills/comet-verify/SKILL.md#L149-L162)）：

```text
### 2b. Full Verification (Large Changes)

When scale assessment result is "large":

**Immediately execute:** Use the Skill tool to load the `openspec-verify-change` skill. Skipping this step is prohibited.

After the skill loads, follow its guidance to verify. Check items:
1. All tasks.md tasks completed (`[x]`)
2. Implementation matches `openspec/changes/<name>/design.md` high-level design decisions
3. Implementation matches Design Doc (technical design documents under `docs/superpowers/specs/`)
4. All capability spec scenarios pass
5. proposal.md goals are satisfied
6. No contradictions between delta spec and design doc
7. Associated design documents under `docs/superpowers/specs/` are locatable
```

重要边界：light verification 官方写明跳过 spec scenario coverage、Design Doc consistency deep comparison、delta spec / Design Doc drift detection。因此“Verify 同时嵌入两套方法”只对 full 模式完全成立。

### 3.5 Archive：OpenSpec 合并真相，Superpowers 文档只做生命周期标注

Archive 的核心动作全部脚本化：

1. 用户确认不可逆归档与远端交付；
2. `archive-confirm` 写入状态；
3. `comet archive` 调用 `openspec archive <change> --yes`；
4. 按 OpenSpec delta semantics 合并 ADDED/MODIFIED/REMOVED/RENAMED 到 main specs；
5. 检查 main specs 没有泄漏 delta-only headings；
6. 把 Design Doc 标记 `archived-with`、`status: final`；
7. 把 Plan 标记 `archived-with`；
8. 把 change 移入 `openspec/changes/archive/YYYY-MM-DD-<name>/`；
9. 更新 archived state、artifact index、trajectory、checkpoint；
10. exact path commit 与用户已确认的 push/PR。

证据（[`assets/skills/comet-archive/SKILL.md:58-79`](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/assets/skills/comet-archive/SKILL.md#L58-L79)）：

```text
### 2. Execute Archive

Run the archive script:

`comet archive "<change-name>"`

The script automatically executes:
1. Entry state validation (phase=archive, verify_result=pass, archive_confirmation=confirmed, archived=false)
2. Design doc frontmatter annotation (archived-with, status)
3. Plan frontmatter annotation (archived-with)
4. OpenSpec archive for delta-merge semantics and moving the change to the archive directory
5. Main spec guard against leaked delta-only section headings
6. Update archived state in the actual OpenSpec archive directory and reconcile pending recovery metadata

The script calls OpenSpec archive to merge `ADDED/MODIFIED/REMOVED/RENAMED` delta semantics into main specs, then verifies main specs do not contain delta-only section headings.
```

源码确实调用 OpenSpec CLI 并随后校验 main spec：

证据（[`domains/comet-classic/classic-archive.ts:307-353`](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/domains/comet-classic/classic-archive.ts#L307-L353)，节选）：

```ts
if (!recoveredArchive) {
  const archiveRun = spawnSync(openspec, ['archive', change, '--yes'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (archiveRun.stdout) process.stderr.write(archiveRun.stdout);
  if (archiveRun.stderr) process.stderr.write(archiveRun.stderr);
  if (archiveRun.status !== 0) {
    throw new ArchiveFailure('', archiveRun.status ?? 1);
  }
}

const resolvedArchive = await findArchiveDir(change, archiveDir);
if (!resolvedArchive) {
  output.stderr.push(red('  [FAIL] OpenSpec archive output not found'));
  return output.toResult(1);
}
archiveDir = resolvedArchive;
archiveName = path.basename(resolvedArchive);

await verifyMainSpecsClean();

if (designDoc) {
  await annotateFrontmatter(output, designDoc, archiveName, 'status: final', false);
}
if (planPath) {
  await annotateFrontmatter(output, planPath, archiveName, '', false);
}
```

## 4. 文档如何分区、索引、更新与归档

### 4.1 三类真相与两类索引

Comet 的文档不是放在同一目录里：

| 区域 | 责任 | 主要文件 | 生命周期 |
| --- | --- | --- | --- |
| OpenSpec / WHAT | 需求、范围、capability、task | `proposal.md`、`design.md`、`specs/*/spec.md`、`tasks.md` | active change → main spec merge → archive |
| Superpowers / HOW | 深技术设计、实现计划、验证报告 | `docs/superpowers/specs/*`、`plans/*`、`reports/*` | 独立保留，归档时加 frontmatter |
| Comet / CONTROL | phase、模式、路径、hash、恢复 | `.comet.yaml`、change 内 `.comet/*`、项目 `.comet/current-change.json` | 跟随 change；selection 另存项目级 |

官方 file structure 对 WHAT/HOW 的分工写得很直接：

证据（[`assets/skills/comet/reference/file-structure.md:7-27`](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/assets/skills/comet/reference/file-structure.md#L7-L27)）：

```text
openspec/                              # OpenSpec — WHAT
├── changes/
│   ├── <name>/                        # Active change
│   │   ├── .openspec.yaml
│   │   ├── .comet.yaml
│   │   ├── proposal.md                # Why + What
│   │   ├── design.md                  # High-level architecture decisions
│   │   ├── specs/<capability>/spec.md # Delta capability spec
│   │   ├── .comet/handoff/            # Script-generated phase handoff packages
│   │   └── tasks.md                   # Task checklist
│   └── archive/YYYY-MM-DD-<name>/     # Archived
└── specs/<capability>/spec.md         # Main specs

docs/superpowers/                      # Superpowers — HOW
├── specs/YYYY-MM-DD-<topic>-design.md # Design doc
└── plans/YYYY-MM-DD-<feature>.md      # Implementation plan

.comet/
└── config.yaml
```

`.comet.yaml` 不是文档内容索引大全，而是**状态 + 关键路径索引**。它记录 phase、build/review/TDD/isolation 模式、Design Doc、Plan、Verification Report、handoff path/hash、归档状态等。

证据（[`domains/comet-classic/classic-state.ts:25-55`](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/domains/comet-classic/classic-state.ts#L25-L55)）：

```ts
export interface ClassicState {
  workflow: ClassicProfile;
  language: ClassicArtifactLanguage | null;
  phase: ClassicPhase;
  contextCompression: (typeof CONTEXT_COMPRESSION)[number] | null;
  buildMode: (typeof BUILD_MODES)[number] | null;
  buildPause: (typeof BUILD_PAUSES)[number] | null;
  subagentDispatch: (typeof SUBAGENT_DISPATCH)[number] | null;
  tddMode: (typeof TDD_MODES)[number] | null;
  reviewMode: (typeof REVIEW_MODES)[number] | null;
  isolation: (typeof ISOLATIONS)[number] | null;
  boundBranch: string | null;
  verifyMode: (typeof VERIFY_MODES)[number] | null;
  autoTransition: boolean | null;
  baseRef: string | null;
  designDoc: string | null;
  plan: string | null;
  verifyResult: (typeof VERIFY_RESULTS)[number];
  verifyFailures: number;
  verificationReport: string | null;
  branchStatus: (typeof BRANCH_STATUSES)[number] | null;
  archiveConfirmation: (typeof ARCHIVE_CONFIRMATIONS)[number] | null;
  archived: boolean;
  handoffContext: string | null;
  handoffHash: string | null;
}
```

### 4.2 关键文档用 frontmatter 建关联

- Design Doc：`comet_change`、`role: technical-design`、`canonical_spec: openspec`；
- Plan：`change`、`design-doc`、`base-ref`；
- Verification Report：路径记录在 `.comet.yaml`；
- Archive：给 Design Doc/Plan 追加 `archived-with`，Design Doc 再加 `status: final`。

关联是**路径 + frontmatter + hash**，没有统一 document ledger 的 document id、producer、读收据或 revision。

### 4.3 更新规则

- Open：由 OpenSpec artifact DAG 决定依赖和输出路径；
- Design：Spec Patch 可回写 delta spec，回写后必须重建 handoff hash；
- Build：delta spec 是 living document；small 可直接更新，medium 必须 brainstorming，large 可能拆 change；
- Verify：原则上只产 Verification Report；implementation/spec 修改退回 Build；
- Archive：唯一把 delta 合到 main spec 的阶段，之前不得提前 sync。

这避免了主 spec 被未验证内容污染，也避免 Design Doc 与 OpenSpec design.md 相互覆盖。

## 5. 下一步如何消费上一步产物

### 5.1 Open → Design：最完整的跨框架交接

Handoff source set 是固定且有序的：

```text
proposal.md
design.md
tasks.md
specs/*/spec.md（按目录排序）
```

每个文件先算 SHA256，再用 `path:<path>\nsha256:<hash>` 的组合算总 `handoff_hash`。Markdown context pack 带 source、line range、sha256 和 deterministic excerpt；JSON 是机器索引。

证据（[`domains/comet-classic/classic-handoff.ts:105-127`](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/domains/comet-classic/classic-handoff.ts#L105-L127)）：

```ts
async function handoffSourceFiles(changeDir: string): Promise<string[]> {
  const files = [`${changeDir}/proposal.md`, `${changeDir}/design.md`, `${changeDir}/tasks.md`];
  const specs = `${changeDir}/specs`;
  if (await exists(specs)) {
    for (const entry of (await fs.readdir(specs)).sort()) {
      const spec = `${specs}/${entry}/spec.md`;
      if (await exists(spec)) files.push(spec);
    }
  }
  return files;
}

async function computeContextHash(changeDir: string): Promise<string> {
  const lines: string[] = [];
  for (const file of await handoffSourceFiles(changeDir)) {
    if (await exists(file)) {
      lines.push(`path:${file}`, `sha256:${hashFile(file)}`);
    }
  }
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}
```

Guard 不只看 context 文件存在，还重算 source hash、检查每个 source/SHA marker，并在 stale 时阻断。

证据（[`domains/comet-classic/classic-guard.ts:620-650`](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/domains/comet-classic/classic-guard.ts#L620-L650)）：

```ts
async function designHandoffContextValid(changeDir: string, change: string): Promise<CheckResult> {
  const context = await readField(changeDir, 'handoff_context');
  const recordedHash = await readField(changeDir, 'handoff_hash');
  if (!context || context === 'null') {
    return fail(`handoff_context is missing from .comet.yaml`);
  }
  if (!(await nonempty(context))) {
    return fail(`handoff_context does not point to a non-empty file: ${context}`);
  }
  if (!/^[a-f0-9]{64}$/u.test(recordedHash)) {
    return fail(`handoff_hash is missing or invalid: ${recordedHash || 'null'}`);
  }
  const actualHash = await computeHandoffHash(changeDir);
  if (actualHash !== recordedHash) {
    return fail(
      `OpenSpec artifacts changed after handoff was generated.\nExpected handoff_hash: ${recordedHash}\nActual handoff_hash:   ${actualHash}`,
    );
  }
  const markdown = `${context.replace(/\.json$/u, '')}.md`;
  if (!(await nonempty(markdown))) {
    return fail(`design handoff markdown is missing or empty: ${markdown}`);
  }
  return pass();
}
```

### 5.2 Design → Build：通过 Design Doc + tasks，而非明确消费 handoff

Build plan 子任务明确读取：

1. Design Doc；
2. OpenSpec `tasks.md`；
3. 当前 Git HEAD 作为 `base-ref`。

但 `comet-build/SKILL.md` 没有要求 planning subagent 读取 `design-context.md/spec-context.md`。因此：

- OpenSpec → brainstorming 的 handoff 是强绑定的；
- brainstorming → Design Doc 是人类确认后的语义压缩；
- Build 实际主要消费 Design Doc + tasks；
- handoff 更像 **Design 输入包**，不是 Build 直接输入包。

这是当前实现与“Design → Build context compression”命名之间的语义差异。

### 5.3 Build 内 task → task：Plan/OpenSpec checkbox + checkpoint

`subagent-driven-development` 下，主会话只协调：

- 每个 task 新 implementer；
- review/fix 由 `review_mode` 决定；
- implementer 返回 commit、changed files、RED/GREEN 和 risk signals；
- coordinator 验证后同时勾选 Plan task 与映射的 OpenSpec task；
- 每次 dispatch、return、review、fix、checkoff 都更新 `.comet/subagent-progress.md`；
- 下个 task 只取当前 task 所需上下文，不把历史堆回 prompt。

证据（[`assets/skills/comet/reference/subagent-dispatch.md:94-108`](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/assets/skills/comet/reference/subagent-dispatch.md#L94-L108)）：

```text
### 4. Durable Progress Checkpoint

The coordinator must maintain `openspec/changes/<name>/.comet/subagent-progress.md` and update it immediately after every dispatch, agent return, review result, review-fix round change, and task checkoff. The checkpoint must record at least:

- The unique current plan task text and mapped OpenSpec task text
- Current stage: `implementing | task-review | checkoff | done | blocked | final-review | final-fix`
- Implementation commit hash, changed files, and RED/GREEN evidence
- The selected `review_mode`
- Review stages already passed and unresolved reviewer feedback
- The current task or final-review review-fix round
- Under `review_mode: standard`, whether this task has already triggered a risk task-level review

This file stores only coordinator recovery state and does not replace plan or OpenSpec checkboxes.
```

### 5.4 Build → Verify：状态、任务完成度、base-ref 与 report

Build guard 强制：

- isolation/build_mode/tdd_mode/review_mode 已选择；
- Plan 与 OpenSpec tasks 全部勾选；
- build command 真实通过或有单独 recorded evidence；
- phase 写为 verify，`verify_result=pending`。

Verify 再消费：

- Plan header 的 `base-ref` 计算全实现 diff；
- OpenSpec proposal/design/spec；
- Design Doc；
- `tasks.md` checkbox；
- test/build/review evidence；
- 输出 Verification Report。

### 5.5 Verify → Archive：report path + exact state

Verify guard 写：

- `phase=archive`；
- `verify_result=pass`；
- `verified_at`；
- `archive_confirmation=pending`。

Archive 不重新猜测是否可归档，而是要求 `verify_result=pass`、report path、用户确认和 archive transition。归档脚本又把 OpenSpec archive 结果、Design Doc/Plan annotation 和 completed Run 收敛在一次生命周期操作中。

## 6. 恢复、上下文压缩与可追溯运行数据

### 6.1 恢复不依赖聊天历史

任一子 Skill 入口先运行：

```bash
comet state check <change-name> <phase> --recover
```

恢复协议要求按脚本输出切回正确 Skill，不得在错误 phase 继续写状态。Design 读 `brainstorm-summary.md` + handoff；Build 的 subagent 模式读 `subagent-progress.md`；Verify/Archive 读 persisted result 和 branch state。

证据（[`assets/skills/comet/reference/context-recovery.md:27-55`](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/assets/skills/comet/reference/context-recovery.md#L27-L55)）：

```text
## Recovery Steps

`comet state check <change-name> <phase> --recover`

The script outputs structured recovery context (phase, completed fields, pending fields, recovery action).

## Build Phase Special Recovery

1. Use the Skill tool to reload the Superpowers `subagent-driven-development` skill
2. Re-read `comet/reference/subagent-dispatch.md`
3. Read `openspec/changes/<name>/.comet/subagent-progress.md`
4. Do not execute tasks directly in the main session
5. Resume from the checkpoint's exact stage

## Design Phase Special Recovery

- If the user has not yet confirmed the design approach, return to brainstorming
- If the user has confirmed, continue creating the Design Doc
- On recovery, reload `brainstorm-summary.md` + handoff context files
```

### 6.2 Run state 与文档 state 分离

`.comet.yaml` 只保留 `run_id` 链接；完整 Run 放在 change 内 `.comet/run-state.json`。Run 进一步引用：

- `.comet/pending-action.json`
- `.comet/trajectory.jsonl`
- `.comet/context.md`
- `.comet/artifacts.json`
- `.comet/checkpoint.json`

证据（[`domains/engine/loop.ts:29-46`](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/domains/engine/loop.ts#L29-L46)）：

```ts
export function startRun(pkg: SkillPackage, runId: string, skillHash: string): RunState {
  return {
    runId,
    skill: pkg.definition.metadata.name,
    skillVersion: pkg.definition.metadata.version,
    skillHash,
    orchestration: pkg.definition.orchestration.mode,
    currentStep: pkg.definition.orchestration.entry ?? null,
    iteration: 0,
    pending: null,
    pendingRef: '.comet/pending-action.json',
    trajectoryRef: '.comet/trajectory.jsonl',
    contextRef: '.comet/context.md',
    artifactsRef: '.comet/artifacts.json',
    checkpointRef: '.comet/checkpoint.json',
    status: 'running',
    retries: {},
  };
}
```

Checkpoint 记录 `stateVersion`、trajectory offset、context hash 和 artifacts hash；handoff 完成与 archive 完成都会更新。这使中断恢复能判断“动作已写了一半”还是“完整完成”。

### 6.3 Skill snapshot 防止长任务期间升级漂移

Classic Run 会给 orchestration Skill package 做 content-addressed snapshot。若当前安装 hash 与 Run 的 `skillHash` 不同，恢复时读取旧 snapshot，而不是静默套用新 Skill 行为。

证据（[`domains/comet-classic/classic-migrate.ts:144-171`](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/domains/comet-classic/classic-migrate.ts#L144-L171)）：

```ts
if (projection.run) {
  if (classic.classicMigration !== CLASSIC_MIGRATION_VERSION) {
    throw new Error('Classic Run exists without a supported classic_migration marker');
  }
  if (projection.run.skill !== options.skillPackage.definition.metadata.name) {
    throw new Error(
      `Classic Run skill mismatch: expected ${options.skillPackage.definition.metadata.name}, got ${projection.run.skill}`,
    );
  }
  const installedHash = await hashSkillPackage(options.skillPackage);
  if (installedHash !== projection.run.skillHash) {
    await readSkillSnapshot(changeDir, projection.run.skillHash);
    return {
      classic,
      run: projection.run,
      evidence: await collectClassicEvidence(changeDir, projection),
      migrated: false,
      snapshotDir: path.join(changeDir, '.comet', 'skill-snapshots', projection.run.skillHash),
    };
  }
```

## 7. Guard 与 Hook 如何管理“谁在何时能写什么”

Comet 有两类 guard：

1. **exit guard**：`comet guard <change> <phase> --apply`，校验后推进状态；
2. **write Hook guard**：在宿主写工具前，根据 current change/phase/path allow 或 block。

写矩阵大致是：

| Phase | OpenSpec 文档 | Superpowers 文档 | 源码 |
| --- | --- | --- | --- |
| open | proposal/design/tasks/spec/state/handoff | 不允许任意新 artifact | 阻断 |
| design | proposal/design/tasks/spec/state/handoff | 只允许当前 change 对应 Design Doc | 阻断 |
| build | tasks/spec/state | 只允许记录的 plan/design/report 路径 | 允许 |
| verify | tasks/state | 只允许对应 report/已记录文档 | 允许验证输入，但 Skill 协议禁止改 implementation |
| archive | state | 不作为一般编辑面 | 阻断，由 archive script 操作 |

证据（[`domains/comet-classic/classic-hook-guard.ts:460-486`](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/domains/comet-classic/classic-hook-guard.ts#L460-L486)）：

```ts
function openSpecAllowed(relativePath: string, phase: ClassicPhase): string | null {
  if (!relativePath.startsWith('openspec/')) return null;
  const stateFile =
    relativePath.endsWith('/.comet.yaml') || relativePath.endsWith('/.openspec.yaml');
  const proposal =
    relativePath.endsWith('/proposal.md') ||
    relativePath.endsWith('/design.md') ||
    relativePath.endsWith('/tasks.md');
  const handoff = relativePath.includes('/.comet/');
  const specs = relativePath.includes('/specs/');

  if (phase === 'open' && (proposal || stateFile || handoff || specs)) {
    return `${relativePath} (phase: open, openspec artifacts)`;
  }
  if (phase === 'design' && (proposal || stateFile || handoff || specs)) {
    return `${relativePath} (phase: design, handoff/spec)`;
  }
  if (phase === 'build' && (relativePath.endsWith('/tasks.md') || stateFile || specs)) {
    return `${relativePath} (phase: build, spec/tasks)`;
  }
  if (phase === 'verify' && (relativePath.endsWith('/tasks.md') || stateFile)) {
    return `${relativePath} (phase: verify, tasks/state)`;
  }
  if (phase === 'archive' && stateFile) {
    return `${relativePath} (phase: archive, state)`;
  }
  return null;
}
```

项目只有一个共享 Hook router。它先读 `.comet/current-change.json`，再把一次写入只路由到 Native 或 Classic 的一个 owner；selection stale、多个候选或内部异常时 fail closed。

这避免了两个 workflow 的 guard 同时抢占写入，但也带来一个差别：无 selection 且恰好一个 active change 时，router 可推断 owner；这比“只有用户明确恢复才绑定”更激进。

## 8. Auto-transition：推进 phase 与调用下一 Skill 是两件事

Comet 把自动化拆成：

- `guard --apply`：校验并推进 `.comet.yaml.phase`，**总会发生**；
- `state next`：根据 `phase + workflow + auto_transition` 输出 `NEXT: auto|manual|done` 和 `SKILL`；
- `auto_transition=false` 只停止下一 Skill 调用，不阻止 phase 已经前进。

证据（[`assets/skills/comet/reference/auto-transition.md:7-23`](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/assets/skills/comet/reference/auto-transition.md#L7-L23)）：

```text
## Terminology Distinction

"Phase advancement" is performed by guard `--apply`, which updates the `phase` field in `.comet.yaml` — this **always happens** and is independent of `auto_transition`. This protocol's "automatic handoff" only determines **whether to automatically invoke the next skill**, controlled by `auto_transition`.

## Execution

After exit conditions are met and the phase guard has advanced phase, run:

`comet state next <change-name>`

The script outputs a deterministic next step based on `phase`, `workflow`, and `auto_transition`:

- `NEXT: auto` → invoke the skill pointed to by `SKILL` to enter the next phase
- `NEXT: manual` → do not invoke the next skill; prompt user to manually run `/<SKILL>` per `HINT`
- `NEXT: done` → workflow is complete
```

人工决策点仍由 Skill 协议阻断，例如 Open final review、brainstorming 方案、Build joint configuration、Spec drift、archive confirmation。问题在于，除少数字段外，很多确认只存在于对话事实和 Skill 行为里，不是 exact-phase/event receipt。

## 9. 关键差距、实现矛盾与风险

### 9.1 Nested Skill “必须调用”是 prompt 级强制，不是 receipt 级证明

Comet Skills 反复写“Immediately execute / Skipping prohibited”，安装器也确保依赖存在。Classic runtime 还为自己的 Comet orchestration Skill 做 snapshot。

但是固定提交中：

- Classic guard 校验的是 artifact path、frontmatter、hash、checkbox、build/verify command；
- `.comet.yaml` 不含 nested skill invocation receipt；
- trajectory event 类型不包含 host Skill call；
- output schema 声明有 `producer-summary`、`user-confirmation` 等 evidence 名，但 Classic 五阶段 guard 没有展示把 host 的真实 Skill 调用证明绑定到 artifact digest。

因此能证明“产物满足 Comet 规则”，不能同等级证明“该产物确实由某次 OpenSpec/Superpowers Skill invocation 产生并在当前 phase 被读取”。这是与 phase-owned document ledger/producer receipt 对比时最重要的缺口。

### 9.2 人工确认多数未与 exact transition 持久绑定

Open 和 Design Skill 都要求显式用户确认；静态 workflow output schema 也写有 `user-confirmation`。但：

- Open guard 主要检查 proposal/design/tasks；
- Design guard 检查 Design Doc、frontmatter、handoff；
- 没有像 archive 的 `archive_confirmation: confirmed` 那样，为每个 review 点建立 exact event receipt；
- 若宿主或 Agent 错误地在未确认时执行 guard，CLI 本身未必能从持久状态识别。

所以人机门的语义很强，机械门的覆盖不完整。

### 9.3 Context Compression 文档与当前代码漂移

官方 `docs/operations/CONTEXT-COMPRESSION.md` 声称：

- beta “仅保留 Design Doc 内容”；
- Spec “只生成 SHA256 hash 引用”；
- handoff JSON 含 Design Doc。

但固定提交的实际 `classic-handoff.ts`：

- handoff sources 是 OpenSpec proposal/design/tasks/spec，不包含 Superpowers Design Doc；
- beta `spec-context.md` **逐字投影 delta specs**；
- proposal/design/tasks 作为 supporting files 只做 hash reference；
- Design Doc 是随后 brainstorming 的产物。

实际代码证据（[`domains/comet-classic/classic-handoff.ts:246-287`](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/domains/comet-classic/classic-handoff.ts#L246-L287)，节选）：

```ts
async function writeSpecMarkdownContext(
  changeDir: string,
  change: string,
  contextHash: string,
  output: string,
): Promise<void> {
  const lines: string[] = [
    '# Comet Spec Context',
    `- Change: ${change}`,
    '- Phase: design',
    '- Mode: beta',
    `- Context hash: ${contextHash}`,
    'OpenSpec remains the canonical capability spec. This beta context pack verbatim-projects spec files and references supporting artifacts by hash, not an agent-authored summary.',
    '## Source References',
  ];
  for (const file of await handoffSourceFiles(changeDir)) {
    if (!(await exists(file))) continue;
    lines.push(`- Source: ${file}`, `- SHA256: ${hashFile(file)}`);
  }
  lines.push('', '## Acceptance Projection', '');
  const specs = `${changeDir}/specs`;
  if (await exists(specs)) {
    for (const entry of (await fs.readdir(specs)).sort()) {
      const spec = `${specs}/${entry}/spec.md`;
      if (!(await exists(spec))) continue;
      lines.push(...(await writeSpecProjectionForFile(spec, await fs.readFile(spec, 'utf8'))));
    }
  }
}
```

因此，25–30% 的 benchmark 不能直接当成当前实现的可靠生产事实。官方报告自己注明是 dry-run、每组重复 1 次；而压缩算法语义后来已经变化。

### 9.4 Handoff 名称暗示 Design → Build，代码实际是 Open → Deep Design

Handoff 在 `phase=design` 一开始生成，输入是 OpenSpec artifacts，输出喂给 `brainstorming`；Superpowers Design Doc 此时尚不存在。Build 的 plan prompt 再读取 Design Doc + tasks。

更准确的名称应是：

```text
OpenSpec artifact pack → Superpowers deep-design context
```

而不是：

```text
Design Doc → Build compressed handoff
```

### 9.5 Light Verify 是风险分级，不是完整规格闭环

Light 模式明确跳过 spec scenarios、deep design consistency 和 drift；只在 full 模式调用 `openspec-verify-change`。这能省成本，但若 delta spec 本身存在，即使任务小，也应强制 full；tweak Skill 已对“创建 delta spec”做了这一补丁，full workflow 的统一策略仍值得检查。

### 9.6 静态 Output Schema 与 Classic runtime guard 尚未完全收敛

`COMET_FIVE_PHASE_NODES` 把 Plan、Execute、Subagent Execute、Review 分成 workflow nodes，并声明 `comet.plan.v1`、`execution-evidence.v1`、`handoff.v1`、`review.v1` 等 schema。

但 Classic 用户态仍是五 phase + phase-specific Skill，运行 guard 的核心检查直接写在 `classic-guard.ts`。这形成两套概念层：

- 可组合 workflow contract；
- Classic legacy-compatible phase runtime。

总报告应进一步核验这些 Output Schema 是否真正驱动 Classic exit guard，还是主要服务 `/comet-any` bundle authoring。固定提交的直接证据更支持后者。

## 10. 对 pipeline-lite 改进的直接启示

以下建议只基于 Comet 证据，不代替对 pipeline-lite 当前实现的独立审计。

### P0：值得吸收

1. **为跨方法论边界生成 deterministic handoff package**
   - JSON 机器索引 + Markdown 人/Agent可读；
   - 每个 source path + SHA256；
   - aggregate hash 写入 canonical state；
   - stale 时 guard 直接失败；
   - supporting documents 与 canonical specs 区分 role。

2. **为长 Build 建 task-level durable checkpoint**
   - 记录 unique task text、stage、commit、changed files、RED/GREEN、review rounds；
   - 不取代 `tasks.md`，只保存 coordinator recovery state；
   - 恢复时精确回到 implement/review/fix/checkoff，而不是重跑整 task。

3. **给进行中的 workflow 固定 Skill package snapshot**
   - Change 启动时保存 content-addressed Skill snapshot；
   - 安装升级后，旧 Change 仍按原 hash 恢复；
   - 新规则只作用于新 Change 或显式迁移。

4. **把 current change selection 作为 Hook owner 的唯一输入**
   - 多 active change 时 fail closed；
   - stale selection fail closed；
   - write router 只选一个 workflow guard。

### P1：可借鉴，但要用更强证据模型实现

1. **WHAT/HOW 分层**
   - OpenSpec 保持 requirement canonical；
   - Superpowers 文档记录技术设计、计划和验证；
   - 通过 ledger relation/link，而不仅是 frontmatter path。

2. **状态驱动 artifact DAG**
   - 不硬编码 proposal/design/tasks 顺序；
   - 消费 OpenSpec `dependencies/applyRequires/resolvedOutputPath`；
   - 仍应为每次 producer/read 建 digest-bound receipt。

3. **Verify 分级**
   - light/full 可按规模和风险选择；
   - 只要存在 delta spec、public API/schema、安全/并发等高风险信号就强制 full；
   - report 中明确列出 skipped checks。

4. **需求回写分级**
   - small patch 可在 Build 内更新；
   - medium 回 Spec/Design review；
   - large 拆新 Change；
   - 避免只用“新增任务超过 50%”单一阈值。

### 不应照搬

1. 不要只靠 “Skipping prohibited” 证明 nested Skill 真实执行；保留真实 host receipt。
2. 不要只把用户确认写进 prompt；继续使用 exact phase + exact transition event 的 review receipt。
3. 不要让 `auto_transition=false` 时状态先推进、用户稍后才看到下一阶段；若 phase 语义包含 review，推进必须消费同一 event receipt。
4. 不要把文档路径存在当 producer/reader 证据；路径、hash、producer、read-at、phase、event 应同时可查。
5. 不要复制 Comet 已漂移的 context-compression 叙述；算法、benchmark fixture 和文档应由同一 contract/test 校验。

## 11. 建议用于总对比报告的核验问题

1. pipeline-lite 的 document ledger 是否已能表达 `source artifacts → handoff pack → consumer skill` 的关系，还是只有独立 document records？
2. pipeline-lite 的 Skill receipt 能否与 document digest、producer phase、read phase 同时绑定，并在 artifact 修改后自动 stale？
3. 当前 `pipeline handoff` 是否生成逐 source path/hash 的可审计 pack；若只输出压缩文本，是否缺少 role 与 canonical source relation？
4. Build 多 subagent 时，是否有 task-level stage/commit/RED-GREEN/review-round checkpoint，而不只是 phase-level breadcrumb？
5. Skill 安装升级后，进行中的 Change 是否固定原 Skill hash；若没有，长任务恢复可能被新 Skill 语义改变。
6. Verify light/full 是否明确列出 skipped dimensions，并能被 delta spec、security、schema、concurrency 等风险信号强制升级？
7. 当前 review receipt 是否覆盖 Open artifact review、Design approach、Build configuration、Verify pass/fail、Archive；是否每条都绑定 exact event？
8. 文档、Skill、manifest、生成 bundle 与官方文档之间是否存在自动 freshness check，可防止出现 Comet context-compression 文档那类实现漂移？

## 12. 结论

Comet Classic 把 OpenSpec 与 Superpowers 组合得最成功的地方，不是“五阶段”本身，而是把两套方法论明确分工后，用 Comet 自己的 state、guard、handoff、hook 和 recovery 将它们连接起来：

```text
OpenSpec WHAT
  proposal / design / delta specs / tasks
        │
        │ deterministic path+sha256 handoff
        ▼
Superpowers HOW
  brainstorming / Design Doc / Plan / TDD / execution / review
        │
        │ verification report + guard
        ▼
OpenSpec lifecycle close
  delta merge / main specs / archive
```

最值得借鉴的是 **deterministic handoff、文档 ownership、Skill snapshot、task-level recovery checkpoint**。最需要警惕的是 **prompt 级 Skill/确认约束没有完全升级为 receipt 级证据、light verify 的规格覆盖缺口、以及文档与实现漂移**。

对 pipeline-lite 的改进方向不应是照搬 Comet 五阶段，而应是：在现有七阶段、document ledger、review receipt 和 guard 基础上，补齐 Comet 更成熟的跨阶段内容包与细粒度恢复机制，同时用已有证据链堵住 Comet 仍依赖 Agent 遵循文本的部分。

## 附录 A：连续逐字源码证据

以下片段均来自固定提交 `84038b0d6b7c185b233f0f36b294ae74dd9121d0`，保留原始连续行，不拼接、不改写。

### A1. 五阶段 ownership 与 artifact 分工

来源：[`assets/skills/comet-classic/SKILL.md:220-242`](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/assets/skills/comet-classic/SKILL.md#L220-L242)

````markdown
| Command | Phase | Owner | Artifacts |
|---------|-------|-------|-----------|
| `/comet-open` | 1. Open | OpenSpec | proposal.md, design.md, tasks.md |
| `/comet-design` | 2. Deep Design | Superpowers | Design Doc, delta spec |
| `/comet-build` | 3. Plan and Build | Superpowers | Implementation plan, code commits |
| `/comet-verify` | 4. Verify | Both | Verification report |
| `/comet-archive` | 5. Archive and Close | OpenSpec | delta→main spec sync, design doc markup, archive commit, branch handling |
| `/comet-hotfix` | Preset path | Both | Quick fix (skip brainstorming) |
| `/comet-tweak` | Preset path | Both | OpenSpec-chained medium change (delta spec is first-class, skip brainstorming and full plan) |

```
/comet-classic
  ↓ Auto-detect
/comet-open ──→ /comet-design ──→ /comet-build ──→ /comet-verify ──→ /comet-archive
  (OpenSpec)      (Superpowers)     (Superpowers)     (Both)          (OpenSpec)

/comet-hotfix (preset, skip brainstorming)
  open ──→ build ──→ verify ──→ archive
    ↑ Upgrade-assessment signal hit → user chooses one of two (continue preset / upgrade full) → if upgrade, transition preset-escalate → supplement Design Doc → return to full workflow

/comet-tweak (lightweight preset, chains OpenSpec, delta spec is first-class)
  open ──→ build ──→ verify ──→ archive
    ↑ Upgrade-assessment signal hit → user chooses one of two (continue preset / upgrade full) → if upgrade, transition preset-escalate → supplement Design Doc → return to full workflow
````

### A2. Open 不是硬编码文档顺序，而是消费 OpenSpec artifact DAG

来源：[`assets/skills/comet-open/SKILL.md:148-170`](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/assets/skills/comet-open/SKILL.md#L148-L170)

````markdown
After preflight, generate the implementation-required artifacts from the OpenSpec schema and dependency graph:

**OpenSpec status-driven artifact loop**:

1. Run `openspec status --change "<name>" --json` and parse the complete JSON.
2. Exit when every item in `applyRequires` is `done`; record `isComplete` as diagnostic only and do not use it as a phase blocker.
3. From unfinished `ready` artifacts, prioritize items that advance the `applyRequires` dependency closure and process them in CLI-returned order. Must not hard-code generation order or assume the schema contains only proposal/design/tasks.
4. Fetch current instructions for each ready `<artifact-id>`:

   ```bash
   openspec instructions <artifact-id> --change "<name>" --json
   ```

5. For the returned JSON instruction payload, you must:
   - Read every completed dependency artifact listed in `dependencies`
   - Use `template` as the artifact structure
   - Follow `instruction` guidance
   - Apply `context` and `rules` as constraints — **must not copy them into artifact content**
   - Write to `resolvedOutputPath`; for wildcard outputs, create each concrete file required by the instruction
   - Verify the concrete output files returned by the CLI exist and are non-empty
6. Re-run status after creating each artifact and revalidate `changeRoot`, core ids, and `applyRequires`. Do not regenerate items that become `done`; process newly `ready` items in the next loop.

**Blocking and failure handling**: if `applyRequires` is incomplete and no ready artifact can advance its dependency closure, report `missingDeps` for the relevant `blocked` artifacts and stop. Do not guess order or skip dependencies. Also stop if status/instructions fails, returns invalid JSON, escapes the repository, or provides no usable `resolvedOutputPath`. Must not fall back to hard-coded artifact prose.
````

### A3. Design 入口由脚本生成 OpenSpec → Superpowers handoff

来源：[`assets/skills/comet-design/SKILL.md:30-69`](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/assets/skills/comet-design/SKILL.md#L30-L69)

````markdown
### 1a. Generate OpenSpec → Superpowers Handoff Package

**Must be generated by script. Agent writing summaries on the fly is not allowed.**

```bash
comet handoff <change-name> design --write
```

The script reads the change `.comet.yaml` `context_compression` snapshot, then generates and records the matching handoff package.

Default `context_compression: off` generates:

```
openspec/changes/<name>/.comet/handoff/design-context.json
openspec/changes/<name>/.comet/handoff/design-context.md
```

Beta mode (`classic.context_compression: beta` in project `.comet/config.yaml`, snapshotted into `.comet.yaml` when the change is created) generates:

```
openspec/changes/<name>/.comet/handoff/spec-context.json
openspec/changes/<name>/.comet/handoff/spec-context.md
```

And writes to `.comet.yaml`:

```yaml
handoff_context: openspec/changes/<name>/.comet/handoff/design-context.json
handoff_hash: <sha256>
```

The default handoff package is a **compact traceable excerpt**, not an agent summary:
- `design-context.json`: machine index containing change, phase, canonical spec, source paths, hash
- `design-context.md`: context for Superpowers to read, containing script markers, source path, line range, sha256, deterministic excerpts
- When exceeding excerpt budget, marks `[TRUNCATED]` and retains Full source path

The beta handoff package is a **structured spec projection** that reduces OpenSpec token load without replacing the canonical spec:
- `spec-context.json`: machine index containing change, phase, canonical spec, source paths, hash, and file roles
- `spec-context.md`: context for Superpowers to read, verbatim-projecting delta spec files and referencing supporting artifacts by hash
- OpenSpec delta specs remain canonical; if the projection is missing, stale, or unclear, regenerate the handoff or read the source spec directly instead of writing an agent summary
````

### A4. Build 先由 `writing-plans` 产出带 change/design/base-ref 的计划

来源：[`assets/skills/comet-build/SKILL.md:36-68`](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/assets/skills/comet-build/SKILL.md#L36-L68)

````markdown
You are an implementation planning expert. Create an implementation plan based on the following inputs:

1. **Immediately execute:** Use the Skill tool to load the Superpowers `writing-plans` skill. Skipping this step is prohibited. After the skill loads, ARGUMENTS must include: `Language: Use the configured Comet artifact language from comet state get <name> language`
2. Read the Design Doc (technical design document under `docs/superpowers/specs/`)
3. Read `openspec/changes/<name>/tasks.md` (task boundaries)
4. Follow the skill's guidance to create the plan

Plan requirements:
- Save to `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`
- Reference design document, break down into executable tasks
- **Plan file header must contain associated metadata**:

```yaml
---
change: <openspec-change-name>
design-doc: docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md
base-ref: <git rev-parse HEAD before implementation>
---
```

`base-ref` is used during verification to measure committed changes across the full implementation range. Record the current commit when creating the plan:

```bash
git rev-parse HEAD
```

Write the plan to file, then return the file path.

**Execute subagent**: Use the current platform's subagent dispatch mechanism to send the above task.

After the subagent completes:
- If a valid file path is returned and the file exists, record it as the plan
- If the subagent fails or returns an invalid path, fall back to loading the Superpowers `writing-plans` skill inline in the main session (degraded fallback)
````

### A5. Verify 同时使用 hash-on-demand 与 `verification-before-completion`

来源：[`assets/skills/comet-verify/SKILL.md:92-121`](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/assets/skills/comet-verify/SKILL.md#L92-L121)

````markdown
### 2. Artifact Context Loading (Hash On-Demand Read)

When verification needs to read OpenSpec artifacts, first check whether they have changed since the design phase:

```bash
comet state get <change-name> handoff_hash
comet handoff <change-name> --hash-only
```

- Read the two standard outputs separately. If they match and both are non-empty and non-`null`, OpenSpec artifacts are unchanged. **tasks.md does not need to be re-read in full**; parse its checkboxes to confirm none remain unchecked. proposal.md, design.md, and delta specs must still be read for comparison checks.
- If `RECORDED_HASH` is empty, is `null`, or differs from `CURRENT_HASH`: artifacts have changed or hash was never recorded. Read all required files in full normally.

This optimization only skips re-reading tasks.md in full. proposal.md and design.md contain the full context needed for verification checks and must not be skipped due to hash match.

**Immediately execute:** Use the Skill tool to load the Superpowers `verification-before-completion` skill. Skipping this step is prohibited.

After the skill loads, follow the `verify_mode` branch:

### 2a. Lightweight Verification (Small Changes)

Run these 6 checks:

1. All tasks.md tasks completed `[x]`
2. Changed files match tasks.md descriptions (`git diff --stat` / `git diff --cached --stat` / `git diff --stat <base-ref>...HEAD` compared against tasks content)
3. Build passes (run project-specific build command, e.g., `npm run build`, `mvn compile`, `cargo build`, etc.)
4. Related tests pass
5. No obvious security issues (no hardcoded keys, no new unsafe operations)
6. Code review strategy: when `review_mode: standard` or `thorough`, use the Skill tool to load the Superpowers `requesting-code-review` skill and request a lightweight review that checks only correctness, security, and edge cases; when `review_mode: off`, skip automatic code review and record the skip reason in the verification report

The lightweight code review input should be limited to this change's diff, tasks.md, and necessary test results; the review scope covers implementation correctness, security risk, and edge cases only, and does not perform spec coverage, Design Doc consistency, or drift checks. If the review finds CRITICAL or IMPORTANT issues, follow Step 1b automatic repair and retry handling. `review_mode: off` only skips automatic code review, not build, test, security checks, or debug gate protocol.
````

### A6. Archive 融合文档注解、delta merge 与 OpenSpec 目录归档

来源：[`assets/skills/comet-archive/SKILL.md:58-79`](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/assets/skills/comet-archive/SKILL.md#L58-L79)

````markdown
### 2. Execute Archive

Run the archive script:

```bash
comet archive "<change-name>"
```

The script automatically executes:
1. Entry state validation (phase=archive, verify_result=pass, archive_confirmation=confirmed, archived=false)
2. Design doc frontmatter annotation (archived-with, status)
3. Plan frontmatter annotation (archived-with)
4. OpenSpec archive for delta-merge semantics and moving the change to the archive directory
5. Main spec guard against leaked delta-only section headings
6. Update archived state in the actual OpenSpec archive directory and reconcile pending recovery metadata

If script returns non-zero exit code, report error and stop.
If script returns zero exit code, archive is complete.

The summary `X/Y steps succeeded` counts real executed steps and does not double-count delta spec sync or document annotation.

The script calls OpenSpec archive to merge `ADDED/MODIFIED/REMOVED/RENAMED` delta semantics into main specs, then verifies main specs do not contain delta-only section headings.
````

### A7. Handoff 完整性由源文件集合的 SHA256 与 guard 强制校验

来源：[`domains/comet-classic/classic-guard.ts:620-651`](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/domains/comet-classic/classic-guard.ts#L620-L651)

````typescript
async function designHandoffContextValid(changeDir: string, change: string): Promise<CheckResult> {
  const context = await readField(changeDir, 'handoff_context');
  const recordedHash = await readField(changeDir, 'handoff_hash');
  if (!context || context === 'null') {
    return fail(
      `handoff_context is missing from .comet.yaml\nNext: run node "$COMET_HANDOFF" ${change} design --write before invoking Superpowers.`,
    );
  }
  if (!(await nonempty(context))) {
    return fail(
      `handoff_context does not point to a non-empty file: ${context}\nNext: regenerate the design handoff with comet handoff ${change} design --write.`,
    );
  }
  if (!/^[a-f0-9]{64}$/u.test(recordedHash)) {
    return fail(
      `handoff_hash is missing or invalid: ${recordedHash || 'null'}\nNext: regenerate the design handoff with comet handoff ${change} design --write.`,
    );
  }
  const actualHash = await computeHandoffHash(changeDir);
  if (actualHash !== recordedHash) {
    return fail(
      `OpenSpec artifacts changed after handoff was generated.\nExpected handoff_hash: ${recordedHash}\nActual handoff_hash:   ${actualHash}\nNext: run comet handoff ${change} design --write so Superpowers receives the current OpenSpec context.`,
    );
  }
  const markdown = `${context.replace(/\.json$/u, '')}.md`;
  if (!(await nonempty(markdown))) {
    return fail(
      `design handoff markdown is missing or empty: ${markdown}\nNext: regenerate the design handoff with comet handoff ${change} design --write.`,
    );
  }
  return pass();
}
````

### A8. 恢复不是重跑整阶段，而是消费 task-level checkpoint

来源：[`assets/skills/comet/reference/context-recovery.md:35-55`](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/assets/skills/comet/reference/context-recovery.md#L35-L55)

````markdown
## Build Phase Special Recovery

If the recovery script outputs `build_mode: subagent-driven-development`:

1. Use the Skill tool to reload the Superpowers `subagent-driven-development` skill
2. Re-read `comet/reference/subagent-dispatch.md` for Comet-specific extensions
3. Read `openspec/changes/<name>/.comet/subagent-progress.md` to recover the current task or final review, implementation commit, RED/GREEN evidence, passed reviews, unresolved feedback, and review-fix round
4. Do not execute tasks directly in the main session
5. Resume from the checkpoint's exact stage; begin implementer dispatch for the first unchecked task only when the checkpoint is missing or mismatched
6. After `review_mode` validation and targeted checkoff verification pass, immediately continue to the next task without summarizing or asking whether to continue

## Design Phase Special Recovery

- If the user has not yet confirmed the design approach, return to brainstorming
- If the user has confirmed, continue creating the Design Doc
- On recovery, reload `brainstorm-summary.md` + handoff context files

## Verify/Archive Phase Recovery

- Verify: script outputs verification status, branch status, and recovery action
- Archive: if `archived: true` and archive directory exists, archival is complete — do not re-execute
````

### A9. Context compression 官方说明与当前代码发生语义漂移

官方文档称 beta 只保留 Design Doc，并以 hash 引用 Spec：
[`docs/operations/CONTEXT-COMPRESSION.md:31-45`](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/docs/operations/CONTEXT-COMPRESSION.md#L31-L45)

````markdown
`comet-handoff.mjs` 读取 `.comet.yaml` 中的 `context_compression` 字段决定压缩策略：

- **off 模式**：将 Spec 摘录全文嵌入 handoff context JSON，Build 阶段可获得完整的原始需求描述。
- **beta 模式**：仅保留 Design Doc 内容，对 Spec 内容生成 SHA256 hash 引用。Build 阶段通过 hash 可追溯到原始 Spec，但不会在输入中携带全文。

### 压缩产物

handoff context 是一个 JSON 文件，存储在 `openspec/changes/<name>/.comet/handoff/design-context.json`，包含：

- Design Doc 的完整内容
- Spec 内容（off 模式为全文，beta 模式为 hash 引用）
- 相关文件路径和元数据
- SHA256 哈希用于完整性校验

压缩产物路径和哈希值会同步记录到 `.comet.yaml` 的 `handoff_context` 和 `handoff_hash` 字段，确保流程可追溯。
````

当前实现则声明并执行“逐字投影 delta spec、其余 supporting artifacts 仅 hash 引用”：
[`domains/comet-classic/classic-handoff.ts:252-287`](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/domains/comet-classic/classic-handoff.ts#L252-L287)

````typescript
  const lines: string[] = [
    '# Comet Spec Context',
    '',
    `- Change: ${change}`,
    '- Phase: design',
    '- Mode: beta',
    `- Context hash: ${contextHash}`,
    '',
    'Generated-by: comet-handoff.sh',
    '',
    'OpenSpec remains the canonical capability spec. This beta context pack verbatim-projects spec files and references supporting artifacts by hash, not an agent-authored summary.',
    '',
    '## Source References',
    '',
  ];
  for (const file of await handoffSourceFiles(changeDir)) {
    if (!(await exists(file))) continue;
    lines.push(`- Source: ${file}`, `- SHA256: ${hashFile(file)}`);
  }
  lines.push('', '## Acceptance Projection', '');
  const specs = `${changeDir}/specs`;
  let projected = false;
  if (await exists(specs)) {
    for (const entry of (await fs.readdir(specs)).sort()) {
      const spec = `${specs}/${entry}/spec.md`;
      if (!(await exists(spec))) continue;
      projected = true;
      lines.push(...(await writeSpecProjectionForFile(spec, await fs.readFile(spec, 'utf8'))));
    }
  }
  if (!projected) {
    lines.push('No delta spec files found.', '');
  }
  lines.push(
    'Full source files remain canonical. If a required heading or scenario is missing here, regenerate the handoff or read the source spec directly. Supporting files (proposal, design, tasks) are referenced by hash only.',
  );
````

## 一手来源索引

- [rpamis/comet 固定提交](https://github.com/rpamis/comet/tree/84038b0d6b7c185b233f0f36b294ae74dd9121d0)
- [Classic root Skill](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/assets/skills/comet-classic/SKILL.md)
- [Open Skill](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/assets/skills/comet-open/SKILL.md)
- [Design Skill](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/assets/skills/comet-design/SKILL.md)
- [Build Skill](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/assets/skills/comet-build/SKILL.md)
- [Verify Skill](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/assets/skills/comet-verify/SKILL.md)
- [Archive Skill](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/assets/skills/comet-archive/SKILL.md)
- [Classic state/transitions/guard](https://github.com/rpamis/comet/tree/84038b0d6b7c185b233f0f36b294ae74dd9121d0/domains/comet-classic)
- [Workflow contract builtins](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/domains/workflow-contract/builtins.ts)
- [Context compression official doc](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/docs/operations/CONTEXT-COMPRESSION.md)
- [Auto-transition official doc](https://github.com/rpamis/comet/blob/84038b0d6b7c185b233f0f36b294ae74dd9121d0/docs/operations/AUTO-TRANSITION.md)

## 方法说明与置信度

- 搜索与深读范围：官方 README、installer、workflow contract、Classic five phase Skills、state/transition/guard/hook/handoff/archive/runtime/run-store 源码、官方 operations docs 与相关 tests。
- 未使用二手博客、聚合文章或搜索摘要作为技术结论。
- 结构性结论置信度：高。
- “不存在 nested Skill invocation receipt”结论置信度：中高；基于固定提交全仓对 `receipt / SkillRead / invocation evidence / producer` 的检索与 Classic state/trajectory/guard 深读，但不排除宿主自身在 Comet 仓库外保留日志。
- context compression benchmark 的当前适用性：低到中；官方数据是 dry-run、每组一次，且文档描述与固定提交实现已漂移。
