# Review Handshake Status 验证报告

## 冻结基线与结论

- Change：`review-handshake-status-20260730`
- Track：`frontend`（后端共享契约 + Dashboard 纵向切片）
- 对比基线：`445aa1411d45a2c112d296a9fc3530db0f62e31e`
- 最终 Build SHA：`6e4c940e86e4f812715287cabc27e05671018018`
- Frozen tree：`43111addc1fc5745c98f0a8cc516fefb9705d899`
- 结论：`PASS`。Reviewer、E2E、Codex CLI、浏览器四轨均未发现 Critical、High 或
  Medium 问题。

首轮冻结 SHA `77f328558dc521a709d140e9941fef73b3c7d38d` 曾因 receipt/readiness
文案混淆、review→review 乐观状态遗留、浅色 12px 琥珀文字 4.28:1 以及 OpenSpec
缺少字面 `MUST` 而失败。该轮通过 exact `verify-fail` 回到 Spec/Build；四项修复和旧 runtime
回归测试均进入最终 Build SHA，随后完整重跑四轨，未沿用首轮失败结论。

## 四轨聚合

### Reviewer：PASS

- 对 `origin/main...6e4c940e` 的 105 个路径逐项复核：7 个研究/设计/报告路径、77 个
  Tenon/OpenSpec 治理路径、19 个 Server/共享契约/Dashboard/测试/生成物路径、2 个
  repository hygiene 路径。
- Server 只从 canonical state 与冻结 workflow plan 派生 DTO；未知状态、半组字段、漂移 phase
  和不可达 event 均 fail-loud。HTTP/SSE 复用同一 snapshot 链路，协议保持
  `tenon-snapshot/v2`。
- Dashboard 对旧 server 缺字段保持 unavailable；字段出现后 exact-key 严格解码。readiness、
  receipt、direct transition 三者正交，review→review 乐观推进消费旧 receipt。
- 中英文只陈述 receipt 事实，不承诺 guards/readiness；生成 Server/Dashboard bundle 与源码同步。
- 审查前后 fingerprint 均为
  `904f404d99faa0225067e85b1ff129fe5eb1d0e48ed0b1cd77196f6b53ab0db0`；
  `git diff --check` 通过，冻结区未被修改。

### E2E：PASS

- 隔离真实 Dashboard HTTP server 使用真实 `StateStore` 和冻结 default workflow，实际消费
  `/api/snapshot` 与 `/api/stream`。
- 两种 transport 对 not-requested、pending `verify-pass`、approved `verify-pass` 完全一致；
  非法 `spec-complete` 在 HTTP/SSE 均进入 `project.ok=false`、`change_count=0` 的既有错误面。
- `packages/server/src/snapshot.test.ts`：28/28。
- `packages/server/src/server.test.ts -t "GET /api/stream"`：1/1，另 300 项按定向过滤。
- Dashboard contract/client/status/Progress 定向测试：119/119。
- repository hygiene：8/8。该轨主要断言合计 156 项通过。
- verbose 回归确认：旧 runtime 显示 unavailable；review→review 立即消费旧 exact-event receipt；
  缺 capability 的旧 runtime 不被合成为 not-requested。

### Codex CLI：PASS

- 使用登录态 Codex 对 `origin/main...HEAD` 做仓库内只读复核；结论为无可操作 correctness finding。
- 独立复核确认 Server projector、严格滚动兼容 decoder、乐观 transition 处理和只读状态卡与规格一致。
- Codex 沙箱内 Server 28/28、Dashboard 88/88 通过。
- Codex 的 read-only sandbox 禁止 `mkdtemp`，hygiene 测试因此出现 8 个 `EPERM`；这属于该沙箱
  写限制，不冒充代码失败，也不替代主工作树和 E2E 轨真实通过的 hygiene 8/8。
- 本机 Codex 附带报告了损坏的 `logs_2.sqlite`、模型缓存字段和 plugin metadata warning；
  均未影响仓库审查结论。

### 浏览器：PASS

- 真实 production Dashboard：`http://127.0.0.1:18841`，bundle
  `index-B5a0THKJ.js`，页面确认属于目标 Tenon 项目和本 Change。
- 覆盖 canonical not-requested、浏览器隔离 pending `verify-pass`、approved `verify-fail`、
  旧 runtime unavailable；中英文与 light/dark/system 均通过。
- 1024×768、1440×900、1920×1080 无页面或卡片溢出；exact event 和时间戳可安全换行。
- 浅色 amber 12px 为 5.84:1，green 12px 为 4.60:1；目标文字 opacity 均为 1。
- Change 卡 Enter 打开 Drawer，关闭按钮有 2px focus ring，Escape 关闭并把焦点归还原卡。
- loading 显示加载态且无 handshake 卡；500 error 显示可恢复错误与重试入口且无 handshake 卡。
- 严格 empty fixture 同时清空 `projects[].changes` 并设置 `change_count=0`；decoder 接受且进入
  `onboard-no-change`，Change/Handshake 卡均为 0。
