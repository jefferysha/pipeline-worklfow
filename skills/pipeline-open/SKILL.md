---
name: pipeline-open
description: "Pipeline Phase 1: Open · 开启 Change。创建 change 骨架（proposal/design/tasks），用 pipeline init 初始化 .pipeline.yaml。三个 Track（pm/frontend/backend）共享同套流程，但 PM 不需要 design.md。"
---

# /pipeline-open — Phase 1: 开启 Change

> 移植来源：老仓 `skills/pipeline-open/SKILL.md`；`pipeline-state.sh init/set/get/transition`
> 与 `pipeline-guard.sh` 已改写为本仓 `pipeline` CLI（CONTRACT §3）。

## 输入

从 /pipeline 主入口经环境变量接收：
- `$PIPELINE_TRACK` ∈ {pm, frontend, backend}（chat 不会触发本 skill）
- `$PIPELINE_CHANGE_NAME` — change 短名（kebab-case）

## 前置条件

- 无活跃 change 或用户明确创建新 change
- 项目根有 `openspec/` 目录（若无，本 skill 会自动 `openspec init --tools claude --force`）

> **归档软提醒（前置）**：若主入口（`pipeline-lite:pipeline`）已检测到未归档活跃 change、弹过归档提醒并经用户确认「并行新建」，则直接继续。若**本 skill 被直接调用**（未经主入口），先按主入口同规则——`pipeline list` 列活跃 change，非空则**用 AskUserQuestion** 列出（名 + phase + 陈旧度）软提醒 `[归档某个再建 / 并行新建 / 取消]`——再创建。**不硬拦**并行新建。

## 步骤

### Step 0: 入口验证 + 自动初始化 openspec

```bash
[ -z "${PIPELINE_TRACK:-}" ] && { echo "[HARD STOP] 缺 PIPELINE_TRACK"; exit 1; }
[ -z "${PIPELINE_CHANGE_NAME:-}" ] && { echo "[HARD STOP] 缺 PIPELINE_CHANGE_NAME"; exit 1; }

# 若项目未 openspec init，自动初始化（无需用户操作）
if [ ! -d "openspec" ]; then
  echo "[AUTO-INIT] 项目未 openspec init，自动执行 openspec init --tools claude --force"
  if ! command -v openspec &>/dev/null; then
    echo "[HARD STOP] openspec CLI 未安装。执行: npm install -g @fission-ai/openspec"
    exit 1
  fi
  openspec init --tools claude --force || { echo "[HARD STOP] openspec init 失败"; exit 1; }
  echo "[OK] openspec/ 已初始化"
fi
```

### Step 1: 创建 change 骨架（强制 Skill）

> **open 的目的 = 初始化 + 骨架，仅此而已。** 建 change 骨架（proposal/tasks，fe·be 加 design）+ init `.pipeline.yaml`，把"要做什么"立住即可。
> 实质内容（能力清单 / 竞品 / 定位 / 架构 / 详细 spec）**一律不在 open 写**——那是 explore 的 research→brainstorming→grill 之后才成形的东西（见下方"proposal 只写骨架"）。

按 Track 分支调用。

#### 🌐 需求归类：triage（条件，**非强制**）

triage 是面向 **issue tracker 的状态机**——只在「对**既有项目**的 bug / feature / refactor 立项、需并入既有 issue 流」时才加载它归类。

**greenfield 全新立项 / PM market-validation（无 issue tracker）→ 跳过 triage**，改在 proposal 里一句话内联归类（feature / bug / refactor / debt / market-validation）即可。**不要硬套 triage 状态机，也不要因为它"不适用"就停流程。**

#### 🌐 所有 Track 共用：openspec 结构补全（条件）

若 Step 0 已经做了自动 `openspec init`，跳过此步。否则若发现缺 `openspec/specs/` 或 `openspec/config.yaml`：

```bash
openspec init --tools claude --force
```

#### 🌐 所有 Track 共用：openspec-propose（强制）

**立即执行**：使用 Skill 工具加载 `pipeline-lite:openspec-propose`。**禁止跳过此步骤**。

按 Track 提示生成不同的产物模板：

| Track | proposal.md 重点 | design.md 重点 | tasks.md 重点 |
|-------|-----------------|---------------|--------------|
| pm | 目标/受众/动机 | （可选，立项不需高层架构） | PM 推进任务 |
| frontend | 用户痛点/UI 范围 | 组件结构/状态管理 | TDD 任务清单 |
| backend | 业务问题/API 范围 | 数据模型/架构决策 | 实现任务清单 |

> **proposal 只写骨架，别写满。** open 的 proposal = 目标/受众/动机 + 一句话意图 +（可选）一句话需求归类。
> **禁止前置实质**：能力清单 / 竞品对标 / 定位 / 差异点 / 详细范围——这些留给 explore 的 research→brainstorming→grill 之后回填。
> 任何工作假设标成「**待 explore 验证**」，别写满了再求用户盖章（HITL 原则③，见 SessionStart 注入的 templates/workflow.md）。
> proposal 是**活文档**：open 立骨架、explore 充实——openspec 的 `proposal→design→specs→tasks` 是**文档依赖**、不是写作时序，proposal 节点先存在即可。

若 openspec-propose 不可用：fallback 到手动创建 `openspec/changes/<name>/` 下的 proposal.md / design.md / tasks.md。

### Step 1.5: 选 preset 规模（强制 AskUserQuestion，决定 guard 强度）

> preset 决定本 change 的 guard 强度，是**用户决策点**，**禁止 agent 替用户默认拍板**。
> **默认严**：用户拿不准 / 未明确选 → 落 `full`（最重护栏）。小任务想减摩擦必须**显式**降档，而不是默认就松。

