# Issue #42 trustworthy build revision · Verify Attempt 1

## 结论

Attempt `f577f05b-6a13-4af8-b7a3-09dd04e0052f` 审查唯一冻结候选
`fb61733b1eca3248aeda6f44203fcf7d605ccf1b`，canonical candidate fingerprint 为
`sha256:bfd314688088190f8d1098eee806052d3416033c355edaa7340b3baf4e198a99`。这是配置上限两次中的
第 1 次 Review；`standards`、`spec`、`e2e` 都消费同一 attempt，没有另起次数。

聚合结论为 **fail**：发现 3 个 Medium 和 1 个 Low。当前候选不得进入 Ship、PR 或归档；应按精确
`verify-fail` 回到 Build，只修复下列确认 finding，再冻结新的 candidate commit 进入最后一次 Review。

## Standards lane — fail

根代理逐项回读了冻结 diff、实现调用链、测试、受控 dist、Skills、双语文档与 OpenSpec delta，覆盖
kernel revision token/identity/provenance/transaction、default/custom lifecycle、CLI、HTTP/SSE snapshot、
AFK automation、Dashboard decoder/model/action 和 release/architecture freshness。确认以下问题：

### F1 · Medium · default `tenon check` 未显示 revision blocker

`packages/cli/src/commands/check.ts` 的 `phase-manifest` 分支只调用旧的同步 `flow.guardCheck`；revision
assessor 仅在 graph/custom 分支注入。于是 default Verify 的 `build_sha` 缺失、陈旧或不可信时，真实
transition、snapshot/SSE 会失败关闭，但 `tenon check` 仍可能输出 `[PASS]`。这破坏同一 blocker 的
CLI/API/SSE 一致性，也使 Verify Skill 的成功出口预检产生误导。

修复必须让 default Verify `check` 评估精确出口的 typed revision precondition，渲染稳定
`code/reason/remediation`，同时保留已有 documents、migration、warnings 和 legacy guard 行为。

### F2 · Medium · 继承式 custom rollback 被错误 revision guard 卡住

`semanticRevisionLifecyclePolicy` 只检查 YAML 原始 edge actions 来识别 rollback；而 governed custom
workflow 的固定 `mark-verification-failed` action 是之后才由 `governedLifecyclePolicy` 注入。因此一个
合法的 `verify -> build` 边若没有在 YAML 重复声明 action，会同时获得 rollback action 和
`build-head-unchanged` guard：不可信 revision 恰好阻断其唯一安全恢复路径。实际 transition 与
readiness/Dashboard 都受影响。

修复必须让 semantic policy 在实际 transition 和 readiness 两条路径都看到合并后的有效 fixed
actions；继承 rollback 不得注入 revision guard，并仍需清除旧 token。不得要求 workflow 作者重复
声明内建 action。

### F3 · Medium · Verify Skill 的 Git token 分支未建立可用 diff HEAD

`skills/tenon-verify/SKILL.md` 能识别 `build:v1:git:*`，但分支没有给后续命令使用的 `BUILD_SHA`
赋值；Codex/E2E/quality snippets 随后以该变量是否为空分流，导致 Git token 被误判为 in-place，或无法
限定冻结 diff。token 的 revision hash 也不可反解为 raw commit SHA。

在 F1 的可信 `tenon check` 预检通过后，Git 分支应显式读取当前 `git rev-parse HEAD` 作为本地只读
diff anchor，并说明其可信性来自 token assessor 对 HEAD + physical identity 的校验，而不是从 token
解码。同步清理后续 “raw Git baseline” 的陈旧表述。

### F4 · Low · 四个冻结交付文件有 EOF whitespace freshness 错误

`git diff --check origin/main..HEAD` exit 2，定位到：

- `docs/superpowers/plans/2026-08-10-issue-42-trustworthy-build-revision.md`
- `openspec/changes/issue-42-trustworthy-build-revision/specs/trustworthy-build-revision/spec.md`
- `openspec/changes/issue-42-trustworthy-build-revision/specs/workflow-definition/spec.md`
- `openspec/changes/issue-42-trustworthy-build-revision/specs/workspace-verification-integrity/spec.md`

