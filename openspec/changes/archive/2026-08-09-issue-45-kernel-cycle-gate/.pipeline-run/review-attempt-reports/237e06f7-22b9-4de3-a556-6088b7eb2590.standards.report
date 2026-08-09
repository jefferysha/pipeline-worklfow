# issue #45 Review Attempt 1

- Change：`issue-45-kernel-cycle-gate`
- Review attempt：`1/2`
- Attempt ID：`237e06f7-22b9-4de3-a556-6088b7eb2590`
- Build SHA：`9263762177671718cc4bd7fb40d522dc9aa9fe44`
- Frozen candidate：`workspace:sha256:0987cc063027c92d018046ecf6fa96955b0f6718f9d7ed8f22eb7ef39a51eaba`
- Verdict：`FAIL`

## Lanes

| Lane | 结果 | 证据 |
| --- | --- | --- |
| standards | FAIL | 根代理逐项检查 source、tests、barrel 与生成 bundle；发现 resolver 错误诊断包含绝对 checkout 路径。 |
| spec | FAIL | 违反 delta spec 对排序后仓库相对 POSIX 诊断和确定性结果的要求。 |
| e2e | PASS | 冻结候选的 12 个定向 unit/integration/cross-process 文件共 270 tests 通过；CLI document record、server task-plan/run/snapshot 和 bundle 32/32 通过。因候选已有阻断项，未消耗一次性完整最终门。 |

## 阻断 finding

### [P1] Resolver 失败诊断不是仓库相对且跨 checkout 不确定

`tools/kernel-runtime-import-graph.mjs:94-104` 的 `resolveProjectImport` 直接把绝对
`importerPath` 和绝对 candidate 写入 unresolved/ambiguous 错误。根代理在两个不同临时根目录运行同一
unresolved fixture，输出分别含 `review-a-*` 与 `review-b-*` 绝对路径，文本不相同。

这违反以下已冻结 contract：

- graph 的节点、边、SCC 成员和诊断使用排序后的仓库相对 POSIX 路径；
- project-relative import 的解析与失败输出必须确定；
- 多解或无法解析必须 fail-loud，但不能泄漏 checkout-specific 路径。

修复必须只围绕该 finding：让 resolver 接收或生成仓库相对 source label，并把 ambiguous candidates 也转换成
仓库相对 POSIX 路径；新增测试断言错误文本不含 fixture root，且在不同 root 下完全一致。不得扩大拆环或公共
contract 范围。修复后重新构建受控 CLI/server bundle（如源码构建判定需要），以新的冻结候选进入第 2 次、也是
最后一次 code review。

## 已检查且未发现阻断项

- document recording 仍先执行原有输入/文件/ledger 校验，再检查当前 phase Skill evidence 与 exact
  StepVisit confirmation；caller 不能通过公共 input 注入 anchor。
- TaskPlan validation 仍在 native begin 之前；begin 在 state lock 外，complete/fail 在 lock 释放后，CAS 失败记录
  failed 而非 completed。
- workflow contract 叶子只承载常量、类型和 type guards，公共 facade/re-export 保持。
- 根包仍导出 `recordDocument`、`publishTaskPlanRevision`、workflow validator 与
  `currentDocumentStepVisitId`；现有持久化格式未改变。
- 真实 architecture 扫描在该候选报告 runtime SCC=0，type-only SCC 独立计数为 1。

## 本轮明确未运行

完整 `npm test`、web、docs、release freshness 与 OpenSpec archive rehearsal 未在失败候选上运行；这些属于实现稳定后
仅运行一次的最终验证门，不计 code-review attempt。
