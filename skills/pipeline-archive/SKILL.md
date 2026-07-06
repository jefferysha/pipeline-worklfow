---
name: pipeline-archive
description: "Pipeline Phase 7: Archive · 归档 + 学习沉淀。所有 Track 共用：check 过 → 同步 spec → transition archived → 移入 archive/，可选触发 learn-record。"
---

# /pipeline-archive — Phase 7: Archive

> 移植来源：老仓 `skills/pipeline-archive/SKILL.md`。老仓 `pipeline-archive.sh` 一体化脚本
> 未迁移为独立命令——本 skill 把其步骤改写为「`pipeline` CLI + 显式文件操作」的等价序列。

## 输入

- `$PIPELINE_TRACK` / `$PIPELINE_CHANGE_NAME`

## 前置条件

- `phase=archive`（`ship-complete` 已推进）
- PR 已开（frontend/backend）或 PRD 已交付（PM）

## 步骤

### Step 0: 入口验证（dry-run 预览）

```bash
pipeline status "$PIPELINE_CHANGE_NAME"
pipeline check "$PIPELINE_CHANGE_NAME"     # archive 出口：verify_result=pass 等（0 过 / 2 不过）
```

把即将执行的归档操作（下方 Step 1 清单）列给用户预览，确认无误后正式执行。

### Step 1: 归档（强制，按序执行）

老仓 archive 脚本的自动步骤，lite 化为以下显式序列：

1. **验证入口状态**：`pipeline get "$PIPELINE_CHANGE_NAME" verify_result` 应为 `pass`
   （上面 `pipeline check` 已含此校验）。

2. **级联依赖检查**：反查有没有活跃子 change 依赖本 change——

   ```bash
   grep -rl "$PIPELINE_CHANGE_NAME" openspec/changes/*/.pipeline.yaml 2>/dev/null \
     | while read -r f; do grep -q "^depends_on:" "$f" && echo "疑似活跃子: $(basename "$(dirname "$f")")"; done
   ```

   有未归档活跃子 → 告警列出（建议先归档子，或确认父先归档不影响它们），**不硬阻断**
   （归档本身合法）。无活跃子 → 提示「可安全归档」。
   > ⏳ **待迁移（M1 #15 task lifecycle）**：老仓 `pipeline-state.sh cascade/children --json`
   > 结构化反查未迁移，上面 grep 是等价降级写法。

3. **同步 delta spec → main spec**（幂等兜底；verify Step 1.6 / ship 已做过则本步为空操作）：
   逐个把 `openspec/changes/<name>/specs/<cap>/spec.md` 合并进 `openspec/specs/<cap>/spec.md`
   （Read + Edit 工具）。PM Track 没有 delta spec，跳过。

4. **标注产物 frontmatter**：给 `design_doc` / `plan` 指向的文件头部加
   `archived-with: <name>`（Edit 工具）。

5. **落终态字段**（必须在移动目录**之前**做——CLI 只读活跃区）：

   ```bash
   pipeline transition "$PIPELINE_CHANGE_NAME" archived
   # CLI 副作用自动落 archived=true + archived_at（终态自环，phase 保持 archive）
   pipeline get "$PIPELINE_CHANGE_NAME" archived   # 应返回 "true"
   ```

6. **移动到归档区**：

   ```bash
   mkdir -p openspec/changes/archive
   mv "openspec/changes/$PIPELINE_CHANGE_NAME" "openspec/changes/archive/$(date +%Y-%m-%d)-$PIPELINE_CHANGE_NAME"
   ```

### Step 2: 触发 learn-record（**主动询问，每次必问**）

**强制**：每次归档都**主动询问**用户：

> 「本次 `<change_name>`（`<track>` Track）有什么值得沉淀的吗？例如：
>  - 踩到的坑 / 调试技巧
>  - 项目内约定 / 决策依据
>  - 可复用的模式
>
>  回复"无"则跳过，回复内容则触发 learn-record。」

### 决策树

| 用户回复 | 动作 |
|---------|------|
| "无" / "skip" / "no" | 跳过 learn-record，继续归档 |
| 任意非空内容 | **立即执行**：使用 Skill 工具加载 `pipeline-lite:learn-record`，**禁止跳过此步骤** |

### 自动加分条件（即使用户没主动说，仍触发）

满足以下任一时即便用户回"无"也应轻量提醒：
- 本次开发 debug 轮数 ≥ 2（看 git log 含 fix/bug commit）
- 比较过 ≥ 2 个方案做决策（看 design.md 含"方案 A/B"）
- COMPLEX scale change（看 tasks.md ≥ 10 任务）

提醒措辞：「检测到本次有 debug/方案对比，强烈建议沉淀。要写吗？」

### 若 learn-record 不可用

- fallback 到手动询问用户「本次有什么值得沉淀的？」
- 写入 `~/.claude/skills/learned/<DATE>-<topic>.md`

### Step 3: 可选 — 沉淀新 skill

如果本次发现可复用的模式：

**可选**：使用 Skill 工具加载 `skill-creator`。
- 用于：把本次经验生成为新的 ~/.claude/skills/<name>/SKILL.md

### Step 4: 可选 — 生成 handoff（PM 特别推荐）

PM Track 强烈推荐：

**可选**（PM Track 强烈推荐）：使用 Skill 工具加载 `handoff`。
- 用于：生成给团队的二次对接文档

### Step 5: 完成确认

```bash
# 已移入归档区后 CLI 不再读它；确认落位即可：
ls "openspec/changes/archive/" | grep -- "-$PIPELINE_CHANGE_NAME"
```

## 出口

- 事件：`archived`（Step 1.5 已执行）
- 下一 phase：(end) — 整个流程完成
- 后续动作：无（用户可启动新 change）

## 错误处理

| 现象 | 处理 |
|------|------|
| check 报 verify_result 不是 pass | 回到 /pipeline-verify 修复 |
| spec 同步冲突 | 手动 resolve `openspec/specs/<capability>/spec.md` 后重试 |
| change 已经在 archive/ 但 archived=false | 目录已出活跃区，用 Edit 直接修正该 yaml 的 archived 字段（唯一允许手改的场景），并在 commit message 注明 |
| transition archived 报非法转换 | 先确认 `phase=archive`（ship-complete 是否已跑） |

## 不可逆操作提示

archive 是不可逆操作（change 目录会被移动）。执行前若用户犹豫：
1. 用 Step 0 预览
2. 询问用户确认
3. 仅在用户明确同意后执行正式归档

## 外部 skill 依赖（CONTRACT §5.7 显式声明）

- external-skill: skill-creator · 可选
- external-skill: handoff · 可选（pm 强烈推荐）
