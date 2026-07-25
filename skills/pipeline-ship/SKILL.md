---
name: pipeline-ship
description: "Pipeline Phase 6: Ship · 发布。PM Track 沉淀 PRD + handoff，frontend/backend Track 同步 spec + PR。"
---

# /pipeline-ship — Phase 6: Ship

> 移植来源：老仓 `skills/pipeline-ship/SKILL.md`；脚本面已改写为 `pipeline` CLI。

> **Codex 打包 Skill 身份：** 本文件提到的裸 skill id 是 DAG/ledger 的逻辑 id；在 Codex
> 必须实际加载 `pipeline-lite:<id>` 的当前插件副本，绝不以同名全局或项目 SKILL.md 替代。

## 输入

- `$PIPELINE_TRACK` / `$PIPELINE_CHANGE_NAME`

**上下文恢复（强制）**：优先读取 `<pipeline-dispatch>` 的 `change/track/phase`，再跑
`pipeline list --json` 和 `pipeline status <change> --json` 复核。环境变量只是兼容快捷方式；为空时
不得退出到普通对话。若有多个候选且 dispatch 未指定，才请用户选择。

## 前置条件

- `phase=ship`
- `verify_result=pass`（verify-pass 事件已由 CLI 自动落）

## 步骤

### Step 0: 入口定位

```bash
pipeline status "$PIPELINE_CHANGE_NAME"

pipeline document read "$PIPELINE_CHANGE_NAME" all
```

### Step 1: Track 分支调用

#### 📋 Track = pm（沉淀 PRD + Handoff / 05+06）

**强制 Skill**（按顺序）：

1. 使用 Skill 工具加载 `openspec-apply-change`。**禁止跳过此步骤**。
   - 用于：把 PM 已确认的 delta spec 同步到 `openspec/specs/` 的主 spec；PRD 是额外交付物，
     不能替代可追溯的 OpenSpec 主 spec。

2. 使用 Skill 工具加载 `to-spec`。**禁止跳过此步骤**。
   - 用于：把调研 + 旅程 + 原型沉淀为正式 PRD
   - 产出：`docs/PRD/<DATE>-<topic>.md`

3. 使用 Skill 工具加载 `to-tickets`。**禁止跳过此步骤**。
   - 用于：把 PRD 拆为研发可领的 GitHub issues
   - 每个 issue 包含验收标准 + 关联的 prototype 截图

**推荐**：
- 使用 Skill 工具加载 `handoff` — 生成 handoff 文档（团队对接用）

**可选**：
- 使用 Skill 工具加载 `code-tour` — 若 PRD 涉及现有代码改造

**文档契约**：legacy-full profile 必须实际运行 `openspec-apply-change` 并登记 applied spec；
`document_contract: v1` 只执行 Ship step 自己声明的 slot/read，自由 workflow 不生成 applied spec。

#### 🎨 Track = frontend

**强制 Skill**（按顺序）：

1. 使用 Skill 工具加载 `openspec-apply-change`。**禁止跳过此步骤**。
   - 用于：把 `openspec/changes/<name>/specs/` 的 delta spec 同步覆盖到 `openspec/specs/` 的 main spec
   - （verify Step 1.6 已做过即时回灌的，本步做幂等复核——两处不冲突）

2. 使用 Skill 工具加载 `openspec-archive-change`。**禁止跳过此步骤**。
   - 用于：准备归档（标注 frontmatter / 状态字段）

3. 使用本插件打包的 Skill `finishing-a-development-branch`。**禁止跳过此步骤**。
   - 用于：分支处理（rebase / squash / 解冲突）

4. 完成 commit + push + 创建 PR。**这是必做交付动作，不是 Skill，不得用 Skill 工具加载命令 token。**
   - 基线做法：用 `git status` / `git commit` / `git push` 与 `gh pr create` 完成交付。
   - 若运行环境已安装 `commit-commands` 插件，可选用 slash command
     `/commit-commands:commit-push-pr` 加速；它是命令，不进入 skill bundle。

**可选命令**（不进入 skill bundle）：
- `/commit-commands:commit` — 仅 commit 不开 PR；不能替代本 Track 必做的 push + PR
- 使用 Skill 工具加载 `github-ops` — 自动化（标签/里程碑/Reviewer）

#### ⚙️ Track = backend

**强制 Skill**（按顺序）：

1. 使用 Skill 工具加载 `openspec-apply-change`。**禁止跳过此步骤**。
2. 使用本插件打包的 Skill `finishing-a-development-branch`。**禁止跳过此步骤**。
3. 完成 commit + push + 创建 PR。**这是必做交付动作，不是 Skill。**
   - 基线做法：使用 `git` + `gh pr create`。
   - `/commit-commands:commit-push-pr` 仅是可选命令加速器，不进入 skill bundle。

