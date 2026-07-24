---
name: pipeline-verify
description: "Pipeline Phase 5: Verify · 三轨并行验证。PM Track 做原型走查（无 review agent），frontend/backend Track 跑 reviewer agent + codex + e2e 三轨并行，同读冻结的 build_sha 基线。"
---

# /pipeline-verify — Phase 5: Verify

> 移植来源：老仓 `skills/pipeline-verify/SKILL.md`；脚本面已改写为 `pipeline` CLI。

> **Codex 打包 Skill 身份：** 本文件提到的裸 skill id 是 DAG/ledger 的逻辑 id；在 Codex
> 必须实际加载 `pipeline-lite:<id>` 的当前插件副本，绝不以同名全局或项目 SKILL.md 替代。

## 输入

- `$PIPELINE_TRACK` / `$PIPELINE_CHANGE_NAME`

**上下文恢复（强制）**：优先读取 `<pipeline-dispatch>` 的 `change/track/phase`，再跑
`pipeline list --json` 和 `pipeline status <change> --json` 复核。环境变量只是兼容快捷方式；为空时
不得退出到普通对话。若有多个候选且 dispatch 未指定，才请用户选择。

## 前置条件

- `phase=verify`
- `build_mode` / `isolation` 已设
- `tasks.md` 全勾选
- `build_sha` 已由 `build-complete` 冻结（`pipeline get <name> build_sha`）：branch/worktree 为 Git SHA；in-place 为 `workspace:sha256:<内容基线>`

## 步骤

### Step 0: 入口定位

```bash
pipeline status "$PIPELINE_CHANGE_NAME"

# Verify 的判断只能基于已被本 phase 实际读取的冻结文档版本，不能凭上一轮对话记忆。
pipeline document read "$PIPELINE_CHANGE_NAME" all
```

> **review 门提示**：verify 是 review 相位，但进入时不会落 marker；三轨验证、报告生成和文档读取必须
> 先完整执行。`pipeline check` 是 `verify-pass` 的成功出口校验，放在 Step 4 跑；回退则走独立的
> `pipeline review request --event verify-fail` 证据校验，不能拿通过路径的 guard 卡死失败决策。

### Step 1: Track 分支调用

#### 📋 Track = pm（原型走查 / 人工 verify）

**强制 Skill**（禁止跳过）：

1. 使用 Skill 工具加载 `browser-qa`。**禁止跳过此步骤**。
   - 在浏览器走查原型可点击性

2. 使用 Skill 工具加载 `web-design-guidelines`。**禁止跳过此步骤**。
   - 对照 UI 设计规范

3. 使用本插件打包的 Skill `design-taste-frontend`。**禁止跳过此步骤**。
   - 设计 review 二次把关

4. 使用本插件打包的 Skill `verification-before-completion`。**禁止跳过此步骤**。
   - 验收 checklist

**PM Track 没有 reviewer agent。** 验证完成后由用户**手动**确认，然后设置：

```bash
pipeline set "$PIPELINE_CHANGE_NAME" verify_result pass
pipeline artifact register "$PIPELINE_CHANGE_NAME" verification_report \
  "docs/superpowers/reports/$(date +%Y-%m-%d)-<name>-prototype-review.md" \
  --producer verification-before-completion
pipeline set "$PIPELINE_CHANGE_NAME" branch_status handled
```

跳到 Step 4。

#### 🎨 Track = frontend（三轨并行）

⚡ **HARD RULE**：以下 3 轨**必须在同一条 Agent 消息**内并行 dispatch。

> **三轨同读冻结的 `build_sha` 基线（barrier）**：verify 审的是 build-complete 时冻结的固定靶，不是漂移中的 working tree。先取基线并按类型分流：
> ```bash
> BUILD_BASELINE="$(pipeline get "$PIPELINE_CHANGE_NAME" build_sha)"
> case "$BUILD_BASELINE" in
>   workspace:sha256:*)
>     # in-place：不把内容基线传给 git checkout/diff。验证期间不得改实现/配置；
>     # verify-pass 会重新计算同一工作区内容基线，任何漂移都会真实拒绝。
>     echo "[verify] in-place workspace baseline: $BUILD_BASELINE"
>     ;;
>   *)
>     # branch/worktree：这是 Git revision，可作为提交区间/checkout 靶。
>     BUILD_SHA="$BUILD_BASELINE"
>     ;;
> esac
> ```
> reviewer agent / e2e 审该基线对应的代码状态；只有 Git 分支才可让 Codex 轨审 `BUILD_SHA` 提交区间 diff。in-place 的三轨审当前未漂移工作区，并由最终 `verify-pass` barrier 再次证明内容不变。

