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

**此处建议 /clear**

## 子阶段 5：Verify finding 收敛

1. 在 `packages/kernel/src/state/task-plan-store.test.ts` 先增加 current/history revision ID 复用红测，再让 store 在 current commit 前拒绝同 lineage 重复 ID；合法新 ID 与无关 orphan 保持可发布。
2. 在 `packages/kernel/src/task-plan/task-plan.test.ts` 增加 projection 输入 descriptor/frozen 状态红测，完整 clone DTO-owned 结构，确保 `toTaskPlanReadModelV1` 不改变调用方 revision。
3. 为 coverage、resource、dependency 与 issue 排序增加混合 ASCII/Unicode 红测，统一改用 locale-independent ordinal comparator。
4. 把 129+ discovery 与 inline safe-positive `max_output_tokens`、pragma/dynamic/zero/negative/截断拒绝场景登记到 `codex-skill-receipt-current-turn` delta，并通过正式 CLI bundle 在当前真实 host transcript 上验证旧安装拒绝、新 bundle 成功。
5. 运行聚焦测试，再运行 `npm test -- --minWorkers=4 --maxWorkers=4`、TypeScript、architecture、comments、OpenSpec strict 与 CLI/server bundle freshness；完成全量 pre-Verify review 后生成新冻结 SHA。

回滚：identity/purity/order 修复均为拒绝歧义或移除副作用，不迁移已提交数据；若发现历史 lineage 已复用 ID则失败关闭并报告 corrupt，不自动重写 immutable history。

**此处建议 /clear**

## 子阶段 6：revision 预算原子边界收敛

1. 在 `packages/kernel/src/state/task-plan-store.test.ts` 先增加 exact 256-entry lineage、target 导致累计字节越界、逐字节 current 重试遇到损坏历史的红测；每个拒绝场景同时断言 target immutable 不存在且 current 原始字节不变。
2. 重构 `assertCommittedLineage` 返回一次有界枚举的 entry/read/byte totals 与 target 状态；完整校验既有 committed lineage 后，若 target 尚不存在，再把它的一个 entry、一次读取和实际 raw bytes 计入预算。
3. 已有历史损坏或超限返回 `TaskPlanStateCorruptError`；仅 proposed target 会越界返回 `TaskPlanRevisionConflictError`；逐字节相同 current 重试在 lineage 校验通过后才允许重建 projection，并允许 current 自身 ID。
4. 运行 store/TaskPlan/receipt/server 聚焦测试、`npm test -- --minWorkers=4 --maxWorkers=4`、kernel/server TypeScript、architecture、OpenSpec strict、bundle freshness；重新生成 server bundle 并完成独立 pre-Verify review。

回滚：删除本子阶段实现会重新暴露“本次成功、下次永久失败”的历史预算状态，因此只允许整体回退到本 Change 前，不得保留未预计 target 的半修复 store。

**此处建议 /clear**

## 子阶段 7：object/JSON hostile-input 边界收敛

1. 在 `packages/kernel/src/task-plan/task-plan.test.ts` 先增加 RED：131k+ 普通键与 Proxy `ownKeys` trap 的 typed object 不得触发 `Reflect.ownKeys`、`Object.keys` 或 `for...in` 对根/嵌套 record；额外 string/symbol/non-enumerable/accessor 均不读取、不复制。相同未知字段放入 byte-bounded JSON 时仍返回精确 `unknown_field`。
2. 在 `packages/kernel/src/task-plan/codec.ts` 为 JSON parse 结果与 direct object 建立显式 source mode。JSON mode 在原始 byte gate 后保留严格 closed enumeration；object mode 的每种 record 只读取固定 allowed descriptors，array 只读取有上限的 `length` 与 dense indices，schema-owned accessor 失败关闭。
3. 更新 validator/read-model/store 回归：typed extras 不进入 DTO/持久 JSON，已知字段 getter 零执行，Proxy descriptor trap 数受 schema 上限约束；canonical store 的 fatal UTF-8、raw identity、历史预算和零写入语义不漂移。
4. 运行 TaskPlan/store/server/receipt 聚焦套件、`npm test -- --minWorkers=4 --maxWorkers=4`、Dashboard、build、architecture、comments、OpenSpec strict、docs/hygiene 与正式 bundle；完成独立 pre-Verify 全量审查后再冻结新 SHA。

回滚：object mode 只改变额外 JavaScript metadata 的处理，不改变 canonical JSON 字节、TaskPlan DTO 或持久格式；若调用方需要 closed diagnostics，改走现有 JSON 输入即可。
