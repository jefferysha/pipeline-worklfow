---
name: pipeline-ship
description: "Pipeline Phase 6: Ship · 发布。PM Track 沉淀 PRD + handoff，frontend/backend Track 同步 spec + PR。"
---

# /pipeline-ship — Phase 6: Ship

> 移植来源：老仓 `skills/pipeline-ship/SKILL.md`；脚本面已改写为 `pipeline` CLI。

## 输入

- `$PIPELINE_TRACK` / `$PIPELINE_CHANGE_NAME`

## 前置条件

- `phase=ship`
- `verify_result=pass`（verify-pass 事件已由 CLI 自动落）

## 步骤

### Step 0: 入口定位

```bash
pipeline status "$PIPELINE_CHANGE_NAME"
```

### Step 1: Track 分支调用

#### 📋 Track = pm（沉淀 PRD + Handoff / 05+06）

**强制 Skill**（按顺序）：

1. 使用 Skill 工具加载 `to-prd`。**禁止跳过此步骤**。
   - 用于：把调研 + 旅程 + 原型沉淀为正式 PRD
   - 产出：`docs/PRD/<DATE>-<topic>.md`

2. 使用 Skill 工具加载 `to-issues`。**禁止跳过此步骤**。
   - 用于：把 PRD 拆为研发可领的 GitHub issues
   - 每个 issue 包含验收标准 + 关联的 prototype 截图

**推荐**：
- 使用 Skill 工具加载 `handoff` — 生成 handoff 文档（团队对接用）

**可选**：
- 使用 Skill 工具加载 `code-tour` — 若 PRD 涉及现有代码改造

**注意**：PM Track 不调 `pipeline-lite:openspec-apply-change`（PM 流程没有 delta spec → main spec 的同步）。

#### 🎨 Track = frontend

**强制 Skill**（按顺序）：

1. 使用 Skill 工具加载 `pipeline-lite:openspec-apply-change`。**禁止跳过此步骤**。
   - 用于：把 `openspec/changes/<name>/specs/` 的 delta spec 同步覆盖到 `openspec/specs/` 的 main spec
   - （verify Step 1.6 已做过即时回灌的，本步做幂等复核——两处不冲突）

2. 使用 Skill 工具加载 `pipeline-lite:openspec-archive-change`。**禁止跳过此步骤**。
   - 用于：准备归档（标注 frontmatter / 状态字段）

3. 使用 Skill 工具加载 `superpowers:finishing-a-development-branch`。**禁止跳过此步骤**。
   - 用于：分支处理（rebase / squash / 解冲突）

4. 使用 Skill 工具加载 `commit-commands:commit-push-pr`。**禁止跳过此步骤**。
   - 用于：commit + push + 创建 PR

**可选**：
- 使用 Skill 工具加载 `commit-commands:commit` — 仅 commit 不开 PR
- 使用 Skill 工具加载 `github-ops` — 自动化（标签/里程碑/Reviewer）

#### ⚙️ Track = backend

**强制 Skill**（按顺序）：

1. 使用 Skill 工具加载 `pipeline-lite:openspec-apply-change`。**禁止跳过此步骤**。
2. 使用 Skill 工具加载 `superpowers:finishing-a-development-branch`。**禁止跳过此步骤**。
3. 使用 Skill 工具加载 `commit-commands:commit-push-pr`。**禁止跳过此步骤**。

**推荐 Skill**：
- 使用 Skill 工具加载 `pipeline-lite:openspec-archive-change`
- 使用 Skill 工具加载 `deployment-patterns` — 部署 checklist

**可选 Skill**：
- 使用 Skill 工具加载 `docker-patterns` — Docker 镜像构建
- 使用 Skill 工具加载 `github-ops` — GitHub Actions 触发

### Step 2: 记录 PR / PRD 关键信息

```bash
# frontend/backend：记录 PR URL
PR_URL="<从 commit-push-pr 输出获取>"
pipeline set "$PIPELINE_CHANGE_NAME" pr_url "$PR_URL"

# PM Track：记录 PRD 路径
PRD_PATH="docs/PRD/$(date +%Y-%m-%d)-<topic>.md"
pipeline set "$PIPELINE_CHANGE_NAME" prd_path "$PRD_PATH"
```

### Step 3: 验证（不自动推进）

```bash
pipeline check "$PIPELINE_CHANGE_NAME"     # ship 出口：0 过 / 2 不过
```

guard 通过条件（GUARD-RULES §6，按 Track 不同）：

**PM Track**:
- `prd_path` 字段非空且文件存在

**frontend/backend Track**:
- `pr_url` 字段非空（或 git 本地有 commit 等待 push）

同时人工确认：main spec 已同步（`openspec/specs/<capability>/spec.md` 内容包含本 change 的 delta）。

guard **只校验、不自动 transition**。校验通过后，确认 PR / PRD 已交付，手动推进：
`pipeline transition "$PIPELINE_CHANGE_NAME" ship-complete`

## 出口

- 事件：`ship-complete`
- 下一 phase：`archive`（**用户确认后手动进入**，不自动 chaining）

## 决策节点（暂停等用户）

`superpowers:finishing-a-development-branch` 调用过程中**必须暂停**让用户选择分支处理方式（rebase / squash / merge）。

## 外部 skill 依赖（CONTRACT §5.7 显式声明）

- external-skill: to-prd · 强制（pm）
- external-skill: to-issues · 强制（pm）
- external-skill: superpowers:finishing-a-development-branch · 强制（frontend/backend）
- external-skill: commit-commands:commit-push-pr · 强制（frontend/backend）
- external-skill: commit-commands:commit · 可选
- external-skill: handoff · 推荐（pm）
- external-skill: code-tour · 可选
- external-skill: github-ops · 可选
- external-skill: deployment-patterns · 推荐（backend）
- external-skill: docker-patterns · 可选