**并发实现指南**：
- 主 agent 一次性发起 3 个 tool 调用（2 个 Agent + 1 个 Bash）；含 UI 改动时再加第四轨 `pipeline-design-reviewer` agent（视觉），同消息一并发起
- 不要等任一返回再发下一个
- 每个 reviewer agent 独立 context，彼此不知道对方
- Codex CLI 通过 Bash 工具独立进程执行
- 完成后聚合到 verification_report

> ⏳ **待迁移（M2 #21）**：老仓 skill-tracker hook 自动写 tools_history（三轨留痕 → 看板可视化
> + guard V9 留痕硬卡）尚未迁移；当前证据落 `verification_report` 文件本体 +
> `.pipeline-history.jsonl`。

**强制 Skill**（禁止跳过）：

1. 使用本插件打包的 Skill `verification-before-completion`。**禁止跳过此步骤**。

2. 使用 Skill 工具加载 `e2e-testing`。**禁止跳过此步骤**。
   - Playwright E2E 模式

3. 使用 Skill 工具加载 `browser-qa`。**禁止跳过此步骤**。
   - 可视化 QA 验证

4. 使用 Skill 工具加载 `verify`。**禁止跳过此步骤**。
   - 运行 app 实际验证行为

**含 UI 改动时强制（视觉轨；下面三轨全是代码/行为验证、不覆盖视觉）**：

5. **含 UI 改动时禁止跳过**：把视觉审作为**第四并行轨**——与上面三轨**同消息** dispatch 一个 **`pipeline-design-reviewer` agent**（本仓 agents/pipeline-design-reviewer.md，隔离上下文，读冻结的 `build_sha` 固定靶），让它加载 `web-design-guidelines` + `design-taste-frontend`，对**跑起来的 app**做视觉审查（截图关键屏 + 主要状态、查交互态/材质/反模板红线/无 emoji）。
   - 它回传 REVIEW.md 路径 + 「已无 high/critical」结论；主线把视觉结论并入 verification_report，有 high/critical 则 verify-fail 回 build。主线**不内联**跑视觉审。

**可选 Skill**：
- 使用 Skill 工具加载 `run` — 启动 dev server
- 使用 Skill 工具加载 `security-review`（builtin）

**【轨道 1】Reviewer Agent（并行）**：
- Agent 工具调用 `pipeline-reviewer`（本仓 agents/pipeline-reviewer.md）— 读冻结构建基线；Git 基线审提交区间 diff，in-place 审当前未漂移工作区，按改动语言套评审视角（TS/JS 专项 + 通用），回传 severity 发现 + PASS/FAIL。固定靶 brief 已收进 agent，无需在此重述。

**【轨道 2】E2E（并行）**：
- dispatch 一个通用子 agent（Agent 工具），brief：Git 基线时 checkout/read 冻结 `BUILD_SHA`；in-place 时读取当前未漂移工作区，加载 `e2e-testing` skill 跑 Playwright E2E、回传通过/失败清单。（老仓专职 `e2e-runner` agent 未迁移，若本机装有可直接用。）

**【轨道 3】Codex CLI（并行，审冻结 SHA 的提交区间；缺失优雅降级）**：

```bash
# codex 缺失 → 第三轨跳过（reviewer+e2e 两轨仍审固定靶），不算 FAIL。
if [ -n "${BUILD_SHA:-}" ] && command -v codex >/dev/null 2>&1; then
  git diff "$BUILD_SHA"^.."$BUILD_SHA" | codex exec "review this diff: correctness/security/error-handling; 输出带 severity 的发现清单 + PASS/FAIL 结论" || echo "[WARN] codex 轨异常，降级两轨"
elif [ -z "${BUILD_SHA:-}" ]; then
  echo "[INFO] in-place 内容基线：Codex 轨审当前未漂移工作区；最终 verify-pass 会重算基线"
else
  echo "[WARN] codex CLI 未装，第三轨跳过（两轨仍有效）"
fi
# 多提交区间（verify-fail 回环产生多个 build commit）：git diff <基线分支>..."$BUILD_SHA"
```

> ⏳ **待迁移（M2 verify 全量面）**：老仓 `pipeline-codex-review.sh`（commit-scoped /
> 绕 #17160 / --commit-vs-stdin / xhigh 全部 nuance 已收敛进脚本）未迁移，上面是直接调
> codex CLI 的等价降级写法。

**可选 Agent**：
- `database-reviewer`（外部，若装有）— 若涉及 DB schema

#### ⚙️ Track = backend（多语言 reviewer 并行）

> **三轨同读冻结的 `build_sha` 基线（barrier）**：同 frontend，先按上方 `BUILD_BASELINE` 分流。只有 Git SHA 可用于提交区间 diff；in-place 必须审当前未漂移工作区，最终由 `verify-pass` 重新指纹验证。

**强制 Skill**：
1. 使用本插件打包的 Skill `verification-before-completion`。**禁止跳过此步骤**。

