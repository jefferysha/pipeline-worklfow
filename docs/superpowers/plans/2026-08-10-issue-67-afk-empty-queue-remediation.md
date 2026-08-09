change: issue-67-afk-empty-queue-remediation
design-doc: docs/superpowers/specs/2026-08-10-issue-67-afk-empty-queue-remediation-design.md

# 实施计划：AFK empty-ready-queue hermetic fixture

## 范围与原型决策

本 Change 是已复现的单文件测试夹具缺口，不存在未决的数据模型、状态机或生产装配未知；因此不插入一次性 prototype。生产 `runAfkRound` 的 wiring-before-scan 顺序已经由 RED 诊断证明，正式 Build 只需保持该合同并隔离测试依赖。

## 子阶段 1：tracer bullet（端到端最小链路）

1. 在 `packages/cli/src/commands/afk.test.ts` 的 empty case 中复用当前 describe 已生成的 `pluginRoot`，通过 `doctor: { pluginRoot }` 和 `withEnterAfkSkillAuthority` 装配 `makeDeps`；保留 `phase=open, automation=queued`。
2. 运行 `HOME=/tmp npx vitest run packages/cli/src/commands/afk.test.ts -t "确实没有 ready candidate 的 empty" --reporter=verbose`。
3. 验收：exit `0`、输出 `就绪队列空`、无 Docker 调用；Docker-unavailable 与 negative fixtures 的 fail-closed 语义未改。

此处建议 /clear：完成首条 fixture → CLI → queue/output 端到端链路后，再进入回归与类型门。

## 子阶段 2：定向回归与静态检查

1. 运行 `HOME=/tmp npx vitest run packages/cli/src/commands/afk.test.ts --reporter=dot`，覆盖 18 个 AFK CLI 正/负向用例。
2. 运行 `npx tsc -b packages/kernel packages/channel packages/tap packages/automation packages/cli`，确认 fixture 类型与既有装配契约一致。
3. 逐行检查 diff，确认没有修改 `packages/cli/src/commands/afk.ts`、`afk-executor.ts` 或任何生成 dist。

此处建议 /clear：定向回归与类型检查完成后，交根代理做 Build-readiness 审查；本 worker 不进入 formal Review/Verify。

## 子阶段 3：交接与回滚边界

- 交接内容：fixture diff、RED→GREEN 命令/计数、OpenSpec delta、design/ADR/plan、Tenon phase/status。
- 回滚方式：回退 `afk.test.ts` 中 empty case 的依赖装配块；不触碰生产状态、依赖锁、Docker 或宿主插件。
- Build readiness 之外不运行全仓测试、浏览器、完整 CI、PR、push、merge 或 release。
