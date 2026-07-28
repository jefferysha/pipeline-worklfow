# related-session-memory 验证报告

## 结论

**FAIL — 返回 Build 修复。**

- 冻结构建：`54153a00ffe61d557d27459b455a77a90ad990ae`
- 基线：`origin/main@2d103e330f847e003ff5909097d892f5722cca04`
- Change：`related-session-memory`
- Track：`frontend`（实际交付覆盖 kernel、server、Dashboard）
- 聚合结果：代码 Reviewer `FAIL`；E2E `PASS`；视觉 Reviewer `FAIL/证据未完整返回`；Codex CLI 轨无效并按规则降级。
- Verify 前后实现、配置、生成物与冻结 SHA 一致；仅 Tenon 治理状态和本报告发生允许的 Verify 写入。

## 阻断发现

1. **HIGH — Claude 项目隔离在缺失 cwd 时 fail-open**
   - 位置：`packages/kernel/src/mem/adapters/claude.ts:75`
   - scoped 查询只在会话解析出 cwd 时调用 `sameProject`。Claude 的目录名是清洗后的项目名，存在碰撞；缺失或截断 cwd 时可能把其他项目的用户摘要返回当前项目。
   - 修复要求：scoped 查询对未知 cwd 一律拒绝，并加入目录碰撞、缺失元数据回归测试。
2. **MEDIUM — 100 个候选上限施加得过晚**
   - 位置：`packages/kernel/src/mem/sessions.ts:267`、`packages/kernel/src/mem/adapters/codex.ts:66`
   - adapter 在候选切片前已经读取/解析全部会话元数据，真实扫描数可超过 100；遍历顺序还可能先耗尽总预算，无法证明“最近 100 个”。
   - 修复要求：两阶段有界枚举，先以低成本元数据在项目内选择最近候选，再读取正文；测试断言读取次数和最近性。
3. **MEDIUM — OpenCode reader 不可用时误报完整空结果**
   - 位置：`packages/kernel/src/mem/adapters/opencode.ts:89`、`packages/kernel/src/mem/relatedSearch.ts:194`
   - `node:sqlite`、schema 或数据库不可用会静默返回 `[]`，related search 不产生 warning，可能返回 `partial=false`。
   - 修复要求：向 related-search 暴露 adapter unavailable/read failure，返回稳定 partial warning 或 typed error。
4. **MEDIUM — 查询长度的 Unicode 语义跨层不一致**
   - 位置：`packages/dashboard-app/src/shared/RelatedSessionsSection.tsx:67`、`packages/dashboard-app/src/api/memoryDecoders.ts:65`
   - kernel/server 按 Unicode code point 计算，Dashboard 的提交判断、`maxLength` 和 response decoder 按 UTF-16 单元计算，合法 astral 查询会被拒。
   - 修复要求：统一 code-point 语义并覆盖 emoji 请求/响应。
5. **MEDIUM — Enter fallback 未避让 IME composition**
   - 位置：`packages/dashboard-app/src/shared/RelatedSessionsSection.tsx:114`
   - 中文输入法确认候选时可能提前 `requestSubmit()`。
   - 修复要求：检查 `nativeEvent.isComposing`（以及兼容 keyCode）并加入 composition 测试。
6. **MEDIUM — 主检索按钮对比度不足**
   - 位置：`packages/dashboard-app/src/shared/RelatedSessionsSection.tsx:135`
   - 实测白字 `rgb(255,255,255)` / 绿色 `rgb(22,163,74)`，对比度 `3.30:1`；14px/500 不满足 WCAG AA `4.5:1`。
   - 修复要求：为本入口使用满足 AA 的语义 token/variant，并复测 hover、focus、disabled 与主题。

## 低风险发现

- `docs/superpowers/specs/2026-07-28-related-session-memory-upstream-b-research.md:177` 将端点写成“只读 GET”，实际是受保护 POST，应更正。
- `packages/kernel/src/mem/fs.ts:85` 在第一次 `fstat` 后并发 append 时不会把新增尾部标成 truncated；需要决定是第二次 `fstat`，还是明确 snapshot-at-open 语义并测试。

## 四轨证据

### 代码 Reviewer

- 全量审查 `origin/main...54153a00ffe61d557d27459b455a77a90ad990ae`。
- 覆盖 85/85 个交付文件：治理 44、文档 11、源码 18、测试 7、生成物 5。
- 覆盖 kernel 预算/adapter/隐私、HTTP 鉴权与错误、Dashboard 状态/i18n/键盘、兼容调用方与生成物。
- 前后实现指纹一致。
- 结论：`FAIL`，发现 1 High、4 Medium、2 Low。

### E2E

- 命令：
  `HOME=/tmp/tenon-related-verify.r9PixT/home TENON_RUNTIME_HOME=/tmp/tenon-related-verify.r9PixT/runtime TENON_DASHBOARD_PORT=62391 node packages/server/dist/dashboard.mjs`
- `/api/health` 返回 Tenon `global/v1.0.1`，HTML `<title>` 精确为 `Tenon Dashboard`。
- 精确打开本 worktree 与 `related-session-memory` Change。
- 通过：Codex filter、输入焦点、Enter 提交、user-only 摘要、partial budget warning、Pi 完整空态、停止 server 后安全错误/Retry、重启恢复、390×844 无横向溢出、console warn/error 0。
- API 通过：v1 协议、`partial=true`、`file-read-truncated`、400 `invalid-request`，无 assistant/path/cwd/secret 泄漏。
- 未声称：生产 fixture 响应过快，未独立强制 stale-response；loading 文案也未捕获到稳定截图。
- 证据：`/tmp/tenon-related-verify.r9PixT/evidence/verify-e2e-summary.md`、同目录截图/API/log。
- 结论：`PASS`，无 severity finding。

