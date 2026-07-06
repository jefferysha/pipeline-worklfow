# GOAL — pipeline-worklfow（轻量重构）

## 北极星

以 **TypeScript 单语言**重建 [workflow-plugin](https://gitlab.chuangzhen-sh.net)（本机路径
`/Users/a1234/Documents/code-manager/projects/workflow-plugin`，下称「老内核」）的
7-phase 开发流水线内核为一个**轻量、开箱即用**的 Claude Code 插件：

> 保留老内核最值钱的硬保障（状态机 + 三门 + guard），砍掉全部正交子系统，
> 数据格式向后兼容（能直接读写既有项目的 `.pipeline.yaml`），
> 运行时依赖只有 node ≥22 + 几百行 bash shim。

## 为什么（动机，来自 2026-07-06 架构评审）

1. 老内核 bash 7.2 万行已过维护经济性拐点，且 python3 已是关键路径硬依赖——「纯 bash 可移植」前提不再成立。
2. 三读取器契约（bash/python/manifest.py）靠纪律防漂移，单语言可构造性消灭。
3. 竞品对照（comet 2k★ / Trellis 11.8k★）证明：赢用户靠的是「5 分钟建立心智模型」，不是功能面。
4. base64 历史塞 YAML 的存储变形 → 本仓一开始就用 JSONL 侧文件。

## 范围

**v0.1（当前 loop 收敛目标）**
- `packages/kernel`：`.pipeline.yaml` 读写（字段序/引号契约兼容老内核）、mkdir 原子锁、CAS、
  7-phase 转换合法性、guard-lite、manifest 单一真相源（引擎侧真读 `review_phases`——
  老内核的半接线欠账在本仓构造性修复）。
- `packages/cli`：`pipeline` 命令（init/get/set/set-many/cas/transition/check/status/list，`--json`）。
- `hooks/`：纯 bash 薄 shim（PreToolUse 三门 exit-2 拦截、UserPromptSubmit breadcrumb 注入、
  SessionStart 引导）——**热路径永不 spawn node**。
- `tools/oracle/`：golden-oracle 双跑校验（老 `pipeline-state.sh` vs 新 CLI，同 fixture 逐字 diff）。
- `.claude-plugin/`：CC 插件打包。

**v0.2（backlog，见 BACKLOG.md）**：收件箱 UI（等待三门决策的 change 清单）、statusline、
esbuild 单文件分发、老仓库 history 导入工具。

**v1.0（2026-07-06 用户指令：全部核心功能迁移，不做部分切片）**
原 non-goals 作废。范围 = 老仓全部核心功能 + 本次重构启动前分析出的全部缺口，按
BACKLOG.md 六个里程碑推进：
- **M1 内核深度**：guard 全量校验面、task lifecycle、living-spec、session、manifest 全派生面、
  transition 全副作用、门 TTL 分级（confirm 300s / review·interaction 1800s 恢复老内核口径）
- **M2 hooks/插件全保真**：router（Track 识别 + breadcrumb 注入）、context/openspec/宪法注入、
  PostToolUse 全套（confirm-clear/decision-recorder/skill-tracker/interactive-skill-gate）、
  7 相位 SKILL + openspec 四命令 + learn-record + 4 agents + sync/uninstall（所有权 scrubber）
- **M3 dashboard**：TS 全局 server（版本抢占 + 写端点 token 鉴权——修老仓架构欠账 #3/#4）+
  前端信息架构按 UI 诊断重构（收件箱默认视图 / Kanban / Settings 分离 / debug 降级）
- **M4 channel + mem**：event-sourced worker 总线与跨 runtime 会话检索（TS 重写）
- **M5 automation**：AFK 调度（老仓 5 个 TS 包本就是 TS，评估直接移植 vs 重写）
- **M6 竞品缺口收尾**：上下文压缩（Comet）、auto-transition 中间档、Cursor 适配器转正、
  Trellis parity 的 8 partial + 1 missing
（tap 流量代理暂列 M6 之后待定项——与工作流内核正交，迁移前与用户确认优先级。）

**v0.1 成功判据 → 2026-07-06 iteration-9 收敛检查全部达成 ✅（见 progress.md）**

## 成功判据（v0.1 收敛即验收）

1. golden-oracle parity：init/get/set/transition/check 五个子命令面与老内核逐字等价（差异白名单仅时间戳）。
2. 老仓库任一真实 change 的 `.pipeline.yaml` 可被 lite CLI 读取、合法转换、写回，且老内核仍能读（含 base64 历史区原样保留）。
3. `npm test` 全绿；kernel 零第三方运行时依赖。
4. 新用户路径：clone → `npm i` → `npx pipeline init` → 5 分钟内跑通 open→archive 一轮。
