---
name: "Pipeline: Pass"
description: 放行当前复核门——把 change 按状态机向前推进一相（tenon transition <change> <前进 event>）
category: Workflow
tags: [workflow, pipeline, gate, transition, hitl]
---

# /pipeline-pass — 放行（继续）

人的四个动作之一（继续/打回/重试/终止）里的**继续**。把停在复核门的 change 按状态机
**向前推进一相**，等价于底层 `tenon transition <change> <前进 event>`。

实现真相源：状态机转换在 `packages/cli/src/commands/transition.ts`（`cmdTransition`），
事件→转移边表是 kernel 单一真相源 `packages/kernel/src/flow/transition-table.ts`。本命令是薄封装，
不重写转换逻辑。

**输入**：`/pipeline-pass` 后可跟 change 名（如 `/pipeline-pass add-auth`）。省略则先定位待放行的 change。

## 执行步骤（在仓库根跑 CLI）

1. **定位 change**：若给了名字直接用；否则跑 `tenon inbox --json` 看等待人工决策的 change
   （复核相位 = explore/spec/verify），从中挑当前这个；仍不确定就把候选列给用户拍板，别猜。
2. **定位前进 event**：读当前相位 `tenon get <change> phase`，按下表取该相位的前进 event：

   | 当前相位 | 前进 event | 落到 |
   |----------|-----------|------|
   | open | `open-complete` | explore |
   | explore | `explore-complete` | spec |
   | spec | `spec-complete` | build |
   | build | `build-complete` | verify |
   | verify | `verify-pass` | ship |
   | ship | `ship-complete` | archive |

3. **执行放行**：`tenon transition <change> <前进 event>`（成功 `[TRANSITION] name: old -> new` 走 stderr，exit 0）。

## 诚实约束（不可阉割）

- **前置校验硬闸**：`transition` 会在 kernel 里跑事件前置校验（如 `explore-complete` 要求 `design_doc`
  字段非空且文件存在、`verify-pass` 要求 `verification_report` + `branch_status=handled` +
  agent/codex 双 review pass + build_sha==HEAD barrier）。校验不过 → exit 1 + 逐行 stderr 说明缺什么，
  **零写盘**。这是设计上的门，不是命令的 bug——按 stderr 补齐产出后再放行，别绕过。
- **review 门放行**：先完成产物并选择 event，运行
  `tenon review request <change> --event <event>`，再把产出交用户复核并取得明确继续指令。Codex
  档 A/B 会在用户下一条正常对话中识别“确认继续 / 继续执行 / 全部执行”等，并在下一次工具调用前写入
  event-bound approval receipt；普通询问不会误放行。档 C 无 hook 时也必须保留这条明确确认的对话事实并
  运行 `tenon review acknowledge <change>`；**不得**删除 `.pipeline-pending-*` marker 绕过 review。
- **非 default workflow**：自定义 workflow（`.pipeline/workflows/<name>.yaml`）的 event 名由当前 step
  自己声明，不吃上表固定 8 事件；`tenon transition` 会按当前 step 的出边解析，event 不在出边里会
  报「该 step 支持：…」，照提示选。
