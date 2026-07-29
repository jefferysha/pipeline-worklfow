# PR #7 合并审计第四轮冻结 Verify 报告

## 结论

- 结论：PASS。
- Finding：C0 / H0 / M0 / L0；所有前三轮确认问题均已在 Build 修复并于本轮回归关闭。
- Change：`pr-7-merge-audit`；PR：`#7`；base：`8f9c5fa2b5712b5f0422f61d9ecea32b0f3d41b9`；冻结 build SHA：`e351a8c3477ab0fde8d0d582738faf243df0858a`。
- 强 handoff digest：`sha256:39e658df98ef6259e3e158fd8208ba19e8d27df6df6f27622b7c695204476698`。
- 冻结差异：379 个路径；路径映射 379/379，TSV SHA-256：`387f51b3e15531b1ee2f29fc603b1767df7398eab9fbeef713eaf0048512fe46`。
- 共享 worktree 产品差异前后均为空：`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`；canonical specs 指纹前后均为 `08aef9037ae8b1053a6ed4b3a7ce98827289e0e3a5bbc234fcb9e370c25caf06`。

## 四轨验证

### Reviewer / 规则 / 架构 / 安全

- PASS，C0/H0/M0/L0；完整枚举 379 个路径。
- 隔离克隆：`/private/tmp/pr7-verify4-review.gsKrmG/repo`。
- 根测试 320 files / 5521 passed / 14 honest skipped；Web 59 files / 1057 passed；Oracle harness 16/16；hooks 482/482；adapters 272；bundle 31；文档 39。
- build、release freshness、comments honesty、architecture、identity、repository hygiene、skills、CLI/server/dashboard 生成物字节一致性全部通过。
- trusted reader、状态并发、CLI/API 契约、DTO 最小化、root/change/symlink/race 防护、预算与资源上限未发现回归。

### E2E / API / OpenSpec

- PASS，C0/H0/M0/L0；证据根：`/private/tmp/tenon-pr7-verify4.ofw688/evidence`。
- Linux `node:22-bookworm`：5 files / 353 passed / 1 Darwin-only skip；Context Bundle verbose 26/26。覆盖 success、policy empty、409 missing/stale、422、413、resource、root/change/symlink race、bounded fd、FIFO/non-regular、invalid UTF-8 与日志 REDACTED。
- Darwin：5 files / 345 passed / 9 Linux-only skip；真实 production API 为 register 200、trusted-reader-unavailable 501、bad Host 403、bad change 400、missing root 404。
- 真实 CLI handoff：exit 0，`context-bundle/v1`，8 inputs / 25030 bytes，state/ledger digest 不变；非法 budget `1.5` 以 exit 1 拒绝。
- OpenSpec 1.6.0：show、strict、隔离 archive/apply、applied strict、applied show 均 exit 0；`+1/~5/-0`，6/6 unique requirements，隔离目录没有 active change。
- Production Chromium 最终 exit 0：正确 `Tenon Dashboard` 标题、direct-route 与 DOM replacement 精确 `change@root` focus、success/422/retry/409/retry、768 compact/769 desktop、reduced-motion、无 failed request。
- A→B、Verify composer 共存、portal/draft/custom label 由 frozen focused 142/142 与独立视觉 69/69 覆盖。

### Dashboard `design-taste-frontend` / 浏览器 / 无障碍

- PASS，C0/H0/M0/L0；69/69 浏览器断言，13 张截图。
- 覆盖 success/loading/empty/422/409/501/network/retry、默认 Ship/custom Open 标签、Verify Evidence 共存、portal/draft/focus、direct route/popstate/owner scope、390/768/769/1024/1440、zh/en、light/dark、键盘、reduced-motion、overflow、contrast、任务折叠与 workspace 长标题回归。
- console/page unexpected errors 0，API mutation 0；CLS 0、LCP 52ms、INP 24ms。
- 证据：`/private/tmp/pr7-verify4-visual.ZKnyGa/visual-accessibility-report.md`、`browser-evidence.json`、`trace.zip`、`aria-snapshot.txt`、`isolation-assertions.txt`、screenshots。

### Codex

- DEGRADED，不伪装 PASS。只读隔离审查 session：`019fab27-c972-7273-80f6-cb1396375e60`。
- Codex CLI 在输出 finding 前触发 usage limit；按 `tenon-verify` 允许在 Reviewer 与 E2E/视觉轨完整通过时降级。本轮 Reviewer、E2E、视觉均完整且零 finding。

## 动态门禁与退出码

| 门禁 | 结果 |
| --- | --- |
| npm ci / build / release freshness | exit 0 |
| root Vitest | 320 files，5521 pass，14 honest skip |
| Dashboard Web 独立 Reviewer 全量 | 59 files，1057/1057 |
| E2E Web serial / focused | 59 files 1057/1057；6 files 142/142；App 10/10 |
| comments / architecture / identity / hygiene / npx / legacy / freshness | 全部 exit 0 |
| clean-install / docs / sandcastle | 全部 exit 0 |
| hooks / adapters / skills / migration CAS | 482 / 272 / PASS / 13，全部 exit 0 |
| N-1 bundle / bundle smoke / oracle | 31 / PASS / 0 differences |
| official oracle harness | 16/16，exit 0 |
| Linux API / context verbose | 353 pass / 1 platform skip；26/26 |
| Darwin production API | 200 / 501 / 403 / 400 / 404，契约符合 |
| OpenSpec isolated apply | show/strict/archive/applied strict/show 全 exit 0 |
| Production Chromium | final exit 0 |
| exact-head GitHub CI | run `30409028455`，SHA `e351a8c…`，success |

