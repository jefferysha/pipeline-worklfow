---
change: task-plan-contract
design-doc: docs/superpowers/specs/2026-08-03-task-plan-contract-design.md
---

# TaskPlan v1 实施计划

## 默认决策

- 不插入一次性 prototype：codec/store/read-model 均有现成内核模式，未知点可由 TDD tracer bullet 直接暴露；该选择可逆。
- TaskPlan current 成为新 reader 的唯一 canonical source；旧 todo/guard ABI 本 PR 不替换。

## 子阶段 1：Tracer bullet — revision 到真实只读 API

1. 在 `packages/kernel/src/task-plan/` 增加最小 v1 types/codec/validator/read projection，并从 kernel 公共出口具名导出。
2. 在 `packages/kernel/src/state/task-plan-store.ts` 增加 immutable revision + current pointer 的 Change-lock 存储。
3. 在 `packages/server/src` 增加受信 root/change 的 GET read-model 路由，返回一个真实持久 revision。
4. 添加 kernel store/codec 与 server route 集成测试；运行 `npm exec vitest run <定向测试>` 和 `npx tsc -b packages/kernel packages/server`。

回滚：端点和 store 是新增可选面；移除 route/export 不改变 legacy reader。

**此处建议 /clear**

## 子阶段 2：完整不变量与 hostile-input 边界

1. 完成 opaque ID、catalog coverage、group ownership/tree、dependency DAG、资源规范化/冲突、outputs/validators 与有界稳定 issues。
2. 增加 future/unknown schema、budgets、Proxy/getter/toJSON、UTF-8/control-character、deep-freeze 回归。
3. 固定 exact resource v1 和 dependency-ordered writer 语义。

验证：kernel TaskPlan 全部单元测试和类型测试。

**此处建议 /clear**

## 子阶段 3：legacy adapter、投影恢复与 receipt 修复闭环

1. 实现 canonical->tasks.md 单向投影和 legacy-only read model，验证任何关系都不会从 prose 推断。
2. 覆盖 current commit/projection pending、孤儿 revision、drift 与官方重建边界。
3. 为 transcript discovery 增加 129+ transcript 的完整 reconcile 回归，并保留 malformed/错绑/替换对照。
4. 通过正式 bundle 命令重建 `packages/cli/dist/tenon.mjs`。

验证：`npm exec vitest run packages/cli/src/codexSkillReceipt.test.ts <task-plan tests> <server tests>`、`npm run bundle`。

**此处建议 /clear**

## 子阶段 4：兼容与 PR 验证

1. 确认 `CanonicalTask`、legacy todo、workflow guards 与既有 server snapshot 测试无回归。
2. 运行 `npx tsc -b packages/kernel packages/cli packages/server`、匹配包测试、build、comments/skills/hooks/adapters/bundle freshness。
3. 更新 OpenSpec task evidence，提交并推送独立 PR1。

回滚：保留新增 revision 文件但不再读取不会影响 legacy；禁止手工删除用户数据。