### 视觉 Reviewer

- 实际运行冻结 Dashboard，确认主按钮对比度 `3.30:1`，形成 1 个 Medium。
- Reviewer 在返回完整状态/视口矩阵与最终指纹包之前被终止，因此不能把视觉轨标为完整通过。
- 结论：`FAIL`。

### Codex CLI

- stdin 全量 diff 为 `2,157,679` 字符，超过 Codex 单次 `1,048,576` 字符上限。
- 改用 `codex review --commit 54153a00...` 后，Codex sandbox 的 server 测试因 `listen EPERM` 失败，并在真实 worktree 自主执行了 build。生成物最终字节未漂移，但该轨违反 Verify 只读证据协议。
- 该进程已终止；本轨无有效 PASS/FAIL 结论，按 `tenon-verify` 的 Codex 异常规则降级，不作为通过证据。

## 构建与测试证据

冻结前实际通过：

- `npx vitest run ...relatedSearch...opencode...relatedSessionMemory...`：3 files / 40 tests passed。
- Dashboard focused：4 files / 50 tests passed。
- `npm run typecheck:web`：exit 0。
- `npm run test:web`：53 files / 974 tests passed；既有 React `act(...)` 与 GSAP 提示不影响退出码。
- `npm run build`：exit 0；存在既有 Vite `>500 kB` bundle warning。
- `npm run check:architecture`：621 production files，exit 0。
- `npm run check:comments`、`check:identity`、`check:default-workflow-freshness`、`check:docs`、`check:repository-hygiene`：exit 0。
- `npm run test:hooks`：482 passed / 0 failed。
- `bash tools/verify-skills.sh`：65 路径、62 skill、0 外部依赖，全绿。
- `npm run oracle`：5 fixtures，0 处不一致；仅已知 `in-place` 与 PM enqueue 产品演进说明。
- `npm run check:npx-package`：35 passed；`npm run check:legacy-bridge`：1 passed。
- `git diff --check`：最终冻结提交无错误。

未记为绿色：

- `npm test` 在本机 Node `v24.18.0` 下三次完成全部测试文件、未输出断言失败，但 Vitest `2.1.9` 主进程保留 `fsevents`/KQUEUE 句柄且不打印最终汇总；三次均人工终止为 exit 130。仓库声明 Node 22，但本机未安装 Node 22。CI 必须在 Node 22 给出最终退出码。
- 需要 `CLAUDE_CODE_OAUTH_TOKEN` / `TENON_REQUIRE_REAL_CODEX=1` 的 canonical agent 测试按测试自身规则 honest skip，与代码失败分开记录。

## OpenSpec 隔离应用演练

- 真实工作树：`openspec show related-session-memory --json --deltas-only` 成功。
- 真实工作树：`openspec validate related-session-memory --strict` 成功。
- 隔离副本：`/tmp/related-session-memory-verify-copy.erIugP`。
- `openspec archive related-session-memory --yes --json` 成功，归档为 `2026-07-28-related-session-memory`，新增 6 条需求。
- 隔离副本中 `openspec validate related-session-memory --type spec --strict` 成功。
- 额外的全仓 `openspec validate --all --strict` 被 12 个既有无关 Change/spec 拒绝；不计入本轮规格结果。
- 真实 `openspec/specs/**/spec.md` 前后 SHA-256 清单一致；真实主规格未被修改。

## 逐文件规格回读

下列 85 个冻结文件均已回读并与对应规范比对。缩写：

- `RSM`：`openspec/changes/related-session-memory/specs/related-session-memory/spec.md`
- `ARCH`：`openspec/specs/repository-architecture-compliance/spec.md`
- `ANCHOR`：`openspec/specs/live-dashboard-project-anchor/spec.md`
- `DOC`：`openspec/specs/document-evidence-contract/spec.md`
- `DIST`：`openspec/specs/plugin-distribution/spec.md`

| 改动文件 | capability spec | 已比对 |
| --- | --- | --- |
| `docs/adr/2026-07-28-related-session-memory-explore.md` | RSM, ARCH | ✓ |
| `docs/superpowers/plans/2026-07-28-related-session-memory.md` | RSM, ARCH | ✓ |
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
| `openspec/changes/related-session-memory/.pipeline-transitions/000001-15e26660-4688-4597-9309-e30994044b90.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-transitions/000002-a04943bc-8945-4548-8ac9-c73c68e5597e.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-transitions/000003-a3a28c23-0f46-494b-9b5b-72afb113977e.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-workflow-governance.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline-workflow-plan.json` | DOC | ✓ |
| `openspec/changes/related-session-memory/.pipeline.yaml` | DOC | ✓ |
| `openspec/changes/related-session-memory/REVIEW.md` | RSM, DOC | ✓ |
| `openspec/changes/related-session-memory/design.md` | RSM, DOC | ✓ |
| `openspec/changes/related-session-memory/proposal.md` | RSM, DOC | ✓ |
| `openspec/changes/related-session-memory/specs/related-session-memory/spec.md` | RSM, DOC | ✓ |
| `openspec/changes/related-session-memory/tasks.md` | RSM, DOC | ✓ |
| `packages/cli/dist/tenon.mjs` | RSM, ARCH, DIST | ✓ |
| `packages/dashboard-app/dist/assets/index-BqwFTQQA.css` | RSM, ARCH, DIST | ✓ |
| `packages/dashboard-app/dist/assets/index-DAS4N1bl.js` | RSM, ARCH, DIST | ✓ |
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
| `packages/kernel/src/mem/adapters/opencode.test.ts` | RSM, ARCH | ✓ |
| `packages/kernel/src/mem/adapters/opencode.ts` | RSM, ARCH | ✓ |
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
