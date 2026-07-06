---
name: pipeline-lite
description: "轻量 7-phase 流水线主入口。识别当前 change 的相位（open/explore/spec/build/verify/ship/archive），一律通过 pipeline CLI 读写状态与推进转换；支持断点恢复：重读 .pipeline.yaml，不依赖对话历史。"
---

# /pipeline-lite — 主编排入口

## 7 相位

```
open → explore → spec → build ⇄ verify → ship → archive
```

- `build ⇄ verify` 双向：verify 不过退回 build 返工。
- 合法转换与 `review_phases` 的单一真相源是 `templates/manifest.yaml`（引擎真读，不硬编码）。
- 状态落盘：`openspec/changes/<name>/.pipeline.yaml`（与老内核字节级兼容，**勿手改**）；
  lite 历史在同目录 `.pipeline-history.jsonl`。

## 用法（一律走 pipeline CLI）

| 命令 | 作用 | exit |
|---|---|---|
| `pipeline init <name> --track <t> --preset <p>` | 建 change | 0/1 |
| `pipeline get <name> <field>` | 读字段（裸值） | 0；字段不存在=1 |
| `pipeline set <name> <field> <value>` | 写字段 | 0；四闸拒写=1 |
| `pipeline cas <name> <field> <expect> <new>` | 比较后写 | 0；不匹配=3 |
| `pipeline transition <name> <event>` | 推进相位（输出 `old -> new`） | 0；非法=2 |
| `pipeline check <name>` | 相位出口 guard 报告 | 0 过 / 2 不过 |
| `pipeline status [name] [--json]` | 单 change 摘要 | 0 |
| `pipeline list [--json]` | 活跃 change 表 | 0 |

## 工作流

1. **断点恢复优先**：先 `pipeline list` 找活跃 change，有则 `pipeline status <name>` 定位相位继续，不新开。
2. 新任务：`pipeline init` → 按相位推进；每次离开相位前 `pipeline check <name>` 过 guard。
3. 相位内产出交用户复核后再 `pipeline transition`——不要 solo 跑完直接推进。

## 三门 marker（项目根）

`.pipeline-pending-confirm` / `-review` / `-interaction` 存在且 15 分钟内新鲜时，
PreToolUse 门（hooks/gate.sh）会拦截写类工具并 exit 2。解封：用 AskUserQuestion 与用户交互；
用户明示跳过时删除对应 marker 文件。被拦的那次写操作内容已丢弃，解封后须**重新发起**。

## 依赖

本 skill 无外部 skill 依赖；如日后引用，必须在 `skills/EXTERNAL-SKILLS.md` 声明并由
`bash tools/verify-skills.sh` 校验通过（CONTRACT §5.7）。
