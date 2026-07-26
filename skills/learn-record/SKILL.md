---
name: learn-record
description: "学习沉淀聚合 skill（替代 ECC 的 /learn）：提取本次会话经验 → 写 ~/.claude/skills/learned/ + 落到当前 OpenSpec spec + 同步到 shadoc wiki 知识库（分类自动归到 ai/backend/frontend 等子目录）。Pipeline phase=archive 时由 /tenon-archive 触发，也可手动调用。"
---

# /learn-record — 学习沉淀（三重落地）

> 新增经验记录沿用 Change 固定 locale（默认使用中文标题和正文，显式 `en` 时使用英文）；
> 代码标识、路径、命令、错误原文和协议字段保持原样。
> 历史记录不因模板升级被自动翻译。

> 移植来源：老仓 `skills/learn-record/SKILL.md`（含 `scripts/sync-to-wiki.sh`，已随迁本目录）。

## 定位

把本次会话/change 中值得复用的模式、错误教训、决策依据，**三个位置**同时沉淀：

1. **~/.claude/skills/learned/<topic>.md** — 跨项目复用的 skill
2. **OpenSpec spec**（若有当前 change） — 项目级 spec 内追加 lessons-learned 段
3. **shadoc wiki** — 个人知识库（路径由 `$SHADOC_ROOT` 配置，见 `~/.claude/.pipeline-local.conf`；未配置则自动跳过本层）

## 回写目标（GOAL 清单 D5：学习回写闭环 ≥ tenon-update-spec）

本 skill 是本仓「学习回写闭环」的判据实现，回写面必须**覆盖并超过** Tenon contract `update-spec`：

| 回写目标 | 对标 | 说明 |
|---------|------|------|
| **① 项目 spec 回写**（Layer 2） | = tenon-update-spec | 把开发中学到的约定/决策/教训写回当前 change 的 design.md 或 `openspec/specs/<cap>/spec.md`——下个 change 的 SessionStart 注入 / spec 回读（verify Step 1.5）会自动消费它，形成「学→写→下次自动生效」的闭环 |
| **② 跨项目技能回写**（Layer 1） | > Tenon contract（无此层） | 经验以 skill 形态落 `~/.claude/skills/learned/`，跨项目复用，不困在单仓 spec 里 |
| **③ 个人知识库回写**（Layer 3） | > Tenon contract（无此层） | 自动分类（ai/backend/frontend/cicd/devops/bigdata）同步 wiki，供检索与二次加工 |

**闭环判定**：每次触发至少完成 ①（有活跃 change 时）+ ②；③ 有配置即做。只写文件不入
任何回读面 = 没闭环，不算完成。

## 触发场景

| 场景 | 说明 |
|------|------|
| pipeline phase=archive 时 | `tenon-archive` 内部条件触发（debug ≥2 轮 / 比较 ≥2 方案 / 用户要求"沉淀"） |
| 用户手动调用 | "学习一下 / 沉淀这次经验 / /learn-record" |
| Pipeline 不在运行时 | 仍可用：跳过 OpenSpec spec 步骤，仅写 ~/.claude/skills/learned + shadoc |

## 步骤

### Step 0: 准备脚本定位

```bash
# sync 脚本随本 skill 分发：skills/learn-record/scripts/sync-to-wiki.sh
LEARN_SYNC="${LEARN_SYNC:-$(find "${CLAUDE_PLUGIN_ROOT:-.}" "$HOME/.claude" -path '*/learn-record/scripts/sync-to-wiki.sh' -print -quit 2>/dev/null)}"
[ -z "$LEARN_SYNC" ] && echo "[WARN] sync-to-wiki.sh 未找到，Layer 3 将跳过（Layer 1/2 照做）"
```

### Step 1: 提取经验（必做）

询问用户或自动归纳本次值得保留的内容。**至少提取以下一项**才继续：

#### 1.1 Error Resolution（错误解决模式）
- 错误现象
- 根因分析
- 修复方法
- 是否可复用到类似错误

#### 1.2 Debugging 技巧
- 非显然的调试步骤
- 工具组合
- 诊断套路

#### 1.3 Workaround（库的坑/限制）
- API 限制
- 版本特定 fix

#### 1.4 Project Pattern（项目内约定）
- codebase 规范
- 架构决策
- 集成模式

### Step 2: 自动分类（两段式 — 关键词 + LLM 兜底）

#### 2.1 关键词第一遍（快路径，置信度高时直接采用）

