# pr-7-merge-audit 文档账本 Verify 失败报告

## 冻结对象

- Change：`pr-7-merge-audit`
- build SHA：`38e0d8da15ebd2d8e6d583d40fd22c9b8ffe7a2d`
- base：`733b30fa85c7e7c4361dc8d63e7aa2ee24f01ec8`
- PR：<https://github.com/jefferysha/tenon/pull/38>

## 三轨证据

- Reviewer：pr7 的 6 条 `MODIFIED` requirement 与 current main 的 narrative、23/23 场景标题及正文逐字一致；发现下述 H1。
- E2E：OpenSpec 1.6.0/1.8.0 strict 与真实隔离 archive 全部 exit 0；Node 22.23.2 官方 checker 42/42 通过。
- Codex CLI：只读审查独立复现同一 ledger SHA mismatch；产品语义审查未发现其他 C/H/M。
- 浏览器/UI：冻结差异不含产品源码或 UI 变更，不适用；这不是浏览器通过声明。

## 阻断发现

**H1 — 最新 verification-report ledger SHA 与文件字节不一致。**

账本登记 `docs/superpowers/reports/2026-08-08-pr-7-merge-audit-proposal-alignment-verify-fail.md`
为 `154f6063…32b3`，实际文件为 `e8b2907a…32fa`。登记 SHA 精确等于当前文件再追加一个 LF，说明
record 后做过 EOF 双 LF 到单 LF 的规范化。语义虽未变化，ledger-bound 文档仍已 stale。

## 恢复路径

1. 以当前 Verify phase 的真实 `verification-before-completion` receipt 重新登记规范化后的旧失败报告。
2. 对确切 `verify-fail` 留下 review request 与 delegated acknowledge，回到 Build 重新冻结。
3. 重跑完整 Reviewer、E2E、Codex、双版本 strict/archive、官方 checker 与 ledger 校验。
