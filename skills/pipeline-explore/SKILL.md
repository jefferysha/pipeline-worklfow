---
name: pipeline-explore
description: "Pipeline Phase 2: Explore · 调研 + 深度设计。PM Track 做竞品调研+定需求（01+02 步），frontend/backend Track 做技术调研+brainstorming。产出 design_doc。"
---

# /pipeline-explore — Phase 2: 调研 + 深度设计

> 移植来源：老仓 `skills/pipeline-explore/SKILL.md`；脚本面已改写为 `pipeline` CLI。

## 输入

- `$PIPELINE_TRACK` ∈ {pm, frontend, backend}
- `$PIPELINE_CHANGE_NAME`

## 前置条件

- `.pipeline.yaml` 含 `phase=explore`（`pipeline get <name> phase`）
- `openspec/changes/<name>/proposal.md` 已有内容

## 步骤

### Step 0: 入口定位（看现状，不是出口校验）

```bash
pipeline status "$PIPELINE_CHANGE_NAME"    # 相位/字段摘要，绝不 FAIL
```

> ⏳ **待迁移（M1 #12）**：老仓 `pipeline-guard.sh <name> explore --preview`（只列本阶段
> 待产出/待用 skill/待问决策，exit 0）未迁移——`pipeline check` 是**出口校验**，在入口跑
> 必然全红，**别在入口跑**。入口用上面 `pipeline status` 定位即可。
>
> **review 门提示**：进入 explore（review 相位）时 CLI 已落 `.pipeline-pending-review`
> marker——写类工具会被 hooks/gate.sh 拦（15 分钟内新鲜时）。先用 AskUserQuestion 与用户
> 对齐本相位计划/上相位产出复核，再动工。

### Step 1: 读已有上下文

列出以下文件，让后续交互式 skill **全文自读**（不要喂摘要——摘要会把调研纹理压平，发散就乏力）：
- `openspec/changes/$PIPELINE_CHANGE_NAME/proposal.md` — 立项核心
- `openspec/changes/$PIPELINE_CHANGE_NAME/design.md`（若存在）— 高层架构
- `openspec/specs/<capability>/spec.md`（若有主 spec）— 已有能力

### Step 2: Track 分支调用

> ⚠️ **交互式 skill（brainstorming / grill-with-docs）的硬姿态 → 见 SessionStart 注入的
> `templates/workflow.md` 第三节「HITL 原则（交互硬姿态）」**（每次调用 brainstorming/grill
> 前过一遍，别走过场）。核心一句：**任何 gap 都用 AskUserQuestion 批量问、答完重扫、迭代到清零，别自行假设、别问 2 个就收。**
>
> explore 专属补充（只在 explore 适用）：
> - **外部调研走隔离 sub-agent（结构性还原不对称）**：deep-research / market-research / search-first 的"拉取"部分，优先用 **Agent 工具** dispatch `pipeline-researcher` 子 agent（本仓 agents/pipeline-researcher.md）——产出落盘、只回传路径+摘要+开放问题，主线**当外部输入读**。这样研究不是主线的"自有产物"，brainstorming 才不会背书自己刚写的结论。PM track 见下方 step 1 完整写法。

#### 📋 Track = pm（调研 + 定需求）

**对应 PM 6 步法中的 01 RESEARCH + 02 DEFINE。**

**立即执行**（按顺序）：

1. **调研走隔离 sub-agent（关键：治 brainstorm 变浅的根）——先问维度、再并行多路**：
   - **1a. 先用 AskUserQuestion（`multiSelect: true` 多选）问用户：本次从哪些维度调研。** 按 topic 给 4~N 个相关维度选项（如：直接竞品 / 间接竞品·替代方案 / 技术架构与实现 / 商业模式与定价 / 目标用户与需求 / 开源生态与社区 / 合规与安全…，按主题定、别写死），让用户多选。**禁止跳过此问、禁止 agent 自己替用户定维度。**
   - **1b. 为用户选定的每个维度，并行 dispatch 一个 `pipeline-researcher` 子 agent**——**同一条 Agent 消息内并行 dispatch（一维度一个），不许一个子 agent 串行包揽所有维度**。每个 dispatch prompt 必含：该维度的调研焦点 + 产出路径 `docs/superpowers/specs/<DATE>-<topic>-<维度>-research.md` + `track=pm`。
   - 各子 agent 在隔离上下文里（可自行加载 deep-research / market-research 取方法论）拉真实源、写报告到盘，**各自只回传 路径 + ≤10 行摘要 + 3-5 个待用户决断的开放问题**。
   - 主线**不**把全文吸进来污染上下文，也**不**在主线直接加载 deep-research / market-research——下一步 brainstorming 才把各份报告当**外部输入**读。