| 内容关键词命中（计数 ≥2） | wiki 子目录 |
|----------|-----------|
| Claude Code / LLM / Agent / Skill / Hook / Prompt / MCP | `ai/` |
| API / 数据库 / Go / Python / Java / Rust / NestJS / endpoint | `backend/` |
| React / Vue / Next / Tailwind / 组件 / CSS / Webpack / Vite | `frontend/` |
| Docker / CI / 部署 / K8s / Helm / pipeline | `cicd/` |
| 服务器 / 运维 / 监控 / 网络 / nginx / SSH | `devops/` |
| Spark / Hive / Hadoop / Trino / 数仓 | `bigdata/` |

**置信度规则**：
- 单一类别命中 ≥3 个关键词 → **采用**
- 多个类别都命中 → 进入 Step 2.2 LLM 兜底
- 无命中 → 进入 Step 2.2 LLM 兜底

#### 2.2 LLM 兜底分类（Claude 自己判断）

当关键词路径无法决断时，**Claude 自己**根据经验内容判断分类：

> 我需要判断这段经验最适合归到哪个 wiki 目录：
>
> 内容摘要：<title + problem + solution 头 200 字>
>
> 候选目录：ai / backend / frontend / cicd / devops / bigdata
>
> 输出：单个目录名（无标点）

判定原则：
- 内容**主要受众**是谁？（前端工程师/后端工程师/SRE/数据工程师/AI 工程师）
- 内容**技术栈核心**是什么？
- 若跨多个类别，选**核心问题域**所属类别

兜底情况下默认归 `ai/`（多数 Claude Code 经验都是 AI 相关）。

### Step 3: 三重写入

#### Layer 1: ~/.claude/skills/learned/<DATE>-<slug>.md

```markdown
---
name: learned-<slug>
description: "<one-line summary>"
category: <ai|backend|frontend|cicd|devops|bigdata>
source_change: <openspec change name 若有>
created_at: <ISO date>
---

# <Title>

## Problem
<具体问题描述>

## Root Cause
<根因>

## Solution / Pattern
<解决方案，附代码示例>

## When to Apply
<什么时候用这个模式>

## Anti-patterns
<什么时候 ✗ 用>
```

#### Layer 2: OpenSpec spec lessons-learned 段（条件；= D5 的 spec 回写闭环）

仅当 `openspec/changes/<name>/.pipeline.yaml` 存在且 `archived != true` 时
（`tenon get <name> archived`）：

在 `openspec/changes/<name>/design.md` 末尾追加（或在 specs/<cap>/spec.md）：

```markdown
## Lessons Learned

### <title>
<concise 记录，引用 learned 文件路径>
```

若教训属于**长期能力约定**（不只是本 change 的过程记录），把它写进对应的主 spec
`openspec/specs/<cap>/spec.md`——那是 SessionStart / verify 回读的常驻真相源。

#### Layer 3: shadoc wiki

调用 sync 脚本：

```bash
bash "$LEARN_SYNC" <category> <slug> "$HOME/.claude/skills/learned/<DATE>-<slug>.md"
```

脚本会：
1. cp 到 `<shadoc>/wiki/<category>/sources/learned-<slug>.md`
2. append 到 `<shadoc>/wiki/log.md`
3. 更新 `<shadoc>/wiki/index.md`（在对应 category section 加引用）

（未配置 `SHADOC_ROOT` 时脚本自动跳过并提示，exit 0——不算失败。）

### Step 4: 输出确认

```
✓ Layer 1: ~/.claude/skills/learned/2026-05-24-react-19-actions.md
✓ Layer 2: openspec/changes/add-login/design.md (+ 1 段)
✓ Layer 3: shadoc/wiki/ai/sources/learned-react-19-actions.md
✓ log.md / index.md 已更新
```

## 错误处理

| 现象 | 处理 |
|------|------|
| `~/.claude/skills/learned/` 不存在 | 自动 mkdir |
| `openspec/changes/<name>/` 不存在 | 跳过 Layer 2，仅 1+3 |
| `SHADOC_ROOT` 未配置 / 路径不存在 | 跳过 Layer 3，仅 1+2 + 用户提示 |
| 沉淀内容太少（<50 字） | 询问用户是否值得保留 |

## 与 ECC /learn 的关系

- ECC 原版 `/learn` 仅写 `~/.claude/skills/learned/`（单层）
- 本 skill 是 **聚合 + 增强版**：单层 → 三层 + 自动分类
- 不需要装 ECC 原版（功能已涵盖）
