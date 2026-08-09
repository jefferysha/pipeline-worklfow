# Issue #64 revision guard remediation · Verify Attempt 1

## 结论

**FAIL。** Review Attempt 1 在精确候选
`a9a9b71f0657f4a0e65a4de3f5cc78e0ff0138e8` 上发现 5 个完整门测试失败。实现主链、窄 E2E 与
OpenSpec 隔离归档演练均通过，但按 fail-closed 验收标准，本轮不能进入 Ship；必须以 exact
`verify-fail` 回到 Build，只修复已定位的测试契约，然后使用最后一次 Review Attempt 2。

## 冻结身份与审计预算

- Branch：`codex/issue-64-revision-guard-remediation`
- Base：`d58df7a0ecbb155d54d81e782150bf68567cb617`
- #42 starting candidate：`f508fab726c62c10d4312fdd7d29f513d774dc66`
- Attempt 1 physical HEAD：`a9a9b71f0657f4a0e65a4de3f5cc78e0ff0138e8`
- Review attempt：`f8b6a160-2dc1-4e7f-b24c-488339b32e24`（1/2）
- Candidate fingerprint：`sha256:50a095e82203886758e292e8b1e5dbe7ec472f19b50929f34dc80262c34d1f32`
- Build revision token：canonical `build:v1:git` grammar，6 segments；token digest
  `sha256:cd12b2c1f5cdb92335c7425bcf9cc13b53a1d68eb8f41d940a9daf0535cc2818`。报告不记录 token 原文。
- Provenance：进入本次 Verify visit 的 immutable TransitionRecord
  `000006-1beaf376-7a60-4287-8cb3-043ea61572d7.json` 含唯一同值 `build_sha` effect。
- 原 #42 Review 2/2 只读保留；未重置、覆盖或启动第 3 次。

## 根代理审查

根代理直接审查了 `d58df7a0..a9a9b71f` 的物理 revision token/identity/provenance、kernel effective
lifecycle policy、actual transition/readiness、CLI check/review/transition、server API/snapshot/SSE、
Automation authoritative barrier、Dashboard decoder/model/action 以及 custom/stale/zero-mutation 负测。
未委派 review，也未用 worker 自审替代验收。

审查确认：

- custom success-like edge 合并并去重 step/edge/fixed/semantic revision guard；缺可信物理绑定时
  fail closed。
- effective rollback 只过滤结构等价的 `build-head-unchanged(field=build_sha)`，保留非 revision
  guard，assessor 不执行，并由同一次 transition 清理旧 token。
- plain custom check 只补 revision invariant，不借机执行任意非 revision edge guard；exact-event
  review 按所选 edge 求值。
- CLI/API/SSE/Automation/Dashboard 使用同一 typed blocker；关键失败 fixture 验证 canonical state、
  current、history、TransitionRecord 与 review receipt 零 mutation，且不泄露 token 或物理路径。

本轮未确认生产语义缺陷；失败项均为旧测试 fixture/clean-order 契约未满足，但它们仍是正式 gate
failure，不能忽略。

## E2E（不计 Review 次数）

隔离 clone 在同一 HEAD 上先构建 workspace TypeScript 依赖，再运行：

```bash
npx vitest run packages/cli/src/integration.test.ts packages/cli/src/transition-effects.integration.test.ts packages/cli/src/commands/review.integration.test.ts packages/server/src/server.test.ts packages/server/src/snapshot.test.ts --minWorkers=4 --maxWorkers=4
```

结果：exit 0；5 files passed；435 tests passed、9 skipped。覆盖真实 CLI transition/review、HTTP
transition、snapshot/SSE 与 custom workflow 文件系统链路。首次仅构建 kernel 的收集尝试因缺
`@tenon/automation` dist 未执行 4 个 suite；补齐 workspace TypeScript 前置后，上述最终命令全绿。

## OpenSpec 隔离归档演练

在第二个精确 HEAD 隔离 clone 运行：

```bash
npx openspec show issue-64-revision-guard-remediation --json --deltas-only
npx openspec validate issue-64-revision-guard-remediation --strict
npx openspec archive issue-64-revision-guard-remediation --yes --json
npx openspec validate --all --strict
```

结果：全部 exit 0；12 个 delta 成功归档应用；44 items passed、0 failed。主 worktree 的
`openspec/specs` 聚合摘要演练前后均为
`a376b1b5da452e40b55cadfac9aa4ab20bb8ea0d0f1d12345609f040244aa1c1`，没有被隔离演练修改。

## 唯一完整门：Attempt 1 失败证据

稳定候选只启动了计划中的一次完整门。第一项命令为：

```bash
npm test -- --minWorkers=4 --maxWorkers=4
```

结果：exit 1；385 files 中 382 passed、3 failed；6783 tests 中 6751 passed、5 failed、27 skipped。
失败清单：

1. `packages/kernel/src/flow/guard.test.ts`：PM verify 双 review 适用性 fixture 未提供可信 revision
   assessment，新的 fail-closed guard 先返回 `capability-unavailable`，使测试未到达其目标断言。
2. `packages/cli/src/commands/advance.test.ts`：3 个 Build→Verify fixture 未注入 `build-complete`
   所需 capture capability，分别阻断“进入 review 停点”“陈旧 marker 不阻断”和审计输出断言。
3. `packages/server/src/workflows.test.ts`：clean clone 在 `npm test` 先于全量 `npm run build` 时没有
   `packages/server/dist/workflows.js`，production dist smoke 收到 `ERR_MODULE_NOT_FOUND`。

修复边界：只允许给上述 fixture 建立可信 revision/capture 前置，并让 dist smoke 自身显式建立其
构建前置或等价的稳定 clean-order 契约；不得弱化 revision 负测、改变生产 fail-closed 行为或扩大
实现范围。

由于首项已失败，后续完整门命令本轮未执行；它们将在 bounded 修复后各运行一次，不重跑全仓
`npm test`。Docker/real-Codex 依赖项在 `npm test` 中按既有 honest-skip 契约跳过，不作为绿证据。

## Lane verdict

- standards：**FAIL** — 5 个完整门测试失败。
- spec：**PASS** — 根代理逐项对照三份 delta spec，未发现实现偏离；隔离 strict validate/archive 通过。
- e2e：**PASS** — 5 files / 435 passed / 9 skipped；关键跨入口与回滚链通过。
- aggregate：**FAIL** — standards failure 阻止 Verify pass。

## 下一步与剩余风险

登记本报告并关闭 Attempt 1 后，使用 exact `verify-fail` 回 Build，把 bounded fixture 修复重新交给同一
唯一 `luna_worker`。根代理只跑失败相关矩阵、受影响 build/dist check 与尚未执行的门；不重复全仓
测试。Attempt 2 是最后一次 Review；若仍失败，将保存证据并把任务标为 blocked，不启动 Attempt 3。
