# Issue #44 Verify 回退报告：冻结候选身份无效

## 结论

FAIL。当前 Verify 不得开始 code review 或最终验证，因为 `build-complete` 冻结的
`build_sha` 没有包含本 Change 的实现。按 Tenon 官方 `verify-fail` 路径回到 Build，先提交
完整 candidate，再重新执行 `build-complete`。

## 当前证据

- Change：`issue-44-skill-provenance`
- Worktree：`/Users/a1234/.codex/worktrees/0aff/pipeline-worklfow`
- Branch：`codex/issue-44-skill-provenance`
- `tenon get issue-44-skill-provenance build_sha`：
  `2283992375ae5fb74b2b1ed8e1234c11ef99a1c7`
- `git rev-parse HEAD`：`2283992375ae5fb74b2b1ed8e1234c11ef99a1c7`
- `git status --short | wc -l`：38 个 changed/untracked paths；因此上述 Git SHA 只代表
  编排起始基线，不代表当前实现。
- 尚未执行 `tenon review-attempt begin`；code-review attempt 计数保持 0/2。

## 已执行但不作为最终 Verify 的 Build 反馈

- focused provenance/setup/doctor/bundle：9 files / 248 tests passed。
- candidate clean/drift/legacy/rollback：4 passed，82 skipped。
- tampered exact-root：`internal-skill-provenance verify` exit 1，`setup skills --yes`
  exit 1，均报告 `content-hash-mismatch`，且 setup 未输出计划或执行安装。
- `npx tsc -b packages/kernel packages/automation packages/cli --pretty false`、
  `npm run check:comments`、`npm run check:architecture`、`npm run check:docs`、
  `npm run check:openspec`、`git diff --check` 与 quiet provenance verification 均通过。

这些结果用于确认 Build 实现可提交；它们不替代重新冻结后的唯一正式 review attempt 和一次
完整最终门。

## 恢复动作

1. 为本报告申请 exact event `verify-fail` review receipt，并使用本任务已授权的真实 delegated
   acknowledgement。
2. `tenon transition issue-44-skill-provenance verify-fail` 回到 Build；不得直接改写 canonical state。
3. 提交完整实现与治理文件，确认 candidate commit 含起始 commit。
4. 重新完成 Build 出口并由 `build-complete` 冻结该 candidate commit。
5. 仅在新 `build_sha` 等于 candidate commit 后调用 `review-attempt begin`。

## 未运行与风险

- 未开始正式 code review，也未运行完整最终门。
- 当前唯一阻塞是冻结候选身份无效；回 Build 并冻结真实 candidate commit 后可恢复。
