---
name: pipeline-spec
description: "Pipeline Phase 3: Spec · 规格 + 实施计划。所有 Track 产出 OpenSpec delta spec + 可执行 Plan；PM 额外画用户旅程图。"
---

# /pipeline-spec — Phase 3: Spec / Plan

> 移植来源：老仓 `skills/pipeline-spec/SKILL.md`；脚本面已改写为 `pipeline` CLI。

## 输入

- `$PIPELINE_TRACK` / `$PIPELINE_CHANGE_NAME`

**上下文恢复（强制）**：优先读取 `<pipeline-dispatch>` 的 `change/track/phase`，再跑
`pipeline list --json` 和 `pipeline status <change> --json` 复核。环境变量只是兼容快捷方式；为空时
不得退出到普通对话。若有多个候选且 dispatch 未指定，才请用户选择。

## 前置条件

- `phase=spec`
- `design_doc` 字段非空且文件存在

## 步骤

### Step 0: 入口定位

```bash
pipeline status "$PIPELINE_CHANGE_NAME"
```

> **review 门提示**：spec 是 review 相位，进入时 CLI 已落 `.pipeline-pending-review` marker
> ——新鲜（15 分钟内）时写类工具被 hooks/gate.sh 拦。先 AskUserQuestion 与用户对齐再动工。
> `pipeline check` 是出口校验，别在入口跑（必然未过）。

### Step 1: 读上下文

```bash
DESIGN_DOC=$(pipeline get "$PIPELINE_CHANGE_NAME" design_doc)
# design_doc 全文注入：覆盖十层（业务规则/状态机/不变量），不截断
[ -f "$DESIGN_DOC" ] && cat "$DESIGN_DOC"

# 这会为 proposal / initial design / tasks / Superpower design / ADR 写入本 phase 的精确 hash 收据。
pipeline document read "$PIPELINE_CHANGE_NAME" all
```

### Step 2: Track 分支调用

> ⚠️ **交互式 skill（brainstorming / grill-with-docs）的硬姿态 → 见 SessionStart 注入的
> `templates/workflow.md` 第三节「HITL 原则」**（每次调用 brainstorming/grill 前过一遍，别走过场）。
> 核心一句：**任何 gap 都用 AskUserQuestion 批量问、答完重扫、迭代到清零，别自行假设、别问 2 个就收；硬取舍落 ADR、plan 只引用。** spec 无额外姿态条款（research-subagent 是 explore 专属）。

#### 📋 Track = pm（用户旅程 / 03 JOURNEY）

**立即执行**（按顺序）：

1. 使用本插件打包的 Skill `brainstorming`（**必做，但按上面「硬姿态」运行**，别走过场）。
   - ARGUMENTS 包含：`focus: user journey mapping; existing design_doc: <DESIGN_DOC 全文路径，让 skill 自读，勿压成摘要>`
   - 产出：`docs/superpowers/plans/<DATE>-<topic>-journey.md`（用户旅程图 + 关键动线）

   **用户旅程深度 rubric（HARD RULE，6 项全覆盖才算 spec-complete，缺项不许进 build）：**
   一条线性主动线表格 = 不合格(应付)。必须深入展开：
   1. **角色 / persona**：显式分段(不是笼统"用户")，每个角色的目标 / 痛点 / 使用场景 / MVP 优先级；
   2. **每角色一条旅程**：主要角色各自走一遍，不是所有人共用一条线；
   3. **每步落到具体页面 / 屏**：旅程每一步 → 实际页面，给出信息架构 / 页面清单；
   4. **每屏交互 + 状态**：主操作 + 空态 / 加载 / 错误 / 成功 / 边界态，逐一写明；
   5. **用户故事 + 验收**：As a <角色>, I want <X>, so that <Y> + 可验证的验收标准；
   6. **全流转图**：happy path + 替代路径 + 错误/恢复，画成流程 / 状态图(mermaid 或 ASCII)，不止主动线。
   术语遵守 CONTEXT.md 统一语言。写完按这 6 项自检，缺哪项补哪项。

2. 使用 Skill 工具加载 `grill-with-docs`。**禁止跳过此步骤**（禁止 agent 自判「无不对称」就跳——PM 旅程几乎必有内部事实不对称）。
   - 用于：拿用户的领域知识对照旅程找断点，一次一问、等用户答；并逐项核对上面 6 项 rubric 是否真覆盖

