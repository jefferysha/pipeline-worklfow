# related-session-memory 验证报告

## 结论

**FAIL — 返回 Build 修复。**

- 冻结构建：`475cee668d6b2de6ac01c0ea80ebd7284569c205`
- 基线：`origin/main@15fe619b2885b928dd27be9668cca6b0ee903c57`
- Change：`related-session-memory`
- Track：`frontend`（实际交付覆盖 kernel、server、Dashboard）
- 聚合结果：代码 Reviewer `FAIL`；E2E `PASS`；视觉 Reviewer `PASS`；Codex CLI `FAIL`。
- Verify 前后实现、配置、生成物与冻结 SHA 一致；仅 Tenon 治理状态和本报告发生允许的 Verify 写入。

## 阻断发现

1. **HIGH — 100 个项目内候选未跨宿主全局按最近性选择**
   - 位置：`packages/kernel/src/mem/sessions.ts:73-81`、`packages/kernel/src/mem/relatedSearch.ts:135-149`、`packages/kernel/src/mem/adapters/codex.ts:66-93`、`packages/kernel/src/mem/adapters/pi.ts:24-36`
   - `all` 按 Claude → Codex → OpenCode → Pi 固定顺序调用 adapter，却共享一个在 adapter 内消耗的候选计数。100 个 Claude 来源可饿死更新的其他宿主来源；Codex/Pi 又在读取 cwd 和项目过滤前认领，100 个外项目文件可隐藏目标项目命中。
   - 修复要求：两阶段发现轻量元数据，先排除非项目来源，再将选中宿主的项目内会话按更新时间全局合并，最后只读取最近 100 个；新增跨宿主饥饿和外项目饥饿回归。
2. **HIGH — 宿主合成摘要可能伪装成 user-only excerpt**
   - 位置：`packages/kernel/src/mem/relatedSearch.ts:225-229` 及 Claude/Pi compaction 适配路径。
   - Claude compact summary 和 Pi 压缩/分支摘要被现有 adapter 标成 `role: user`，但内容可能是宿主综合生成并包含 assistant 信息。查询只命中这类摘要时仍会通过 user-only 门并返回。
   - 修复要求：在 dialogue turn 保留原始用户/合成摘要 provenance，related search 只允许原始用户 turn 形成命中和 excerpt；补 Claude/Pi synthetic-only 回归。
3. **MEDIUM — 非预算 partial 被文案误报为读取预算耗尽**
   - 位置：`packages/dashboard-app/src/shared/RelatedSessionsSection.tsx:158-160,185-188`
   - `opencode-reader-unavailable`、`file-read-unavailable`、`bounded-read-unavailable` 同样会得到 partial，但 UI 一律显示预算提示，掩盖数据源不可用。
   - 修复要求：使用中英文通用 partial 文案或按稳定 warning code 映射原因，并覆盖预算/数据源两类测试。
4. **MEDIUM — 非法查询长度静默忽略提交**
   - 位置：`packages/dashboard-app/src/shared/RelatedSessionsSection.tsx:68-70`
   - 空白、1 code point 或超过 128 code point 的查询直接 return，页面仍留在 idle；单字符 Change 默认查询也会看似无响应。
   - 修复要求：提供按 code point 计算的可访问校验错误；不能用原生 UTF-16 `maxLength` 破坏 emoji 边界。

## 低风险发现

- `RelatedSessionsSection` 的 query input/select 可补稳定 `name`，query input 可补 `autoComplete="off"`；不阻断本次 Verify，但下一轮 Build 一并处理。

## 首轮问题回归

首轮全部 finding 已确认修复：Claude 缺失 cwd fail-closed、文件读取前候选上限、OpenCode reader unavailable partial、Unicode code-point 长度、IME Enter、按钮对比度、POST 文档措辞与并发 append 检测。

## 四轨证据

### 代码 Reviewer

