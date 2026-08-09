# Issue #64 revision guard remediation · Build readiness

## Candidate identity

- base: `d58df7a0ecbb155d54d81e782150bf68567cb617`
- inherited #42 candidate: `f508fab726c62c10d4312fdd7d29f513d774dc66`
- branch: `codex/issue-64-revision-guard-remediation`
- Change: `issue-64-revision-guard-remediation`
- formal Review attempts consumed: `0/2`

旧 `issue-42-trustworthy-build-revision` Change、Review 2/2、attempt、receipt 与报告未修改。本报告只记录
#64 的 Build 紧反馈，不是 Verify review verdict 或 verification report。

## File to requirement map

| 文件面 | 对应能力/需求 | Build 证据 |
| --- | --- | --- |
| `packages/kernel/src/workflow/governed-lifecycle-policy.ts` | `workflow-definition`: 单 edge effective lifecycle、结构去重、rollback 只过滤 revision guard | policy RED/GREEN、actual/readiness matrix |
| `engine.ts`、`transition-application.ts`、`transition-readiness.ts`、`index.ts` | actual transition/readiness 共用规则；rollback assessor=0、success fail closed | kernel/CLI Stage 1/2、server snapshot |
| `packages/cli/src/commands/check.ts`、`review.ts` | semantic plain check、exact-event custom review preflight | semantic-only check/review fixtures；success=1、rollback=0 |
| CLI 两个 integration fixture | `workspace-verification-integrity`: untrusted request 与 post-receipt corruption 零 mutation | state/current/history/TransitionRecord/marker 比较 |
| `packages/server/src/snapshot.test.ts` | snapshot/SSE shared projection | success blocked、rollback ready 成对断言 |
| Automation 与 Dashboard 既有测试 | authoritative barrier、strict decoder/model 不回归 | Automation 181、Dashboard 81 targeted tests |
| `packages/cli/dist/tenon.mjs`、`packages/server/dist/dashboard.mjs` | 受控发布 bundle 与 source freshness | `npm run build`；前后 SHA-256 不变 |

没有发现 server、Automation 或 Dashboard 生产 adapter 旁路，因此没有复制 kernel 规则到 adapter，也没有
产生 Dashboard dist 变化。

## TDD and root review

唯一 `luna_worker` 的真实 RED 暂时移除 rollback revision 过滤后运行：

```text
npx vitest run packages/kernel/src/workflow/governed-lifecycle-policy.test.ts packages/kernel/src/workflow/transition-application.test.ts -t "governed custom rollback|arbitrary Verify rollback" --minWorkers=4 --maxWorkers=4
exit 1: readiness rollback=revision-stale blocked; actual rollback=revision-untrusted
```

恢复实现后同一命令为 2 files / 3 passed / 40 skipped。根代理逐文件检查后要求同一 worker 补强两项证据：

1. CLI semantic fixture 去除显式 revision guard，锁定 arbitrary Verify-like 自动注入；success assessor=1、rollback=0，非 revision step guard 保留。
2. actual rollback 单独使用 explicit edge `build-head-unchanged`；readiness 另覆盖 explicit step guard。

根代理随后捕获并要求修复 `selectedEdge!` 的 production non-null assertion；修复只做类型自然收窄，行为不变。

## Final targeted gates

- kernel + CLI Stage 2: `8 files / 162 passed`
- server + Automation: `3 files / 260 passed`
- Dashboard decoder/model: `2 files / 81 passed`
- `npm run check:architecture`: `10 passed`，runtime SCC `0`，853 production files scanned
- `npm run check:openspec`: `44 passed / 0 failed`
- `npm run check:comments`: pass
- `npm run build`: pass，Vite `2089 modules`，server/CLI bundle pass
- bundle deterministic hashes:
  - CLI: `b025103cfe35425d93ec726eae5513e97760143833dbbf53964d0a49cf5e713a`
  - server: `b1d9c46d47a144cd75d2999704a612614ec44b9f0e6d56ff902205fdae1603a1`
- `git diff --check`: pass

## Remaining Verify work

- 冻结 Build revision 后执行 #64 Review Attempt 1；只有 Medium/High 才返回同一 worker，Attempt 2 为硬上限。
- E2E 单独记账，不消耗 Review。
- 对稳定候选只运行一次完整本地门，并用 Verify 当前 host/phase 的 genuine
  `verification-before-completion` receipt 登记 verification report。
- PR exact-head CI、mergeability 与 review threads 在 Ship 后单独报告；不 merge、不发布。
