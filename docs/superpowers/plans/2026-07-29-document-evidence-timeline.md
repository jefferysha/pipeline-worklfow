---
change: document-evidence-timeline-20260729
design-doc: docs/superpowers/specs/2026-07-29-document-evidence-timeline-design.md
---

# 文档证据时间线实施计划

## 子阶段 1：端到端曳光弹（此处建议 /clear）

1. 在 `packages/kernel/src/state/document-evidence.ts` 为当前有效 record 聚合 actual producer、recordedAt 与匹配 current visit 的 readAt；补 kernel 测试覆盖 current/stale/unread。验证：定向 Vitest。
2. 在 `packages/server/src/types.ts`、`snapshot.ts` 只读投影字段，并扩展 snapshot tests。验证：server snapshot tests。
3. 在 `packages/dashboard-app/src/types.ts`、`api/snapshotDecoder.ts` 镜像和严格解码可选时间线，在 `TaskDocumentsSection` 渲染中英文的可展开两事件线。验证：decoder 与组件测试。

## 子阶段 2：状态、兼容与验收（此处建议 /clear）

1. 覆盖旧 server、malformed timeline、recorded-only、unread/stale、empty 和 keyboard `summary` 路径。
2. 运行 `npm run typecheck:web`、定向 Vitest、`npm run build` 和 `npm test`。
3. 构建 web/server，启动真实 Tenon Dashboard，以受治理 Change 检查成功、未读/错误、空态和键盘展开；保存无敏感截图到 `docs/ux/shots/`。

## 兼容、回滚与范围

字段均为 snapshot 的可选加法；旧 Dashboard 忽略它们，旧 server 显示不可用而非失败。回滚可只移除新渲染与投影，无 ledger 迁移或数据清理。不得触碰 Trace、tap、transition 或 write endpoint。
