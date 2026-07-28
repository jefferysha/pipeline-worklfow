# Related Sessions 最终验证报告

## 结论

**PASS** — 冻结提交 `6260fbd9345c57ad2b24e13278994b3ce0404966` 满足
`related-session-memory` 的前后端闭环规格，可以进入 `verify-pass`。

- 基线：`2394ac71efc87193350d476266a3219c320bb5b1`
- Change：`related-session-memory`
- Track：`frontend`，实际范围为 kernel + server + Dashboard 共享契约
- 聚合严重度：Critical 0 / High 0 / Medium 0 / Low 0
- 实现冻结：HEAD、源码、能力规格和已跟踪生成物在四轨期间未漂移
- 允许写入：Verify 期间仅 Tenon 文档账本、skill receipt、状态投影和本报告变化

## 四轨冻结审查

| 轨道 | 结论 | 新鲜证据 |
| --- | --- | --- |
| 独立代码 Reviewer | PASS，C/H/M/L = 0/0/0/0 | `/tmp/tenon-rsm-6260-code-review/report.md` |
| 真实 API / E2E / Browser | PASS | `/tmp/tenon-rsm-6260-e2e/SUMMARY.md` |
| 视觉与可访问性 | PASS，C/H/M/L = 0/0/0/0 | `/tmp/tenon-rsm-6260-visual/visual-review.md` |
| Codex CLI 静态审查 | PASS，无 actionable finding | `/tmp/tenon-rsm-6260-codex-review.md` |

Codex CLI 在隔离 clone 中完成完整静态 diff 审查；它尝试运行 Vitest 时，因为该 clone
未安装依赖且 read-only 网络访问被本机代理拒绝而无法启动测试，因此该轨只作为独立静态审查。
测试绿色来自下述新鲜隔离验证与代码 Reviewer，不把 Codex 的未运行测试写成通过。

视觉轨在真实浏览器确认：

- 页面 title、导航与内容属于 `Tenon Dashboard`；
- desktop / 390px、light / dark、idle / loading / results / empty /
  source-partial / budget-partial / busy / error / retry 全部通过；
- 原生 form Enter、IME composition、可见 focus 和重复 busy 抑制通过；
- 主按钮 computed-style 对比度：light normal/hover `6.7016:1`，
  dark normal/hover `8.1507:1`，均高于普通文字 `4.5:1`。

四轨启动后根任务按 Tenon 规则追加了治理账本，导致“整棵 dirty worktree”哈希变化。
这不属于冻结实现漂移：`HEAD` 始终为 `6260fbd...`，`packages/**`、能力规格和生成物相对
该 HEAD 均无未提交差异；各报告保留了治理写入的透明记录。

## 原始 review finding 回归

本轮对用户指定的三项冻结 finding 和只读 reviewer 补充项逐项回归：

1. Codex `compacted.replacement_history` 保留 synthetic host-summary provenance；
   只有宿主摘要命中时不会作为 user excerpt 输出，保留的真实 user 历史仍可命中。
2. Claude/Codex/Pi 使用有界目录发现、entry/depth/deadline/request top-K 预算；
   OpenCode 候选与 dialogue 使用可验证的有界 SQLite plan，不在预算前全量同步扫描/排序。
3. `RelatedSessionsSection` 以同步 scope key 重挂载，切换 root/name 的首个 render 不会提交旧结果。
4. `buildChildIndex` 与候选身份使用 `platform:id`，只允许 OpenCode parent 合并 OpenCode child；
   跨宿主相同裸 id 和 canonical/legacy alias 碰撞均有回归。
5. 生产同步 kernel runner 在 gate 持有期间提供一次 poll 机会，真实 node:http 回归得到
   `200 + 429 memory-search-busy`，释放后再次请求为 `200`。
6. OpenCode Related Sessions 不直读 live WAL 数据库；有 WAL/SHM/journal 或查询期间
   dev/ino/size/mtimeNs/ctimeNs 漂移时 fail closed。sidecar-free 数据库使用
   `immutable=1` URI，前后主库及 sidecar 指纹不变，旧 CLI 直读兼容保留。
