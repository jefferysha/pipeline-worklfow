# 最终主干统一审查 — Verify 失败报告（2026-08-03）

## 冻结身份

- Tenon Build 基线：`workspace:sha256:8c31d06fe699d4fd1aa7bbdf23578b174ba4efe0c23d065e8ef357f5da65fadc`
- 产品 Git HEAD：`dce8ddbffcb7b40cf9fe627521f1640e6664e6fb`
- Git tree：`8010a087d420e24d890532455371c98e2ff04703`
- Git 基线：`a86dabb481a8d20e0c50ce8c1b421fac45f886f9`
- 完整范围：624 files，21,108 additions，3,684 deletions
- diff SHA-256：`dc8a008069e0d7612d99ec8b422e6964fbb8eff91ca632091b73f11c7d4bd046`

## 聚合结论

Verify：**FAIL — C0 / H0 / M1 / L0**。PR #20 当前 GitHub CI 虽然为绿色，仍不得合并；必须经官方
`verify-fail` 回 Build 修复，重新冻结并完整重跑所有验证轨。

### Medium — Save/Delete 失败焦点未绑定实际 mutation trigger

独立 Codex 全差异审查确认 `packages/dashboard-app/src/workbench/TrackSettings.tsx:231` 的 Save
仍通过 `mutationFocus.capture()` 从 `document.activeElement` 推断触发源；Delete 路径没有捕获确认按钮。
Safari 鼠标行为或程序化 `.click()` 不保证激活按钮取得焦点，因此 409/network failure 后可能把焦点
返回先前字段或丢失，而不是实际 Save/Delete trigger。这与本轮刚修复的 Edit/Create actual-trigger
问题同源，也违反失败 mutation 保持编辑器并恢复触发源的焦点契约。

修复必须让 Save 与 Delete 显式接收并绑定实际 `event.currentTarget`，增加非聚焦程序化 Save/Delete
失败 RED→GREEN；不能继续从全局 active element 猜测。

### Verify 轨完整性失败 — reviewer 写入真实工作区

完整 reviewer 的源码/治理结论本身为 C0/H0/M0/L0，但它误在真实工作区执行 `docs:build`，瞬时改写
gitignored `docs-site/dist` 并创建生成目录。即使受管 Git 文件、HEAD 和 tree 未变，Tenon
repo-zero-output barrier 明确规定任何瞬时 fingerprint 漂移都会使该轨无效，不得通过恢复产物把它
重新声明为 PASS。因此本轮 reviewer 轨证据作废，下一轮必须在隔离副本中重跑。

## 四轨证据

| 轨道 | 结论 | 证据 |
| --- | --- | --- |
| 完整 reviewer | INVALID | 源码审查 C0/H0/M0/L0，但真实工作区发生瞬时生成物写入，违反 repo-zero-output barrier |
| E2E/API/OpenSpec | PASS，C0/H0/M0/L0 | `/tmp/tenon-pr20-final-verify.753kD7`；全量、隔离 archive/apply 与生成物一致性通过 |
| Dashboard 浏览器/视觉 | PASS，C0/H0/M0/L0 | `/tmp/tenon-pr20-final-verify-dce8ddb/audit.json`，SHA-256 `4ae47679a3a818439f2bc5f701dc393170a00e8cf921a534d352596282ac177f` |
| Codex CLI | FAIL，M1 | `/tmp/tenon-pr20-codex-review-dce8.md`；确认 Save/Delete actual-trigger finding |

## 已通过但不能覆盖失败结论的证据

- `npm ci`：486 packages，0 vulnerabilities。
- `npm run build`、`npm run typecheck:web`：通过；重建 CLI/Server/Dashboard 与提交资产逐字节一致。
- Root Vitest：330 files，5,881 passed，26 honest skips。
- Dashboard Vitest：85 files，1,548 passed。
- Track/authority/focus 定向：213/213；API 定向：27/27。
- Hooks：512/512；adapters：272/272；migration CAS：13/13；clean-install：`ok:true`。
- OpenSpec：当前 strict 38/38；Change 6 deltas；隔离 archive/apply 成功；归档后主 specs strict 32/32。
- dependencies、release workflows、comments、architecture、identity、repository hygiene、npx、legacy bridge、
  default workflow freshness、docs 与 document templates 全部通过。
- GitHub 精确 HEAD CI run `30763024381`：success；Documentation Pages run `30763024379`：build success，
  deploy 按 PR 规则 skipped。PR 为 `CLEAN/MERGEABLE`，但治理 Verify 结论优先阻止合并。
- 真实浏览器覆盖 1024/1440/1920、zh/en、light/dark、reduced motion、loading/empty/error/busy、
  authority response inversion、409、键盘、焦点与程序化非聚焦 Edit/Create；5 个模拟写请求均被拦截。
- 浏览器轨前后 workspace fingerprint 均命中冻结基线；真实 Track 配置仍为 revision
  `09bfcc6a14b83e21`、`builtin-only`、原六轨道。

26 个 honest skips 为 real-Codex 未启用 1 项、Docker daemon 不可用 16 项、macOS 上 Linux-only
9 项；GitHub PR CI 已在 Linux/Docker 环境完成 canonical 测试。受信 main-push real-Codex 仍只能在
合并后的主干事件执行，本次不把它写成已通过。

## OpenSpec 隔离演练

隔离副本执行 OpenSpec 1.6.0 `show`、strict validate、archive/apply 与 archive 后主规格 strict：

- apply 前主 specs digest：`fe389a8629d1eba5206eec62dca60c8d92c30d4e08b9fcb5a4479afdd76b46cd`
- apply 后隔离主 specs digest：`e139915d665483a9d6da2a28b260f6ce9fca4c847c0a559b8a9eb6e0237c8ca7`
- 真实 `openspec/specs` 未被应用；Ship 仍是唯一真实 apply 边界。

## 后续动作

1. 使用官方 `verify-fail` 回 Build；保持“精确 head 与四轨通过”任务未勾选。
2. 为非聚焦 Save/Delete 失败建立 RED，并显式传递实际 trigger；同时清理 reviewer 造成的 gitignored
   生成物漂移，通过官方 workspace fingerprint 重新确认 Build 输入。
3. 重跑定向、全量、静态门、真实浏览器与 pre-Verify review，提交并冻结新基线。
4. 在新基线上重新执行完整 reviewer、E2E/OpenSpec、Codex、浏览器与 GitHub CI；不得复用本轮 PASS。
