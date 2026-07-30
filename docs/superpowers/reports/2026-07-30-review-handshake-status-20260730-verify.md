# Review Handshake Status 验证报告（首轮失败）

## 冻结基线

- Change：`review-handshake-status-20260730`
- Track：`frontend`
- Build SHA：`77f328558dc521a709d140e9941fef73b3c7d38d`
- 对比基线：`445aa1411d45a2c112d296a9fc3530db0f62e31e`
- 结论：`FAIL`，必须通过 exact `verify-fail` 回到 Build；不得接受偏差。

## 四轨聚合

### Reviewer 轨：FAIL

完整审查 67 个变更文件及 `review-handshake-status` capability。安全、DTO 最小化、滚动兼容、
生成 bundle 与治理记录未发现问题；发现一项 MEDIUM：

- `packages/dashboard-app/src/i18n/translations.ts` 的 `not-requested` 和 `approved` 下一步文案把
  receipt 事实说成整体 readiness。guards 未齐时用户无法直接发起 request/选择出口，approved
  receipt 也不代表 transition guards 当前仍满足。修复时必须把文案收窄为 receipt 事实，并增加
  blocked-readiness + `not-requested` / `approved` 的集成断言。

### E2E 轨：PASS

- 真实 HTTP `/api/snapshot`：`tenon-snapshot/v2`、Verify review gate、exact
  `verify-pass`/`verify-fail` 出边与 `{status:"not-requested"}` 均正确。
- 隔离真实 Server：`not-requested`、pending exact event、approved 两时间均通过；非法
  `spec-complete` receipt 进入 `project.ok=false` / `change_count=0` 错误面。
- `npx vitest run packages/server/src/snapshot.test.ts`：28/28。
- Dashboard decoder/status/Progress 定向测试：85/85。
- 前后 HEAD/index/worktree/staged fingerprints 一致；未写仓库。

### Codex CLI 轨：FAIL

Codex 登录状态为 `Logged in using ChatGPT`。stdin 全量 diff 首次因 2,227,059 字符超过
1,048,576 字符上限而失败，随后改用 commit-scoped 仓库内只读审查。发现一项 MEDIUM：

- `ProgressView` 的乐观 transition patch 只替换 `phase`，保留旧 `reviewHandshake`。
  `explore → spec` 等 review→review 推进会把旧 `explore-complete` approved receipt 暂时显示在
  Spec。修复时必须在 phase 乐观推进时清除 receipt，并增加 review→review 回归测试。

Codex 隔离副本中的目标测试、typecheck、build 均通过，生成 Server/Dashboard bundle 与冻结提交
逐字节一致。该 Codex 沙箱的全仓 socket/TLS 测试受 `listen EPERM 127.0.0.1` 影响，不用于替代
主线已完成的真实全仓测试。

### 视觉轨：FAIL

生产 Dashboard `http://127.0.0.1:18841` 已确认目标 Tenon 项目和当前 Change：

- 1024×768、1440×900、1920×1080 无溢出；
- system/light、explicit dark 和英文文案均已观察；
- Enter 打开 Drawer、可见 2px focus ring、Escape 关闭并把焦点归还原 Change 卡；
- 层级、间距、材质、图标和无 emoji/模板化噪音均通过。

发现一项 MEDIUM：

- 浅色主题琥珀状态卡 12px detail 使用 `opacity-85` 后，计算颜色
  `rgb(155,101,47)` 对 `rgb(248,239,221)` 的对比度为 4.28:1，低于 WCAG 4.5:1。
  去掉 opacity 后 `text-amb-d` 为 5.84:1。暗色主题为 5.27:1。

截图位于仓库外：
`/private/tmp/tenon-review-handshake-verify-20260730/`。

## OpenSpec 严格演练：FAIL

- `openspec --version`：`1.6.0`
- `openspec show review-handshake-status-20260730 --json --deltas-only`：成功，4 个 ADDED
  requirements。
- `openspec validate review-handshake-status-20260730 --strict`：退出 1。四条 Requirement 正文使用
  中文“必须”，解析器要求字面 `MUST` 或 `SHALL`。
- 真实 `openspec/specs/**/spec.md` 聚合 digest：
  `6d5a3408fdd47a41374493418b17eea9a0b5613b2e402cf41dbba92ee956e7b9`；
  本轮未修改主规格。
- 因 strict validate 已失败，本轮没有把隔离 archive 结果伪报为通过。

## 主线 Build 证据

- `npm test`：327 files，5,743 passed，14 honest skips。
- `npm run test:web`：69 files，1,212 passed。
- `npm run typecheck:web`、`npm run build`：通过；Vite 仅有既存大 chunk warning。
- `npm run check:comments`、`check:architecture`、`check:repository-hygiene`、
  `check:identity`、`check:default-workflow-freshness`：通过。
- `npm run test:hooks`：512 passed。
- `npm run oracle`：双跑 0 不一致。
- honest skips：未设置 `TENON_REQUIRE_REAL_CODEX=1`；缺
  `CLAUDE_CODE_OAUTH_TOKEN` 的 full CC-in-sandbox；与代码失败分开记录。

## 回到 Build 的修复清单

1. Requirement 正文加入字面 `MUST`，使 OpenSpec strict validate 和隔离 archive 可执行。
2. 收窄 `not-requested` / `approved` 中英文文案，只陈述 receipt，不承诺 readiness。
3. 乐观 phase patch 同时清除旧 `reviewHandshake`，覆盖 review→review。
4. 去掉 detail 的降低对比度 opacity，并补可验证回归。
5. 重新执行完整 Build review、测试、构建和生成物门禁，冻结新 SHA；下一轮 Verify 必须重新跑
   全量四轨，不得只复查上述 finding。
