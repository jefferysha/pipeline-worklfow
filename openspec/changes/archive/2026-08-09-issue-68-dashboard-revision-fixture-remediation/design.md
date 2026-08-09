# 设计

## 初始假设

- Dashboard 必须消费 canonical revision readiness；缺失、格式错误、provenance mismatch、revision drift、capability unavailable 或其他不可信物理绑定一律 fail closed。
- 4 个失败文件来自正向 fixture 未提供可信 revision/readiness 前置，而不是当前生产模型绕过；此假设必须在 Explore 以精确 RED、调用链和同类 fixture 扫描验证。
- 修复优先进入测试 fixture/testkit；presentation/view-model 或 API client 生产变更必须由独立 RED 证明，不能为恢复旧断言而制造 ready/trusted 状态。
- 实现由且仅由一个 `luna_worker` 完成；根代理独占拆解、风险、代码审查、验收、正式 Review、PR 与 CI。

## 风险

- 直接把字段补成 `ready: true` 或裸 SHA 会伪造可信状态并掩盖服务端 assessor 物理绑定，必须复用生产形状/构造路径并保留负测。
- 只修 17 个断言可能遗漏同类 verdict、attention、progress fixture，导致 exact-head CI 再暴露；Build 前必须一次性扫描并形成矩阵。
- 过度修改 production presentation 可能改变 canonical readiness 优先级；只有 fixture 修复后的隔离 RED 才可授权最小投影改动。
- 新 Change 的正式 Review 上限固定为 2；E2E/CI 不计 Review，纯 fixture/docs 返工不重复全仓门。

## 待验证问题

- 17 个失败各自缺少哪一段 canonical revision/readiness 物理绑定，哪些可由统一可信 fixture builder 表达？
- 同类 verdict、attention、progress 正向 fixture 是否还有未失败但契约陈旧的变体？
- `TaskDetail` readiness 优先级是否完全符合产品契约，还是存在需要 production projection 修正的独立 RED？
- 哪些 presentation/view-model/API contract 测试足以证明可信正向、缺失/不可信负向和 rollback 恢复均未漂移？

## Explore 结论（2026-08-10）

### 调用链与共同原因

精确命令在当前冻结候选上稳定复现 6 files / 310 tests 中 4 files / 17 failures（App 2、inbox 8、ProjectsView 6、TaskDetail 1）；`progressModel.test.tsx` 52/52 与 `ProgressView.test.tsx` 66/66 通过。失败全部落在正向 Verify 卡的旧输入：`makeChange` 默认 `workflowExecution.readinessByTransition.verify['verify-pass']` 只有在 `verification_report` 非空时才 ready，而三轨字段本身不再足以证明可操作门。

生产链为 `snapshot.ts → snapshotWorkflowExecution() → kernel readinessByTransition()`；Verify success readiness 会经过 canonical build revision assessor/provenance。Dashboard 只消费服务端投影：`progressModel.changeProgressState` → `inbox.isAwaitingDecision/selectInbox` → App 徽标与 ProjectsView need 计数；TaskDetail 也用同一 state 选择 verdict。因此四个失败文件没有独立的 production projection RED。

现有 `progressModel.test.tsx` 的 `TRUSTED_VERIFY_EXECUTION` 已提供同形的 trusted server projection（Verify `verify-pass` 与 `verify-fail` 两条边均 `ready: true`、`blockers: []`），作为本 Change 正向 fixture 的唯一参考。它只在目标测试中显式注入，不修改 `testkit.makeChange` 的默认 fail-closed 行为，避免 ambient trusted state 掩盖负测。

### 最小实现矩阵

| 文件 | 正向 fixture | 预期保持 | 负向/不可信 fixture |
| --- | --- | --- | --- |
| `App.test.tsx` | SSE `needs-review`、currentRoot 的 `a-verify` | 徽标与显式 root 过滤 | 初始/不可达/普通 build 保持默认未就绪 |
| `inbox.test.tsx` | `VERIFY_OK` Verify 卡及排序/聚合样本 | gate/failed 入箱与排序 | rules 缺失、automation running/queued、不可达项目保持拒绝 |
| `ProjectsView.test.tsx` | `EVIDENCE_OK` Verify 卡及 repository/worktree 变体 | need 分区、计数、attention focus | failed/空/open/不可达等既有语义不变 |
| `TaskDetail.test.tsx` | 默认 Verify detail 与三轨 fail detail | 当前行 verdict/字段格 | rules 缺失、automation failed/running 诊断与 revision 负测不变 |

只修改上述四个测试文件中的正向 fixture；不改 `packages/dashboard-app` 生产代码、API contract、kernel/server readiness 或负向 revision missing/mismatch/drift/rollback/zero-mutation/privacy 测试。

### Explore 决策

- 采用显式 trusted `workflowExecution` fixture，不把 `makeChange` 全局默认改成 ready，也不填裸 Git SHA 或绕过 server assessor。
- 以真实 snapshot 的字段形状（逐 event readiness）表达可信前置；负测继续使用无 readiness 或 typed blocker 投影，确保 fail-closed 可见。
- Build 只跑四个目标文件、相邻 `progressModel`/`ProgressView`、相关 view-model/API contract 与必要 web type/build 门；不在本 Change 重跑全仓门。