**推荐 Skill**：
- 使用 Skill 工具加载 `e2e-testing` — API E2E 测试
- 使用 Skill 工具加载 `verify` — 运行服务实际验证
- 使用 Skill 工具加载 `security-review`（builtin） — 后端安全专项

**可选 Skill**：
- 使用 Skill 工具加载 `run`
- 使用 Skill 工具加载 `code-review`（builtin）
- 使用 Skill 工具加载 `python-testing`（若 Python）

**【轨道 1】强制 Reviewer Agent（并行）**：
- Agent 工具调用 `pipeline-reviewer` — 读冻结构建基线；Git 基线审提交区间 diff，in-place 审当前未漂移工作区，**按改动语言自动套视角**（Python/Go/Rust/Java/TS 后端），回传 severity 发现 + PASS/FAIL。多语言路由已收进 agent，**无需逐语言列 reviewer**。
- `database-reviewer`（外部，若装有）— 涉及 DB schema/查询时（专项，pipeline-reviewer 不覆盖）

**【轨道 2】E2E（并行）**：
- dispatch 通用子 agent 加载 `e2e-testing` 跑 API E2E（同 frontend 轨道 2 写法）。

**【轨道 3】Codex CLI（并行）**：同 frontend 轨道 3 的降级写法。

### Step 1.5: Quality Check — git diff 逐文件回读规范（HARD RULE · 硬门）

⚡ **HARD RULE**：spec/stack 规范的注入是**软的**；本步用 `git diff --name-only` 把改动
**逐文件**对照对应 capability `spec.md` **回读勾选**，作为 verify 通过的**硬门**——未逐项勾选
不得 verify-pass。对标 Trellis check agent 强制 `git diff --name-only` + `git diff` 逐条对 spec。

```bash
# 1) Git 基线时列出冻结靶引入的改动文件；in-place 基线没有 Git 区间，逐文件审当前工作区并保持其不变。
if [ -n "${BUILD_SHA:-}" ]; then
  git diff --name-only "${BUILD_SHA:-HEAD}" 2>/dev/null || git diff --name-only
else
  git diff --name-only
fi

# 2) 逐文件：找对应 capability 的主 spec 回读比对
find openspec/specs -name spec.md 2>/dev/null    # 每 capability → spec.md 路径
```

> ⏳ **待迁移（M1 #16 living-spec / #18 manifest 派生）**：老仓 `pipeline-state.sh specs`
> 的逐 capability 细粒度路由表与 L4 Pre-Dev Checklist 映射未迁移——当前用上面 `find` 全列 +
> 人工匹配，语义等价但无自动路由。

**逐文件回读勾选**（每个改动文件至少勾一行，否则 HARD STOP，不得进 Step 4 verify-pass）：

| 改动文件 | 命中的 capability spec | 已回读规范并比对 diff |
|---------|------------------------|----------------------|
| （git diff --name-only 逐行填）| openspec/specs/<cap>/spec.md | ☐ |

### Step 1.6: Spec 即时回灌 — delta → main 增量合并（HARD RULE · 硬门，frontend/backend）

⚡ **HARD RULE（update-spec-on-change 闭环）**：spec 回灌**不再推迟到 archive**——本 change
一旦在开发中改了 spec，verify 通过**前**必须把 delta 即时增量合并进 main spec（archive 仍做
最终兜底，操作幂等、两处不冲突）。对标 Trellis 的 `[required · once]` spec-update 必经步。

**三触发条件**（映射 OpenSpec delta 三操作；命中任一即必须回灌）：① 新增 capability
（`## ADDED Requirements`）② 改既有 requirement（`## MODIFIED Requirements`）③ 删 scenario
（`## REMOVED Requirements`）。判定：本 change 的 `openspec/changes/<name>/specs/**/spec.md`
存在/有改动即触发。

回灌操作（用 Read + Edit 工具逐 capability 做增量合并，**只读 delta + 写 main spec**）：

```bash
# 列出全部 delta spec
find "openspec/changes/$PIPELINE_CHANGE_NAME/specs" -type f -name spec.md 2>/dev/null
```

对每个 delta：`openspec/changes/<name>/specs/<cap>/spec.md` → 合并进 `openspec/specs/<cap>/spec.md`
（ADDED=追加 requirement 段；MODIFIED=替换同名 requirement 段；REMOVED=删除对应 scenario；
目标不存在则整建）。**不动实现/配置、不重新 build**——符合 verify「审固定靶」语义（Git `BUILD_SHA` 或 in-place 内容基线均不受影响）。

> 命中三触发但未回灌 / 回灌失败 → **HARD STOP**，不得 verify-pass。
> ⏳ **待迁移（M1 #16）**：老仓 `spec_merge.py` 幂等合并器未迁移，上面是 Edit 工具的等价
> 手工合并流程；#16 落地后改回脚本化。

