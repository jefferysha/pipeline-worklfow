---
change: issue-45-kernel-cycle-gate
design-doc: docs/superpowers/specs/2026-08-10-kernel-runtime-cycle-gate-design.md
---

# Kernel 运行时 import 拆环与门禁实施计划

## 默认决策与执行边界

- 不插入一次性 prototype：源码图、现有副作用顺序、公共 API 和验收均已由 Explore 证据确定；首阶段的 seeded
  graph test + 真实 checker 红灯就是最小、可删除的验证切片。
- 只由一个 `luna_worker` 在分配的当前 worktree 写实现；根代理不并发写同一 checkout，worker 不做 review verdict、
  Tenon transition、commit、push 或 PR。
- 不新增依赖，不修改 CI workflow（现有 workflow 已调用根 `check:architecture`），不改变公共 CLI/API/schema，不触碰
  Dashboard 或用户 PNG。
- Build 期间只运行定向测试；实现与 tracked bundle 稳定后，由根代理冻结候选并只运行一次完整最终门。

## 子阶段 1：Tracer bullet — fixture 到 canonical CI 命令

1. 先在 `tools/kernel-runtime-import-graph.node-test.mjs` 写 RED fixture：三节点 runtime cycle 必须被拒绝；纯
   type-only 双向边成功且独立报告；mixed named import、dynamic import、`.js -> .ts`、extensionless/index、
   unresolved/ambiguous relative import 与重复顺序得到确定结果。
2. 在 `tools/kernel-runtime-import-graph.mjs` 用 TypeScript AST 实现 production source 分类、specifier resolution、
   runtime/type-only edge 分类、稳定 SCC 与诊断。helper 不访问全局 cwd，不维护 baseline/exception。
3. 在 `tools/check-architecture.mjs` 复用现有 production 清单并调用 helper；更新 `package.json`，使
   `check:architecture` 先跑 graph node tests 再扫描真实树。此时真实树应准确报出 Explore 的两个 runtime SCC，作为
   后续拆环的受控 RED，而不是临时关闭 gate。

验证：

```bash
node --test tools/kernel-runtime-import-graph.node-test.mjs
node tools/check-architecture.mjs
```

预期：fixture test GREEN；真实 checker 在拆环前只因已知 runtime SCC RED，并给出稳定成员/边。

回滚：删除 helper/test 并还原根 script 即恢复旧检查，不产生产品状态或持久数据。

**此处建议 /clear**

## 子阶段 2：Document tracer — canonical confirmation 到纯 ledger store

1. 在相邻 document tests 中固定公共 `recordDocument` 的 exact current-StepVisit failure、成功 anchor、backfill 与
   CLI 同一 Change lock 行为；先确认现有测试能在职责移动时捕获回归。
2. 从 `state/document-producer-invocation.ts` 提取仅包含 `DocumentProducerInvocationAnchor` 与 parser 的无副作用叶子；
   `document-ledger.ts` 只依赖该叶子，并将“使用已验证 anchor 写入”的函数保持为 internal surface。
3. 在 `packages/kernel/src/documents/` 增加 recording application service，保留原 `recordDocument(input)` 公共契约，
   由它强制调用 `requiredDocumentProducerInvocation` 后进入纯 ledger core。更新 `documents/index.ts`、
   `state/index.ts` 和根 re-export 但不向 caller 暴露 anchor override。
4. 调整相邻 deep-import tests 到新职责所有者；不得改 ledger bytes、错误文本/类型、Skill repository artifact binding 或
   CLI command flow。

验证：

```bash
npm exec vitest run packages/kernel/src/state/document-ledger.test.ts packages/kernel/src/skill-invocation/document-confirmation.test.ts packages/kernel/src/skill-invocation/document-producer.test.ts packages/kernel/src/skill-invocation/repository.test.ts packages/cli/src/document-record.integration.test.ts
npx tsc -b packages/kernel packages/cli
```

回滚：应用 service 与纯 core 必须整体回退；不得留下接受 caller anchor 的兼容 overload。

**此处建议 /clear**

## 子阶段 3：TaskPlan tracer — lifecycle 到原子 state publish

1. 在 task-plan store/application tests 中固定 `begin-before-lock -> atomic publish -> complete-after-lock`，并覆盖
   validation/CAS/fault/current/projection 失败不写 complete、锁外 best-effort fail 和已有错误类别。
