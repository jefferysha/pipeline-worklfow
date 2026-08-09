---
change: issue-64-revision-guard-remediation
design-doc: docs/superpowers/specs/2026-08-10-issue-64-revision-guard-remediation-design.md
base: d58df7a0ecbb155d54d81e782150bf68567cb617
starting-candidate: f508fab726c62c10d4312fdd7d29f513d774dc66
branch: codex/issue-64-revision-guard-remediation
---

# Issue #64 revision guard remediation · 实施计划

## 目标与不可变边界

在不修改旧 `issue-42-trustworthy-build-revision` Change 审计的前提下，修复 custom Workflow 的
edge-aware revision lifecycle：所有 success-like Verify 出口和其 check/review/API/SSE/Automation/
Dashboard 入口都 fail closed；任何 effective rollback edge 不要求新的 forward proof，同时保留所有
非 revision guard 并清理旧 token。stable blocker、隐私 hash、frozen plan fingerprint、无 `build_sha`
Workflow、canonical schema 与依赖树保持兼容。

实现写入由且仅由一个 `luna_worker` 完成。根代理独占任务拆解、风险分级、diff review、Build/Verify
验收、Review attempt、Tenon transition、commit/push/PR/CI。worker 不创建 worktree/branch/commit，
不写 Tenon canonical state，不修改旧 #42 Change，不自行 review 或扩大范围。

## 文件所有权

worker 只可按需要修改下列实现与回归面；新增文件必须位于同一目录并直接服务本修复：

- kernel：`packages/kernel/src/workflow/governed-lifecycle-policy.ts`、`engine.ts`、
  `transition-readiness.ts`、`transition-application.ts`、`stepGuard.ts`、`packages/kernel/src/index.ts`，
  以及同目录 `*.test.ts` / `build-revision.acceptance.test.ts`。
- CLI：`packages/cli/src/commands/check.ts`、`review.ts`、相应 `*.test.ts`，以及
  `packages/cli/src/integration.test.ts`、`transition-effects.integration.test.ts`。
- 投影回归：`packages/server/src/snapshot.test.ts`、
  `packages/automation/src/verifier/verifier.test.ts` 或 `scheduler/scheduler.test.ts`、
  `packages/dashboard-app/src/api/boundaryDecoders.test.tsx`、
  `packages/dashboard-app/src/model/progressModel.test.tsx`。仅当测试证明旁路时才改对应生产 adapter。
- 生成物：仅受上述源变更影响且由仓库脚本生成的 `packages/cli/dist/tenon.mjs`、
  `packages/server/dist/dashboard.mjs`、`packages/dashboard-app/dist/**`。

根代理保留 OpenSpec、ADR、Superpowers plan/report、Tenon ledger、Git/GitHub 与 CI 文件所有权。

## Build 子阶段 1 — Tracer bullet：一条 custom success/rollback 链路

**上下文目标：** 在一个窗口内纵向贯通 compiled IR → kernel actual/readiness → CLI check/review，先用
arbitrary step id 与显式 step revision guard 建立 RED，再使最小端到端链路 GREEN。

1. 在 `governed-lifecycle-policy.test.ts` / `build-revision.acceptance.test.ts` 增加 RED：同一 Verify-like
   step 的 success edge 必须保留并去重 `build-head-unchanged`，effective actions 含
   `mark-verification-failed` 的 edge 必须只过滤该 revision guard；其他 guard 原序保留。
2. 在 `governed-lifecycle-policy.ts` 建立按单条 `StepTransitionIR` 计算的 effective lifecycle seam，合并
   declared step/edge、document-governed fixed、semantic guard/action。rollback 判定只看合并后的
   `mark-verification-failed`；不得按 step/event 名硬编码。
3. 让 `engine.ts` / `transition-application.ts` 与 `transition-readiness.ts` 消费同一结果，避免在 helper
   之后重新并回已过滤的 revision guard。actual/readiness 的 success blocker 必须深等价，rollback
   assessor 调用 0 次并执行一次清 token action。
4. 扩展 `stepGuard.ts` 的 compiled-guard 入口，使 CLI 可传入 kernel 已推导且去重的 guard 集；不得在
   adapter 重写 blocker、hash 或 revision assessor 逻辑。
5. 让 `check.ts` 支持内部可选 exact event：plain check 保留旧 step guard 语义，只合并所有
   non-rollback exits 的 revision invariant；event-aware check 只使用该 edge 的 effective revision
   判定。让 `review.ts` 的 custom step-graph request 传入已经解析的 event；default phase-manifest
   `verify-fail` 专用路径保持不变。
6. 定向验证：

   ```bash
   npx vitest run packages/kernel/src/workflow/governed-lifecycle-policy.test.ts packages/kernel/src/workflow/build-revision.acceptance.test.ts packages/kernel/src/workflow/transition-application.test.ts packages/cli/src/commands/check.test.ts packages/cli/src/commands/review.integration.test.ts --minWorkers=4 --maxWorkers=4
   ```

**验收：** arbitrary id、explicit step guard 的 success fail closed；rollback ready/成功并清 token；
非 revision guard 不被过滤；assessor success 至多一次、rollback 零次；评估路径零 mutation。

**此处建议 /clear。**

## Build 子阶段 2 — Guard 来源矩阵与两个 stale fixture

**上下文目标：** 把 tracer bullet 扩展到 explicit edge、fixed inherited、semantic-only 与 frozen plan，
并修复旧 Attempt 2 暴露的两个 integration fixture，不能通过弱化负测获得 GREEN。

