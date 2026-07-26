---
name: "Pipeline: Channel"
description: 正交持久 worker 层（event-sourced 消息/事件总线 + 从事件流重建 worker/thread 状态）——绝不触 barrier/三门/build_sha
category: Workflow
tags: [workflow, pipeline, channel, worker, event-sourced]
---

# /channel — 正交持久 worker 层（event-sourced，历史迁移 / experimental 兼容面）

把 pipeline 的 **channel runtime**（event-sourced 消息/事件总线 + worker 生命周期投影）暴露为可调子命令。
重活在独立 workspace 包（`packages/channel/src/`，纯逻辑 + 注入 fs 面，零第三方依赖），CLI 薄壳在
`packages/cli/src/commands/channel.ts`（`cmdChannel(deps, sub, args, host?)`）。

> **定位（GOAL G4(b)，2026-07-16 codex 方案 D）**：channel 已从 kernel 提取为独立包
> `@tenon/channel`，CLI 是唯一依赖者，标记为**历史迁移能力 / experimental 兼容面**——保留
> echo 能力与全部既有测试/事件格式/兼容入口，但**不是 v3 默认 agent runtime**：不移植 Claude/Codex
> adapter、不新增 server endpoint、不新增 dashboard 页面。重开投资需满足 GOAL G4 的全部条件。

channel 是 pipeline 的**正交持久 worker 层**——与 build→verify barrier 正交，**绝不触 barrier / 三门 /
build_sha**；worker 不 commit，主线仍 owns commits。channel 只读地为 barrier 提供 worker 事实。

实现真相源（BACKLOG #27 / GOAL A4 M4）：
- 事件模型 + 状态重建纯逻辑：`packages/channel/src/`（events / seq / paths / worker-state /
  filters / thread-state / turns / guard / store）。
- CLI 薄壳：`packages/cli/src/commands/channel.ts`。
- 真实 e2e 证据：`packages/cli/src/channel.integration.test.ts`（真临时 channel root、真 append、真重建）。
- 老仓对照源：`skills/pipeline/scripts/channel/*.py`（约 20 模块）+ `channel-state.sh`。

## event-sourced 核心语义

- **存储模型**：每个 channel 一个目录 `<root>/<bucket>/<channel>/{events.jsonl, .seq, <name>.lock}`。
  `root = $TRELLIS_CHANNEL_ROOT 或 ~/.trellis/channels`；`bucket = cwd sanitize`（`$TENON_CHANNEL_PROJECT`
  可覆盖）；`--scope global` → `_global` 桶。
- **append-only 事件日志**：每 channel 一条 `events.jsonl`（每行一事件）。所有派生状态（worker
  registry / thread / inbox 计数）都是**从事件流纯函数投影**——磁盘不存派生态，可在任意机器一致重放。
- **21 冻结事件 kind**（运行时校验 SOT）：`create/join/leave/message/thread/context/channel`（结构）·
  `spawned/killed/respawned/progress/done/error/waiting/awake`（生命周期）·
  `undeliverable/interrupt_requested/turn_started/turn_finished/interrupted/supervisor_warning`（投递/中断/turn）。
- **seq**：由 append 内部分配、单调递增；`.seq` 侧车纯缓存，reconcile 永远以 jsonl 尾为真相
  （侧车滞后前修 / 超前回退，**绝不留 seq 空洞**；有非空行却找不到 seq → 宁崩不猜）。
- **worker registry 投影**：两正交维度 `lifecycle`(starting/running/done/error/killed/crashed) ×
  `activity`(idle/mid-turn)；done 非 synthesized 仅转 idle 不终结（复用命脉），synthesized 才 terminal；
  `pendingMessageCount` 从 durable 事件 + consumedInputSeq 水位数，terminal worker 恒 0。

## 已落地子命令（事件面）

结构
- `tenon channel create <name> --task T [--type chat|forum] [--scope project|global] [--description D]`
- `tenon channel title <name> (--set <title> | --clear) [--scope ...]`
- `tenon channel context <name> --add|--delete (--file <ABS> | --raw <text>) [--thread K] [--scope ...]`
- `tenon channel dir <name> [--scope project|global]` — 打印 channel 目录绝对路径