2. 从 `state/task-plan-store.ts` 抽出不 import Skill runtime 的 `publishTaskPlanStateRevision`（具体内部名称可按相邻风格
   调整），保留 validation、lineage/CAS、immutable/current/projection 与 current commit point 的原字节逻辑。
3. 在 `packages/kernel/src/task-plan/` 增加 publication application service，以旧公共名称
   `publishTaskPlanRevision` 严格编排 native begin/complete/fail；更新兼容 re-export，不改变 caller。
4. 运行既有跨进程 publication 测试，证明并发 writer、重试、orphan/immutable 与 lock 清理无漂移。

验证：

```bash
npm exec vitest run packages/kernel/src/state/task-plan-store.test.ts packages/kernel/src/state/task-plan-store.crossprocess.integration.test.ts packages/kernel/src/skill-invocation/repository.test.ts packages/server/src/serverTaskRunOperations.test.ts packages/server/src/serverTaskPlanRoutes.test.ts packages/server/src/snapshot.test.ts
npx tsc -b packages/kernel packages/server
```

回滚：application lifecycle 与 state core 必须作为一个单元回退；不得迁移或删除任何已提交 task-plan revision。

**此处建议 /clear**

## 子阶段 4：Workflow contract 叶子与真实零 SCC

1. 增加 `workflow/document-contract-model.ts`（或同职责明确名称），承载 validator 所需常量、types 和 type guards；
   `document-contract-validation.ts` 只 import 该叶子，`document-contract.ts` 保留公共 facade/re-export。
2. 保持 policy、producer candidates、transition enforcement 与 `validateOpenSpecContractWorkflow` 所有既有结果，运行
   workflow validation tests。
3. 运行真实 architecture checker；必须得到 kernel runtime SCC=0。检查诊断，确认没有通过 type-only 重写、dynamic
   import、exception 或忽略 unresolved 边伪造零值。

验证：

```bash
npm exec vitest run packages/kernel/src/workflow/validate.test.ts
npm run check:architecture
npx tsc -b packages/kernel
```

回滚：contract leaf 与 facade import 调整整体回退；公共 contract export 不得缺失。

**此处建议 /clear**

## 子阶段 5：受控生成物与 Build 交接

1. 复跑上述定向 suites 与 kernel/CLI/server type build；检查 `git diff --check`、文件硬上限和公共 export diff。
2. 用正式 `npm run build` 重建受控 `packages/cli/dist/tenon.mjs`、`packages/server/dist/dashboard.mjs` 及正常 build
   产物，只保留由本 Change 源码导致的 tracked diff。
3. 更新 `tasks.md` 的 Build checkbox 与真实命令结果；worker 停止并回传文件清单、定向测试、已知 skip/风险，不给出
   review verdict。
4. 根代理亲自逐文件 review，使用同一 issue 总计最多两次 code-review attempt；只有确认 finding 才回派 worker 修复。

Build 定向交接命令：

```bash
npm run check:architecture
npm exec vitest run packages/kernel/src/state/document-ledger.test.ts packages/kernel/src/skill-invocation/document-confirmation.test.ts packages/kernel/src/skill-invocation/document-producer.test.ts packages/kernel/src/skill-invocation/repository.test.ts packages/kernel/src/state/task-plan-store.test.ts packages/kernel/src/state/task-plan-store.crossprocess.integration.test.ts packages/kernel/src/workflow/validate.test.ts packages/cli/src/document-record.integration.test.ts
npx tsc -b packages/kernel packages/cli packages/server
git diff --check
```

回滚：仅整体回退本分支源码/生成物；无 schema migration、外部发布或用户状态清理。

**此处建议 /clear**

## Verify 最终门（仅根代理在候选稳定后运行一次）

冻结候选 SHA 后，根代理按 issue Acceptance 运行：定向测试、`npm run check:architecture`、受限 worker 数的完整
`npm test`、`npm run build`、`npm run check:comments`、`npm run check:default-workflow-freshness`、
`npm run check:openspec`、repository hygiene 与 `bash tools/test-bundle.sh`。若 canonical CI 另有精确命令，以 workflow
当前定义补齐但不虚构结果。浏览器/E2E 因无 UI/交互改动真实 skip。

Ship 后等待 PR exact-head CI；CI head 与本地冻结 SHA 不同、任一 job pending/fail/cancelled 或 runtime SCC 非零时均不得
报告完成。不得自行 merge 或发布。
