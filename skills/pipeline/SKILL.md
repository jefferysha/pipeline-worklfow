---
name: pipeline
description: "主编排 skill（Decision Core）。识别 Track（chat/pm/frontend/backend）→ 检测 phase（open/explore/spec/build/verify/ship/archive）→ 分发到 pipeline-* 相位子 skill。状态一律经 pipeline CLI 读写；支持断点恢复：重读 .pipeline.yaml 不依赖对话历史。"
---

# /pipeline — 主编排入口（Decision Core）

> 移植来源：老仓 workflow-plugin `skills/pipeline/SKILL.md`。老仓 bash 脚本面
> （pipeline-state.sh / pipeline-guard.sh / pipeline-archive.sh）已全部改写为本仓
> `pipeline` CLI（命令契约见 `docs/CONTRACT.md` §3）。快速入口版见 `pipeline-lite:pipeline-lite`。

## 触发场景

用户输入以下任一情况触发本 skill：
- 含开发关键词（"加个功能 / 改 bug / 重构 / 实现 ..."）
- 含 PM 关键词（"调研 / 竞品 / PRD / 需求 ..."）
- 显式 `/pipeline` 命令
- 显式 `/pipeline 继续` 进行断点恢复

**Chat 类输入（"问 / 解释 / how / what"）不应触发本 skill** — 直接对话即可。

---

## Decision Core（决策核心）

执行任何动作前先完成以下 4 步定型。

### Step 0: CLI 可用性预检（必做）

老仓的"定位脚本 + 握手文件"整段已废——本仓状态操作只有一个入口：`pipeline` CLI。

```bash
# pipeline CLI 可用性检查（单文件 bundle：packages/cli/dist/pipeline.mjs）
if ! command -v pipeline >/dev/null 2>&1 && ! npx --no-install pipeline --version >/dev/null 2>&1; then
  echo "[HARD STOP] pipeline CLI 未找到。" >&2
  echo "  修复：在插件仓 npm i && npm run build（产出 packages/cli/dist/pipeline.mjs），或 npx pipeline。" >&2
  exit 1
fi
```

> ⏳ **待迁移（M3 #26b）**：老仓 Step 0 的 `pipeline-doctor.sh` 依赖预检（分级报告 + 缺失
> skill token 清单 + AskUserQuestion 三选一自动安装编排）迁移为 `pipeline doctor` 统一健康面
> 后在此接回。当前 lite 的降级面：外部 skill 依赖已在 `skills/EXTERNAL-SKILLS.md` 显式清单化，
> 安装期由 `bash tools/verify-skills.sh` 硬校验（CONTRACT §5.7）——不会运行时才发现 skill 缺失。

### Step 1: L1 Track 路由（必做）

根据用户输入识别 Track。**关键词优先匹配**，模糊时询问用户。

| Track | 关键词（命中任一） | 后续动作 |
|-------|------------------|---------|
| **chat** | 问 / 解释 / how / what / why / 怎么用 / 是什么 / 区别 | **跳过 pipeline**，直接对话 |
| **pm** | 调研 / 竞品 / PRD / 需求 / 用户旅程 / 原型 / market / 立项 | 进入 PM 流程 |
| **frontend** | 前端 / UI / 页面 / 组件 / React / Vue / Next / Tailwind / 样式 / .tsx / .jsx / .vue | 进入 Frontend 流程 |
| **backend** | 后端 / API / 接口 / 数据库 / Go / Python / Java / Rust / NestJS / Postgres / endpoint | 进入 Backend 流程 |

**判定规则**：
1. 若命中且唯一 → 直接确认 Track
2. 若命中多个（例：'前端+后端联调'）→ **询问用户**：「这是前端还是后端？」
3. 若一个都不命中 → 显示 4 个选项让用户选

**Track=chat 时**：直接回答用户问题，不进入后续步骤。**禁止**为 chat 类输入创建 change。