- 全量审查 `origin/main...475cee668d6b2de6ac01c0ea80ebd7284569c205`。
- 覆盖 117/117 个文件：文档 7、治理 75、kernel 12、server 6、Dashboard 11、生成物 6。
- 前后实现指纹一致。
- 结论：`FAIL`，发现候选全局 admission 的 1 High；无其他 severity finding。

### E2E

- 生产 server：`127.0.0.1:62417`，隔离 HOME/runtime；health 为 `ok/global/v1.0.1`，HTML 与浏览器 title 精确为 `Tenon Dashboard`，精确打开本 worktree/Change。
- 通过：Codex success/partial、Pi complete empty、user-only/privacy、Enter/focus、128 emoji code point（129 返回 400）、IME 零请求、Fetch 延迟下 loading 与关闭详情 abort/stale 清理、server-down error/Retry、390×844 零横向溢出、console warn/error 0。
- 证据：`/tmp/tenon-related-verify2.r8SxrJ/evidence/verify-e2e-summary.md` 及同目录 JSON、截图、API/log。
- 结论：`PASS`，无 severity finding。

### 视觉 Reviewer

- light/dark、390/1440、idle/loading/results/partial/complete-empty/error/retry、键盘焦点与 reduced motion 均通过。
- 主按钮对比度 light `5.02:1`、dark `10.99:1`；无 overflow、emoji 或装饰性 AI-slop。
- 证据：`/tmp/tenon-related-verify-second-j4u7v2/`。
- 结论：`PASS`；无 Critical/High/Medium，1 个上述 Low。

### Codex CLI

- 首次把自定义 prompt 与 `--base` 组合被 CLI 参数契约拒绝（exit 2），未执行审查。
- 受支持的 `codex exec review --ephemeral --base verify-base` 在 `/tmp/tenon-codex-review.Gl5ro9/repo` 隔离 clone 内完成；真实仓库零实现写入。
- 结论：`FAIL`，确认全局候选 1 High，并新增 synthetic summary 1 High、partial copy 与非法长度 2 Medium。
- Codex 在隔离 clone 内尝试定向 Vitest 时遇到仓库已知的 Vitest 保留句柄并 exit 130；主线 Node 22 测试结果如下，不把该子进程记为绿色。

## 构建与测试证据

冻结前、rebase 到最新 main 后实际通过：

- 定向 kernel/server：4 files / 45 tests passed。
- Dashboard focused：相关 2 files / 9 tests passed；`test:web` 已覆盖完整 6 个组件场景。
- `npm run typecheck:web`：exit 0。
- `npm run test:web`：53 files / 975 tests passed；既有 React `act(...)` 与 GSAP 提示不影响退出码。
- `npm run build`：exit 0；存在既有 Vite `>500 kB` bundle warning。
- Node 22.18 全量：318 files / 5472 passed / 5 honest skipped（5477），exit 0。跳过项仅需 `TENON_REQUIRE_REAL_CODEX` 或 `CLAUDE_CODE_OAUTH_TOKEN` 的外部认证场景。
- `check:repository-hygiene`、`check:docs`：exit 0。
- `bash tools/test-hooks.sh`：482 passed / 0 failed。
- `npm run oracle`：0 处不一致；只有既有产品演进说明。
- `git diff --check`：最终冻结提交无错误。

## OpenSpec 隔离应用演练

- 隔离副本：`/tmp/tenon-openspec-rehearsal.rKlZ0e/repo`。
- `openspec show related-session-memory --json --deltas-only` 与 `openspec validate related-session-memory --strict` 成功。
- `openspec archive related-session-memory --yes --json` 成功，归档为 `2026-07-28-related-session-memory`，新增 6 条需求。
- 新生成的 `related-session-memory` 主规格 strict validate 成功，SHA-256 为 `acc1a57b1a5975b99cf1d85aee1e99124dd24848b4ddb2811aaed9bd19020591`。
- 额外的全仓 `openspec validate --specs --strict` 被 7 个既有无关主规格拒绝；不计入本轮规格结果。
- 真实工作树实现、文档和 `openspec/specs/**` 前后未漂移。

## 逐文件规格回读

