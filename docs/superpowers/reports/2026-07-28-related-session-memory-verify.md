# related-session-memory 验证报告

## 结论

**FAIL — 第三轮 Verify 返回 Build 修复。**

- 冻结构建：`19e74b274fa66ab2a13348656dfe460690d509bd`
- 基线：`origin/main@15fe619b2885b928dd27be9668cca6b0ee903c57`
- Change：`related-session-memory`
- Track：`frontend`（实际交付覆盖 kernel、server、Dashboard）
- 聚合结果：代码 Reviewer `FAIL`；E2E `PASS`；Codex CLI `FAIL`；视觉轨仍在收束且不能覆盖已确认阻断。
- Verify 前后实现、配置、生成物与冻结 SHA 一致；仅 Tenon 治理状态和本报告发生允许的 Verify 写入。

## 阻断发现

1. **MEDIUM — host summary 隔离修改了旧 CLI 的公开计数与排序**
   - 位置：`packages/kernel/src/mem/search.ts:64-65`
   - 共享 `searchInDialogue` 把 Claude/Pi host summary 从 user 重新分类为 assistant；这会改变既有 `tenon mem search` 的 `user_count`、`asst_count`、excerpt 与 score，违反“旧 CLI 语义不变”。
   - 修复要求：仅在 Related Sessions 隐私路径排除 host summary 的原始用户资格，保留旧 CLI 搜索输出。
2. **MEDIUM — 元数据读取未计入同一 JSONL 的单文件预算**
   - 位置：`packages/kernel/src/mem/relatedSearch.ts:97-101`
   - 同一会话先读取 8 KiB metadata，随后仍可独立读取完整 2 MiB，对单文件累计超过声明的 2 MiB。
   - 修复要求：按物理 path 累计单文件读取量，后续读取减去 metadata 已消费字节，并补边界回归。
3. **MEDIUM — OpenCode 同一数据库的预算按会话重置**
   - 位置：`packages/kernel/src/mem/adapters/opencode.ts:258-261`
   - 多个会话均来自同一 `opencode.db`，但每次 extract 都重新获得 2 MiB，使单文件可一直读取到总预算 16 MiB。
   - 修复要求：在 request-scoped content budget 内按数据库 path 共享累计量，补多会话同库回归。
4. **MEDIUM — 不可读会话目录被误报为完整空结果**
   - 位置：`packages/kernel/src/mem/relatedSearch.ts:144-148`、`packages/kernel/src/mem/fs.ts`
   - 生产 `readDir` 将缺失与权限错误都折叠为空数组；现包装层无法知道已选择的宿主目录未成功扫描，因而可能返回 `partial=false`。
   - 修复要求：提供兼容的可选目录读取状态，选中且存在但不可读时产生稳定 source warning 与 `partial=true`，补生产路径回归。
5. **HIGH — 重复 token 的位置收集与 chunk 扫描可产生二次复杂度**
   - 位置：`packages/kernel/src/mem/search.ts:69-101`、`packages/server/src/relatedSessionMemory.ts:65-68`
   - 每个 token occurrence 都保存位置并调用含 `slice/lastIndexOf/indexOf` 的 `chunkAround`；合法 2 字符 query 在长、无段落、重复文本上可让同步 Dashboard server 明显冻结。Reviewer 实测 20k 字符约 60ms、100k 字符约 1331ms。
   - 修复要求：对每 turn 采用有界、近线性的 occurrence/excerpt 算法，保持公开命中计数语义，并加入重复文本性能回归。
6. **HIGH — OpenCode descendant 图缺少 cycle guard**
   - 位置：`packages/kernel/src/mem/sessions.ts:130-149`
   - 损坏或漂移数据库可形成 `a.parent_id=b`、`b.parent_id=a`；当前 DFS 无限 push，而 Related Sessions 固定 `includeChildren=true`，会永久占住同步 server。
   - 修复要求：使用 platform-scoped visited 集，确保每个 descendant 最多合并一次，并补 cycle/self-cycle 回归。