7. Related Sessions 以 injected realpath 做物理项目 containment；合法 symlinked ancestor
   通过，symlinked descendant 逃逸被拒，无法解析的历史 cwd 返回
   `project-scope-unavailable` partial。
8. light hover 不再使用透明混色，真实浏览器 normal/hover 对比度均通过。

## 新鲜构建与测试

冻结 SHA 的隔离 clone `/tmp/tenon-rsm-verify-6260-fxRWCW` 实际执行：

- `npm run typecheck:web`：exit 0。
- `npm run test:web`：57 files / 1,010 tests passed；仅既有 React `act(...)` 警告。
- `npm run build`：exit 0；仅既有 Vite `>500 kB` chunk warning。
- `npm test`：319 files passed，5,534 tests passed，5 tests honest skipped。
  跳过仅为 `TENON_REQUIRE_REAL_CODEX` / `CLAUDE_CODE_OAUTH_TOKEN` 外部凭据场景。
- `bash tools/test-hooks.sh`：482 passed / 0 failed。
- `bash tools/test-adapters.sh`：272 passed / 0 failed。
- `bash tools/verify-skills.sh`：65 paths / 62 skill dirs / 62 install tokens，全部通过。
- `bash tools/test-bundle.sh`：31 passed / 0 failed。
- `npm run oracle`：0 处不一致；仅已知 in-place 与 PM auto-queue 产品演进说明。
- `npm run check:architecture`：628 production files，pass。
- `npm run check:comments`：pass。
- `npm run check:repository-hygiene`：pass。
- `npm run check:docs`：39 canonical Markdown files，pass。

该 clone 为避免触碰真实 worktree 使用 symlinked `node_modules`；因此最后一次重新 bundle 的
esbuild source comments 含 symlink 绝对路径，不能用于生成物逐字比较。独立代码 Reviewer
使用它自己的干净 clone 重新 `npm run build` 后确认 CLI/server/Dashboard 生成物零 diff；
这条 harness 限制与代码失败分开记录。

独立代码 Reviewer 另跑：

- kernel focused：111 passed；
- server focused：12 passed；
- Dashboard focused：61 passed；
- 全构建与生成物 freshness：pass。

## OpenSpec 应用演练

隔离副本：`/tmp/tenon-rsm-openspec-6260-nfcWaj`。

- `openspec show related-session-memory --json --deltas-only`：6 条新增需求。
- `openspec validate related-session-memory --strict`：pass。
- `openspec archive related-session-memory --yes --json`：pass，
  `specsUpdated=true`，added 6 / modified 0 / removed 0 / renamed 0。
- 应用后的 `related-session-memory` 主规格 strict validation：pass。
- 应用后规格 SHA-256：
  `acc1a57b1a5975b99cf1d85aee1e99124dd24848b4ddb2811aaed9bd19020591`。
- 全仓 `openspec validate --specs --strict`：13 passed / 7 failed；失败均为本轮前已存在且
  与本能力无关的主规格：
  `automation-loop-init`、`declarative-document-governance`、
  `effective-workflow-plan`、`live-dashboard-project-anchor`、
  `simple-task-routing`、`skill-content-resolution`、
  `workspace-verification-integrity`。

真实 worktree 的 `openspec/specs/**` 在 Verify 演练前后未改变；应用只会在 Ship 发生。

## 逐文件规格覆盖

映射缩写：

- `RSM`：`openspec/changes/related-session-memory/specs/related-session-memory/spec.md`
- `ARCH`：`openspec/specs/repository-architecture-compliance/spec.md`
- `ANCHOR`：`openspec/specs/live-dashboard-project-anchor/spec.md`
- `DOC`：`openspec/specs/document-evidence-contract/spec.md`
- `DIST`：`openspec/specs/plugin-distribution/spec.md`

