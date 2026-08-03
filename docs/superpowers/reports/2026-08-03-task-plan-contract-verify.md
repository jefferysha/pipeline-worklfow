# task-plan-contract Verify 报告（第 1 轮）

## 结论

FAIL。冻结基线 `3e8e9911a52a2c701a6519884b42a83fb15aeccb` 发现 1 个确认的 MEDIUM hostile-input 缺陷，必须回到 Build 修复；未接受偏差。

## 冻结与三轨

- Reviewer 轨：PASS。完整复审 `origin/main...3e8e9911` 的 63 个文件，无 CRITICAL/HIGH/MEDIUM；记录 2 个 LOW：非法 UTF-8 replacement decode、缺少 dirfd/openat writer 时的极窄 parent swap-back 竞态。
- E2E 轨：PASS。隔离副本真实 HTTP 1/1、核心回归 493 passed/9 existing skipped、129+ transcript 精确 reconcile 1 passed；canonical/legacy/pending/drift/corrupt/root/change trust 均通过。目标工作区实现 fingerprint 前后保持 `c34e365ac6326a260247bdb34fbb772503bf9641f330dbca5581ab6ad04ab20f`。
- Codex CLI 轨：运行 `git diff origin/main...3e8e9911 | codex exec --sandbox read-only ...`。进程受本机 malformed logs DB/models cache 警告影响，内部双轴审查 9 分钟未终止，主线中止为 exit 130；在中止前已产出下述可复现 finding。

## 确认 finding

### MEDIUM — 数组 accessor 可在 closed codec 中执行

`packages/kernel/src/task-plan/codec.ts` 的普通对象分支检查 property descriptor 并拒绝 accessor，但数组分支只检查 key 数量后执行 `[...value]`。带 getter 的数组元素会在 spread 时执行，且当前 decoder 可返回 `ok:true`。

复现结果：

```text
{"hits":1,"ok":true,"errors":[]}
```

修复要求：数组必须像 record 一样逐项读取 own enumerable data descriptor，拒绝 accessor、稀疏数组、额外属性和非标准 own key；增加 getter 未执行且 decoder fail-closed 的回归。

## OpenSpec 硬门演练

- 真实工作区：`openspec show task-plan-contract --json --deltas-only` 与 `openspec validate task-plan-contract --strict` 通过。
- 隔离副本：`openspec archive task-plan-contract --yes --json` 成功，8 个 requirements applied；随后 `openspec validate --all --strict` 为 37 passed / 0 failed。
- 真实 `openspec/specs/**/spec.md` 前后 digest 一致，HEAD 始终为冻结 SHA。

## Spec 覆盖回读

以下冻结文件组均已逐文件枚举并对照 `openspec/changes/task-plan-contract/specs/task-plan-contract/spec.md`：

| 文件组 | 对应要求 | 结果 |
| --- | --- | --- |
| `packages/kernel/src/task-plan/*.ts` | v1 identity、coverage、dependency、resource、output、validator、legacy/read DTO | 已回读；数组 accessor finding 阻断 |
| `packages/kernel/src/state/task-plan-store*.ts`、state exports | immutable/current、CAS、projection pending/drift | 符合 |
| `packages/server/src/serverTaskPlanRoutes*.ts`、`serverGetRoutes.ts` | 稳定只读 API 与 root/change trust | 符合 |
| `packages/cli/src/codexTranscriptDiscovery.ts`、receipt tests、正式 bundle | 129+ transcript receipt discovery | 符合 |
| proposal/design/spec/tasks、ADR、research、plan 与 canonical governance records | Change 证据与冻结契约 | 符合 |

## 已运行证据

- `npm test -- --minWorkers=4 --maxWorkers=4`: 334 files passed；5954 passed，26 honest skipped。
- `npx tsc -b packages/kernel packages/cli packages/server`: exit 0。
- `npm run bundle`: exit 0。
- 定向 TaskPlan/API/receipt：191 passed。
- E2E 隔离日志：`/tmp/tenon-pr1-e2e-http.log`，sha256 `84d04f6c30b68f6db77df1720c35d45462577e58347afefaee2c7200381ebd67`。

## 下一步

按 `verify-fail` 回 Build，以 TDD 修复数组 descriptor 边界，重新生成正式 bundle、提交新 SHA，并重新执行全部三轨而非只复查本 finding。