**推荐 Skill**：
- 使用 Skill 工具加载 `openspec-archive-change`
- 使用 Skill 工具加载 `deployment-patterns` — 部署 checklist

**可选 Skill**：
- 使用 Skill 工具加载 `docker-patterns` — Docker 镜像构建
- 使用 Skill 工具加载 `github-ops` — GitHub Actions 触发

#### 🕊️ Track = free（中性交付）

1. 使用 Skill 工具加载 `openspec-apply-change`。**禁止跳过此步骤**。
   - 幂等复核 Verify 已即时回灌的每份 main spec。
2. 使用本插件打包的 Skill `finishing-a-development-branch`。**禁止跳过此步骤**。
   - 只处理当前工作区实际采用的分支策略；没有远程 PR 交付要求时可保留本地
     handled 结果，不伪造 PR URL。
3. 按 Step 2.5 登记 applied spec，全文读取当前文档 digest，再运行 Ship 出口检查。

`free` 不产出 PM PRD，也不继承 frontend/backend 的强制 push/PR URL；若用户选择的
Workflow 或当前任务本身明确声明发布/PR 动作，则仍按该声明执行。

### Step 2: 记录 PR / PRD 关键信息

```bash
# frontend/backend：记录 PR URL
PR_URL="<从 gh pr create 或可选 /commit-commands:commit-push-pr 输出获取>"
pipeline set "$PIPELINE_CHANGE_NAME" pr_url "$PR_URL"

# PM Track：记录 PRD 路径
PRD_PATH="docs/PRD/$(date +%Y-%m-%d)-<topic>.md"
pipeline set "$PIPELINE_CHANGE_NAME" prd_path "$PRD_PATH"

# free Track：无领域交付字段；不得伪造 pr_url/prd_path。
```

### Step 2.5: 登记已应用的主 spec（受治理 workflow 强制）

`openspec-apply-change` 必须先真实运行；本步只登记由当前 change 的 delta 对应的主 spec，避免把仓库中
无关 capability 当成已应用。一个 change 影响多份 spec 时必须逐份登记。

```bash
find "openspec/changes/$PIPELINE_CHANGE_NAME/specs" -type f -name spec.md -print 2>/dev/null \
  | while IFS= read -r delta; do
      capability="$(basename "$(dirname "$delta")")"
      applied="openspec/specs/$capability/spec.md"
      pipeline document record "$PIPELINE_CHANGE_NAME" applied-spec "$applied" --producer openspec-apply-change
    done
TASKS_PATH="openspec/changes/$PIPELINE_CHANGE_NAME/tasks.md"
pipeline document record "$PIPELINE_CHANGE_NAME" tasks "$TASKS_PATH" --producer pipeline-ship
pipeline document read "$PIPELINE_CHANGE_NAME" all
pipeline document status "$PIPELINE_CHANGE_NAME"
```

### Step 3: 验证（不自动推进）

```bash
pipeline document status "$PIPELINE_CHANGE_NAME"
pipeline check "$PIPELINE_CHANGE_NAME"     # ship 出口：0 过 / 2 不过
```

guard 通过条件（GUARD-RULES §6，按 Track 不同）：

**PM Track**:
- `prd_path` 字段非空且文件存在

**frontend/backend Track**:
- `pr_url` 字段非空（或 git 本地有 commit 等待 push）

**free Track**:
- applied spec 与当前文档读取证据完整
- 不要求 `pr_url` 或 `prd_path`

同时人工确认：main spec 已同步（`openspec/specs/<capability>/spec.md` 内容包含本 change 的 delta）。

guard **只校验、不自动 transition**。校验通过后，确认 PR / PRD 已交付，手动推进：
`pipeline transition "$PIPELINE_CHANGE_NAME" ship-complete`

## 出口

- 事件：`ship-complete`
- 下一 phase：`archive`（**用户确认后手动进入**，不自动 chaining）

## 决策节点（暂停等用户）

`finishing-a-development-branch` 调用过程中**必须暂停**让用户选择分支处理方式（rebase / squash / merge）。

## 打包 skill 依赖（随 pipeline-lite 插件安装）

- bundled-skill: to-spec / to-tickets · 强制（pm）
- bundled-skill: openspec-apply-change · 强制（所有 Track）
- bundled-skill: finishing-a-development-branch · 强制（frontend/backend/free）
- bundled-skill: handoff / code-tour / github-ops · PM 推荐或可选
- bundled-skill: deployment-patterns / docker-patterns · backend 推荐或可选

## 外部命令加速器（不进入 skill bundle）

- external-command: commit-commands:commit-push-pr · 可选；commit + push + PR 动作本身仍强制
- external-command: commit-commands:commit · 可选；仅 commit