| 文件集合 | 已枚举文件 | 规格映射 | 结论 |
| --- | --- | --- | --- |
| 调研/设计/计划/报告 | `docs/adr/2026-07-28-related-session-memory-explore.md`; `docs/superpowers/plans/2026-07-28-related-session-memory.md`; `docs/superpowers/reports/2026-07-28-related-session-memory-verify.md`; `docs/superpowers/reports/2026-07-28-related-session-memory-verify-round-6.md`; `docs/superpowers/specs/2026-07-28-related-session-memory-design.md`; `docs/superpowers/specs/2026-07-28-related-session-memory-tenon-audit.md`; `docs/superpowers/specs/2026-07-28-related-session-memory-upstream-a-research.md`; `docs/superpowers/specs/2026-07-28-related-session-memory-upstream-b-research.md` | RSM, ARCH, DOC | ✓ |
| Tenon 状态与账本 | `.pipeline-document-locale.json`; `.pipeline-documents.json`; `.pipeline-history.jsonl`; `.pipeline-run/current.json`; `.pipeline.yaml`; `.pipeline-workflow-governance.json`; `.pipeline-workflow-plan.json` | DOC | ✓ |
| pre-Verify receipts | `.pipeline-run/pre-verify-review/000000` 至 `000058`，文件名逐项由 `git diff --name-only 2394ac...6260fbd` 回读 | DOC | ✓ |
| canonical revisions | `.pipeline-run/revisions/000000` 至 `000058`，文件名逐项由同一冻结 diff 回读 | DOC | ✓ |
| transition receipts | `.pipeline-transitions/000001` 至 `000017`，文件名逐项由同一冻结 diff 回读 | DOC | ✓ |
| Change 文档 | `REVIEW.md`; `design.md`; `proposal.md`; `specs/related-session-memory/spec.md`; `tasks.md` | RSM, DOC | ✓ |
| CLI/Server/Web 生成物 | `packages/cli/dist/tenon.mjs`; `packages/server/dist/dashboard.mjs`; `packages/dashboard-app/dist/index.html`; `packages/dashboard-app/dist/assets/index-Df9xG57t.js`; `index-m9hlWsNI.css`; removed `index-pBTBvMM6.css` | RSM, ARCH, DIST | ✓ |
| Dashboard API | `client.ts`; `memoryClient.ts`; `memoryClient.test.tsx`; `memoryDecoders.ts`; `memoryDecoders.test.tsx`; `memoryTypes.ts` | RSM, ARCH | ✓ |
| Dashboard UI | `i18n/translations.ts`; `shared/RelatedSessionsSection.tsx`; `shared/RelatedSessionsSection.test.tsx`; `shared/TaskDetail.tsx`; `shared/TaskDetail.test.tsx` | RSM, ARCH | ✓ |
| Kernel adapters | `mem/adapters.test.ts`; `adapters/claude.ts`; `adapters/codex.ts`; `adapters/opencode-budget.ts`; `adapters/opencode-dialogue-budget.ts`; `adapters/opencode.ts`; `adapters/opencode.test.ts`; `adapters/pi.ts` | RSM, ARCH | ✓ |
| Kernel contracts/use case | `mem/context.ts`; `dialogue.ts`; `filter.ts`; `fs.ts`; `index.ts`; `paths.ts`; `paths.test.ts`; `relatedSearch.ts`; `relatedSearch.test.ts`; `search.ts`; `search.test.ts`; `sessions.ts`; `sessions.test.ts`; `types.ts` | RSM, ARCH | ✓ |
| Server API | `relatedSessionMemory.ts`; `relatedSessionMemory.test.ts`; `server.ts`; `serverPostMemoryRoutes.ts`; `serverPostRoutes.ts`; `types.ts` | RSM, ARCH, ANCHOR | ✓ |

冻结 diff 共 200 个文件。上表显式列出所有非重复实现、文档和生成物路径；Tenon 的 135 个
不可变 receipt/revision/transition 文件按目录和连续序号完整枚举，并逐项与 DOC 契约回读。

## 风险、兼容与回退

- 不新增依赖、数据库迁移或持久索引。
- API 为新增受保护 POST；既有 session-link 与 `tenon mem search` 请求/响应保持兼容。
- 检索只读；不写 Change、session binding、浏览器持久存储或宿主会话历史。
- OpenCode live WAL 场景会诚实降级为 source partial，而不是读取未 checkpoint 内容或产生 sidecar。
- 若需回退，撤销本功能提交并恢复三个生成 bundle；没有数据迁移或清理步骤。
- 现有 Vite chunk warning、7 个无关 OpenSpec 债务和 5 个凭据 gate 不阻断本轮功能。
