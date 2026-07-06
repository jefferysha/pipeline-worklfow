---
name: "Pipeline: Uninstall"
description: 安全卸载 pipeline——消费所有权清单、三前置 + prune 去毒 + homedir 守卫——骨架，待 BACKLOG #24 实现
category: Workflow
tags: [workflow, pipeline, uninstall, cleanup]
---

# /pipeline-uninstall — 安全卸载

> ⏳ **骨架占位（待 BACKLOG #24 实现，勿在此之前调用）**。移植来源：老仓
> `commands/pipeline-uninstall.md` + `pipeline-uninstall.sh`。老仓脚本未迁移；本文件只保留
> **不可阉割语义**作为 #24 的实现规格（所有权 hash 追踪 scrubber，对标老仓
> `.pipeline-owned.json`），不含可执行入口。

把当前项目里 pipeline init 写入的资产安全移除：**只删所有权清单里登记的文件**，
**绝不盲扫**用户运行时数据目录（`.codex/` `.claude/` `.opencode/` 等）。
对标 Trellis `trellis uninstall`。

**规划输入**（#24 实现时对齐）：
- `/pipeline-uninstall`（交互确认；非 TTY fail-closed 拒绝，必须显式 `--yes`）
- `/pipeline-uninstall --dry-run`（仅预览删除计划，不动任何文件）
- `/pipeline-uninstall --yes`（或 `-y`，跳过确认；脚本/CI 必需）

## 不可阉割语义（#24 验收面；顺序铁律）

0. **homedir 守卫**：在 `$HOME` 根运行 → HARD STOP（会牵连 `~` 的运行时数据）；显式 env 才旁路。
1. **前置 1**：无 pipeline 资产目录 → 静默成功 exit 0（未安装幂等）。
2. **前置 2**：所有权清单缺失/空/损坏 → 硬失败 exit 1（拒绝盲删，与前置 1 退出码区分）。
3. **prune 去毒**：自愈中毒清单——自有目录恒留、根 `AGENTS.md` 仅含双哨兵
   （`PIPELINE:START`+`PIPELINE:END`）才剥离、迁移 from/to 保留、仅 pruned>0 落盘。
4. **plan + render**：从剪后清单建删除计划并打印（`--dry-run` 在此 return）。
5. **confirm**：未 `--yes` 时——非 TTY fail-closed exit 1；TTY 交互确认默认 yes。
6. **execute**：删清单内文件 + 整删 pipeline 资产目录。

## 当前行为（#24 落地前）

被调用时向用户如实说明：`/pipeline-uninstall` 尚未在 lite 仓实现（BACKLOG #24）。
lite 当前落盘面很小（`openspec/changes/**/.pipeline.yaml` / `.pipeline-history.jsonl` /
`.breadcrumb` + 项目根三门 marker），可指引用户人工审阅删除；**不要**替用户批量 rm。