用 **AskUserQuestion** 问用户三选一（推荐项 `full` 放**第一项**、标「(推荐)」+ 真实备选 + Other）：

| 选项 | 适用 | guard 行为 |
|------|------|-----------|
| **full（推荐·默认严）** | 大需求 / 高风险 / 涉 auth·支付·数据 | 覆盖块 required-blank 硬卡；🔒 auth 锁硬拦 |
| **tweak** | 小功能 / 低风险内部改动 | required-blank 降级 **WARN**（不阻断）；🔒 auth 锁仍硬拦 |
| **hotfix** | 单点 / 一行 / typo | 同 tweak 放宽（🔒 锁不豁免） |

把答案映射到 `$PIPELINE_PRESET`（缺省 / 非法值一律回落 `full`，保证"忘了问"也默认严）：

```bash
PIPELINE_PRESET="${PIPELINE_PRESET:-full}"          # full | tweak | hotfix
case "$PIPELINE_PRESET" in full|tweak|hotfix) ;; *) PIPELINE_PRESET=full ;; esac
```

> ⏳ **待迁移（M1 #12 留痕面 / M2 #21）**：老仓 full preset 的「mandatory skill 缺 → HARD 阻断」
> 「三轨 review 留痕硬卡」依赖 PostToolUse skill-tracker 的 tools_history 证据链，尚未迁移——
> 当前 guard 的 preset 差异只体现在覆盖块豁免（GUARD-RULES §3 S5）。

### Step 1.6: 选 pipeline_mode 全程模式（AFK↔human 分派）

> ⏳ **待迁移（M5 #29 automation）**：老仓在此用 AskUserQuestion 三选一
> （hybrid 推荐默认 / human 全程人工拒绝 AFK / afk 尽早自动跑），并
> `set pipeline_mode` 供看板 AFK 分派。AFK 调度子系统未迁移，且 lite 的
> `.pipeline.yaml` 契约字段（CONTRACT §1，37 字段）**无 `pipeline_mode`**——
> `pipeline set` 会拒写未知字段。M5 收编前**跳过此步**（等价于老仓全程 human 语义），
> 结构立此存照。

### Step 2: 初始化 .pipeline.yaml

```bash
pipeline init "$PIPELINE_CHANGE_NAME" --track "$PIPELINE_TRACK" --preset "$PIPELINE_PRESET"
```

可选入参：

```bash
# --user：显式开发者身份（写 created_by）。缺省由 CLI 解析。
pipeline init "$PIPELINE_CHANGE_NAME" --track "$PIPELINE_TRACK" --preset "$PIPELINE_PRESET" \
  ${PIPELINE_USER:+--user "$PIPELINE_USER"}

# 声明本 change 依赖另一个 change（老仓 init --depends-on 的等价改写；
# depends_on 是列表字段，逗号分隔多值。目标不存在时只是声明意图——
# build 出口 guard 会校验依赖已归档，见 GUARD-RULES B6）
[ -n "${PIPELINE_DEPENDS_ON:-}" ] && pipeline set "$PIPELINE_CHANGE_NAME" depends_on "$PIPELINE_DEPENDS_ON"
```

> ⏳ **待迁移（M1 #15/#17）**：老仓 init 内的 ROUND-12 三分支 dispatch
> （creator 首建 / joiner 入职引导 `00-join-<slug>/` / no-task 续接）依赖 task lifecycle
> 与 session 子系统，lite init 为单分支直建。

验证：

```bash
pipeline get "$PIPELINE_CHANGE_NAME" track          # 应返回 $PIPELINE_TRACK
pipeline get "$PIPELINE_CHANGE_NAME" phase          # 应返回 "open"
pipeline get "$PIPELINE_CHANGE_NAME" preset         # 应返回 $PIPELINE_PRESET
```

### Step 3: 验证产物（不自动推进）

```bash
pipeline check "$PIPELINE_CHANGE_NAME"     # 相位出口 guard 报告：0 过 / 2 不过 / 1 错误
```

guard 通过条件（open 出口，GUARD-RULES §1）：
- `openspec/changes/<name>/.pipeline.yaml` 存在且非空
- `openspec/changes/<name>/proposal.md` 存在且非空
- `openspec/changes/<name>/tasks.md` 存在且至少 1 个 `- [ ]` 任务
- frontend/backend Track 额外要求：`design.md` 存在且非空（PM Track 不要求）

guard **只校验、不自动 transition**（本 pipeline 永不自动推进）。校验通过后：
1. 把 proposal.md + tasks.md 交用户过目、收反馈（"立项范围 / 任务对不对？"）；
2. 用户说"继续"后，手动推进：
   `pipeline transition "$PIPELINE_CHANGE_NAME" open-complete`

## 出口

- 事件：`open-complete`
- 下一 phase：`explore`（**用户确认后手动进入**，不自动 chaining、不"同一会话立即继续"）

## 错误处理

| 现象 | 处理 |
|------|------|
| check 报 proposal 为空 | 提示用户填写后重试 |
| check 报缺 design.md (frontend/backend) | 用 openspec-propose 补全或手动创建 |
| .pipeline.yaml 已存在但 track 不一致 | 询问是否覆盖；若覆盖则 `pipeline set <name> track <new>` |
| 用户中途取消 | 删除 change 目录（含 .pipeline.yaml） |

## 外部 skill 依赖（CONTRACT §5.7 显式声明）

- external-skill: triage · 条件（既有项目并入 issue 流时才加载）