## 首次失败、诊断与诚实边界

- E2E clone 的默认并行 Web 首跑有 1/1057 失败：`App.test` 的 workbench pulse 未在等待窗内出现。原始 `web-test.log` 保留；同冻结 clone 随后 App 10/10、serial full 1057/1057、风险 focused 142/142 全绿，另有独立 Reviewer full 1057/1057 与精确 head CI 全绿。结论为高负载下非确定性测试可靠性观察，不构成确认产品 finding。
- E2E production browser 的前四次 exit 1 均保留：冻结 production fixture 处于 Build 却误要求 Verify-only composer；手工 A→B 指向不存在 fixture；错误按钮文案；把刻意触发的 422/409 浏览器资源 console 条目当作 unexpected error。修正验证器前提后最终 exit 0；这些失败不被省略。
- 仓库 secret 缺失导致 required real-Codex H14 honest skip；根测试的 14 skips 同属外部令牌/平台条件路径，没有宣称已运行。
- npm audit 基线为 7 项（5 moderate、1 high、1 critical）；PR #7 没有依赖 manifest/lock 变化。该基线必须在后续独立依赖/发布 Change 修复并重验，未修复前不得发布。

## GitHub 精确头审计

- PR OPEN、非 Draft、base `main`、head `e351a8c3477ab0fde8d0d582738faf243df0858a`。
- `MERGEABLE` / `CLEAN`；CI check `verify` SUCCESS。
- reviews 0、issue comments 0、inline comments 0；没有待处理 review thread。

## Repo-zero

- 四条验证轨均在隔离 clone 或隔离服务执行；共享 worktree 的 packages/apps 与 canonical specs 前后指纹逐字相同。
- 共享 worktree 仅保留进入 Verify 时由 canonical Tenon transition 产生的 audit governance 变更；本轮轨道没有写入产品文件。

## 全路径到 capability spec 映射（379/379）

分组：299 JSON/ledger/spec governance；28 Web unit+production Chromium；14 docs+contract；10 kernel state/continuity；10 API/trusted reader；7 CLI integration/bundle；6 kernel compiler/unit；4 oracle/harness；1 strict archive/apply。