3. 使用 Skill 工具加载 `openspec-propose`。**禁止跳过此步骤**。
   - 用于：把已经确认的用户旅程转成可实施的 delta spec。
   - 产出：`openspec/changes/<name>/specs/<capability>/spec.md`。

4. 使用本插件打包的 Skill `writing-plans`。**禁止跳过此步骤**。
   - 用于：把旅程和 delta spec 拆成带验收条件的实施计划。
   - 产出：`docs/superpowers/plans/<DATE>-<feature>.md`，文件头包含 `change: <name>` 与
     `design-doc: <design_doc 路径>` 元数据。

**可选**：
- 使用 Skill 工具加载 `grill-with-docs` 二轮 — 旅程对照现有 spec/ADR 找盲点

#### 🎨 Track = frontend

**立即执行**（按顺序）：

1. 使用 Skill 工具加载 `openspec-propose`。**禁止跳过此步骤**。
   - 用于：生成 delta spec
   - 产出：`openspec/changes/<name>/specs/<capability>/spec.md`

2. 使用本插件打包的 Skill `writing-plans`。**禁止跳过此步骤**。
   - 用于：把 design_doc 拆为可执行计划
   - 产出：`docs/superpowers/plans/<DATE>-<feature>.md`
   - 文件头必须含 `change: <name>` 和 `design-doc: <design_doc 路径>` 元数据
   - **plan 结构遵守下面「fe/be plan 硬约束」三条（B1 tracer bullet / B2 子阶段切窗 / B3 原型决策点）**

**可选**：
- 使用 Skill 工具加载 `to-tickets` — 拆 plan 为 GitHub issues

#### ⚙️ Track = backend

**立即执行**（按顺序）：

1. 使用 Skill 工具加载 `openspec-propose`。**禁止跳过此步骤**。
2. 使用本插件打包的 Skill `writing-plans`。**禁止跳过此步骤**。
   - **plan 结构遵守下面「fe/be plan 硬约束」三条（B1 tracer bullet / B2 子阶段切窗 / B3 原型决策点）**

**可选**：
- 使用 Skill 工具加载 `to-tickets`

#### 🧱 fe/be plan 硬约束（HARD RULE，仅 frontend/backend Track 适用；PM 旅程图不受此约束）

> 下面三条针对本插件 `writing-plans` 产出的 plan。写完 plan 按这三条自检，缺哪条补哪条。

1. **B1 · 首阶段必须是 tracer bullet（曳光弹 / 纵向切片）**
   plan 的**第一个阶段**必须纵向打通一条**端到端最小链路**——贯穿**当前 track 涉及的各层**、用最简单数据先跑通，别要求不存在的组件：全栈=service+路由+UI；纯后端=数据/schema→service→API endpoint（返回真实数据）；纯前端=组件→路由→状态/数据渲染。**禁止横向分层**（按层逐个做、到很晚才集成）。
   理由：尽早暴露集成风险与 unknown unknowns（出自《程序员修炼之道》Tracer Bullet）。横向分层会把反馈推到最后才到，集成爆炸现得太晚。

2. **B2 · build 按上下文窗口切多子阶段**
   plan 必须把 build **拆成多个子阶段，每个子阶段 ≈ 一个干净上下文窗口能装下**；在 plan 里**显式标注子阶段边界**，并在每个边界处标注 **「此处建议 /clear」**。
   理由：LLM 聪明区仅前 ~8 万–10 万 token（约 40%），大功能 build 不切会漂进「愚钝区」（幻觉 / 丢信息 / 推理退化）。多阶段计划 = 每子阶段独占一个干净窗口执行。

3. **B3 · 原型先行决策点（AskUserQuestion 拍板，可选但不许默认跳过）**
   当 fe/be 存在「跑不跑得通 / 数据模型 / 状态机 不确定」的未知时，在进入正式 build 前，用 **AskUserQuestion** 问用户：是否插入一次性 `prototype` 原型摸底（复用 `prototype` skill）。
   这是个**决策点**，由用户拍板——**别默认跳过**，也别擅自决定做或不做。
   理由：Prototyping 主张先用一次性原型排除「未知的未知」，再进 TDD 正式实现，避免直接 build 的返工成本。

