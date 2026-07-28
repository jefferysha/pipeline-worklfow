# Prompt Routing Bypass 验证报告

## 结论

**FAIL，返回 Build 修复。**

冻结基线为 `2db49c5ebcc9922ea320ffd152a3e3ded231545f`。四轨均完成且前后未出现实现漂移：
E2E 轨通过；Reviewer 与 commit-scoped Codex 轨一致发现 4 个 Medium；视觉轨另发现 1 个
Medium。无 Critical / High，不允许以偏差通过。

## 冻结与零输出屏障

- `tenon get prompt-routing-bypass build_sha`
  → `2db49c5ebcc9922ea320ffd152a3e3ded231545f`
- 三个子轨前后 `HEAD` 均为该 SHA；`git status --porcelain` 前后逐字一致，仅包含进入 Verify、
  `document read` 已产生的 7 个治理状态文件。
- Reviewer 审查冻结提交相对父提交的 77 个文件。
- E2E 在 `/tmp/tenon-prompt-bypass-verify.lho27L` 的 `git archive` 副本运行。
- 截图、日志和 Codex 输出均写在 `/tmp`，没有写入仓库实现、配置或生成物。

## 四轨结果

### Reviewer Agent

结论：FAIL。

1. `hooks/prompt-intent.sh:15-49` — **MEDIUM**：行扫描会接受嵌套、重复或部分损坏 JSON
   中看似 canonical 的字段，与 server 的 JSON 解析回退语义不一致。修复：纯 Bash 严格识别
   canonical 顶层结构，异常整体回退，并补 nested / duplicate / truncated 反例。
2. `packages/dashboard-app/src/workbench/TimelineHookRows.tsx:42` — **MEDIUM**：
   GET 失败后 `hooks` 仍为 `null`，活动 Workbench 永久显示 loading 而忽略 `loadError`。
   修复：渲染 `role=alert` 的加载错误并补测试。
3. `packages/dashboard-app/src/workbench/TimelineHookRows.tsx:188-193` — **MEDIUM**：
   持久化空值重载后不显示明确 disabled 状态。修复：基于已加载 server 值持续显示禁用状态。
4. `packages/dashboard-app/src/workbench/HookTimeline.tsx:144-159` — **MEDIUM**：
   跨项目切换时，旧 root 的迟到保存结果会覆盖新 root 状态。修复：按 root/generation 忽略
   stale success/error/finally，并补乱序测试。

### E2E

结论：PASS，无新增 finding。

- 隔离副本 `npm run build`：PASS。
- `npx vitest run packages/server/src/hooksConfig.test.ts packages/server/src/server.test.ts`：
  2 files / 299 tests PASS。
- Dashboard `HookTimeline.test.tsx`：9/9 PASS。
- `bash tools/test-hooks.sh`：489/489 PASS。
- `npm run test:web`：50 files / 966 tests PASS；仅既有 React `act(...)`、GSAP 提示。
- Chrome headless `http://127.0.0.1:28177`：title=`Tenon Dashboard`，root 指向冻结副本。
- 真实 UI→API→文件闭环覆盖：默认加载、`skip-tenon` 保存/回读、非法输入零 POST、
  mock 500 保留草稿与重试、700ms busy、空字符串禁用、Tab/Enter、英文 375×812 无横向溢出。
- router/breadcrumb 真入口覆盖独立词、词内片段、下一轮恢复、空字符串禁用；
  confirm gate 在 keyword 存在时仍 `rc=2`。
- console/pageerror：0/0。
- 截图：`/tmp/prompt-routing-bypass-e2e-success.png`、
  `/tmp/prompt-routing-bypass-e2e-mobile-en.png`。
- 未覆盖：真实掉电、多进程写竞争、screen reader、像素基线。

### Codex CLI

结论：FAIL。

