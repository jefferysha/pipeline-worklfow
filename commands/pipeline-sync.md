---
name: "Pipeline: Sync"
description: in-project 资产同步 + 升级 channel 派生 + 落后检测（版本化收口）——骨架，待 BACKLOG #24 实现
category: Workflow
tags: [workflow, pipeline, versioning, migration, upgrade]
---

# /pipeline-sync — 版本化资产同步

> ⏳ **骨架占位（待 BACKLOG #24 实现，勿在此之前调用）**。移植来源：老仓
> `commands/pipeline-sync.md` + `pipeline-sync.sh`。老仓脚本未迁移；本文件只保留
> **不可阉割语义**作为 #24 的实现规格，不含可执行入口。

把跟随插件版本演进的 **in-project 资产**（`.pipeline.yaml` schema、openspec 模板、迁移）同步到当前 CLI 版本，
带冲突协商 + 降级守卫 + `--migrate` opt-in 硬闸。对标 Trellis `trellis update` / `trellis upgrade`。

**规划输入**（#24 实现时对齐）：
- `/pipeline-sync`（默认 `sync`，**只报告不改盘**）
- `/pipeline-sync --migrate`（opt-in 执行路径迁移；breaking 升级必须显式带）
- `/pipeline-sync --allow-downgrade`（CLI 版本低于项目时强制降级）
- `/pipeline-sync upgrade-channel`（从已装插件清单派生升级 channel）

## 不可阉割语义（#24 验收面；删一条视为 critical 阉割）

1. **`--migrate` opt-in 默认只报告**：sync 决策层算出该做什么，但真正的迁移文件操作只在显式 `--migrate` 时跑。
2. **downgrade 守卫默认拒**：CLI < 项目版本 → `proceed=false`、不写任何东西；`--allow-downgrade` 才放行（抑制 config-section 注入，但版本戳与迁移任务仍写）。
3. **顺序铁律**：升级需求探测 → prune → config-section 注入门 → `--migrate` 硬闸（breaking∧recommend 双真且无 `--migrate` → 退码 1）。
4. **channel 派生不可省**：upgrade 按当前插件版本后缀派生 latest/beta/rc，让 beta/rc 用户不被甩回 latest。
5. **横幅纯本地**：banner 只比对项目版本戳 vs CLI 版，**零网络请求**。
6. **破坏性安全三闸**：`--migrate` 落地前备份先行 / hash 闸 / 根守护。

## 当前行为（#24 落地前）

被调用时向用户如实说明：`/pipeline-sync` 尚未在 lite 仓实现（BACKLOG #24），当前
`.pipeline.yaml` 与老内核字节级兼容（CONTRACT §1）、无需迁移；老仓历史导入用
`pipeline import <name> [--strip]`。**不要**试图手写等价迁移逻辑。