```tsv
path	capability_specs	verification_surface	read_back
docs/CONTRACT.md	context-bundle-budget-preview;document-evidence-contract;repository-architecture-compliance	docs+contract review	yes
docs/TEST-REALITY.md	context-bundle-budget-preview;document-evidence-contract;repository-architecture-compliance	docs+contract review	yes
docs/adr/2026-07-28-context-bundle-budget-preview-explore.md	context-bundle-budget-preview;document-evidence-contract;repository-architecture-compliance	docs+contract review	yes
docs/adr/2026-07-28-pr-7-merge-audit-explore.md	context-bundle-budget-preview;document-evidence-contract;repository-architecture-compliance	docs+contract review	yes
docs/superpowers/plans/2026-07-28-context-bundle-budget-preview.md	context-bundle-budget-preview;document-evidence-contract;repository-architecture-compliance	docs+contract review	yes
docs/superpowers/plans/2026-07-28-pr-7-merge-audit.md	context-bundle-budget-preview;document-evidence-contract;repository-architecture-compliance	docs+contract review	yes
docs/superpowers/reports/2026-07-28-context-bundle-budget-preview-verify.md	context-bundle-budget-preview;document-evidence-contract;repository-architecture-compliance	docs+contract review	yes
docs/superpowers/reports/2026-07-28-pr-7-merge-audit-verify-fail-2.md	context-bundle-budget-preview;document-evidence-contract;repository-architecture-compliance	docs+contract review	yes
docs/superpowers/reports/2026-07-28-pr-7-merge-audit-verify-fail-3.md	context-bundle-budget-preview;document-evidence-contract;repository-architecture-compliance	docs+contract review	yes
docs/superpowers/reports/2026-07-28-pr-7-merge-audit-verify-fail.md	context-bundle-budget-preview;document-evidence-contract;repository-architecture-compliance	docs+contract review	yes
docs/superpowers/specs/2026-07-28-context-bundle-budget-preview-design.md	context-bundle-budget-preview;document-evidence-contract;repository-architecture-compliance	docs+contract review	yes
docs/superpowers/specs/2026-07-28-context-bundle-budget-preview-upstream-a-research.md	context-bundle-budget-preview;document-evidence-contract;repository-architecture-compliance	docs+contract review	yes
docs/superpowers/specs/2026-07-28-context-bundle-budget-preview-upstream-b-research.md	context-bundle-budget-preview;document-evidence-contract;repository-architecture-compliance	docs+contract review	yes
docs/superpowers/specs/2026-07-28-pr-7-merge-audit-design.md	context-bundle-budget-preview;document-evidence-contract;repository-architecture-compliance	docs+contract review	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-document-locale.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-documents.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-history.jsonl	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/current.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000000-aaba150a-1dc6-448a-87e3-b6b85829859e.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000001-345f11c9-9dc3-49a5-8bba-f99eba2b4dfa.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000002-c2eab056-503e-42ff-88f4-b5493d33bba1.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000003-c9e23aba-e104-402f-ad48-54ea385db784.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000004-091bca5c-10b8-4701-bc9e-afedaf09d9c9.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000005-d4edf24b-df5e-451f-936e-1f9585347e0c.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000006-ca4b7339-919b-4974-b75e-f2f01ff3ad0b.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000007-8c39724d-dc18-4c2d-9ebe-c8e0a76fb9f6.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000008-e8a8d7fa-c4ab-48cd-8d63-993537f92ebf.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000009-933be7a8-af3a-44b2-868f-fca43aacf46b.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000010-c3124d16-a6ec-4e14-8e6e-987b928af7d4.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000011-d78dfd97-7178-4a78-8365-f742d4696552.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000012-fe61febe-a26c-4d40-8a15-57ecc52cdcdd.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000013-5f5a69f7-ac25-45be-a9e2-d10f50c54b8b.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000014-2f1f1c5c-ab90-42f0-8d85-bda03048b27b.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000015-469fcd87-5895-4531-954c-3c54bd9af1f2.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000016-80f888d9-1f3f-40d4-8db5-fdb5efc533e3.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000017-c08f6929-f5de-4e37-8cd3-5414414ec337.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000018-ac9ffc56-e827-4603-a728-9a69b5335066.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000019-daf64c30-acfc-4ef9-b1f6-3d9a687d23d1.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000020-c51ebc9d-51c6-4b66-83ca-47a92334ccaa.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000021-c9b5f36c-fe44-4104-889a-7c45cd3a40f7.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000022-ea4b66c2-3a5c-418c-a0ad-ffccc4e711d8.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000023-82130790-312e-4ae4-bbed-429e01c8a5ee.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000024-f6c808a0-fd6b-4019-b085-47350c8eb113.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000025-9296fd26-89ca-4c8f-adde-d5dd8e8ae249.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000026-a514e60d-8222-4b18-9d58-2b6b2efedb3d.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000027-eed2f049-2668-4b32-92bb-3cb83de65795.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000028-d903e899-87a5-4bed-aeb9-b6c8e48715eb.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000029-83521169-4d9c-4ba2-a0e5-260d3f9fa8e4.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000030-61bc4871-bff2-47f6-9ab6-b1d0609f3c1d.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000031-7508344f-cf65-4092-bbc0-5a37f3185ed8.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000032-be9e8d29-3f24-4fff-a41f-a650b7658c5d.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000033-5afab3f4-af22-492f-bd8e-2e4d9d641193.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000034-64aa04ca-76c6-412a-b185-1cd307d1b755.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000035-ee77b080-0400-4a89-b8de-c0a84d00d41c.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000036-8e2aba40-750f-44db-9747-88e2aa667161.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000037-e5273e1a-96ae-42f0-9789-064068d76baa.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000038-e3b153b4-f566-4015-ae37-103d6122e004.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000039-b1e02029-0cbe-46d6-b830-0ec42f070716.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000040-82b66a44-0fd7-47b4-8042-ef594a7f63d7.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000041-4ef22fcc-9af4-4a56-bb03-84b2db8caac8.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000042-d97bfcd8-6ccf-4ec0-b683-14066c93ae20.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000043-b7d259fd-5aa0-4183-9921-585048d82dca.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000044-a844ec41-d4b3-4ea3-82ee-0208c6e24986.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000045-09b47414-21c4-442c-a7d0-dad4c1538bcd.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000046-2dd0644a-91be-4161-b74b-68b7101f8f99.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000047-134172be-c836-4d07-a531-22918e60a259.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000048-f8ffdf00-abe3-4258-b190-6fe934f0eb3b.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000049-49847eae-9eb1-4a52-9b61-fda20838af9c.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000050-c3eb5b56-3e1d-4718-bc5f-32eead6ac99c.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000051-06d0f122-68d8-44de-8289-15bdbebed430.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000052-a4e97311-6986-41b7-9064-b9809a433b24.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000053-6fcf17e8-284d-4cfd-9bb5-b673242981f5.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000054-8ef53bdc-6378-46ca-bd1d-1eef298907d6.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000055-216346bc-8562-4718-921a-8c6e4d26e705.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000056-1ce2bc8e-e84b-4a31-b33c-944b58dc6020.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000057-44b22c8e-255c-4cca-b90f-9229f47ae141.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000058-c608a933-6562-47d1-9d09-53a537896fdc.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000059-cbefd507-5b64-4f29-a429-16a2d9f1618c.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000060-244c7c80-2e2f-4aa2-a9a7-2c0a358db496.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000061-99075540-016d-4505-84ea-32d388612fe2.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000062-52d2d02b-86ad-4536-8b20-bc32444715e7.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000063-d167a174-82b6-43aa-bc7b-2bd5c459e233.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000064-89aae99c-a235-43b4-803d-f264deb66347.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000065-7c5f9cbe-a70e-416c-ab86-2ed931847a23.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000066-c527520d-01f1-4932-b3ac-2125594e9cb1.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000067-5256a1d9-d014-489c-989a-c36ff6f575b8.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000068-3013cd68-bd3c-4742-b93d-009913395703.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000069-ae24cf5c-e618-4df0-9579-7cd67964b833.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000070-77435b59-b479-42c8-910d-7c610df69571.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000071-ff8952e1-3592-4c8a-8048-c20af3244364.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000072-a42e2bb1-93c9-47e2-988d-1d3be0dec969.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000073-d57665ed-ed92-4e00-99ec-d11c10e61e17.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000074-084357f1-cb66-46f5-a11a-09d7b436061d.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/pre-verify-review/000075-00a4ec89-ff47-4b46-8b6d-6f41edad684a.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000000-aaba150a-1dc6-448a-87e3-b6b85829859e.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000001-345f11c9-9dc3-49a5-8bba-f99eba2b4dfa.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000002-c2eab056-503e-42ff-88f4-b5493d33bba1.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000003-c9e23aba-e104-402f-ad48-54ea385db784.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000004-091bca5c-10b8-4701-bc9e-afedaf09d9c9.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000005-d4edf24b-df5e-451f-936e-1f9585347e0c.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000006-ca4b7339-919b-4974-b75e-f2f01ff3ad0b.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000007-8c39724d-dc18-4c2d-9ebe-c8e0a76fb9f6.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000008-e8a8d7fa-c4ab-48cd-8d63-993537f92ebf.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000009-933be7a8-af3a-44b2-868f-fca43aacf46b.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000010-c3124d16-a6ec-4e14-8e6e-987b928af7d4.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000011-d78dfd97-7178-4a78-8365-f742d4696552.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000012-fe61febe-a26c-4d40-8a15-57ecc52cdcdd.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000013-5f5a69f7-ac25-45be-a9e2-d10f50c54b8b.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000014-2f1f1c5c-ab90-42f0-8d85-bda03048b27b.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000015-469fcd87-5895-4531-954c-3c54bd9af1f2.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000016-80f888d9-1f3f-40d4-8db5-fdb5efc533e3.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000017-c08f6929-f5de-4e37-8cd3-5414414ec337.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000018-ac9ffc56-e827-4603-a728-9a69b5335066.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000019-daf64c30-acfc-4ef9-b1f6-3d9a687d23d1.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000020-c51ebc9d-51c6-4b66-83ca-47a92334ccaa.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000021-c9b5f36c-fe44-4104-889a-7c45cd3a40f7.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000022-ea4b66c2-3a5c-418c-a0ad-ffccc4e711d8.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000023-82130790-312e-4ae4-bbed-429e01c8a5ee.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000024-f6c808a0-fd6b-4019-b085-47350c8eb113.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000025-9296fd26-89ca-4c8f-adde-d5dd8e8ae249.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000026-a514e60d-8222-4b18-9d58-2b6b2efedb3d.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000027-eed2f049-2668-4b32-92bb-3cb83de65795.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000028-d903e899-87a5-4bed-aeb9-b6c8e48715eb.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000029-83521169-4d9c-4ba2-a0e5-260d3f9fa8e4.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000030-61bc4871-bff2-47f6-9ab6-b1d0609f3c1d.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000031-7508344f-cf65-4092-bbc0-5a37f3185ed8.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000032-be9e8d29-3f24-4fff-a41f-a650b7658c5d.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000033-5afab3f4-af22-492f-bd8e-2e4d9d641193.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000034-64aa04ca-76c6-412a-b185-1cd307d1b755.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000035-ee77b080-0400-4a89-b8de-c0a84d00d41c.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000036-8e2aba40-750f-44db-9747-88e2aa667161.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000037-e5273e1a-96ae-42f0-9789-064068d76baa.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000038-e3b153b4-f566-4015-ae37-103d6122e004.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000039-b1e02029-0cbe-46d6-b830-0ec42f070716.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000040-82b66a44-0fd7-47b4-8042-ef594a7f63d7.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000041-4ef22fcc-9af4-4a56-bb03-84b2db8caac8.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000042-d97bfcd8-6ccf-4ec0-b683-14066c93ae20.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000043-b7d259fd-5aa0-4183-9921-585048d82dca.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000044-a844ec41-d4b3-4ea3-82ee-0208c6e24986.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000045-09b47414-21c4-442c-a7d0-dad4c1538bcd.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000046-2dd0644a-91be-4161-b74b-68b7101f8f99.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000047-134172be-c836-4d07-a531-22918e60a259.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000048-f8ffdf00-abe3-4258-b190-6fe934f0eb3b.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000049-49847eae-9eb1-4a52-9b61-fda20838af9c.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000050-c3eb5b56-3e1d-4718-bc5f-32eead6ac99c.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000051-06d0f122-68d8-44de-8289-15bdbebed430.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000052-a4e97311-6986-41b7-9064-b9809a433b24.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000053-6fcf17e8-284d-4cfd-9bb5-b673242981f5.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000054-8ef53bdc-6378-46ca-bd1d-1eef298907d6.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000055-216346bc-8562-4718-921a-8c6e4d26e705.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000056-1ce2bc8e-e84b-4a31-b33c-944b58dc6020.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000057-44b22c8e-255c-4cca-b90f-9229f47ae141.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000058-c608a933-6562-47d1-9d09-53a537896fdc.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000059-cbefd507-5b64-4f29-a429-16a2d9f1618c.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000060-244c7c80-2e2f-4aa2-a9a7-2c0a358db496.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000061-99075540-016d-4505-84ea-32d388612fe2.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000062-52d2d02b-86ad-4536-8b20-bc32444715e7.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000063-d167a174-82b6-43aa-bc7b-2bd5c459e233.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000064-89aae99c-a235-43b4-803d-f264deb66347.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000065-7c5f9cbe-a70e-416c-ab86-2ed931847a23.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000066-c527520d-01f1-4932-b3ac-2125594e9cb1.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000067-5256a1d9-d014-489c-989a-c36ff6f575b8.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000068-3013cd68-bd3c-4742-b93d-009913395703.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000069-ae24cf5c-e618-4df0-9579-7cd67964b833.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000070-77435b59-b479-42c8-910d-7c610df69571.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000071-ff8952e1-3592-4c8a-8048-c20af3244364.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000072-a42e2bb1-93c9-47e2-988d-1d3be0dec969.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000073-d57665ed-ed92-4e00-99ec-d11c10e61e17.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000074-084357f1-cb66-46f5-a11a-09d7b436061d.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-run/revisions/000075-00a4ec89-ff47-4b46-8b6d-6f41edad684a.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-transitions/000001-ddafdd70-238e-467f-b072-e504d027f48e.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-transitions/000002-2ff42c09-e0d6-457d-9be7-b9da95145e6d.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-transitions/000003-146a3b0f-ce77-4e76-a690-2ec79cae130a.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-transitions/000004-d2f9df4f-cbe3-4e66-bbd1-47b6ae63fb12.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-transitions/000005-7f2e9db9-59e1-44ae-9170-35ce79163678.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-transitions/000006-54ff5c0a-5cfb-4c5a-b1f8-64243233bdfa.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-transitions/000007-26167a78-4914-4e86-9c1d-86b6f382c0fb.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-transitions/000008-a6d44d53-5466-45b6-a6c7-b25fad975318.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-transitions/000009-0afb5c10-e080-426a-927f-02823d59c5f3.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-transitions/000010-a8745856-d914-4e2f-b088-8474c7b83bd0.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-transitions/000011-8b3a9299-0ca5-4ccf-95b6-7086713b3ebc.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-transitions/000012-368e9546-b595-4585-ba97-76e889af1ca1.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-transitions/000013-dbb4f9fa-7b0a-46c4-8f78-3a1c910bbf18.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-transitions/000014-1cc44659-4568-4dfe-a638-062a8cb0040d.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-transitions/000015-22b94ad5-780e-4c9c-b816-d851ed00e941.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-transitions/000016-f227aa00-de54-4c45-bf00-67d947d1cbb7.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-transitions/000017-f52a057c-d3fa-40e8-b806-fc27334882b0.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-transitions/000018-6577f9da-5ac0-4001-bf20-78dc514f6b2c.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-transitions/000019-e8049b34-c2db-4719-acb5-ca89e5f4ded2.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-transitions/000020-ef991ea9-507a-4488-965b-50ddecb4ce11.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-transitions/000021-28f5ed31-1219-44d3-8158-d246dacd0d98.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-transitions/000022-3a179d5f-1822-44d3-b7f0-6a5952bad4d6.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-transitions/000023-0f610c71-b6b3-40e6-97a6-44434b58faf4.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-workflow-governance.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline-workflow-plan.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/.pipeline.yaml	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/REVIEW.md	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/applied-spec.md	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/design.md	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/proposal.md	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/specs/context-bundle-budget-preview/spec.md	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/archive/2026-07-28-context-bundle-budget-preview/tasks.md	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-document-locale.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-documents.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-history.jsonl	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/current.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000000-229a4a4f-cffc-46bd-80ff-260b1f341bbd.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000001-9c605230-b169-47f4-a8bf-15a6ed5654bc.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000002-33e6bcf3-f41c-447b-94c4-fe80e95ec090.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000003-65133fcc-6884-431b-862b-c7b1f4372770.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000004-8175a730-87bc-475d-b433-436f356cf642.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000005-36d69b11-3e6e-4473-9632-1b987f6cc3f5.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000006-99e0b2f8-c21a-43ca-99f1-e22f47532435.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000007-f7b56f9d-804e-437d-b258-58a44376cc3e.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000008-4920328d-b768-4cac-8b09-4a4cd477657d.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000009-7ecb4c5a-f08f-4480-b6db-7f2e8aca9d5f.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000010-9cfa8199-5c33-4ce2-9ac8-b259b9f55e9e.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000011-b08e6037-0732-4a97-a2d5-045f8e76e233.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000012-ec2c2f98-4b46-47cb-a842-3c4cc4df24c9.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000013-0be8fc0c-967d-410a-829e-df9599326217.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000014-7b19e86b-c289-4332-97a0-ff0c9d9a44c8.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000015-d9258b6a-8764-475d-b298-099408fff69a.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000016-6f70f5c1-5435-4d43-9710-3c86a11309cc.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000017-b4e2c852-95ca-449f-8816-19252a35b17a.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000018-f2fd61a4-58e6-4aca-b7ba-d66750b37979.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000019-53fdc515-e576-4b6e-addf-c429ad4da69e.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000020-52118a6c-1d33-4e0c-b210-369355f0234a.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000021-04d3653d-0623-4859-b22c-86dd5333247f.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000022-f39801ef-5145-4f77-ac05-893bafce6c90.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000023-407e62fe-6e2b-490e-b434-fefc4effcc78.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000024-a46d2d03-c61c-482a-a2e0-a032aa69e961.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000025-764bb954-a96d-4cd4-b296-35c927b19346.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000026-62b4e8de-5268-46b3-b5da-affa5f293fe9.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000027-b3a006f9-3b3a-4320-840e-8d2adb10129c.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000028-2b600bad-528c-4124-ad6f-3871e4c08bf9.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000029-a4f9a70f-a235-4c6d-8ddc-aa7fd61adb14.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000030-3aa4db90-eedf-4f0c-ba8f-73645a8083de.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000031-af94671e-2a58-4d9f-8ac2-b309c4a22f15.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000032-7bb0ae7a-e0d4-4d44-a058-3f602fd6abe5.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000033-7263d028-3503-45df-b1dc-e596b3f35b18.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000034-27b1333c-1a7d-46f5-975f-7a950a450d57.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000035-8dda9d71-41fb-4c17-b880-c5a601d6f8a3.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000036-6292d05e-d369-4fe0-8bf2-120df4009e0e.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000037-08753f55-6da4-4b9d-8159-ee6f9eeee266.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000038-c1dee5c6-7aee-434b-b233-01faef0a4942.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000039-ec27d659-90ef-4572-8955-bb9ef46f889f.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000040-cbb3452a-33a9-45f8-80f1-517261f421fc.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000041-8496c3ce-fd01-4d70-bb09-6b8e2910a5e7.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/pre-verify-review/000042-a7630c0d-fe6a-4248-98f3-244046a0ccce.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000000-229a4a4f-cffc-46bd-80ff-260b1f341bbd.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000001-9c605230-b169-47f4-a8bf-15a6ed5654bc.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000002-33e6bcf3-f41c-447b-94c4-fe80e95ec090.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000003-65133fcc-6884-431b-862b-c7b1f4372770.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000004-8175a730-87bc-475d-b433-436f356cf642.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000005-36d69b11-3e6e-4473-9632-1b987f6cc3f5.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000006-99e0b2f8-c21a-43ca-99f1-e22f47532435.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000007-f7b56f9d-804e-437d-b258-58a44376cc3e.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000008-4920328d-b768-4cac-8b09-4a4cd477657d.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000009-7ecb4c5a-f08f-4480-b6db-7f2e8aca9d5f.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000010-9cfa8199-5c33-4ce2-9ac8-b259b9f55e9e.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000011-b08e6037-0732-4a97-a2d5-045f8e76e233.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000012-ec2c2f98-4b46-47cb-a842-3c4cc4df24c9.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000013-0be8fc0c-967d-410a-829e-df9599326217.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000014-7b19e86b-c289-4332-97a0-ff0c9d9a44c8.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000015-d9258b6a-8764-475d-b298-099408fff69a.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000016-6f70f5c1-5435-4d43-9710-3c86a11309cc.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000017-b4e2c852-95ca-449f-8816-19252a35b17a.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000018-f2fd61a4-58e6-4aca-b7ba-d66750b37979.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000019-53fdc515-e576-4b6e-addf-c429ad4da69e.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000020-52118a6c-1d33-4e0c-b210-369355f0234a.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000021-04d3653d-0623-4859-b22c-86dd5333247f.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000022-f39801ef-5145-4f77-ac05-893bafce6c90.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000023-407e62fe-6e2b-490e-b434-fefc4effcc78.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000024-a46d2d03-c61c-482a-a2e0-a032aa69e961.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000025-764bb954-a96d-4cd4-b296-35c927b19346.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000026-62b4e8de-5268-46b3-b5da-affa5f293fe9.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000027-b3a006f9-3b3a-4320-840e-8d2adb10129c.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000028-2b600bad-528c-4124-ad6f-3871e4c08bf9.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000029-a4f9a70f-a235-4c6d-8ddc-aa7fd61adb14.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000030-3aa4db90-eedf-4f0c-ba8f-73645a8083de.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000031-af94671e-2a58-4d9f-8ac2-b309c4a22f15.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000032-7bb0ae7a-e0d4-4d44-a058-3f602fd6abe5.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000033-7263d028-3503-45df-b1dc-e596b3f35b18.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000034-27b1333c-1a7d-46f5-975f-7a950a450d57.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000035-8dda9d71-41fb-4c17-b880-c5a601d6f8a3.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000036-6292d05e-d369-4fe0-8bf2-120df4009e0e.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000037-08753f55-6da4-4b9d-8159-ee6f9eeee266.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000038-c1dee5c6-7aee-434b-b233-01faef0a4942.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000039-ec27d659-90ef-4572-8955-bb9ef46f889f.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000040-cbb3452a-33a9-45f8-80f1-517261f421fc.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000041-8496c3ce-fd01-4d70-bb09-6b8e2910a5e7.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-run/revisions/000042-a7630c0d-fe6a-4248-98f3-244046a0ccce.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-transitions/000001-fed06ee0-c5c5-4556-adab-33b5e52c0383.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-transitions/000002-5fa5e33e-478f-4fe1-917e-a3700fce5965.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-transitions/000003-e4740d2a-b7f3-4d8e-9837-98e5800d1839.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-transitions/000004-dc645efc-ecd6-48fa-8d82-3b9df3a027c6.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-transitions/000005-6cfcdb82-626d-4a90-a739-fcf2855ab93d.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-transitions/000006-b340ab95-171b-4453-a031-a77039dd5514.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-transitions/000007-8e64927b-b7ea-46a6-a955-842a78235402.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-transitions/000008-a1bb8bd8-01b6-4ed2-b334-d70a502e2689.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-transitions/000009-2f8940b8-5c52-4a65-ba8a-3f4e9e390909.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-transitions/000010-1d96778a-2fdb-4c11-81a5-264f81816123.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-transitions/000011-7a504e60-02cf-47c0-a66a-7669fae83db8.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-transitions/000012-ea1be4de-52c1-446b-9bc8-eb0e935fe318.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-transitions/000013-ae1b4360-0b44-42d9-8211-ca95d79e4c32.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-workflow-governance.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline-workflow-plan.json	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/.pipeline.yaml	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/REVIEW.md	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/design.md	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/proposal.md	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/specs/context-bundle-budget-preview/spec.md	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/changes/pr-7-merge-audit/tasks.md	context-bundle-budget-preview;document-evidence-contract;effective-workflow-plan	JSON/ledger/spec governance	yes
openspec/specs/context-bundle-budget-preview/spec.md	context-bundle-budget-preview	strict+archive/apply	yes
packages/cli/dist/tenon.mjs	context-bundle-budget-preview;context-bundle-handoff;repository-architecture-compliance	CLI integration+bundle	yes
packages/cli/src/commands/handoff.test.ts	context-bundle-budget-preview;context-bundle-handoff;repository-architecture-compliance	CLI integration+bundle	yes
packages/cli/src/commands/handoff.ts	context-bundle-budget-preview;context-bundle-handoff;repository-architecture-compliance	CLI integration+bundle	yes
packages/cli/src/commands/tap.ts	context-bundle-budget-preview;context-bundle-handoff;repository-architecture-compliance	CLI integration+bundle	yes
packages/cli/src/program-workflows.ts	context-bundle-budget-preview;context-bundle-handoff;repository-architecture-compliance	CLI integration+bundle	yes
packages/cli/src/program.test.ts	context-bundle-budget-preview;context-bundle-handoff;repository-architecture-compliance	CLI integration+bundle	yes
packages/cli/src/tap.integration.test.ts	context-bundle-budget-preview;context-bundle-handoff;repository-architecture-compliance	CLI integration+bundle	yes
packages/dashboard-app/dist/assets/index-CGj7mXYA.js	context-bundle-budget-preview;live-dashboard-project-anchor;verification-evidence-composer	web unit+production Chromium	yes
packages/dashboard-app/dist/assets/index-D5AYWyzO.js	context-bundle-budget-preview;live-dashboard-project-anchor;verification-evidence-composer	web unit+production Chromium	yes
packages/dashboard-app/dist/assets/index-De9VVOJA.css	context-bundle-budget-preview;live-dashboard-project-anchor;verification-evidence-composer	web unit+production Chromium	yes
packages/dashboard-app/dist/assets/index-UO6vcbRz.css	context-bundle-budget-preview;live-dashboard-project-anchor;verification-evidence-composer	web unit+production Chromium	yes
packages/dashboard-app/dist/index.html	context-bundle-budget-preview;live-dashboard-project-anchor;verification-evidence-composer	web unit+production Chromium	yes
packages/dashboard-app/src/api/client.ts	context-bundle-budget-preview;live-dashboard-project-anchor;verification-evidence-composer	web unit+production Chromium	yes
packages/dashboard-app/src/api/contextBundleClient.test.tsx	context-bundle-budget-preview;live-dashboard-project-anchor;verification-evidence-composer	web unit+production Chromium	yes
packages/dashboard-app/src/api/contextBundleClient.ts	context-bundle-budget-preview;live-dashboard-project-anchor;verification-evidence-composer	web unit+production Chromium	yes
packages/dashboard-app/src/api/contextBundleTypes.ts	context-bundle-budget-preview;live-dashboard-project-anchor;verification-evidence-composer	web unit+production Chromium	yes
packages/dashboard-app/src/i18n/translations.ts	context-bundle-budget-preview;live-dashboard-project-anchor;verification-evidence-composer	web unit+production Chromium	yes
packages/dashboard-app/src/progress/ContextBundlePreview.test.tsx	context-bundle-budget-preview;live-dashboard-project-anchor;verification-evidence-composer	web unit+production Chromium	yes
packages/dashboard-app/src/progress/ContextBundlePreview.tsx	context-bundle-budget-preview;live-dashboard-project-anchor;verification-evidence-composer	web unit+production Chromium	yes
packages/dashboard-app/src/progress/ProgressActions.tsx	context-bundle-budget-preview;live-dashboard-project-anchor;verification-evidence-composer	web unit+production Chromium	yes
packages/dashboard-app/src/progress/ProgressDrawer.test.tsx	context-bundle-budget-preview;live-dashboard-project-anchor;verification-evidence-composer	web unit+production Chromium	yes
packages/dashboard-app/src/progress/ProgressDrawer.tsx	context-bundle-budget-preview;live-dashboard-project-anchor;verification-evidence-composer	web unit+production Chromium	yes
packages/dashboard-app/src/progress/ProgressView.test.tsx	context-bundle-budget-preview;live-dashboard-project-anchor;verification-evidence-composer	web unit+production Chromium	yes
packages/dashboard-app/src/progress/ProgressView.tsx	context-bundle-budget-preview;live-dashboard-project-anchor;verification-evidence-composer	web unit+production Chromium	yes
packages/dashboard-app/src/progress/WorkflowCanvas.tsx	context-bundle-budget-preview;live-dashboard-project-anchor;verification-evidence-composer	web unit+production Chromium	yes
packages/dashboard-app/src/progress/progressCanvasModel.ts	context-bundle-budget-preview;live-dashboard-project-anchor;verification-evidence-composer	web unit+production Chromium	yes
packages/dashboard-app/src/progress/progressViewModel.ts	context-bundle-budget-preview;live-dashboard-project-anchor;verification-evidence-composer	web unit+production Chromium	yes
packages/dashboard-app/src/progress/useContextBundlePreview.ts	context-bundle-budget-preview;live-dashboard-project-anchor;verification-evidence-composer	web unit+production Chromium	yes
packages/dashboard-app/src/progress/useProgressDrawer.ts	context-bundle-budget-preview;live-dashboard-project-anchor;verification-evidence-composer	web unit+production Chromium	yes
packages/dashboard-app/src/shared/Dialog.tsx	context-bundle-budget-preview;live-dashboard-project-anchor;verification-evidence-composer	web unit+production Chromium	yes
packages/dashboard-app/src/shared/TaskDetail.test.tsx	context-bundle-budget-preview;live-dashboard-project-anchor;verification-evidence-composer	web unit+production Chromium	yes
packages/dashboard-app/src/shared/TaskDetail.tsx	context-bundle-budget-preview;live-dashboard-project-anchor;verification-evidence-composer	web unit+production Chromium	yes
packages/dashboard-app/src/shared/taskDetailParts.tsx	context-bundle-budget-preview;live-dashboard-project-anchor;verification-evidence-composer	web unit+production Chromium	yes
packages/dashboard-app/src/shell/Dialog.test.tsx	context-bundle-budget-preview;live-dashboard-project-anchor;verification-evidence-composer	web unit+production Chromium	yes
packages/dashboard-app/src/workbench/GovernanceRail.test.tsx	context-bundle-budget-preview;live-dashboard-project-anchor;verification-evidence-composer	web unit+production Chromium	yes
packages/kernel/src/compress/index.ts	context-bundle-budget-preview;context-bundle-handoff;repository-architecture-compliance	kernel compiler+unit	yes
packages/kernel/src/compress/ledger-context-bundle-contract.ts	context-bundle-budget-preview;context-bundle-handoff;repository-architecture-compliance	kernel compiler+unit	yes
packages/kernel/src/compress/ledger-context-bundle-node-adapter.ts	context-bundle-budget-preview;context-bundle-handoff;repository-architecture-compliance	kernel compiler+unit	yes
packages/kernel/src/compress/ledger-context-bundle-node-source.ts	context-bundle-budget-preview;context-bundle-handoff;repository-architecture-compliance	kernel compiler+unit	yes
packages/kernel/src/compress/ledger-context-bundle.test.ts	context-bundle-budget-preview;context-bundle-handoff;repository-architecture-compliance	kernel compiler+unit	yes
packages/kernel/src/compress/ledger-context-bundle.ts	context-bundle-budget-preview;context-bundle-handoff;repository-architecture-compliance	kernel compiler+unit	yes
packages/kernel/src/state/document-ledger.ts	context-bundle-budget-preview;document-evidence-contract;workspace-verification-integrity	kernel state+continuity	yes
packages/kernel/src/state/document-path.ts	context-bundle-budget-preview;document-evidence-contract;workspace-verification-integrity	kernel state+continuity	yes
packages/kernel/src/state/document-record-policy.ts	context-bundle-budget-preview;document-evidence-contract;workspace-verification-integrity	kernel state+continuity	yes
packages/kernel/src/state/index.ts	context-bundle-budget-preview;document-evidence-contract;workspace-verification-integrity	kernel state+continuity	yes
packages/kernel/src/state/run-revision-continuity.ts	context-bundle-budget-preview;document-evidence-contract;workspace-verification-integrity	kernel state+continuity	yes
packages/kernel/src/state/run-revision-head-reader.ts	context-bundle-budget-preview;document-evidence-contract;workspace-verification-integrity	kernel state+continuity	yes
packages/kernel/src/state/run-revision-store.test.ts	context-bundle-budget-preview;document-evidence-contract;workspace-verification-integrity	kernel state+continuity	yes
packages/kernel/src/state/run-revision-store.ts	context-bundle-budget-preview;document-evidence-contract;workspace-verification-integrity	kernel state+continuity	yes
packages/kernel/src/state/transition-head-anchor.ts	context-bundle-budget-preview;document-evidence-contract;workspace-verification-integrity	kernel state+continuity	yes
packages/kernel/src/state/transition-record-store.ts	context-bundle-budget-preview;document-evidence-contract;workspace-verification-integrity	kernel state+continuity	yes
packages/server/dist/dashboard.mjs	context-bundle-budget-preview;context-bundle-handoff;live-dashboard-project-anchor	API+trusted reader security	yes
packages/server/src/contextBundlePreview.test.ts	context-bundle-budget-preview;context-bundle-handoff;live-dashboard-project-anchor	API+trusted reader security	yes
packages/server/src/contextBundlePreview.ts	context-bundle-budget-preview;context-bundle-handoff;live-dashboard-project-anchor	API+trusted reader security	yes
packages/server/src/contextBundlePreviewSupport.ts	context-bundle-budget-preview;context-bundle-handoff;live-dashboard-project-anchor	API+trusted reader security	yes
packages/server/src/contextBundleTrustedReader.test.ts	context-bundle-budget-preview;context-bundle-handoff;live-dashboard-project-anchor	API+trusted reader security	yes
packages/server/src/contextBundleTrustedReader.ts	context-bundle-budget-preview;context-bundle-handoff;live-dashboard-project-anchor	API+trusted reader security	yes
packages/server/src/server.test.ts	context-bundle-budget-preview;context-bundle-handoff;live-dashboard-project-anchor	API+trusted reader security	yes
packages/server/src/serverGetActivityRoutes.ts	context-bundle-budget-preview;context-bundle-handoff;live-dashboard-project-anchor	API+trusted reader security	yes
packages/server/src/workflowRootAnchor.ts	context-bundle-budget-preview;context-bundle-handoff;live-dashboard-project-anchor	API+trusted reader security	yes
packages/server/src/workflowTrustedFs.ts	context-bundle-budget-preview;context-bundle-handoff;live-dashboard-project-anchor	API+trusted reader security	yes
tools/oracle/harness.test.ts	workspace-verification-integrity;repository-architecture-compliance	oracle+harness	yes
tools/oracle/run.sh	workspace-verification-integrity;repository-architecture-compliance	oracle+harness	yes
tools/oracle/tests/stub-cli.mjs	workspace-verification-integrity;repository-architecture-compliance	oracle+harness	yes
tools/oracle/validate-transition-head-anchor.mjs	workspace-verification-integrity;repository-architecture-compliance	oracle+harness	yes
```

## 残余风险

- 已确认产品 finding 为零。仅保留并已显式披露三类非产品边界：外部令牌 H14/Codex usage-limit 降级、首次 Web 高负载时序观察、待独立发布 Change 处理的依赖审计基线。
- 在后续 Ship 应用 canonical spec、推送 governance/report 后，仍必须取得新的精确 head CI、再次核对 GitHub review/comment/thread，并在合并后等待 main CI；这些未来门禁未在本报告中提前宣称完成。