2. 使用 Skill 工具加载 `superpowers:brainstorming`（**必做，按上面「硬姿态」运行**）。
   - **先读** sub-agent 写的调研报告（当外部输入质疑，不是你的定论），带它回传的开放问题**逼用户在硬取舍上决断**（尤其目标用户，不许「双边 / 都要」收场）。
   - 产出：`docs/superpowers/specs/<DATE>-<topic>-requirements.md`

3. 使用 Skill 工具加载 `grill-with-docs`。**禁止跳过此步骤**（禁止 agent 自判「无不对称」就跳——PM 立项几乎必有内部事实不对称）。
   - 用于：拿用户的领域知识压测计划，一次一问、等用户答；真和用户做完多轮，不是 solo 写完给摘要

**推荐**（默认调用，按需取消）：
- 使用 Skill 工具加载 `search-first` — GitHub / 包注册表查竞品/现成方案

> ⛔ 调研阶段**不要**调用 `triage` / `to-issues`：explore 只做竞品/需求调研与定需求，
> 拆 issue / 二次分类是后续 spec/build 的事，提前 triage 会把发散性调研打断。

#### 🎨 Track = frontend（技术调研 + 深度设计）

**立即执行**（按顺序）：

1. 使用 Skill 工具加载 `search-first`。**默认执行**——确无外部库/现成方案可搜时方可跳过（recommended，缺=WARN 不阻断）。
   - 用于：GitHub / Context7 / 包注册表查现成实现
   - 输出：候选库列表 + 优劣分析
   - **「读很多」的活走隔离 sub-agent（同 PM track）**：凡需查库 / 比较方案 / 读外部库文档全文等"拉取量大"的调研，优先用 **Agent 工具** dispatch `pipeline-researcher` 子 agent（`track=frontend`）——产出落盘 `docs/superpowers/specs/<DATE>-<topic>-<维度>-research.md`，**只回传 路径 + ≤10 行摘要 + 3-5 个开放问题**。主线**不**把库文档全文吸进主上下文（保护主窗口的聪明区），下一步 brainstorming 把报告当**外部输入**读。多维度时同一条 Agent 消息内并行 dispatch（一维度一个）。

2. 使用 Skill 工具加载 `pipeline-lite:openspec-explore`。**禁止跳过此步骤**。
   - 用于：探索现有 `openspec/specs/` 已有能力
   - 防重复造轮子

3. 使用 Skill 工具加载 `superpowers:brainstorming`。**禁止跳过此步骤**。
   - 用于：深度技术设计对话
   - 产出：`docs/superpowers/specs/<DATE>-<topic>-design.md`（技术 RFC）

4. 使用 Skill 工具加载 `grill-with-docs`。**禁止跳过此步骤**。
   - 用于：对照已有文档/ADR 找盲区

**推荐**：
- 使用 Skill 工具加载 `deep-research` — 复杂决策时多源调研
- 使用 Skill 工具加载 `zoom-out` — 若 brainstorming 中跑偏

**可选**：
- 使用 Skill 工具加载 `find-skills` — 找可复用 skill
- 首次用 openspec 时运行 `openspec init`（CLI；通常 open 阶段已自动初始化，无需重复）

#### ⚙️ Track = backend

**立即执行**（按顺序）：

1. 使用 Skill 工具加载 `search-first`。**默认执行**——确无外部库/现成方案可搜时方可跳过（recommended，缺=WARN 不阻断）。
   - **「读很多」的活走隔离 sub-agent（同 PM track）**：凡需查库 / 比较方案 / 读外部库文档全文等"拉取量大"的调研，优先用 **Agent 工具** dispatch `pipeline-researcher` 子 agent（`track=backend`）——产出落盘 `docs/superpowers/specs/<DATE>-<topic>-<维度>-research.md`，**只回传 路径 + ≤10 行摘要 + 3-5 个开放问题**。主线**不**把库文档全文吸进主上下文，下一步 brainstorming 把报告当**外部输入**读。多维度时同一条 Agent 消息内并行 dispatch（一维度一个）。