消息 / 中断 / 读
- `tenon channel send <name> <text> --as <by> [--to CSV] [--delivery-mode appendOnly|requireKnownWorker|requireRunningWorker]`
- `tenon channel wait <name> --as <self> [--from CSV] [--kind K] [--to T] [--since SEQ] [--all]`（无匹配 exit 124）
- `tenon channel messages <name> [--last N] [--since SEQ] [--kind K] [--from CSV] [--to T]`
- `tenon channel interrupt <name> --as <by> --to <worker> <text>`（只写事件，supervisor 执行）
- `tenon channel registry <name>` — worker 注册表投影（JSON）

forum
- `tenon channel thread post <name> --as <by> --action opened|comment|status|labels|assignees|summary|processed [--thread K] [...]`
- `tenon channel thread rename <name> --as <by> --thread OLD --new-thread NEW`
- `tenon channel forum list <name> [--json]`
- `tenon channel list [--json] [--all] [--all-projects]`

## 不可阉割语义（删一条视为 critical 阉割）

1. **正交性**：channel 操作持久 worker 层，**绝不**触 barrier / confirm-review-interaction 三门 /
   build_sha / git-commit；主线仍 owns commits。`cmdChannel` 只用 `deps.io`——绝不碰 `deps.store`
   （`.pipeline.yaml`）/ `deps.flow`（相位/转换）/ 三门 marker。事件全落在 channel root，与
   `openspec/changes` 完全隔离（有真 fs e2e + throwing-proxy 守卫自证）。
2. **send 三态校验**：先 `append message`（用户意图先持久化、永不丢，即便随后判不可达），再据
   `--delivery-mode` + `classifyDelivery`（纯从 durable registry 判、绝不查 OS liveness）逐失败 target
   append `undeliverable`；`appendOnly`（默认）保 pre-spawn backlog、恒不产 undeliverable。
3. **worker 永不消费自身 message**；broadcast（无目标）仅 `broadcastAndExplicit` 策略收、永不 undeliverable。
4. **forum 校验**：legacy `type=thread/threads` 投影 chat（不升级 forum）；只有 `type=forum` 才允许 thread 操作；
   `thread key` 经 `normalizeThreadKey`（`^[A-Za-z0-9._-]+$`）；rename 走别名链、**防 silently merge**
   （目标 key 已存在且 ≠ 旧 → 拒）。
5. **guard 只读事实**：guard 只为 barrier 提供 worker 事实（有几个活 worker、预算是否耗尽）+ idle 清理谓词
   （两条永不杀铁律：mid-turn 永不杀、无 idleSince 永不杀）+ overflow 文本（**reject not guess**：只列活跃
   worker + 手动腾位提示，绝不自动选一个杀）。budget overflow 只 reject 新 spawn，主线 barrier 完全不经此路径。

## 留后续（真 spawn / 进程管理层，本批未做，明确标注）

以下需 fork supervisor 子进程 + OS 信号，不属"事件模型 + 状态重建"批次，`cmdChannel` 遇之 exit 2 明示：

- `spawn / kill / run / prune` —— worker 生命周期的真 fork/SIGTERM/SIGKILL + ephemeral 回收。
- `supervisor` 三循环编排（stdout pump / inbox watcher tail→stdin 桥接 / idle·warning·timeout timer /
   shutdown 信号漏斗）+ provider adapters（claude/codex/echo 编码）。
- guard 的 **OS liveness 四重判定**（pid 文件 / `os.kill` / `ps` cmdline 验证）+ 过期 idle 的
   `shutdown-reason` 侧车 + SIGTERM cleanup + `resolvePolicy`（manifest 四级链）。
- `watch.py` 增量 tail（`wait`/`messages --follow` 的阻塞式 live-tail；本批 `wait` 是快照扫描版）。

对照老仓：`skills/pipeline/scripts/channel/{supervisor,stdout_pump,inbox_watcher,idle,warning,shutdown,watch}.py`
与 `channel/adapters/`。