1. 在 kernel tests 覆盖四类 revision guard 来源：step、edge、fixed、semantic。每类均成对断言 success
   fail-closed/valid-once 与 rollback ready/assessor-zero；覆盖 built-in/free/custom track overlay、
   无 `build_sha` workflow、capability unavailable、evaluation error、retry 幂等及 frozen fingerprint 不写回。
2. `packages/cli/src/integration.test.ts`：把无 provenance token 的 `review request --event verify-pass`
   固定为 exit 2，断言 `provenance-missing`/`provenance-mismatch` typed blocker、无 token/path 泄漏，并
   对比 request 前后 state/current/history/TransitionRecord/pending review receipt 不变；不得只改期望码。
3. `packages/cli/src/transition-effects.integration.test.ts`：先在可信 token 状态获得合法 verify-pass
   receipt，再把 `build_sha` 置为 `null`，随后 transition 必须重新求值、exit 2 且 canonical state 不推进。
4. 定向验证：

   ```bash
   npx vitest run packages/kernel/src/workflow/engine.test.ts packages/kernel/src/workflow/governed-lifecycle-policy.test.ts packages/kernel/src/workflow/build-revision.acceptance.test.ts packages/kernel/src/workflow/transition-application.test.ts packages/cli/src/commands/check.test.ts packages/cli/src/commands/review.integration.test.ts packages/cli/src/integration.test.ts packages/cli/src/transition-effects.integration.test.ts --minWorkers=4 --maxWorkers=4
   ```

**验收：** 两个旧失败转为有意义的 fail-closed 回归，所有负例仍验证 blocker 与零 mutation；无
provenance/backfill/旧 receipt 旁路。

**此处建议 /clear。**

## Build 子阶段 3 — 跨入口投影与受控 bundle

**上下文目标：** 证明共享 kernel 结果穿过 server snapshot/SSE、Automation 与 Dashboard；只在测试
发现真实旁路时修改 adapter 生产代码。

1. server snapshot fixture 用同一 custom plan/state 成对断言 success event `ready=false` 且带 stable
   blocker、rollback event `ready=true`；SSE 使用同一 snapshot payload，不重算规则。
2. Dashboard decoder/model fixture 接受同一 blocker，并分别把 success action 设为 blocked、rollback
   recovery action 设为可用；不得增加 token backfill UI。
3. Automation 运行 authoritative barrier 缺失/非法、verifier subject drift 与 valid admission 既有负例；
   如新增 fixture，只复用 stable code/remediation，不改变 scheduler 状态机。
4. 构建受控产物并检查只生成预期 diff：

   ```bash
   npm run build
   git status --short
   ```

5. worker 运行跨入口定向矩阵后停止写入，向根代理交接精确文件清单、命令/计数、失败或未跑项；不得
   给出 review verdict。

   ```bash
   npx vitest run packages/server/src/snapshot.test.ts packages/automation/src/verifier/verifier.test.ts packages/automation/src/scheduler/scheduler.test.ts --minWorkers=4 --maxWorkers=4
   npm run test:web -- --minWorkers=4 --maxWorkers=4 packages/dashboard-app/src/api/boundaryDecoders.test.tsx packages/dashboard-app/src/model/progressModel.test.tsx
   ```

**验收：** 所有表面共享 code/reason/remediation/hash；不可信 forward path 全部 blocked，rollback 可恢复；
adapter 无规则复制；受控 bundle 与源同步。

**此处建议 /clear。**

## 根代理 Build readiness 与 Review

1. 根代理逐文件检查 worker diff、类型边界、call count、锁内重评估、fixture 零 mutation、生成物来源及
   `git diff --check`；缺口只能返给同一个 worker 修复，不能由根代理改实现。
2. 根代理复跑三组定向矩阵及 `npm run check:architecture`、`npm run check:openspec`、
   `npm run check:comments`，确认 stable candidate 后冻结 HEAD。
3. #64 正式 Review Attempt 1 对精确 HEAD 做 standards/spec/E2E/aggregate 判级；E2E 不计 Review。
   Medium/High 或 gate failure 回到同一 worker bounded remediation。Attempt 2 为最后机会；2/2 仍失败
   则登记报告并将 goal 标为 blocked，不启动第三次。

## 稳定候选唯一完整门

只对 Review 已稳定的同一候选运行一次本地完整门；纯 fixture/docs 修订不重复全仓：

```bash
npm test -- --minWorkers=4 --maxWorkers=4
npm run test:web -- --minWorkers=4 --maxWorkers=4
npm run check:release-workflows
npm run check:openspec
npm run check:comments
npm run check:architecture
npm run check:identity
npm run check:repository-hygiene
npm run check:npx-package
npm run check:legacy-bridge
npm run check:default-workflow-freshness
npm run build
npm run test:migration-cas
npm run oracle
npm run test:clean-install
npm run check:docs
npm run check:document-templates
npm run docs:sync
npm run docs:check
npm run docs:build
npm run docs:smoke
```

verification report 必须在 Verify 当前 host/phase 真实调用 `verification-before-completion` 后，以完整
`cat` 输出和 `text(result)` 的 current-turn receipt 登记；禁止 backfill、producer spoof 或复用 #42。

## Ship、rollback 与停止条件

- Ship 只 apply/归档 #64 的 delta spec；旧 #42 Change 与 Review 2/2 审计保持不变。
- 提交、推送并创建非 draft PR；body 同时写 `Closes #64` 与 `Closes #42`，等待 exact-head CI。
- 不 merge、不发布、不改本机插件。若需要回退，本分支回退 #64 commit 即可；不重写 base/candidate。
- secrets、不可逆生产影响或无法由 issue 消解的公共契约歧义才暂停；否则持续执行。
