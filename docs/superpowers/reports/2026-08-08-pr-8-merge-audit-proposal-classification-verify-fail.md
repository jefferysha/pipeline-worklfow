# pr-8-merge-audit 文档与账本 Verify 失败报告

## 冻结对象

- Change：`pr-8-merge-audit`
- build SHA：`38e0d8da15ebd2d8e6d583d40fd22c9b8ffe7a2d`
- base：`733b30fa85c7e7c4361dc8d63e7aa2ee24f01ec8`
- PR：<https://github.com/jefferysha/tenon/pull/38>

## 三轨证据

- Reviewer：current main 对应 23/23 场景和 8 个既有 delta-only 场景全部保留，确定性 `502` 与许可边界均正确；发现下述 H1/M1。
- E2E：OpenSpec 1.6.0/1.8.0 strict 与真实隔离 archive 全部 exit 0；归档后 8 requirements/41 scenarios，Node 22.23.2 官方 checker 42/42 通过。
- Codex CLI：只读审查独立复现 ledger SHA mismatch，并定位相同 proposal capability 分类矛盾。
- 浏览器/UI：冻结差异不含产品源码或 UI 变更，不适用；这不是浏览器通过声明。

## 阻断发现

**H1 — 最新 verification-report ledger SHA 与文件字节不一致。**

账本登记 `docs/superpowers/reports/2026-08-08-pr-8-merge-audit-error-mapping-verify-fail.md`
为 `fcd356ff…ac6`，实际文件为 `94e5c9ee…fca6`。登记 SHA 精确等于当前文件再追加一个 LF，说明
record 后做过 EOF 双 LF到单 LF 的规范化。语义虽未变化，ledger-bound 文档仍已 stale。

**M1 — proposal 的 capability 分类与 current main 和最终 delta 冲突。**

proposal 把 `host-target-plan` 列为 `New Capabilities`，并声明 `Modified Capabilities` 为“无”；但
current main 已有该 capability，最终 delta 明确包含 5 条 `MODIFIED` requirement。应与 pr7 采用
一致口径：New 为无，Modified 明确列出五条完整修改与既有增强，不改变任何产品语义。

## 恢复路径

1. 以当前 Verify phase 的真实 `verification-before-completion` receipt 重新登记规范化后的旧失败报告。
2. 对确切 `verify-fail` 留下 review request 与 delegated acknowledge，回到 Build 后以 `requirements-changed` 返回 Spec。
3. 仅修正 proposal 分类，重新登记、全文读取并完成 `spec-complete` exact-event review。
4. 重新冻结并重跑完整 Reviewer、E2E、Codex、双版本 strict/archive、官方 checker 与 ledger 校验。