首次 `git diff ... | codex exec` 因输入 `1940325` 字符超过 `1048576` 上限，未形成结论。
随后使用
`codex exec -s read-only --ephemeral -C <worktree> -o /tmp/prompt-routing-bypass-codex-review.txt review --commit 2db49c5...`
成功完成 commit-scoped 审查；独立命中与 Reviewer 相同的 4 个 P2/Medium。
Codex 在 read-only sandbox 中尝试运行 Vitest 时因 Vite 临时配置写入被 `EPERM` 拒绝；测试证据由
E2E 隔离副本轨提供，不把该环境限制记作产品失败。

### 视觉审

结论：FAIL。

- 真实页面：`http://127.0.0.1:18876/?view=workbench&root=<current-worktree>`，
  title=`Tenon Dashboard`，snapshot root、Change、phase、build SHA 均匹配。
- 覆盖 1440×1100 中文、375×812 英文、loading、ready、invalid、save error、busy、
  success、disabled、键盘焦点、reduced-motion；console/pageerror 0/0。
- **MEDIUM**：`TimelineHookRows.tsx:188-193` 的 11px `text-green` 状态文本在实际浅底上
  对比度约 3.07–3.16:1，未达到 WCAG AA 正常文本 4.5:1。修复：使用更深的绿色文本 token/颜色。
- 截图：`/tmp/tenon-prompt-routing-bypass-desktop-zh.png`、
  `/tmp/tenon-prompt-routing-bypass-loading-zh.png`、
  `/tmp/tenon-prompt-routing-bypass-invalid-focus-zh.png`、
  `/tmp/tenon-prompt-routing-bypass-save-error-zh.png`、
  `/tmp/tenon-prompt-routing-bypass-mobile-en.png`。

## Build 阶段已完成门禁

- `npm run typecheck:web`：PASS。
- `npm run test:web`：50 files / 966 tests PASS。
- `npm run test:hooks`：489/489 PASS。
- `npm test`：PASS；一个既有 `[HONEST SKIP] TENON_REQUIRE_REAL_CODEX!=1`。
- `npm run build`：PASS；仅既有 Vite chunk >500 kB warning。
- `npm run check:comments`、`check:architecture`、`check:identity`、
  `check:repository-hygiene`、`check:docs`、`check:document-templates`、
  `check:npx-package`、`check:legacy-bridge`：PASS。
- `npm run oracle`：双跑全部一致，0 处不一致。

## OpenSpec 隔离应用演练

- `openspec show prompt-routing-bypass --json --deltas-only`：4 个 ADDED requirements。
- `openspec validate prompt-routing-bypass --strict`：PASS。
- `git archive 2db49c5...` 到
  `/private/tmp/tenon-verify-prompt-routing-bypass.hLwXpk` 后运行
  `openspec archive prompt-routing-bypass --yes --json`：PASS，新增 4、修改/删除/重命名 0。
- 副本 `openspec validate prompt-routing-bypass --type spec --strict`：PASS。
- 真实 `openspec/specs/**/spec.md` 聚合摘要前后均为
  `44328f9c948d747c455e279f141d5eeb4d0f9db8571afdbb2de3bcc40aa299eb`。
- 仓库全量 `openspec validate --all --strict` 仍报告 12 个既存无效项；目标新规格本身 strict
  valid，本轮未修改这些既存 Change/spec，也未把全量失败误报为目标通过。

## 逐文件规格回读

新 capability 在 Ship 前尚无 main spec；实现文件先对照冻结 delta
`openspec/changes/prompt-routing-bypass/specs/prompt-routing-bypass/spec.md`，并按受影响面同时回读
既有主规格。