> ⏳ **待迁移（M2 #19）**：老仓 router hook 的 Track 识别评分正则（读 manifest 派生缓存、
> UserPromptSubmit 自动路由）尚未迁移——当前由本 skill 按上表人工判定，行为面等价。

### Step 2: 扫描活跃 change

```bash
pipeline list          # 活跃 change 表（名字 / track / phase）
# 机器可读：pipeline list --json
```

### Step 3: 决策表（必读）

| Track | 活跃 change | 用户输入 | 行为 |
|-------|-------------|---------|------|
| chat | 任意 | 任意 | 跳过 pipeline，直接对话 |
| pm/frontend/backend | 0 | 有描述 | → **pipeline-lite:pipeline-open**（创建新 change） |
| pm/frontend/backend | 1 | "继续" / 无描述 | 自动恢复（`pipeline status <name>` 判定 phase） |
| pm/frontend/backend | 1 | 有描述（与该 change 无关） | **询问**：继续现有 vs 新建 |
| pm/frontend/backend | ≥2 | 任意 | 列出活跃 change 让用户选 |

#### 建新 change 前的归档软提醒（提醒强制、不阻断并行）

当 Track∈{pm,frontend,backend} 且**决策结果是「新建 change」**（用户有新描述）且活跃 change **非空**时——在调 `pipeline-lite:pipeline-open` **之前**，**先用 AskUserQuestion** 列出每个未归档活跃 change（`名 + phase + updated_at 陈旧度`，数据来自 `pipeline status <name>`），三选项：

| 选项 | 行为 |
|------|------|
| 归档某个再建 | 先走 `pipeline-lite:pipeline-archive` 归档所选 change，再 `pipeline-open` |
| 并行新建（默认放行） | 照常 `pipeline-open`，**不阻断**——多 change 并存是合法的 |
| 取消 | 不创建，回到对话 |

> **强制**：只要满足上述条件就**必须**弹这个提醒，**禁止**跳过直接 `pipeline-open`。但它是**软提醒**——用户选「并行新建」即正常放行，不硬拦。陈旧度用 `updated_at` 与当前时间差估算（如「3 天前」），帮用户判断哪个 change 该先收尾。

**断点恢复关键原则**：
- 每次本 skill 调用都从 Step 0 开始，**不依赖对话历史**
- 当前 phase 由 `.pipeline.yaml` 的 `phase` 字段决定（`pipeline get <name> phase`）
- 若 yaml 不存在或损坏，以文件系统状态为准（proposal/design/tasks 等存在性），用 `pipeline set` 修正后继续

---

## Step 4: Phase 分发（自动）

确定 Track + change 名 + phase 后，按下表分发到子 skill：

<!-- 分发表按相位名约定派生（pipeline-<phase>）；相位与合法转换的单一真相源 =
     templates/manifest.yaml（引擎真读，零硬编码）。新增相位改 manifest 一处即可。-->
| phase 字段值 | 调用子 skill |
|-------------|------------|
| `open` | `pipeline-lite:pipeline-open` |
| `explore` | `pipeline-lite:pipeline-explore` |
| `spec` | `pipeline-lite:pipeline-spec` |
| `build` | `pipeline-lite:pipeline-build` |
| `verify` | `pipeline-lite:pipeline-verify` |
| `ship` | `pipeline-lite:pipeline-ship` |
| `archive` | `pipeline-lite:pipeline-archive` |

```bash
# 读当前 track / phase（CLI 是唯一状态入口，勿手改 .pipeline.yaml）
TRACK=$(pipeline get "$CHANGE_NAME" track)
PHASE=$(pipeline get "$CHANGE_NAME" phase)
echo "[pipeline] 当前 change=$CHANGE_NAME / track=$TRACK / phase=$PHASE"

# 每进入一个 phase，先重建上下文：状态摘要 + 关键产物路径（design_doc / plan /
# verification_report），把产物文件本体 Read 进上下文——禁止凭印象进行。
pipeline status "$CHANGE_NAME"
for f in design_doc plan verification_report; do
  p=$(pipeline get "$CHANGE_NAME" "$f"); [ -n "$p" ] && [ "$p" != "null" ] && echo "产物[$f]: $p"
done
```

