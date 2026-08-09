# Issue #64 revision guard remediation · Verify runtime barrier recovery

## 结论

本轮在任何正式 Review attempt 开始前停止。候选实现 HEAD `48db9a46e1308f9cc26eeac40de12a8a8d0de176`
已经通过 Build targeted gates，但系统安装的 `/Users/a1234/.local/bin/tenon` 在
`build-complete` effect 中写入 legacy 裸 Git SHA，而不是本分支实现要求的 project/worktree-bound
`build:v1:git` token。分支受控 CLI 对同一 canonical state 正确 fail closed：

```text
node packages/cli/dist/tenon.mjs check issue-64-revision-guard-remediation
exit 2
[FAIL] verify-build-revision-untrusted reason=malformed remediation=return-to-build-and-capture-current-revision
```

因此不能 backfill、手改 state、复用 #42 receipt 或把 legacy SHA 当作可信 token。本次走确切
`verify-fail` 恢复到 Build，随后只使用当前分支的受控 CLI执行新的 `build-complete`，让 token、
repository/worktree identity 与唯一 TransitionRecord effect 由同一次正式 transition 产生。

## Evidence

- canonical `.pipeline.yaml`：`phase=verify`，`build_sha=48db9a46e1308f9cc26eeac40de12a8a8d0de176`
- transition `2eb51a1a-db3c-4a44-8bb7-912a8ff74a7e`：effect 把 `build_sha` 从 `null` 写为同一裸 SHA
- branch CLI check：typed blocker `reason=malformed`，没有输出 token、repository 或 worktree 原路径
- formal Review attempt：`0/2`，本恢复不 begin attempt、不占用预算
- implementation/config/generated files：从 Build commit 后未修改

## Recovery boundary

1. 以当前 Verify phase 的 genuine `verification-before-completion` receipt 登记本报告。
2. 请求并 delegated acknowledge exact `verify-fail`，使用分支受控 CLI transition；该 action 清
   `build_sha`、设置 `verify_result=fail`、重置 `pre_verify_review_result=pending`。
3. 回到 Build 后复核无实现漂移、重新设置 readiness 并提交治理 recovery state。
4. 使用 `node packages/cli/dist/tenon.mjs transition ... build-complete` 生成 bound token；验证 token grammar、
   transition provenance、repository/worktree assessment 与 current HEAD 一致后才 begin Review Attempt 1。

## 未运行项

本轮没有运行 standards/spec/e2e Review lanes、完整门、OpenSpec archive drill、Ship、PR 或 CI；这些只对
恢复后的可信冻结候选执行。该停止不是候选代码 Review verdict，而是治理运行时版本不匹配的安全恢复。