四处都是新增的多余 EOF 空行，必须在下一候选冻结前消除。

### Security 子审查

未发现新增安全 finding：token 使用 domain-separated hash，外部 blocker 只投影 hash/code/reason/
remediation，不泄漏真实 repository/worktree path；transition 在锁内重新评估并保持 reject 零 mutation；
未新增依赖、凭证、网络写入或 producer/backfill/ledger 绕过。安全面本身为 pass，但不覆盖上述正确性问题。

## Spec lane — fail

| 交付面 | 对应 delta spec | Attempt 1 结论 |
| --- | --- | --- |
| token、physical identity、provenance、capture/guard/事务拒绝 | `trustworthy-build-revision`、`workspace-verification-integrity` | 主要负例通过；F2 使恢复出口违反 fail-closed 不锁死原则 |
| default/custom semantic lifecycle 与 rollback | `workflow-definition`、`trustworthy-build-revision` | F2 不符合 inherited lifecycle 要求 |
| CLI、HTTP/SSE、AFK、Dashboard blocker 一致性 | `trustworthy-build-revision`、`workspace-verification-integrity` | F1 使 default CLI `check` 与其他表面不一致 |
| Skills、双语文档、fixture、tracked dist | 三份 delta 与 `docs/CONTRACT.md` | F3/F4 未达到可执行指引与 freshness 要求 |

Issue #42 的 missing/null/ambiguous/stale/project/worktree、retry idempotency、server 409 zero mutation、
SSE/AFK/Dashboard privacy-safe blocker 等核心矩阵已有实现和测试；但 default CLI 可见性与 custom rollback
属于明确 Acceptance，不能以其他表面的通过替代。

## E2E lane — fail

按 repo-zero-output barrier，所有命令都在隔离副本
`/tmp/tenon-issue42-review1.dFzWrP/repo` 运行，真实工作区候选 HEAD 前后均为
`fb61733b1eca3248aeda6f44203fcf7d605ccf1b`，无 implementation/config/generated drift。

- 新增只读 review regression 后运行 CLI check + governed lifecycle：27 个既有测试通过，2 个新增测试
  精确失败。default `cmdCheck` 实际返回 `0` 而非 `2`；继承 rollback readiness 实际返回
  `verify-build-revision-untrusted/malformed` 而非 ready。
- Kernel issue acceptance：19/19 passed。
- 实际 HTTP malformed Build revision：1 passed，313 skipped；确认 exact 409 与 canonical/history zero
  mutation 的既有路径未回归。
- Build 冻结前同一候选的受控矩阵、五包 typecheck、正式 build、architecture、interaction、workflow/
  release freshness 已通过；这些证据不能抵消本轮新锁定的两个行为缺口。

因候选已确认不稳定，遵循一次性最终门约束，本 attempt 未运行全仓 `npm test`、`test:web`、browser QA
或 OpenSpec archive drill；这些只在修复后最后候选上运行一次。未执行项不是 skip-as-pass，本 lane 因两条
确定回归而 fail。

## 冻结与 Review 预算

- `origin/main=d58df7a0ecbb155d54d81e782150bf68567cb617` 是候选祖先。
- Build token 精确绑定候选 revision/physical identity；Review 前后真实交付文件零漂移。
- worker 已停写且无遗留 Vitest/TypeScript/build writer；真实工作区只有官方 Verify canonical/attempt 记录。
- 本轮完整聚合后才写入本报告；没有边审边修，也没有由 worker 自审或给 verdict。
- Review budget：`used=1/max=2`。下一次必须是新的稳定 candidate，也是最后一次允许的 Review。

## Verdict

`standards=fail`、`spec=fail`、`e2e=fail`；聚合结果 `fail`。下一步只围绕 F1–F4 返工，经定向门、正式
build/freshness 和干净 commit 冻结后，以精确 post-fix HEAD 重新进入 Verify。