2. 使用 Skill 工具加载 `pipeline-lite:openspec-explore`。**禁止跳过此步骤**。
3. 使用 Skill 工具加载 `superpowers:brainstorming`。**禁止跳过此步骤**。
4. 使用 Skill 工具加载 `grill-with-docs`。**禁止跳过此步骤**。
5. 使用 Skill 工具加载 `improve-codebase-architecture`。**禁止跳过此步骤**。
   - 用于：架构机会扫描、识别耦合/重复

**推荐**：
- 使用 Skill 工具加载 `deep-research`

**可选**：
- 使用 Skill 工具加载 `find-skills`
- 首次用 openspec 时运行 `openspec init`（CLI；通常 open 阶段已自动初始化）
- 使用 Skill 工具加载 `zoom-out`

### Step 3: 记录 design_doc 路径

产出文件后立即写入状态（路径相对项目根）：

```bash
pipeline set "$PIPELINE_CHANGE_NAME" design_doc "docs/superpowers/specs/$(date +%Y-%m-%d)-<topic>-design.md"
```

### Step 3.5: 在 design_doc 写入全栈 Spec 覆盖块

design_doc **必须**包含一个 `coverage` 围栏块（spec 出口 guard 的 S5 覆盖 gate 会校验它，
见 packages/kernel/src/flow/GUARD-RULES.md §3）。本 phase 至少填齐**领域层 L3/L4/L10**，形式层留给 spec phase：

`````text
```coverage
touches:                              # 触及的受保护域（如 auth）驱动 🔒 锁；无则留空
L1_api:      blank                    # spec phase 填
L2_data:     blank                    # spec phase 填
L3_rules:    filled -> #关键业务规则    # ← explore 现在填（业务规则/不变量）
L4_state:    filled -> #状态机          # ← explore 现在填（状态机/生命周期）
L5_errors:   blank                    # spec phase 填
L6_security: blank                    # spec phase 填
L7_perf:     blank
L8_deps:     blank
L10_terms:   filled -> CONTEXT.md      # 领域术语沉到 CONTEXT.md
```
`````

每层填 `filled -> <design_doc 内 section 锚点 / 文件>` 或 `waived -> <理由>`；适用层留 blank 会被 spec 出口 gate 拦截（hotfix/tweak 降级 WARN，🔒 auth 锁任何 preset 都硬拦）。L9（编码/架构约束）是常驻层（CLAUDE.md/rules 自动注入），不入块。

### Step 4: 验证（不自动推进）

```bash
pipeline check "$PIPELINE_CHANGE_NAME"     # explore 出口：0 过 / 2 不过
```

guard 通过条件（GUARD-RULES §2）：
- `design_doc` 字段非空
- `design_doc` 指向的文件存在（路径相对项目根）

guard **只校验、不自动 transition**（本 pipeline 永不自动推进）。校验通过后：
1. **brainstorming / grill 必须是真和用户做完的多轮对话**（按上面「硬姿态」），不是 solo 写完 design 给个摘要；
2. 把 design_doc（含关键决策 / 调研结论 / 落的 ADR）交用户过目、**逐项**收反馈；
3. 用户确认设计后，手动推进：
   `pipeline transition "$PIPELINE_CHANGE_NAME" explore-complete`

## 出口

- 事件：`explore-complete`
- 下一 phase：`spec`（**用户确认设计后手动进入**，不自动 chaining）

> 决策节点（HARD）：explore 是 review 相位（templates/manifest.yaml `review_phases` 单一真相源）——
> CLI 在进入时落 `.pipeline-pending-review` 门，hooks/gate.sh 会挡住未经 AskUserQuestion 复核
> 就继续写产出/推进的动作，"solo 一个 turn 跑完 brainstorming + transition" 在结构上不可能。
> 别为过 phase 草草收尾：终态是**用户在硬取舍上做了承诺**，不是"文档写出来了"。

## 外部 skill 依赖（CONTRACT §5.7 显式声明）

- external-skill: superpowers:brainstorming · 强制
- external-skill: grill-with-docs · 强制
- external-skill: improve-codebase-architecture · 强制（backend）
- external-skill: search-first · 推荐
- external-skill: deep-research · 推荐
- external-skill: market-research · 推荐（researcher 子 agent 内按需加载）
- external-skill: zoom-out · 可选
- external-skill: find-skills · 可选