### Step 3: 登记 plan 路径

```bash
pipeline artifact register "$PIPELINE_CHANGE_NAME" plan \
  "docs/superpowers/plans/$(date +%Y-%m-%d)-<feature>.md" --producer writing-plans
```

### Step 3.25: 登记 delta spec 与 Superpowers plan（受治理 workflow 强制）

default 的全部 track 必做；`openspec_contract: required` 的 custom workflow 也必须在用户旅程之后
补跑 `openspec-propose` 与 `writing-plans`，生成可实施的 delta spec/plan。这让“新 workflow 遵守
OpenSpec”是机器可检查的事实，而不是标签。

```bash
PLAN_PATH="$(pipeline get "$PIPELINE_CHANGE_NAME" plan)"
# 若一个 change 影响多个 capability，逐个登记全部 delta spec。
find "openspec/changes/$PIPELINE_CHANGE_NAME/specs" -type f -name spec.md -print 2>/dev/null \
  | while IFS= read -r delta; do
      pipeline document record "$PIPELINE_CHANGE_NAME" delta-spec "$delta" --producer openspec-propose
    done
pipeline document record "$PIPELINE_CHANGE_NAME" superpower-plan "$PLAN_PATH" --producer writing-plans
pipeline document record "$PIPELINE_CHANGE_NAME" plan "$PLAN_PATH" --producer writing-plans
pipeline document status "$PIPELINE_CHANGE_NAME"
```

### Step 4: 同步 tasks.md

将 plan 拆出的 todo 同步到 `openspec/changes/<name>/tasks.md`，每项为 `- [ ]`。

### Step 4.5: 补全覆盖块 + 人确认

1. 在 design_doc 的 `coverage` 块补齐**形式层 L1/L2/L5/L6/L8**（每层 `filled -> 锚点` 或 `waived -> 理由`）。
2. 若改动触及 auth，在 `touches:` 写 `auth` → L6 安全层**不可 waive**（🔒，hotfix 也不豁免）。
3. **暂停，把 coverage 块整块念给用户确认**（骑在既有设计确认那一拍上，不另起签字仪式）。

> ⏳ **待迁移（M1 #12 证据面）**：老仓在此 `set coverage_confirmed_by <user>` 留确认痕。
> lite 的 `.pipeline.yaml` 契约字段（CONTRACT §1）**无 `coverage_confirmed_by`**，`pipeline set`
> 会拒写——确认动作照做（AskUserQuestion），留痕字段待证据面迁移后接回。

### Step 5: 验证（不自动推进）

```bash
pipeline check "$PIPELINE_CHANGE_NAME"     # spec 出口：0 过 / 2 不过
```

guard 通过条件（GUARD-RULES §3）：
- 非 PM Track：legacy `plan` 字段非空且文件存在；PM 不走该状态字段，但仍必须登记 `superpower-plan` 与 `plan` 文档证据
- `tasks.md` ≥ 3 个任务（防止只有 1-2 项的水任务）
- 全栈 Spec 覆盖块：适用层无 blank（填或 waive）、🔒 锁满足（hotfix/tweak 时 required 降级 WARN，锁仍硬拦）

guard **只校验、不自动 transition**。校验通过后：
1. 把 plan / 用户旅程 / delta spec 交用户过目、**逐项**收反馈（不能替用户拍板）；
2. 用户说"继续"后，手动推进：
   `pipeline transition "$PIPELINE_CHANGE_NAME" spec-complete`
   （spec 是 review 相位——`.pipeline-pending-review` 门会挡住未经 AskUserQuestion 复核的推进）

## 出口

- 事件：`spec-complete`
- 下一 phase：`build`（**用户确认后手动进入**，不自动 chaining）

## 打包 skill 依赖（随 pipeline-lite 插件安装）

- bundled-skill: brainstorming · 强制（pm）
- bundled-skill: writing-plans · 强制（所有 Track）
- bundled-skill: grill-with-docs · 强制（pm）
- bundled-skill: prototype · 条件（B3 原型摸底，用户拍板）
- bundled-skill: to-tickets · 可选
