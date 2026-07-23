# pipeline-lite 工作流宪法（SessionStart 注入 · lite 版）

> 蒸馏来源：老仓 workflow-plugin/workflow.md（L0–L3），命令面已全部换成本仓 pipeline CLI。
> 单一真相源：合法转换 / review 相位 = `templates/manifest.yaml`；change 状态 = `openspec/changes/<name>/.pipeline.yaml`。

## 一、7 相位协议

```
open → explore → spec → build ⇄ verify → ship → archive
```

- `build ⇄ verify` 双向：verify 不过 → `verify-fail` 退回 build 返工；跨相位不并发（评审移动靶在因果上不成立）。
- **Shell-driven 状态变更（硬规则）**：`.pipeline.yaml` 一律经 pipeline CLI 读写，**禁止直接 Edit**：
  - `pipeline init <name> --track <t> --preset <p>` 建 change；`pipeline list` / `pipeline status [name]` 看现状
  - `pipeline get / set / set-many / cas` 读写字段（四闸拒写保格式兼容）
  - `pipeline check <name>` 过相位出口 guard（只校验不推进）→ `pipeline transition <name> <event>` 推进
  - `pipeline inbox` 汇总待办交互；`pipeline import <name>` 迁移老仓历史
- **明确恢复才恢复**：`pipeline list` 的活跃 change 与 `.pipeline-active` 都只是恢复候选，不能在会话开始自动绑定。只有用户明确说“继续/恢复”或点名 change，才从其 `.pipeline.yaml` 相位继续；任何独立新目标都从 `open` 创建新 change。多个候选时必须让用户点名，绝不按 mtime 猜测。

## 二、三门语义（交互门 marker）

项目根的 `.pipeline-pending-confirm` / `-review` / `-interaction` 三门 marker，存在且 mtime < 15 分钟视为新鲜：

- 新鲜时 PreToolUse 门（hooks/gate.sh）拦截写类工具（exit 2）；进入 review 相位（explore/spec/verify）时由 CLI 落 `-review` 门。
- 解封正道：把当前决策/产出交用户明确确认。支持 AskUserQuestion 的宿主在该交互后解封；Codex 档 A/B
  在用户下一条正常对话明确回复“确认继续 / 继续执行 / 全部执行”时自动解封。档 C 无 hook 时保留确认事实，
  **不得删 marker 绕过**。被拦的那次操作已丢弃，解封后**重新发起**。

## 三、HITL 原则（交互硬姿态）

1. **任何分歧 / gap / 模糊点 → 转成问题问用户，禁止自行假设糊弄**。用 AskUserQuestion 批量问（一次 ≤4 问，推荐答案标注放首项），答完重扫一遍，gap 清零才算相位完成。
2. **「可选 / 条件」≠ 自行跳过的授权**：做不做本身是决策点，交用户拍板；唯一例外是纯客观事实可定的选型。
3. **终态 = 用户在硬取舍上做了承诺，不是文档写出来了**。相位产出交用户复核后再 `pipeline transition`，不 solo 跑完直接推进。
4. 高风险问题当场逼出明确决断，不许「都要 / 先这样」收场。

## 四、breadcrumb 约定（对抗长会话漂移）

- CLI 在 `pipeline transition` 时按 manifest 把当前相位面包屑写进 `openspec/changes/<name>/.breadcrumb`；UserPromptSubmit 薄 shim（hooks/breadcrumb.sh）只在用户明确恢复时读取指定/唯一候选，绝不按 mtime 把旧 change 注入新会话。
- 铁律：某相位的必做步骤若没进 breadcrumb，AI 会随会话变长悄悄跳过——改必做步骤只改 manifest 一处。
- 清窗纪律：相位之间（尤其 spec→build、build→verify）默认提示 `/clear`，靠 `.pipeline.yaml` + 本宪法注入在干净会话重建上下文。
