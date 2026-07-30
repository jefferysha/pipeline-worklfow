# 已应用规格

## 变更摘要

在 Ship 的唯一真实应用边界，将 Projects 电脑端 basename/root 检索、四态状态聚焦、可访问
radio group、live summary、诚实空态与受控动效要求加入 Dashboard UI/UX living spec。
应用日期：2026-07-30。未发生 requirement 身份冲突，也未覆盖主规格中的无关内容。

## 已应用需求

- source delta：
  `openspec/changes/dashboard-projects-focus-20260730/specs/dashboard-ui-ux-system/spec.md`
- main spec：`openspec/specs/dashboard-ui-ux-system/spec.md`
- requirement：`Projects 电脑端检索与状态聚焦`
- result：`changed`
- before SHA-256：`ac489b1f42b1ceaf65c8598ecd1fe5807b239ea71363bbf1dd2c96a713494581`
- after SHA-256：`781452bdf42a4436f271a822c87884a36c144cbd1acd323b3085b6f9b0c1d897`
- effect：新增 1 个 durable requirement 与 8 个 scenario；保留所有既有 requirements。

## 交付证据

- Verify build SHA：`d7cca5b6e4d40ee063dbe646374ab4a0cfd647cf`
- Change strict validate：PASS
- 应用后 `dashboard-ui-ux-system --type spec --strict`：PASS
- verification report：
  `docs/superpowers/reports/2026-07-30-dashboard-projects-focus-20260730-verify.md`
- 幂等性：再次执行应用时以 requirement/scenario 身份核对；主规格已包含相同内容时必须保持
  byte-preserving `no-op`，不得重复追加。