7. **MEDIUM — metadata prefix 截断会静默漏掉合法项目会话**
   - 位置：`packages/kernel/src/mem/relatedSearch.ts:160-171`
   - 8 KiB prefix 截断不产生 warning；首 JSONL 事件超过该大小时 adapter 可能无法解析 cwd 并跳过合法 session，却返回 `partial=false`。
   - 修复要求：metadata 截断且无法完成项目身份判定时返回稳定 partial warning，并补 9 KiB 首事件回归。

## 低风险发现

- `RelatedSessionsSection` 的 query input/select 可补稳定 `name`，query input 可补 `autoComplete="off"`；不阻断本次 Verify，但下一轮 Build 一并处理。

## 首轮问题回归

前两轮全部 finding 已确认修复：Claude 缺失 cwd fail-closed、文件读取前候选上限、OpenCode reader unavailable partial、Unicode code-point 长度、IME Enter、按钮对比度、POST 文档措辞与并发 append 检测；以及跨宿主全局最近 100、synthetic summary 隔离、partial 文案、查询校验、跨宿主同 id child 合并、真实同步 runner single-flight 与 light hover 对比度。

## 四轨证据

### 代码 Reviewer

- 全量审查 `origin/main...19e74b274fa66ab2a13348656dfe460690d509bd`，覆盖 139/139 个文件：文档 7、治理 91、kernel 17、server 6、Dashboard 11、生成物 7。
- 结论：`FAIL`，发现重复 token 二次复杂度与 OpenCode cycle 两个 High，以及 metadata prefix 静默截断一个 Medium。
- 新鲜验证：kernel/server 7 files / 78 tests、Dashboard 4 files / 57 tests、三包 typecheck 与隔离 `npm run build` 通过。
- 证据：`/tmp/tenon-verify-19e74b.xu4MkT/`。

### E2E

- 生产 server：`127.0.0.1:62523`，隔离 HOME/runtime；health 为 `ok/global/v1.0.1`，HTML 与浏览器 title 精确为 `Tenon Dashboard`，精确打开本 worktree/Change。
- 通过：真实约 16 MiB 同步 kernel 双预连接请求得到 `200 + 429 memory-search-busy`；OpenCode SQLite parent/child；Codex success/partial、Pi complete empty、Unicode/IME、切换 abort/stale、停服 Retry、390px、隐私与旧 session-link/CLI 兼容路径。
- 证据：`/tmp/tenon-related-verify3.Mjb0X2/evidence/verify-e2e-summary.md`、`browser-assertions.json` 与 `http-concurrency.json`。
- 结论：`PASS`，无 severity finding。

### 视觉 Reviewer

- light/dark、375/1440、idle/loading/results、budget/source/generic partial、complete empty、validation、error/retry、键盘焦点与 reduced motion 均通过。
- 主按钮 normal/hover 对比度：light `5.0156:1`，dark `10.9942:1`；窄屏无 overflow。
- 证据：`/tmp/tenon-verify3.ewC3ME/visual-verify-report.md`。
- 结论：`PASS`；无 Critical/High/Medium。1 个 Low：宽屏 validation 时按钮因 `self-end` 比 input 下移约 26px。

### Codex CLI

- 受支持的 `codex exec review --ephemeral --base origin/main` 在 `/tmp/tenon-rsm-codex3.HASDhY/repo` 隔离 clone 内完成；真实仓库零实现写入。
- 结论：`FAIL`，发现旧 CLI host-summary 计数兼容、JSONL metadata 单文件累计、OpenCode 同库累计、不可读目录 partial 四个 Medium。
- 隔离 clone 无 `node_modules`，定向 Vitest 未启动；不把该轨写成测试绿色，主线与代码 Reviewer 的新鲜结果单独记录。

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