> ⏳ **待迁移（M2 #20 深化）**：老仓 `pipeline-context.sh` 的"至今全部产出 + 产物索引 +
> 领域词典"全量重注入尚未迁移。当前 lite 面：SessionStart（hooks/session-start.sh）已做
> 三注入（工作流宪法 templates/workflow.md + 活跃 change 上下文 + openspec 提示），phase 内
> 用上面 `pipeline status` + Read 产物文件重建。语义缺口只在"领域词典/产物全索引"。

**立即执行**：先按上面重建上下文（读产物文件本体），再使用 Skill 工具加载对应的 `pipeline-lite:pipeline-<phase>` 子 skill。**禁止跳过此步骤**。

子 skill 通过 `PIPELINE_TRACK` 和 `PIPELINE_CHANGE_NAME` 环境变量获取上下文：

```bash
export PIPELINE_TRACK="$TRACK"
export PIPELINE_CHANGE_NAME="$CHANGE_NAME"
```

---

## 阶段衔接规则

<IMPORTANT>
单次 `/pipeline` 调用从检测到的 phase 开始，但**绝不自动跨 phase 推进**——每个 phase 产出后必须停下、
把刚产出的文档/产物交用户过目并收反馈，用户说"继续"才手动 `pipeline transition` 进入下一 phase。
不允许 open→archive 一路自动跑完。
（硬规则，双重保障：① `pipeline check <name>` **只校验、绝不自动 transition**——校验通过后打印的是
"用户确认后手动跑"的 transition 命令；② 决策 phase（explore/spec/verify，单一真相源 =
templates/manifest.yaml 的 review_phases）由 CLI 在 transition 进入时落 `.pipeline-pending-review`
门 marker + hooks/gate.sh PreToolUse 门联合强制——在你用 AskUserQuestion 把产出拿给用户之前，
写类工具（Edit/Write/Bash/Skill）被拦（exit 2）；解封唯一正道是 AskUserQuestion 交互，
用户明示跳过时才删 marker。被拦的那次写操作内容已丢弃，解封后须重新发起。）
</IMPORTANT>

> ⏳ **待迁移（M1 #13）**：门 marker TTL 当前统一 15 分钟（CONTRACT §3 白名单②）；
> 老仓 confirm=300s / review·interaction=1800s 的分级 TTL 恢复后按 #13 收口。

### 必须暂停等用户的节点

**0. 阶段产出复核（HARD RULE，每个 phase 边界都要，最重要）**
   每当一个 phase 产出文档/产物并前向 transition 后（open→explore→spec→build→verify→ship），
   进入下一 phase 前**必须**用 AskUserQuestion 把刚产出的东西拿给用户：
   - **明确呈现**：这一步生成了什么（文档路径 + 要点摘要 / 原型截图），请用户过目；
   - **主动问反馈**：「方向对不对？要改哪里？还是继续？」——该问的都要问，不能替用户决定；
   - 用户给了修改意见 → 先改、再复核；用户确认 → 才进入下一 phase。
   绝不允许"全部生成一遍丢给用户"。每一步的文档和技能产出，反馈都不能省略。

其余决策节点（同样必须暂停）：
1. **brainstorming 确认设计方案**（explore phase 内）
2. **build_mode / isolation 选择**（build phase 入口）
3. **设计方向选择**（build phase，PM/前端原型）：借鉴 awesome-design-md 品牌 DESIGN.md，还是用 hue 自定义 —— 见 `pipeline-lite:pipeline-build`
4. **verify-fail 决策**（修复 vs 接受偏差）
5. **finishing-branch 分支处理方式**（ship phase 内）
6. **preset 升级条件触发**（hotfix/tweak → full）

phase **内部**步骤可连续做（产物靠 Edit/Write 落盘）；**phase 之间一律停下、复核、用户确认后手动 transition**，绝不自动推进。

