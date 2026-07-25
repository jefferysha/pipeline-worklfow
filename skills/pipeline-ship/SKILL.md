---
name: pipeline-ship
description: "Pipeline Phase 6: Ship · 发布。PM Track 沉淀 PRD + handoff，frontend/backend Track 同步 spec + PR。"
---

# /pipeline-ship — Phase 6: Ship

> **语言：** applied spec、handoff 和发布说明沿用 Change 固定 locale，默认中文；版本、路径、
> 命令、hash、kind/producer 和 OpenSpec 机器 token 保持原样。未真实发布的 URL 不得写成已上线。

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
   - Verify 只在隔离副本演练；Ship 是唯一真实应用边界，重复执行必须是 byte-preserving no-op。

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
   - 应用 Verify 已在隔离副本演练通过的每份 delta；重复执行保持幂等。
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

### Step 2.4: 校验登记过的历史主规格迁移证据

`migration/spec-application.json` 与 `migration/spec-application-result.json` 是仓库维护者在发布前
完成并审查的一次性历史迁移证据，不是安装后面向插件用户的运行时能力。打包 Skill **不得**调用
项目仓库的 `tools/reconcile-spec-application.mjs`：managed release 不分发该维护工具，也不应让
Windows 或没有本地 C toolchain 的普通用户承担仓库修复依赖。

若当前 Change 含 migration receipt，直接运行 `pipeline check`，并由
`pipeline transition ... ship-complete` 的 `spec-migration-applied` typed guard 重新读取 receipt、
result、delta 和当前主规格。缺结果、Change/能力/路径身份不一致、receipt digest 或主规格 after
digest 漂移都必须失败关闭；此时停止 Ship，交由仓库维护流程补齐经代码审查的迁移结果，不能在 Agent
会话里临时复制主规格、覆盖 result 文件或调用未分发脚本绕过。

### Step 2.5: 登记已应用的主 spec（受治理 workflow 强制）

`openspec-apply-change` 必须先真实运行。主规格是持久结果，不是 document ledger 的审计收据；
本步登记该 Skill 生成的单一 `applied-spec.md`，其中逐份列出所有 delta、主规格目标、
before/after digest 与 `changed`/`no-op`。不得把 `openspec/specs/**/spec.md` 冒充
`applied-spec` document kind，否则 Archive 无法证明本次 Change 的应用决策。

```bash
APPLIED_RECEIPT="openspec/changes/$PIPELINE_CHANGE_NAME/applied-spec.md"
pipeline document record "$PIPELINE_CHANGE_NAME" applied-spec "$APPLIED_RECEIPT" \
  --producer openspec-apply-change
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
存在 migration receipt 时，还须确认 Step 2.4 的程序化 CAS 结果为 `changed` 或 `no-op`，且
`afterDigest == expectedAfterDigest`；口头声明或只运行无 `--apply` 的检查不能替代。

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
