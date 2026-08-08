# pr-8-merge-audit 场景漂移最终 Verify 报告

## 冻结对象与结论

- Change：`pr-8-merge-audit`
- base：`733b30fa85c7e7c4361dc8d63e7aa2ee24f01ec8`
- build SHA：`dc9753b189aa78560f2c857f55c71de27e6dc480`
- PR：<https://github.com/jefferysha/tenon/pull/38>
- 主线程结论：PASS；CRITICAL/HIGH/MEDIUM/LOW 均为 0。
- 变更范围：OpenSpec delta、proposal/plan/tasks、验证报告及官方 Tenon canonical evidence；产品源码、依赖、UI 与数据库变更均为 0。

## Requirement 与场景保留

- `host-target-plan` delta 包含 5 条完整 `MODIFIED` requirement，共 31 个场景。
- current main 全 capability 为 8 requirements / 33 scenarios；archive 后为 8 / 41，main 的 8 requirements 与 33 scenarios 均无 missing 或 rename。
- 5 条被修改 requirement 对应 current main 的 23/23 场景全部保留；另有恰好 8 个 frozen delta-only 加强场景，全部标题与正文可追溯，无范围外新增。
- `用户首次进入 Host Plan` 前后存在且正文一致。
- CLI/stdout/DTO 无效路径确定性返回 `502 HOST_TARGET_PLAN_INVALID`，没有含糊 unavailable 分支。
- 许可边界改为身份中性的“任何外部参考项目”，仍禁止复制受限内容并保留 AGPL-3.0/受限许可证约束，覆盖更广且未弱化。
- proposal 已同步为 New=无、Modified=`host-target-plan` 五条 requirement + current-main 全场景 + 八个既有加强场景，与 delta 一致。

## 三轨验证

### Reviewer

- 独立 clone：`/tmp/tenon-review-dc9753b1.stZKDJ/repo`；canonical overlay clone：`/tmp/tenon-review-dc9753b1-overlay.m1tmK4/repo`。
- 完整审查 base...build SHA 的 272 个变更文件、场景正文、许可/错误语义及待提交 Build→Verify canonical overlay。
- ledger、revision/transition/history、YAML/current、skill confirmation/invocation、secret 与范围检查均无 finding。
- shared fingerprint 前后均为 `ef3d66f984e77d08e90aef67813a7bebf65456bd9d010b6bbaf2a257cf09324c`。

### E2E / OpenSpec archive replay

- 独立根：`/tmp/pr78-openspec-dc9-e2e.GnHRXW`。
- `@fission-ai/openspec@latest` 当时解析为 `1.8.0`；仓库 pinned 版本为 `1.6.0`。
- 两版本执行 `validate pr-8-merge-audit --type change --strict --no-interactive` 均 exit 0。
- 两版本真实执行 `archive pr-8-merge-audit --yes --json`，均为 5 modified；随后 `validate --all --strict --no-interactive` 均为 41/41。
- 两版本产物字节一致：main 从 `b8e44455...` 到 `5b34da29...`；全部 33 个主场景保留，只加入 8 个可追溯加强场景。
- 两版本均会增加 EOF 空行；Ship 必须规范为单一末尾 LF，不把格式 churn 解释为产品变化。
- Node `v22.23.2`：checker test 1/1，官方 checker 42/42。

### Codex CLI

- `codex exec --sandbox read-only --ephemeral review --base 733b30fa...` 完成全量只读审查。
- 结论：两项 delta 恢复完整 requirement 语义，无可执行回归。
- Codex read-only sandbox 因无法创建临时目录而未能独立完成 repository-hygiene fixture；同一门禁由主线程与 Reviewer 在可写隔离环境分别通过，不将环境性 EPERM 伪报为内容通过。

## 仓库门禁与逐文件映射

- 主线程：latest/pinned strict 四项全部通过；Node 22 官方 OpenSpec 42/42。
- `npm run check:repository-hygiene` 10/10，`check:docs` 10/10，`check:comments`、`check:architecture`、`check:release-workflows` 24/24、`check:legacy-bridge`、`check:npx-package` 39/39 均通过。
- `git diff --check` 通过；ledger current records 与实际文件 SHA mismatch=0。
- `openspec/changes/pr-8-merge-audit/**` 与 pr8 plan/report 全部映射到 `openspec/specs/host-target-plan/spec.md`；其余变更均为该 Change 的 append-only canonical governance evidence。
- 浏览器/视觉轨：不适用。冻结差异没有产品或 UI 源码；这不是浏览器通过声明，历史产品浏览器证据不被本次文档修复改写。

## CI 与剩余风险

- 冻结 SHA `dc9753b1...` 已推送到 PR #38；GitHub Actions CI run `31236975585` 在该精确 SHA 上于 11m34s 完整成功。旧 head 的通过未被用作替代证据。
- 可执行归档会真实更新 `host-target-plan` main spec：保留现有 8/33 并加入 8 个已批准、可追溯场景。真实主 spec 只能由 Ship 的官方 apply 边界处理，Archive 必须使用 `--skip-specs`。
- 本报告登记后必须由 `verification-before-completion` producer 绑定当前字节，并再次证明 ledger mismatch=0。