下列冻结文件均已回读并与对应规范比对；代码 Reviewer 同时逐项确认了完整 117 文件集合。缩写：

- `RSM`：`openspec/changes/related-session-memory/specs/related-session-memory/spec.md`
- `ARCH`：`openspec/specs/repository-architecture-compliance/spec.md`
- `ANCHOR`：`openspec/specs/live-dashboard-project-anchor/spec.md`
- `DOC`：`openspec/specs/document-evidence-contract/spec.md`
- `DIST`：`openspec/specs/plugin-distribution/spec.md`

| 改动文件 | capability spec | 已比对 |
| --- | --- | --- |
| `docs/adr/2026-07-28-related-session-memory-explore.md` | RSM, ARCH | ✓ |
| `docs/superpowers/plans/2026-07-28-related-session-memory.md` | RSM, ARCH | ✓ |
| `docs/superpowers/reports/2026-07-28-related-session-memory-verify.md` | RSM, DOC | ✓ |
| `docs/superpowers/specs/2026-07-28-related-session-memory-upstream-b-research.md` | RSM, ARCH | ✓ |
| `docs/superpowers/specs/2026-07-28-related-session-memory-design.md` | RSM, ARCH | ✓ |
| `docs/superpowers/specs/2026-07-28-related-session-memory-tenon-audit.md` | RSM, ARCH | ✓ |
| `docs/superpowers/specs/2026-07-28-related-session-memory-upstream-a-research.md` | RSM, ARCH | ✓ |
| `openspec/changes/related-session-memory/.pipeline-document-locale.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-documents.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-history.jsonl` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/current.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/pre-verify-review/000000-eeb8c27f-238f-4c23-8b25-3886e5e0d258.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/pre-verify-review/000001-6eeee69c-fd05-418a-b1dc-386105eee1c4.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/pre-verify-review/000002-9e556bee-57c5-4ec4-b16c-dac159b3d009.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/pre-verify-review/000003-822063f4-4f9b-467f-a4f0-24b673ffbea0.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/pre-verify-review/000004-40f58de4-f0ad-4de9-b51c-2c3336fa2b03.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/pre-verify-review/000005-0ab948c6-ddfa-47a6-937e-0d4fbd5f7df5.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/pre-verify-review/000006-7f1e3b1a-82d5-4ed8-8ae4-39cdab62fd3c.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/pre-verify-review/000007-d7486996-5ba9-4eab-853a-c9f78ae83aaa.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/pre-verify-review/000008-46a3c819-f764-4a46-9bdc-99b1f8e4c0fe.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/pre-verify-review/000009-cf8dab9c-c2ad-46ae-89c3-97bb8500e2c5.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/pre-verify-review/000010-407895d0-1039-45ed-a398-4a8f82892822.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/pre-verify-review/000011-fcab04b6-41dc-4cd1-aa3c-80abdf9b4baf.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/pre-verify-review/000012-7751e42b-b614-4dbc-9be0-ec892b6829b5.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/pre-verify-review/000013-301067d9-1891-4955-848d-c3940277276c.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/pre-verify-review/000014-ed266a04-2970-4da8-bc58-6ff8ab60d088.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/pre-verify-review/000015-dd001506-129a-4da4-bce7-c4f438e2e99b.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/pre-verify-review/000016-5f8bf4a4-6893-4fa2-b464-063754fc86f2.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/pre-verify-review/000017-e7fd61d4-9938-44c9-80ca-10676c550faa.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/pre-verify-review/000018-1f5e0af4-2dd1-4612-8671-24d9fe03580d.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/pre-verify-review/000019-bd71c93f-68f2-4405-8562-e68dab6cb5b0.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/pre-verify-review/000020-59027448-4154-4be2-a3f1-6d868172c72e.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/pre-verify-review/000021-15bbc052-28f2-4c90-ae38-b605ef04c156.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/pre-verify-review/000022-b0b2e25f-258d-4b86-8297-1c7093b3064d.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/pre-verify-review/000023-24597633-46e1-46f2-884c-dc5158300d02.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/pre-verify-review/000024-f419ac2f-c6c8-45c5-b192-904f36782466.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/pre-verify-review/000025-9d892514-8a91-4fad-8b3d-c6ca923d5185.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/pre-verify-review/000026-9dce971e-5c69-4429-aa14-044d1c0424f8.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/pre-verify-review/000027-f2260f2f-10ff-40dc-b6c2-a78e7d2230d9.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/revisions/000000-eeb8c27f-238f-4c23-8b25-3886e5e0d258.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/revisions/000001-6eeee69c-fd05-418a-b1dc-386105eee1c4.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/revisions/000002-9e556bee-57c5-4ec4-b16c-dac159b3d009.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/revisions/000003-822063f4-4f9b-467f-a4f0-24b673ffbea0.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/revisions/000004-40f58de4-f0ad-4de9-b51c-2c3336fa2b03.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/revisions/000005-0ab948c6-ddfa-47a6-937e-0d4fbd5f7df5.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/revisions/000006-7f1e3b1a-82d5-4ed8-8ae4-39cdab62fd3c.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/revisions/000007-d7486996-5ba9-4eab-853a-c9f78ae83aaa.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/revisions/000008-46a3c819-f764-4a46-9bdc-99b1f8e4c0fe.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/revisions/000009-cf8dab9c-c2ad-46ae-89c3-97bb8500e2c5.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/revisions/000010-407895d0-1039-45ed-a398-4a8f82892822.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/revisions/000011-fcab04b6-41dc-4cd1-aa3c-80abdf9b4baf.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/revisions/000012-7751e42b-b614-4dbc-9be0-ec892b6829b5.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/revisions/000013-301067d9-1891-4955-848d-c3940277276c.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/revisions/000014-ed266a04-2970-4da8-bc58-6ff8ab60d088.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/revisions/000015-dd001506-129a-4da4-bce7-c4f438e2e99b.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/revisions/000016-5f8bf4a4-6893-4fa2-b464-063754fc86f2.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/revisions/000017-e7fd61d4-9938-44c9-80ca-10676c550faa.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/revisions/000018-1f5e0af4-2dd1-4612-8671-24d9fe03580d.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/revisions/000019-bd71c93f-68f2-4405-8562-e68dab6cb5b0.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/revisions/000020-59027448-4154-4be2-a3f1-6d868172c72e.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/revisions/000021-15bbc052-28f2-4c90-ae38-b605ef04c156.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/revisions/000022-b0b2e25f-258d-4b86-8297-1c7093b3064d.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/revisions/000023-24597633-46e1-46f2-884c-dc5158300d02.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/revisions/000024-f419ac2f-c6c8-45c5-b192-904f36782466.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/revisions/000025-9d892514-8a91-4fad-8b3d-c6ca923d5185.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/revisions/000026-9dce971e-5c69-4429-aa14-044d1c0424f8.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-run/revisions/000027-f2260f2f-10ff-40dc-b6c2-a78e7d2230d9.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-transitions/000001-15e26660-4688-4597-9309-e30994044b90.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-transitions/000002-a04943bc-8945-4548-8ac9-c73c68e5597e.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-transitions/000003-a3a28c23-0f46-494b-9b5b-72afb113977e.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-transitions/000004-d31c43be-d191-4919-ae73-3e560a81ff8a.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-transitions/000005-0fc2cd29-410c-4d83-b6ac-ac6ce2e980d2.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-transitions/000006-d1a14828-1193-484e-9e85-0c8fbf7cd9f4.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-transitions/000007-d702379a-988d-4e76-a2f3-78f4057f5ec3.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-workflow-governance.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-workflow-plan.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline.yaml` | DOC | ✓ |
| `openspec/changes/related-session-memory/REVIEW.md` | RSM, DOC | ✓ |
| `openspec/changes/related-session-memory/design.md` | RSM, DOC | ✓ |
| `openspec/changes/related-session-memory/proposal.md` | RSM, DOC | ✓ |
| `openspec/changes/related-session-memory/specs/related-session-memory/spec.md` | RSM, DOC | ✓ |
| `openspec/changes/related-session-memory/tasks.md` | RSM, DOC | ✓ |
| `packages/cli/dist/tenon.mjs` | RSM, ARCH, DIST | ✓ |
| `packages/dashboard-app/dist/assets/index-B-w7O8yi.js` | RSM, ARCH, DIST | ✓ |
| `packages/dashboard-app/dist/assets/index-CJG6YsIV.css` | RSM, ARCH, DIST | ✓ |
| `packages/dashboard-app/dist/assets/index-CmIRS3B8.css` | RSM, ARCH, DIST | ✓ |
| `packages/dashboard-app/dist/index.html` | RSM, ARCH, DIST | ✓ |
| `packages/dashboard-app/src/api/client.ts` | RSM, ARCH | ✓ |
| `packages/dashboard-app/src/api/memoryClient.test.tsx` | RSM, ARCH | ✓ |
| `packages/dashboard-app/src/api/memoryClient.ts` | RSM, ARCH | ✓ |
| `packages/dashboard-app/src/api/memoryDecoders.test.tsx` | RSM, ARCH | ✓ |
| `packages/dashboard-app/src/api/memoryDecoders.ts` | RSM, ARCH | ✓ |
| `packages/dashboard-app/src/api/memoryTypes.ts` | RSM, ARCH | ✓ |
| `packages/dashboard-app/src/i18n/translations.ts` | RSM, ARCH | ✓ |
| `packages/dashboard-app/src/shared/RelatedSessionsSection.test.tsx` | RSM, ARCH | ✓ |
| `packages/dashboard-app/src/shared/RelatedSessionsSection.tsx` | RSM, ARCH | ✓ |
| `packages/dashboard-app/src/shared/TaskDetail.test.tsx` | RSM, ARCH | ✓ |
| `packages/dashboard-app/src/shared/TaskDetail.tsx` | RSM, ARCH | ✓ |
| `packages/kernel/src/mem/adapters.test.ts` | RSM, ARCH | ✓ |
| `packages/kernel/src/mem/adapters/claude.ts` | RSM, ARCH | ✓ |
| `packages/kernel/src/mem/adapters/codex.ts` | RSM, ARCH | ✓ |
| `packages/kernel/src/mem/adapters/opencode.test.ts` | RSM, ARCH | ✓ |
| `packages/kernel/src/mem/adapters/opencode.ts` | RSM, ARCH | ✓ |
| `packages/kernel/src/mem/adapters/pi.ts` | RSM, ARCH | ✓ |
| `packages/kernel/src/mem/fs.ts` | RSM, ARCH | ✓ |
| `packages/kernel/src/mem/index.ts` | RSM, ARCH | ✓ |
| `packages/kernel/src/mem/relatedSearch.test.ts` | RSM, ARCH | ✓ |
| `packages/kernel/src/mem/relatedSearch.ts` | RSM, ARCH | ✓ |
| `packages/kernel/src/mem/sessions.ts` | RSM, ARCH | ✓ |
| `packages/kernel/src/mem/types.ts` | RSM, ARCH | ✓ |
| `packages/server/dist/dashboard.mjs` | RSM, ARCH, DIST | ✓ |
| `packages/server/src/relatedSessionMemory.test.ts` | RSM, ARCH, ANCHOR | ✓ |
| `packages/server/src/relatedSessionMemory.ts` | RSM, ARCH | ✓ |
| `packages/server/src/server.ts` | RSM, ARCH, ANCHOR | ✓ |
| `packages/server/src/serverPostMemoryRoutes.ts` | RSM, ARCH, ANCHOR | ✓ |
| `packages/server/src/serverPostRoutes.ts` | RSM, ARCH, ANCHOR | ✓ |
| `packages/server/src/types.ts` | RSM, ARCH | ✓ |

## 回退决定

持续自主模式采用最保守默认：修复全部 High/Medium，不接受偏差。下一轮 Build 同时回归上述 finding，并重新全量审查新冻结 diff。
