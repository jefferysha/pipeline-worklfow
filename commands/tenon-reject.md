---
name: "Pipeline: Reject"
description: 打回复核——把 change 按状态机回退（verify 相位走 verify-fail 退回 build）
category: Workflow
tags: [workflow, pipeline, gate, transition, hitl]
---

# /pipeline-reject — 打回

人的四个动作之一（继续/打回/终止/重试）里的**打回**。把复核不通过的 change 按状态机
**回退**，等价于底层 `tenon transition <change> <回退 event>`。

实现真相源：同 `/pipeline-pass`——`packages/cli/src/commands/transition.ts` +
kernel `packages/kernel/src/flow/transition-table.ts`（事件表单一真相源）。

**输入**：`/pipeline-reject` 后可跟 change 名。省略则先定位待打回的 change。

## 执行步骤（在仓库根跑 CLI）

1. **定位 change**：给了名字直接用；否则 `tenon inbox --json` 找处于复核门的 change，不确定让用户拍板。
2. **定位回退 event**：读 `tenon get <change> phase`。默认 workflow 的**唯一回退边**是：

   | 当前相位 | 回退 event | 落到 | 副作用 |
   |----------|-----------|------|--------|
   | verify | `verify-fail` | build | `verify_result=fail` + `build_sha=null`（下轮 build 重新冻结 SHA） |

3. **执行打回**：`tenon transition <change> verify-fail`（exit 0，`[TRANSITION]` 走 stderr）。

## 诚实约束（不可阉割 · 别伪装成有通用回退）

- **默认 workflow 只有 verify→build 一条回退边**。explore/spec 的复核不满意**没有**对应的 backward
  transition event（老仓 `_DEFAULT_TRANSITIONS` 就只给了 `verify-fail` 一条回退边）。这两相的「打回」
  实际做法是：**不转换**，让当轮 agent 在原相位按反馈重做产出（改 `design_doc` / `plan`），产出达标后
  再 `/pipeline-pass`。把这点如实告诉用户，不要硬造一个不存在的回退 event。
- **codex / 档 C 平台的门**：打回不涉及清 marker——marker 是「等人拍板」的信号，打回后 change 仍需继续，
  由 agent 重做产出；真正跨门（放行）才清 marker。
- **非 default workflow**：回退边由自定义 workflow 的 step 出边声明，按 `tenon transition` 的
  「该 step 支持：…」提示选对应的回退 event。