### Step 2: 聚合 review 结果

完成后必须显式写入状态（防止下一阶段误判）：

```bash
# 若所有 reviewer agent 都 pass
pipeline set "$PIPELINE_CHANGE_NAME" agent_review_result pass

# 若 codex pass（codex 缺失跳过时同样置 pass 并在报告注明"第三轨降级"）
pipeline set "$PIPELINE_CHANGE_NAME" codex_review_result pass

# 生成聚合报告
REPORT_PATH="docs/superpowers/reports/$(date +%Y-%m-%d)-${PIPELINE_CHANGE_NAME}-verify.md"
# ... 写报告（含三/四轨结论 + Step 1.5 勾选表 + Step 1.6 回灌记录）...
pipeline artifact register "$PIPELINE_CHANGE_NAME" verification_report "$REPORT_PATH" \
  --producer verification-before-completion
```

### Step 2.25: 登记验证报告（受治理 workflow 强制）

先实际调用本插件 `verification-before-completion`，再登记最终报告。报告每次修改都会改变 SHA-256；
修改后必须重新登记，不能沿用旧证据。

```bash
REPORT_PATH="$(pipeline get "$PIPELINE_CHANGE_NAME" verification_report)"
pipeline document record "$PIPELINE_CHANGE_NAME" verification-report "$REPORT_PATH" \
  --producer verification-before-completion
# 勾选本阶段的 Verify checkbox 后，由 phase driver 登记 tasks 当前 digest。
TASKS_PATH="openspec/changes/$PIPELINE_CHANGE_NAME/tasks.md"
pipeline document record "$PIPELINE_CHANGE_NAME" tasks "$TASKS_PATH" --producer pipeline-verify
pipeline document read "$PIPELINE_CHANGE_NAME" all
pipeline document status "$PIPELINE_CHANGE_NAME"
```

### Step 3: 处理分支

**立即执行**：使用本插件打包的 Skill `finishing-a-development-branch`（推荐，按需）。

完成后：
```bash
pipeline set "$PIPELINE_CHANGE_NAME" branch_status handled
```

### Step 4: 验证（不自动推进）

```bash
pipeline document status "$PIPELINE_CHANGE_NAME"
pipeline check "$PIPELINE_CHANGE_NAME"     # verify 出口：0 过 / 2 不过
```

guard 通过条件（GUARD-RULES §5，按 Track 不同）：

**PM Track**:
- `verify_result=pass`（人工设）

**frontend/backend Track**:
- `agent_review_result=pass`
- `codex_review_result=pass`
- `verification_report` 字段非空且文件存在
- `branch_status=handled`

guard **只校验、不自动 transition**。若验证通过，先运行：

```bash
pipeline review request "$PIPELINE_CHANGE_NAME" --event verify-pass
```

它会为 **verify-pass** 写 pending receipt 并阻止在最终报告之后再静默改写结论。把 verification_report
交用户过目；用户明确确认、hook 写入 `pipeline review acknowledge` receipt 后，手动推进
`pipeline transition "$PIPELINE_CHANGE_NAME" verify-pass`。CLI 副作用会落 `verify_result=pass` + `verified_at`。

若报告结论是失败、需要回到 build：不要运行成功路径的 `pipeline check`（它故意要求 pass）。先保证
`verification_report` 已生成、文件存在且 OpenSpec 文档证据已登记，然后运行：

```bash
pipeline document status "$PIPELINE_CHANGE_NAME"
pipeline review request "$PIPELINE_CHANGE_NAME" --event verify-fail
```

该 request 只校验失败决策可审计所需的报告与文档证据；用户确认回退决定后，hook 写入同一个
`verify-fail` receipt，再手动运行 `pipeline transition "$PIPELINE_CHANGE_NAME" verify-fail`。CLI 会落
`verify_result=fail` 并清空 `build_sha`。`verify-fail` receipt 不能用于 `verify-pass`，反之亦然。

## 出口

- 事件：`verify-pass` 或 `verify-fail`
- pass 下一 phase：`ship`；fail 下一 phase：`build`（回退）
- 均**用户确认后手动进入**，不自动 chaining

## 决策节点（暂停等用户）

verify-fail 时**必须暂停**询问用户：
- 修复（回到 build）
- 接受偏差并强制通过（需说明原因，写入 verification_report）

## 打包 skill 依赖（随 pipeline-lite 插件安装）

- bundled-skill: verification-before-completion · 强制
- bundled-skill: finishing-a-development-branch · 推荐
- bundled-skill: browser-qa / web-design-guidelines / design-taste-frontend · PM、前端与视觉轨
- bundled-skill: e2e-testing / verify · 前端强制、后端推荐
- bundled-skill: run / security-review / code-review / python-testing · 条件或可选
