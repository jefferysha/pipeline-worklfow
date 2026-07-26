# Pi Agent pipeline 适配器（lite，档 B）

> 契约：`adapters/contract.md`。本 adapter 把 Pi Agent 能力映射到 pipeline 三能力：
> **inject/track native、veto 降级**（档 B）。

## 转 active 做了什么（#40）

1. **inject native**：`hooks/inject.sh` 薄包 lite baseline `hooks/session-start.sh`，SessionStart 注入
   宪法 + 活跃 change 上下文（`hookSpecificOutput.additionalContext`，conformance §⑧.3 断言包 baseline 宪法）。
2. **track native**：`hooks/track.sh` 透传 `hooks/skill-tracker.sh`，真 append
   `openspec/changes/<name>/.pipeline-history.jsonl`——与 codex/gemini/CC **同一条记录**（conformance §⑧.4 断言）。
3. **veto 如实降级**：Pi 无原生 pre-tool 硬拦 hook——**不注册伪 PreToolUse veto**（conformance 断言无 `hooks/veto.sh`）。
   enforcement 走 `.pi/extensions` 运行时 advisory（`.pi/rules/pipeline.md`）+ CLI review receipt。

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
  fallback: extension-advisory                # .pi/rules/pipeline.md + .pi/extensions 运行时提示 + CLI review receipt
  note: "Pi 无原生 pre-tool 硬拦 hook（不伪装原生硬拦）"
track:
  status: native
  event: PostToolUse
  format: history-append
  impl: hooks/track.sh 透传 hooks/skill-tracker.sh
```

## 人工确认（HITL · veto 降级路径）

veto 降级为 advisory 不会改变 review 的授权语义：完成产物并选择 event 后运行
`tenon review request <change> --event <event>`，人类明确确认后运行
`tenon review acknowledge <change>`。不得手动删除 `.pipeline-pending-review`。
