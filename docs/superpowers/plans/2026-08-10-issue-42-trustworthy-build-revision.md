---
change: issue-42-trustworthy-build-revision
design-doc: docs/superpowers/specs/2026-08-10-issue-42-trustworthy-build-revision-design.md
issue: 42
owner: root-coordinator
implementation-agent: luna_worker
---

# Issue #42 实施计划

## 目标与验收

实现 `verify-build-revision-untrusted` 单一不变量：任何 Verify success 在 revision 缺失、非法、陈旧、
错误 project/worktree 或无 canonical Build provenance 时零 mutation 拒绝；合法 revision 保持成功与幂等；
CLI/server/SSE/AFK/Dashboard 使用同一 code/remediation。Issue #42 Acceptance/Measurement 是最终出口。

## 所有权与执行纪律

- 唯一 `luna_worker` 负责代码、测试、产品文档和受控 dist；它不创建/替换 worktree，不 commit/push，
  不修改 Change canonical state/ledger/receipt，不自行 review 或给最终 PASS。
- 根代理独占设计变更、Tenon phase、正式 code review（总计最多 2 次）、finding 定级、完整最终门、
  commit/push/PR/CI 与最终验收。
- worker 并非独占代码库；必须保留现有及并行产生的治理文件，不回退他人改动。

## 阶段 1：Tracer bullet——default Build→Verify 可信链

**纵向切片：值对象 → capture action → guard → TransitionApplication → CLI contract。**

1. 在 `packages/kernel/src/workflow/` 增加 build revision token、closed reason、stable blocker constants、
   capture/assessment API 与 table tests；在 `packages/kernel/src/workspace/` 增加 repository/worktree
   physical identity probe 与 sibling/clone/invalid tests。
2. 扩展 `ActionInput` / `GuardInput` / `TransitionContext`，让 `freeze-build-sha` 只接受可信 capture，
   `build-head-unchanged` 对 missing/null/ambiguous/malformed/capability/evaluation 全部 failed。
3. assessment 复用 `readValidatedTransitionHead`，核对 current state digest、current step 和唯一
   `build_sha` effect；补普通 set、错误/缺失 head、旧裸 SHA 与合法幂等回归。
4. 让 default transition rejection 携带 typed blocker；CLI 输出非零、stable code/reason/remediation/hash；
   build capture failure 在 commit 前返回同一结构并证明 state/record/history 零变化。
5. 运行定向测试：kernel token/identity/action/guard/default policy/transition application 与 CLI transition。

验收：一条真实 default Build→Verify→Verify-pass 最小链可成功；逐类 negative table 均拒绝且无写入。

**此处建议 /clear**

## 阶段 2：Custom Workflow、server 与 snapshot/SSE

1. 把 lifecycle policy 从固定 step 名补成 compiled IR 字段语义：`build_sha` output→input 自动 capture；
   input step 的非 `mark-verification-failed` 出口自动 trust guard；去重且不污染 frozen fingerprint。
2. 扩展 custom `GuardResult` / transition rejection 保留 typed blocker；补 arbitrary step id、显式重复、
   rollback、无 `build_sha` workflow 与 frozen plan 回归。
3. server transition 409 body 直接投影 blocker；production wiring 注入同一 capture/assessment capability，
   不在 adapter 重写规则。
4. `TransitionReadinessBlocker` 增加 revision-untrusted 变体；snapshot 与 SSE 共用 exact DTO，竞态返回
   `state-stale`。补 server transition/snapshot tests 与 privacy-safe recursive assertions。
5. 运行 kernel custom/readiness 和 server transition/snapshot 定向测试与受影响 typecheck。

验收：default/custom 的 actual transition 与 readiness 逐类一致；HTTP 与 SSE 不含路径或 raw token。

**此处建议 /clear**

## 阶段 3：AFK admission 与 Dashboard 闭环

1. 在 automation verifier gate 先验证 authoritative `buildSha` canonical shape；缺失/非法或 verifier
   subject revision mismatch 返回 `verify-build-revision-untrusted`，其他 workflow/attempt/change mismatch
   保留既有分类。
2. scheduler settlement/RunRecord/`automation_cause` 使用 stable code，并在
   `automation_last_error` 使用共享安全 remediation；补 admission、lifecycle、scheduler negative/valid/
   retry-idempotent tests，禁止 L3 merge。
3. Dashboard strict decoder/types 接受 revision blocker exact keys/closed enums；Progress action 和 AFK
   diagnosis 显示同 code/reason/remediation，不提供 ledger/backfill 操作。
4. 补 Dashboard decoder/model/component/i18n tests，覆盖非法 DTO fail-closed、API/SSE exact data、AFK cause。
5. 运行 automation verifier/scheduler 和 Dashboard 定向 tests/typecheck。

验收：AFK 不可信 revision 只到 paused；Progress 与 AFK 两个界面使用同一修复语义。

**此处建议 /clear**

## 阶段 4：兼容、文档与受控生成物

1. 更新 `docs/CONTRACT.md`、中英文 default workflow 使用文档与 `docs/TEST-REALITY.md`：明确 token、
   legacy rebuild、stable blocker、AFK/Dashboard 事实；不宣称未跑 E2E。
2. 保持 state FIELD_ORDER、TransitionRecord schema 和 Workflow fingerprint 不变；补旧裸 SHA 安全拒绝、
   无 Verify custom workflow 不变、review candidate 映射与 N-1 safe rejection tests。
3. 运行受影响包的定向测试和 build，生成并同步 tracked CLI/server/Dashboard dist。
4. worker 回传文件清单、定向命令与原始退出证据，停止，不做 review/verdict。

验收：`git diff --check` 通过；受控 dist 与 source 对齐；无 state schema/new dependency/plugin 变化。

**此处建议 /clear**

## 阶段 5：根代理正式 Review 与最终门

1. 根代理逐文件检查 worker diff、调用方、public contract、并发/兼容/privacy 与 #42 matrix；实现稳定后
   开始 formal code review attempt 1。仅把 confirmed finding 交回同一 worker 修复。
2. 若 attempt 1 有 finding，修复后最多进行 attempt 2；两次仍有 Critical/High/Medium 则保留证据并
   blocked，不无限回 Build。
3. finding 清零后只运行一次完整最终门：全仓 tests、web tests/type/build、architecture、workflow
   freshness、build + release freshness/smoke；Docker/credential 环境 E2E 只能真实运行或诚实 skip。
4. 生成 verification report，完成 Tenon Verify/Ship/Archive；commit、push、创建 `Closes #42` PR，等待
   exact-head CI，不 merge、不 release。

## 回滚边界

- 实现未进入 Ship 前，可在同一分支移除 token/DTO 代码并回到旧行为；不得改写 canonical evidence。
- 发布后的兼容回滚是旧 runtime 安全拒绝新 token；不能通过把 token 截成裸 SHA 恢复。
- AFK blocker 只改变 untrusted admission 的 merged→paused；合法 boundary-verified path 不变。