| 改动文件 | 命中的 capability spec | 已回读并比对 |
| --- | --- | --- |
| `docs/CONTRACT.md` | `openspec/changes/prompt-routing-bypass/specs/prompt-routing-bypass/spec.md` | ☑ |
| `docs/adr/2026-07-28-prompt-routing-bypass-explore.md` | 同上 | ☑ |
| `docs/superpowers/plans/2026-07-28-prompt-routing-bypass.md` | 同上 | ☑ |
| `docs/superpowers/specs/2026-07-28-prompt-routing-bypass-comet-research.md` | 同上 | ☑ |
| `docs/superpowers/specs/2026-07-28-prompt-routing-bypass-design.md` | 同上 | ☑ |
| `docs/superpowers/specs/2026-07-28-prompt-routing-bypass-trellis-research.md` | 同上 | ☑ |
| `hooks/breadcrumb.sh` | delta + `openspec/specs/normal-chat-routing/spec.md` | ☑ |
| `hooks/prompt-intent.sh` | delta + `openspec/specs/normal-chat-routing/spec.md` | ☑ |
| `hooks/router.sh` | delta + `openspec/specs/normal-chat-routing/spec.md` | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-document-locale.json` | `openspec/specs/document-evidence-contract/spec.md` | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-documents.json` | 同上 | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-history.jsonl` | 同上 | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-run/current.json` | 同上 | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-run/pre-verify-review/000000-3d967d56-b89f-4dd6-aeee-fecf3dbb98ea.json` | 同上 | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-run/pre-verify-review/000001-9ab8e356-3eba-4d9d-8a06-477a13faf261.json` | 同上 | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-run/pre-verify-review/000002-d7cdc553-43b0-4efc-b6f3-31c406ac18d2.json` | 同上 | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-run/pre-verify-review/000003-14e312b2-d16a-4560-807e-a476d2b7d95e.json` | 同上 | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-run/pre-verify-review/000004-562ae5ab-dd47-4595-bbbe-9a3cb01f920b.json` | 同上 | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-run/pre-verify-review/000005-e48b480c-c942-4871-9940-51cfcc5c16da.json` | 同上 | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-run/pre-verify-review/000006-77ee3dc6-48ac-400d-b824-8fdbc0bb20a0.json` | 同上 | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-run/pre-verify-review/000007-8a6a4f56-cab7-4970-b03b-1e7148a6f648.json` | 同上 | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-run/pre-verify-review/000008-a6df5aae-1c7b-4071-8b15-ed6829e30fd9.json` | 同上 | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-run/pre-verify-review/000009-2af15ea5-3fc3-4ef3-917c-2cfb0dd3f90d.json` | 同上 | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-run/pre-verify-review/000010-27eb1eb0-5ba6-4c9b-9b06-778df9175fd8.json` | 同上 | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-run/pre-verify-review/000011-2b34dd57-0d37-4f4e-9f80-04d2e3780ad5.json` | 同上 | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-run/pre-verify-review/000012-b522269e-cef1-4439-a073-53376c3f050f.json` | 同上 | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-run/pre-verify-review/000013-07935d9f-6f01-47bb-8450-73bf91f84b0a.json` | 同上 | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-run/pre-verify-review/000014-f0da2282-ce47-4ca9-a1f1-d7a8bc3ddd98.json` | 同上 | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-run/revisions/000000-3d967d56-b89f-4dd6-aeee-fecf3dbb98ea.json` | 同上 | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-run/revisions/000001-9ab8e356-3eba-4d9d-8a06-477a13faf261.json` | 同上 | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-run/revisions/000002-d7cdc553-43b0-4efc-b6f3-31c406ac18d2.json` | 同上 | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-run/revisions/000003-14e312b2-d16a-4560-807e-a476d2b7d95e.json` | 同上 | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-run/revisions/000004-562ae5ab-dd47-4595-bbbe-9a3cb01f920b.json` | 同上 | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-run/revisions/000005-e48b480c-c942-4871-9940-51cfcc5c16da.json` | 同上 | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-run/revisions/000006-77ee3dc6-48ac-400d-b824-8fdbc0bb20a0.json` | 同上 | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-run/revisions/000007-8a6a4f56-cab7-4970-b03b-1e7148a6f648.json` | 同上 | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-run/revisions/000008-a6df5aae-1c7b-4071-8b15-ed6829e30fd9.json` | 同上 | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-run/revisions/000009-2af15ea5-3fc3-4ef3-917c-2cfb0dd3f90d.json` | 同上 | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-run/revisions/000010-27eb1eb0-5ba6-4c9b-9b06-778df9175fd8.json` | 同上 | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-run/revisions/000011-2b34dd57-0d37-4f4e-9f80-04d2e3780ad5.json` | 同上 | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-run/revisions/000012-b522269e-cef1-4439-a073-53376c3f050f.json` | 同上 | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-run/revisions/000013-07935d9f-6f01-47bb-8450-73bf91f84b0a.json` | 同上 | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-run/revisions/000014-f0da2282-ce47-4ca9-a1f1-d7a8bc3ddd98.json` | 同上 | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-transitions/000001-63469b78-6216-4008-8e1f-ff7a8de0e8eb.json` | 同上 | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-transitions/000002-fe12e798-60b6-476b-9302-8ccf49a1bbe9.json` | 同上 | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-transitions/000003-1afa7b9d-ce5e-4fc9-9ecb-db30c8f33cbf.json` | 同上 | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-workflow-governance.json` | 同上 | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline-workflow-plan.json` | 同上 | ☑ |
| `openspec/changes/prompt-routing-bypass/.pipeline.yaml` | frozen delta | ☑ |
| `openspec/changes/prompt-routing-bypass/CONTEXT.md` | frozen delta | ☑ |
| `openspec/changes/prompt-routing-bypass/REVIEW.md` | frozen delta | ☑ |
| `openspec/changes/prompt-routing-bypass/design.md` | frozen delta | ☑ |
| `openspec/changes/prompt-routing-bypass/proposal.md` | frozen delta | ☑ |
| `openspec/changes/prompt-routing-bypass/specs/prompt-routing-bypass/spec.md` | frozen delta | ☑ |
| `openspec/changes/prompt-routing-bypass/tasks.md` | frozen delta | ☑ |
| `packages/dashboard-app/dist/assets/index-BZmeE4p0.js` | delta + `openspec/specs/live-dashboard-project-anchor/spec.md` | ☑ |
| `packages/dashboard-app/dist/assets/index-CJG6YsIV.css` | 同上（删除） | ☑ |
| `packages/dashboard-app/dist/assets/index-ChR5gfaJ.css` | 同上 | ☑ |
| `packages/dashboard-app/dist/assets/index-DV750WXl.js` | 同上（删除） | ☑ |
| `packages/dashboard-app/dist/index.html` | 同上 | ☑ |
| `packages/dashboard-app/src/api/client.ts` | 同上 | ☑ |
| `packages/dashboard-app/src/api/governanceClient.ts` | 同上 | ☑ |
| `packages/dashboard-app/src/api/governanceDecoders.ts` | 同上 | ☑ |
| `packages/dashboard-app/src/api/governanceTypes.ts` | 同上 | ☑ |
| `packages/dashboard-app/src/i18n/translations.ts` | 同上 | ☑ |
| `packages/dashboard-app/src/workbench/ExecutionTimelineComposer.test.tsx` | 同上 | ☑ |
| `packages/dashboard-app/src/workbench/HookTimeline.test.tsx` | 同上 | ☑ |
| `packages/dashboard-app/src/workbench/HookTimeline.tsx` | 同上 | ☑ |
| `packages/dashboard-app/src/workbench/OrchestrationBoard.test.tsx` | 同上 | ☑ |
| `packages/dashboard-app/src/workbench/TimelineHookRows.tsx` | 同上 | ☑ |
| `packages/server/dist/dashboard.mjs` | delta + `openspec/specs/live-dashboard-project-anchor/spec.md` | ☑ |
| `packages/server/src/hooksConfig.test.ts` | 同上 | ☑ |
| `packages/server/src/hooksConfig.ts` | 同上 | ☑ |
| `packages/server/src/server.test.ts` | 同上 | ☑ |
| `packages/server/src/serverGetRoutes.ts` | 同上 | ☑ |
| `packages/server/src/serverPostGovernanceRoutes.ts` | 同上 | ☑ |
| `tools/test-hooks.sh` | delta + `openspec/specs/normal-chat-routing/spec.md` | ☑ |

## 修复出口

返回 Build 后一次性修复上述 5 个 Medium，补齐反例/乱序/持久禁用/加载失败/对比度测试，
重跑全部受影响门禁、重新生成产物、提交新冻结 SHA，再重新执行完整四轨 Verify。