### Preset 升级条件

当前 preset 为 `hotfix` 或 `tweak`，发现以下任一情况时**必须停止当前 preset 流程**，提示用户升级到 full（`pipeline set <name> preset full`）：

**hotfix → full** 触发条件（任一）：
- 改动涉及 **≥3 个文件**
- 涉及架构变更（新模块/新接口/新依赖）
- 涉及数据库 schema 变更
- 修复引入新的 public API

**tweak → full** 触发条件（任一）：
- 改动涉及 **≥5 个文件**
- 涉及多模块协调修改
- 需要 ≥5 个新测试用例
- 涉及配置项新增/删除（非值修改）

---

## 错误处理速查

| 场景 | 处理 |
|------|------|
| `pipeline` CLI 未找到 | Step 0 的 HARD STOP 提示（npm i && npm run build / npx pipeline） |
| `openspec` CLI 未安装 | 提示 `npm install -g @fission-ai/openspec` |
| `openspec` 项目未初始化（无 `openspec/`） | 提示先执行 `openspec init`（pipeline-open 会自动做） |
| `.pipeline.yaml` 格式异常 | 以文件状态为准，用 `pipeline set <name> <field> <value>` 修正后继续 |
| 子 skill 不可用 | 停止流程，提示安装（外部依赖清单见 `skills/EXTERNAL-SKILLS.md`）。**不要用普通对话替代** |
| 构建/测试失败 | 返回 build phase 修复，不进入 verify |
| change 目录结构不完整 | 按 `pipeline-lite:pipeline-open` 产物要求补齐 |
| 同时有多个活跃 change | 列出让用户选，**不要默认选第一个** |
| transition 报非法转换（exit 1） | `pipeline status <name>` 核对当前相位；合法边见 templates/manifest.yaml |

---

## 与本仓系统的关系

- **hooks 全自动挂载**（hooks/hooks.json）：SessionStart 三注入（宪法/上下文/openspec 提示）、
  UserPromptSubmit breadcrumb 每轮重提、PreToolUse 三门拦截——本 skill 不需要手工触发它们。
- **状态唯一入口 = pipeline CLI**：`init / get / set / set-many / cas / transition / check /
  status / list / inbox / import`（CONTRACT §3）。禁止直接 Edit `.pipeline.yaml`。
- **收件箱**：`pipeline inbox`（`--html` 出静态单页）回答"现在哪个 change 在等我做什么决定"。
- **不依赖 comet npm 包**：本 skill 完全独立。

---

## 速查：所有子 skill

| 命令 | Phase | 主要产物 |
|------|-------|---------|
| `pipeline-lite:pipeline-open` | 1. open | proposal.md / design.md / tasks.md / .pipeline.yaml |
| `pipeline-lite:pipeline-explore` | 2. explore | docs/superpowers/specs/...-design.md (技术 RFC) |
| `pipeline-lite:pipeline-spec` | 3. spec | docs/superpowers/plans/... / delta spec |
| `pipeline-lite:pipeline-build` | 4. build | 代码 + commit |
| `pipeline-lite:pipeline-verify` | 5. verify | 验证报告 + 三轨 review 通过 |
| `pipeline-lite:pipeline-ship` | 6. ship | PR + main spec 同步 |
| `pipeline-lite:pipeline-archive` | 7. archive | 归档 + (可选) learn-record |

### 正交持久 worker 层（与 7-phase 解耦）

> ⏳ **待迁移（M4 #27 channel / #28 mem）**：老仓 `/channel`（event-sourced 消息/事件总线 +
> worker 生命周期 spawn/send/wait/interrupt/kill）与 mem（跨 runtime 会话检索）子系统尚未迁移。
> 语义要点先立此存照：channel 与 build→verify barrier **正交**——只读地为 barrier 提供
> worker/事件事实，绝不触 barrier/三门/build_sha，主线仍 owns commits；channel 事件绝不驱动
> 阶段跳转。迁移落地前，本仓**没有** `/channel` 入口，勿引用。
