# Pi Agent pipeline 适配器（lite，档 B）

> 契约：`adapters/contract.md`。本 adapter 把 Pi Agent 能力映射到 pipeline 三能力：
> **inject/track native、veto 降级**（档 B）。

## 转 active 做了什么（#40）

1. **inject native**：`hooks/inject.sh` 薄包 lite baseline `hooks/session-start.sh`，SessionStart 注入
   宪法 + 活跃 change 上下文（`hookSpecificOutput.additionalContext`，conformance §⑧.3 断言包 baseline 宪法）。
2. **track native**：`hooks/track.sh` 透传 `hooks/skill-tracker.sh`，真 append
   `openspec/changes/<name>/.pipeline-history.jsonl`——与 codex/gemini/CC **同一条记录**（conformance §⑧.4 断言）。
3. **veto 如实降级**：Pi 无原生 pre-tool 硬拦 hook——**不注册伪 PreToolUse veto**（conformance 断言无 `hooks/veto.sh`）。
   enforcement 走 `.pi/extensions` 运行时 advisory（`.pi/rules/pipeline.md`）+ 手动 Unlock sentinel。

> 这是与 cursor/copilot **不同的降级点**（它们降 inject，pi 降 veto）——诚实：填表逼出每能力的真实档位，
> 不为齐整而伪装。tier B 的判据是"部分 native、部分如实降级"，pi 降的是 enforcement 而非注入。

## 安装

```bash
adapters/pi/install.sh --target <项目目录>   # 默认 $PWD
adapters/pi/install.sh --no-hooks            # 只装 advisory 静态层（降级）
```

或经顶层派发器：`adapters/install.sh --pi --target <dir>`。

## 三能力

```yaml
inject:
  status: native
  event: SessionStart
  format: json-additionalContext
  impl: hooks/inject.sh 薄包 hooks/session-start.sh
veto:
  status: degraded
  fallback: extension-advisory                # .pi/rules/pipeline.md + .pi/extensions 运行时提示 + Unlock sentinel
  note: "Pi 无原生 pre-tool 硬拦 hook（不伪装原生硬拦）"
track:
  status: native
  event: PostToolUse
  format: history-append
  impl: hooks/track.sh 透传 hooks/skill-tracker.sh
```

## Unlock sentinel（HITL 解封 · veto 降级路径）

veto 降级为 advisory——review 门唯一放行路径 = 删项目根 marker（与 CC `AskUserQuestion` 语义等价，contract §2）：

```bash
rm .pipeline-pending-review     # 或 .pipeline-pending-confirm / .pipeline-pending-interaction
```
