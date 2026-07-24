---
name: pipeline-lite
description: "轻量 7-phase 流水线主入口。识别当前 change 的相位（open/explore/spec/build/verify/ship/archive），一律通过 pipeline CLI 读写状态与推进转换；支持断点恢复：重读 canonical current，不依赖对话历史。"
---

# /pipeline-lite — 主编排入口

## 7 相位

```
open → explore → spec ⇄ build ⇄ verify → ship → archive
```

- `requirements-changed`：build 发现需求/设计已变化时回退 spec，重新登记、读取并复核修订文档。
- `build ⇄ verify` 双向：verify 不过退回 build 返工。
- 合法转换与 `review_phases` 的单一真相源是 `templates/manifest.yaml`（引擎真读，不硬编码）。
- 状态唯一真相：`openspec/changes/<name>/.pipeline-run/current.json`；`.pipeline.yaml` 是与老内核
  字节级兼容的可修复投影（两者都**勿手改**）。lite 历史在同目录 `.pipeline-history.jsonl`。

## 用法（一律走 pipeline CLI）

| 命令 | 作用 | exit |
|---|---|---|
| `pipeline init <name> --track <t> --preset <p>` | 建 change | 0/1 |
| `pipeline get <name> <field>` | 读字段（裸值；字段缺失/未知 → 空行） | 0；change 缺失=1 |
| `pipeline set <name> <field> <value>` | 写字段 | 0；四闸拒写=1 |
| `pipeline cas <name> <field> <expect> <new>` | 比较后写 | 0；不匹配=3 |
| `pipeline transition <name> <event>` | 推进相位（`old -> new` 走 stderr） | 0；非法/未知事件=1 |
| `pipeline check <name>` | 相位出口 guard 报告 | 0 过 / 2 不过 |
| `pipeline document init/record/read/status <name>` | 受治理 OpenSpec 文档的生成与读取证据 | status 不完整=2 |
| `pipeline status [name] [--json]` | 单 change 摘要 | 0 |
| `pipeline list [--json]` | 活跃 change 表 | 0 |

## 工作流

1. **明确恢复才恢复**：仅当用户明确说“继续/恢复”或点名 change，或 root dispatch 给出 `intent: resume` 时，才用 `pipeline status <name>` 定位相位继续。仓库里的活跃 change / `.pipeline-active` 都只是候选，不能自动绑定新会话。
2. 新任务（含 root dispatch 的 `intent: new`）：`pipeline init` → `pipeline session activate <name>` → 按相位推进；恢复也在 `pipeline status <name>` 复核后先 `pipeline session activate <name>`。若 dispatch 明确含 `continuous_execution: true`，上述 activate 必须带 `--continuous`，将持续授权仅绑定到这个 Change：每次离开相位仍必须 `pipeline check <name>` 过 guard；review step 仍要 `request`，但在真实证据完成后可用 `acknowledge --delegated` 留下授权来源并推进。多个活跃 change 时，泛化的“继续”必须让用户点名，绝不按 mtime 或旧 `.pipeline-active` 猜测。
3. 未授权时，相位内产出交用户复核后再 `pipeline transition`；已授权时可连续推进无 confirm/external gate 的出边，但绝不跳过证据、guard、验证或外部副作用边界。

## 三门 marker（项目根）

`.pipeline-pending-confirm`（5 分钟）/ `-review` / `-interaction`（30 分钟）存在且仍新鲜时，
PreToolUse 门（hooks/gate.sh）会拦截写类工具并 exit 2。先把决策/产出交用户确认；Codex 档 A/B 会在
用户下一条正常对话明确回复“确认继续 / 继续执行 / 全部执行”时自动解封，AskUserQuestion 宿主仍可在
该工具交互后解封。档 C 必须保留明确确认事实，**不得删除 marker 绕过**。被拦的那次写操作内容已丢弃，
解封后须**重新发起**。

## 依赖

本 skill 无外部 skill 依赖；如日后引用，必须在 `skills/EXTERNAL-SKILLS.md` 声明并由
`bash tools/verify-skills.sh` 校验通过（CONTRACT §5.7）。