- 截图位于仓库外：
  `/private/tmp/tenon-review-handshake-second-verify-20260730/`。空态截图
  `second-final4-empty-strict.png` SHA-256 为
  `a336bce84352f22c00d73faacc96d5ece26b04659de3caf92cd659828da70e92`。

## OpenSpec 严格演练

- `openspec --version`：`1.6.0`。
- `openspec show review-handshake-status-20260730 --json --deltas-only`：成功，4 个 ADDED
  requirements。
- `openspec validate review-handshake-status-20260730 --strict`：通过；四条 Requirement 均含字面
  `MUST`。
- 隔离副本 `/tmp/tenon-review-handshake-openspec.OB22iW` 执行
  `openspec archive review-handshake-status-20260730 --yes --json` 成功，应用后的
  `review-handshake-status` 主规格 strict validate 通过。
- 真实 `openspec/specs/**/spec.md` 聚合 digest 在演练前后均为
  `31bf9e43a1afa18bde842be34bf2d3cae5a4970b8d704b7026e46340bc9f8850`；
  隔离演练没有提前修改真实主规格。

## Build 门禁

- `npm test`：327 files，5,743 passed，14 honest skips。
- `npm run test:web`：69 files，1,215 passed。
- `npm run typecheck:web`、`npm run build`：通过；Vite 仅有大于 500 kB 的 chunk warning。
- `npm run check:comments`、`check:architecture`、`check:repository-hygiene`、
  `check:identity`、`check:default-workflow-freshness`：通过。
- `npm run test:hooks`：512 passed。
- `npm run oracle`：双跑 0 mismatch。
- honest skips：未设置 `TENON_REQUIRE_REAL_CODEX=1`；缺少
  `CLAUDE_CODE_OAUTH_TOKEN` 的 full CC-in-sandbox。两者均与代码失败分开记录。

## Spec 覆盖清单

- ☑ `docs/adr/2026-07-30-review-handshake-status-explore.md`
- ☑ `docs/superpowers/plans/2026-07-30-review-handshake-status.md`
- ☑ `docs/superpowers/reports/2026-07-30-review-handshake-status-20260730-verify.md`
- ☑ `docs/superpowers/specs/2026-07-30-review-handshake-backend-contract-research.md`
- ☑ `docs/superpowers/specs/2026-07-30-review-handshake-dashboard-ux-research.md`
- ☑ `docs/superpowers/specs/2026-07-30-review-handshake-status-design.md`
- ☑ `docs/superpowers/specs/2026-07-30-review-handshake-upstream-research.md`
- ☑ `packages/server/src/reviewHandshake.ts`
- ☑ `packages/server/src/snapshot.ts`
- ☑ `packages/server/src/types.ts`
- ☑ `packages/server/src/snapshot.test.ts`
- ☑ `packages/server/dist/dashboard.mjs`
- ☑ `packages/dashboard-app/src/api/snapshotDecoder.ts`
- ☑ `packages/dashboard-app/src/api/boundaryDecoders.test.tsx`
- ☑ `packages/dashboard-app/src/types.ts`
- ☑ `packages/dashboard-app/src/i18n/translations.ts`
- ☑ `packages/dashboard-app/src/progress/ReviewHandshakeStatus.tsx`
- ☑ `packages/dashboard-app/src/progress/ReviewHandshakeStatus.test.tsx`
- ☑ `packages/dashboard-app/src/progress/ProgressDrawer.tsx`
- ☑ `packages/dashboard-app/src/progress/ProgressView.tsx`
- ☑ `packages/dashboard-app/src/progress/ProgressView.test.tsx`
- ☑ `packages/dashboard-app/dist/index.html` 与本轮增删的 hashed JS/CSS assets
- ☑ `tools/check-repository-hygiene.mjs`
- ☑ `tools/check-repository-hygiene.node-test.mjs`
- ☑ `openspec/changes/review-handshake-status-20260730/` 下 proposal、design、delta spec、tasks、
  REVIEW、locale/documents/history/current、workflow governance/plan、`.pipeline.yaml` 投影、
  revision 000000–000027、pre-verify-review 000000–000027 和 transition 000001–000009。

上述每项均映射到 `review-handshake-status` 的 canonical projection、滚动兼容 decoder、只读
Dashboard 状态卡或其 repository compliance 边界；治理文件同时覆盖 document-evidence 与冻结
effective-workflow 要求。清单来自对
`git diff --name-only 445aa1411d45a2c112d296a9fc3530db0f62e31e...6e4c940e86e4f812715287cabc27e05671018018`
的逐项核对。
