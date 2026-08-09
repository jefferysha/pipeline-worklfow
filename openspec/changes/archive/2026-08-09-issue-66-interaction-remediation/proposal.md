# 提案

## Why

GitHub issue #46 的 interaction observability 候选已经完成两次正式 Review，但最终候选仍在 replay 终态顺序、authorization sidecar 安全读取和 canonical legacy compatibility 三处失败。Review 预算 2/2 已耗尽，必须由独立 remediation Change 修复这些阻断，同时原样保留 #46 的冻结候选、attempt 与失败报告，才能让 #41 的基础交互指标能力形成可合并交付。

## What Changes

- 让 replay 对 terminal 后除明确幂等 valid resume 外的非法核心事件稳定产生 `malformed-order`，且绝不误计 completion。
- 将 canonical review authorization sidecar 的读取收紧为有界、仅普通文件、proof/read 物理身份稳定，并对替换、symlink、超限、畸形和歧义 fail closed。
- 在实现前显式修订 canonical compatibility 契约：legacy receipt 缺少可信 binding 时拒绝消费，并通过新的 exact review request 原子重建 sidecar；不做静默迁移或放宽授权。
- 同步受影响测试、OpenSpec/契约文档和受控生成 dist，产出同时关闭 #66/#46 的可合并 PR。
- 非目标：不重置或启动 #46 的第三次 Review，不改 Dashboard/server API，不 merge、不发布版本、不修改本机插件。

## Capabilities

### New Capabilities

- `interaction-observability`：接续未交付的 #46 能力，并补齐 terminal replay 的严格诊断契约。

### Modified Capabilities

- `interaction-and-skill-provenance`：明确 canonical review receipt 必须绑定当前 decision state，legacy receipt 的 fail-closed 与可恢复路径成为兼容契约。

## Impact

主要影响 `packages/kernel/src/interaction/replay.ts`、`packages/kernel/src/state/review-gate-binding.ts`、CLI review/transition 集成测试、对应 OpenSpec/contract/test-reality 文档和由 `npm run bundle` 生成的受控 dist。必须保留 append-only event identity、canonical binding、stale rejection、resume metrics 与现有 scorecard 数值；不新增依赖，不改变 interaction projection 作为派生观测面的地位。安全回滚是恢复到本 Change 起点 `5f93fd84f6f984c16d55df2eac65caa4f5159958`，不会改写 #46 的历史或冻结 `build_sha`。

## Requirements Reconciliation

本 Change 已在没有任何应用代码写入、也尚未派发实现 worker 时，通过官方 `requirements-changed` 从 Build 回到 Spec。该事件明确取代 #46 中“canonical legacy 行为完全兼容”的旧假设：缺少可信 decision-state binding 的 legacy pending/approved receipt 不能继续授权；兼容恢复路径是对相同 exact phase/event 发起新的 `review request`，生成新的有序 `requestedAt`、pending receipt 与 canonical sidecar 后重新 acknowledge。不得自动 backfill、静默迁移、从当前 state 推导历史 approval，或把 interaction projection 当作授权 fallback。
